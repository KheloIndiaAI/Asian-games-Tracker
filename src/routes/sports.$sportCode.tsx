import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, BackHeader } from "@/components/c4b/AppShell";
import { useJeet } from "@/components/c4b/JeetProvider";
import { AskJeetStrip, Card, EmptyState, ErrorState, Segmented, Skeleton, Tag, TzPill } from "@/components/c4b/ui";
import { ChevronRight } from "@/components/c4b/icons";
import { SportIcon } from "@/components/c4b/sport-icons";
import { matchLink, outcomeTag, subtitleOf, titleOf } from "@/components/c4b/rows";
import { sportQuery, type AppItem, type SportData } from "@/lib/app-data";
import { daysBetween, displayScore, todayIst, zoneDate, zoneDayLabel, zoneTime, zoneTimeZ } from "@/lib/format";
import { todayInZone } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { pageHead } from "@/lib/seo";
import { athleteLink, sportPath } from "@/lib/slug";

export const Route = createFileRoute("/sports/$sportCode")({
  loader: async ({ context, params, location }) => {
    let data: SportData | undefined;
    try {
      data = await context.queryClient.ensureQueryData(sportQuery(params.sportCode));
    } catch {
      throw notFound();
    }
    const canonical = data?.path ?? (data ? sportPath(data.name, data.code) : null);
    if (canonical && canonical !== decodeURIComponent(location.pathname)) {
      throw redirect({ href: canonical, statusCode: 301, replace: true });
    }
    return data;
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.name ?? params.sportCode;
    const title = `India in ${name} — Asian Games 2026 | Cheer4Bharat`;
    const description = `India's fixtures, live scores, results and squad in ${name} at the Asian Games 2026.`;
    return pageHead({ title, description, path: loaderData?.path ?? `/sports/${params.sportCode}` });
  },
  component: SportScreen,
});

function genderOf(item: AppItem) {
  const text = `${item.event_name ?? ""}`.toLowerCase();
  if (text.includes("women")) return "women";
  if (text.includes("men")) return "men";
  return "other";
}

function FixtureRow({ item, last }: { item: AppItem; last: boolean }) {
  const { t, tz } = usePrefs();
  const link = matchLink(item);
  const r = item.results[0];
  const tag = outcomeTag(r, t);
  const days = item.date_ist ? daysBetween(todayIst(), item.date_ist) : null;
  return (
    <Link to={link.to as never} params={link.params as never} style={{ display: "block", color: "inherit" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 0",
          minHeight: 44,
          borderBottom: last ? "0" : "1px solid var(--c-border)",
        }}
      >
        <span style={{ width: 78, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "var(--c-muted)", lineHeight: 1.3 }}>
          {zoneDayLabel(item.start_time, tz)}
          <span style={{ display: "block", fontSize: 13, color: "var(--c-saffron-text)", fontFamily: "var(--display)" }}>
            {zoneTime(item.start_time, tz)}
          </span>
          <span style={{ display: "block", fontSize: 10 }}>{tz}</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-ink)" }}>{titleOf(item)}</div>
          <div style={{ fontSize: 12, color: "var(--c-muted)" }}>{subtitleOf(item)}</div>
        </div>
        {item.is_live ? (
          <Tag kind="live">
            {t.live} {displayScore(item.sport_code, item.india_score)} – {displayScore(item.sport_code, item.opponent_score)}
          </Tag>
        ) : tag ? (
          <Tag kind={tag.kind}>{tag.label}</Tag>
        ) : days != null && days > 0 ? (
          <Tag kind="soft">{t.inDays(days)}</Tag>
        ) : (
          <Tag kind="soft">{t.upcoming}</Tag>
        )}
        <ChevronRight />
      </div>
    </Link>
  );
}

