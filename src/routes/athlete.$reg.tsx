import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, BackHeader } from "@/components/c4b/AppShell";
import { useJeet } from "@/components/c4b/JeetProvider";
import { AskJeetStrip, Card, EmptyState, ErrorState, Skeleton, Tag, TzPill } from "@/components/c4b/ui";
import { NextRow, outcomeTag } from "@/components/c4b/rows";
import { athleteQuery, type AppResult, type AthleteData } from "@/lib/app-data";
import { dateLong, displayScore, zoneDayLabel, zoneTimeZ } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { pageHead } from "@/lib/seo";
import { athletePath, trailingNumber } from "@/lib/slug";

/** Accepts "sreeja-akula-12640502" and the old digits-only form. */
const regOf = (param: string) => (/^\d+$/.test(param) ? param : (trailingNumber(param) ?? param));

export const Route = createFileRoute("/athlete/$reg")({
  loader: async ({ context, params, location }) => {
    let data: AthleteData | undefined;
    try {
      data = await context.queryClient.ensureQueryData(athleteQuery(regOf(params.reg)));
    } catch {
      throw notFound();
    }
    const canonical = data?.path ?? (data ? athletePath(data.name, data.reg) : null);
    if (canonical && canonical !== decodeURIComponent(location.pathname)) {
      throw redirect({ href: canonical, statusCode: 301, replace: true });
    }
    return data;
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.name;
    const title = name
      ? `${name} — ${loaderData?.sport ?? "India"} at the Asian Games 2026 | Cheer4Bharat`
      : "Indian athlete at the Asian Games 2026 | Cheer4Bharat";
    const description = name
      ? `${name}'s events, results, medals and upcoming starts for India at the Asian Games 2026.`
      : "Results, medals and upcoming events for this Indian athlete at the Asian Games 2026.";
    return pageHead({ title, description, path: loaderData?.path ?? `/athlete/${params.reg}`, type: "profile" });
  },
  component: AthleteScreen,
});

