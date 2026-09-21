import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, BackHeader } from "@/components/c4b/AppShell";
import { useJeet } from "@/components/c4b/JeetProvider";
import { AskJeetStrip, Card, EmptyState, ErrorState, Skeleton, Tag, TzPill } from "@/components/c4b/ui";
import { NextRow, subtitleOf, titleOf } from "@/components/c4b/rows";
import { matchQuery, type MatchData } from "@/lib/app-data";
import { displayScore, minutesAgo, zoneDayLabel, zoneTimeZ } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { pageHead } from "@/lib/seo";
import { cleanPhase, trailingNumber } from "@/lib/slug";

const matchRef = (sportCode: string, resCode: string) => {
  const id = trailingNumber(resCode);
  return id ? { id } : { sport: sportCode, res: resCode };
};

export const Route = createFileRoute("/match/$sportCode/$resCode")({
  loader: async ({ context, params, location }) => {
    let data: MatchData | undefined;
    try {
      data = await context.queryClient.ensureQueryData(matchQuery(matchRef(params.sportCode, params.resCode)));
    } catch {
      return undefined;
    }
    const canonical = data?.item?.path;
    if (canonical && canonical !== decodeURIComponent(location.pathname)) {
      throw redirect({ href: canonical, statusCode: 301, replace: true });
    }
    return data;
  },
  head: ({ params, loaderData }) => {
    const item = loaderData?.item;
    const phase = item ? cleanPhase(item.event_name, item.phase_name) : "";
    const headline = item ? titleOf(item) : "India match";
    const title = item
      ? `${headline} — ${[item.sport, phase].filter(Boolean).join(", ")} | Cheer4Bharat`
      : "India match — Asian Games 2026 | Cheer4Bharat";
    const when = item ? [zoneDayLabel(item.start_time, "IST"), zoneTimeZ(item.start_time, "IST")].filter(Boolean).join(" ") : "";
    const description = item
      ? `${headline} at the Asian Games 2026${when ? `, ${when} India time` : ""}. Live score, status and result.`
      : "Live score, status and details for this India event at the Asian Games 2026.";
    return pageHead({
      title,
      description,
      path: item?.path ?? `/match/${params.sportCode}/${params.resCode}`,
      type: "article",
    });
  },
  component: MatchScreen,
});

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--c-tile)", borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 19, fontWeight: 800, color: "var(--c-ink)" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--c-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const STAT_LABELS: Record<string, string> = {
  ST_TOTAL_SHOTS: "Total shots",
  ST_FIELD_GOAL: "Field goals",
  ST_PC_GOALS_SHOTS: "Penalty corners",
  ST_TOTAL_SAVES: "Saves",
  ST_POSSESSION_PERCENT: "Possession",
};

function matchStats(raw: any) {
  const india = (Array.isArray(raw?.Competitors) ? raw.Competitors : []).find((c: any) => c?.Org === "IND");
  const stats = india?.Stats ?? raw?.Results?.Stats;
  if (!stats || typeof stats !== "object") return [];
  return Object.entries(STAT_LABELS)
    .map(([key, label]) => ({ label, value: String(stats[key] ?? "").trim() }))
    .filter((s) => s.value)
    .slice(0, 6);
}

