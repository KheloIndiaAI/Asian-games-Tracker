import { createFileRoute } from "@tanstack/react-router";
import { athletePath, matchPath, sportPath, sportSlug } from "@/lib/slug";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "public, max-age=30, s-maxage=30",
};

const FINISHED = ["OFFICIAL", "PROVISIONAL", "UNOFFICIAL"];
const ITEM_COLS =
  "sport_code,res_code,short_id,event_code,event_name,phase_name,unit_name,start_ist,start_time,status,status_desc,is_live,is_h2h,medal_flag,venue_name,location_name,has_india,india_entered,home,away,date_ist,date_jst,orgs";
const RESULT_COLS =
  "sport_code,res_code,competitor_key,athlete_or_team,spoken_name,is_team,opponent_name,opponent_country_code,opponent_country_name,india_score,opponent_score,outcome,rank,result_mark,qualified,irm,medal,status,start_time,spoken_summary_en";

/* ------------------------------ response cache ----------------------------- */

type CacheEntry = { at: number; ttl: number; data: any };
const responseCache = new Map<string, CacheEntry>();

function cacheRead(key: string): any | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    responseCache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheWrite(key: string, data: any, ttl: number) {
  if (responseCache.size > 200) responseCache.clear();
  responseCache.set(key, { at: Date.now(), ttl, data });
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

type Zone = { col: "date_ist" | "date_jst"; today: string };

function zoneOf(url: URL): Zone {
  const raw = (url.searchParams.get("tz") ?? "").trim().toLowerCase();
  if (raw === "jst") {
    return { col: "date_jst", today: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10) };
  }
  return { col: "date_ist", today: istToday() };
}

function param(url: URL, name: string): string | null {
  const v = url.searchParams.get(name);
  if (v == null) return null;
  const s = v.trim();
  return s === "" ? null : s;
}

type Side = { Org?: string; Name?: string; NameS?: string; OrgDesc?: string; Result?: string };

function sides(row: any) {
  const home = (row.home ?? null) as Side | null;
  const away = (row.away ?? null) as Side | null;
  if (!home || !away) return { india: null, opp: null };
  const india = home.Org === "IND" ? home : away.Org === "IND" ? away : null;
  const opp = india ? (india === home ? away : home) : null;
  return { india, opp };
}

function shapeItem(row: any, results: any[] = []) {
  const { india, opp } = sides(row);
  const live = !!row.is_live || (row.status || "").toUpperCase() === "RUNNING";
  return {
    sport_code: row.sport_code,
    res_code: row.res_code,
    short_id: row.short_id ?? null,
    event_code: row.event_code,
    event_name: row.event_name,
    phase_name: row.phase_name,
    unit_name: row.unit_name ?? null,
    start_ist: row.start_ist,
    start_time: row.start_time,
    date_ist: row.date_ist,
    date_jst: row.date_jst ?? null,
    status: row.status,
    status_desc: row.status_desc,
    is_live: live,
    is_h2h: !!row.is_h2h,
    is_finished: FINISHED.includes((row.status || "").toUpperCase()),
    medal_flag: row.medal_flag,
    venue_name: row.venue_name ?? row.location_name ?? null,
    has_india: !!row.has_india,
    india_entered: !!row.india_entered,
    orgs: row.orgs ?? [],
    india_name: india?.Name ?? null,
    india_score: india?.Result ?? null,
    opponent_name: opp?.Name ?? opp?.NameS ?? null,
    opponent_code: opp?.Org ?? null,
    opponent_score: opp?.Result ?? null,
    results,
  };
}

