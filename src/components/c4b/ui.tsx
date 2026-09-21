import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs";
import { useVoiceEnabled } from "@/lib/voice-flag";
import { ChevronRight, Mic } from "./icons";

export const card: CSSProperties = {
  background: "var(--c-card)",
  border: "1px solid var(--c-border)",
  borderRadius: 18,
};

export function Card({
  children,
  style,
  padding = 16,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number | string;
  className?: string;
}) {
  return <div className={className} style={{ ...card, padding, ...style }}>{children}</div>;
}

export type TagKind = "win" | "neutral" | "gold" | "silver" | "bronze" | "live" | "soft";

const TAG_STYLES: Record<TagKind, CSSProperties> = {
  win: { background: "var(--c-live)", color: "var(--c-on-live)" },
  live: { background: "var(--c-live)", color: "var(--c-on-live)" },
  neutral: { background: "var(--c-chip)", color: "var(--c-on-chip)" },
  gold: { background: "var(--c-gold)", color: "#1A1204" },
  silver: { background: "var(--c-silver)", color: "var(--c-ink)" },
  bronze: { background: "var(--c-bronze)", color: "#1A1204" },
  soft: { background: "var(--c-track)", color: "var(--c-ink2)" },
};

export function Tag({ kind = "neutral", children }: { kind?: TagKind; children: ReactNode }) {
  return (
    <span
      style={{
        ...TAG_STYLES[kind],
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.3,
        padding: "3px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}

/** India time | Japan time switch. */
export function TzPill({ compact = false }: { compact?: boolean }) {
  const { tz, setTz, t } = usePrefs();
  const options: { v: "IST" | "JST"; label: string }[] = [
    { v: "IST", label: compact ? "IST" : t.indiaTime },
    { v: "JST", label: compact ? "JST" : t.japanTime },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t.timeZone}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 3,
        padding: 3,
        borderRadius: 999,
        background: "var(--c-track)",
        width: compact ? 116 : "100%",
        height: compact ? 34 : 40,
        flexShrink: 0,
      }}
    >
      {options.map((o) => {
        const on = tz === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTz(o.v)}
            style={{
              borderRadius: 999,
              border: 0,
              cursor: "pointer",
              background: on ? "var(--c-saffron)" : "transparent",
              color: on ? "var(--c-on-saffron)" : "var(--c-ink2)",
              fontWeight: on ? 800 : 600,
              fontSize: compact ? 11.5 : 13,
              fontFamily: "var(--body)",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="c4b-page-title" style={{ padding: "8px 16px 12px" }}>
      <h1 style={{ fontFamily: "var(--display)", fontSize: "clamp(1.625rem,2.5vw,2.25rem)", fontWeight: 800, margin: 0, color: "var(--c-ink)" }}>
        {title}
      </h1>
      {subtitle ? (
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--c-muted)" }}>{subtitle}</p>
      ) : null}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
      <div className="c4b-row-link"
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "var(--c-muted)",
        margin: "0 0 8px",
      }}
    >
      {children}
    </div>
  );
}

export function AskJeetStrip({
  question,
  onAsk,
}: {
  question: string;
  onAsk: () => void;
}) {
  const voiceOn = useVoiceEnabled();
  if (!voiceOn) return null;
  return (
    <button
      type="button"
      onClick={onAsk}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        minHeight: 48,
        padding: "12px 14px",
        background: "var(--c-jeet)",
        border: "1.5px solid var(--c-saffron)",
        borderRadius: 16,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          background: "var(--c-saffron)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Mic size={16} />
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--c-ink)", lineHeight: 1.35 }}>
        {question}
      </span>
    </button>
  );
}

export function RowLink({
  to,
  params,
  children,
  onClick,
}: {
  to?: string;
  params?: Record<string, string>;
  children: ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 0",
        minHeight: 44,
        borderBottom: "1px solid var(--c-border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <ChevronRight />
    </div>
  );
  if (to) {
    return (
      <Link to={to as never} params={params as never} style={{ display: "block", color: "inherit" }}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} style={{ display: "block", width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", color: "inherit", cursor: "pointer" }}>
      {inner}
    </button>
  );
}

export function Skeleton({ height = 64, style }: { height?: number; style?: CSSProperties }) {
  return <div className="c4b-skel" style={{ height, ...style }} />;
}

export function EmptyState({ text }: { text: string }) {
  return (
    <p style={{ margin: 0, padding: "18px 2px", fontSize: 13.5, color: "var(--c-muted)", lineHeight: 1.5 }}>
      {text}
    </p>
  );
}

export function ErrorState({ text, retryLabel, onRetry }: { text: string; retryLabel: string; onRetry: () => void }) {
  return (
    <Card>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--c-muted)" }}>{text}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 12,
          minHeight: 44,
          padding: "10px 18px",
          borderRadius: 999,
          border: 0,
          background: "var(--c-saffron)",
          color: "var(--c-on-saffron)",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {retryLabel}
      </button>
    </Card>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 4,
        padding: 4,
        background: "var(--c-track)",
        borderRadius: 999,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              minHeight: 36,
              borderRadius: 999,
              border: 0,
              background: active ? "var(--c-saffron)" : "transparent",
              color: active ? "var(--c-on-saffron)" : "var(--c-ink2)",
              fontWeight: active ? 800 : 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {o.label}
            {o.count != null ? ` ${o.count}` : ""}
          </button>
        );
      })}
    </div>
  );
}

export function FilterChip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        minHeight: 36,
        padding: "8px 14px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        cursor: "pointer",
        border: on ? "1px solid var(--c-ink)" : "1px solid var(--c-border)",
        background: on ? "var(--c-ink)" : "var(--c-card)",
        color: on ? "var(--c-card)" : "var(--c-ink)",
        fontWeight: on ? 800 : 600,
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
