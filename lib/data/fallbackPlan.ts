// Deterministic header/sheet matcher. Used when Gemini is unavailable and to fill gaps in Gemini's mapping,
// so a clean upload never depends on the AI.

import { type DatasetName, type RawSheets, DATASETS, REQUIRED_COLUMNS } from "./types";
import type { CleaningPlan } from "./prepare";

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const COLUMN_SYNONYMS: Record<string, string[]> = {
  SKU_ID: ["skuid", "sku", "itemcode", "item", "itemid", "productcode", "material", "materialcode", "skucode"],
  SKU_Name: ["skuname", "itemname", "productname", "description", "itemdescription", "name"],
  Category: ["category", "productcategory", "cat"],
  Perishability: ["perishability", "perishable", "shelflife"],
  Standard_Reorder_Qty: ["standardreorderqty", "reorderqty", "stdreorderqty", "stdqty", "moq", "reorderquantity"],
  Unit_of_Measure: ["unitofmeasure", "uom", "unit"],
  Distributor_ID: ["distributorid", "distributor", "distid", "distributorcode", "distcode", "vendorcode"],
  Distributor_Name: ["distributorname", "distname", "name", "vendorname"],
  Region: ["region", "state", "zone"],
  Status: ["status", "active"],
  Week: ["week", "wk", "isoweek", "weekno", "salesweek"],
  Units_Sold: ["unitssold", "qtysold", "quantitysold", "sales", "salesqty", "units", "qty"],
  Location: ["location", "warehouse", "plant", "store"],
  Units_On_Hand: ["unitsonhand", "onhand", "stock", "qtyonhand", "closingstock", "soh", "stockonhand"],
  As_Of_Date: ["asofdate", "date", "stockdate", "snapshotdate"],
  Year: ["year", "yr"],
  Month: ["month", "mon", "monthno"],
  Year_Month: ["yearmonth", "period", "ym"],
  Is_Festival_Month: ["isfestivalmonth", "festival", "festivalmonth", "isfestival"],
};

const SHEET_SYNONYMS: Record<DatasetName, string[]> = {
  sku_master: ["skumaster", "sku", "skus", "itemmaster", "products", "productmaster", "items"],
  distributor_master: ["distributormaster", "distributors", "distributor", "dist"],
  weekly_sales: ["weeklysales", "sales", "saleswk", "salesweekly", "salesdata"],
  current_inventory: ["currentinventory", "inventory", "stock", "stockonhand", "soh"],
  calendar: ["calendar", "festivalcal", "festivalcalendar", "cal", "festivals"],
};

export function matchColumn(header: string, dataset: DatasetName): string | null {
  const k = key(header);
  for (const target of REQUIRED_COLUMNS[dataset]) if (key(target) === k) return target;
  for (const target of REQUIRED_COLUMNS[dataset]) if (COLUMN_SYNONYMS[target]?.includes(k)) return target;
  return null;
}

export function fallbackPlan(raw: RawSheets): CleaningPlan {
  const sheetMapping: Record<string, string> = {};
  const columnMapping: Record<string, Record<string, string>> = {};
  const taken = new Set<string>();

  // Score each sheet against each dataset by name match + how many required columns it covers.
  const scores: { sheet: string; d: DatasetName; score: number }[] = [];
  for (const [sheet, rows] of Object.entries(raw)) {
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    for (const d of DATASETS) {
      const covered = new Set(headers.map((h) => matchColumn(h, d)).filter(Boolean));
      let score = covered.size / REQUIRED_COLUMNS[d].length;
      if (SHEET_SYNONYMS[d].includes(key(sheet)) || key(sheet).includes(key(d))) score += 1;
      scores.push({ sheet, d, score });
    }
  }
  scores.sort((a, b) => b.score - a.score);
  for (const { sheet, d, score } of scores) {
    if (score < 0.6 || sheetMapping[sheet] || taken.has(d)) continue;
    sheetMapping[sheet] = d;
    taken.add(d);
  }

  for (const [sheet, d] of Object.entries(sheetMapping)) {
    const headers = Array.from(new Set(raw[sheet].flatMap((r) => Object.keys(r))));
    const m: Record<string, string> = {};
    const used = new Set<string>();
    for (const h of headers) {
      const t = matchColumn(h, d as DatasetName);
      if (t && !used.has(t)) {
        m[h] = t;
        used.add(t);
      }
    }
    columnMapping[sheet] = m;
  }
  return { sheetMapping, columnMapping, proposedFixes: [], outlierNotes: [], source: "fallback" };
}

/** Gemini's mapping wins where it is valid; the deterministic matcher fills any gaps. */
export function mergePlans(ai: CleaningPlan, fb: CleaningPlan, raw: RawSheets): CleaningPlan {
  const sheetMapping: Record<string, string> = {};
  const usedTargets = new Set<string>();
  for (const [s, t] of Object.entries(ai.sheetMapping)) {
    if (s in raw && (DATASETS as readonly string[]).includes(t) && !usedTargets.has(t)) {
      sheetMapping[s] = t;
      usedTargets.add(t);
    }
  }
  for (const [s, t] of Object.entries(fb.sheetMapping)) {
    if (!sheetMapping[s] && !usedTargets.has(t)) {
      sheetMapping[s] = t;
      usedTargets.add(t);
    }
  }
  const columnMapping: Record<string, Record<string, string>> = {};
  for (const [s, t] of Object.entries(sheetMapping)) {
    const required = REQUIRED_COLUMNS[t as DatasetName];
    const merged: Record<string, string> = {};
    const used = new Set<string>();
    for (const [src, tgt] of Object.entries(ai.columnMapping[s] ?? {})) {
      if (required.includes(tgt) && !used.has(tgt)) {
        merged[src] = tgt;
        used.add(tgt);
      }
    }
    const fbCols = fb.sheetMapping[s] === t ? fb.columnMapping[s] ?? {} : fallbackPlan({ [s]: raw[s] }).columnMapping[s] ?? {};
    for (const [src, tgt] of Object.entries(fbCols)) {
      if (!merged[src] && !used.has(tgt)) {
        merged[src] = tgt;
        used.add(tgt);
      }
    }
    columnMapping[s] = merged;
  }
  return { ...ai, sheetMapping, columnMapping };
}
