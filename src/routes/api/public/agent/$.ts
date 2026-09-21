import { createFileRoute } from "@tanstack/react-router";
import {
  buildSummary,
  cleanPhase,
  joinNames,
  spokenDate,
  spokenName,
  spokenTime,
  todayInIst,
  whenPhrase,
} from "@/server/feed";
import { getSql } from "@/lib/pg.server";
import { getAgentKey } from "@/lib/secrets.server";

type Sql = ReturnType<typeof getSql>;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store",
};

const FINISHED = ["OFFICIAL", "PROVISIONAL", "UNOFFICIAL"];
const MAX_WORDS = 80;

/* ------------------------------ sport matching ----------------------------- */

const SPORT_ALIASES: Record<string, string> = {
  tt: "table tennis",
  "ping pong": "table tennis",
  pingpong: "table tennis",
  rifle: "shooting",
  pistol: "shooting",
  shotgun: "shooting",
  trap: "shooting",
  track: "athletics",
  "track and field": "athletics",
  running: "athletics",
  soccer: "football",
  swim: "swimming",
  swimming: "swimming",
  hockey: "hockey",
  "field hockey": "hockey",
  badminton: "badminton",
  wrestling: "wrestling",
  boxing: "boxing",
  archery: "archery",
  kabaddi: "kabaddi",
  cricket: "cricket",
  chess: "chess",
  squash: "squash",
  tennis: "tennis",
  "lawn tennis": "tennis",
  judo: "judo",
  mma: "mixed martial arts",
  athletics: "athletics",
};

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function matchSports(query: string | null, sports: { code: string; name: string }[]) {
  if (!query) return null;
  const q0 = normalize(query);
  const q = SPORT_ALIASES[q0] ?? q0;
  const direct = sports.filter((s) => {
    const name = normalize(s.name || "");
    return s.code.toLowerCase() === q0 || name === q || name.includes(q);
  });
  if (direct.length) return direct;
  // last resort: the query spells out more than the sport name ("lawn tennis")
  return sports.filter((s) => {
    const name = normalize(s.name || "");
    return !!name && q.includes(name);
  });
}

