// Gemini — forecast, explain & tag (§8.3). Gemini never sees a writable quantity field:
// its output is parsed through a strict zod schema and mapped onto AI-only columns (toAiColumns).

import { z } from "zod";
import type { RuleResult } from "@/lib/rules/engine";
import { type AiCallLogger, type GeminiClient, callGeminiJson } from "./gemini";
import { PROMPT_FORECAST_V1, PROMPT_FORECAST_VERSION } from "./prompts";

export const BATCH_SIZE = 20;
export const MAX_PARALLEL = 4;

export interface PastOverride {
  date: string;
  original_action: string;
  original_qty: number;
  new_action: string;
  new_qty: number;
  reason_code: string;
  note: string | null;
}

export interface ForecastInput {
  sku_id: string;
  name: string;
  category: string;
  perishability: string;
  standard_reorder_qty: number;
  sales_last_16_weeks: { week: string; units: number }[];
  next_4_weeks: { week: string; month: string; is_festival_month: boolean }[];
  rules: Omit<RuleResult, "weeks_of_cover"> & { weeks_of_cover: number | null };
  outlier_notes: string[];
  past_overrides: PastOverride[];
  override_rate: number | null;
}

export const AiForecastZ = z.object({
  sku_id: z.string(),
  forecast_weekly: z.array(z.number()).length(4),
  reason: z.string(),
  ai_tag: z.enum(["STANDARD", "NEEDS_JUDGMENT"]),
  judgment_reason: z.string().nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type AiForecast = z.infer<typeof AiForecastZ>;

const ResponseZ = z.object({ items: z.array(AiForecastZ) });

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      maxItems: String(BATCH_SIZE),
      items: {
        type: "OBJECT",
        properties: {
          sku_id: { type: "STRING", maxLength: "12" },
          forecast_weekly: { type: "ARRAY", items: { type: "NUMBER" }, minItems: "4", maxItems: "4" },
          reason: { type: "STRING", maxLength: "400" },
          ai_tag: { type: "STRING", enum: ["STANDARD", "NEEDS_JUDGMENT"] },
          judgment_reason: { type: "STRING", nullable: true, maxLength: "300" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["sku_id", "forecast_weekly", "reason", "ai_tag", "confidence"],
      },
    },
  },
  required: ["items"],
};

/** The ONLY columns an AI result may write. recommended_qty / action are deliberately absent. */
export interface AiColumns {
  forecastWeekly: number[] | null;
  aiReason: string | null;
  aiTag: string | null;
  aiJudgmentReason: string | null;
  aiConfidence: string | null;
  aiUnavailable: boolean;
}

export function toAiColumns(ai: AiForecast | null): AiColumns {
  if (!ai) return { forecastWeekly: null, aiReason: null, aiTag: null, aiJudgmentReason: null, aiConfidence: null, aiUnavailable: true };
  return {
    forecastWeekly: ai.forecast_weekly.map((n) => Math.max(0, Math.round(n))),
    aiReason: ai.reason,
    aiTag: ai.ai_tag,
    aiJudgmentReason: ai.judgment_reason ?? null,
    aiConfidence: ai.confidence,
    aiUnavailable: false,
  };
}

export type JudgmentTrigger = "RULE" | "AI_TAG" | "FORECAST_DISAGREES" | "LOW_CONFIDENCE" | "AI_UNAVAILABLE";

/** Final tag is computed in code, not by Gemini (§8.3). */
export function computeFinalTag(
  rule: Pick<RuleResult, "needs_judgment_by_rule" | "adjusted_weekly">,
  ai: AiForecast | null,
): { finalTag: "STANDARD" | "NEEDS_JUDGMENT"; triggers: JudgmentTrigger[] } {
  const triggers: JudgmentTrigger[] = [];
  if (rule.needs_judgment_by_rule) triggers.push("RULE");
  if (!ai) {
    triggers.push("AI_UNAVAILABLE");
  } else {
    if (ai.ai_tag === "NEEDS_JUDGMENT") triggers.push("AI_TAG");
    const meanF = ai.forecast_weekly.reduce((a, b) => a + b, 0) / ai.forecast_weekly.length;
    const adj = rule.adjusted_weekly;
    const disagrees = adj === 0 ? meanF > 0 : Math.abs(meanF - adj) / adj > 0.25;
    if (disagrees) triggers.push("FORECAST_DISAGREES");
    if (ai.confidence === "low") triggers.push("LOW_CONFIDENCE");
  }
  return { finalTag: triggers.length ? "NEEDS_JUDGMENT" : "STANDARD", triggers };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export function buildForecastPrompt(batch: ForecastInput[]): string {
  return JSON.stringify({
    instructions:
      "Return one item per SKU in `skus`, with the same sku_id. forecast_weekly = 4 numbers for the next 4 weeks in order. Weekly demand implied by the rules = rules.adjusted_weekly.",
    skus: batch,
  });
}

export async function forecastAll(
  inputs: ForecastInput[],
  opts: { client: GeminiClient | null; runId: number | null; logger?: AiCallLogger },
): Promise<{ results: Map<string, AiForecast | null>; errors: string[] }> {
  const batches: ForecastInput[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) batches.push(inputs.slice(i, i + BATCH_SIZE));
  const results = new Map<string, AiForecast | null>();
  const errors: string[] = [];

  await mapLimit(batches, MAX_PARALLEL, async (batch) => {
    try {
      const r = await callGeminiJson({
        client: opts.client,
        system: PROMPT_FORECAST_V1,
        user: buildForecastPrompt(batch),
        responseSchema: RESPONSE_SCHEMA,
        zod: ResponseZ,
        purpose: "forecast",
        promptVersion: PROMPT_FORECAST_VERSION,
        runId: opts.runId,
        logger: opts.logger,
      });
      const ids = new Set(batch.map((b) => b.sku_id));
      for (const item of r.items) if (ids.has(item.sku_id)) results.set(item.sku_id, item);
      for (const b of batch) if (!results.has(b.sku_id)) results.set(b.sku_id, null);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      for (const b of batch) results.set(b.sku_id, null);
    }
  });
  return { results, errors };
}