function SportScreen() {
  const { sportCode } = Route.useParams();
  const seed = Route.useLoaderData();
  const { t, tz } = usePrefs();
  const { openJeet } = useJeet();
  const { data, isLoading, isError, refetch } = useQuery(sportQuery(sportCode, seed));
  const iconCode = data?.code ?? seed?.code ?? sportCode;
  const [tab, setTab] = useState<"men" | "women" | "squad">("men");
  const [squadFilter, setSquadFilter] = useState("");

  const groups = useMemo(() => {
    const items = data?.items ?? [];
    return {
      men: items.filter((i) => genderOf(i) === "men"),
      women: items.filter((i) => genderOf(i) === "women"),
      other: items.filter((i) => genderOf(i) === "other"),
    };
  }, [data]);

  const options = useMemo(() => {
    const out: { value: "men" | "women" | "squad"; label: string }[] = [];
    if (groups.men.length) out.push({ value: "men", label: t.men });
    if (groups.women.length) out.push({ value: "women", label: t.women });
    if (!groups.men.length && !groups.women.length) out.push({ value: "men", label: t.events });
    if (data?.squad.length) out.push({ value: "squad", label: t.squad });
    return out;
  }, [groups, data, t]);

  const active = options.some((o) => o.value === tab) ? tab : (options[0]?.value ?? "men");
  const list =
    active === "women" ? groups.women : active === "men" ? [...groups.men, ...groups.other] : [];
  const featured = list.find((i) => i.is_live) ?? list.find((i) => !i.is_finished) ?? [...list].reverse().find((i) => i.is_finished);
  const featuredOutcome = featured ? outcomeTag(featured.results[0], t) : null;
  const featuredWhen = featured
    ? zoneDate(featured.start_time, tz) === todayInZone(tz)
      ? zoneTimeZ(featured.start_time, tz)
      : `${zoneDayLabel(featured.start_time, tz)} · ${zoneTimeZ(featured.start_time, tz)}`
    : "";

  return (
    <AppShell
      header={
        <BackHeader
          title={<span className="c4b-sport-title"><SportIcon code={iconCode} size={28} />{data?.name ?? sportCode}</span>}
          subtitle={[data?.venue, data ? t.athletes(data.squad.length) : null].filter(Boolean).join(" · ")}
          right={<TzPill compact />}
        />
      }
      jeetContext={{ page_type: "sport", sport: data?.name ?? sportCode, sportCode: iconCode }}
    >
      <div className="c4b-detail-grid" style={{ padding: "0 16px", gap: 12 }}>
        <div className="c4b-detail-page-heading"><span className="c4b-sport-icon-box"><SportIcon code={iconCode} size={28} /></span><span><strong>{data?.name ?? sportCode}</strong>{data ? <small>{[data.venue, t.athletes(data.squad.length)].filter(Boolean).join(" · ")}</small> : null}</span></div>
        {isError ? (
          <ErrorState text={t.somethingWrong} retryLabel={t.retry} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <>
            <Skeleton height={44} />
            <Skeleton height={120} />
            <Skeleton height={180} />
          </>
        ) : (
          <><div className="c4b-detail-grid c4b-desktop-span" style={{ gap: 12 }}><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {options.length > 1 ? <Segmented value={active} onChange={setTab} options={options} /> : null}

            {featured ? (
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {featured.is_live ? <Tag kind="live">{t.live}</Tag> : featured.is_finished ? (featuredOutcome ? <Tag kind={featuredOutcome.kind}>{featuredOutcome.label}</Tag> : null) : <Tag kind="soft">{t.upcoming}</Tag>}
                  <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{featuredWhen}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, color: "var(--c-ink)" }}>
                  {titleOf(featured)}
                </div>
                {displayScore(featured.sport_code, featured.india_score ?? featured.results[0]?.india_score) || displayScore(featured.sport_code, featured.opponent_score ?? featured.results[0]?.opponent_score) ? <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                  <span style={{ fontFamily: "var(--display)", fontSize: 38, fontWeight: 800, color: "var(--c-saffron-text)" }}>
                    {displayScore(featured.sport_code, featured.india_score ?? featured.results[0]?.india_score)}
                  </span>
                  <span style={{ fontFamily: "var(--display)", fontSize: 38, fontWeight: 800, color: "var(--c-ink)" }}>
                    {displayScore(featured.sport_code, featured.opponent_score ?? featured.results[0]?.opponent_score)}
                  </span>
                </div> : <div style={{ marginTop: 6, fontFamily: "var(--display)", fontSize: 24, fontWeight: 800, color: "var(--c-saffron-text)" }}>{featuredWhen}</div>}
                <div style={{ fontSize: 12.5, color: "var(--c-muted)" }}>{subtitleOf(featured)}</div>
              </Card>
            ) : null}

            <AskJeetStrip
              question={`Ask Jeet: How is India doing in ${data.name}?`}
              onAsk={() => openJeet({ page_type: "sport", sport: data.name, sportCode: iconCode })}
            />

            {active === "squad" ? (
              <Card padding="2px 16px">
                {data.squad.map((s, n) => (
                  <Link
                    key={s.reg}
                    to="/athlete/$reg"
                    params={athleteLink({ reg: s.reg, name: s.spoken_name ?? s.name, path: s.path }).params}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 0",
                      minHeight: 44,
                      borderBottom: n === data.squad.length - 1 ? "0" : "1px solid var(--c-border)",
                      color: "var(--c-ink)",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>
                        {s.spoken_name || s.name}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--c-muted)" }}>
                        {s.event_name ?? ""}
                      </span>
                    </span>
                    <ChevronRight />
                  </Link>
                ))}
              </Card>
            ) : (
              <>
                <h2 style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 800, margin: 0, color: "var(--c-ink)" }}>
                  {t.allMatches(active === "women" ? t.women : t.men)}
                </h2>
                {list.length ? (
                  <Card padding="2px 16px">
                    {list.map((i, n) => (
                      <FixtureRow key={`${i.sport_code}-${i.res_code}`} item={i} last={n === list.length - 1} />
                    ))}
                  </Card>
                ) : (
                  <Card>
                    <EmptyState text={t.emptyDay} />
                  </Card>
                )}
              </>
            )}
            </div>
            <Card padding="2px 16px" style={{ alignSelf: "start" }}>
              <div className="c4b-desktop-only" style={{ padding: "12px 0" }}>
                <input value={squadFilter} onChange={(e) => setSquadFilter(e.target.value)} placeholder={t.search} aria-label={t.search} style={{ width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--c-border)", background: "var(--c-tile)", color: "var(--c-ink)" }} />
              </div>
              <div className="c4b-squad-desktop">
                {data.squad.filter((s) => `${s.spoken_name ?? ""} ${s.name ?? ""} ${s.event_name ?? ""}`.toLowerCase().includes(squadFilter.toLowerCase())).map((s, n, arr) => <Link key={s.reg} to="/athlete/$reg" params={athleteLink({ reg: s.reg, name: s.spoken_name ?? s.name, path: s.path }).params} className="c4b-row-link" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: n === arr.length - 1 ? "0" : "1px solid var(--c-border)", color: "var(--c-ink)" }}><span style={{ flex: 1 }}><strong style={{ display: "block" }}>{s.spoken_name || s.name}</strong><small style={{ color: "var(--c-muted)" }}>{s.event_name}</small></span><ChevronRight /></Link>)}
              </div>
            </Card>
          </div></>
        )}
      </div>
    </AppShell>
  );
}
