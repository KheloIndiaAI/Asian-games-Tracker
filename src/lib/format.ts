const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Current date (YYYY-MM-DD) in India time. */
export function todayIst(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  );
}

/** "11:30 AM" from a stored IST timestamp string like "2026-09-20 11:30:00". */
export function istTime(startIst: string | null | undefined): string {
  if (!startIst) return "";
  const t = startIst.slice(11, 16);
  if (!t) return "";
  const [hs, ms] = t.split(":");
  const h = Number(hs ?? 0);
  const m = Number(ms ?? 0);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function dateLabelFull(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]!.charAt(0)}${WEEKDAYS[d.getUTCDay()]!.slice(1).toLowerCase()}day ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function dateLong(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function dateShort(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function dateTimeShort(date: string | null | undefined, startIst: string | null | undefined): string {
  if (!date) return istTime(startIst);
  const day = weekdayShort(date).slice(0, 1) + weekdayShort(date).slice(1).toLowerCase();
  return `${day} ${dateShort(date)} · ${istTime(startIst)}`;
}

export function weekdayShort(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

export function dayOfMonth(date: string): string {
  return String(new Date(`${date}T00:00:00Z`).getUTCDate());
}

const CRICKET = new Set(["CKT", "CRI"]);

/** Cricket scores arrive as "195 - 4"; show them as 195/4. */
export function displayScore(sportCode: string | null | undefined, score: string | null | undefined) {
  if (score == null || score === "") return "";
  const s = String(score).trim();
  if (sportCode && CRICKET.has(sportCode.toUpperCase())) {
    const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return `${m[1]}/${m[2]}`;
  }
  return s;
}

export function minutesAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export const FINISHED_STATUSES = ["OFFICIAL", "PROVISIONAL", "UNOFFICIAL"];

export function isFinished(status: string | null | undefined) {
  return !!status && FINISHED_STATUSES.includes(status.toUpperCase());
}

/* ------------------------------ time zones ------------------------------- */

export type Tz = "IST" | "JST";

const TZ_OFFSET: Record<Tz, number> = { IST: 5.5 * 3600000, JST: 9 * 3600000 };

function shifted(iso: string | null | undefined, tz: Tz): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + TZ_OFFSET[tz]);
}

/** YYYY-MM-DD in the chosen zone. */
export function zoneDate(iso: string | null | undefined, tz: Tz): string | null {
  const d = shifted(iso, tz);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** "3:30 PM" in the chosen zone. */
export function zoneTime(iso: string | null | undefined, tz: Tz): string {
  const d = shifted(iso, tz);
  if (!d) return "";
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "3:30 PM IST" */
export function zoneTimeZ(iso: string | null | undefined, tz: Tz): string {
  const s = zoneTime(iso, tz);
  return s ? `${s} ${tz}` : "";
}

/** "Tue 22 Sep" */
export function zoneDayLabel(iso: string | null | undefined, tz: Tz): string {
  const d = shifted(iso, tz);
  if (!d) return "";
  const wd = WEEKDAYS[d.getUTCDay()]!;
  return `${wd.charAt(0)}${wd.slice(1).toLowerCase()} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function todayInZone(tz: Tz, now: Date = new Date()): string {
  return new Date(now.getTime() + TZ_OFFSET[tz]).toISOString().slice(0, 10);
}

/** Medal flag: only "1" (gold event) and "2" (bronze decided) mean anything. */
export function medalTag(flag: string | null | undefined): "gold" | "bronze" | null {
  const s = flag == null ? "" : String(flag).trim();
  if (s === "1") return "gold";
  if (s === "2") return "bronze";
  return null;
}
