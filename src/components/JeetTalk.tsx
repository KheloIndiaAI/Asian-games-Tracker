import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchVoiceConfig,
  startJeetSession,
  type JeetMessage,
  type JeetSession,
  type JeetState,
  type VoiceConfig,
} from "@/lib/jeet-session";

const LABELS: Record<JeetState, string> = {
  idle: "Tap to talk",
  connecting: "Connecting…",
  listening: "Listening… go ahead",
  speaking: "Jeet is speaking",
  error: "Tap to try again",
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-12 w-12">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

function ChakraRing() {
  const spokes = Array.from({ length: 24 }, (_, i) => i);
  return (
    <svg viewBox="0 0 200 200" className="chakra-ring pointer-events-none absolute inset-0 h-full w-full">
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.2" />
      {spokes.map((i) => (
        <line
          key={i}
          x1="100"
          y1="14"
          x2="100"
          y2="26"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.5"
          transform={`rotate(${i * 15} 100 100)`}
        />
      ))}
    </svg>
  );
}

function Waveform() {
  return (
    <div className="flex h-12 items-end gap-1.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.11}s` }} />
      ))}
    </div>
  );
}

export function JeetTalk() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [state, setState] = useState<JeetState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<JeetMessage[]>([]);
  const sessionRef = useRef<JeetSession | null>(null);

  useEffect(() => {
    fetchVoiceConfig()
      .then(setConfig)
      .catch(() => setConfig({ configured: false }));
  }, []);

  const stop = useCallback(async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    setState("idle");
    if (s) await s.stop();
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void stop();
    };
  }, [stop]);

  const start = useCallback(async () => {
    if (sessionRef.current || state === "connecting") return;
    if (!config?.configured) return;
    setError(null);
    setMessages([]);
    setState("connecting");
    try {
      const session = await startJeetSession(config, {
        onState: setState,
        onMessage: (m) => setMessages((prev) => [...prev.slice(-19), m]),
        onError: (m) => {
          setError(m);
          setState("error");
        },
        onEnd: () => {
          sessionRef.current = null;
          setState("idle");
        },
      });
      sessionRef.current = session;
    } catch (e: any) {
      const name = e?.name ?? "";
      setError(
        name === "NotAllowedError" || /permission|denied/i.test(String(e?.message))
          ? "Microphone access is needed to talk to Jeet. Allow it in your browser settings and tap again."
          : (e?.message ?? "Something went wrong. Please tap and try again."),
      );
      setState("error");
    }
  }, [config, state]);

  const active = state === "listening" || state === "speaking" || state === "connecting";

  if (config && !config.configured) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-white/15 bg-white/5 p-6 text-center">
        <p className="text-base font-medium text-white">Voice is being set up</p>
        <p className="mt-1 text-sm text-white/60">Please check back shortly.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-[232px] w-[232px] items-center justify-center">
        <div className="absolute inset-0 text-[#FF9933]">
          <ChakraRing />
        </div>
        {state === "listening" && (
          <>
            <span className="pulse-ring" style={{ animationDelay: "0s" }} />
            <span className="pulse-ring" style={{ animationDelay: "0.9s" }} />
          </>
        )}
        <button
          type="button"
          onClick={() => (active ? void stop() : void start())}
          aria-label={LABELS[state]}
          disabled={!config}
          className={`relative z-10 flex h-[168px] w-[168px] flex-col items-center justify-center gap-2 rounded-full text-center font-semibold shadow-[0_18px_50px_-12px_rgba(255,153,51,0.6)] transition-transform active:scale-95 disabled:opacity-60 ${
            state === "listening"
              ? "bg-[#138808] text-white"
              : "bg-[#FF9933] text-[#0b1020]"
          }`}
        >
          {state === "connecting" ? (
            <span className="spinner-ring" aria-hidden />
          ) : state === "speaking" ? (
            <Waveform />
          ) : (
            <MicIcon />
          )}
          <span className="px-3 text-sm leading-tight">{LABELS[state]}</span>
        </button>
      </div>

      {active && (
        <button
          type="button"
          onClick={() => void stop()}
          className="mt-5 rounded-full border border-white/25 px-5 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
        >
          End conversation
        </button>
      )}

      {error && (
        <p className="mt-5 max-w-sm text-center text-sm text-[#FFB27A]" role="alert">
          {error}
        </p>
      )}

      {messages.length > 0 && (
        <div className="mt-6 w-full max-w-md space-y-2">
          {messages.map((m, i) => (
            <div
              key={`${m.at}-${i}`}
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-white/10 text-white"
                  : "bg-[#FF9933]/15 text-white"
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
