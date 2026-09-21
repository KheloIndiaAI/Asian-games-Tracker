import { Link } from "@tanstack/react-router";
import type { AppItem, AppResult } from "@/lib/app-data";
import { displayScore, medalTag, zoneDayLabel, zoneTime, zoneTimeZ } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import type { Dict } from "@/lib/i18n";
import { matchLinkFromPath } from "@/lib/slug";
import { ChevronRight } from "./icons";
import { Tag, type TagKind } from "./ui";

export function matchLink(item: { sport_code: string; res_code: string; path?: string | null }) {
  if (item.path) return matchLinkFromPath(item.path);
  return { to: "/match/$sportCode/$resCode", params: { sportCode: item.sport_code, resCode: item.res_code } };
}

export function matchHref(item: { sport_code: string; res_code: string; path?: string | null }) {
  return item.path ?? `/match/${item.sport_code}/${encodeURIComponent(item.res_code)}`;
}

export function titleOf(item: AppItem) {
  if (item.is_h2h && item.opponent_name) {
    return `${item.india_name ?? "India"} v ${item.opponent_name}`;
  }
  const names = item.results.map((r) => r.spoken_name || r.athlete_or_team).filter(Boolean);
  if (names.length === 1) return names[0] as string;
  if (names.length > 1) return `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
  return item.event_name ?? item.sport ?? item.sport_code;
}

export function subtitleOf(item: AppItem) {
  const bits = [item.sport ?? item.sport_code, [item.event_name, item.phase_name].filter(Boolean).join(", ")];
  return bits.filter(Boolean).join(" · ");
}

export function outcomeTag(r: AppResult | undefined, t: Dict): { kind: TagKind; label: string } | null {
  if (!r) return null;
  if (r.medal === "gold") return { kind: "gold", label: t.gold };
  if (r.medal === "silver") return { kind: "silver", label: t.silver };
  if (r.medal === "bronze") return { kind: "bronze", label: t.bronze };
  if (r.outcome === "won") return { kind: "win", label: t.won };
  if (r.outcome === "lost") return { kind: "neutral", label: t.lost };
  if (r.outcome === "draw") return { kind: "neutral", label: t.drew };
  if (r.qualified) return { kind: "win", label: t.qualified };
  return null;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 0",
  minHeight: 44,
};

export function LiveRow({ item, t, last, showTime = false }: { item: AppItem; t: Dict; last?: boolean; showTime?: boolean }) {
  const { tz } = usePrefs();
  const link = matchLink(item);
  const india = displayScore(item.sport_code, item.india_score ?? item.results[0]?.india_score);
  const opp = displayScore(item.sport_code, item.opponent_score ?? item.results[0]?.opponent_score);
  return (
    <Link to={link.to as never} params={link.params as never} style={{ color: "inherit", display: "block" }}>
      <div className="c4b-row-link" style={{ ...rowStyle, borderBottom: last ? "0" : "1px solid var(--c-border)" }}>
        {showTime ? <span style={{ width: 70, flexShrink: 0, fontFamily: "var(--display)", fontSize: 13.5, fontWeight: 800, color: "var(--c-saffron-text)" }}>{zoneTimeZ(item.start_time, tz)}</span> : <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--c-live)", flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--c-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {titleOf(item)}
          </div>
          <div style={{ fontSize: 12, color: "var(--c-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitleOf(item)}
          </div>
        </div>
        {india || opp ? (
          <span style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 800, color: "var(--c-ink)", whiteSpace: "nowrap" }}>
            {india || "–"} <span style={{ color: "var(--c-muted)" }}>·</span> {opp || "–"}
          </span>
        ) : (
          <Tag kind="live">{t.live}</Tag>
        )}
        <ChevronRight />
      </div>
    </Link>
  );
}

export function NextRow({ item, t, last, showDate = false }: { item: AppItem; t: Dict; last?: boolean; showDate?: boolean }) {
  const { tz } = usePrefs();
  const link = matchLink(item);
  const flag = medalTag(item.medal_flag);
  return (
    <Link to={link.to as never} params={link.params as never} style={{ color: "inherit", display: "block" }}>
      <div className="c4b-row-link" style={{ ...rowStyle, alignItems: "flex-start", borderBottom: last ? "0" : "1px solid var(--c-border)" }}>
        <span
          style={{
            width: 78,
            flexShrink: 0,
            fontFamily: "var(--display)",
            color: "var(--c-saffron-text)",
            paddingTop: 1,
            lineHeight: 1.25,
          }}
        >
          {showDate ? (
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--c-muted)" }}>
              {zoneDayLabel(item.start_time, tz)}
            </span>
          ) : null}
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 800 }}>
            {zoneTime(item.start_time, tz)}
          </span>
          <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--c-muted)" }}>
            {tz}
          </span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--c-ink)" }}>{titleOf(item)}</span>
            {flag ? <Tag kind="soft">{flag === "gold" ? t.goldMedalEvent : t.bronzeDecided}</Tag> : null}
          </div>
          <div style={{ fontSize: 12, color: "var(--c-muted)" }}>{subtitleOf(item)}</div>
        </div>
        <ChevronRight />
      </div>
    </Link>
  );
}

export function ResultRow({
  item,
  result,
  t,
  last,
  showTime = false,
}: {
  item: AppItem;
  result?: AppResult;
  t: Dict;
  last?: boolean;
  showTime?: boolean;
}) {
  const { tz } = usePrefs();
  const r = result ?? item.results[0];
  const tag = outcomeTag(r, t);
  const india = displayScore(item.sport_code, r?.india_score);
  const opp = displayScore(item.sport_code, r?.opponent_score);
  const line =
    item.is_h2h && (india || opp)
      ? `${r?.spoken_name || "India"} ${india || "–"} – ${opp || "–"} ${r?.opponent_country_name ?? item.opponent_name ?? ""}`
      : [r?.spoken_name, r?.result_mark, r?.rank ? `Rank ${r.rank}` : null].filter(Boolean).join(" · ") ||
        titleOf(item);
  return (
    <Link to={matchLink(item).to as never} params={matchLink(item).params as never} style={{ color: "inherit", display: "block" }}>
      <div className="c4b-row-link" style={{ ...rowStyle, borderBottom: last ? "0" : "1px solid var(--c-border)" }}>
        {showTime ? <span style={{ width: 70, flexShrink: 0, fontFamily: "var(--display)", fontSize: 13.5, fontWeight: 800, color: "var(--c-saffron-text)" }}>{zoneTimeZ(item.start_time, tz)}</span> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--c-ink)" }}>{line}</div>
          <div style={{ fontSize: 12, color: "var(--c-muted)" }}>{subtitleOf(item)}</div>
        </div>
        {tag ? <Tag kind={tag.kind}>{tag.label}</Tag> : null}
        <ChevronRight />
      </div>
    </Link>
  );
}