/* --------------------------------- speech --------------------------------- */

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Joins whole sentences, never cutting one in half. */
function joinSentences(sentences: string[], maxWords = MAX_WORDS) {
  const out: string[] = [];
  let used = 0;
  for (const s of sentences) {
    const t = (s || "").trim();
    if (!t) continue;
    const w = wordCount(t);
    if (out.length && used + w > maxWords) break;
    out.push(t);
    used += w;
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Lead sentence plus as many whole item sentences as fit, then "and N more". */
function speakList(
  lines: string[],
  lead: string,
  tailHint = true,
  maxWords = MAX_WORDS,
  extraRest = 0,
) {
  const clean = lines.filter(Boolean).map((l) => l.trim());
  if (!clean.length && !extraRest) return lead;
  const out = [lead];
  let used = wordCount(lead);
  let i = 0;
  for (; i < clean.length; i++) {
    const sentence = clean[i] ?? "";
    const w = wordCount(sentence);
    const tailBudget = i < clean.length - 1 ? 12 : 0;
    if (used + w + tailBudget > maxWords) break;
    out.push(sentence);
    used += w;
  }
  const rest = clean.length - i + extraRest;
  if (rest > 0) {
    out.push(`And ${rest} more.`);
    if (tailHint) out.push("Ask me about a specific sport for details.");
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function numberWord(n: number) {
  return (
    ["zero", "one", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] ??
    String(n)
  );
}

function minutesAgo(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function resolveDate(param: string | null): string {
  const v = (param || "today").toLowerCase();
  if (v === "today" || v === "") return todayInIst(0);
  if (v === "tomorrow") return todayInIst(1);
  if (v === "yesterday") return todayInIst(-1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return todayInIst(0);
}

const LIVE_STATUSES = ["RUNNING", "LIVE"];

function isFinishedItem(r: any) {
  return FINISHED.includes((r.status || "").toUpperCase());
}
function isLiveItem(r: any) {
  return !!r.is_live || LIVE_STATUSES.includes((r.status || "").toUpperCase());
}

/**
 * One spoken sentence for a schedule item, merging several Indian entrants in
 * the same item into a single sentence. Times are relative ("today at ...").
 */
function itemSummary(item: any, results: any[], sportName: string) {
  const rows = results ?? [];
  const finished = isFinishedItem(item);
  if (finished && rows.length === 1 && rows[0]?.spoken_summary_en) {
    return rows[0].spoken_summary_en;
  }
  const base = {
    sport_code: item.sport_code,
    sport_name: sportName,
    event_name: item.event_name,
    phase_name: item.phase_name,
    start_ist: item.start_ist,
    start_time: item.start_time,
    status: item.status,
    is_live: item.is_live,
    is_h2h: item.is_h2h,
    medal_flag: item.medal_flag,
  };
  const when = finished ? "none" : "relative";

  const individuals = rows.filter((r) => r && r.is_team === false);
  if (!finished && !item.is_h2h && individuals.length > 1) {
    const names = individuals.map((r) => r.spoken_name || spokenName(r.athlete_or_team));
    const subject = `${numberWord(individuals.length)} Indians, ${joinNames(names)},`;
    return buildSummary(base, individuals[0], { when, subject });
  }
  return buildSummary(base, rows[0] ?? null, { when: when as any });
}

/* --------------------------------- handler -------------------------------- */

type Env = {
  sql: Sql;
  sports: { code: string; name: string }[];
  sportName: (code: string) => string;
  asOf: string | null;
  url: URL;
  param: (name: string) => string | null;
};

// Column list shared by every `schedule_items` read below. `start_time` and
// `date_ist` are timestamptz/date columns; they are wrapped in `to_json(...)`
// so postgres.js hands back the same ISO-8601 string Postgres's own JSON
// serialization produces (matching this API's existing JSON contract),
// instead of a JS Date object.
const ITEM_SELECT =
  "sport_code,res_code,event_code,event_name,phase_name,start_ist,to_json(start_time) as start_time,to_json(date_ist) as date_ist,status,is_live,is_h2h,medal_flag,venue_name,home,away,raw";

function sideMembers(side: any): string[] {
  if (!side || typeof side !== "object") return [];
  const members = Array.isArray(side.Members) ? side.Members : Array.isArray(side.members) ? side.members : [];
  return members.map((m: any) => spokenName(m?.Name ?? m?.name)).filter(Boolean);
}

function playerSentence(item: any): string {
  const raw = item?.raw?.result ?? item?.raw ?? null;
  const liveRubber = (Array.isArray(raw?.SubUnits) ? raw.SubUnits : []).find((u: any) => isLiveItem(u?.Info ?? u));
  if (liveRubber) {
    const competitors = Array.isArray(liveRubber?.Competitors) ? liveRubber.Competitors : [];
    const indian = competitors.find((c: any) => c?.Org === "IND");
    const opponent = competitors.find((c: any) => c?.Org && c.Org !== "IND");
    const indianName = spokenName(indian?.Name);
    const opponentName = spokenName(opponent?.Name);
    if (indianName && opponentName) return `Right now ${indianName} is playing ${opponentName}.`;
  }
  const indianSide = item?.home?.Org === "IND" ? item.home : item?.away?.Org === "IND" ? item.away : null;
  let names = sideMembers(indianSide);
  if (!names.length) {
    const competitors = Array.isArray(raw?.Competitors) ? raw.Competitors : [];
    const indian = competitors.find((c: any) => c?.Org === "IND");
    names = sideMembers(indian);
  }
  return names.length ? `Playing for India: ${joinNames(names.slice(0, 6))}.` : "";
}

function withPlayers(summary: string, item: any, include: boolean) {
  const sentence = include ? playerSentence(item) : "";
  return sentence ? `${summary} ${sentence}` : summary;
}

async function resultsFor(sql: Sql, items: any[]) {
  const map = new Map<string, any[]>();
  if (!items.length) return map;
  const codes = [...new Set(items.map((i) => i.res_code))];
  const data: any[] = await sql`
    SELECT sport_code,res_code,competitor_key,athlete_or_team,spoken_name,is_team,opponent_name,opponent_country_name,india_score,opponent_score,outcome,rank,result_mark,qualified,irm,medal,status,spoken_summary_en
    FROM india_results
    WHERE res_code IN ${sql(codes)}
  `;
  for (const r of data) {
    const key = `${r.sport_code}|${r.res_code}`;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return map;
}

async function indiaToday(env: Env) {
  const dateParam = env.param("date");
  const date = resolveDate(dateParam);
  const today = todayInIst(0);
  if (date < today) return indiaResults(env, date);

  const sportFilter = matchSports(env.param("sport"), env.sports);
  const sportCodes = sportFilter?.length ? sportFilter.map((s) => s.code) : null;
  const sql = env.sql;

  const rows: any[] = await sql`
    SELECT ${sql.unsafe(ITEM_SELECT)}
    FROM schedule_items
    WHERE has_india = true AND date_ist = ${date}
    ${sportCodes ? sql`AND sport_code IN ${sql(sportCodes)}` : sql``}
    ORDER BY start_ist ASC
    LIMIT 60
  `;

  if (!rows.length) {
    const entered: any[] = await sql`
      SELECT sport_code
      FROM schedule_items
      WHERE india_entered = true AND date_ist = ${date}
      ${sportCodes ? sql`AND sport_code IN ${sql(sportCodes)}` : sql``}
      LIMIT 200
    `;
    const sportsList = [...new Set(entered.map((r: any) => env.sportName(r.sport_code)))];
    const dayWord = date === today ? "today" : date === todayInIst(1) ? "tomorrow" : spokenDate(date);
    const answer = sportsList.length
      ? joinSentences([
          `No confirmed India matches are listed for ${dayWord} yet.`,
          `India has entries in ${sportsList.slice(0, 5).join(", ")}${
            sportsList.length > 5 ? ` and ${sportsList.length - 5} more sports` : ""
          }, but the draw is not published yet.`,
        ])
      : `Nothing is scheduled for India ${date === today ? "today" : `on ${spokenDate(date)}`}.`;
    return { answer, items: entered };
  }

  const resMap = await resultsFor(sql, rows);
  const line = (r: any) => withPlayers(
    itemSummary(r, resMap.get(`${r.sport_code}|${r.res_code}`) ?? [], env.sportName(r.sport_code)),
    r,
    !!sportFilter?.length,
  );

  const structured = rows.map((r: any) => ({
    sport: env.sportName(r.sport_code),
    event: r.event_name,
    phase: cleanPhase(r.event_name, r.phase_name),
    start_ist: r.start_ist,
    status: r.status,
    summary: line(r),
  }));

  if (date !== today) {
    const dayWord = date === todayInIst(1) ? "tomorrow" : `on ${spokenDate(date)}`;
    const lead = `India has ${rows.length} event${rows.length === 1 ? "" : "s"} ${dayWord}.`;
    const first = rows.slice(0, 4).map(line);
    return {
      answer: speakList(first, lead, false, MAX_WORDS, rows.length - first.length),
      items: structured,
    };
  }

  const live = rows.filter(isLiveItem);
  const finishedRows = rows.filter((r: any) => !isLiveItem(r) && isFinishedItem(r));
  const upcoming = rows.filter((r: any) => !isLiveItem(r) && !isFinishedItem(r));

  const lead = `India has ${rows.length} event${rows.length === 1 ? "" : "s"} today: ${
    finishedRows.length
  } finished, ${live.length} in progress and ${upcoming.length} still to come.`;

  const tail = finishedRows.length
    ? "Ask me for today's results to hear how the finished events went."
    : "";
  const sentences = [lead, ...live.map(line), ...upcoming.slice(0, 3).map(line)];
  const body = joinSentences(sentences);
  const withTail =
    tail && wordCount(body) + wordCount(tail) <= MAX_WORDS + 12 ? `${body} ${tail}` : body;

  return { answer: withTail, items: structured };
}

async function indiaLive(env: Env) {
  const sql = env.sql;
  const sportFilter = matchSports(env.param("sport"), env.sports);
  const sportCodes = sportFilter?.length ? sportFilter.map((s) => s.code) : null;

  const rows: any[] = await sql`
    SELECT ${sql.unsafe(ITEM_SELECT)}
    FROM schedule_items
    WHERE has_india = true AND (is_live = true OR status = 'RUNNING')
    ${sportCodes ? sql`AND sport_code IN ${sql(sportCodes)}` : sql``}
    ORDER BY start_time ASC
    LIMIT 25
  `;

  if (!rows.length) {
    const next: any[] = await sql`
      SELECT ${sql.unsafe(ITEM_SELECT)}
      FROM schedule_items
      WHERE has_india = true AND start_time > ${new Date().toISOString()}
      ORDER BY start_time ASC
      LIMIT 1
    `;
    const n = next?.[0];
    if (!n) return { answer: "No India event is live right now, and nothing more is scheduled.", items: [] };
    const resMap = await resultsFor(sql, [n]);
    const summary = withPlayers(itemSummary(
      n,
      resMap.get(`${n.sport_code}|${n.res_code}`) ?? [],
      env.sportName(n.sport_code),
    ), n, !!sportFilter?.length);
    return {
      answer: joinSentences(["No India event is live right now.", `Next up: ${summary}`]),
      items: [n],
    };
  }

  const resMap = await resultsFor(sql, rows);
  const lines = rows.map((r: any) => withPlayers(
    itemSummary(r, resMap.get(`${r.sport_code}|${r.res_code}`) ?? [], env.sportName(r.sport_code)),
    r,
    !!sportFilter?.length,
  ));
  const mins = minutesAgo(env.asOf);
  const lead = `India is in action in ${rows.length} event${rows.length === 1 ? "" : "s"} right now.`;
  const tail = mins !== null ? `This is as of ${mins} minute${mins === 1 ? "" : "s"} ago.` : "";
  const body = speakList(lines, lead, false, MAX_WORDS - (tail ? wordCount(tail) : 0));
  return {
    answer: [body, tail].filter(Boolean).join(" "),
    items: rows.map((r: any, i: number) => ({
      sport: env.sportName(r.sport_code),
      event: r.event_name,
      status: r.status,
      summary: lines[i],
    })),
  };
}

function athleteFilter(rows: any[], name: string | null) {
  if (!name) return rows;
  const q = normalize(name);
  return rows.filter((r) => {
    const a = normalize(r.athlete_or_team || "");
    const s = normalize(r.spoken_name || "");
    return a.includes(q) || s.includes(q) || q.includes(a);
  });
}

async function indiaResults(env: Env, forcedDate?: string) {
  const sql = env.sql;
  const sportFilter = matchSports(env.param("sport"), env.sports);
  const sportCodes = sportFilter?.length ? sportFilter.map((s) => s.code) : null;
  const dateParam = forcedDate ?? env.param("date");
  const athlete = env.param("athlete");

  const dateFilter = dateParam
    ? sql`AND start_time >= ${`${resolveDate(dateParam)}T00:00:00+05:30`} AND start_time <= ${`${resolveDate(dateParam)}T23:59:59+05:30`}`
    : sql`AND start_time >= ${new Date(Date.now() - 24 * 3600 * 1000).toISOString()}`;

  const data: any[] = await sql`
    SELECT sport_code,res_code,athlete_or_team,spoken_name,outcome,rank,medal,status,to_json(start_time) as start_time,spoken_summary_en
    FROM india_results
    WHERE status IN ${sql(FINISHED)}
    ${sportCodes ? sql`AND sport_code IN ${sql(sportCodes)}` : sql``}
    ${dateFilter}
    ORDER BY start_time DESC
    LIMIT 200
  `;
  const rows = athleteFilter(data, athlete).slice(0, 25);

  if (!rows.length) {
    return { answer: "I don't have any finished India results for that yet.", items: [] };
  }
  const scheduleMap = new Map<string, any>();
  if (sportFilter?.length && rows.length) {
    const scheduleRows: any[] = await sql`
      SELECT ${sql.unsafe(ITEM_SELECT)}
      FROM schedule_items
      WHERE res_code IN ${sql([...new Set(rows.map((r: any) => r.res_code))])}
    `;
    for (const item of scheduleRows) scheduleMap.set(`${item.sport_code}|${item.res_code}`, item);
  }
  const lines = rows.map((r: any) => withPlayers(r.spoken_summary_en ?? "", scheduleMap.get(`${r.sport_code}|${r.res_code}`), !!sportFilter?.length)).filter(Boolean);
  const dayLead =
    dateParam && resolveDate(dateParam) !== todayInIst(0)
      ? `Here are India's results from ${spokenDate(resolveDate(dateParam))}.`
      : `Here are India's latest results.`;
  return {
    answer: speakList(lines, dayLead),
    items: rows.map((r: any) => ({
      sport: env.sportName(r.sport_code),
      athlete: r.spoken_name || r.athlete_or_team,
      outcome: r.outcome,
      rank: r.rank,
      medal: r.medal,
      summary: r.spoken_summary_en,
    })),
  };
}

async function nextEvent(env: Env) {
  const sql = env.sql;
  const sportFilter = matchSports(env.param("sport"), env.sports);
  const sportCodes = sportFilter?.length ? sportFilter.map((s) => s.code) : null;
  const athlete = env.param("athlete");
  const nowIso = new Date().toISOString();

  let rows: any[] = await sql`
    SELECT ${sql.unsafe(ITEM_SELECT)}
    FROM schedule_items
    WHERE has_india = true AND start_time > ${nowIso}
    ${sportCodes ? sql`AND sport_code IN ${sql(sportCodes)}` : sql``}
    ORDER BY start_time ASC
    LIMIT 25
  `;

  if (athlete) {
    const q2 = normalize(athlete);
    const ent: any[] = await sql`SELECT sport_code,event_code,name,spoken_name FROM india_entries`;
    const events = new Set(
      ent
        .filter(
          (e: any) =>
            normalize(e.name || "").includes(q2) || normalize(e.spoken_name || "").includes(q2),
        )
        .map((e: any) => `${e.sport_code}|${e.event_code}`),
    );
    rows = rows.filter((r: any) => events.has(`${r.sport_code}|${r.event_code}`));
  }

  const item = rows[0];
  if (item) {
    const resMap = await resultsFor(sql, [item]);
    const summary = itemSummary(
      item,
      resMap.get(`${item.sport_code}|${item.res_code}`) ?? [],
      env.sportName(item.sport_code),
    );
    return { answer: joinSentences([`Next up for India: ${summary}`]), items: [item] };
  }

  // fall back to an entered event without a published start list
  const entered: any[] = await sql`
    SELECT ${sql.unsafe(ITEM_SELECT)}
    FROM schedule_items
    WHERE india_entered = true AND start_time > ${nowIso}
    ${sportCodes ? sql`AND sport_code IN ${sql(sportCodes)}` : sql``}
    ORDER BY start_time ASC
    LIMIT 1
  `;
  const e = entered?.[0];
  if (!e) return { answer: "I don't have an upcoming India event for that.", items: [] };
  return {
    answer: joinSentences([
      `The next ${env.sportName(e.sport_code)} session is ${e.event_name}, ${cleanPhase(
        e.event_name,
        e.phase_name,
      )} ${whenPhrase(e.start_ist, true)}.`,
      "India has entries in this event; the start list is not out yet.",
    ]),
    items: [e],
  };
}

async function medalTally(env: Env) {
  const sql = env.sql;
  const sportFilter = matchSports(env.param("sport"), env.sports);
  const country = (env.param("country") || "IND").toUpperCase();

  if (sportFilter?.length) {
    const rows: any[] = await sql`
      SELECT sport_code,medal,spoken_summary_en,to_json(won_at) as won_at
      FROM india_medals
      WHERE sport_code IN ${sql(sportFilter.map((s) => s.code))}
      ORDER BY won_at DESC
      LIMIT 25
    `;
    const g = rows.filter((r: any) => r.medal === "gold").length;
    const s = rows.filter((r: any) => r.medal === "silver").length;
    const b = rows.filter((r: any) => r.medal === "bronze").length;
    const sportLabel = sportFilter.map((x) => x.name).join(" and ");
    if (!rows.length)
      return { answer: `India has not won a medal in ${sportLabel} yet.`, items: [] };
    return {
      answer: speakList(
        rows.slice(0, 3).map((r: any) => r.spoken_summary_en),
        `In ${sportLabel}, India has ${g} gold, ${s} silver and ${b} bronze.`,
        false,
      ),
      items: rows,
    };
  }

  const [stRows, latest] = await Promise.all([
    sql`
      SELECT org_code,org_name,rank,gold,silver,bronze,total,to_json(updated_at) as updated_at
      FROM medal_standings WHERE org_code = ${country} LIMIT 1
    `,
    sql`
      SELECT medal,spoken_summary_en,to_json(won_at) as won_at
      FROM india_medals
      ORDER BY won_at DESC
      LIMIT 3
    `,
  ]);
  const st: any = stRows[0] ?? null;

  if (country !== "IND") {
    const answer = st
      ? `${st.org_name} has ${st.gold} gold, ${st.silver} silver and ${st.bronze} bronze, ${st.total} medals in all, ranked ${st.rank}.`
      : `I don't have a medal count for that country yet.`;
    return { answer, items: st ? [st] : [] };
  }

  const g = st?.gold ?? 0;
  const s = st?.silver ?? 0;
  const b = st?.bronze ?? 0;
  const total = st?.total ?? 0;
  const head = total
    ? `India has ${g} gold, ${s} silver and ${b} bronze, ${total} medal${
        total === 1 ? "" : "s"
      } in all, ranked ${st?.rank ?? "unranked"}.`
    : "India has not won a medal yet.";
  return {
    answer: speakList((latest ?? []).map((m: any) => m.spoken_summary_en), head, false),
    items: latest ?? [],
  };
}

async function schedule(env: Env) {
  const sql = env.sql;
  const sportFilter = matchSports(env.param("sport"), env.sports);
  const date = resolveDate(env.param("date"));
  if (!sportFilter?.length)
    return { answer: "Which sport would you like the schedule for?", items: [] };

  const rows: any[] = await sql`
    SELECT ${sql.unsafe(ITEM_SELECT)}
    FROM schedule_items
    WHERE sport_code IN ${sql(sportFilter.map((s) => s.code))} AND date_ist = ${date}
    ORDER BY start_ist ASC
    LIMIT 500
  `;
  const sportLabel = sportFilter.map((s) => s.name).join(" and ");
  const dayWord =
    date === todayInIst(0) ? "today" : date === todayInIst(1) ? "tomorrow" : `on ${spokenDate(date)}`;
  if (!rows.length) return { answer: `There is no ${sportLabel} ${dayWord}.`, items: [] };

  const groups = new Map<string, any>();
  for (const r of rows) {
    const key = r.event_name || "Event";
    const g = groups.get(key) ?? {
      event: key,
      sessions: 0,
      first_start_ist: r.start_ist,
      medal_event: false,
    };
    g.sessions++;
    if (!g.first_start_ist || (r.start_ist && r.start_ist < g.first_start_ist))
      g.first_start_ist = r.start_ist;
    if (r.medal_flag === "1") g.medal_event = true;
    groups.set(key, g);
  }
  const items = [...groups.values()].slice(0, 25);
  const lines = items.map(
    (g) =>
      `${g.event} starts at ${spokenTime(g.first_start_ist)} India time with ${g.sessions} session${
        g.sessions === 1 ? "" : "s"
      }${g.medal_event ? ", a gold medal event" : ""}.`,
  );
  const roster = rows.map((r: any) => playerSentence(r)).find(Boolean) ?? "";
  return {
    answer: joinSentences([speakList(lines, `${sportLabel} ${dayWord}:`), roster]),
    items,
  };
}

async function athlete(env: Env) {
  const sql = env.sql;
  const name = env.param("name") || env.param("athlete");
  if (!name) return { answer: "Which athlete would you like to know about?", items: [] };
  const q = normalize(name);

  const [entries, results]: [any[], any[]] = await Promise.all([
    sql`
      SELECT sport_code,reg,event_code,name,spoken_name,gender,type,event_name,is_member,sport_name,to_json(updated_at) as updated_at
      FROM india_entries LIMIT 2000
    `,
    sql`
      SELECT sport_code,athlete_or_team,spoken_name,spoken_summary_en,to_json(start_time) as start_time,status
      FROM india_results
      ORDER BY start_time DESC
      LIMIT 500
    `,
  ]);

  const mine = entries.filter(
    (e: any) => normalize(e.name || "").includes(q) || normalize(e.spoken_name || "").includes(q),
  );
  if (!mine.length)
    return { answer: `I could not find an Indian athlete called ${name}.`, items: [] };

  const who = mine[0].spoken_name || spokenName(mine[0].name);
  const events = [...new Set(mine.map((e: any) => `${e.sport_name || e.sport_code} ${e.event_name}`))];
  const theirs = athleteFilter(results, name).slice(0, 5);

  const nowIso = new Date().toISOString();
  const eventKeys = new Set(mine.map((e: any) => `${e.sport_code}|${e.event_code}`));
  const upcoming: any[] = await sql`
    SELECT ${sql.unsafe(ITEM_SELECT)}
    FROM schedule_items
    WHERE sport_code IN ${sql([...new Set(mine.map((e: any) => e.sport_code))])} AND start_time > ${nowIso}
    ORDER BY start_time ASC
    LIMIT 200
  `;
  const next = upcoming.find((r: any) => eventKeys.has(`${r.sport_code}|${r.event_code}`));

  const parts = [
    `${who} is entered in ${events.slice(0, 3).join(", ")}${
      events.length > 3 ? ` and ${events.length - 3} more events` : ""
    }.`,
  ];
  if (theirs.length) parts.push(theirs[0].spoken_summary_en);
  if (next)
    parts.push(
      `Next: ${next.event_name}, ${cleanPhase(next.event_name, next.phase_name)} ${whenPhrase(
        next.start_ist,
        true,
      )}.`,
    );
  return {
    answer: joinSentences(parts.filter(Boolean)),
    items: { entries: mine.slice(0, 25), results: theirs, next: next ?? null },
  };
}

/* ----------------------------- cached lookups ----------------------------- */

type Cached<T> = { value: T; at: number };
const CACHE_MS = 60_000;
let asOfCache: Cached<string | null> | null = null;
let sportsCache: Cached<{ code: string; name: string }[]> | null = null;

/** Reads the agent auth key from the environment, returning null (never
 *  throwing) so a missing key simply results in an unauthorized response. */
function agentKey(): string | null {
  try {
    return getAgentKey();
  } catch {
    return null;
  }
}

async function cachedAsOf(sql: Sql) {
  if (asOfCache && Date.now() - asOfCache.at < CACHE_MS) return asOfCache.value;
  const data: any[] = await sql`
    SELECT to_json(finished_at) as finished_at
    FROM fetch_log
    WHERE ok = true
    ORDER BY id DESC
    LIMIT 1
  `;
  asOfCache = { value: data?.[0]?.finished_at ?? null, at: Date.now() };
  return asOfCache.value;
}

async function cachedSports(sql: Sql): Promise<{ code: string; name: string }[]> {
  if (sportsCache && Date.now() - sportsCache.at < CACHE_MS) return sportsCache.value;
  const data: any[] = await sql`SELECT code, name FROM sports`;
  const sports = data.map((s: any) => ({ code: s.code, name: s.name || s.code }));
  sportsCache = { value: sports, at: Date.now() };
  return sports;
}

/* --------------------------------- routing -------------------------------- */

const INTENTS: Record<string, (env: Env) => Promise<{ answer: string; items: any }>> = {
  today: indiaToday,
  "india-today": indiaToday,
  live: indiaLive,
  "india-live": indiaLive,
  results: (env) => indiaResults(env),
  "india-results": (env) => indiaResults(env),
  next: nextEvent,
  "next-event": nextEvent,
  medals: medalTally,
  "medal-tally": medalTally,
  schedule,
  athlete,
};

async function handle(request: Request, splat: string) {
  const started = Date.now();
  const url = new URL(request.url);
  const param = (name: string) => {
    const v = url.searchParams.get(name);
    return v && v.trim() ? v.trim() : null;
  };
  const sql = getSql();

  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const supplied = request.headers.get("x-api-key") || param("key") || bearer || "";
  const expected = agentKey();
  if (!expected || supplied !== expected) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: JSON_HEADERS },
    );
  }

  const [sports, asOf] = await Promise.all([
    cachedSports(sql),
    cachedAsOf(sql),
  ]);
  const nameMap = new Map<string, string>(sports.map((s) => [s.code, s.name]));
  const env: Env = {
    sql,
    sports,
    sportName: (c: string) => nameMap.get(c) ?? c,
    asOf,
    url,
    param,
  };

  const route = splat.replace(/^\/+|\/+$/g, "");
  const intent = route === "ask" ? (param("intent") || "today").toLowerCase() : route;
  const fn = INTENTS[intent] ?? (route === "ask" ? indiaToday : null);

  if (!fn) {
    return Response.json(
      { ok: false, error: `unknown endpoint: ${route}` },
      { status: 404, headers: JSON_HEADERS },
    );
  }

  let out: { answer: string; items: any };
  try {
    out = await fn(env);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: JSON_HEADERS },
    );
  }

  return Response.json(
    {
      ok: true,
      answer: out.answer,
      items: Array.isArray(out.items) ? out.items.slice(0, 25) : out.items,
      as_of: env.asOf,
      took_ms: Date.now() - started,
    },
    { headers: JSON_HEADERS },
  );
}

export const Route = createFileRoute("/api/public/agent/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async ({ request, params }) => handle(request, (params as any)._splat ?? ""),
    },
  },
});
