// Server-only helpers for the Asian Games 2026 results feed.

export const FEED_BASE = "https://back.results.asiangames2026.org/s/AG2026/en/";

export const FEED_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://results.asiangames2026.org",
  Referer: "https://results.asiangames2026.org/",
};

/** The feed returns raw deflate bytes served as latin-1-ish text. */
export async function decodeFeed(res: Response): Promise<any> {
  const s = await res.text();
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
  const stream = new Blob([u]).stream().pipeThrough(new DecompressionStream("deflate"));
  return JSON.parse(await new Response(stream).text());
}

export async function fetchFeedPath(path: string, timeoutMs = 15000): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(FEED_BASE + path, {
        headers: FEED_HEADERS,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await decodeFeed(res);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function asItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.Items ?? data?.items ?? [];
}

/* ------------------------------ time helpers ------------------------------ */

const MIN = 60 * 1000;

function shift(d: Date, offsetMinutes: number) {
  return new Date(d.getTime() + offsetMinutes * MIN);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD HH:MM" in the given UTC offset (minutes). */
export function formatOffset(d: Date, offsetMinutes: number) {
  const s = shift(d, offsetMinutes);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())} ${pad(
    s.getUTCHours(),
  )}:${pad(s.getUTCMinutes())}`;
}

export const JST_OFFSET = 9 * 60;
export const IST_OFFSET = 5 * 60 + 30;

export function todayInJst(offsetDays = 0) {
  const now = shift(new Date(), JST_OFFSET + offsetDays * 24 * 60);
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

export function todayInIst(offsetDays = 0) {
  const now = shift(new Date(), IST_OFFSET + offsetDays * 24 * 60);
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/**
 * The feed sometimes carries a wrong UTC offset (e.g. "-09:00").
 * Every venue is in Japan, so the wall-clock part is always Japan time.
 */
export function parseFeedTime(raw: string | null | undefined) {
  const empty = {
    start_time: null as string | null,
    start_jst: null as string | null,
    start_ist: null as string | null,
    date_jst: null as string | null,
    date_ist: null as string | null,
  };
  if (!raw) return empty;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!m) return empty;
  const [, y, mo, d, h, mi, s] = m;
  const utcMs =
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)) -
    JST_OFFSET * MIN;
  const dt = new Date(utcMs);
  const startJst = formatOffset(dt, JST_OFFSET);
  const startIst = formatOffset(dt, IST_OFFSET);
  return {
    start_time: dt.toISOString(),
    start_jst: startJst,
    start_ist: startIst,
    date_jst: startJst.split(" ")[0] ?? null,
    date_ist: startIst.split(" ")[0] ?? null,
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "21 September" from "YYYY-MM-DD ..." */
export function spokenDate(istString: string | null | undefined) {
  if (!istString) return "";
  const datePart = istString.split(" ")[0] ?? "";
  const parts = datePart.split("-").map(Number);
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return `${d} ${MONTHS[m - 1]}`;
}

/** "7:15 PM" from "YYYY-MM-DD HH:MM" */
export function spokenTime(istString: string | null | undefined) {
  if (!istString) return "";
  const time = istString.split(" ")[1];
  if (!time) return "";
  const parts = time.split(":").map(Number);
  let h = parts[0] ?? 0;
  const mm = parts[1] ?? 0;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad(mm)} ${ampm}`;
}

/** Cricket scores arrive as "10 - 0" meaning runs - wickets. */
export function spokenScore(x: string | null | undefined, sportCode?: string | null) {
  const v = (x ?? "").trim();
  if (!v) return "";
  if (["CRI", "CKT"].includes((sportCode || "").toUpperCase())) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(v);
    if (m) return `${m[1]} for ${m[2]}`;
  }
  return v;
}

