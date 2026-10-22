import type { Tone } from "@/components/ui/badge";

export const FLAG_TONE: Record<string, Tone> = { STOCKOUT_RISK: "red", OVERSTOCK_RISK: "amber", HIGH_DEMAND: "blue" };
export const FLAG_LABEL: Record<string, string> = { STOCKOUT_RISK: "Stockout risk", OVERSTOCK_RISK: "Overstock risk", HIGH_DEMAND: "High demand" };
export const ACTION_LABEL: Record<string, string> = {
  REORDER_NOW: "Reorder now",
  REORDER_INCREASED: "Reorder (increased)",
  PAUSE_NEXT_ORDER: "Pause next order",
  NO_ACTION: "No action",
};
export const TRIGGER_LABEL: Record<string, string> = {
  RULE: "Rule: outside documented rules",
  AI_TAG: "AI: unusual pattern",
  FORECAST_DISAGREES: "Forecast differs >25%",
  LOW_CONFIDENCE: "Low AI confidence",
  AI_UNAVAILABLE: "AI unavailable",
};
export const REASON_LABEL: Record<string, string> = {
  PROMO_OR_SCHEME: "Promo / scheme",
  NEW_LAUNCH: "New launch",
  DISTRIBUTOR_ISSUE: "Distributor issue",
  SUPPLY_CONSTRAINT: "Supply constraint",
  DATA_ERROR: "Data error",
  MARKET_EVENT: "Market event",
  SEASONALITY_DIFFERENT: "Seasonality different",
  OTHER: "Other",
};
export const STATUS_LABEL: Record<string, string> = {
  parsing: "Parsing",
  cleaning: "Cleaning",
  failed_validation: "Failed validation",
  rules: "Running rules",
  ai: "AI forecast",
  ready_for_review: "Ready for review",
  completed: "Completed",
  failed: "Failed",
};
export const STATUS_TONE: Record<string, Tone> = {
  failed_validation: "red",
  failed: "red",
  ready_for_review: "amber",
  completed: "green",
};

export const fmt1 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(1));
export const fmt2 = (n: number | null | undefined) => (n === null || n === undefined ? "∞" : n.toFixed(2));
export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00Z" : d) : d;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export const PO_STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent to procurement", cancelled: "Cancelled" };
export const PO_STATUS_TONE: Record<string, Tone> = { draft: "amber", sent: "green", cancelled: "slate" };