function attach(items: any[], results: any[]) {
  const byKey = new Map<string, any[]>();
  for (const r of results) {
    const k = `${r.sport_code}|${r.res_code}`;
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  return items.map((i) => shapeItem(i, byKey.get(`${i.sport_code}|${i.res_code}`) ?? []));
}

async function resultsFor(admin: any, items: any[]) {
  const codes = items.map((i) => i.res_code);
  if (!codes.length) return [];
  const { data } = await admin.from("india_results").select(RESULT_COLS).in("res_code", codes);
  return data ?? [];
}

/** Adds the sport name and the canonical readable path to shaped items. */
function named(items: any[], names: Map<string, string>) {
  return items.map((i) => {
    const sport = names.get(i.sport_code) ?? i.sport_code;
    return { ...i, sport, path: matchPath({ ...i, sport }) };
  });
}

/** Canonical match path for a raw schedule_items row. */
function pathOfRow(row: any, names: Map<string, string>) {
  const { india, opp } = sides(row);
  const sport = names.get(row.sport_code) ?? row.sport_code;
  return matchPath({
    ...row,
    sport,
    india_name: india?.Name ?? null,
    opponent_name: opp?.Name ?? opp?.NameS ?? null,
  });
}

/* --------------------------------- handlers -------------------------------- */

async function sportsMap(admin: any) {
  const { data } = await admin.from("sports").select("code,name");
  return new Map<string, string>((data ?? []).map((s: any) => [s.code, s.name ?? s.code]));
}

async function asOf(admin: any) {
  const { data } = await admin
    .from("fetch_log")
    .select("finished_at")
    .eq("ok", true)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1);
  return data?.[0]?.finished_at ?? null;
}

async function handleToday(admin: any, url: URL) {
  const zone = zoneOf(url);
  const date = param(url, "date") ?? zone.today;
  const nowIso = new Date().toISOString();
  const yesterday = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const [names, stamp, standing, dayItems, futureItems] = await Promise.all([
    sportsMap(admin),
    asOf(admin),
    admin
      .from("medal_standings")
      .select("gold,silver,bronze,total,rank")
      .eq("org_code", "IND")
      .maybeSingle(),
    admin
      .from("schedule_items")
      .select(ITEM_COLS)
      .eq("has_india", true)
      .eq(zone.col, date)
      .order("start_time", { ascending: true }),
    admin
      .from("schedule_items")
      .select(ITEM_COLS)
      .eq("has_india", true)
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(120),
  ]);

  const rows = dayItems.data ?? [];
  const futureRows = (futureItems.data ?? []).filter(
    (row: any) => !FINISHED.includes(String(row.status ?? "").toUpperCase()) && !row.is_live,
  );
  const nextRows = futureRows.slice(0, 30);
  const [results, nextResults] = await Promise.all([resultsFor(admin, rows), resultsFor(admin, nextRows)]);
  const items = named(attach(rows, results), names);

  const live = items.filter((i) => i.is_live);
  let finished = items.filter((i) => !i.is_live && i.is_finished);
  let resultsDay: "today" | "yesterday" = "today";
  if (!finished.length) {
    const { data: yesterdayRows } = await admin
      .from("schedule_items")
      .select(ITEM_COLS)
      .eq("has_india", true)
      .eq(zone.col, yesterday)
      .order("start_time", { ascending: true });
    const yr = yesterdayRows ?? [];
    finished = named(attach(yr, await resultsFor(admin, yr)), names).filter((i) => i.is_finished);
    resultsDay = "yesterday";
  }

  const next = named(attach(nextRows, nextResults), names);
  const nextGroupsMap = new Map<string, any[]>();
  for (const item of next) {
    const itemDate = item[zone.col] ?? date;
    const group = nextGroupsMap.get(itemDate) ?? [];
    group.push(item);
    nextGroupsMap.set(itemDate, group);
  }
  const tomorrow = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const next_groups = [...nextGroupsMap.entries()].map(([groupDate, groupItems]) => ({
    date: groupDate,
    label_key: groupDate === date ? "today" : groupDate === tomorrow ? "tomorrow" : "date",
    items: groupItems,
  }));

  const railMap = new Map<string, any>();
  for (const i of [...items, ...futureRows.map((r: any) => ({ ...r, sport: names.get(r.sport_code) ?? r.sport_code, is_live: false, is_finished: false }))]) {
    const prev = railMap.get(i.sport_code);
    const upcoming = !i.is_live && !i.is_finished && i.start_time > nowIso;
    const entry = {
      code: i.sport_code,
      name: i.sport,
      path: sportPath(i.sport, i.sport_code),
      live: !!i.is_live,
      next_start: upcoming ? (i.start_time ?? null) : null,
      next_date: upcoming ? (i[zone.col] ?? null) : null,
    };
    if (!prev) railMap.set(i.sport_code, entry);
    else
      railMap.set(i.sport_code, {
        ...prev,
        live: prev.live || !!i.is_live,
        next_start: prev.next_start ?? entry.next_start,
        next_date: prev.next_date ?? entry.next_date,
      });
  }
  const rail = [...railMap.values()].sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return String(a.next_start ?? "z").localeCompare(String(b.next_start ?? "z"));
  });

  const upNext = next[0] ?? null;

  return {
    date,
    as_of: stamp,
    medals: standing.data ?? { gold: 0, silver: 0, bronze: 0, total: 0, rank: null },
    counts: { live: live.length, next: next.length, results: finished.length },
    live,
    next,
    next_groups,
    results: finished.slice().reverse(),
    results_day: resultsDay,
    rail,
    up_next: upNext,
    next_in_seconds: upNext?.start_time ? Math.max(0, Math.round((Date.parse(upNext.start_time) - Date.now()) / 1000)) : null,
    total_sports: railMap.size,
  };
}

