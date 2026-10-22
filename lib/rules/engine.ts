// Deterministic rules engine — §7 of the PRD.
// Pure function: no DB, no network, no randomness. This is the ONLY place reorder quantities are computed.

import type { CalendarRow, InventoryRow, SalesRow, SkuRow } from "@/lib/data/types";
import { trailingWeeks } from "@/lib/data/isoWeek";
import type { RuleConfig } from "./config";

export type Flag = "HIGH_DEMAND" | "STOCKOUT_RISK" | "OVERSTOCK_RISK";
export type Action = "REORDER_NOW" | "REORDER_INCREASED" | "PAUSE_NEXT_ORDER" | "NO_ACTION";
export const ACTIONS: Action[] = ["REORDER_NOW", "REORDER_INCREASED", "PAUSE_NEXT_ORDER", "NO_ACTION"];

export interface RuleInput {
  skus: SkuRow[];
  weeklySales: SalesRow[];
  inventory: InventoryRow[];
  calendar: CalendarRow[];
  config: RuleConfig;
  runDate: string; // YYYY-MM-DD
}

export interface RuleResult {
  sku_id: string;
  avg4: number;
  avg12: number;
  is_festival: boolean;
  adjusted_weekly: number;
  units_on_hand: number;
  weeks_of_cover: number; // Infinity when adjusted_weekly = 0
  history_weeks: number;
  flags: Flag[];
  action: Action;
  recommended_qty: number;
  needs_judgment_by_rule: boolean;
  judgment_rule_reasons: string[];
  rule_trace: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function latestWeek(sales: SalesRow[]): string | null {
  let max: string | null = null;
  for (const s of sales) if (max === null || s.week > max) max = s.week; // YYYY-Www sorts lexically
  return max;
}

export function runRules(input: RuleInput): RuleResult[] {
  const { skus, weeklySales, inventory, calendar, config, runDate } = input;

  const anchor = latestWeek(weeklySales);
  const window12 = anchor ? trailingWeeks(anchor, 12) : [];
  const window4 = window12.slice(-4);

  const salesBySku = new Map<string, Map<string, number>>();
  for (const s of weeklySales) {
    if (!salesBySku.has(s.skuId)) salesBySku.set(s.skuId, new Map());
    salesBySku.get(s.skuId)!.set(s.week, s.unitsSold);
  }

  const onHandBySku = new Map<string, number>();
  for (const inv of inventory) onHandBySku.set(inv.skuId, (onHandBySku.get(inv.skuId) ?? 0) + inv.unitsOnHand);

  const runMonth = runDate.slice(0, 7);
  const isFestival = calendar.find((c) => c.yearMonth === runMonth)?.isFestival ?? false;

  return skus.map((sku) => {
    const series = salesBySku.get(sku.skuId) ?? new Map<string, number>();
    // Missing weeks are excluded (never imputed): average only the weeks present.
    const v12 = window12.filter((w) => series.has(w)).map((w) => series.get(w)!);
    const v4 = window4.filter((w) => series.has(w)).map((w) => series.get(w)!);
    const avg12 = mean(v12);
    const avg4 = mean(v4);
    const historyWeeks = v12.length;

    const adjustedWeekly = isFestival ? avg12 * config.festival_uplift : avg12;
    const unitsOnHand = onHandBySku.get(sku.skuId) ?? 0;
    const weeksOfCover = adjustedWeekly === 0 ? Infinity : unitsOnHand / adjustedWeekly;

    const [minW, maxW] =
      sku.perishability === "High"
        ? [config.high_perish_min_weeks, config.high_perish_max_weeks]
        : [config.low_perish_min_weeks, config.low_perish_max_weeks];

    const flags: Flag[] = [];
    const trace: string[] = [];
    const pct = avg12 > 0 ? ((avg4 / avg12 - 1) * 100).toFixed(1) : "n/a";
    const ratioPct = Math.round((config.high_demand_ratio - 1) * 1000) / 10;
    const highDemand = avg4 > avg12 * config.high_demand_ratio;
    if (highDemand) flags.push("HIGH_DEMAND");
    trace.push(
      `avg4 ${avg4.toFixed(1)} vs avg12 ${avg12.toFixed(1)} (${pct === "n/a" ? pct : (Number(pct) >= 0 ? "+" : "") + pct + "%"}) ${
        highDemand ? `> ${ratioPct}% → HIGH_DEMAND` : `≤ ${ratioPct}% → normal demand`
      }`,
    );
    if (isFestival) trace.push(`festival month ${runMonth}: weekly demand ${avg12.toFixed(1)} × ${config.festival_uplift} = ${adjustedWeekly.toFixed(1)}`);

    const coverStr = Number.isFinite(weeksOfCover) ? weeksOfCover.toFixed(2) : "∞";
    if (weeksOfCover < minW) {
      flags.push("STOCKOUT_RISK");
      trace.push(`cover ${coverStr} wks < ${minW} → STOCKOUT_RISK`);
    } else if (weeksOfCover > maxW) {
      flags.push("OVERSTOCK_RISK");
      trace.push(`cover ${coverStr} wks > ${maxW} → OVERSTOCK_RISK`);
    } else {
      trace.push(`cover ${coverStr} wks within ${minW}–${maxW} (${sku.perishability} perishability)`);
    }

    const has = (f: Flag) => flags.includes(f);
    let action: Action;
    let qty: number;
    if (has("OVERSTOCK_RISK")) {
      action = "PAUSE_NEXT_ORDER";
      qty = 0;
    } else if (has("STOCKOUT_RISK") && has("HIGH_DEMAND")) {
      action = "REORDER_NOW";
      qty = Math.round(sku.standardReorderQty * config.high_demand_multiplier);
    } else if (has("STOCKOUT_RISK")) {
      action = "REORDER_NOW";
      qty = Math.round(sku.standardReorderQty * config.stockout_multiplier);
    } else if (has("HIGH_DEMAND")) {
      action = "REORDER_INCREASED";
      qty = Math.round(sku.standardReorderQty * config.high_demand_multiplier);
    } else {
      action = "NO_ACTION";
      qty = 0;
    }
    trace.push(`→ ${action}${qty ? ` ${qty} units` : ""}`);

    const judgment: string[] = [];
    if (historyWeeks < config.min_history_weeks) judgment.push(`only ${historyWeeks} weeks of history (< ${config.min_history_weeks}) — possible new launch`);
    if (adjustedWeekly === 0) judgment.push("zero sales in the last 12 weeks");
    if (has("HIGH_DEMAND") && has("OVERSTOCK_RISK")) judgment.push("contradictory flags: HIGH_DEMAND with OVERSTOCK_RISK");
    if (judgment.length) trace.push(`Needs judgment: ${judgment.join("; ")}`);

    return {
      sku_id: sku.skuId,
      avg4,
      avg12,
      is_festival: isFestival,
      adjusted_weekly: adjustedWeekly,
      units_on_hand: unitsOnHand,
      weeks_of_cover: weeksOfCover,
      history_weeks: historyWeeks,
      flags,
      action,
      recommended_qty: qty,
      needs_judgment_by_rule: judgment.length > 0,
      judgment_rule_reasons: judgment,
      rule_trace: trace.join("; "),
    };
  });
}
