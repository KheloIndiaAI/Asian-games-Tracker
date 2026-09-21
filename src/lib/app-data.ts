import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { Tz } from "./format";

const tzParam = (tz: Tz) => (tz === "JST" ? "jst" : "ist");
const requestOrigin = createIsomorphicFn()
  .client(() => "")
  // SSR self-fetch: the server calls its own API routes while rendering.
  // Using the request's Host would resolve to the public domain behind
  // CloudFront — a real network round-trip out and back in, which is slow
  // and depends on DNS/CloudFront being reachable at all. Go straight to
  // the process's own port on localhost instead.
  .server(() => `http://127.0.0.1:${process.env["PORT"] ?? 3000}`);

export type AppItem = {
  sport_code: string;
  res_code: string;
  short_id?: number | null;
  path?: string | null;
  unit_name?: string | null;
  event_code: string | null;
  event_name: string | null;
  phase_name: string | null;
  start_ist: string | null;
  start_time: string | null;
  date_ist: string | null;
  date_jst: string | null;
  status: string | null;
  status_desc: string | null;
  is_live: boolean;
  is_h2h: boolean;
  is_finished: boolean;
  medal_flag: string | null;
  venue_name: string | null;
  has_india: boolean;
  india_entered: boolean;
  orgs: string[];
  india_name: string | null;
  india_score: string | null;
  opponent_name: string | null;
  opponent_code: string | null;
  opponent_score: string | null;
  sport?: string;
  results: AppResult[];
};

export type AppResult = {
  sport_code: string;
  res_code: string;
  competitor_key: string;
  athlete_or_team: string | null;
  spoken_name: string | null;
  is_team: boolean;
  opponent_name: string | null;
  opponent_country_code: string | null;
  opponent_country_name: string | null;
  india_score: string | null;
  opponent_score: string | null;
  outcome: string | null;
  rank: string | null;
  result_mark: string | null;
  qualified: string | null;
  irm: string | null;
  medal: string | null;
  status: string | null;
  start_time: string | null;
  spoken_summary_en: string | null;
  event_name?: string | null;
  phase_name?: string | null;
  date_ist?: string | null;
  sport?: string;
};

