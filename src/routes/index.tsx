import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/c4b/AppShell";
import { useJeet } from "@/components/c4b/JeetProvider";
import { Card, EmptyState, ErrorState, Segmented, Skeleton, Tag } from "@/components/c4b/ui";
import { LiveRow, NextRow, ResultRow, matchLink } from "@/components/c4b/rows";
import { ChevronRight, Mic, Search } from "@/components/c4b/icons";
import { SportIcon } from "@/components/c4b/sport-icons";
import { todayQuery } from "@/lib/app-data";
import { medalTag, minutesAgo, zoneDayLabel, zoneTimeZ } from "@/lib/format";
import { useVoiceEnabled } from "@/lib/voice-flag";
import { usePrefs } from "@/lib/prefs";
import { pageHead } from "@/lib/seo";
import { sportLink } from "@/lib/slug";

const TITLE = "Cheer4Bharat — India at the Asian Games 2026";
const DESCRIPTION =
  "Live scores, schedule, results and medals for every Indian athlete at the Asian Games 2026 in Aichi-Nagoya. India time or Japan time.";

export const Route = createFileRoute("/")({
  head: () => pageHead({ title: TITLE, description: DESCRIPTION }),
  loader: async ({ context }) => ({ tz: "IST" as const, data: await context.queryClient.ensureQueryData(todayQuery("IST")) }),
  component: TodayScreen,
});

function MedalDot({ color }: { color: string }) {
  return <span style={{ width: 9, height: 9, borderRadius: 999, background: color, display: "inline-block" }} />;
}

function NextGroups({ groups, t }: { groups: any[]; t: any }) {
  const { tz } = usePrefs();
  return <>{groups.map((group) => <section key={group.date}><div className="c4b-day-heading">{group.label_key === "today" ? t.laterToday : group.label_key === "tomorrow" ? `${t.tomorrow} · ${zoneDayLabel(group.items[0]?.start_time, tz)}` : zoneDayLabel(group.items[0]?.start_time, tz)}</div>{group.items.map((item: any, index: number) => <NextRow key={item.res_code} item={item} t={t} last={index === group.items.length - 1} showDate={false} />)}</section>)}</>;
}

function DesktopListCard({ title, count, items, empty, kind, t, groups, date }: { title: string; count: number; items: any[]; empty: string; kind: "live"|"next"|"results"; t: any; groups?: any[]; date: string }) {
  return <Card className="c4b-today-list-card" padding={0}><div className="c4b-list-card-head"><strong>{title}</strong><Tag kind="soft">{count}</Tag></div><div className="c4b-inner-scroll">{kind === "next" && groups ? <NextGroups groups={groups} t={t} /> : items.length ? items.map((i,n) => kind === "live" ? <LiveRow key={i.res_code} item={i} t={t} last={n===items.length-1} /> : <ResultRow key={i.res_code} item={i} t={t} last={n===items.length-1} />) : <EmptyState text={empty} />}</div>{kind === "next" && items.length ? <Link className="c4b-list-card-foot" to="/schedule/$date" params={{ date: groups?.[0]?.date ?? date }}>See all <ChevronRight /></Link> : null}</Card>;
}

function CountdownLine({ item, seconds, t, tz }: { item: any; seconds: number | null; t: any; tz: any }) {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => { setLeft(seconds ?? 0); const id=window.setInterval(()=>setLeft(v=>Math.max(0,v-30)),30000); return()=>window.clearInterval(id); },[seconds]);
  const when = left < 60 ? t.startingNow : left < 3600 ? `${Math.ceil(left/60)} min` : `${Math.floor(left/3600)} h ${Math.ceil((left%3600)/60)} min`;
  if (!item) return <span>{t.nothingLive}</span>;
  const link = matchLink(item).params;
  return <span><span className="c4b-offline-dot" /> {t.nothingLive} · <Link to="/match/$sportCode/$resCode" params={link}>{t.nextEventIn(when)}: {item.sport} · {item.event_name} · {zoneTimeZ(item.start_time,tz)}</Link></span>;
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 14px 14px 16px",
  borderRadius: 18,
  background: "var(--c-jeet)",
  border: "1.5px solid var(--c-saffron)",
  textAlign: "left",
  cursor: "pointer",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--c-saffron-text)",
};
const bigStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--display)",
  fontSize: 22,
  lineHeight: 1.12,
  fontWeight: 800,
  color: "var(--c-ink)",
  marginTop: 2,
};
const circleStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 999,
  background: "var(--c-saffron)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

