// Rules → Gemini forecast → final tag. No DB access, so it can be tested with a mocked Gemini.

import type { CleanDatasets } from "@/lib/data/types";
import type { OutlierNote } from "@/lib/data/prepare";
import { addWeeks, isoWeekMonth, trailingWeeks } from "@/lib/data/isoWeek";
import { latestWeek, runRules, type RuleResult } from "@/lib/rules/engine";
import type { RuleConfig } from "@/lib/rules/config";
import type { AiCallLogger, GeminiClient } from "@/lib/ai/gemini";
import {
  type AiColumns,
  type ForecastInput,
  type JudgmentTrigger,
  type PastOverride,
  computeFinalTag,
  forecastAll,
  toAiColumns,
} from "@/lib/ai/forecast";

export interface AnalysedRec extends AiColumns {
  rule: RuleResult;
  finalTag: "STANDARD" | "NEEDS_JUDGMENT";
  judgmentTriggers: JudgmentTrigger[];
}

export async function analyse(args: {
  clean: CleanDatasets;
  config: RuleConfig;
  runDate: string;
  outlierNotes: OutlierNote[];
  overridesBySku: Map<string, PastOverride[]>;
  overrideRateBySku: Map<string, number>;
  client: GeminiClient | null;
  runId: number | null;
  logger?: AiCallLogger;
}): Promise<{ recs: AnalysedRec[]; aiErrors: string[] }> {
  const { clean, config, runDate } = args;
  const activeDist = new Set(clean.distributors.filter((d) => d.status === "Active").map((d) => d.distributorId));
  const skus = clean.skus.filter((s) => activeDist.has(s.distributorId));

  const rules = runRules({ skus, weeklySales: clean.weeklySales, inventory: clean.inventory, calendar: clean.calendar, config, runDate });

  const anchor = latestWeek(clean.weeklySales);
  const last16 = anchor ? trailingWeeks(anchor, 16) : [];
  const next4 = anchor
    ? [1, 2, 3, 4].map((n) => {
        const week = addWeeks(anchor, n);
        const month = isoWeekMonth(week);
        return { week, month, is_festival_month: clean.calendar.find((c) => c.yearMonth === month)?.isFestival ?? false };
      })
    : [];
  const salesIdx = new Map(clean.weeklySales.map((s) => [`${s.skuId}|${s.week}`, s.unitsSold]));
  const skuById = new Map(skus.map((s) => [s.skuId, s]));

  const inputs: ForecastInput[] = rules.map((r) => {
    const sku = skuById.get(r.sku_id)!;
    return {
      sku_id: r.sku_id,
      name: sku.name,
      category: sku.category,
      perishability: sku.perishability,
      standard_reorder_qty: sku.standardReorderQty,
      sales_last_16_weeks: last16.filter((w) => salesIdx.has(`${r.sku_id}|${w}`)).map((w) => ({ week: w, units: salesIdx.get(`${r.sku_id}|${w}`)! })),
      next_4_weeks: next4,
      rules: { ...r, weeks_of_cover: Number.isFinite(r.weeks_of_cover) ? Math.round(r.weeks_of_cover * 100) / 100 : null },
      outlier_notes: args.outlierNotes.filter((o) => o.sku_id === r.sku_id).map((o) => `${o.week}: ${o.value} — ${o.note}`),
      past_overrides: args.overridesBySku.get(r.sku_id) ?? [],
      override_rate: args.overrideRateBySku.get(r.sku_id) ?? null,
    };
  });

  const { results, errors } = await forecastAll(inputs, { client: args.client, runId: args.runId, logger: args.logger });

  const recs = rules.map((rule) => {
    const ai = results.get(rule.sku_id) ?? null;
    const { finalTag, triggers } = computeFinalTag(rule, ai);
    return { rule, ...toAiColumns(ai), finalTag, judgmentTriggers: triggers };
  });
  return { recs, aiErrors: errors };
}