function MatchScreen() {
  const { sportCode, resCode } = Route.useParams();
  const seed = Route.useLoaderData();
  const { t, tz } = usePrefs();
  const { openJeet } = useJeet();
  const { data, isLoading, isError, refetch } = useQuery(matchQuery(matchRef(sportCode, resCode), seed));

  const item = data?.item;
  const mins = minutesAgo(item?.updated_at);
  const stats = matchStats(item?.result_raw);
  const indiaScore = displayScore(item?.sport_code, item?.india_score ?? item?.results?.[0]?.india_score);
  const opponentScore = displayScore(item?.sport_code, item?.opponent_score ?? item?.results?.[0]?.opponent_score);

  const nonH2h = item && !item.is_h2h ? item.results : [];

  return (
    <AppShell
      header={
        <BackHeader
          title={item ? titleOf(item) : t.matchDetails}
          subtitle={item ? [subtitleOf(item), item.venue_name].filter(Boolean).join(" · ") : undefined}
          right={<TzPill compact />}
        />
      }
      jeetContext={{ page_type: "match", sport: item?.sport ?? sportCode, sportCode }}
    >
      <div className="c4b-match-grid" style={{ padding: "0 16px", gap: 12 }}>
        {isError ? (
          <ErrorState text={t.somethingWrong} retryLabel={t.retry} onRetry={() => void refetch()} />
        ) : isLoading || !item ? (
          <>
            <Skeleton height={150} />
            <Skeleton height={60} />
            <Skeleton height={120} />
          </>
        ) : (
          <>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {item.is_live ? (
                  <Tag kind="live">{t.live}</Tag>
                ) : item.is_finished ? (
                  <Tag kind="soft">{item.status_desc ?? item.status ?? ""}</Tag>
                ) : (
                  <Tag kind="soft">{t.upcoming}</Tag>
                )}
                <span style={{ fontSize: 12.5, color: "var(--c-muted)" }}>{[zoneDayLabel(item.start_time, tz), zoneTimeZ(item.start_time, tz)].filter(Boolean).join(" · ")}</span>
              </div>
              {item.is_h2h ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "end", gap: 10, marginTop: 12 }}>
                  <div><div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-muted)" }}>{item.india_name ?? "India"}</div>{indiaScore ? <div style={{ fontFamily: "var(--display)", fontSize: 42, fontWeight: 800, color: "var(--c-saffron-text)" }}>{indiaScore}</div> : null}</div>
                  <span style={{ paddingBottom: indiaScore || opponentScore ? 10 : 0, fontSize: 12, color: "var(--c-muted)" }}>v</span>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-muted)" }}>{item.opponent_name ?? item.results[0]?.opponent_country_name ?? "Opponent"}</div>{opponentScore ? <div style={{ fontFamily: "var(--display)", fontSize: 42, fontWeight: 800, color: "var(--c-ink)" }}>{opponentScore}</div> : null}</div>
                </div>
              ) : null}
              <div style={{ fontSize: 13, color: "var(--c-ink2)", marginTop: 6 }}>
                {item.results[0]?.spoken_summary_en ?? subtitleOf(item)}
              </div>
              {mins != null ? (
                <div style={{ fontSize: 11.5, color: "var(--c-muted)", marginTop: 6 }}>{t.scoreUpdated(mins)}</div>
              ) : null}
            </Card>

             <div><AskJeetStrip
              question={`Ask Jeet: What's happening in ${item.sport}?`}
              onAsk={() => openJeet({ page_type: "match", sport: item.sport, sportCode })}
             /></div>

            {stats.length ? (
              <Card>
                <h2 style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 800, margin: "0 0 10px", color: "var(--c-ink)" }}>
                  {t.matchSoFar}
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {stats.slice(0, 6).map((stat) => (
                    <StatTile key={stat.label} label={stat.label} value={stat.value} />
                  ))}
                </div>
              </Card>
            ) : null}

             {nonH2h.length ? (
              <Card padding="2px 16px">
                {nonH2h.map((r, n) => (
                  <div
                    key={r.competitor_key}
                    style={{
                      padding: "12px 0",
                      borderBottom: n === nonH2h.length - 1 ? "0" : "1px solid var(--c-border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: "var(--c-ink)" }}>
                        {r.spoken_name || r.athlete_or_team}
                      </span>
                      {r.medal ? (
                        <Tag kind={r.medal as "gold" | "silver" | "bronze"}>{r.medal.toUpperCase()}</Tag>
                      ) : r.qualified ? (
                        <Tag kind="win">{t.qualified}</Tag>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--c-muted)", marginTop: 2 }}>
                      {[r.rank ? `Rank ${r.rank}` : null, r.result_mark, r.irm].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                ))}
              </Card>
            ) : null}

             <h2 className="c4b-desktop-span" style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 800, margin: 0, color: "var(--c-ink)" }}>
              {t.nextForIndia(item.sport)}
            </h2>
            {data.next.length ? (
               <Card className="c4b-desktop-span" padding="2px 16px">
                 <div className="c4b-fixture-cards">{data.next.map((i, n) => (
                   <NextRow key={`${i.sport_code}-${i.res_code}`} item={i} t={t} showDate last={n === data.next.length - 1} />
                 ))}</div>
              </Card>
            ) : (
              <Card>
                <EmptyState text={t.emptyNext} />
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