function TodayScreen() {
  const { t, lang, tz } = usePrefs();
  const { openJeet } = useJeet();
  const voice = useVoiceEnabled();
  const seed = Route.useLoaderData();
  const { data, isLoading, isError, refetch } = useQuery(todayQuery(tz, undefined, seed));
  const [tab, setTab] = useState<"live" | "next" | "results" | null>(null);
  const [rotate, setRotate] = useState(0);
  const [banner, setBanner] = useState(false);
  const [lastTotal, setLastTotal] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setRotate((r) => r + 1), 6000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const total = data?.medals?.total ?? null;
    if (total == null) return;
    setLastTotal((prev) => {
      if (prev != null && total > prev) setBanner(true);
      return total;
    });
  }, [data?.medals?.total]);

  const active = tab ?? (data && data.counts.live > 0 ? "live" : "next");

  const questions = useMemo(() => {
    const list: string[] = [];
    const liveSport = data?.live?.[0]?.sport;
    if (liveSport) list.push(`What's the ${liveSport} score?`);
    const medalEvent = [...(data?.next ?? [])].find((i) => medalTag(i.medal_flag) !== null);
    if (medalEvent) list.push(`When is the ${medalEvent.sport} medal event?`);
    list.push("How many medals does India have?");
    list.push("आज भारत के कौन से मैच हैं?");
    return list;
  }, [data]);

  const mins = minutesAgo(data?.as_of);
  const nextGroup = data?.next_groups?.[0];

  return (
    <AppShell today jeetContext={{ page_type: "today" }}>
      <div className="c4b-today-screen">
        {banner ? (
          <Link
            to="/medals"
            onClick={() => setBanner(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 999,
              background: "var(--c-live)",
              color: "var(--c-on-live)",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {t.newMedal}
            <ChevronRight color="var(--c-on-live)" />
          </Link>
        ) : null}

        {/* medal strip */}
        <Link className="c4b-phone-tablet-only"
          to="/medals"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderRadius: 999,
            background: "var(--c-card)",
            border: "1px solid var(--c-border)",
            color: "var(--c-ink)",
            minHeight: 44,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 800, fontFamily: "var(--display)" }}>
            <MedalDot color="var(--c-gold)" /> {data?.medals?.gold ?? 0}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 800, fontFamily: "var(--display)" }}>
            <MedalDot color="var(--c-silver)" /> {data?.medals?.silver ?? 0}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 800, fontFamily: "var(--display)" }}>
            <MedalDot color="var(--c-bronze)" /> {data?.medals?.bronze ?? 0}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--c-muted)", textAlign: "right" }}>
            {t.indiaRank(String(data?.medals?.rank ?? "—"))}
          </span>
          <ChevronRight />
        </Link>

        {/* Jeet invitation / search invitation */}
        {voice ? (
          <button
            type="button"
            onClick={() => openJeet({ page_type: "today" })}
            style={cardStyle}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={labelStyle}>{t.jeetGreeting}</span>
              <span style={bigStyle}>Don't scroll. Just ask me:</span>
              <span style={{ display: "block", fontSize: 15, color: "var(--c-saffron-text)", fontWeight: 600, marginTop: 3 }}>
                “{questions[rotate % questions.length]}”
              </span>
              <span style={{ display: "block", fontSize: 12, color: "var(--c-muted)", marginTop: 4, fontFamily: "var(--deva)" }}>
                {t.jeetLangs}
              </span>
            </span>
            <span style={circleStyle}>
              <Mic size={24} color="var(--c-on-saffron)" />
            </span>
          </button>
        ) : (
          <Link to="/search" style={{ ...cardStyle, color: "var(--c-ink)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={labelStyle}>Cheer4Bharat</span>
              <span style={bigStyle}>{t.findAthlete}</span>
              <span style={{ display: "block", fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>
                {t.searchHint}
              </span>
            </span>
            <span style={circleStyle}>
              <Search size={24} color="var(--c-on-saffron)" strokeWidth={2.4} />
            </span>
          </Link>
        )}

        {/* sport rail */}
        {data?.rail?.length ? (
          <div className="c4b-phone-tablet-only">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--c-ink)" }}>{t.jumpToSport}</span>
              <Link to="/sports" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--c-saffron-text)" }}>
                {t.allSports()}
              </Link>
            </div>
            <div className="c4b-hide-scroll c4b-home-sport-rail" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              {data.rail.map((s) => (
                <Link
                  key={s.code}
                  to="/sports/$sportCode"
                  params={sportLink(s).params}
                  style={{
                    flexShrink: 0,
                    minWidth: 96,
                    height: 58,
                    padding: "8px 10px",
                    borderRadius: 14,
                    background: "var(--c-card)",
                    border: "1px solid var(--c-border)",
                    color: "var(--c-ink)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    gap: 3,
                  }}
                >
                  <span style={{ display:"flex",alignItems:"center",gap:5,fontSize: 13, fontWeight: 700, color: "var(--c-ink)", whiteSpace: "nowrap" }}><SportIcon code={s.code} size={20}/>{s.name}</span>
                  {s.live ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--c-live-text)", fontSize: 11, fontWeight: 800 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--c-live)" }} />
                      {t.live}
                    </span>
                  ) : s.next_start ? (
                    <span style={{ color: "var(--c-saffron-text)", fontSize: 11.5, fontWeight: 800 }}>
                      {s.next_date === data.date ? zoneTimeZ(s.next_start, tz) : s.next_date === data.next_groups.find((g) => g.label_key === "tomorrow")?.date ? `${t.tomorrow} ${zoneTimeZ(s.next_start, tz)}` : zoneDayLabel(s.next_start, tz)}
                    </span>
                  ) : <span style={{ color: "var(--c-muted)", fontSize: 11 }}>{lang === "hi" ? "पूर्ण" : "Done"}</span>}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {/* switch card */}
        <div className="c4b-phone-tablet-only">{isError ? (
          <ErrorState text={t.somethingWrong} retryLabel={t.retry} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <Card>
            <Skeleton height={36} />
            <div style={{ height: 10 }} />
            <Skeleton height={54} />
            <div style={{ height: 8 }} />
            <Skeleton height={54} />
          </Card>
        ) : (
          <Card className="c4b-mobile-switch-card" padding={0}>
            <div className="c4b-list-card-head">
            <Segmented
              value={active}
              onChange={setTab}
              options={[
                { value: "live", label: t.liveWord, count: data.counts.live },
                { value: "next", label: t.next, count: data.counts.next },
                { value: "results", label: `${t.results} · ${data.results_day === "yesterday" ? t.yesterday : t.today}`, count: data.counts.results },
              ]}
            />
            </div><div className="c4b-inner-scroll">
              {active === "live" &&
                (data.live.length ? (
                  data.live.map((i, n) => <LiveRow key={i.res_code} item={i} t={t} last={n === data.live.length - 1} />)
                ) : (
                  <div className="c4b-empty-live"><CountdownLine item={data.up_next} seconds={data.next_in_seconds} t={t} tz={tz}/></div>
                ))}
              {active === "next" &&
                (data.next.length ? (
                  <NextGroups groups={data.next_groups} t={t} />
                ) : (
                  <Link to="/medals">{t.eventsComplete}</Link>
                ))}
              {active === "results" &&
                (data.results.length ? (
                  data.results.map((i, n) => <ResultRow key={i.res_code} item={i} t={t} last={n === data.results.length - 1} />)
                ) : (
                  <EmptyState text={t.emptyResults} />
                ))}
            </div>

            {active === "live" && data.live.length > 0 && data.up_next ? (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid var(--c-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "var(--c-muted)" }}>
                  {t.upNext}
                </span>
                <Link
                  to="/match/$sportCode/$resCode"
                  params={matchLink(data.up_next).params}
                  style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--c-ink)" }}
                >
                  {data.up_next.india_name ?? data.up_next.event_name} · {zoneTimeZ(data.up_next.start_time, tz)}
                </Link>
                {medalTag(data.up_next.medal_flag) === "gold" ? (
                  <Tag kind="soft">{t.goldMedalEvent}</Tag>
                ) : medalTag(data.up_next.medal_flag) === "bronze" ? (
                  <Tag kind="soft">{t.bronzeDecided}</Tag>
                ) : null}
              </div>
            ) : null}

            <div className="c4b-list-card-foot">
              <Link
                to="/schedule/$date"
                 params={{ date: active === "next" ? data.next_groups[0]?.date ?? data.date : data.date }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "var(--c-saffron-text)", minHeight: 44 }}
              >
                {active === "results"
                  ? t.seeAllResults(data.counts.results)
                  : active === "live"
                    ? t.seeAllLive(data.counts.live)
                    : nextGroup && nextGroup.label_key !== "today"
                      ? nextGroup.label_key === "tomorrow"
                        ? t.seeAllTomorrow(data.counts.next)
                        : t.seeAllOnDay(data.counts.next, zoneDayLabel(nextGroup.items[0]?.start_time ?? null, tz))
                      : t.seeAllUpcoming(data.counts.next)}
                <ChevronRight color="var(--c-saffron-text)" />
              </Link>
              {mins != null ? <small>{t.updatedAgo(mins)}</small> : null}</div>
          </Card>
        )}</div>

        {data ? <div className="c4b-desktop-only c4b-today-desktop"><div className="c4b-today-layout"><div className="c4b-today-main">{!data.live.length ? <div className="c4b-live-banner"><CountdownLine item={data.up_next} seconds={data.next_in_seconds} t={t} tz={tz}/></div> : null}<div className={`c4b-today-three ${data.live.length ? "has-live" : "no-live"}`}>{data.live.length ? <DesktopListCard title={t.liveWord} count={data.counts.live} items={data.live} empty={t.emptyLive} kind="live" t={t} date={data.date} /> : null}<DesktopListCard title={t.next} count={data.counts.next} items={data.next} groups={data.next_groups} empty={t.eventsComplete} kind="next" t={t} date={data.date} /><DesktopListCard title={`${t.results} · ${data.results_day === "yesterday" ? t.yesterday : t.today}`} count={data.counts.results} items={data.results} empty={t.emptyResults} kind="results" t={t} date={data.date} /></div></div><aside className="c4b-today-rail"><Link to="/medals" style={{ ...cardStyle, background: "var(--c-card)", border: "1px solid var(--c-border)" }}><span style={{ flex: 1 }}><span style={labelStyle}>{t.medals}</span><span style={bigStyle}>{data.medals.total}</span><span style={{ color: "var(--c-muted)" }}>{data.medals.gold} gold · {data.medals.silver} silver · {data.medals.bronze} bronze · {t.indiaRank(String(data.medals.rank ?? "—"))}</span></span><ChevronRight /></Link>{data.up_next ? <Card><strong style={{ fontFamily: "var(--display)" }}>{t.upNext}</strong><NextRow item={data.up_next} t={t} last /></Card> : null}<Card className="c4b-jump-card"><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><strong>{t.jumpToSport}</strong><Link to="/sports">{t.allSports()}</Link></div><div className="c4b-sport-rail">{data.rail.map((s) => <Link key={s.code} to="/sports/$sportCode" params={sportLink(s).params} className="c4b-sport-tile" style={{ padding: 10, border: "1px solid var(--c-border)", borderRadius: 14, color: "var(--c-ink)" }}><strong style={{display:"flex",alignItems:"center",gap:5}}><SportIcon code={s.code} size={20}/>{s.name}</strong><small style={{ display: "block", color: s.live ? "var(--c-live-text)" : "var(--c-muted)" }}>{s.live ? t.live : s.next_start ? (s.next_date === data.date ? zoneTimeZ(s.next_start,tz) : s.next_date === data.next_groups.find((g) => g.label_key === "tomorrow")?.date ? `${t.tomorrow} ${zoneTimeZ(s.next_start,tz)}` : zoneDayLabel(s.next_start,tz)) : "Done"}</small></Link>)}</div></Card></aside></div></div> : null}

        {mins != null ? (
          <p className="c4b-desktop-only" style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--c-muted)", textAlign: "center" }}>
            {t.updatedAgo(mins)}
            {lang === "en" ? "" : ""}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
