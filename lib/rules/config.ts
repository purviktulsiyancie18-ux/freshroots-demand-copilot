export interface RuleConfig {
  high_demand_ratio: number;
  high_demand_multiplier: number;
  stockout_multiplier: number;
  festival_uplift: number;
  low_perish_min_weeks: number;
  low_perish_max_weeks: number;
  high_perish_min_weeks: number;
  high_perish_max_weeks: number;
  min_history_weeks: number;
}

export type RuleConfigKey = keyof RuleConfig;

export const DEFAULT_CONFIG: RuleConfig = {
  high_demand_ratio: 1.2,
  high_demand_multiplier: 1.5,
  stockout_multiplier: 1.0,
  festival_uplift: 1.25,
  low_perish_min_weeks: 6,
  low_perish_max_weeks: 14,
  high_perish_min_weeks: 3,
  high_perish_max_weeks: 4,
  min_history_weeks: 12,
};

export const CONFIG_META: Record<
  RuleConfigKey,
  { label: string; help: string; min: number; max: number; integer?: boolean }
> = {
  high_demand_ratio: {
    label: "High-demand ratio",
    help: "Flag HIGH_DEMAND when last-4-week avg is more than this × the 12-week avg.",
    min: 1,
    max: 5,
  },
  high_demand_multiplier: {
    label: "High-demand reorder multiplier",
    help: "Reorder qty = standard qty × this when HIGH_DEMAND.",
    min: 1,
    max: 5,
  },
  stockout_multiplier: {
    label: "Stockout reorder multiplier",
    help: "Reorder qty = standard qty × this for STOCKOUT_RISK without high demand (PRD decision 4).",
    min: 0.5,
    max: 5,
  },
  festival_uplift: {
    label: "Festival uplift",
    help: "Weekly demand is multiplied by this in festival months, before thresholds are checked.",
    min: 1,
    max: 3,
  },
  low_perish_min_weeks: { label: "Low perishability — min weeks of cover", help: "Below this → STOCKOUT_RISK.", min: 0, max: 52 },
  low_perish_max_weeks: { label: "Low perishability — max weeks of cover", help: "Above this → OVERSTOCK_RISK.", min: 1, max: 104 },
  high_perish_min_weeks: { label: "High perishability — min weeks of cover", help: "Below this → STOCKOUT_RISK.", min: 0, max: 52 },
  high_perish_max_weeks: { label: "High perishability — max weeks of cover", help: "Above this → OVERSTOCK_RISK.", min: 1, max: 104 },
  min_history_weeks: {
    label: "Minimum weeks of history",
    help: "SKUs with fewer weeks of sales are treated as new launches (Needs judgment).",
    min: 1,
    max: 52,
    integer: true,
  },
};

export function validateConfig(c: RuleConfig): string[] {
  const errs: string[] = [];
  for (const [k, meta] of Object.entries(CONFIG_META) as [RuleConfigKey, (typeof CONFIG_META)[RuleConfigKey]][]) {
    const v = c[k];
    if (typeof v !== "number" || !Number.isFinite(v)) errs.push(`${meta.label}: must be a number`);
    else if (v < meta.min || v > meta.max) errs.push(`${meta.label}: must be between ${meta.min} and ${meta.max}`);
    else if (meta.integer && !Number.isInteger(v)) errs.push(`${meta.label}: must be a whole number`);
  }
  if (c.low_perish_min_weeks >= c.low_perish_max_weeks) errs.push("Low perishability: min weeks must be below max weeks");
  if (c.high_perish_min_weeks >= c.high_perish_max_weeks) errs.push("High perishability: min weeks must be below max weeks");
  return errs;
}
