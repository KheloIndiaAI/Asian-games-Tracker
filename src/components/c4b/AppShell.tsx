import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs";
import { useVoiceEnabled } from "@/lib/voice-flag";
import { useJeet, type JeetContextInfo } from "./JeetProvider";
import { SettingsSheet } from "./SettingsSheet";
import { Chakra, CalendarIcon, ChevronLeft, SunIcon, GridIcon, MedalIcon, Gear, Mic, Search } from "./icons";
import { TzPill } from "./ui";

const BAR_H = 64;

function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <Link className="c4b-wordmark" to="/" style={{ color: "var(--c-ink)" }}>
      <Chakra size={large ? 32 : 26} />
      <span style={{ fontFamily: "var(--display)", fontSize: large ? 22 : 19, fontWeight: 800, color: "var(--c-ink)" }}>
        Cheer<span style={{ color: "var(--c-saffron)" }}>4</span>Bharat
      </span>
    </Link>
  );
}

function LangSwitch() {
  const { lang, setLang } = usePrefs();
  return (
    <button className="c4b-lang" type="button" aria-label="Language" onClick={() => setLang(lang === "en" ? "hi" : "en")}>
      {(["en", "hi"] as const).map((l) => (
        <span key={l} className={lang === l ? "is-active" : ""} style={{ fontFamily: l === "hi" ? "var(--deva)" : "var(--body)" }}>
          {l === "en" ? "EN" : "हिं"}
        </span>
      ))}
    </button>
  );
}

function NavItems({ vertical = false }: { vertical?: boolean }) {
  const { t } = usePrefs();
  const voice = useVoiceEnabled();
  const { openJeet } = useJeet();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", label: t.today, icon: SunIcon },
    { to: "/schedule", label: t.schedule, icon: CalendarIcon },
    { to: "/sports", label: t.sports, icon: GridIcon },
    { to: "/medals", label: t.medals, icon: MedalIcon },
    { to: "/search", label: t.search, icon: Search },
  ];
  return (
    <div className={vertical ? "c4b-nav-items is-vertical" : "c4b-nav-items"}>
      {items.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link key={to} to={to as never} className={active ? "c4b-nav-link is-active" : "c4b-nav-link"} aria-current={active ? "page" : undefined}>
            <Icon size={20} color={active ? "var(--c-saffron-text)" : "var(--c-muted)"} />
            <span>{label}</span>
          </Link>
        );
      })}
      {vertical && voice ? (
        <button className="c4b-nav-link" type="button" onClick={() => openJeet({ page_type: "today" })}>
          <Mic size={20} color="var(--c-muted)" /><span>{t.askJeet}</span>
        </button>
      ) : null}
    </div>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = usePrefs();
  return <button className="c4b-icon-button" type="button" aria-label={t.display} onClick={onClick}><Gear /></button>;
}

export function AppHeader({ onSettings }: { onSettings?: () => void }) {
  const voice = useVoiceEnabled();
  const { t } = usePrefs();
  const [localSettings, setLocalSettings] = useState(false);
  const open = onSettings ?? (() => setLocalSettings(true));
  return (
    <>
      <header className={voice ? "c4b-phone-header has-search" : "c4b-phone-header"}>
        <Wordmark />
        <LangSwitch />
        {voice ? <Link to="/search" className="c4b-icon-button" aria-label={t.search}><Search size={21} color="var(--c-ink)" /></Link> : null}
        <SettingsButton onClick={open} />
      </header>
      {!onSettings ? <SettingsSheet open={localSettings} onClose={() => setLocalSettings(false)} /> : null}
    </>
  );
}

export function BackHeader({ title, subtitle, to, right }: { title: ReactNode; subtitle?: string | undefined; to?: string | undefined; right?: ReactNode | undefined }) {
  const { t } = usePrefs();
  return (
    <header className="c4b-back-header">
      {to ? <Link to={to as never} className="c4b-icon-button" aria-label={t.back}><ChevronLeft /></Link> :
        <button type="button" className="c4b-icon-button" aria-label={t.back} onClick={() => window.history.back()}><ChevronLeft /></button>}
      <div className="c4b-back-title">
        <h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}
      </div>
      {right ?? null}
    </header>
  );
}

function TabButton({ to, label, icon, active }: { to: string; label: string; icon: (color: string) => ReactNode; active: boolean }) {
  const color = active ? "var(--c-saffron-text)" : "var(--c-muted)";
  return <Link to={to as never} aria-current={active ? "page" : undefined} className="c4b-tab-button" style={{ color }}>{icon(color)}<span>{label}</span></Link>;
}

