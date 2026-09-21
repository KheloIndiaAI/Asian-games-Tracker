import { createFileRoute } from "@tanstack/react-router";
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


const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const MAX_FEED_CALLS = 60;
const PARALLELISM = 5;
const BATCH_GAP_MS = 100;
const FINISHED_STATUSES = ["PROVISIONAL", "UNOFFICIAL", "OFFICIAL", "RUNNING", "LIVE", "FINISHED"];

type Ctx = {
  admin: any;
  errors: any[];
  calls: { n: number };
  countries?: Map<string, string>;
  entered?: Set<string>;
};


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
  const { data } = await ctx.admin.from("countries").select("code,name");
  ctx.countries = new Map((data ?? []).map((c: any) => [c.code, c.name ?? c.code]));
  return ctx.countries!;
}

/** set of "SPORT|EVENT" where India has entries. */
async function enteredEvents(ctx: Ctx): Promise<Set<string>> {
  if (ctx.entered) return ctx.entered;
  const set = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await ctx.admin
      .from("india_entries")
      .select("sport_code,event_code")
      .range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) set.add(`${r.sport_code}|${r.event_code}`);
    if (data.length < 1000) break;
    from += 1000;
  }
  ctx.entered = set;
  return set;
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

  const sports = new Map<string, any>();
  const events = new Map<string, any>();
  for (const r of rows) {
    sports.set(r.sport_code, {
      code: r.sport_code,
      name: r.sport_name,
      updated_at: new Date().toISOString(),
    });
    if (r.event_code) {
      events.set(`${r.sport_code}|${r.event_code}`, {
        sport_code: r.sport_code,
        event_code: r.event_code,
        name: r.event_name,
        gender: genderFromEventCode(r.event_code),
        updated_at: new Date().toISOString(),
      });
    }
  }

  for (const c of chunk([...sports.values()], 500)) {
    const { error } = await ctx.admin.from("sports").upsert(c, { onConflict: "code" });
    if (error) ctx.errors.push({ table: "sports", error: error.message });
  }
  for (const c of chunk([...events.values()], 500)) {
    const { error } = await ctx.admin
      .from("events")
      .upsert(c, { onConflict: "sport_code,event_code" });
    if (error) ctx.errors.push({ table: "events", error: error.message });
  }

  // existing rows for change detection
  const existing = new Map<string, any>();
  for (const c of chunk(rows, 500)) {
    const { data, error } = await ctx.admin
      .from("schedule_items")
      .select("sport_code,res_code,status,start_time,orgs,home,away,is_live,medal_flag,raw")
      .in("res_code", c.map((r: any) => r.res_code));
    if (error) ctx.errors.push({ table: "schedule_items:select", error: error.message });
    for (const row of data ?? []) existing.set(`${row.sport_code}|${row.res_code}`, row);
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

  for (const c of chunk(payload, 500)) {
    const { error } = await ctx.admin
      .from("schedule_items")
      .upsert(c, { onConflict: "sport_code,res_code" });
    if (error) ctx.errors.push({ table: "schedule_items", error: error.message });
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

  for (const c of chunk(h2hResults, 500)) {
    const { error } = await ctx.admin
      .from("india_results")
      .upsert(c, { onConflict: "sport_code,res_code,competitor_key" });
    if (error) ctx.errors.push({ table: "india_results", error: error.message });
  }

  return {
    items_seen: rows.length,
    rows_changed: rowsChanged,
    india_items: indiaRows.length,
  };
}

/** Fetches and stores the India result rows for one schedule item. */
async function fetchResultFor(ctx: Ctx, item: any, now: string, countries: Map<string, string>) {
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
    const { error: e1 } = await ctx.admin
      .from("india_results")
      .upsert(rows, { onConflict: "sport_code,res_code,competitor_key" });
    if (e1) ctx.errors.push({ table: "india_results", error: e1.message });
    else changedRows += rows.length;
  }

  const prevRaw = item.raw && typeof item.raw === "object" ? item.raw : {};
  const { error: e3 } = await ctx.admin
    .from("schedule_items")
    .update({ raw: { ...prevRaw, result: res }, india_result_fetched_at: now })
    .eq("sport_code", item.sport_code)
    .eq("res_code", item.res_code);
  if (e3) ctx.errors.push({ table: "schedule_items:update", error: e3.message });

  return { rows: changedRows, india: rows.length };
}

/* ------------------------------- mode: day ------------------------------- */