export function ordinal(n: number) {
  const words: Record<number, string> = {
    1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
    6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
  };
  if (words[n]) return words[n]!;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

/* ------------------------------ name helpers ------------------------------ */

function titleCase(word: string) {
  return word
    .split(/([-'])/)
    .map((p) =>
      /[-']/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    )
    .join("");
}

/**
 * Feed names are "SURNAME Given Names" (surname fully uppercase).
 * Produces a speech-friendly "Given Names Surname".
 */
export function spokenName(name: string | null | undefined): string {
  const raw = (name || "").replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  // Doubles pairs arrive as "SURNAME Given / SURNAME Given"
  if (raw.includes("/")) {
    return joinNames(
      raw
        .split("/")
        .map((p) => spokenName(p.trim()))
        .filter(Boolean),
    );
  }

  const tokens = raw.split(" ").filter(Boolean);
  if (!tokens.length) return "";
  const isUpper = (t: string) => t === t.toUpperCase() && /[A-Z]/.test(t);
  const surname: string[] = [];
  const given: string[] = [];
  let stillSurname = true;
  for (const t of tokens) {
    if (stillSurname && isUpper(t)) surname.push(t);
    else {
      stillSurname = false;
      given.push(t);
    }
  }
  if (!given.length) return surname.map(titleCase).join(" ");
  if (!surname.length) return given.map(titleCase).join(" ");
  return [...given, ...surname].map(titleCase).join(" ");
}

/** Joins names as "A, B and C". */
export function joinNames(names: string[]) {
  const l = names.filter(Boolean);
  if (l.length <= 1) return l[0] ?? "";
  return `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}

/** Medals/entries feeds append a ".----" tail to event codes. */
export function normalizeEventCode(code: string | null | undefined) {
  return (code || "").replace(/\.-+$/, "");
}

/** "Women's Team, Women's Team Group F" -> "Group F"; equal -> "". */
export function cleanPhase(
  eventName: string | null | undefined,
  phaseName: string | null | undefined,
) {
  const e = (eventName || "").trim();
  let p = (phaseName || "").trim();
  if (!p) return "";
  if (!e) return p;
  if (p.toLowerCase() === e.toLowerCase()) return "";
  if (p.toLowerCase().startsWith(e.toLowerCase())) {
    const rest = p.slice(e.length);
    // only strip when the event name ends on a word boundary in the phase
    if (/^[\s,:-]/.test(rest)) p = rest.replace(/^[\s,:-]+/, "").trim();
  }

  return p;
}

export function genderFromEventCode(code: string | null | undefined) {
  const c = (code || "").charAt(0).toUpperCase();
  if (c === "M") return "men";
  if (c === "W") return "women";
  if (c === "X") return "mixed";
  return "open";
}

export function irmPhrase(irm: string | null | undefined) {
  const v = (irm || "").toUpperCase();
  if (!v || v === "OK") return null;
  if (v === "DNS") return "did not start";
  if (v === "DNF") return "did not finish";
  if (v === "DSQ" || v === "DQ") return "was disqualified";
  if (v === "DNQ") return "did not qualify";
  if (v === "WDR" || v === "WD") return "withdrew";
  return `was marked ${v}`;
}

export function medalFromRaw(raw: string | null | undefined) {
  const v = (raw || "").toUpperCase();
  if (v === "1" || v === "ME_GOLD") return "gold";
  if (v === "2" || v === "ME_SILVER") return "silver";
  if (v === "3" || v === "ME_BRONZE") return "bronze";
  return null;
}

const FINISHED = new Set(["PROVISIONAL", "UNOFFICIAL", "OFFICIAL", "FINISHED"]);

/**
 * Spoken time clause. Relative mode says "today"/"tomorrow" instead of the date,
 * computed against the current India date at answer time.
 */
export function whenPhrase(
  istString: string | null | undefined,
  relative = false,
): string {
  const date = spokenDate(istString);
  const time = spokenTime(istString);
  if (!date || !time) return "";
  if (relative) {
    const day = (istString || "").split(" ")[0];
    if (day === todayInIst(0)) return `today at ${time} India time`;
    if (day === todayInIst(1)) return `tomorrow at ${time} India time`;
    if (day === todayInIst(-1)) return `yesterday at ${time} India time`;
  }
  return `on ${date} at ${time} India time`;
}


/* ------------------------------ summaries ------------------------------ */

export type SummaryItem = {
  sport_code?: string | null;
  sport_name?: string | null;
  event_name?: string | null;
  phase_name?: string | null;
  start_ist?: string | null;
  status?: string | null;
  is_live?: boolean | null;
  is_h2h?: boolean | null;
  medal_flag?: string | null;
};

export type SummaryResult = {
  athlete_or_team?: string | null;
  spoken_name?: string | null;
  is_team?: boolean | null;
  opponent_name?: string | null;
  opponent_code?: string | null;
  opponent_country_name?: string | null;
  india_score?: string | null;
  opponent_score?: string | null;
  outcome?: string | null;
  rank?: string | null;
  result_mark?: string | null;
  qualified?: string | null;
  irm?: string | null;
  medal?: string | null;
} | null;

export type SummaryOpts = {
  /** absolute: "on 23 September at ..."; relative: "today at ..."; none: omitted. */
  when?: "absolute" | "relative" | "none";
  /** Overrides the subject, e.g. "Two Indians, A and B,". */
  subject?: string;
};

/** Pure function: builds a text-to-speech friendly sentence. */
export function buildSummary(
  item: SummaryItem & { start_time?: string | null },
  r: SummaryResult,
  opts: SummaryOpts = {},
): string {
  const sport = item.sport_name || "";
  const event = item.event_name || "";
  const phase = cleanPhase(event, item.phase_name);
  const where = [sport, event].filter(Boolean).join(" ") + (phase ? `, ${phase}` : "");
  const mode = opts.when ?? "absolute";
  const clause = mode === "none" ? "" : whenPhrase(item.start_ist, mode === "relative");
  const when = clause ? ` ${clause}` : "";
  const status = (item.status || "").toUpperCase();
  const live = !!item.is_live || status === "RUNNING" || status === "LIVE";
  const finished = FINISHED.has(status);
  const sportCode = item.sport_code;


  const isTeam = r?.is_team !== false;
  const teamish = /^(india|ind)$/i.test((r?.athlete_or_team || "").trim());
  const subject =
    opts.subject ||
    (isTeam || teamish
      ? "India"
      : `${r?.spoken_name || spokenName(r?.athlete_or_team) || "India"} of India`);
  const plural = !!opts.subject || / and /.test(subject);

  // Opponent phrasing
  const oppCountry = r?.opponent_country_name || null;
  let opponent: string;
  if (isTeam || teamish) {
    opponent = oppCountry || r?.opponent_name || "an opponent still to be decided";
  } else if (r?.opponent_name) {
    const oppSpoken = spokenName(r.opponent_name) || r.opponent_name;
    opponent = oppCountry ? `${oppSpoken} of ${oppCountry}` : oppSpoken;
  } else if (oppCountry) {
    opponent = oppCountry;
  } else {
    opponent = "an opponent still to be decided";
  }
  const oppShort = oppCountry || r?.opponent_name || "the opponent";

  const parts: string[] = [];

  if (item.is_h2h) {
    if (live) {
      parts.push(
        `${subject} ${plural ? "are" : "is"} playing ${opponent} in ${where}. The match is in progress now.`,
      );
      if (r?.india_score || r?.opponent_score) {
        parts.push(
          `Current score: India ${spokenScore(r?.india_score, sportCode) || "0"}, ${oppShort} ${
            spokenScore(r?.opponent_score, sportCode) || "0"
          }.`,
        );
      }
    } else if (finished && r?.outcome) {
      const verb = r.outcome === "won" ? "beat" : r.outcome === "lost" ? "lost to" : "drew with";
      const score =
        r.india_score || r.opponent_score
          ? ` ${spokenScore(r.india_score, sportCode) || "0"} to ${
              spokenScore(r.opponent_score, sportCode) || "0"
            }`
          : "";
      parts.push(`${subject} ${verb} ${opponent}${score} in ${where}.`);
    } else {
      parts.push(`${subject} ${plural ? "play" : "plays"} ${opponent} in ${where}${when}.`);
    }
  } else {
    const who = subject;
    const hasResult =
      !!(r && (r.rank || r.result_mark || r.outcome || r.irm || r.medal || r.qualified));
    if (finished && r && hasResult) {
      const irm = irmPhrase(r.irm);
      if (irm) {
        parts.push(`${who} ${irm} in ${where}.`);
      } else {
        const rk = r.rank && /^\d+$/.test(r.rank) ? ordinal(Number(r.rank)) : r.rank || "";
        const mark = r.result_mark ? ` with ${r.result_mark}` : "";
        let sentence = rk
          ? `${who} finished ${rk} in ${where}${mark}`
          : `${who} competed in ${where}${mark}`;
        if (r.qualified) sentence += " and qualified for the next round";
        if (r.medal) sentence += ` and won the ${r.medal} medal`;
        parts.push(`${sentence}.`);
      }
    } else if (live) {
      parts.push(
        `${who} ${plural ? "are" : "is"} competing in ${where}. The event is in progress now.`,
      );
    } else {
      parts.push(`${who} ${plural ? "compete" : "competes"} in ${where}${when}.`);
    }
  }

  if (item.medal_flag === "1") parts.push("This is a gold medal event.");
  else if (item.medal_flag === "2") parts.push("Bronze medals are decided in this round.");

  // Provisional only matters once a result has been unofficial for over an hour.
  if (finished && status !== "OFFICIAL" && r) {
    const startMs = item.start_time
      ? new Date(item.start_time).getTime()
      : item.start_ist
        ? Date.parse(`${item.start_ist.replace(" ", "T")}:00+05:30`)
        : NaN;
    if (Number.isFinite(startMs) && Date.now() - startMs > 3600 * 1000) {
      parts.push("This result is still provisional.");
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();

}