async function handleDay(admin: any, url: URL) {
  const zone = zoneOf(url);
  const date = param(url, "date") ?? zone.today;
  const all = param(url, "all") === "1";
  const offset = Number(param(url, "offset") ?? 0);
  let q = admin
    .from("schedule_items")
    .select(ITEM_COLS)
    .eq(zone.col, date)
    .order("start_time", { ascending: true });
  if (!all) q = q.eq("has_india", true);
  else q = q.range(offset, offset + 49);

  const [names, { data }, counts, indiaCountRes] = await Promise.all([
    sportsMap(admin),
    q,
    admin.from("schedule_items").select("has_india", { count: "exact", head: true }).eq(zone.col, date),
    admin
      .from("schedule_items")
      .select("res_code", { count: "exact", head: true })
      .eq(zone.col, date)
      .eq("has_india", true),
  ]);
  const rows = data ?? [];
  const results = await resultsFor(admin, rows.filter((r: any) => r.has_india));
  const items = named(attach(rows, results), names);
  const indiaCount = indiaCountRes.count;


  return {
    date,
    items,
    india_count: indiaCount ?? 0,
    total_count: counts.count ?? 0,
    has_more: all && rows.length === 50,
  };
}

async function handleDays(admin: any, url: URL) {
  const zone = zoneOf(url);
  const { data } = await admin
    .from("schedule_items")
    .select("date_ist,date_jst")
    .eq("has_india", true)
    .limit(20000);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const key = r[zone.col];
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { counts };
}

