import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  fetchVoiceConfig,
  startJeetSession,
  type JeetMessage,
  type JeetSession,
  type JeetState,
  type VoiceConfig,
} from "@/lib/jeet-session";
import { searchQuery } from "@/lib/app-data";
import { usePrefs } from "@/lib/prefs";
import { Sheet } from "./Sheet";
import { ChevronRight, Mic } from "./icons";
import { sportLink } from "@/lib/slug";

export type JeetContextInfo = {
  page_type?: string | undefined;
  sport?: string | undefined;
  athlete?: string | undefined;
  sportCode?: string | undefined;
};

type Ctx = {
  openJeet: (info?: JeetContextInfo) => void;
  closeJeet: () => void;
  isOpen: boolean;
};

const JeetCtx = createContext<Ctx>({ openJeet: () => {}, closeJeet: () => {}, isOpen: false });

export function useJeet() {
  return useContext(JeetCtx);
}

const CHIPS_EN = [
  "What is India playing today?",
  "Is India playing right now?",
  "How many medals does India have?",
  "When is the next hockey match?",
  "आज भारत के कौन से मैच हैं?",
];
const CHIPS_HI = [
  "आज भारत क्या खेल रहा है?",
  "अभी कौन सा मैच चल रहा है?",
  "भारत के कितने पदक हैं?",
  "अगला हॉकी मैच कब है?",
  "How many medals does India have?",
];

