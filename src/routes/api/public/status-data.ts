import { createFileRoute } from "@tanstack/react-router";
import { statusKeyIsValid } from "@/lib/status-auth.server";
import { getSql } from "@/lib/pg.server";

function istDate(offset = 0) { return new Date(Date.now() + 19800000 + offset * 86400000).toISOString().slice(0, 10); }

export const Route = createFileRoute("/api/public/status-data")({
  server: { handlers: { GET: async ({ request }) => {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!(await statusKeyIsValid(key))) return new Response("Not found", { status: 404 });
    const sql = getSql();
    const today = istDate(), tomorrow = istDate(1), now = Date.now();
    const from = new Date(now - 21600000).toISOString();
    const to = new Date(now + 900000).toISOString();

    const [
      itemsCountRows, indiaCountRows, resultsCountRows, medalsCountRows,
      logs, upcoming, indiaResultRows, medalRows, standingRows, live,
      entered, watchRows, liveRows, lastRuns, sportRows,
    ] = await Promise.all([
      sql`SELECT count(*)::int AS count FROM schedule_items`,
      sql`SELECT count(*)::int AS count FROM schedule_items WHERE has_india = true`,
      sql`SELECT count(*)::int AS count FROM india_results`,
      sql`SELECT count(*)::int AS count FROM india_medals`,
      sql`SELECT * FROM fetch_log ORDER BY id DESC LIMIT 10`,
      sql`
        SELECT sport_code, res_code, event_name, phase_name, start_ist, date_ist, status, status_desc, orgs, is_h2h
        FROM schedule_items
        WHERE has_india = true AND date_ist IN (${today}, ${tomorrow})
        ORDER BY start_ist ASC
      `,
      sql`SELECT sport_code, res_code, opponent_name, spoken_summary_en FROM india_results`,
      sql`SELECT * FROM india_medals ORDER BY won_at DESC LIMIT 25`,
      sql`SELECT * FROM medal_standings WHERE org_code = 'IND' LIMIT 1`,
      sql`
        SELECT sport_code, res_code, event_name, phase_name, start_ist, status, status_desc
        FROM schedule_items
        WHERE has_india = true AND (is_live = true OR status = 'RUNNING')
        ORDER BY start_ist ASC
      `,
      sql`
        SELECT sport_code, date_ist FROM schedule_items
        WHERE india_entered = true AND has_india = false AND date_ist IN (${today}, ${tomorrow})
      `,
      sql`
        SELECT sport_code, event_name, phase_name, status, status_desc, is_live, start_time, india_result_fetched_at, updated_at
        FROM schedule_items
        WHERE has_india = true AND start_time >= ${from} AND start_time <= ${to}
      `,
      sql`
        SELECT sport_code, event_name, phase_name, status, status_desc, is_live, start_time, india_result_fetched_at, updated_at
        FROM schedule_items
        WHERE has_india = true AND is_live = true
      `,
      sql`
        SELECT mode, started_at, ok FROM fetch_log
        WHERE mode IN ('india_now', 'india_today') AND ok = true
        ORDER BY id DESC LIMIT 40
      `,
      sql`SELECT code, name FROM sports`,
    ]) as [
      any[], any[], any[], any[],
      any[], any[], any[], any[], any[], any[],
      any[], any[], any[], any[], any[],
    ];

    const itemsCount = itemsCountRows[0]?.count ?? 0;
    const indiaCount = indiaCountRows[0]?.count ?? 0;
    const resultsCount = resultsCountRows[0]?.count ?? 0;
    const medalsCount = medalsCountRows[0]?.count ?? 0;

    const sportName = new Map(sportRows.map((s: any) => [s.code, s.name ?? s.code]));
    const resMap = new Map(indiaResultRows.map((r: any) => [`${r.sport_code}|${r.res_code}`, r]));
    const watchMap = new Map<string, any>();
    for (const r of watchRows) if (String(r.status ?? "").toUpperCase() !== "OFFICIAL") watchMap.set(`${r.sport_code}|${r.event_name}|${r.start_time}`, r);
    for (const r of liveRows) watchMap.set(`${r.sport_code}|${r.event_name}|${r.start_time}`, r);
    const enteredCounts: Record<string, number> = { [today]: 0, [tomorrow]: 0 };
    for (const e of entered) if (e.date_ist) enteredCounts[e.date_ist] = (enteredCounts[e.date_ist] ?? 0) + 1;

    const data = {
      watch: [...watchMap.values()].map((r) => ({ ...r, age: Math.round((now - Date.parse(r.india_result_fetched_at ?? r.updated_at)) / 60000) })),
      lastRun: {
        india_now: lastRuns.find((l: any) => l.mode === "india_now")?.started_at ?? null,
        india_today: lastRuns.find((l: any) => l.mode === "india_today")?.started_at ?? null,
      },
      counts: { items: itemsCount, india: indiaCount, results: resultsCount, medals: medalsCount },
      logs,
      medalRows: medalRows.map((m: any) => ({ ...m, sport: sportName.get(m.sport_code) ?? m.sport_code })),
      standing: standingRows[0] ?? null,
      live: live.map((r: any) => ({ ...r, sport: sportName.get(r.sport_code) ?? r.sport_code, summary: resMap.get(`${r.sport_code}|${r.res_code}`)?.spoken_summary_en ?? "" })),
      enteredCounts,
      rows: upcoming.map((r: any) => {
        const res = resMap.get(`${r.sport_code}|${r.res_code}`);
        return {
          ...r,
          sport: sportName.get(r.sport_code) ?? r.sport_code,
          opponent: res?.opponent_name ?? (r.orgs ?? []).filter((o: string) => o !== "IND").slice(0, 2).join(", "),
          summary: res?.spoken_summary_en ?? "",
        };
      }),
      today, tomorrow,
    };
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } } },
});
