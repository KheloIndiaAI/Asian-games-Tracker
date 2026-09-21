import { usePrefs, type ThemeChoice } from "@/lib/prefs";
import type { Tz } from "@/lib/format";
import { useVoiceEnabled } from "@/lib/voice-flag";
import type { Lang } from "@/lib/i18n";
import { Sheet } from "./Sheet";
import { SectionLabel } from "./ui";
import { Check } from "./icons";

function Option({
  label,
  sub,
  selected,
  onClick,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        minHeight: 56,
        padding: "12px 14px",
        marginBottom: 8,
        borderRadius: 14,
        cursor: "pointer",
        textAlign: "left",
        border: selected ? "2px solid var(--c-saffron)" : "1px solid var(--c-border)",
        background: selected ? "var(--c-jeet)" : "var(--c-tile)",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--c-ink)" }}>
          {label}
        </span>
        <span style={{ display: "block", fontSize: 12.5, color: "var(--c-muted)" }}>{sub}</span>
      </span>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background: selected ? "var(--c-saffron)" : "transparent",
          border: selected ? "0" : "2px solid var(--c-handle)",
        }}
      >
        {selected ? <Check /> : null}
      </span>
    </button>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme, lang, setLang, tz, setTz, t } = usePrefs();
  const voice = useVoiceEnabled();

  const themes: { v: ThemeChoice; label: string; sub: string }[] = [
    { v: "light", label: t.light, sub: t.lightSub },
    { v: "dark", label: t.dark, sub: t.darkSub },
    { v: "auto", label: t.auto, sub: t.autoSub },
  ];
  const langs: { v: Lang; label: string; sub: string }[] = [
    { v: "en", label: t.english, sub: t.englishSub },
    { v: "hi", label: t.hindi, sub: t.hindiSub },
  ];

  const zones: { v: Tz; label: string; sub: string }[] = [
    { v: "IST", label: t.indiaTime, sub: t.scheduleTimesIst },
    { v: "JST", label: t.japanTime, sub: t.scheduleTimesJst },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      height={620}
      closeLabel={t.close}
      title={
        <span style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 800, color: "var(--c-ink)" }}>
          {t.display}
        </span>
      }
    >
      <div className="c4b-settings-content" style={{ padding: 16 }}>
        <SectionLabel>{t.appearance}</SectionLabel>
        <div role="radiogroup" aria-label={t.appearance}>
          {themes.map((o) => (
            <Option
              key={o.v}
              label={o.label}
              sub={o.sub}
              selected={theme === o.v}
              onClick={() => setTheme(o.v)}
            />
          ))}
        </div>

        <div style={{ height: 10 }} />
        <SectionLabel>{t.screenLanguage}</SectionLabel>
        <div role="radiogroup" aria-label={t.screenLanguage}>
          {langs.map((o) => (
            <Option
              key={o.v}
              label={o.label}
              sub={o.sub}
              selected={lang === o.v}
              onClick={() => setLang(o.v)}
            />
          ))}
        </div>

        <div style={{ height: 10 }} />
        <SectionLabel>{t.timeZone}</SectionLabel>
        <div role="radiogroup" aria-label={t.timeZone}>
          {zones.map((o) => (
            <Option key={o.v} label={o.label} sub={o.sub} selected={tz === o.v} onClick={() => setTz(o.v)} />
          ))}
        </div>

        {voice ? (
        <p style={{ margin: "12px 0 16px", fontSize: 12.5, lineHeight: 1.5, color: "var(--c-muted)" }}>
          {t.settingsNote}
        </p>
        ) : (
          <div style={{ height: 16 }} />
        )}

      </div>
    </Sheet>
  );
}
