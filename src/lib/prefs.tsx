import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DICT, type Dict, type Lang } from "./i18n";
import type { Tz } from "./format";

export type ThemeChoice = "light" | "dark" | "auto";

const THEME_KEY = "c4b_theme";
const LANG_KEY = "c4b_lang";
const TZ_KEY = "c4b_tz";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

type Ctx = {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  tz: Tz;
  setTz: (z: Tz) => void;
  t: Dict;
};

const PrefsContext = createContext<Ctx | null>(null);

function apply(theme: ThemeChoice, lang: Lang) {
  if (typeof document === "undefined") return;
  const dark =
    theme === "dark" ||
    (theme === "auto" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.documentElement.setAttribute("lang", lang);
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("light");
  const [lang, setLangState] = useState<Lang>("en");
  const [tz, setTzState] = useState<Tz>("IST");

  useEffect(() => {
    const th = read(THEME_KEY) as ThemeChoice | null;
    const lg = read(LANG_KEY) as Lang | null;
    const z = read(TZ_KEY) as Tz | null;
    if (th === "light" || th === "dark" || th === "auto") setThemeState(th);
    if (lg === "en" || lg === "hi") setLangState(lg);
    if (z === "IST" || z === "JST") setTzState(z);
    else {
      let local = "";
      try {
        local = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
      } catch {
        /* ignore */
      }
      setTzState(local === "Asia/Tokyo" ? "JST" : "IST");
    }
  }, []);

  useEffect(() => {
    apply(theme, lang);
    if (theme !== "auto") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("auto", lang);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme, lang]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-tz", tz);
  }, [tz]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    write(THEME_KEY, t);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    write(LANG_KEY, l);
  }, []);

  const setTz = useCallback((z: Tz) => {
    setTzState(z);
    write(TZ_KEY, z);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ theme, setTheme, lang, setLang, tz, setTz, t: DICT[lang] as Dict }),
    [theme, lang, tz, setTheme, setLang, setTz],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsContext);
  if (!ctx)
    return {
      theme: "light",
      setTheme: () => {},
      lang: "en",
      setLang: () => {},
      tz: "IST",
      setTz: () => {},
      t: DICT.en,
    };
  return ctx;
}

/** Runs before first paint to avoid a flash of the wrong theme or time zone. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}')||'light';var d=t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');var l=localStorage.getItem('${LANG_KEY}')||'en';document.documentElement.setAttribute('lang',l);var z=localStorage.getItem('${TZ_KEY}');if(z!=='IST'&&z!=='JST'){z=(Intl.DateTimeFormat().resolvedOptions().timeZone==='Asia/Tokyo')?'JST':'IST';}document.documentElement.setAttribute('data-tz',z);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
