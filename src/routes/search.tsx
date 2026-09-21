import { useMemo, useRef, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, BackHeader } from "@/components/c4b/AppShell";
import { Card, EmptyState, SectionLabel, Skeleton, TzPill } from "@/components/c4b/ui";
import { ChevronRight, Search as SearchIcon } from "@/components/c4b/icons";
import { SportIcon } from "@/components/c4b/sport-icons";
import { searchQuery } from "@/lib/app-data";
import { usePrefs } from "@/lib/prefs";
import { pageHead } from "@/lib/seo";
import { athleteLink, sportLink } from "@/lib/slug";

const TITLE = "Search Indian athletes, sports and events — Asian Games 2026 | Cheer4Bharat";
const DESCRIPTION =
  "Find any Indian athlete, sport or event at the Asian Games 2026 and jump straight to their schedule, live scores and results.";

export const Route = createFileRoute("/search")({
  head: () => pageHead({ title: TITLE, description: DESCRIPTION, path: "/search" }),
  component: SearchScreen,
});

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'`’]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matches(haystack: string, words: string[]): boolean {
  const h = norm(haystack);
  return words.every((w) => h.includes(w));
}

function Group({
  label,
  count,
  children,
  shown,
  onMore,
  moreLabel,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  shown: number;
  onMore: () => void;
  moreLabel: string;
}) {
  if (!count) return null;
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <Card padding="2px 16px">{children}</Card>
      {count > shown ? (
        <button
          type="button"
          onClick={onMore}
          style={{
            marginTop: 8,
            minHeight: 44,
            background: "none",
            border: 0,
            color: "var(--c-saffron-text)",
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
            padding: "0 4px",
          }}
        >
          {moreLabel}
        </button>
      ) : null}
    </div>
  );
}

function Row({
  title,
  sub,
  last,
  to,
  params,
  sportCode,
}: {
  title: string;
  sub: string;
  last: boolean;
  to: string;
  params: Record<string, string>;
  sportCode?: string;
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className="c4b-search-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 0",
        minHeight: 44,
        borderBottom: last ? "0" : "1px solid var(--c-border)",
        color: "var(--c-ink)",
      }}
    >
      {sportCode ? <SportIcon code={sportCode} size={18} /> : null}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--c-muted)" }}>{sub}</span>
      </span>
      <ChevronRight />
    </Link>
  );
}

function SearchScreen() {
  const { t } = usePrefs();
  const { data, isLoading } = useQuery(searchQuery());
  const [q, setQ] = useState("");
  const [limits, setLimits] = useState({ athletes: 20, sports: 20, events: 20 });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const words = useMemo(() => norm(q).split(" ").filter(Boolean), [q]);

  const hits = useMemo(() => {
    if (!words.length || !data) return { athletes: [], sports: [], events: [] };
    return {
      athletes: data.athletes.filter(
        (a) => matches(a.name, words) || (a.raw_name ? matches(a.raw_name, words) : false),
      ),
      sports: data.sports.filter((s) => matches(s.name, words)),
      events: data.events.filter((e) => matches(`${e.event_name} ${e.sport}`, words)),
    };
  }, [data, words]);

  const total = hits.athletes.length + hits.sports.length + hits.events.length;

  return (
    <AppShell
      header={<BackHeader title={t.search} right={<TzPill compact />} />}
      jeetContext={{ page_type: "search" }}
    >
      <div className="c4b-search-column" style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 14 }}>
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
          <SearchIcon />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchHint}
            aria-label={t.search}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: "var(--c-ink)",
            }}
          />
        </label>

        {isLoading ? (
          <Skeleton height={120} />
        ) : !words.length ? (
          <Card>
            <EmptyState text={t.searchEmpty} />
          </Card>
        ) : total === 0 ? (
          <Card>
            <EmptyState text={t.searchNone} />
          </Card>
        ) : (
          <div className="c4b-search-groups">
            <Group
              label={t.groupAthletes}
              count={hits.athletes.length}
              shown={limits.athletes}
              moreLabel={t.showMore}
              onMore={() => setLimits((l) => ({ ...l, athletes: l.athletes + 20 }))}
            >
              {hits.athletes.slice(0, limits.athletes).map((a, n, arr) => (
                <Row
                  key={a.reg}
                  title={a.name}
                  sub={`${a.sport} · ${t.eventsEntered(a.events)}`}
                  last={n === arr.length - 1}
                  to="/athlete/$reg"
                  params={athleteLink({ reg: a.reg, name: a.name, path: a.path }).params}
                />
              ))}
            </Group>

            <Group
              label={t.groupSports}
              count={hits.sports.length}
              shown={limits.sports}
              moreLabel={t.showMore}
              onMore={() => setLimits((l) => ({ ...l, sports: l.sports + 20 }))}
            >
              {hits.sports.slice(0, limits.sports).map((s, n, arr) => (
                <Row
                  key={s.code}
                  title={s.name}
                  sub={t.sports}
                  last={n === arr.length - 1}
                  to="/sports/$sportCode"
                  params={sportLink({ code: s.code, name: s.name, path: s.path }).params}
                   sportCode={s.code}
                />
              ))}
            </Group>

            <Group
              label={t.groupEvents}
              count={hits.events.length}
              shown={limits.events}
              moreLabel={t.showMore}
              onMore={() => setLimits((l) => ({ ...l, events: l.events + 20 }))}
            >
              {hits.events.slice(0, limits.events).map((e, n, arr) => (
                <Row
                  key={`${e.sport_code}-${e.event_code}`}
                  title={e.event_name}
                  sub={e.sport}
                  last={n === arr.length - 1}
                  to="/sports/$sportCode"
                  params={sportLink({ code: e.sport_code, name: e.sport, path: e.path }).params}
                   sportCode={e.sport_code}
                />
              ))}
            </Group>
          </div>
        )}
      </div>
    </AppShell>
  );
}
