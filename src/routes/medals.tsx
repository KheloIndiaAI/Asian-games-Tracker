import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/c4b/AppShell";
import { useJeet } from "@/components/c4b/JeetProvider";
import { AskJeetStrip, Card, EmptyState, ErrorState, PageTitle, Skeleton, Tag } from "@/components/c4b/ui";
import { ChevronRight } from "@/components/c4b/icons";
import { medalsQuery } from "@/lib/app-data";
import { dateLong, minutesAgo } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { pageHead } from "@/lib/seo";
import { athleteLink } from "@/lib/slug";

const TITLE = "India's medals — Asian Games 2026 | Cheer4Bharat";
const DESCRIPTION =
  "Every medal India has won at the Asian Games 2026, plus the full medal table with India's rank and gold, silver and bronze counts.";

export const Route = createFileRoute("/medals")({
  head: () => pageHead({ title: TITLE, description: DESCRIPTION, path: "/medals" }),
  component: MedalsScreen,
});

const BADGE: Record<string, { bg: string; letter: string }> = {
  gold: { bg: "var(--c-gold)", letter: "G" },
  silver: { bg: "var(--c-silver)", letter: "S" },
  bronze: { bg: "var(--c-bronze)", letter: "B" },
};

function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />;
}

function MedalsScreen() {
  const { t } = usePrefs();
  const { openJeet } = useJeet();
  const { data, isLoading, isError, refetch } = useQuery(medalsQuery());
  const [full, setFull] = useState(false);

  const top = data?.standings.slice(0, 4) ?? [];
  const rows = full ? (data?.standings ?? []) : top.concat(
    data?.india && !top.some((r) => r.org_code === "IND") ? [data.india as never] : [],
  );

  return (
    <AppShell jeetContext={{ page_type: "medals" }}>
      <PageTitle title={t.medals} subtitle={`India at the Asian Games 2026${minutesAgo(data?.as_of) != null ? ` · updated ${minutesAgo(data?.as_of)} min ago` : ""}`} />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {isError ? (
          <ErrorState text={t.somethingWrong} retryLabel={t.retry} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <>
            <Skeleton height={160} />
            <Skeleton height={60} />
            <Skeleton height={180} />
          </>
        ) : (
          <><div className="c4b-medals-grid"><div>
            <Card padding="14px 16px">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontFamily: "var(--display)", fontSize: 18, fontWeight: 800, color: "var(--c-ink)" }}>
                  {t.medalsCount(data.india?.total ?? 0)}
                </span>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: "var(--c-saffron)", color: "var(--c-on-saffron)", fontSize: 11, fontWeight: 800 }}>{t.rank(String(data.india?.rank ?? "—"))}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                {data.medals.length ? (
                  data.medals.map((m, n) => {
                    const badge = BADGE[m.medal ?? "gold"] ?? BADGE["gold"]!;
                    const inner = (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "11px 0",
                          minHeight: 44,
                          borderBottom: n === data.medals.length - 1 ? "0" : "1px solid var(--c-border)",
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            background: badge.bg,
                            color: "var(--c-on-saffron)",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 800,
                            fontSize: 12.5,
                            flexShrink: 0,
                          }}
                        >
                          {badge.letter}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "var(--c-ink)" }}>
                            {m.members_spoken || m.spoken_name || m.athlete_or_team}
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: "var(--c-muted)" }}>
                            {[m.sport_name ?? m.sport_code, m.event_name, m.date_ist ? dateLong(m.date_ist) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {m.reg ? <ChevronRight /> : null}
                      </div>
                    );
                    return m.reg ? (
                      <Link
                        key={`${m.sport_code}-${m.event_code}-${m.competitor_key}`}
                        to="/athlete/$reg"
                        params={athleteLink({ reg: m.reg!, name: m.spoken_name ?? m.athlete_or_team, path: m.athlete_path }).params}
                        style={{ display: "block", color: "inherit" }}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={`${m.sport_code}-${m.event_code}-${m.competitor_key}`}>{inner}</div>
                    );
                  })
                ) : (
                  <EmptyState text={t.noMedals} />
                )}
              </div>
            </Card>

            <AskJeetStrip
              question="Ask Jeet: How many medals has India won?"
              onAsk={() => openJeet({ page_type: "medals" })}
            />

            </div><div>
             <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
              <span style={{ flex: 1, fontFamily: "var(--display)", fontSize: 16, fontWeight: 800, color: "var(--c-ink)" }}>
                {t.medalTable}
              </span>
              <span style={{ width: 26, textAlign: "center" }}>
                <Dot color="var(--c-gold)" />
              </span>
              <span style={{ width: 26, textAlign: "center" }}>
                <Dot color="var(--c-silver)" />
              </span>
              <span style={{ width: 26, textAlign: "center" }}>
                <Dot color="var(--c-bronze)" />
              </span>
              <span style={{ width: 32, textAlign: "right", fontSize: 10.5, fontWeight: 800, color: "var(--c-muted)" }}>
                {t.all}
              </span>
            </div>

             <Card className="c4b-medal-table-compact" padding="2px 16px" style={{ overflow: "hidden" }}>
               {rows.map((r, n, allRows) => {
                const india = r.org_code === "IND";
                return (
                  <div
                    key={r.org_code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "11px 16px",
                      margin: "0 -16px",
                      minHeight: 44,
                      background: india ? "var(--c-jeet)" : "transparent",
                       borderBottom: n === allRows.length - 1 ? "0" : "1px solid var(--c-border)",
                    }}
                  >
                    <span style={{ width: 22, fontSize: 12.5, color: "var(--c-muted)" }}>{r.rank ?? "—"}</span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: india ? 800 : 600,
                        color: "var(--c-ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.org_name ?? r.org_code}
                    </span>
                    <span style={{ width: 26, textAlign: "center", fontSize: 13.5, color: "var(--c-ink)" }}>{r.gold}</span>
                    <span style={{ width: 26, textAlign: "center", fontSize: 13.5, color: "var(--c-ink)" }}>{r.silver}</span>
                    <span style={{ width: 26, textAlign: "center", fontSize: 13.5, color: "var(--c-ink)" }}>{r.bronze}</span>
                    <span style={{ width: 32, textAlign: "right", fontFamily: "var(--display)", fontSize: 14, fontWeight: 800, color: "var(--c-ink)" }}>
                      {r.total}
                    </span>
                  </div>
                );
              })}
            </Card>
             <Card className="c4b-medal-table-full" padding="2px 16px" style={{ overflow: "hidden" }}>
               {data.standings.map((r, n, allRows) => {
                 const india = r.org_code === "IND";
                 return <div key={r.org_code} style={{ display: "grid", gridTemplateColumns: "3rem minmax(0,1fr) repeat(4,3rem)", alignItems: "center", gap: 8, padding: "11px 16px", margin: "0 -16px", minHeight: 44, background: india ? "var(--c-jeet)" : "transparent", borderBottom: n === allRows.length - 1 ? "0" : "1px solid var(--c-border)" }}><span>{r.rank ?? "—"}</span><strong>{r.org_name ?? r.org_code}</strong><span>{r.gold}</span><span>{r.silver}</span><span>{r.bronze}</span><strong>{r.total}</strong></div>;
               })}
             </Card>

             <button className="c4b-phone-tablet-only"
              type="button"
              onClick={() => setFull((v) => !v)}
              style={{
                minHeight: 44,
                background: "none",
                border: 0,
                color: "var(--c-saffron-text)",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: "pointer",
                textAlign: "left",
                padding: "0 4px",
              }}
            >
              {full ? t.hideFullTable : t.fullMedalTable}
            </button>
            </div>
          </div></>
        )}
      </div>
    </AppShell>
  );
}