export function JeetProvider({ children }: { children: React.ReactNode }) {
  const { t, lang } = usePrefs();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<JeetContextInfo>({});
  const [state, setState] = useState<JeetState>("idle");
  const [messages, setMessages] = useState<JeetMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const sessionRef = useRef<JeetSession | null>(null);
  const stoppingRef = useRef<Promise<void> | null>(null);
  const sessionGenerationRef = useRef(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: index } = useQuery({ ...searchQuery(), enabled: open });

  const stopSession = useCallback(async () => {
    sessionGenerationRef.current += 1;
    if (stoppingRef.current) return stoppingRef.current;
    const s = sessionRef.current;
    sessionRef.current = null;
    setState("idle");
    if (!s) return;
    const stopping = s.stop().catch(() => undefined).finally(() => {
      stoppingRef.current = null;
    });
    stoppingRef.current = stopping;
    await stopping;
  }, []);

  const closeJeet = useCallback(() => {
    setOpen(false);
    void stopSession();
  }, [stopSession]);

  const openJeet = useCallback((next?: JeetContextInfo) => {
    try {
      localStorage.setItem("c4b_jeet_nudges_dismissed", "1");
      localStorage.setItem("c4b_coach", "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("c4b-jeet-opened"));
    setInfo(next ?? {});
    setMessages([]);
    setError(null);
    setOpen(true);
  }, []);

  // stop on route change away and on page hide
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = pathname;
      setOpen(false);
      void stopSession();
    }
  }, [pathname, stopSession]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") closeJeet();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [closeJeet]);

  // load voice config when the sheet opens
  useEffect(() => {
    if (!open || config) return;
    fetchVoiceConfig()
      .then(setConfig)
      .catch(() => setConfig({ configured: false }));
  }, [open, config]);

  const start = useCallback(async () => {
    if (!config?.configured || sessionRef.current) return;
    setError(null);
    setState("connecting");
    const generation = ++sessionGenerationRef.current;
    try {
      const session = await startJeetSession(
        config,
        {
          onState: setState,
          onMessage: (m) => setMessages((prev) => [...prev, m]),
          onError: (m) => {
            setError(m);
            setState("error");
          },
          onEnd: () => {
            sessionRef.current = null;
            setState("idle");
          },
        },
        {
          page_type: info.page_type ?? "",
          sport: info.sport ?? "",
          athlete: info.athlete ?? "",
        },
      );
      if (generation !== sessionGenerationRef.current) {
        await session.stop();
        return;
      }
      sessionRef.current = session;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setError(/permission|denied|NotAllowed/i.test(msg) ? t.micDenied : msg);
      setState("error");
      sessionRef.current = null;
    }
  }, [config, info, t.micDenied]);

  // auto-start once the sheet is open and voice is configured
  useEffect(() => {
    if (open && config?.configured && state === "idle" && !sessionRef.current && !error) {
      void start();
    }
  }, [open, config, state, error, start]);

  const lastJeet = [...messages].reverse().find((m) => m.role === "jeet");
  const linkedSport = useMemo(() => {
    if (!lastJeet || !index?.sports) return null;
    const text = lastJeet.text.toLowerCase();
    return (
      index.sports.find((s) => s.name && text.includes(s.name.toLowerCase())) ??
      (info.sportCode ? index.sports.find((s) => s.code === info.sportCode) : null) ??
      null
    );
  }, [lastJeet, index, info.sportCode]);

  const value = useMemo<Ctx>(() => ({ openJeet, closeJeet, isOpen: open }), [openJeet, closeJeet, open]);

  const chips = lang === "hi" ? CHIPS_HI : CHIPS_EN;
  const live = state === "listening" || state === "speaking";

  return (
    <JeetCtx.Provider value={value}>
      {children}
      <Sheet
        open={open}
        onClose={closeJeet}
        closeLabel={t.close}
        height={640}
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 800, color: "var(--c-ink)" }}>
              {t.jeet}
            </span>
            {live ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--c-live)" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--c-live-text)" }}>
                  {state === "speaking" ? t.speaking : t.listening}
                </span>
              </span>
            ) : null}
          </span>
        }
      >
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, minHeight: "100%" }}>
          {config && !config.configured ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--c-muted)" }}>{t.notConfigured}</p>
          ) : null}

          {error ? (
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                background: "var(--c-jeet)",
                border: "1.5px solid var(--c-saffron)",
                fontSize: 13.5,
                color: "var(--c-ink)",
                lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          ) : null}

          {state === "connecting" ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--c-muted)" }}>{t.connecting}</p>
          ) : null}

          {messages.length === 0 && !error ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--c-muted)" }}>
              {t.jeetHello}
            </p>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((m, i) => (
              <div
                key={`${m.at}-${i}`}
                style={{
                  alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                  maxWidth: "85%",
                  padding: "10px 13px",
                  borderRadius: 16,
                  fontSize: 14,
                  lineHeight: 1.45,
                  background: m.role === "user" ? "var(--c-tile)" : "var(--c-saffron)",
                  color: m.role === "user" ? "var(--c-ink)" : "var(--c-on-saffron)",
                  border: m.role === "user" ? "1px solid var(--c-border)" : "0",
                }}
              >
                {m.text}
              </div>
            ))}
          </div>

          {linkedSport ? (
            <Link
              to="/sports/$sportCode"
              params={sportLink(linkedSport).params}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
                fontWeight: 700,
                fontSize: 14,
                color: "var(--c-saffron-text)",
              }}
            >
              {t.openMatch}
              <ChevronRight color="var(--c-saffron-text)" />
            </Link>
          ) : null}

          <div style={{ marginTop: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "var(--c-muted)", textTransform: "uppercase", marginBottom: 8 }}>
              {t.tryAsking}
            </div>
            <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
              {chips.map((c) => (
                <li
                  key={c}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--c-border)",
                    background: "var(--c-tile)",
                    fontSize: 12.5,
                    color: "var(--c-ink2)",
                  }}
                >
                  {c}
                </li>
              ))}
            </ul>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 28, flex: 1 }}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span
                    key={i}
                    className={state === "speaking" ? "c4b-bar" : undefined}
                    style={{
                      width: 5,
                      height: 24,
                      borderRadius: 3,
                      background: state === "speaking" ? "var(--c-saffron)" : "var(--c-track)",
                      animationDelay: `${i * 0.1}s`,
                      transform: state === "speaking" ? undefined : "scaleY(0.35)",
                      transformOrigin: "bottom",
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (sessionRef.current || state !== "idle") closeJeet();
                  else void start();
                }}
                style={{
                  minHeight: 44,
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid var(--c-border)",
                  background: sessionRef.current ? "var(--c-card)" : "var(--c-saffron)",
                  color: sessionRef.current ? "var(--c-ink)" : "var(--c-on-saffron)",
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {!sessionRef.current ? <Mic size={16} /> : null}
                {sessionRef.current || state !== "idle" ? t.endChat : t.tapToTalk}
              </button>
            </div>
          </div>
        </div>
      </Sheet>
    </JeetCtx.Provider>
  );
}