async function handleSports(admin: any) {
  const today = istToday();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const [names, entries, itemsRes, medalsRes] = await Promise.all([
    sportsMap(admin),
    admin.from("india_entries").select("sport_code,reg,name,spoken_name").limit(20000),
    admin
      .from("schedule_items")
      .select("sport_code,start_ist,start_time,date_ist,is_live,status")
      .eq("has_india", true)
      .gte("date_ist", today)
      .order("start_time", { ascending: true })
      .limit(5000),
    admin.from("india_medals").select("sport_code"),
  ]);

  const athletes = new Map<string, Set<string>>();
  for (const e of entries.data ?? []) {
    if (!athletes.has(e.sport_code)) athletes.set(e.sport_code, new Set());
    athletes.get(e.sport_code)!.add(e.reg);
  }

  const state = new Map<string, { live: boolean; today?: string; tomorrowStart?: string; tomorrow: boolean; doneToday: boolean; nextDate?: string }>();
  for (const i of itemsRes.data ?? []) {
    const cur = state.get(i.sport_code) ?? { live: false, tomorrow: false, doneToday: false };
    const live = !!i.is_live || (i.status || "").toUpperCase() === "RUNNING";
    cur.live = cur.live || live;
    if (i.date_ist === today) {
      const finished = FINISHED.includes((i.status || "").toUpperCase());
      cur.doneToday = cur.doneToday || finished;
      if (!live && !finished && i.start_time && new Date(i.start_time).getTime() > Date.now() && (!cur.today || String(i.start_time) < cur.today)) cur.today = i.start_time ?? undefined;
    } else {
      cur.tomorrow = true;
      if (i.date_ist === tomorrow && i.start_time && (!cur.tomorrowStart || i.start_time < cur.tomorrowStart)) cur.tomorrowStart = i.start_time;
      if (!cur.nextDate || String(i.date_ist) < cur.nextDate) cur.nextDate = i.date_ist ?? undefined;
    }
    state.set(i.sport_code, cur);
  }
  const medalCounts = new Map<string, number>();
  for (const medal of medalsRes.data ?? []) medalCounts.set(medal.sport_code, (medalCounts.get(medal.sport_code) ?? 0) + 1);

  const list = [...athletes.keys()].map((code) => {
    const s = state.get(code);
    const name = names.get(code) ?? code;
    return {
      code,
      name,
      path: sportPath(name, code),
      athletes: athletes.get(code)?.size ?? 0,
      live: !!s?.live,
      today_start: s?.today ?? null,
      tomorrow: !!s?.tomorrow,
      tomorrow_start: s?.tomorrowStart ?? null,
      next_date: s?.nextDate ?? null,
      done_today: !!s?.doneToday && !s?.today && !s?.live,
      medals: medalCounts.get(code) ?? 0,
    };
  });

  list.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (!!a.today_start !== !!b.today_start) return a.today_start ? -1 : 1;
    if (a.today_start && b.today_start) return a.today_start.localeCompare(b.today_start);
    if (a.tomorrow !== b.tomorrow) return a.tomorrow ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { sports: list };
}

async function handleSport(admin: any, url: URL) {
  const raw = param(url, "code");
  if (!raw) return { error: "code required" };
  const names = await sportsMap(admin);
  let code: string | null = names.has(raw) ? raw : null;
  if (!code) {
    const wanted = sportSlug(raw);
    for (const [c, n] of names) if (sportSlug(n, c) === wanted) code = c;
  }
  if (!code) return { error: "sport not found" };
  const sportCode = code;
  const [itemsRes, squad] = await Promise.all([
    admin
      .from("schedule_items")
      .select(ITEM_COLS)
      .eq("has_india", true)
      .eq("sport_code", sportCode)
      .order("start_time", { ascending: true }),
    admin
      .from("india_entries")
      .select("reg,name,spoken_name,gender,event_name,type")
      .eq("sport_code", sportCode)
      .limit(2000),
  ]);
  const rows = itemsRes.data ?? [];
  const items = named(attach(rows, await resultsFor(admin, rows)), names);
  const regs = new Map<string, any>();
  for (const e of squad.data ?? []) if (!regs.has(e.reg)) regs.set(e.reg, e);
  const name = names.get(sportCode) ?? sportCode;

  return {
    code: sportCode,
    name,
    path: sportPath(name, sportCode),
    venue: items.find((i) => i.venue_name)?.venue_name ?? null,
    items,
    squad: [...regs.values()]
      .sort((a, b) => String(a.spoken_name ?? a.name).localeCompare(String(b.spoken_name ?? b.name)))
      .map((e) => ({ ...e, path: athletePath(e.spoken_name ?? e.name, e.reg) })),
  };
}

