import type { ReactNode } from "react";

type Props = { code: string; size?: number };
type GlyphProps = { children: ReactNode; size: number };

function Glyph({ children, size }: GlyphProps) {
  return <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

const ball = <><circle cx="12" cy="12" r="8"/><path d="m8 5 3 4-2 4-5 1m9-5 4-2 3 4-3 4 1 4m-9-6 4 3-1 4"/></>;
const bike = <><circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="m6 16 4-8 3 8h-7l5-5h5m-6-3h3"/></>;
const racket = <><ellipse cx="9" cy="8" rx="5" ry="6"/><path d="m12.5 12.5 6 6M5.5 5.5l7 5M5 9l7-5"/><circle cx="19" cy="5" r="1" fill="currentColor" stroke="none"/></>;
const combat = <><path d="M7 5h10l-1 7-4 2-4-2zM8 8h8M12 14v6m-4-3h8"/><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none"/></>;

export function SportIcon({ code, size = 24 }: Props) {
  const c = code.toUpperCase();
  let shape: ReactNode;
  if (c === "ARC") shape = <><path d="M5 3c7 4 7 14 0 18M4 12h16m-4-3 4 3-4 3"/></>;
  else if (c === "ATH") shape = <><path d="M4 18c5-1 7-5 8-9l3 3 5 1M7 20h12M13 5l2-2 2 2-2 2z"/></>;
  else if (["BBL","SBL","CKT"].includes(c)) shape = <><circle cx="7" cy="7" r="3"/><path d="m11 18 7-13 2 1-7 13zM5 20h11"/></>;
  else if (c === "BDM") shape = <><path d="m8 4 8 8-5 7-6-6zM10 6 5 13m8-4-5 7m8-4 3 5"/></>;
  else if (["BK3","BKB"].includes(c)) shape = ball;
  else if (c === "BKG") shape = <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v3m0 10v3M4 12h3m10 0h3"/></>;
  else if (["BMF","BMX","CRD","CTR","MTB","TRI"].includes(c)) shape = bike;
  else if (["BOX","MMA"].includes(c)) shape = <><path d="M7 12V7a3 3 0 0 1 6 0v2-3a2 2 0 0 1 4 0v5l2 3-4 6H8l-4-5 3-3z"/></>;
  else if (c === "CLB") shape = <><path d="M7 20c-3-6-2-13 5-17 7 4 8 11 5 17H7zM9 9l3-2m-1 6 4-2m-6 6 3-1"/></>;
  else if (["CSL","CSP","ROW"].includes(c)) shape = <><path d="M3 16c4 4 14 4 18 0M5 14h14l-3 4H8zM7 4l10 8M17 4 7 12"/></>;
  else if (c === "DIV") shape = <><path d="M3 18h18M5 15h9M15 4c3 1 4 3 4 6m-7-3 3 3-2 3"/><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/></>;
  else if (c === "ELS") shape = <><path d="M7 9h10a5 5 0 0 1 4 7l-1 2-4-3H8l-4 3-1-2a5 5 0 0 1 4-7zM7 12v4m-2-2h4m7-1h.01m2 2h.01"/></>;
  else if (c === "EQU") shape = <><path d="M6 20V9l5-6 7 3-2 4 2 4-5 2-3-3v7M11 7l4 1"/></>;
  else if (c === "FBL") shape = ball;
  else if (c === "FEN") shape = <><circle cx="12" cy="7" r="4"/><path d="M8 7h8M5 20 19 10M19 20 5 10"/></>;
  else if (c === "GAR") shape = <><circle cx="8" cy="13" r="4"/><circle cx="16" cy="13" r="4"/><path d="M8 9V4m8 5V4"/></>;
  else if (c === "GRY") shape = <><path d="M7 20c10-4 10-10 2-12-5-1-5-5-1-5 7 0 11 9 6 15"/></>;
  else if (c === "GTR") shape = <><path d="M4 16h16M6 16l-2 5m14-5 2 5M8 7c2 3 6 3 8 0M12 3v8"/></>;
  else if (c === "GLF") shape = <><path d="M7 21V3l9 3-9 3m4 11h.01M5 21h12"/></>;
  else if (["HBL","VVO","VBV","WPO","SPK"].includes(c)) shape = ball;
  else if (c === "HOC") shape = <><path d="M7 3v12c0 3 2 5 5 5h4M7 15h5"/><circle cx="18" cy="19" r="2"/></>;
  else if (["JJI","JUD","KTE","KUR","TKW"].includes(c)) shape = combat;
  else if (c === "KAB") shape = <><circle cx="8" cy="6" r="2"/><circle cx="17" cy="7" r="2"/><path d="m8 8-3 5 5 2 2 5m5-11 3 5-5 1-3 5M3 21h18"/></>;
  else if (c === "MPN") shape = <><path d="m12 3 9 7-4 11H7L3 10z"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="17" r="1" fill="currentColor" stroke="none"/></>;
  else if (c === "PDL") shape = <><ellipse cx="9" cy="8" rx="5" ry="6"/><path d="m12 13 6 6"/><circle cx="7" cy="7" r=".6" fill="currentColor" stroke="none"/><circle cx="10" cy="9" r=".6" fill="currentColor" stroke="none"/></>;
  else if (c === "RU7") shape = <><path d="M4 15c3-8 8-11 16-10-1 8-4 13-12 15zM8 16 17 7m-7 6 3 3m0-6 3 3"/></>;
  else if (c === "SAL") shape = <><path d="M4 18h16l-3 3H7zM12 3v15M11 5l-6 11h6m2-10 5 10h-5"/></>;
  else if (c === "SHO") shape = <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>;
  else if (c === "SKB") shape = <><path d="M4 15c3 3 13 3 16 0M6 15l1-5h10l1 5"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/></>;
  else if (c === "SQU" || c === "TEN" || c === "TST") shape = racket;
  else if (c === "SRF") shape = <><path d="M12 3c5 6 5 13 0 18-5-5-5-12 0-18zM3 17c3-2 5-2 8 0s5 2 10-1"/></>;
  else if (["SWA","SWM"].includes(c)) shape = <><path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>{c === "SWA" ? <path d="m12 3 1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/> : <path d="M5 7h8l3 3"/>}</>;
  else if (c === "TEQ") shape = <><path d="M3 11c5 3 13 3 18 0M5 11l2 9m12-9-2 9"/><circle cx="12" cy="6" r="2"/></>;
  else if (c === "TTE") shape = <><circle cx="9" cy="9" r="5"/><path d="m12.5 12.5 5 5"/><circle cx="18" cy="6" r="1" fill="currentColor" stroke="none"/></>;
  else if (c === "WLF") shape = <><path d="M4 8v8m3-10v12m10-12v12m3-10v8M4 12h16"/></>;
  else if (c === "WRE") shape = <><circle cx="8" cy="5" r="2"/><circle cx="16" cy="6" r="2"/><path d="m8 7 4 4 4-3m-8 1-3 5 5 2m6-6 3 5-5 1-2 5"/></>;
  else if (c === "WSU") shape = <><path d="M5 20 18 4m-4 1 4-1-1 4M7 14l4 4M5 20h5"/></>;
  else shape = <><path d="M7 4h10v6a5 5 0 0 1-10 0zM9 20h6m-3-5v5M7 7H4c0 3 1 5 4 6m9-6h3c0 3-1 5-4 6"/></>;
  return <Glyph size={size}>{shape}</Glyph>;
}