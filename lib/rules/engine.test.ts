import { describe, expect, it } from "vitest";
import { runRules, type RuleResult } from "./engine";
import { DEFAULT_CONFIG } from "./config";
import { sampleClean } from "@/lib/testing/sample";

// §7.3 golden table — runDate 2026-10-22 (October = festival month).
const GOLDEN: [string, number, number, number, number, string[], string, number][] = [
  // sku, avg4, avg12, onHand, cover, flags, action, qty
  ["SKU001", 261.0, 214.92, 900, 3.35, ["HIGH_DEMAND", "STOCKOUT_RISK"], "REORDER_NOW", 750],
  ["SKU002", 83.75, 83.75, 1200, 11.46, [], "NO_ACTION", 0],
  ["SKU003", 150.75, 150.5, 820, 4.36, ["STOCKOUT_RISK"], "REORDER_NOW", 300],
  ["SKU004", 81.0, 79.83, 180, 1.8, ["STOCKOUT_RISK"], "REORDER_NOW", 150],
  ["SKU005", 58.25, 59.5, 600, 8.07, [], "NO_ACTION", 0],
  ["SKU006", 40.25, 39.58, 1100, 22.23, ["OVERSTOCK_RISK"], "PAUSE_NEXT_ORDER", 0],
  ["SKU007", 133.5, 121.5, 620, 4.08, ["OVERSTOCK_RISK"], "PAUSE_NEXT_ORDER", 0],
  ["SKU008", 103.0, 108.75, 950, 6.99, [], "NO_ACTION", 0],
  ["SKU009", 34.75, 34.08, 400, 9.39, [], "NO_ACTION", 0],
  ["SKU010", 24.75, 24.42, 260, 8.52, [], "NO_ACTION", 0],
  ["SKU011", 209.25, 204.33, 460, 1.8, ["STOCKOUT_RISK"], "REORDER_NOW", 500],
  ["SKU012", 60.0, 56.75, 480, 6.77, [], "NO_ACTION", 0],
  ["SKU013", 44.75, 45.42, 180, 3.17, ["STOCKOUT_RISK"], "REORDER_NOW", 120],
  ["SKU014", 77.5, 72.42, 620, 6.85, [], "NO_ACTION", 0],
  ["SKU015", 28.75, 29.83, 360, 9.65, [], "NO_ACTION", 0],
];

function run(overrides: Partial<Parameters<typeof runRules>[0]> = {}): RuleResult[] {
  const clean = sampleClean();
  return runRules({
    skus: clean.skus,
    weeklySales: clean.weeklySales,
    inventory: clean.inventory,
    calendar: clean.calendar,
    config: DEFAULT_CONFIG,
    runDate: "2026-10-22",
    ...overrides,
  });
}

describe("rules engine — golden table §7.3", () => {
  const results = run();
  const byId = new Map(results.map((r) => [r.sku_id, r]));

  it.each(GOLDEN)("%s", (sku, avg4, avg12, onHand, cover, flags, action, qty) => {
    const r = byId.get(sku)!;
    expect(r.avg4.toFixed(2)).toBe(avg4.toFixed(2));
    expect(r.avg12.toFixed(2)).toBe(avg12.toFixed(2));
    expect(r.units_on_hand).toBe(onHand);
    expect(r.weeks_of_cover.toFixed(2)).toBe(cover.toFixed(2));
    expect([...r.flags].sort()).toEqual([...flags].sort());
    expect(r.action).toBe(action);
    expect(r.recommended_qty).toBe(qty);
    expect(r.is_festival).toBe(true);
    expect(r.needs_judgment_by_rule).toBe(false);
  });

  it("summary: 7 flagged / 15 — 5 stockout (1 also high-demand), 2 overstock", () => {
    expect(results).toHaveLength(15);
    expect(results.filter((r) => r.flags.length).length).toBe(7);
    expect(results.filter((r) => r.flags.includes("STOCKOUT_RISK")).length).toBe(5);
    expect(results.filter((r) => r.flags.includes("OVERSTOCK_RISK")).length).toBe(2);
    expect(results.filter((r) => r.flags.includes("HIGH_DEMAND")).length).toBe(1);
  });

  it("rule_trace is human-readable", () => {
    expect(byId.get("SKU001")!.rule_trace).toContain("avg4 261.0 vs avg12 214.9 (+21.4%) > 20% → HIGH_DEMAND");
    expect(byId.get("SKU001")!.rule_trace).toContain("cover 3.35 wks < 6 → STOCKOUT_RISK");
  });
});