function AthleteScreen() {
  const { reg: regParam } = Route.useParams();
  const reg = regOf(regParam);
  const seed = Route.useLoaderData();
  const { t, tz } = usePrefs();
  const { openJeet } = useJeet();
  const { data, isLoading, isError, refetch } = useQuery(athleteQuery(reg, seed));
  const hasResult = (r: AppResult | null | undefined) => !!r && !!(r.india_score || r.opponent_score || r.rank || r.result_mark || r.outcome);
  const validResults = data?.results.filter((r) => hasResult(r)) ?? [];
  const floatingUpcoming = data?.results.filter((r) => !hasResult(r) && r.start_time && Date.parse(r.start_time) > Date.now()) ?? [];

  return (
    <AppShell
      header={<BackHeader title={data?.name ?? "—"} subtitle={data ? `${data.sport} · India` : undefined} right={<TzPill compact />} />}
      jeetContext={{ page_type: "athlete", athlete: data?.name ?? "", sport: data?.sport ?? "", sportCode: data?.sport_code }}
    >
      <div className="c4b-athlete-grid" style={{ padding: "0 16px", gap: 12 }}>
        {isError ? (
          <ErrorState text={t.somethingWrong} retryLabel={t.retry} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <>
            <Skeleton height={90} />
            <Skeleton height={60} />
            <Skeleton height={150} />
          </>
        ) : (
          <><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.medals.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {data.medals.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      borderRadius: 16,
                      background: "var(--c-card)",
                      border: "1px solid var(--c-border)",
                    }}
                  >
                    <Tag kind={(m.medal as "gold" | "silver" | "bronze") ?? "neutral"}>
                      {(m.medal ?? "").toUpperCase()}
                    </Tag>
                    <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 700, color: "var(--c-ink)" }}>
                      {m.event_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--c-muted)" }}>
                      {[m.sport_name, m.date_ist ? dateLong(m.date_ist) : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {data.entries.length ? (
              <Card>
                <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 800, color: "var(--c-ink)" }}>
                  {t.enteredIn(data.entries.length)}
                </div>
                <div style={{ marginTop: 4 }}>
                  {data.entries.map((e, n) => {
                    const tag = outcomeTag(e.result ?? undefined, t);
                    return (
                      <div
                        key={e.event_code}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 0",
                          minHeight: 44,
                          borderBottom: n === data.entries.length - 1 ? "0" : "1px solid var(--c-border)",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-ink)" }}>
                            {e.event_name ?? e.event_code}
                          </div>
                           <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 2 }}>
                            {e.next_start_time
                               ? `Next: ${zoneDayLabel(e.next_start_time, tz)} · ${zoneTimeZ(e.next_start_time, tz)}`
                              : tag
                                ? ""
                                : t.drawNotPublished}
                          </div>
                           {e.next_start_time && e.result && hasResult(e.result) ? <div style={{ fontSize: 11.5, color: "var(--c-muted)", marginTop: 2 }}>Last: {[e.result.outcome?.toUpperCase(), displayScore(e.result.sport_code,e.result.india_score) && `${displayScore(e.result.sport_code,e.result.india_score)}–${displayScore(e.result.sport_code,e.result.opponent_score)}`, e.result.opponent_country_name ? `v ${e.result.opponent_country_name}` : null].filter(Boolean).join(" ")}</div> : null}
                        </div>
                         {!e.next_start_time && tag ? <Tag kind={tag.kind}>{tag.label}</Tag> : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}

             <AskJeetStrip
              question={`Ask Jeet: How did ${data.name} do?`}
              onAsk={() =>
                openJeet({ page_type: "athlete", athlete: data.name, sport: data.sport, sportCode: data.sport_code })
              }
             /></div><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <h2 style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 800, margin: 0, color: "var(--c-ink)" }}>
              {t.results}
            </h2>
            <Card padding="2px 16px">
               {validResults.length ? (
                 validResults.map((r, n) => {
                  const tag = outcomeTag(r, t);
                  const india = displayScore(r.sport_code, r.india_score);
                  const opp = displayScore(r.sport_code, r.opponent_score);
                  return (
                    <div
                      key={`${r.res_code}-${r.competitor_key}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 0",
                        minHeight: 44,
                         borderBottom: n === validResults.length - 1 ? "0" : "1px solid var(--c-border)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-ink)" }}>
                          {[r.event_name, r.phase_name].filter(Boolean).join(" · ")}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 2 }}>
                          {india || opp
                            ? `${india || "–"} – ${opp || "–"} ${r.opponent_country_name ?? ""}`
                            : [r.rank ? `Rank ${r.rank}` : null, r.result_mark].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {tag ? <Tag kind={tag.kind}>{tag.label}</Tag> : null}
                    </div>
                  );
                })
              ) : (
                <EmptyState text={t.emptyResults} />
              )}
            </Card>

            <h2 style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 800, margin: 0, color: "var(--c-ink)" }}>
              {t.stillToCome}
            </h2>
            <Card padding="2px 16px">
               {data.upcoming.length ? (
                 data.upcoming.map((i, n) => (
                  <NextRow key={`${i.sport_code}-${i.res_code}`} item={i} t={t} showDate last={n === data.upcoming.length - 1} />
                ))
               ) : floatingUpcoming.length ? floatingUpcoming.map((r) => <div key={`${r.res_code}-${r.competitor_key}`} style={{ padding: "10px 0" }}><strong>{[r.event_name,r.phase_name].filter(Boolean).join(" · ")}</strong><div style={{ fontSize: 12, color: "var(--c-muted)" }}>{zoneDayLabel(r.start_time,tz)} · {zoneTimeZ(r.start_time,tz)}</div></div>) : (
                <div style={{ padding: "14px 0" }}>
                  {data.entries.map((e) => (
                    <div key={e.event_code} style={{ padding: "6px 0" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-ink)" }}>{e.event_name}</div>
                      <div style={{ fontSize: 12, color: "var(--c-muted)" }}>{t.entered}</div>
                    </div>
                  ))}
                </div>
              )}
             </Card></div>
          </>
        )}
      </div>
    </AppShell>
  );
}