async function get<T>(path: string): Promise<T> {
  const base = await requestOrigin();
  const res = await fetch(`${base}/api/public/app/${path}`);
  const json = (await res.json()) as any;
  if (!json?.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}

/** Seed produced by a route loader so the first render has data instead of skeletons. */
export type Seed<T> = { tz: Tz; data: T } | undefined;

function seeded<T>(tz: Tz, seed: Seed<T>) {
  if (!seed) return {};
  return seed.tz === tz ? { initialData: seed.data } : { placeholderData: seed.data };
}

export type TodayData = {
  date: string;
  as_of: string | null;
  medals: { gold: number; silver: number; bronze: number; total: number; rank: string | null };
  counts: { live: number; next: number; results: number };
  live: AppItem[];
  next: AppItem[];
  next_groups: { date: string; label_key: "today" | "tomorrow" | "date"; items: AppItem[] }[];
  results: AppItem[];
  results_day: "today" | "yesterday";
  rail: { code: string; name: string; path?: string; live: boolean; next_start: string | null; next_date: string | null }[];
  up_next: AppItem | null;
  next_in_seconds: number | null;
  total_sports: number;
};

export type DayData = { date: string; items: AppItem[]; india_count: number; total_count: number };
export type DaysData = { counts: Record<string, number> };
export type SportsData = {
  sports: {
    code: string;
    name: string;
    path?: string;
    athletes: number;
    live: boolean;
    today_start: string | null;
    tomorrow: boolean;
    tomorrow_start: string | null;
    next_date: string | null;
    done_today: boolean;
    medals: number;
  }[];
};

export const todayQuery = (tz: Tz, date?: string, seed?: Seed<TodayData>) =>
  queryOptions({
    queryKey: ["app", "today", tz, date ?? "auto"],
    queryFn: () => get<TodayData>(`today?tz=${tzParam(tz)}${date ? `&date=${date}` : ""}`),
    refetchInterval: (query: any) => (query.state.data?.live?.length ? 30000 : 60000),
    staleTime: 15000,
    ...seeded(tz, seed),
  });

export const dayQuery = (date: string, all: boolean, tz: Tz, seed?: Seed<DayData>) =>
  queryOptions({
    queryKey: ["app", "day", date, all, tz],
    queryFn: () => get<DayData>(`day?date=${date}&all=${all ? 1 : 0}&tz=${tzParam(tz)}`),
    staleTime: 30000,
    ...seeded(tz, seed),
  });

export const daysQuery = (tz: Tz, seed?: Seed<DaysData>) =>
  queryOptions({
    queryKey: ["app", "days", tz],
    queryFn: () => get<DaysData>(`days?tz=${tzParam(tz)}`),
    staleTime: 300000,
    ...seeded(tz, seed),
  });

export const sportsQuery = (seed?: SportsData) =>
  queryOptions({
    queryKey: ["app", "sports"],
    queryFn: () => get<SportsData>("sports"),
    staleTime: 60000,
    ...(seed ? { initialData: seed } : {}),
  });

export type SportData = {
  code: string;
  name: string;
  path?: string;
  venue: string | null;
  items: AppItem[];
  squad: {
    reg: string;
    name: string | null;
    spoken_name: string | null;
    gender: string | null;
    event_name: string | null;
    type: string | null;
    path?: string;
  }[];
};

/** `codeOrSlug` may be a readable slug ("table-tennis") or the old feed code ("TTE"). */
export const sportQuery = (codeOrSlug: string, seed?: SportData) =>
  queryOptions({
    queryKey: ["app", "sport", codeOrSlug],
    queryFn: () => get<SportData>(`sport?code=${encodeURIComponent(codeOrSlug)}`),
    staleTime: 30000,
    ...(seed ? { initialData: seed } : {}),
  });

export type MatchData = {
  item: AppItem & { sport: string; updated_at: string; result_raw: any };
  next: AppItem[];
};

/** Resolves by short id when given, otherwise by the old sport + res code pair. */
export const matchQuery = (ref: { id?: string; sport?: string; res?: string }, seed?: MatchData) =>
  queryOptions({
    queryKey: ["app", "match", ref.id ?? `${ref.sport}|${ref.res}`],
    queryFn: () =>
      get<MatchData>(
        ref.id
          ? `match?id=${encodeURIComponent(ref.id)}`
          : `match?sport=${encodeURIComponent(ref.sport ?? "")}&res=${encodeURIComponent(ref.res ?? "")}`,
      ),
    refetchInterval: (query: any) => (query.state.data?.item?.is_live ? 30000 : 60000),
    staleTime: 15000,
    ...(seed ? { initialData: seed } : {}),
  });

export const medalsQuery = () =>
  queryOptions({
    queryKey: ["app", "medals"],
    queryFn: () =>
      get<{
        standings: {
          org_code: string;
          org_name: string | null;
          rank: string | null;
          gold: number;
          silver: number;
          bronze: number;
          total: number;
        }[];
        india: {
          org_code: string;
          rank: string | null;
          gold: number;
          silver: number;
          bronze: number;
          total: number;
        } | null;
        medals: {
          sport_code: string;
          sport_name: string | null;
          event_code: string;
          event_name: string | null;
          competitor_key: string;
          reg: string | null;
          medal: string | null;
          athlete_or_team: string | null;
          spoken_name: string | null;
          members: any;
          members_spoken: string | null;
          date_ist: string | null;
          res_code: string | null;
          path?: string | null;
          athlete_path?: string | null;
        }[];
        as_of: string | null;
      }>("medals"),
    refetchInterval: 60000,
    staleTime: 30000,
  });

export type AthleteData = {
  reg: string;
  name: string;
  path?: string;
  sport_code: string;
  sport: string;
  sport_path?: string;
  entries: {
    event_code: string;
    event_name: string | null;
    type: string | null;
    next_start_time: string | null;
    next_res_code: string | null;
    next_path: string | null;
    finished_res_code: string | null;
    finished_path: string | null;
    result: AppResult | null;
  }[];
  results: AppResult[];
  medals: {
    sport_name: string | null;
    event_name: string | null;
    medal: string | null;
    members_spoken: string | null;
    date_ist: string | null;
  }[];
  upcoming: AppItem[];
};

export const athleteQuery = (reg: string, seed?: AthleteData) =>
  queryOptions({
    queryKey: ["app", "athlete", reg],
    queryFn: () => get<AthleteData>(`athlete?reg=${encodeURIComponent(reg)}`),
    staleTime: 30000,
    ...(seed ? { initialData: seed } : {}),
  });

export const searchQuery = () =>
  queryOptions({
    queryKey: ["app", "search"],
    queryFn: () =>
      get<{
        sports: { code: string; name: string; path?: string }[];
        athletes: {
          reg: string;
          name: string;
          raw_name: string | null;
          sport_code: string;
          sport: string;
          path?: string;
          events: number;
        }[];
        events: { sport_code: string; sport: string; event_code: string; event_name: string; path?: string }[];
      }>("search"),
    staleTime: 600000,
  });