async function runDay(ctx: Ctx, date: string) {
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

async function runResults(ctx: Ctx, limit: number, liveOnly: boolean) {
  let q = ctx.admin
    .from("schedule_items")
    .select("*")
    .eq("has_india", true)
    .order("start_time", { ascending: false })
    .limit(300);
  if (liveOnly) q = q.eq("is_live", true);
  const { data, error } = await q;
  if (error) {
    ctx.errors.push({ stage: "select candidates", error: error.message });
    return { items_seen: 0, rows_changed: 0, india_items: 0 };
  }

  const nowMs = Date.now();
  const candidates = (data ?? [])
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
  const nowMs = Date.now();
  const from = new Date(nowMs - INDIA_NOW_BEFORE_MS).toISOString();
  const to = new Date(nowMs + INDIA_NOW_AFTER_MS).toISOString();
  const [windowRes, liveRes] = await Promise.all([
    ctx.admin
      .from("schedule_items")
      .select("*")
      .eq("has_india", true)
      .gte("start_time", from)
      .lte("start_time", to)
      .order("start_time", { ascending: false })
      .limit(200),
    ctx.admin
      .from("schedule_items")
      .select("*")
      .eq("has_india", true)
      .eq("is_live", true)
      .order("start_time", { ascending: false })
      .limit(200),
  ]);
  if (windowRes.error) ctx.errors.push({ stage: "india_now window", error: windowRes.error.message });
  if (liveRes.error) ctx.errors.push({ stage: "india_now live", error: liveRes.error.message });

  const map = new Map<string, any>();
  for (const r of windowRes.data ?? []) {
    if ((r.status || "").toUpperCase() === "OFFICIAL") continue;
    map.set(`${r.sport_code}|${r.res_code}`, r);
  }
  for (const r of liveRes.data ?? []) map.set(`${r.sport_code}|${r.res_code}`, r);
  return [...map.values()].sort((a, b) =>
    String(b.start_time ?? "").localeCompare(String(a.start_time ?? "")),
  );
}

async function runIndiaNow(ctx: Ctx) {
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

async function runIndiaToday(ctx: Ctx) {
  const date = todayInJst();
  const { data, error } = await ctx.admin
    .from("schedule_items")
    .select("sport_code,status,has_india,india_entered")
    .eq("date_jst", date)
    .limit(5000);
  if (error) ctx.errors.push({ stage: "india_today select", error: error.message });

  const sports: string[] = [];
  for (const r of data ?? []) {
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

async function runEntries(ctx: Ctx) {
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
    const { error } = await ctx.admin.from("countries").upsert(c, { onConflict: "code" });
    if (error) ctx.errors.push({ table: "countries", error: error.message });
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
    const { error } = await ctx.admin
      .from("india_entries")
      .upsert(c, { onConflict: "sport_code,reg,event_code" });
    if (error) ctx.errors.push({ table: "india_entries", error: error.message });
  }

  const { error: rpcError } = await ctx.admin.rpc("refresh_india_entered");
  if (rpcError) ctx.errors.push({ rpc: "refresh_india_entered", error: rpcError.message });

  return { items_seen: participants.length, rows_changed: rows.length, india_items: rows.length };
}

/* ------------------------------ mode: medals ------------------------------ */

async function runMedals(ctx: Ctx) {
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
    const { error } = await ctx.admin
      .from("india_medals")
      .upsert(rows, { onConflict: "sport_code,event_code,competitor_key" });
    if (error) ctx.errors.push({ table: "india_medals", error: error.message });
  }
  // remove medals no longer in the official feed
  {
    const del = ctx.admin.from("india_medals").delete();
    const { error } = keep.length
      ? await del.not("competitor_key", "in", `(${keep.map((k) => `"${k}"`).join(",")})`)
      : await del.neq("competitor_key", "__never__");
    if (error) ctx.errors.push({ table: "india_medals:delete", error: error.message });
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
    const { error } = await ctx.admin
      .from("medal_standings")
      .upsert(standings, { onConflict: "org_code" });
    if (error) ctx.errors.push({ table: "medal_standings", error: error.message });
  }

  // --- stamp medals onto matching India results ---
  for (const m of rows) {
    const { data: items } = await ctx.admin
      .from("schedule_items")
      .select("res_code")
      .eq("sport_code", m.sport_code)
      .eq("event_code", m.event_code)
      .in("medal_flag", ["1", "2"])
      .eq("status", "OFFICIAL");
    const resCodes = (items ?? []).map((i: any) => i.res_code);
    if (!resCodes.length) continue;
    const { error } = await ctx.admin
      .from("india_results")
      .update({ medal: m.medal, updated_at: now })
      .eq("sport_code", m.sport_code)
      .in("res_code", resCodes);
    if (error) ctx.errors.push({ table: "india_results:medal", error: error.message });
  }

  return {
    items_seen: medalsFeed.length + standingsFeed.length,
    rows_changed: rows.length + standings.length,
    india_items: rows.length,
  };
}


/* -------------------------------- handler -------------------------------- */

async function handle(request: Request) {
  const started = Date.now();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "cycle";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: secret } = await supabaseAdmin
    .from("app_secrets")
    .select("value")
    .eq("key", "ingest_key")
    .maybeSingle();

  const provided = request.headers.get("x-ingest-key");
  if (!secret?.value || provided !== secret.value) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: JSON_HEADERS });
  }

  const ctx: Ctx = { admin: supabaseAdmin, errors: [], calls: { n: 0 } };
  const params = Object.fromEntries(url.searchParams.entries());
  const startedAt = new Date().toISOString();

  let stats: any = { items_seen: 0, rows_changed: 0, india_items: 0 };
  let ok = true;
  try {
    if (mode === "day") {
      stats = await runDay(ctx, url.searchParams.get("date") || todayInJst());
    } else if (mode === "cycle") {
      const offset = Number(url.searchParams.get("offset") || 0);
      stats = await runDay(ctx, todayInJst(offset));
    } else if (mode === "results") {
      stats = await runResults(ctx, Number(url.searchParams.get("limit") || 25), false);
    } else if (mode === "live") {
      stats = await runResults(ctx, Number(url.searchParams.get("limit") || 30), true);
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
    await supabaseAdmin.from("fetch_log").insert({
      mode,
      params: { ...params, ...(params_extra ?? {}) },
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      feed_calls: ctx.calls.n,
      items_seen: counts.items_seen,
      rows_changed: counts.rows_changed,
      india_items: counts.india_items,
      errors: ctx.errors.length ? ctx.errors : null,
      ok,
    });
  }


  return Response.json(
    { ok, mode, feed_calls: ctx.calls.n, ...counts, errors: ctx.errors, ms },
    { headers: JSON_HEADERS },
  );
}


export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
