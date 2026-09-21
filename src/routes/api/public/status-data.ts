import { createFileRoute } from "@tanstack/react-router";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { statusKeyIsValid } from "@/lib/status-auth.server";
import { db } from "@/lib/db.server";
import { fetchLog, indiaMedals, indiaResults, medalStandings, scheduleItems, sports } from "../../../../drizzle/schema";

function istDate(offset = 0) { return new Date(Date.now() + 19800000 + offset * 86400000).toISOString().slice(0, 10); }

async function countRows(table: typeof scheduleItems | typeof indiaResults | typeof indiaMedals, where?: any) {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(table as any).where(where);
  return rows[0]?.count ?? 0;
}

export const Route = createFileRoute("/api/public/status-data")({
  server: { handlers: { GET: async ({ request }) => {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!(await statusKeyIsValid(key))) return new Response("Not found", { status: 404 });
    const today = istDate(), tomorrow = istDate(1), now = Date.now();

    const [
      itemsCount, indiaCount, resultsCount, medalsCount,
      logs, upcoming, indiaResultRows, medalRows, standing, live,
      entered, watchRows, liveRows, lastRuns, sportRows,
    ] = await Promise.all([
      countRows(scheduleItems),
      countRows(scheduleItems, eq(scheduleItems.hasIndia, true)),
      countRows(indiaResults),
      countRows(indiaMedals),
      db.select().from(fetchLog).orderBy(desc(fetchLog.id)).limit(10),
      db.select({
        sportCode: scheduleItems.sportCode, resCode: scheduleItems.resCode, eventName: scheduleItems.eventName,
        phaseName: scheduleItems.phaseName, startIst: scheduleItems.startIst, dateIst: scheduleItems.dateIst,
        status: scheduleItems.status, statusDesc: scheduleItems.statusDesc, orgs: scheduleItems.orgs, isH2h: scheduleItems.isH2h,
      }).from(scheduleItems)
        .where(and(eq(scheduleItems.hasIndia, true), inArray(scheduleItems.dateIst, [today, tomorrow])))
        .orderBy(asc(scheduleItems.startIst)),
      db.select({
        sportCode: indiaResults.sportCode, resCode: indiaResults.resCode,
        opponentName: indiaResults.opponentName, spokenSummaryEn: indiaResults.spokenSummaryEn,
      }).from(indiaResults),
      db.select().from(indiaMedals).orderBy(desc(indiaMedals.wonAt)).limit(25),
      db.select().from(medalStandings).where(eq(medalStandings.orgCode, "IND")).limit(1),
      db.select({
        sportCode: scheduleItems.sportCode, resCode: scheduleItems.resCode, eventName: scheduleItems.eventName,
        phaseName: scheduleItems.phaseName, startIst: scheduleItems.startIst, status: scheduleItems.status, statusDesc: scheduleItems.statusDesc,
      }).from(scheduleItems)
        .where(and(eq(scheduleItems.hasIndia, true), or(eq(scheduleItems.isLive, true), eq(scheduleItems.status, "RUNNING"))))
        .orderBy(asc(scheduleItems.startIst)),
      db.select({ sportCode: scheduleItems.sportCode, dateIst: scheduleItems.dateIst }).from(scheduleItems)
        .where(and(eq(scheduleItems.indiaEntered, true), eq(scheduleItems.hasIndia, false), inArray(scheduleItems.dateIst, [today, tomorrow]))),
      db.select({
        sportCode: scheduleItems.sportCode, eventName: scheduleItems.eventName, phaseName: scheduleItems.phaseName,
        status: scheduleItems.status, statusDesc: scheduleItems.statusDesc, isLive: scheduleItems.isLive,
        startTime: scheduleItems.startTime, indiaResultFetchedAt: scheduleItems.indiaResultFetchedAt, updatedAt: scheduleItems.updatedAt,
      }).from(scheduleItems)
        .where(and(
          eq(scheduleItems.hasIndia, true),
          gte(scheduleItems.startTime, new Date(now - 21600000)),
          lte(scheduleItems.startTime, new Date(now + 900000)),
        )),
      db.select({
        sportCode: scheduleItems.sportCode, eventName: scheduleItems.eventName, phaseName: scheduleItems.phaseName,
        status: scheduleItems.status, statusDesc: scheduleItems.statusDesc, isLive: scheduleItems.isLive,
        startTime: scheduleItems.startTime, indiaResultFetchedAt: scheduleItems.indiaResultFetchedAt, updatedAt: scheduleItems.updatedAt,
      }).from(scheduleItems).where(and(eq(scheduleItems.hasIndia, true), eq(scheduleItems.isLive, true))),
      db.select({ mode: fetchLog.mode, startedAt: fetchLog.startedAt, ok: fetchLog.ok }).from(fetchLog)
        .where(and(inArray(fetchLog.mode, ["india_now", "india_today"]), eq(fetchLog.ok, true)))
        .orderBy(desc(fetchLog.id)).limit(40),
      db.select({ code: sports.code, name: sports.name }).from(sports),
    ]);

    const sportName = new Map(sportRows.map((s) => [s.code, s.name ?? s.code]));
    const resMap = new Map(indiaResultRows.map((r) => [`${r.sportCode}|${r.resCode}`, r]));
    const watchMap = new Map<string, any>();
    for (const r of watchRows) if (String(r.status ?? "").toUpperCase() !== "OFFICIAL") watchMap.set(`${r.sportCode}|${r.eventName}|${r.startTime}`, r);
    for (const r of liveRows) watchMap.set(`${r.sportCode}|${r.eventName}|${r.startTime}`, r);
    const enteredCounts: Record<string, number> = { [today]: 0, [tomorrow]: 0 };
    for (const e of entered) if (e.dateIst) enteredCounts[e.dateIst] = (enteredCounts[e.dateIst] ?? 0) + 1;

    const data = {
      watch: [...watchMap.values()].map((r) => ({ ...r, age: Math.round((now - Date.parse(r.indiaResultFetchedAt ?? r.updatedAt)) / 60000) })),
      lastRun: {
        india_now: lastRuns.find((l) => l.mode === "india_now")?.startedAt ?? null,
        india_today: lastRuns.find((l) => l.mode === "india_today")?.startedAt ?? null,
      },
      counts: { items: itemsCount, india: indiaCount, results: resultsCount, medals: medalsCount },
      logs,
      medalRows: medalRows.map((m) => ({ ...m, sport: sportName.get(m.sportCode) ?? m.sportCode })),
      standing: standing[0] ?? null,
      live: live.map((r) => ({ ...r, sport: sportName.get(r.sportCode) ?? r.sportCode, summary: resMap.get(`${r.sportCode}|${r.resCode}`)?.spokenSummaryEn ?? "" })),
      enteredCounts,
      rows: upcoming.map((r) => {
        const res = resMap.get(`${r.sportCode}|${r.resCode}`);
        return {
          ...r,
          sport: sportName.get(r.sportCode) ?? r.sportCode,
          opponent: res?.opponentName ?? (r.orgs ?? []).filter((o) => o !== "IND").slice(0, 2).join(", "),
          summary: res?.spokenSummaryEn ?? "",
        };
      }),
      today, tomorrow,
    };
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } } },
});