async function handleMatch(admin: any, url: URL) {
  const id = param(url, "id");
  const sport = param(url, "sport");
  const res = param(url, "res");
  if (!id && (!sport || !res)) return { error: "id or sport and res required" };

  let rowQuery = admin.from("schedule_items").select(`${ITEM_COLS},raw,updated_at`);
  rowQuery = id
    ? rowQuery.eq("short_id", Number(id))
    : rowQuery.eq("sport_code", sport).eq("res_code", res);
  const [names, itemRes] = await Promise.all([sportsMap(admin), rowQuery.maybeSingle()]);
  if (!itemRes.data) return { error: "not found" };
  const row = itemRes.data;
  const sportCode = row.sport_code;
  const { data: resultRows } = await admin
    .from("india_results")
    .select(RESULT_COLS)
    .eq("sport_code", sportCode)
    .eq("res_code", row.res_code);

  const raw = (row.raw ?? {}) as any;
  const sportName = names.get(sportCode) ?? sportCode;
  const shaped = shapeItem(row, resultRows ?? []);
  const item = {
    ...shaped,
    sport: sportName,
    path: matchPath({ ...shaped, sport: sportName }),
    updated_at: row.updated_at,
    result_raw: raw?.result ?? null,
  };

  let nextQuery = admin
    .from("schedule_items")
    .select(ITEM_COLS)
    .eq("has_india", true)
    .eq("sport_code", sportCode)
    .gt("start_time", new Date().toISOString());
  if (row.event_code) nextQuery = nextQuery.eq("event_code", row.event_code);
  const { data: nextRows } = await nextQuery.order("start_time", { ascending: true }).limit(3);

  return { item, next: named(attach(nextRows ?? [], []), names) };
}

async function handleMedals(admin: any) {
  const [standings, medals, stamp] = await Promise.all([
    admin
      .from("medal_standings")
      .select("org_code,org_name,rank,gold,silver,bronze,total")
      .order("total", { ascending: false })
      .limit(100),
    admin
      .from("india_medals")
      .select(
        "sport_code,sport_name,event_code,event_name,competitor_key,reg,medal,athlete_or_team,spoken_name,members,members_spoken,date_ist,won_at,res_code",
      )
      .order("won_at", { ascending: false }),
    asOf(admin),
  ]);
  const rows = (standings.data ?? []).slice().sort((a: any, b: any) => {
    const ra = Number(a.rank ?? 999);
    const rb = Number(b.rank ?? 999);
    if (ra !== rb) return ra - rb;
    return b.gold - a.gold;
  });

  const medalRows = medals.data ?? [];
  const resCodes = medalRows.map((m: any) => m.res_code).filter(Boolean);
  const pathByRes = new Map<string, string | null>();
  if (resCodes.length) {
    const names = await sportsMap(admin);
    const { data: items } = await admin
      .from("schedule_items")
      .select("sport_code,res_code,short_id,event_name,phase_name,unit_name,is_h2h,home,away")
      .in("res_code", resCodes);
    for (const row of items ?? []) pathByRes.set(row.res_code, pathOfRow(row, names));
  }

  return {
    standings: rows,
    india: rows.find((r: any) => r.org_code === "IND") ?? null,
    medals: medalRows.map((m: any) => ({
      ...m,
      path: m.res_code ? (pathByRes.get(m.res_code) ?? null) : null,
      athlete_path: m.reg ? athletePath(m.spoken_name ?? m.athlete_or_team, m.reg) : null,
    })),
    as_of: stamp,
  };
}