function TabBar({ jeetContext }: { jeetContext?: JeetContextInfo | undefined }) {
  const { t } = usePrefs(); const { openJeet } = useJeet(); const voice = useVoiceEnabled();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const is = (p: string) => p === "/" ? path === "/" : path.startsWith(p);
  return <nav className="c4b-bottom-nav" aria-label="Primary"><div className="c4b-bottom-nav-inner">
    <TabButton to="/" label={t.today} active={is("/")} icon={(c) => <SunIcon color={c} size={22} />} />
    <TabButton to="/schedule" label={t.schedule} active={is("/schedule")} icon={(c) => <CalendarIcon color={c} size={21} />} />
    <div className="c4b-centre-tab">{voice ? <span className="c4b-pulse c4b-centre-pulse" aria-hidden /> : null}
      {voice ? <button type="button" className="c4b-centre-action" aria-label={t.askJeet} onClick={() => openJeet(jeetContext)}><Mic size={26} /></button> :
        <Link to="/search" className="c4b-centre-action" aria-label={t.search}><Search size={26} color="var(--c-on-saffron)" strokeWidth={2.4} /></Link>}
      <span>{voice ? t.askJeet : t.search}</span></div>
    <TabButton to="/sports" label={t.sports} active={is("/sports")} icon={(c) => <GridIcon color={c} size={21} />} />
    <TabButton to="/medals" label={t.medals} active={is("/medals")} icon={(c) => <MedalIcon color={c} size={21} />} />
  </div></nav>;
}

function TabletHeader({ onSettings }: { onSettings: () => void }) {
  return <header className="c4b-tablet-header"><Wordmark /><nav aria-label="Primary"><NavItems /></nav><div className="c4b-header-tools"><TzPill compact /><LangSwitch /><SettingsButton onClick={onSettings} /></div></header>;
}

function DesktopSidebar() {
  return <aside className="c4b-sidebar"><Wordmark large /><nav aria-label="Primary"><NavItems vertical /></nav></aside>;
}

function DesktopTopbar({ title, onSettings }: { title: string; onSettings: () => void }) {
  return <header className="c4b-desktop-topbar"><h1>{title}</h1><div className="c4b-header-tools"><TzPill /><LangSwitch /><SettingsButton onClick={onSettings} /></div></header>;
}

function pageTitle(path: string, t: ReturnType<typeof usePrefs>["t"]) {
  if (path.startsWith("/schedule")) return t.schedule;
  if (path.startsWith("/sports/")) return t.sports;
  if (path === "/sports") return t.sports;
  if (path.startsWith("/medals")) return t.medals;
  if (path.startsWith("/search")) return t.search;
  if (path.startsWith("/athlete")) return "Athlete";
  if (path.startsWith("/match")) return t.matchDetails;
  return t.today;
}

function Nudges({ jeetContext }: { jeetContext?: JeetContextInfo | undefined }) {
  const { t } = usePrefs(); const { openJeet, isOpen } = useJeet(); const voice = useVoiceEnabled();
  const [coach, setCoach] = useState(false); const [bubble, setBubble] = useState(false); const shown = useRef(false);
  useEffect(() => { try { if (!localStorage.getItem("c4b_coach") && !localStorage.getItem("c4b_jeet_nudges_dismissed")) setCoach(true); } catch {} }, []);
  useEffect(() => { if (!coach) return; const dismiss=()=>{setCoach(false);try{localStorage.setItem("c4b_coach","1");localStorage.setItem("c4b_jeet_nudges_dismissed","1");}catch{}}; document.addEventListener("pointerdown",dismiss,{once:true}); return()=>document.removeEventListener("pointerdown",dismiss); },[coach]);
  useEffect(() => { const dismiss=()=>{setCoach(false);setBubble(false);shown.current=true}; window.addEventListener("c4b-jeet-opened",dismiss); return()=>window.removeEventListener("c4b-jeet-opened",dismiss); },[]);
  useEffect(() => { const id=setTimeout(()=>{let dismissed=false;try{dismissed=!!localStorage.getItem("c4b_jeet_nudges_dismissed")}catch{} if(!dismissed&&!isOpen&&!shown.current){shown.current=true;setBubble(true)}},20000); return()=>clearTimeout(id)},[isOpen]);
  useEffect(() => { if(!bubble)return; const id=window.setTimeout(()=>{setBubble(false);try{localStorage.setItem("c4b_jeet_nudges_dismissed","1")}catch{}},8000); return()=>clearTimeout(id)},[bubble]);
  if(isOpen||!voice)return null;
  const text=coach?t.coachMark:t.tryAsking+": "+(jeetContext?.sport?`${jeetContext.sport}?`:t.coachMark);
  return <button className="c4b-nudge" type="button" onClick={() => { setBubble(false); if(!coach) openJeet(jeetContext); }}>{text}</button>;
}

export function AppShell({ children, header, jeetContext, today = false }: { children: ReactNode; header?: ReactNode; jeetContext?: JeetContextInfo; today?: boolean }) {
  const { t } = usePrefs(); const path = useRouterState({ select: (s) => s.location.pathname }); const [settings,setSettings]=useState(false);
  return <div className={today ? "c4b-app c4b-today-app" : "c4b-app"}>
    <a className="c4b-skip" href="#main-content">Skip to content</a>
    <DesktopSidebar />
    <div className="c4b-shell">
      <TabletHeader onSettings={() => setSettings(true)} />
      <DesktopTopbar title={pageTitle(path,t)} onSettings={() => setSettings(true)} />
      <div className="c4b-phone-only">{header ?? <><AppHeader onSettings={() => setSettings(true)} /><div className="c4b-phone-tz"><TzPill /></div></>}</div>
      <main id="main-content" className="c4b-main">{children}</main>
      <TabBar jeetContext={jeetContext} /><Nudges jeetContext={jeetContext} />
    </div>
    <SettingsSheet open={settings} onClose={() => setSettings(false)} />
  </div>;
}