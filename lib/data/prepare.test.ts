import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareData } from "./prepare";
import { fallbackPlan } from "./fallbackPlan";
import { normalizeId, normalizeWeek, parseBoolean, parseNumber } from "./normalize";
import { MESSY_FILE, loadRaw, sampleRaw } from "@/lib/testing/sample";
import { runRules } from "@/lib/rules/engine";
import { DEFAULT_CONFIG } from "@/lib/rules/config";

const RUN_DATE = "2026-10-22";

describe("normalisers", () => {
  it("SKU ids", () => {
    expect(normalizeId("sku 1", "SKU")).toBe("SKU001");
    expect(normalizeId("SKU-12", "SKU")).toBe("SKU012");
    expect(normalizeId("Sku_07", "SKU")).toBe("SKU007");
    expect(normalizeId("dist 2", "DIST")).toBe("DIST002");
    expect(normalizeId("banana", "SKU")).toBeNull();
  });
  it("weeks", () => {
    expect(normalizeWeek("2026-W42")).toBe("2026-W42");
    expect(normalizeWeek("2026-42")).toBe("2026-W42");
    expect(normalizeWeek("W42 2026")).toBe("2026-W42");
    expect(normalizeWeek("W42-2026")).toBe("2026-W42");
    expect(normalizeWeek("2026-W60")).toBeNull();
  });
  it("numbers and booleans", () => {
    expect(parseNumber("1,200")).toBe("1200");
    expect(parseNumber("12.5")).toBeNull();
    expect(parseBoolean("Yes")).toBe("TRUE");
    expect(parseBoolean("no")).toBe("FALSE");
  });
});

describe("prepareData", () => {
  it("clean sample passes with no errors", () => {
    const raw = sampleRaw();
    const res = prepareData(raw, fallbackPlan(raw), RUN_DATE);
    expect(res.errors).toEqual([]);
    expect(res.clean!.skus).toHaveLength(15);
    expect(res.clean!.weeklySales).toHaveLength(240);
  });

  it("messy SAP export cleans to the same rules output, every fix logged", () => {
    const sample = sampleRaw();
    const clean = prepareData(sample, fallbackPlan(sample), RUN_DATE).clean!;
    const messyRaw = loadRaw([MESSY_FILE]);
    const messy = prepareData(messyRaw, fallbackPlan(messyRaw), RUN_DATE);
    expect(messy.errors).toEqual([]);
    const a = runRules({ ...clean, config: DEFAULT_CONFIG, runDate: RUN_DATE });
    const b = runRules({ ...messy.clean!, config: DEFAULT_CONFIG, runDate: RUN_DATE });
    expect(b).toEqual(a);
    const applied = messy.log.filter((l) => l.level === "applied");
    expect(applied.some((l) => l.fixType === "normalize_sku_id" && l.before === "sku 1" && l.after === "SKU001")).toBe(true);
    expect(applied.some((l) => l.fixType === "normalize_week_format" && l.before === "W27-2026" && l.after === "2026-W27")).toBe(true);
    expect(applied.some((l) => l.fixType === "column_mapping" && l.before === "Qty Sold" && l.after === "Units_Sold")).toBe(true);
    expect(applied.some((l) => l.fixType === "parse_boolean" && l.before === "Yes")).toBe(true);
  });

  it("SKU missing from sku_master fails validation with a row-level error and no clean data", () => {
    const dir = path.join(process.cwd(), "data", "invalid");
    const raw = loadRaw(fs.readdirSync(dir).map((f) => path.join(dir, f)));
    const res = prepareData(raw, fallbackPlan(raw), RUN_DATE);
    expect(res.clean).toBeNull();
    expect(res.errors).toContainEqual(
      expect.objectContaining({ level: "ERROR", sheet: "weekly_sales", row: 242, column: "SKU_ID", message: "SKU SKU099 is not in sku_master" }),
    );
  });

  it("missing dataset and run month outside the calendar are errors", () => {
    const raw = sampleRaw();
    delete raw.calendar;
    expect(prepareData(raw, fallbackPlan(raw), RUN_DATE).errors.some((e) => e.message.includes('"calendar" not found'))).toBe(true);
    const raw2 = sampleRaw();
    expect(prepareData(raw2, fallbackPlan(raw2), "2027-02-01").errors.some((e) => e.message.includes("run month 2027-02"))).toBe(true);
  });

  it("gaps are logged as missing, not invented; stale inventory warns", () => {
    const raw = sampleRaw();
    raw.weekly_sales = raw.weekly_sales.filter((r) => !(r.SKU_ID === "SKU003" && r.Week === "2026-W40"));
    const res = prepareData(raw, fallbackPlan(raw), "2026-10-30");
    expect(res.clean!.weeklySales).toHaveLength(239);
    expect(res.log.some((l) => l.level === "missing" && l.skuId === "SKU003" && l.message.includes("2026-W40"))).toBe(true);
    expect(res.warnings.some((w) => w.message.includes("days old"))).toBe(true);
  });

  it("non-allow-listed fixes are shown as warnings, not applied", () => {
    const raw = sampleRaw();
    const plan = { ...fallbackPlan(raw), proposedFixes: [{ type: "other", sheet: "sku_master", column: "Category", description: "Merge Snack and Snacks" }] };
    const res = prepareData(raw, plan, RUN_DATE);
    expect(res.log.some((l) => l.level === "warning" && l.message.startsWith("Gemini suggestion not auto-applied"))).toBe(true);
  });
});
