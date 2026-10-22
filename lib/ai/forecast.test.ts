import { describe, expect, it, vi } from "vitest";
import { computeFinalTag, toAiColumns, type AiForecast } from "./forecast";
import type { GeminiClient } from "./gemini";
import { analyse } from "@/lib/pipeline/analyse";
import { sampleClean } from "@/lib/testing/sample";
import { DEFAULT_CONFIG } from "@/lib/rules/config";

const base: AiForecast = { sku_id: "X", forecast_weekly: [100, 100, 100, 100], reason: "ok", ai_tag: "STANDARD", judgment_reason: null, confidence: "high" };

describe("computeFinalTag", () => {
  const rule = { needs_judgment_by_rule: false, adjusted_weekly: 100 };
  it("STANDARD when nothing triggers", () => {
    expect(computeFinalTag(rule, base)).toEqual({ finalTag: "STANDARD", triggers: [] });
  });
  it("rule judgment", () => {
    expect(computeFinalTag({ ...rule, needs_judgment_by_rule: true }, base).triggers).toEqual(["RULE"]);
  });
  it("AI tag", () => {
    expect(computeFinalTag(rule, { ...base, ai_tag: "NEEDS_JUDGMENT" }).triggers).toEqual(["AI_TAG"]);
  });
  it("forecast disagreement > 25%", () => {
    expect(computeFinalTag(rule, { ...base, forecast_weekly: [126, 126, 126, 126] }).triggers).toEqual(["FORECAST_DISAGREES"]);
    expect(computeFinalTag(rule, { ...base, forecast_weekly: [125, 125, 125, 125] }).triggers).toEqual([]);
  });
  it("low confidence", () => {
    expect(computeFinalTag(rule, { ...base, confidence: "low" }).triggers).toEqual(["LOW_CONFIDENCE"]);
  });
  it("AI unavailable", () => {
    expect(computeFinalTag(rule, null)).toEqual({ finalTag: "NEEDS_JUDGMENT", triggers: ["AI_UNAVAILABLE"] });
  });
});

function mockClient(fn: GeminiClient["generate"]): GeminiClient {
  return { model: "mock", generate: vi.fn(fn) };
}

const baseArgs = () => ({
  clean: sampleClean(),
  config: DEFAULT_CONFIG,
  runDate: "2026-10-22",
  outlierNotes: [],
  overridesBySku: new Map(),
  overrideRateBySku: new Map(),
  runId: null,
});

describe("Gemini guardrails", () => {
  it("ignores any quantity/action Gemini tries to return — recommended_qty comes only from rules", async () => {
    const client = mockClient(async ({ user }) => {
      const skus = JSON.parse(user).skus as { sku_id: string; rules: { adjusted_weekly: number } }[];
      return {
        text: JSON.stringify({
          items: skus.map((s) => ({
            sku_id: s.sku_id,
            forecast_weekly: Array(4).fill(s.rules.adjusted_weekly),
            reason: "r",
            ai_tag: "STANDARD",
            judgment_reason: null,
            confidence: "high",
            recommended_qty: 99999,
            action: "REORDER_NOW",
            final_qty: 12345,
          })),
        }),
      };
    });
    const { recs } = await analyse({ ...baseArgs(), client });
    const sku1 = recs.find((r) => r.rule.sku_id === "SKU001")!;
    expect(sku1.rule.recommended_qty).toBe(750);
    expect(recs.find((r) => r.rule.sku_id === "SKU002")!.rule.action).toBe("NO_ACTION");
    for (const r of recs) {
      expect(r.rule.recommended_qty).not.toBe(99999);
      const cols = toAiColumns({ ...base });
      expect(Object.keys(cols)).not.toContain("recommendedQty");
    }
    expect(recs.every((r) => r.finalTag === "STANDARD")).toBe(true);
  });

  it("if Gemini is down, rules output survives and every SKU is NEEDS_JUDGMENT", async () => {
    const client = mockClient(async () => {
      throw new Error("503 Service Unavailable");
    });
    const { recs, aiErrors } = await analyse({ ...baseArgs(), client });
    expect(client.generate).toHaveBeenCalledTimes(2); // 1 call + 1 retry
    expect(aiErrors.length).toBe(1);
    expect(recs).toHaveLength(15);
    expect(recs.filter((r) => r.rule.flags.length).length).toBe(7);
    expect(recs.every((r) => r.aiUnavailable && r.finalTag === "NEEDS_JUDGMENT" && r.judgmentTriggers.includes("AI_UNAVAILABLE"))).toBe(true);
    expect(recs.find((r) => r.rule.sku_id === "SKU001")!.rule.recommended_qty).toBe(750);
  });

  it("batches 20 SKUs per call and passes override history into the prompt", async () => {
    const prompts: string[] = [];
    const client = mockClient(async ({ user }) => {
      prompts.push(user);
      return { text: JSON.stringify({ items: [] }) };
    });
    const overridesBySku = new Map([
      ["SKU007", [{ date: "2026-10-19", original_action: "PAUSE_NEXT_ORDER", original_qty: 0, new_action: "REORDER_NOW", new_qty: 200, reason_code: "PROMO_OR_SCHEME", note: "Diwali scheme" }]],
    ]);
    await analyse({ ...baseArgs(), overridesBySku, overrideRateBySku: new Map([["SKU007", 1]]), client });
    expect(prompts).toHaveLength(1);
    const sku7 = JSON.parse(prompts[0]).skus.find((s: { sku_id: string }) => s.sku_id === "SKU007");
    expect(sku7.past_overrides[0].reason_code).toBe("PROMO_OR_SCHEME");
    expect(sku7.override_rate).toBe(1);
    expect(sku7.sales_last_16_weeks).toHaveLength(16);
  });
});