async function handleAthlete(admin: any, url: URL) {
  const reg = param(url, "reg");
  if (!reg) return { error: "reg required" };
  const [entries, names] = await Promise.all([
    admin
      .from("india_entries")
      .select("sport_code,sport_name,reg,name,spoken_name,gender,event_code,event_name,type")
      .eq("reg", reg),
    sportsMap(admin),
  ]);
  const rows = entries.data ?? [];
  if (!rows.length) return { error: "not found" };
  const name = rows[0].spoken_name || rows[0].name || reg;
  const sportCode = rows[0].sport_code;

  const [directResults, allMedals, eventItems] = await Promise.all([
    admin
      .from("india_results")
      .select(RESULT_COLS)
      .eq("competitor_key", reg)
      .order("start_time", { ascending: false })
      .limit(50),
    admin
      .from("india_medals")
      .select("sport_code,sport_name,event_code,event_name,reg,medal,members,members_spoken,date_ist,spoken_name"),
    admin
      .from("schedule_items")
      .select(ITEM_COLS)
      .eq("has_india", true)
      .eq("sport_code", sportCode)
      .order("start_time", { ascending: true })
      .limit(500),
  ]);

  const eventCodes = new Set(rows.map((r: any) => r.event_code));
  const matchingItems = (eventItems.data ?? []).filter((i: any) => eventCodes.has(i.event_code));
  const teamResCodes = matchingItems.map((i: any) => i.res_code);
  const { data: teamResults } = teamResCodes.length
    ? await admin.from("india_results").select(RESULT_COLS).in("res_code", teamResCodes).eq("is_team", true)
    : { data: [] };
  const itemByResult = new Map(matchingItems.map((i: any) => [i.res_code, i]));
  const mergedResults = [...(directResults.data ?? []), ...(teamResults ?? [])]
    .filter((r: any, index: number, all: any[]) => all.findIndex((x) => x.sport_code === r.sport_code && x.res_code === r.res_code && x.competitor_key === r.competitor_key) === index)
    .map((r: any) => {
      const item = itemByResult.get(r.res_code) as any;
      return { ...r, event_name: item?.event_name ?? null, phase_name: item?.phase_name ?? null, date_ist: item?.date_ist ?? null, sport: names.get(r.sport_code) ?? r.sport_code };
    })
    .sort((a: any, b: any) => String(b.start_time ?? "").localeCompare(String(a.start_time ?? "")));
  const memberMatches = (value: any): boolean => {
    if (Array.isArray(value)) return value.some(memberMatches);
    if (!value || typeof value !== "object") return false;
    if (String(value.Reg ?? value.reg ?? "") === reg) return true;
    return Object.values(value).some(memberMatches);
  };
  const medals = (allMedals.data ?? []).filter((m: any) => m.reg === reg || memberMatches(m.members));
  const upcoming = named(
    attach(
      matchingItems.filter((i: any) => i.start_time && i.start_time > new Date().toISOString()),
      [],
    ),
    names,
  );

  const nowIso2 = new Date().toISOString();
  const resultByRes = new Map<string, any>();
  for (const r of mergedResults) if (!resultByRes.has(r.res_code)) resultByRes.set(r.res_code, r);
  const entryDetails = rows.map((e: any) => {
    const its = matchingItems.filter((i: any) => i.event_code === e.event_code);
    const next = its.find((i: any) => i.start_time && i.start_time > nowIso2) ?? null;
    const finished = [...its]
      .reverse()
      .find((i: any) => FINISHED.includes(String(i.status ?? "").toUpperCase())) ?? null;
    return {
      ...e,
      next_start_time: next?.start_time ?? null,
      next_res_code: next?.res_code ?? null,
      next_path: next ? pathOfRow(next, names) : null,
      finished_res_code: finished?.res_code ?? null,
      finished_path: finished ? pathOfRow(finished, names) : null,
      result: finished ? (resultByRes.get(finished.res_code) ?? null) : null,
    };
  });

  const sportName = names.get(sportCode) ?? rows[0].sport_name ?? sportCode;
  return {
    reg,
    name,
    path: athletePath(name, reg),
    sport_code: sportCode,
    sport: sportName,
    sport_path: sportPath(sportName, sportCode),
    entries: entryDetails,
    results: mergedResults,
    medals,
    upcoming,
  };
}

