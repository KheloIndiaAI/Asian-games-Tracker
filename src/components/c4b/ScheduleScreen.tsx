import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dayQuery, daysQuery, type DayData, type DaysData } from "@/lib/app-data";
import {
  dateLabelFull,
  dayOfMonth,
  istTime,
  medalTag,
  todayIst,
  weekdayShort,
} from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { AppShell } from "./AppShell";
import { Card, EmptyState, ErrorState, FilterChip, PageTitle, Skeleton } from "./ui";
import { LiveRow, NextRow, ResultRow } from "./rows";
import { matchHref, outcomeTag, subtitleOf, titleOf } from "./rows";
import { Tag } from "./ui";
import { zoneTimeZ } from "@/lib/format";
import { SportIcon } from "./sport-icons";

const GAMES_DATES = (() => {
  const out: string[] = [];
  let d = Date.parse("2026-09-19T00:00:00Z");
  const end = Date.parse("2026-10-04T00:00:00Z");
  while (d <= end) {
    out.push(new Date(d).toISOString().slice(0, 10));
    d += 86400000;
  }
  return out;
})();

export function ScheduleScreen({ date, seed }: { date: string; seed?: { tz: "IST" | "JST"; day: DayData; days: DaysData } | undefined }) {
  const { t, tz } = usePrefs();
  const [indiaOnly, setIndiaOnly] = useState(true);
  const [medalOnly, setMedalOnly] = useState(false);
  const [sport, setSport] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const daySeed = seed && indiaOnly ? { tz: seed.tz, data: seed.day } : undefined;
  const { data: days } = useQuery(daysQuery(tz, seed ? { tz: seed.tz, data: seed.days } : undefined));
  const { data, isLoading, isError, refetch } = useQuery(dayQuery(date, !indiaOnly, tz, daySeed));

  const sports = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of data?.items ?? []) m.set(i.sport_code, i.sport ?? i.sport_code);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (medalOnly) list = list.filter((i) => medalTag(i.medal_flag) !== null);
    if (sport) list = list.filter((i) => i.sport_code === sport);
    return indiaOnly ? list : list.slice(0, limit);
  }, [data, medalOnly, sport, indiaOnly, limit]);

  return (
    <AppShell jeetContext={{ page_type: "schedule" }}>
      <PageTitle title={t.schedule} subtitle={tz === "JST" ? t.scheduleTimesJst : t.scheduleTimesIst} />

      <div className="c4b-hide-scroll c4b-day-strip" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 16px 12px" }}>
        {GAMES_DATES.map((d) => {
          const count = days?.counts?.[d] ?? 0;
          const selected = d === date;
          return (
            <Link
              key={d}
              to="/schedule/$date"
              params={{ date: d }}
              ref={
                selected
                  ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" })
                  : undefined
              }
              style={{
                flexShrink: 0,
                width: 62,
                height: 72,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                alignContent: "center",
                gap: 1,
                background: selected ? "var(--c-saffron)" : "var(--c-card)",
                border: selected ? "0" : "1px solid var(--c-border)",
                color: selected ? "var(--c-on-saffron)" : "var(--c-ink)",
              }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 700, color: selected ? "var(--c-on-saffron)" : "var(--c-muted)" }}>
                {weekdayShort(d)}
              </span>
              <span style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 800 }}>{dayOfMonth(d)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: selected ? "var(--c-on-saffron)" : "var(--c-muted)" }}>
                {count ? `${count} IND` : t.drawSoon}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="c4b-hide-scroll c4b-filter-row" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 16px 12px" }}>
        <FilterChip on={indiaOnly} onClick={() => setIndiaOnly(true)}>
          {t.indiaOnly}
        </FilterChip>
        <FilterChip on={!indiaOnly} onClick={() => setIndiaOnly(false)}>
          {t.allCountries}
        </FilterChip>
        <FilterChip on={medalOnly} onClick={() => setMedalOnly((v) => !v)}>
          {t.medalEvents}
        </FilterChip>
        {sports.map(([code, name]) => (
          <FilterChip key={code} on={sport === code} onClick={() => setSport(sport === code ? null : code)}>
            {name}
          </FilterChip>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 16px 8px", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--c-ink)" }}>{dateLabelFull(date)}</span>
        <span style={{ fontSize: 12, color: "var(--c-muted)" }}>
          {t.indEvents(data?.india_count ?? 0, data?.total_count ?? 0)}
        </span>
      </div>

      <div className="c4b-schedule-mobile-list" style={{ padding: "0 16px" }}>
        {isError ? (
          <ErrorState text={t.somethingWrong} retryLabel={t.retry} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Card>
            <Skeleton height={54} />
            <div style={{ height: 8 }} />
            <Skeleton height={54} />
            <div style={{ height: 8 }} />
            <Skeleton height={54} />
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState text={t.emptyDay} />
          </Card>
        ) : (
          <Card padding="2px 16px">
            {items.map((i, n) =>
              i.is_live ? (
                <LiveRow key={`${i.sport_code}-${i.res_code}`} item={i} t={t} showTime last={n === items.length - 1} />
              ) : i.is_finished && i.has_india ? (
                <ResultRow key={`${i.sport_code}-${i.res_code}`} item={i} t={t} showTime last={n === items.length - 1} />
              ) : (
                <NextRow key={`${i.sport_code}-${i.res_code}`} item={i} t={t} last={n === items.length - 1} />
              ),
            )}
          </Card>
        )}
        {!indiaOnly && (data?.items?.length ?? 0) > limit ? (
          <button
            type="button"
            onClick={() => setLimit((l) => l + 50)}
            style={{
              marginTop: 12,
              width: "100%",
              minHeight: 44,
              borderRadius: 999,
              border: "1px solid var(--c-border)",
              background: "var(--c-card)",
              color: "var(--c-ink)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.loadMore}
          </button>
        ) : null}
      </div>
      {!isLoading && !isError && items.length ? <div className="c4b-schedule-table" style={{ padding: "0 16px" }}><Card padding={0}><table><colgroup><col style={{ width: "9rem" }} /><col /><col style={{ width: "9rem" }} /><col style={{ width: "11rem" }} /><col style={{ width: "10rem" }} /></colgroup><thead><tr><th>Time</th><th>Event</th><th>Sport</th><th>Phase</th><th>Status / Result</th></tr></thead><tbody>{items.map((i) => { const href=matchHref(i); const result=outcomeTag(i.results[0],t); const flag=medalTag(i.medal_flag); return <tr key={`${i.sport_code}-${i.res_code}`} onClick={() => { window.location.href = href; }}><td>{zoneTimeZ(i.start_time,tz)}</td><td><strong>{titleOf(i)}</strong>{flag ? <div><Tag kind="soft">{flag === "gold" ? t.goldMedalEvent : t.bronzeDecided}</Tag></div> : null}</td><td><span className="c4b-table-sport"><SportIcon code={i.sport_code} size={16} />{i.sport}</span></td><td>{i.phase_name}</td><td>{i.is_live ? <Tag kind="live">{t.live}</Tag> : result ? <Tag kind={result.kind}>{result.label}</Tag> : i.status_desc ?? i.status}</td></tr>})}</tbody></table></Card></div> : null}
    </AppShell>
  );
}

export { GAMES_DATES, todayIst, istTime };
