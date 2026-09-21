import {
  asItems,
  buildSummary,
  cleanPhase,
  fetchFeedPath,
  genderFromEventCode,
  joinNames,
  medalFromRaw,
  normalizeEventCode,
  parseFeedTime,
  spokenName,
  todayInJst,
} from "@/server/feed";
import { getSql } from "@/lib/pg.server";

// The ingest "engine": fetches from the Games feed and writes to Postgres.
// Called directly by the worker's scheduler (src/worker/index.ts) and by the
// HTTP ingest route (src/routes/api/public/ingest.ts) for manual/CI-triggered
// runs — both share this module so there's exactly one implementation.

export const MAX_FEED_CALLS = 60;
const PARALLELISM = 5;
const BATCH_GAP_MS = 100;
const FINISHED_STATUSES = ["PROVISIONAL", "UNOFFICIAL", "OFFICIAL", "RUNNING", "LIVE", "FINISHED"];

type Sql = ReturnType<typeof getSql>;

export type Ctx = {
  sql: Sql;
  errors: any[];
  calls: { n: number };
  countries?: Map<string, string>;
  entered?: Set<string>;
};

export function newCtx(sql: Sql): Ctx {
  return { sql, errors: [], calls: { n: 0 } };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runBatched<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (const group of chunk(items, PARALLELISM)) {
    out.push(...(await Promise.all(group.map(fn))));
    await sleep(BATCH_GAP_MS);
  }
  return out;
}

function hasIndia(orgs: string[]) {
  return orgs.some((o) => o === "IND");
}

/** Names the Indian side: a country team stays "India", a pair/individual is named. */
function sideIdentity(side: any): { isTeam: boolean; spoken: string } {
  const members: any[] = Array.isArray(side?.Members)
    ? side.Members.filter((m: any) => m?.Name)
    : [];
  const teamish = /^(india|ind)$/i.test(String(side?.Name ?? "").trim());
  if (teamish && members.length > 0 && members.length <= 2) {
    return { isTeam: false, spoken: joinNames(members.map((m) => spokenName(m.Name))) };
  }
  if (teamish) return { isTeam: true, spoken: "India" };
  if (members.length > 2) return { isTeam: true, spoken: "India" };
  if (members.length) {
    return { isTeam: false, spoken: joinNames(members.map((m) => spokenName(m.Name))) };
  }
  return { isTeam: false, spoken: spokenName(side?.Name) };
}

/** code -> country name, from the entries feed's org list. */
async function countryMap(ctx: Ctx): Promise<Map<string, string>> {
  if (ctx.countries) return ctx.countries;
  const rows = await ctx.sql`SELECT code, name FROM countries`;
  ctx.countries = new Map(rows.map((c: any) => [c.code, c.name ?? c.code]));
  return ctx.countries!;
}

/** set of "SPORT|EVENT" where India has entries. */
async function enteredEvents(ctx: Ctx): Promise<Set<string>> {
  if (ctx.entered) return ctx.entered;
  const rows = await ctx.sql`SELECT sport_code, event_code FROM india_entries`;
  ctx.entered = new Set(rows.map((r: any) => `${r.sport_code}|${r.event_code}`));
  return ctx.entered;
}

/** Only "1" (gold event) and "2" (bronze decided) are real medal flags. */
function normalizeMedalFlag(v: any): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "1" || s === "2" ? s : null;
}

function mapItem(it: any) {
  const resCode = it.ResCode || it.Key;
  const t = parseFeedTime(it.DateTimeRaw);
  const orgs: string[] = Array.isArray(it.Orgs) ? it.Orgs.filter(Boolean) : [];
  const india = hasIndia(orgs);
  return {
    sport_code: it.Disc,
    sport_name: it.DiscDesc || null,
    res_code: resCode,
    event_code: normalizeEventCode(it.Event) || null,
    event_name: it.EventDesc || null,
    phase_code: it.Phase || null,
    phase_name: it.PhaseDesc || null,
    unit_name: it.UnitDesc || null,
    unit_name_short: it.UnitDescS || null,
    unit_num: it.UnitNum || null,
    start_time: t.start_time,
    start_jst: t.start_jst,
    start_ist: t.start_ist,
    date_jst: t.date_jst,
    date_ist: t.date_ist,
    venue_code: it.Venue || null,
    venue_name: it.VenueDesc || null,
    location_name: it.LocDesc || null,
    status: it.Status || null,
    status_desc: it.StatusDesc || null,
    is_live: !!it.IsLive,
    is_h2h: !!it.isH2H,
    medal_flag: normalizeMedalFlag(it.Medal),
    orgs,
    has_india: india,
    home: it.Home ?? null,
    away: it.Away ?? null,
    raw: india ? it : null,
  };
}

/** Key-order-independent JSON serialization for change detection. */
function stable(v: any): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

function changed(prev: any, next: any) {
  if (!prev) return true;
  if ((prev.status || null) !== (next.status || null)) return true;
  const pt = prev.start_time ? new Date(prev.start_time).getTime() : null;
  const nt = next.start_time ? new Date(next.start_time).getTime() : null;
  if (pt !== nt) return true;
  if (stable(prev.orgs || []) !== stable(next.orgs || [])) return true;
  if (stable(prev.home ?? null) !== stable(next.home ?? null)) return true;
  if (stable(prev.away ?? null) !== stable(next.away ?? null)) return true;
  if (!!prev.is_live !== !!next.is_live) return true;
  if (normalizeMedalFlag(prev.medal_flag) !== normalizeMedalFlag(next.medal_flag)) return true;
  return false;
}