async function handleSearch(admin: any) {
  const [names, entries] = await Promise.all([
    sportsMap(admin),
    admin
      .from("india_entries")
      .select("reg,name,spoken_name,sport_code,event_code,event_name,type")
      .limit(20000),
  ]);
  const byReg = new Map<string, any>();
  const eventMap = new Map<string, any>();
  for (const e of entries.data ?? []) {
    const prev = byReg.get(e.reg);
    if (prev) prev.events += 1;
    else
      byReg.set(e.reg, {
        reg: e.reg,
        name: e.spoken_name || e.name || e.reg,
        raw_name: e.name ?? null,
        sport_code: e.sport_code,
        sport: names.get(e.sport_code) ?? e.sport_code,
        path: athletePath(e.spoken_name || e.name, e.reg),
        events: 1,
      });
    if (e.event_code) {
      const key = `${e.sport_code}|${e.event_code}`;
      if (!eventMap.has(key))
        eventMap.set(key, {
          sport_code: e.sport_code,
          sport: names.get(e.sport_code) ?? e.sport_code,
          path: sportPath(names.get(e.sport_code), e.sport_code),
          event_code: e.event_code,
          event_name: e.event_name ?? e.event_code,
        });
    }
  }
  return {
    sports: [...names.entries()].map(([code, name]) => ({ code, name, path: sportPath(name, code) })),
    athletes: [...byReg.values()],
    events: [...eventMap.values()],
  };
}

/* ---------------------------------- route ---------------------------------- */

export const Route = createFileRoute("/api/public/app/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async ({ request, params }) => {
        const started = Date.now();
        const url = new URL(request.url);
        const endpoint = String((params as any)._splat ?? "").replace(/^\/+|\/+$/g, "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cacheable: Record<string, number> = { today: 20000, sports: 20000, day: 20000, days: 20000, search: 60000 };
        const cacheKey = `${endpoint}?${url.searchParams.toString()}`;
        try {
          let data: any = cacheable[endpoint] ? cacheRead(cacheKey) : null;
          const cached = data !== null;
          if (!data)
          switch (endpoint) {
            case "today":
              data = await handleToday(supabaseAdmin, url);
              break;
            case "day":
              data = await handleDay(supabaseAdmin, url);
              break;
            case "days":
              data = await handleDays(supabaseAdmin, url);
              break;
            case "sports":
              data = await handleSports(supabaseAdmin);
              break;
            case "sport":
              data = await handleSport(supabaseAdmin, url);
              break;
            case "match":
              data = await handleMatch(supabaseAdmin, url);
              break;
            case "medals":
              data = await handleMedals(supabaseAdmin);
              break;
            case "athlete":
              data = await handleAthlete(supabaseAdmin, url);
              break;
            case "search":
              data = await handleSearch(supabaseAdmin);
              break;
            default:
              return Response.json(
                { ok: false, error: `unknown endpoint: ${endpoint}` },
                { status: 404, headers: JSON_HEADERS },
              );
          }
          const live =
            (endpoint === "today" && Array.isArray(data?.live) && data.live.length > 0) ||
            (endpoint === "match" && !!data?.item?.is_live);
          const maxAge = live ? 15 : 30;
          const ttl = cacheable[endpoint];
          if (ttl && !cached && !data?.error) cacheWrite(cacheKey, data, live ? 15000 : ttl);
          return Response.json(
            { ok: true, took_ms: Date.now() - started, cached, ...data },
            {
              headers: {
                ...JSON_HEADERS,
                "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
              },
            },
          );
        } catch (e: any) {
          return Response.json(
            { ok: false, error: String(e?.message ?? e) },
            { status: 500, headers: JSON_HEADERS },
          );
        }
      },
    },
  },
});
