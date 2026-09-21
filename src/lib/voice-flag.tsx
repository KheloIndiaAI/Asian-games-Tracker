import { createContext, useContext, useEffect, useState } from "react";

/**
 * The app asks the server once whether the voice experience is switched on.
 * Default false while loading so nothing voice-related ever flashes.
 */
const VoiceFlagCtx = createContext<boolean>(false);

export function VoiceFlagProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/voice-config")
      .then((r) => (r.ok ? r.json() : { voice_enabled: false }))
      .then((j: any) => {
        if (!cancelled) setEnabled(!!j?.voice_enabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return <VoiceFlagCtx.Provider value={enabled}>{children}</VoiceFlagCtx.Provider>;
}

export function useVoiceEnabled(): boolean {
  return useContext(VoiceFlagCtx);
}