/* -------------------------- shared: schedule rows ------------------------- */

/**
 * Upserts mapped schedule rows, detects changes and writes the direct India
 * results that head-to-head schedule payloads already contain.
 * `singleSport` means the rows came from one sport's daily feed with no
 * ALL/day merge, so empty orgs/home/away must never replace richer DB values.
 */
async function upsertScheduleRows(ctx: Ctx, rows: any[], singleSport = false) {
  if (!rows.length) return { items_seen: 0, rows_changed: 0, india_items: 0 };
  const sql = ctx.sql;

  const sportsMap = new Map<string, any>();
  const eventsMap = new Map<string, any>();
  for (const r of rows) {
    sportsMap.set(r.sport_code, {
      code: r.sport_code,
      name: r.sport_name,
      updated_at: new Date().toISOString(),
    });
    if (r.event_code) {
      eventsMap.set(`${r.sport_code}|${r.event_code}`, {
        sport_code: r.sport_code,
        event_code: r.event_code,
        name: r.event_name,
        gender: genderFromEventCode(r.event_code),
        updated_at: new Date().toISOString(),
      });
    }
  }

  for (const c of chunk([...sportsMap.values()], 500)) {
    try {
      await sql`
        INSERT INTO sports ${sql(c as Record<string, unknown>[], "code", "name", "updated_at")}
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      ctx.errors.push({ table: "sports", error: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const c of chunk([...eventsMap.values()], 500)) {
    try {
      await sql`
        INSERT INTO events ${sql(c as Record<string, unknown>[], "sport_code", "event_code", "name", "gender", "updated_at")}
        ON CONFLICT (sport_code, event_code) DO UPDATE SET
          name = EXCLUDED.name, gender = EXCLUDED.gender, updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      ctx.errors.push({ table: "events", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // existing rows for change detection
  const existing = new Map<string, any>();
  for (const c of chunk(rows, 500)) {
    try {
      const data: any[] = await sql`
        SELECT sport_code, res_code, status, start_time, orgs, home, away, is_live, medal_flag, raw
        FROM schedule_items
        WHERE res_code = ANY(${c.map((r: any) => r.res_code)})
      `;
      for (const row of data) existing.set(`${row.sport_code}|${row.res_code}`, row);
    } catch (err) {
      ctx.errors.push({ table: "schedule_items:select", error: err instanceof Error ? err.message : String(err) });
    }
  }

  let rowsChanged = 0;
  const now = new Date().toISOString();
  const entered = await enteredEvents(ctx);
  const countries = await countryMap(ctx);

  const payload = rows.map((r) => {
    const key = `${r.sport_code}|${r.res_code}`;
    const prev = existing.get(key);
    if (singleSport && prev) {
      // never overwrite richer data with empty values
      if (!r.orgs?.length && (prev.orgs ?? []).length) {
        r.orgs = prev.orgs;
        r.has_india = hasIndia(prev.orgs ?? []);
      }
      if (!r.home && prev.home) r.home = prev.home;
      if (!r.away && prev.away) r.away = prev.away;
    }
    if (changed(prev, r)) rowsChanged++;
    const { sport_name, ...rest } = r;
    const prevRaw = prev?.raw ?? null;
    return {
      ...rest,
      india_entered: entered.has(`${r.sport_code}|${r.event_code}`),
      raw: r.has_india
        ? { ...(prevRaw && typeof prevRaw === "object" ? prevRaw : {}), item: r.raw }
        : prevRaw,
      updated_at: now,
    };
  });

  const scheduleCols = [
    "sport_code", "res_code", "event_code", "event_name", "phase_code", "phase_name",
    "unit_name", "unit_name_short", "unit_num", "start_time", "start_jst", "start_ist",
    "date_jst", "date_ist", "venue_code", "venue_name", "location_name", "status",
    "status_desc", "is_live", "is_h2h", "medal_flag", "orgs", "has_india", "home",
    "away", "raw", "india_entered", "updated_at",
  ] as const;

  for (const c of chunk(payload, 500)) {
    try {
      const rowsForInsert = c.map((r: any) => ({
        ...r,
        home: r.home === null ? null : sql.json(r.home),
        away: r.away === null ? null : sql.json(r.away),
        raw: r.raw === null ? null : sql.json(r.raw),
      }));
      await sql`
        INSERT INTO schedule_items ${sql(rowsForInsert as Record<string, unknown>[], ...scheduleCols)}
        ON CONFLICT (sport_code, res_code) DO UPDATE SET
          event_code = EXCLUDED.event_code, event_name = EXCLUDED.event_name,
          phase_code = EXCLUDED.phase_code, phase_name = EXCLUDED.phase_name,
          unit_name = EXCLUDED.unit_name, unit_name_short = EXCLUDED.unit_name_short,
          unit_num = EXCLUDED.unit_num, start_time = EXCLUDED.start_time,
          start_jst = EXCLUDED.start_jst, start_ist = EXCLUDED.start_ist,
          date_jst = EXCLUDED.date_jst, date_ist = EXCLUDED.date_ist,
          venue_code = EXCLUDED.venue_code, venue_name = EXCLUDED.venue_name,
          location_name = EXCLUDED.location_name, status = EXCLUDED.status,
          status_desc = EXCLUDED.status_desc, is_live = EXCLUDED.is_live,
          is_h2h = EXCLUDED.is_h2h, medal_flag = EXCLUDED.medal_flag,
          orgs = EXCLUDED.orgs, has_india = EXCLUDED.has_india, home = EXCLUDED.home,
          away = EXCLUDED.away, raw = EXCLUDED.raw, india_entered = EXCLUDED.india_entered,
          updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      ctx.errors.push({ table: "schedule_items", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // direct India results from head-to-head schedule payloads
  const indiaRows = rows.filter((r) => r.has_india);
  const h2hResults: any[] = [];
  for (const r of indiaRows) {
    if (!r.is_h2h) continue;
    const home = r.home;
    const away = r.away;
    if (!home || !away) continue;
    const indiaSide = home.Org === "IND" ? home : away.Org === "IND" ? away : null;
    if (!indiaSide) continue;
    const oppSide = indiaSide === home ? away : home;
    const status = (r.status || "").toUpperCase();
    const settled = ["PROVISIONAL", "UNOFFICIAL", "OFFICIAL"].includes(status);
    let outcome: string | null = null;
    if (settled) {
      if (indiaSide.Winner) outcome = "won";
      else if (oppSide.Winner) outcome = "lost";
      else if (indiaSide.Result && indiaSide.Result === oppSide.Result) outcome = "draw";
      else if (indiaSide.Result || oppSide.Result) outcome = "lost";
    }
    const ident = sideIdentity(indiaSide);
    const oppCode = oppSide.Org || null;
    const base = {
      sport_code: r.sport_code,
      res_code: r.res_code,
      competitor_key: indiaSide.Reg || indiaSide.Name || "IND",
      athlete_or_team: indiaSide.Name || "India",
      spoken_name: ident.spoken || "India",
      is_team: ident.isTeam,
      opponent_code: oppCode,
      opponent_name: oppSide.Name || oppSide.NameS || null,
      opponent_country_code: oppCode,
      opponent_country_name: oppCode
        ? oppSide.OrgDesc || countries.get(oppCode) || oppCode
        : null,
      india_score: indiaSide.Result ?? null,
      opponent_score: oppSide.Result ?? null,
      outcome,
      rank: null,
      result_mark: null,
      qualified: null,
      irm: null,
      medal: medalFromRaw(indiaSide.Medal),
      medal_raw: indiaSide.Medal ?? null,
      periods: r.raw?.Periods ?? null,
      status: r.status,
      start_time: r.start_time,
      updated_at: now,
    };
    h2hResults.push({
      ...base,
      spoken_summary_en: buildSummary({ ...r, sport_name: r.sport_name }, base),
    });
  }

  const resultCols = [
    "sport_code", "res_code", "competitor_key", "athlete_or_team", "spoken_name", "is_team",
    "opponent_code", "opponent_name", "opponent_country_code", "opponent_country_name",
    "india_score", "opponent_score", "outcome", "rank", "result_mark", "qualified", "irm",
    "medal", "medal_raw", "periods", "status", "start_time", "updated_at", "spoken_summary_en",
  ] as const;

  for (const c of chunk(h2hResults, 500)) {
    try {
      const rowsForInsert = c.map((r: any) => ({ ...r, periods: r.periods === null ? null : sql.json(r.periods) }));
      await sql`
        INSERT INTO india_results ${sql(rowsForInsert as Record<string, unknown>[], ...resultCols)}
        ON CONFLICT (sport_code, res_code, competitor_key) DO UPDATE SET
          athlete_or_team = EXCLUDED.athlete_or_team, spoken_name = EXCLUDED.spoken_name,
          is_team = EXCLUDED.is_team, opponent_code = EXCLUDED.opponent_code,
          opponent_name = EXCLUDED.opponent_name, opponent_country_code = EXCLUDED.opponent_country_code,
          opponent_country_name = EXCLUDED.opponent_country_name, india_score = EXCLUDED.india_score,
          opponent_score = EXCLUDED.opponent_score, outcome = EXCLUDED.outcome, rank = EXCLUDED.rank,
          result_mark = EXCLUDED.result_mark, qualified = EXCLUDED.qualified, irm = EXCLUDED.irm,
          medal = EXCLUDED.medal, medal_raw = EXCLUDED.medal_raw, periods = EXCLUDED.periods,
          status = EXCLUDED.status, start_time = EXCLUDED.start_time, updated_at = EXCLUDED.updated_at,
          spoken_summary_en = EXCLUDED.spoken_summary_en
      `;
    } catch (err) {
      ctx.errors.push({ table: "india_results", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    items_seen: rows.length,
    rows_changed: rowsChanged,
    india_items: indiaRows.length,
  };
}

/** Fetches and stores the India result rows for one schedule item. */
async function fetchResultFor(ctx: Ctx, item: any, now: string, countries: Map<string, string>) {
  const sql = ctx.sql;
  ctx.calls.n++;
  let res: any;
  try {
    res = await fetchFeedPath(`${item.sport_code}/results/${encodeURIComponent(item.res_code)}`);
  } catch (err) {
    ctx.errors.push({
      res_code: item.res_code,
      error: err instanceof Error ? err.message : String(err),
    });
    return { rows: 0, india: 0 };
  }

  const competitors: any[] = Array.isArray(res?.Competitors) ? res.Competitors : [];
  const indiaComps = competitors.filter((c) => c?.Org === "IND");
  const sportName = res?.Info?.DiscDesc || null;

  const rows: any[] = [];
  for (const c of indiaComps) {
    const opp =
      item.is_h2h && competitors.length === 2 ? competitors.find((x) => x !== c) : null;
    const wlt = (c.WLT || "").toUpperCase();
    const resStatus = String(res?.Info?.Status || item.status || "").toUpperCase();
    const resSettled = ["PROVISIONAL", "UNOFFICIAL", "OFFICIAL"].includes(resStatus);
    const outcome = !resSettled
      ? null
      : wlt === "W"
        ? "won"
        : wlt === "L"
          ? "lost"
          : wlt === "T" || wlt === "D"
            ? "draw"
            : null;
    const ident = sideIdentity(c);
    const oppCode = opp?.Org ?? null;

    const base = {
      sport_code: item.sport_code,
      res_code: item.res_code,
      competitor_key: c.Reg || c.Name || "IND",
      athlete_or_team: c.Name || "India",
      spoken_name: ident.spoken || "India",
      is_team: ident.isTeam,
      opponent_code: oppCode,
      opponent_name: opp?.Name || opp?.NameS || null,
      opponent_country_code: oppCode,
      opponent_country_name: oppCode ? opp?.OrgDesc || countries.get(oppCode) || oppCode : null,
      india_score: item.is_h2h ? (c.Result ?? null) : null,
      opponent_score: opp?.Result ?? null,
      outcome,
      rank: c.Rk || null,
      result_mark: item.is_h2h ? null : c.Result || c.ResDetail || null,
      qualified: c.Qualified || null,
      irm: c.IRM && c.IRM.toUpperCase() !== "OK" ? c.IRM : null,
      medal: medalFromRaw(c.Medal),
      medal_raw: c.Medal ?? null,
      periods: res?.Results?.Periods ?? null,
      status: res?.Info?.Status || item.status,
      start_time: item.start_time,
      updated_at: now,
    };
    rows.push({
      ...base,
      spoken_summary_en: buildSummary(
        {
          sport_code: item.sport_code,
          sport_name: sportName,
          event_name: item.event_name,
          phase_name: item.phase_name,
          start_ist: item.start_ist,
          status: res?.Info?.Status || item.status,
          is_live: res?.Info?.IsLive ?? item.is_live,
          is_h2h: item.is_h2h,
          medal_flag: item.medal_flag,
          start_time: item.start_time,
        },
        base,
      ),
    });
  }

  let changedRows = 0;
  if (rows.length) {
    const resultCols = [
      "sport_code", "res_code", "competitor_key", "athlete_or_team", "spoken_name", "is_team",
      "opponent_code", "opponent_name", "opponent_country_code", "opponent_country_name",
      "india_score", "opponent_score", "outcome", "rank", "result_mark", "qualified", "irm",
      "medal", "medal_raw", "periods", "status", "start_time", "updated_at", "spoken_summary_en",
    ] as const;
    try {
      const rowsForInsert = rows.map((r: any) => ({ ...r, periods: r.periods === null ? null : sql.json(r.periods) }));
      await sql`
        INSERT INTO india_results ${sql(rowsForInsert as Record<string, unknown>[], ...resultCols)}
        ON CONFLICT (sport_code, res_code, competitor_key) DO UPDATE SET
          athlete_or_team = EXCLUDED.athlete_or_team, spoken_name = EXCLUDED.spoken_name,
          is_team = EXCLUDED.is_team, opponent_code = EXCLUDED.opponent_code,
          opponent_name = EXCLUDED.opponent_name, opponent_country_code = EXCLUDED.opponent_country_code,
          opponent_country_name = EXCLUDED.opponent_country_name, india_score = EXCLUDED.india_score,
          opponent_score = EXCLUDED.opponent_score, outcome = EXCLUDED.outcome, rank = EXCLUDED.rank,
          result_mark = EXCLUDED.result_mark, qualified = EXCLUDED.qualified, irm = EXCLUDED.irm,
          medal = EXCLUDED.medal, medal_raw = EXCLUDED.medal_raw, periods = EXCLUDED.periods,
          status = EXCLUDED.status, start_time = EXCLUDED.start_time, updated_at = EXCLUDED.updated_at,
          spoken_summary_en = EXCLUDED.spoken_summary_en
      `;
      changedRows += rows.length;
    } catch (err) {
      ctx.errors.push({ table: "india_results", error: err instanceof Error ? err.message : String(err) });
    }
  }

  const prevRaw = item.raw && typeof item.raw === "object" ? item.raw : {};
  try {
    await sql`
      UPDATE schedule_items
      SET raw = ${sql.json({ ...prevRaw, result: res })}, india_result_fetched_at = ${now}
      WHERE sport_code = ${item.sport_code} AND res_code = ${item.res_code}
    `;
  } catch (err) {
    ctx.errors.push({ table: "schedule_items:update", error: err instanceof Error ? err.message : String(err) });
  }

  return { rows: changedRows, india: rows.length };
}

/* ------------------------------- mode: day ------------------------------- */

export async function runDay(ctx: Ctx, date: string) {
  const merged = new Map<string, any>();

  ctx.calls.n++;
  const dayData = await fetchFeedPath(`ALL/schedule/day/${date}`);
  const dayItems = asItems(dayData);
  for (const it of dayItems) {
    if (!it?.Disc) continue;
    const m = mapItem(it);
    if (!m.res_code) continue;
    merged.set(`${m.sport_code}|${m.res_code}`, m);
  }

  const discs = [...new Set(dayItems.map((i: any) => i?.Disc).filter(Boolean))] as string[];
  const budget = Math.max(0, MAX_FEED_CALLS - ctx.calls.n);
  const toFetch = discs.slice(0, budget);
  if (toFetch.length < discs.length) {
    ctx.errors.push({ warn: "feed call budget reached", skippedDiscs: discs.length - toFetch.length });
  }

  await runBatched(toFetch, async (disc) => {
    ctx.calls.n++;
    try {
      const data = await fetchFeedPath(`${disc}/schedule/daily/${date}`);
      for (const it of asItems(data)) {
        if (!it?.Disc) continue;
        const m = mapItem(it);
        if (!m.res_code) continue;
        const key = `${m.sport_code}|${m.res_code}`;
        const prev = merged.get(key);
        if (prev) {
          // never overwrite richer data with empty values
          if (!m.orgs.length && prev.orgs.length) {
            m.orgs = prev.orgs;
            m.has_india = prev.has_india;
          }
          if (!m.home && prev.home) m.home = prev.home;
          if (!m.away && prev.away) m.away = prev.away;
        }
        merged.set(key, m);
      }
    } catch (err) {
      ctx.errors.push({ disc, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return upsertScheduleRows(ctx, [...merged.values()]);
}

/* ----------------------------- mode: results ----------------------------- */

export async function runResults(ctx: Ctx, limit: number, liveOnly: boolean) {
  const sql = ctx.sql;
  let data: any[];
  try {
    data = liveOnly
      ? await sql`
          SELECT * FROM schedule_items WHERE has_india = true AND is_live = true
          ORDER BY start_time DESC LIMIT 300
        `
      : await sql`
          SELECT * FROM schedule_items WHERE has_india = true
          ORDER BY start_time DESC LIMIT 300
        `;
  } catch (err) {
    ctx.errors.push({ stage: "select candidates", error: err instanceof Error ? err.message : String(err) });
    return { items_seen: 0, rows_changed: 0, india_items: 0 };
  }

  const nowMs = Date.now();
  const candidates = data
    .filter((r: any) => {
      const status = (r.status || "").toUpperCase();
      const startMs = r.start_time ? new Date(r.start_time).getTime() : null;
      const started = startMs !== null ? startMs < nowMs : false;
      // start lists publish the Indian entrants ahead of time
      const startListSoon =
        status === "START_LIST" && startMs !== null && startMs - nowMs < 36 * 3600 * 1000;
      const ready =
        liveOnly ||
        r.is_live ||
        FINISHED_STATUSES.includes(status) ||
        started ||
        startListSoon;
      if (!ready) return false;
      if (!r.india_result_fetched_at) return true;
      const fetchedMs = new Date(r.india_result_fetched_at).getTime();
      const stale = new Date(r.updated_at).getTime() > fetchedMs;
      if (status === "OFFICIAL") return stale;
      if (status === "START_LIST" || status === "SCHEDULED")
        return stale || nowMs - fetchedMs > 30 * 60 * 1000;
      return true;
    })
    .slice(0, Math.min(limit, Math.max(0, MAX_FEED_CALLS - ctx.calls.n)));

  if (liveOnly && !candidates.length) {
    return { items_seen: 0, rows_changed: 0, india_items: 0, skip_log: true };
  }

  let indiaCount = 0;
  let rowsChanged = 0;
  const now = new Date().toISOString();
  const countries = await countryMap(ctx);

  await runBatched(candidates, async (item: any) => {
    const out = await fetchResultFor(ctx, item, now, countries);
    rowsChanged += out.rows;
    indiaCount += out.india;
  });

  return {
    items_seen: candidates.length,
    rows_changed: rowsChanged,
    india_items: indiaCount,
  };
}

/* ---------------------------- mode: india_now ---------------------------- */

const INDIA_NOW_BEFORE_MS = 6 * 3600 * 1000;
const INDIA_NOW_AFTER_MS = 15 * 60 * 1000;

async function indiaWindowItems(ctx: Ctx) {
  const sql = ctx.sql;
  const nowMs = Date.now();
  const from = new Date(nowMs - INDIA_NOW_BEFORE_MS).toISOString();
  const to = new Date(nowMs + INDIA_NOW_AFTER_MS).toISOString();

  let windowRows: any[] = [];
  let liveRows: any[] = [];
  try {
    windowRows = await sql`
      SELECT * FROM schedule_items
      WHERE has_india = true AND start_time >= ${from} AND start_time <= ${to}
      ORDER BY start_time DESC LIMIT 200
    `;
  } catch (err) {
    ctx.errors.push({ stage: "india_now window", error: err instanceof Error ? err.message : String(err) });
  }
  try {
    liveRows = await sql`
      SELECT * FROM schedule_items WHERE has_india = true AND is_live = true
      ORDER BY start_time DESC LIMIT 200
    `;
  } catch (err) {
    ctx.errors.push({ stage: "india_now live", error: err instanceof Error ? err.message : String(err) });
  }

  const map = new Map<string, any>();
  for (const r of windowRows) {
    if ((r.status || "").toUpperCase() === "OFFICIAL") continue;
    map.set(`${r.sport_code}|${r.res_code}`, r);
  }
  for (const r of liveRows) map.set(`${r.sport_code}|${r.res_code}`, r);
  return [...map.values()].sort((a, b) =>
    String(b.start_time ?? "").localeCompare(String(a.start_time ?? "")),
  );
}

/** True when an India item is live, starting within 2 minutes, or started within the last 20 — matches the old cron's live-job guard. */
export async function indiaLiveWindowActive(ctx: Ctx): Promise<boolean> {
  const rows: any[] = await ctx.sql`
    SELECT 1 FROM schedule_items
    WHERE has_india = true AND (
      is_live = true OR status = 'RUNNING' OR
      start_time BETWEEN now() - interval '20 minutes' AND now() + interval '2 minutes'
    )
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function runIndiaNow(ctx: Ctx) {
  const window = await indiaWindowItems(ctx);
  if (!window.length) {
    return { items_seen: 0, rows_changed: 0, india_items: 0, skip_log: true };
  }

  const pairs = new Map<string, { sport: string; date: string }>();
  for (const r of window) {
    if (!r.sport_code || !r.date_jst) continue;
    const key = `${r.sport_code}|${r.date_jst}`;
    if (!pairs.has(key)) pairs.set(key, { sport: r.sport_code, date: r.date_jst });
  }
  const toFetch = [...pairs.values()].slice(0, 10);

  const mapped: any[] = [];
  await runBatched(toFetch, async ({ sport, date }) => {
    if (ctx.calls.n >= MAX_FEED_CALLS) return;
    ctx.calls.n++;
    try {
      const data = await fetchFeedPath(`${sport}/schedule/daily/${date}`);
      for (const it of asItems(data)) {
        if (!it?.Disc) continue;
        const m = mapItem(it);
        if (!m.res_code) continue;
        mapped.push(m);
      }
    } catch (err) {
      ctx.errors.push({ sport, date, error: err instanceof Error ? err.message : String(err) });
    }
  });

  const stats = await upsertScheduleRows(ctx, mapped, true);

  // re-read the window, now that statuses and pairings are current
  const refreshed = (await indiaWindowItems(ctx)).filter((r) => r.has_india).slice(0, 30);
  const now = new Date().toISOString();
  const countries = await countryMap(ctx);
  let rowsChanged = stats.rows_changed;
  let indiaCount = 0;
  await runBatched(refreshed, async (item: any) => {
    if (ctx.calls.n >= MAX_FEED_CALLS) return;
    const out = await fetchResultFor(ctx, item, now, countries);
    rowsChanged += out.rows;
    indiaCount += out.india;
  });

  return {
    items_seen: stats.items_seen + refreshed.length,
    rows_changed: rowsChanged,
    india_items: Math.max(stats.india_items, indiaCount),
    params_extra: { sports: toFetch.map((p) => `${p.sport}:${p.date}`) },
  };
}

/* --------------------------- mode: india_today --------------------------- */

export async function runIndiaToday(ctx: Ctx) {
  const sql = ctx.sql;
  const date = todayInJst();
  let data: any[] = [];
  try {
    data = await sql`
      SELECT sport_code, status, has_india, india_entered FROM schedule_items
      WHERE date_jst = ${date} LIMIT 5000
    `;
  } catch (err) {
    ctx.errors.push({ stage: "india_today select", error: err instanceof Error ? err.message : String(err) });
  }

  const sports: string[] = [];
  for (const r of data) {
    if (!r.sport_code) continue;
    if (!r.has_india && !r.india_entered) continue;
    const status = String(r.status ?? "").toUpperCase();
    if (status === "OFFICIAL" || status === "CANCELLED") continue;
    if (!sports.includes(r.sport_code)) sports.push(r.sport_code);
    if (sports.length >= 30) break;
  }

  const mapped: any[] = [];
  await runBatched(sports, async (sport) => {
    if (ctx.calls.n >= MAX_FEED_CALLS) return;
    ctx.calls.n++;
    try {
      const feed = await fetchFeedPath(`${sport}/schedule/daily/${date}`);
      for (const it of asItems(feed)) {
        if (!it?.Disc) continue;
        const m = mapItem(it);
        if (!m.res_code) continue;
        mapped.push(m);
      }
    } catch (err) {
      ctx.errors.push({ sport, error: err instanceof Error ? err.message : String(err) });
    }
  });

  const stats = await upsertScheduleRows(ctx, mapped, true);
  const results = await runResults(ctx, 25, false);

  return {
    items_seen: stats.items_seen + results.items_seen,
    rows_changed: stats.rows_changed + results.rows_changed,
    india_items: stats.india_items + results.india_items,
    params_extra: { sports, date },
  };
}

/* ----------------------------- mode: entries ----------------------------- */

export async function runEntries(ctx: Ctx) {
  const sql = ctx.sql;
  ctx.calls.n++;
  const data = await fetchFeedPath("ALL/entries/list");
  const now = new Date().toISOString();

  const orgs: any[] = Array.isArray(data?.orgs) ? data.orgs : [];
  const countryRows = orgs
    .map((o) => ({
      code: o.Key || o.Code || o.Org,
      name: o.Desc || o.Name || o.OrgDesc || null,
      updated_at: now,
    }))
    .filter((c) => c.code);
  for (const c of chunk(countryRows, 500)) {
    try {
      await sql`
        INSERT INTO countries ${sql(c as Record<string, unknown>[], "code", "name", "updated_at")}
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      ctx.errors.push({ table: "countries", error: err instanceof Error ? err.message : String(err) });
    }
  }

  const discMap = new Map<string, string>(
    (Array.isArray(data?.disciplines) ? data.disciplines : []).map((d: any) => [
      d.Key,
      d.Desc,
    ]),
  );

  const participants: any[] = Array.isArray(data?.participants) ? data.participants : [];
  const indiaParts = participants.filter((p) => p?.Org === "IND");
  const byKey = new Map<string, any>();
  for (const p of indiaParts) {
    for (const ins of p.Inscriptions ?? []) {
      const eventCode = normalizeEventCode(ins.EvKey);
      if (!eventCode || !p.Disc || !p.Reg) continue;
      const key = `${p.Disc}|${p.Reg}|${eventCode}`;
      const prev = byKey.get(key);
      const isMember = !!ins.isMember && (prev ? prev.is_member : true);
      byKey.set(key, {
        sport_code: p.Disc,
        reg: String(p.Reg),
        event_code: eventCode,
        name: p.Name || null,
        spoken_name: p.Type === "T" ? p.Name || "India" : spokenName(p.Name),
        gender: p.Gender || null,
        type: p.Type || null,
        event_name: ins.EvDesc || null,
        is_member: isMember,
        sport_name: discMap.get(p.Disc) ?? null,
        updated_at: now,
      });
    }
  }

  const rows = [...byKey.values()];
  for (const c of chunk(rows, 500)) {
    try {
      await sql`
        INSERT INTO india_entries ${sql(c as Record<string, unknown>[], "sport_code", "reg", "event_code", "name", "spoken_name", "gender", "type", "event_name", "is_member", "sport_name", "updated_at")}
        ON CONFLICT (sport_code, reg, event_code) DO UPDATE SET
          name = EXCLUDED.name, spoken_name = EXCLUDED.spoken_name, gender = EXCLUDED.gender,
          type = EXCLUDED.type, event_name = EXCLUDED.event_name, is_member = EXCLUDED.is_member,
          sport_name = EXCLUDED.sport_name, updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      ctx.errors.push({ table: "india_entries", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // was: SELECT refresh_india_entered() — inlined here, no DB function needed.
  try {
    await sql`
      UPDATE schedule_items s
      SET india_entered = EXISTS (
        SELECT 1 FROM india_entries e
        WHERE e.sport_code = s.sport_code AND e.event_code = s.event_code
      )
      WHERE s.india_entered IS DISTINCT FROM EXISTS (
        SELECT 1 FROM india_entries e
        WHERE e.sport_code = s.sport_code AND e.event_code = s.event_code
      )
    `;
  } catch (err) {
    ctx.errors.push({ rpc: "refresh_india_entered", error: err instanceof Error ? err.message : String(err) });
  }

  return { items_seen: participants.length, rows_changed: rows.length, india_items: rows.length };
}

/* ------------------------------ mode: medals ------------------------------ */

export async function runMedals(ctx: Ctx) {
  const sql = ctx.sql;
  const now = new Date().toISOString();

  ctx.calls.n++;
  const medalsFeed = asItems(await fetchFeedPath("ALL/medals/org/IND"));
  ctx.calls.n++;
  const standingsFeed = asItems(await fetchFeedPath("ALL/medals/standings"));

  // --- India medals (full rebuild) ---
  const rows = medalsFeed
    .map((m: any) => {
      const medal = medalFromRaw(m.Medal);
      const eventCode = normalizeEventCode(m.Event);
      if (!medal || !m.Disc || !eventCode) return null;
      const memberNames: string[] = (m.Members ?? [])
        .map((x: any) => x?.Name)
        .filter(Boolean);
      const membersSpoken = joinNames(memberNames.map((n) => spokenName(n)));
      const isTeam = m.Type === "T";
      const who = isTeam ? "India" : spokenName(m.Name) || "India";
      const t = parseFeedTime(m.DateRaw);
      const eventLabel = [m.DiscDesc, m.EventDesc].filter(Boolean).join(", ");
      const summary = isTeam
        ? `India won ${medal} in ${eventLabel}${membersSpoken ? `: ${membersSpoken}` : ""}.`
        : `${who} of India won ${medal} in ${eventLabel}.`;
      return {
        sport_code: m.Disc,
        event_code: eventCode,
        competitor_key: String(m.Reg || m.Name || "IND"),
        reg: String(m.Reg || ""),
        medal,
        athlete_or_team: m.Name || "India",
        spoken_name: who,
        members: memberNames.length ? memberNames : null,
        members_spoken: membersSpoken || null,
        sport_name: m.DiscDesc || null,
        event_name: m.EventDesc || null,
        gender: m.Gender || null,
        won_at: t.start_time,
        date_ist: t.date_ist,
        spoken_summary_en: summary,
        updated_at: now,
      };
    })
    .filter(Boolean) as any[];

  const keep = rows.map((r) => r.competitor_key);
  if (rows.length) {
    try {
      const medalCols = [
        "sport_code", "event_code", "competitor_key", "reg", "medal", "athlete_or_team",
        "spoken_name", "members", "members_spoken", "sport_name", "event_name", "gender",
        "won_at", "date_ist", "spoken_summary_en", "updated_at",
      ] as const;
      const rowsForInsert = rows.map((r: any) => ({ ...r, members: r.members === null ? null : sql.json(r.members) }));
      await sql`
        INSERT INTO india_medals ${sql(rowsForInsert as Record<string, unknown>[], ...medalCols)}
        ON CONFLICT (sport_code, event_code, competitor_key) DO UPDATE SET
          reg = EXCLUDED.reg, medal = EXCLUDED.medal, athlete_or_team = EXCLUDED.athlete_or_team,
          spoken_name = EXCLUDED.spoken_name, members = EXCLUDED.members,
          members_spoken = EXCLUDED.members_spoken, sport_name = EXCLUDED.sport_name,
          event_name = EXCLUDED.event_name, gender = EXCLUDED.gender, won_at = EXCLUDED.won_at,
          date_ist = EXCLUDED.date_ist, spoken_summary_en = EXCLUDED.spoken_summary_en,
          updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      ctx.errors.push({ table: "india_medals", error: err instanceof Error ? err.message : String(err) });
    }
  }
  // remove medals no longer in the official feed
  try {
    if (keep.length) {
      await sql`DELETE FROM india_medals WHERE NOT (competitor_key = ANY(${keep}))`;
    } else {
      await sql`DELETE FROM india_medals`;
    }
  } catch (err) {
    ctx.errors.push({ table: "india_medals:delete", error: err instanceof Error ? err.message : String(err) });
  }

  // --- medal standings (full refresh) ---
  const standings = standingsFeed
    .map((s: any) => ({
      org_code: s.Org,
      org_name: s.OrgDesc || s.Org,
      rank: s.Rk ?? s.RkTotal ?? null,
      gold: s.Count?.ME_GOLD?.total ?? 0,
      silver: s.Count?.ME_SILVER?.total ?? 0,
      bronze: s.Count?.ME_BRONZE?.total ?? 0,
      total: s.Count?.total?.total ?? 0,
      updated_at: now,
    }))
    .filter((s: any) => s.org_code);
  if (standings.length) {
    try {
      await sql`
        INSERT INTO medal_standings ${sql(standings as Record<string, unknown>[], "org_code", "org_name", "rank", "gold", "silver", "bronze", "total", "updated_at")}
        ON CONFLICT (org_code) DO UPDATE SET
          org_name = EXCLUDED.org_name, rank = EXCLUDED.rank, gold = EXCLUDED.gold,
          silver = EXCLUDED.silver, bronze = EXCLUDED.bronze, total = EXCLUDED.total,
          updated_at = EXCLUDED.updated_at
      `;
    } catch (err) {
      ctx.errors.push({ table: "medal_standings", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- stamp medals onto matching India results ---
  for (const m of rows) {
    try {
      const items = await sql`
        SELECT res_code FROM schedule_items
        WHERE sport_code = ${m.sport_code} AND event_code = ${m.event_code}
          AND medal_flag IN ('1', '2') AND status = 'OFFICIAL'
      `;
      const resCodes = items.map((i: any) => i.res_code);
      if (!resCodes.length) continue;
      await sql`
        UPDATE india_results SET medal = ${m.medal}, updated_at = ${now}
        WHERE sport_code = ${m.sport_code} AND res_code = ANY(${resCodes})
      `;
    } catch (err) {
      ctx.errors.push({ table: "india_results:medal", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    items_seen: medalsFeed.length + standingsFeed.length,
    rows_changed: rows.length + standings.length,
    india_items: rows.length,
  };
}

/* -------------------------------- dispatch -------------------------------- */

/**
 * Runs one ingest mode end-to-end (fetch, upsert, fetch_log write) and
 * returns the same summary shape the HTTP route used to. Shared by the HTTP
 * ingest route (manual/CI-triggered runs) and the worker's scheduler (the
 * in-process replacement for the old pg_cron jobs), so there is exactly one
 * implementation of "run this mode and log it".
 */
export async function runIngestMode(
  sql: Sql,
  mode: string,
  params: Record<string, string> = {},
) {
  const started = Date.now();
  const ctx = newCtx(sql);
  const startedAt = new Date().toISOString();

  let stats: any = { items_seen: 0, rows_changed: 0, india_items: 0 };
  let ok = true;
  try {
    if (mode === "day") {
      stats = await runDay(ctx, params["date"] || todayInJst());
    } else if (mode === "cycle") {
      const offset = Number(params["offset"] || 0);
      stats = await runDay(ctx, todayInJst(offset));
    } else if (mode === "results") {
      stats = await runResults(ctx, Number(params["limit"] || 25), false);
    } else if (mode === "live") {
      stats = await runResults(ctx, Number(params["limit"] || 30), true);
    } else if (mode === "india_now") {
      stats = await runIndiaNow(ctx);
    } else if (mode === "india_today") {
      stats = await runIndiaToday(ctx);
    } else if (mode === "entries") {
      stats = await runEntries(ctx);
    } else if (mode === "medals") {
      stats = await runMedals(ctx);
    } else {
      ok = false;
      ctx.errors.push({ error: `unknown mode: ${mode}` });
    }
  } catch (err) {
    ok = false;
    ctx.errors.push({ error: err instanceof Error ? err.message : String(err) });
  }

  if (ctx.errors.some((e) => e.error)) ok = false;
  const ms = Date.now() - started;
  const { skip_log, params_extra, ...counts } = stats;

  if (!skip_log) {
    try {
      await sql`
        INSERT INTO fetch_log (mode, params, started_at, finished_at, feed_calls, items_seen, rows_changed, india_items, errors, ok)
        VALUES (
          ${mode}, ${sql.json({ ...params, ...(params_extra ?? {}) })}, ${startedAt}, ${new Date().toISOString()},
          ${ctx.calls.n}, ${counts.items_seen}, ${counts.rows_changed}, ${counts.india_items},
          ${ctx.errors.length ? sql.json(ctx.errors) : null}, ${ok}
        )
      `;
    } catch (err) {
      ctx.errors.push({ table: "fetch_log", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { ok, mode, feed_calls: ctx.calls.n, ...counts, errors: ctx.errors, ms };
}
