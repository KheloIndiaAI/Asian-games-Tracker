/** Pure slug helpers shared by the server API and the client routes. */

export function slugify(input: unknown, max = 60): string {
  const base = String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return "event";
  if (base.length <= max) return base;
  const cut = base.slice(0, max).replace(/-+[^-]*$/, "").replace(/^-+|-+$/g, "");
  return cut || base.slice(0, max).replace(/^-+|-+$/g, "") || "event";
}

export function sportSlug(name?: string | null, code?: string | null): string {
  return slugify(name || code || "sport");
}

/** Phase names often repeat the event name ("Hockey Men, Pool A" → "Pool A"). */
export function cleanPhase(eventName?: string | null, phaseName?: string | null): string {
  const phase = String(phaseName ?? "").trim();
  const event = String(eventName ?? "").trim();
  if (!phase || !event) return phase;
  const lowerPhase = phase.toLowerCase();
  const lowerEvent = event.toLowerCase();
  if (lowerPhase === lowerEvent) return "";
  if (lowerPhase.startsWith(lowerEvent)) {
    return phase.slice(event.length).replace(/^[\s,:–—-]+/, "").trim();
  }
  return phase;
}

type MatchLike = {
  is_h2h?: boolean | null;
  india_name?: string | null;
  opponent_name?: string | null;
  event_name?: string | null;
  phase_name?: string | null;
  unit_name?: string | null;
};

export function matchTitleSlug(item: MatchLike): string {
  const phase = cleanPhase(item.event_name, item.phase_name);
  const parts: (string | null | undefined)[] = [];
  if (item.is_h2h && item.opponent_name) {
    parts.push(`${item.india_name || "india"} v ${item.opponent_name}`);
    parts.push(item.event_name);
    parts.push(phase);
  } else {
    parts.push(item.event_name);
    parts.push(phase);
    const unit = String(item.unit_name ?? "").trim();
    if (unit && unit.toLowerCase() !== phase.toLowerCase()) parts.push(unit);
  }
  return slugify(parts.filter(Boolean).join(" "));
}

export function matchPath(item: MatchLike & { sport?: string | null; sport_code: string; short_id?: number | string | null }): string | null {
  if (item.short_id == null) return null;
  return `/match/${sportSlug(item.sport, item.sport_code)}/${matchTitleSlug(item)}-${item.short_id}`;
}

export function sportPath(name?: string | null, code?: string | null): string {
  return `/sports/${sportSlug(name, code)}`;
}

export function athletePath(name: string | null | undefined, reg: string): string {
  return `/athlete/${slugify(name || "athlete")}-${reg}`;
}

/** Old-style forms that must keep working and then redirect. */
export const OLD_SPORT_CODE = /^[A-Z0-9]{2,3}$/;
export const OLD_REG = /^\d+$/;

export function trailingNumber(value: string): string | null {
  const m = /-(\d+)$/.exec(value);
  return m ? (m[1] as string) : null;
}

/** Turns a canonical path into typed router link params. */
export function matchLinkFromPath(path: string) {
  const parts = path.split("/").filter(Boolean); // match, sport, rest
  return {
    to: "/match/$sportCode/$resCode" as const,
    params: { sportCode: parts[1] ?? "", resCode: parts[2] ?? "" },
  };
}

export function sportLinkFromPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return { to: "/sports/$sportCode" as const, params: { sportCode: parts[1] ?? "" } };
}

export function athleteLinkFromPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return { to: "/athlete/$reg" as const, params: { reg: parts[1] ?? "" } };
}

export function sportLink(s: { code: string; name?: string | null | undefined; path?: string | null | undefined }) {
  return sportLinkFromPath(s.path ?? sportPath(s.name, s.code));
}

export function athleteLink(a: { reg: string; name?: string | null | undefined; path?: string | null | undefined }) {
  return athleteLinkFromPath(a.path ?? athletePath(a.name, a.reg));
}