describe("rules engine — extra cases", () => {
  it("non-festival month: no uplift", () => {
    const clean = sampleClean("2026-09-15");
    const r = runRules({ ...clean, config: DEFAULT_CONFIG, runDate: "2026-09-15" }).find((x) => x.sku_id === "SKU001")!;
    expect(r.is_festival).toBe(false);
    expect(r.adjusted_weekly).toBeCloseTo(r.avg12, 10);
    expect(r.weeks_of_cover).toBeCloseTo(900 / r.avg12, 10);
  });

  it("SKU with 8 weeks of history → needs_judgment_by_rule", () => {
    const clean = sampleClean();
    const keepWeeks = new Set(["2026-W35", "2026-W36", "2026-W37", "2026-W38", "2026-W39", "2026-W40", "2026-W41", "2026-W42"]);
    const sales = clean.weeklySales.filter((s) => s.skuId !== "SKU002" || keepWeeks.has(s.week));
    const r = runRules({ ...clean, weeklySales: sales, config: DEFAULT_CONFIG, runDate: "2026-10-22" }).find((x) => x.sku_id === "SKU002")!;
    expect(r.history_weeks).toBe(8);
    expect(r.needs_judgment_by_rule).toBe(true);
    expect(r.avg12).toBeCloseTo((80 + 79 + 82 + 89 + 80 + 86 + 86 + 83) / 8, 10);
  });

  it("zero sales → infinite cover, needs judgment", () => {
    const clean = sampleClean();
    const sales = clean.weeklySales.map((s) => (s.skuId === "SKU005" ? { ...s, unitsSold: 0 } : s));
    const r = runRules({ ...clean, weeklySales: sales, config: DEFAULT_CONFIG, runDate: "2026-10-22" }).find((x) => x.sku_id === "SKU005")!;
    expect(r.adjusted_weekly).toBe(0);
    expect(r.weeks_of_cover).toBe(Infinity);
    expect(r.needs_judgment_by_rule).toBe(true);
  });

  it("multi-location inventory is summed", () => {
    const clean = sampleClean();
    const inventory = [
      ...clean.inventory.filter((i) => i.skuId !== "SKU004"),
      { skuId: "SKU004", location: "Pune", unitsOnHand: 100, asOfDate: "2026-10-19" },
      { skuId: "SKU004", location: "Goa", unitsOnHand: 300, asOfDate: "2026-10-19" },
    ];
    const r = runRules({ ...clean, inventory, config: DEFAULT_CONFIG, runDate: "2026-10-22" }).find((x) => x.sku_id === "SKU004")!;
    expect(r.units_on_hand).toBe(400);
    expect(r.weeks_of_cover).toBeCloseTo(400 / (r.avg12 * 1.25), 10);
  });

  it("raising high_perish_max_weeks changes the SKU007 outcome", () => {
    const before = run().find((x) => x.sku_id === "SKU007")!;
    const after = run({ config: { ...DEFAULT_CONFIG, high_perish_max_weeks: 5 } }).find((x) => x.sku_id === "SKU007")!;
    expect(before.action).toBe("PAUSE_NEXT_ORDER");
    expect(after.flags).toEqual([]);
    expect(after.action).toBe("NO_ACTION");
  });

  it("missing weeks are excluded from averages, not imputed", () => {
    const clean = sampleClean();
    const sales = clean.weeklySales.filter((s) => !(s.skuId === "SKU003" && s.week === "2026-W40"));
    const r = runRules({ ...clean, weeklySales: sales, config: DEFAULT_CONFIG, runDate: "2026-10-22" }).find((x) => x.sku_id === "SKU003")!;
    expect(r.avg4).toBeCloseTo((143 + 150 + 159) / 3, 10);
    expect(r.history_weeks).toBe(11);
    expect(r.needs_judgment_by_rule).toBe(true);
  });

  it("is pure: same input, same output", () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
