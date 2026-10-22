// Deterministic transformers for the allow-listed fix types (§8.1).
// Each returns the normalised string, or null when the value can't be fixed safely.

import { dateToIsoWeek, formatIsoWeek, isIsoWeek } from "./isoWeek";

export const ALLOWED_FIX_TYPES = [
  "normalize_sku_id",
  "normalize_week_format",
  "trim_whitespace",
  "parse_number",
  "parse_boolean",
] as const;
export type AllowedFixType = (typeof ALLOWED_FIX_TYPES)[number];

export function trimWhitespace(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/** `sku 1`, `SKU-1`, `sku001`, `Sku_01` → `SKU001`. Also used for `dist 2` → `DIST002`. */
export function normalizeId(v: string, prefix: "SKU" | "DIST"): string | null {
  const s = trimWhitespace(v);
  const re = prefix === "SKU" ? /^(?:sku)?[\s_\-#]*0*(\d{1,6})$/i : /^(?:dist(?:ributor)?)?[\s_\-#]*0*(\d{1,6})$/i;
  const m = re.exec(s);
  if (!m) return null;
  return `${prefix}${m[1].padStart(3, "0")}`;
}

/** `2026-W42`, `2026-42`, `2026W42`, `W42 2026`, `W42-2026`, `Wk 42/2026`, or a date → `2026-W42`. */
export function normalizeWeek(v: string): string | null {
  const s = trimWhitespace(v).toUpperCase();
  if (isIsoWeek(s)) return s;
  let m = /^(\d{4})[\s\-_/]*W?K?[\s\-_/]*(\d{1,2})$/.exec(s);
  if (m) return checked(Number(m[1]), Number(m[2]));
  m = /^W(?:K|EEK)?[\s\-_/.]*(\d{1,2})[\s\-_/,]+(\d{4})$/.exec(s);
  if (m) return checked(Number(m[2]), Number(m[1]));
  const d = parseDate(s);
  if (d) {
    const { year, week } = dateToIsoWeek(new Date(d + "T00:00:00Z"));
    return formatIsoWeek(year, week);
  }
  return null;
}

function checked(year: number, week: number): string | null {
  const iso = formatIsoWeek(year, week);
  return isIsoWeek(iso) ? iso : null;
}

/** `1,200`, ` 900 `, `12.0` → integer string. Rejects fractions and negatives are kept (validation rejects them). */
export function parseNumber(v: string): string | null {
  const s = trimWhitespace(v).replace(/[,\s]/g, "").replace(/units?$/i, "");
  if (!/^-?\d+(\.0+)?$/.test(s)) return null;
  return String(parseInt(s, 10));
}

export function parseBoolean(v: string): "TRUE" | "FALSE" | null {
  const s = trimWhitespace(v).toLowerCase();
  if (["true", "yes", "y", "1", "t"].includes(s)) return "TRUE";
  if (["false", "no", "n", "0", "f", ""].includes(s)) return "FALSE";
  return null;
}

/** YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or an Excel serial number → YYYY-MM-DD. */
export function parseDate(v: string): string | null {
  const s = trimWhitespace(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) return ymd(+m[3], +m[2], +m[1]); // Indian convention: day first
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function ymd(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Case-insensitive match to one of the allowed values. */
export function normalizeEnum(v: string, allowed: string[]): string | null {
  const s = trimWhitespace(v).toLowerCase();
  return allowed.find((a) => a.toLowerCase() === s) ?? null;
}
