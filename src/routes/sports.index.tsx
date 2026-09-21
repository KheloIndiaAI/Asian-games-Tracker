import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/c4b/AppShell";
import { Card, ErrorState, PageTitle, Skeleton } from "@/components/c4b/ui";
import { Search } from "@/components/c4b/icons";
import { SportIcon } from "@/components/c4b/sport-icons";
import { searchQuery, sportsQuery } from "@/lib/app-data";
import { zoneDayLabel, zoneTimeZ } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { pageHead } from "@/lib/seo";
import { athleteLink, sportLink } from "@/lib/slug";

const TITLE = "Sports — India at the Asian Games 2026 | Cheer4Bharat";
const DESCRIPTION =
  "Every sport India is competing in at the Asian Games 2026, with live events first, athlete counts and a search for Indian athletes.";

export const Route = createFileRoute("/sports/")({
  head: () => pageHead({ title: TITLE, description: DESCRIPTION, path: "/sports" }),
  loader: ({ context }) => context.queryClient.ensureQueryData(sportsQuery()),
  component: SportsScreen,
});

function SportsScreen() {
  const { t, tz } = usePrefs();
  const [q, setQ] = useState("");
  const seed = Route.useLoaderData();
  const { data, isLoading, isError, refetch } = useQuery(sportsQuery(seed));
  const { data: index } = useQuery(searchQuery());

  const query = q.trim().toLowerCase();
  const athleteHits = useMemo(() => {
    if (query.length < 2 || !index) return [];
    return index.athletes.filter((a) => a.name.toLowerCase().includes(query)).slice(0, 8);
  }, [query, index]);

  const sports = useMemo(() => {
    const list = data?.sports ?? [];
    if (!query) return list;
    return list.filter((s) => s.name.toLowerCase().includes(query));
  }, [data, query]);

  return (
    <AppShell jeetContext={{ page_type: "sports" }}>
      <PageTitle title={t.sports} subtitle={t.sportsSub(data?.sports.length ?? 0)} />

      <div style={{ padding: "0 16px 12px" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 50,
            padding: "0 14px",
            borderRadius: 16,
            background: "var(--c-card)",
            border: "1px solid var(--c-border)",
          }}
        >
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: "none",
              background: "transparent",
              fontSize: 14.5,
              color: "var(--c-ink)",
            }}
          />
        </label>
      </div>

      {athleteHits.length ? (
        <div style={{ padding: "0 16px 12px" }}>
          <Card padding="2px 16px">
            {athleteHits.map((a, n) => (
              <Link
                key={a.reg}
                to="/athlete/$reg"
                params={athleteLink({ reg: a.reg, name: a.name, path: a.path }).params}
                style={{
                  display: "block",
                  padding: "12px 0",
                  minHeight: 44,
                  borderBottom: n === athleteHits.length - 1 ? "0" : "1px solid var(--c-border)",
                  color: "var(--c-ink)",
                }}
              >
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{a.name}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--c-muted)" }}>{a.sport}</span>
              </Link>
            ))}
          </Card>
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 16px 8px" }}>
        <span style={{ fontSize: 12.5, color: "var(--c-muted)" }}>{t.inActionFirst}</span>
        <span style={{ fontSize: 12.5, color: "var(--c-muted)" }}>{sports.length}</span>
      </div>

      <div style={{ padding: "0 16px" }}>
        {isError ? (
          <ErrorState text={t.somethingWrong} retryLabel={t.retry} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="c4b-sports-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={78} />
            ))}
          </div>
        ) : (
          <div className="c4b-sports-grid">
            {sports.map((s) => (
              <Link
                key={s.code}
                to="/sports/$sportCode"
                params={sportLink(s).params}
                className="c4b-sport-tile"
                style={{
                  display: "block",
                  padding: 14,
                  borderRadius: 16,
                  background: "var(--c-card)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-ink)",
                  minHeight: 78,
                }}
              >
                 <div className="c4b-sport-icon-box"><SportIcon code={s.code} size={30} /></div>
                 <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--c-ink)" }}>{s.name}</span>
                  {s.live ? (
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--c-live)" }} />
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>{t.athletes(s.athletes)}</div>
                <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 800, color: "var(--c-saffron-text)", minHeight: 14 }}>
                   {s.live ? t.live : s.today_start ? `${t.today} ${zoneTimeZ(s.today_start, tz)}` : s.tomorrow_start ? `${t.tomorrow} ${zoneTimeZ(s.tomorrow_start, tz)}` : s.next_date ? zoneDayLabel(`${s.next_date}T00:00:00Z`, tz) : "Done"}{s.medals ? ` · ${s.medals} ${s.medals === 1 ? "medal" : "medals"}` : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
