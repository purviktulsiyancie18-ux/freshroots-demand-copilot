// ISO-8601 week helpers. All maths in UTC.

const ISO_RE = /^(\d{4})-W(\d{2})$/;

export function isIsoWeek(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const w = Number(m[2]);
  return w >= 1 && w <= weeksInYear(Number(m[1]));
}

function weeksInYear(year: number): number {
  // A year has 53 ISO weeks if Dec 28 falls in week 53.
  return dateToIsoWeek(new Date(Date.UTC(year, 11, 28))).week;
}

export function dateToIsoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day); // Thursday of this week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

export function formatIsoWeek(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of the given ISO week. */
export function isoWeekMonday(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO week: ${iso}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  return monday;
}

export function addWeeks(iso: string, n: number): string {
  const d = isoWeekMonday(iso);
  d.setUTCDate(d.getUTCDate() + n * 7);
  const { year, week } = dateToIsoWeek(d);
  return formatIsoWeek(year, week);
}

/** The `n` ISO weeks ending at (and including) `anchor`, oldest first. */
export function trailingWeeks(anchor: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addWeeks(anchor, -i));
  return out;
}

/** YYYY-MM of the Thursday of an ISO week (the week's "home" month). */
export function isoWeekMonth(iso: string): string {
  const d = isoWeekMonday(iso);
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 7);
}
