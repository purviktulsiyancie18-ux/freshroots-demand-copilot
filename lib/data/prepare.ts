// "AI proposes, code applies": takes the raw staged sheets + a cleaning plan (from Gemini or the
// deterministic fallback), applies mapping and allow-listed fixes, then runs the hard validation gate (§8.2).

import {
  type CalendarRow,
  type CleanDatasets,
  type DatasetName,
  type DistributorRow,
  type InventoryRow,
  type RawSheets,
  type SalesRow,
  type SkuRow,
  DATASETS,
  REQUIRED_COLUMNS,
} from "./types";
import {
  type AllowedFixType,
  ALLOWED_FIX_TYPES,
  normalizeEnum,
  normalizeId,
  normalizeWeek,
  parseBoolean,
  parseDate,
  parseNumber,
  trimWhitespace,
} from "./normalize";
import { addWeeks } from "./isoWeek";

export interface ProposedFix {
  type: string;
  sheet: string;
  column: string;
  description: string;
  example_before?: string;
  example_after?: string;
}

export interface OutlierNote {
  sku_id: string;
  week: string;
  value: number;
  note: string;
}

export interface CleaningPlan {
  sheetMapping: Record<string, string>;
  columnMapping: Record<string, Record<string, string>>;
  proposedFixes: ProposedFix[];
  outlierNotes: OutlierNote[];
  source: "gemini" | "fallback";
}

export interface LogEntry {
  sheet: string | null;
  rowNum: number | null;
  columnName: string | null;
  before: string | null;
  after: string | null;
  fixType: string | null;
  level: "applied" | "warning" | "missing" | "error";
  message: string;
  skuId?: string | null;
}

export interface Issue {
  level: "ERROR" | "WARNING";
  sheet: string | null;
  row: number | null;
  column: string | null;
  message: string;
}

export interface PrepareResult {
  clean: CleanDatasets | null;
  log: LogEntry[];
  errors: Issue[];
  warnings: Issue[];
}

type ColType =
  | { kind: "sku" }
  | { kind: "dist" }
  | { kind: "str" }
  | { kind: "int" }
  | { kind: "week" }
  | { kind: "bool" }
  | { kind: "date" }
  | { kind: "yearmonth" }
  | { kind: "enum"; values: string[] };

const COL_TYPES: Record<DatasetName, Record<string, ColType>> = {
  sku_master: {
    SKU_ID: { kind: "sku" },
    SKU_Name: { kind: "str" },
    Category: { kind: "str" },
    Perishability: { kind: "enum", values: ["High", "Low"] },
    Standard_Reorder_Qty: { kind: "int" },
    Unit_of_Measure: { kind: "str" },
    Distributor_ID: { kind: "dist" },
  },
  distributor_master: {
    Distributor_ID: { kind: "dist" },
    Distributor_Name: { kind: "str" },
    Region: { kind: "str" },
    Status: { kind: "enum", values: ["Active", "Inactive"] },
  },
  weekly_sales: { SKU_ID: { kind: "sku" }, Week: { kind: "week" }, Units_Sold: { kind: "int" } },
  current_inventory: {
    SKU_ID: { kind: "sku" },
    Location: { kind: "str" },
    Units_On_Hand: { kind: "int" },
    As_Of_Date: { kind: "date" },
  },
  calendar: { Year: { kind: "int" }, Month: { kind: "int" }, Year_Month: { kind: "yearmonth" }, Is_Festival_Month: { kind: "bool" } },
};

const FIX_FOR_KIND: Partial<Record<ColType["kind"], AllowedFixType>> = {
  sku: "normalize_sku_id",
  dist: "normalize_sku_id",
  week: "normalize_week_format",
  int: "parse_number",
  bool: "parse_boolean",
};

function normalizeYearMonth(v: string): string | null {
  const s = trimWhitespace(v);
  let m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
  const d = parseDate(s);
  return d ? d.slice(0, 7) : null;
}

function coerce(value: string, t: ColType): string | null {
  switch (t.kind) {
    case "sku":
      return normalizeId(value, "SKU");
    case "dist":
      return normalizeId(value, "DIST");
    case "str":
      return trimWhitespace(value);
    case "int":
      return parseNumber(value);
    case "week":
      return normalizeWeek(value);
    case "bool":
      return parseBoolean(value);
    case "date":
      return parseDate(value);
    case "yearmonth":
      return normalizeYearMonth(value);
    case "enum":
      return normalizeEnum(value, t.values);
  }
}

const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function prepareData(raw: RawSheets, plan: CleaningPlan, runDate: string): PrepareResult {
  const log: LogEntry[] = [];
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (sheet: string | null, row: number | null, column: string | null, message: string) =>
    errors.push({ level: "ERROR", sheet, row, column, message });
  const warn = (sheet: string | null, row: number | null, column: string | null, message: string) =>
    warnings.push({ level: "WARNING", sheet, row, column, message });

  // 1. Sheet mapping
  const sheetFor: Partial<Record<DatasetName, string>> = {};
  for (const [sheet, target] of Object.entries(plan.sheetMapping)) {
    if (!(sheet in raw)) continue;
    if (!(DATASETS as readonly string[]).includes(target)) continue;
    if (sheetFor[target as DatasetName]) {
      err(sheet, null, null, `Two uploaded sheets map to ${target} ("${sheetFor[target as DatasetName]}" and "${sheet}")`);
      continue;
    }
    sheetFor[target as DatasetName] = sheet;
    if (sheet !== target) log.push({ sheet, rowNum: null, columnName: null, before: sheet, after: target, fixType: "sheet_mapping", level: "applied", message: `Sheet "${sheet}" mapped to ${target}` });
  }
  for (const d of DATASETS) if (!sheetFor[d]) err(null, null, null, `Dataset "${d}" not found in the upload (sheets: ${Object.keys(raw).join(", ") || "none"})`);
  for (const sheet of Object.keys(raw)) if (!Object.values(sheetFor).includes(sheet)) warn(sheet, null, null, `Sheet "${sheet}" was not recognised and is ignored`);

  // 2. Column mapping + allow-listed fixes
  const proposedFor = (sheet: string, column: string, type: string) =>
    plan.proposedFixes.find((f) => f.sheet === sheet && keyOf(f.column) === keyOf(column) && f.type === type);
  for (const f of plan.proposedFixes) {
    if (!(ALLOWED_FIX_TYPES as readonly string[]).includes(f.type)) {
      // Shown in the cleaning log for Raghav; validation below still decides whether the column is usable.
      log.push({ sheet: f.sheet, rowNum: null, columnName: f.column, before: f.example_before ?? null, after: f.example_after ?? null, fixType: f.type, level: "warning", message: `Gemini suggestion not auto-applied (type "${f.type}" is not allow-listed): ${f.description}` });
    }
  }

  const mapped: Partial<Record<DatasetName, { rowNum: number; v: Record<string, string> }[]>> = {};
  for (const d of DATASETS) {
    const sheet = sheetFor[d];
    if (!sheet) continue;
    const rows = raw[sheet];
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const colMap = plan.columnMapping[sheet] ?? {};
    const srcFor: Record<string, string> = {};
    for (const h of headers) {
      const target = colMap[h] ?? REQUIRED_COLUMNS[d].find((c) => keyOf(c) === keyOf(h));
      if (!target || !REQUIRED_COLUMNS[d].includes(target) || srcFor[target]) continue;
      srcFor[target] = h;
      if (h !== target) log.push({ sheet, rowNum: null, columnName: h, before: h, after: target, fixType: "column_mapping", level: "applied", message: `Column "${h}" mapped to ${target}` });
    }
    const missingCols = REQUIRED_COLUMNS[d].filter((c) => !srcFor[c]);
    if (missingCols.length) {
      err(sheet, null, missingCols.join(", "), `Required column(s) missing for ${d}: ${missingCols.join(", ")}`);
      continue;
    }

    const out: { rowNum: number; v: Record<string, string> }[] = [];
    rows.forEach((r, i) => {
      const rowNum = i + 2; // header is row 1
      if (REQUIRED_COLUMNS[d].every((c) => trimWhitespace(r[srcFor[c]] ?? "") === "")) return; // blank row
      const v: Record<string, string> = {};
      let rowOk = true;
      for (const c of REQUIRED_COLUMNS[d]) {
        const before = String(r[srcFor[c]] ?? "");
        const t = COL_TYPES[d][c];
        const after = coerce(before, t);
        if (after === null || (after === "" && t.kind !== "bool")) {
          err(sheet, rowNum, c, before.trim() === "" ? `${c} is empty` : `${c} value "${before}" could not be parsed`);
          rowOk = false;
          continue;
        }
        if (after !== before) {
          const onlyWs = trimWhitespace(before) === after && t.kind === "str";
          const fixType: string = onlyWs || before.trim() === after ? "trim_whitespace" : FIX_FOR_KIND[t.kind] ?? "normalize_value";
          const proposal = proposedFor(sheet, srcFor[c], fixType);
          log.push({
            sheet,
            rowNum,
            columnName: c,
            before,
            after,
            fixType,
            level: "applied",
            message: proposal ? `Proposed by Gemini: ${proposal.description}` : "Deterministic type normalisation",
            skuId: c === "SKU_ID" ? after : null,
          });
        }
        v[c] = after;
      }
      if (rowOk) out.push({ rowNum, v });
    });
    mapped[d] = out;
  }

  if (errors.length) return { clean: null, log, errors, warnings };

  // 3. Typed rows + cross-dataset validation
  const sheetName = (d: DatasetName) => sheetFor[d]!;

  const distributors: DistributorRow[] = mapped.distributor_master!.map(({ v }) => ({
    distributorId: v.Distributor_ID,
    name: v.Distributor_Name,
    region: v.Region,
    status: v.Status as DistributorRow["status"],
  }));
  const distIds = new Set(distributors.map((d) => d.distributorId));

  const skus: SkuRow[] = [];
  const seenSku = new Map<string, number>();
  for (const { rowNum, v } of mapped.sku_master!) {
    const qty = Number(v.Standard_Reorder_Qty);
    if (seenSku.has(v.SKU_ID)) err(sheetName("sku_master"), rowNum, "SKU_ID", `Duplicate SKU_ID ${v.SKU_ID} (also on row ${seenSku.get(v.SKU_ID)})`);
    seenSku.set(v.SKU_ID, rowNum);
    if (!(qty > 0)) err(sheetName("sku_master"), rowNum, "Standard_Reorder_Qty", `Standard_Reorder_Qty must be > 0 (got ${qty})`);
    if (!distIds.has(v.Distributor_ID)) err(sheetName("sku_master"), rowNum, "Distributor_ID", `Distributor ${v.Distributor_ID} not found in distributor_master`);
    skus.push({
      skuId: v.SKU_ID,
      name: v.SKU_Name,
      category: v.Category,
      perishability: v.Perishability as SkuRow["perishability"],
      standardReorderQty: qty,
      uom: v.Unit_of_Measure,
      distributorId: v.Distributor_ID,
    });
  }
  const skuIds = new Set(skus.map((s) => s.skuId));

  const salesMap = new Map<string, SalesRow>();
  for (const { rowNum, v } of mapped.weekly_sales!) {
    const units = Number(v.Units_Sold);
    if (!skuIds.has(v.SKU_ID)) err(sheetName("weekly_sales"), rowNum, "SKU_ID", `SKU ${v.SKU_ID} is not in sku_master`);
    if (!Number.isInteger(units) || units < 0) err(sheetName("weekly_sales"), rowNum, "Units_Sold", `Units_Sold must be an integer ≥ 0 (got ${v.Units_Sold})`);
    const k = `${v.SKU_ID}|${v.Week}`;
    if (salesMap.has(k)) warn(sheetName("weekly_sales"), rowNum, "Week", `Duplicate row for ${v.SKU_ID} ${v.Week}; the later row is used`);
    salesMap.set(k, { skuId: v.SKU_ID, week: v.Week, unitsSold: units });
  }
  const weeklySales = [...salesMap.values()];

  const inventory: InventoryRow[] = [];
  for (const { rowNum, v } of mapped.current_inventory!) {
    const units = Number(v.Units_On_Hand);
    if (!skuIds.has(v.SKU_ID)) err(sheetName("current_inventory"), rowNum, "SKU_ID", `SKU ${v.SKU_ID} is not in sku_master`);
    if (!Number.isInteger(units) || units < 0) err(sheetName("current_inventory"), rowNum, "Units_On_Hand", `Units_On_Hand must be an integer ≥ 0 (got ${v.Units_On_Hand})`);
    const ageDays = (Date.parse(runDate) - Date.parse(v.As_Of_Date)) / 86400000;
    if (ageDays > 7) warn(sheetName("current_inventory"), rowNum, "As_Of_Date", `Inventory for ${v.SKU_ID} is ${Math.round(ageDays)} days old (As_Of_Date ${v.As_Of_Date})`);
    inventory.push({ skuId: v.SKU_ID, location: v.Location, unitsOnHand: units, asOfDate: v.As_Of_Date });
  }

  const calendar: CalendarRow[] = mapped.calendar!.map(({ v }) => ({
    year: Number(v.Year),
    month: Number(v.Month),
    yearMonth: v.Year_Month,
    isFestival: v.Is_Festival_Month === "TRUE",
  }));
  const runMonth = runDate.slice(0, 7);
  if (!calendar.some((c) => c.yearMonth === runMonth)) err(sheetName("calendar"), null, "Year_Month", `Calendar has no row for the run month ${runMonth}`);

  const activeDist = new Set(distributors.filter((d) => d.status === "Active").map((d) => d.distributorId));
  const invSkus = new Set(inventory.map((i) => i.skuId));
  for (const s of skus) {
    if (activeDist.has(s.distributorId) && !invSkus.has(s.skuId)) {
      err(sheetName("current_inventory"), null, "SKU_ID", `Active SKU ${s.skuId} (${s.name}) has no inventory row`);
    }
  }

  // Weekly series: history length + gaps (missing weeks are logged, never invented).
  const anchor = weeklySales.reduce<string | null>((m, s) => (m === null || s.week > m ? s.week : m), null);
  const minHistory = 12;
  for (const s of skus) {
    const weeks = weeklySales.filter((r) => r.skuId === s.skuId).map((r) => r.week).sort();
    if (weeks.length < minHistory) {
      warn(sheetName("weekly_sales"), null, "Week", `${s.skuId} has only ${weeks.length} weeks of sales (< ${minHistory}) → Needs judgment`);
    }
    if (!weeks.length || !anchor) continue;
    const have = new Set(weeks);
    let w = weeks[0];
    const missing: string[] = [];
    for (let guard = 0; w <= anchor && guard < 520; guard++, w = addWeeks(w, 1)) if (!have.has(w)) missing.push(w);
    for (const m of missing) {
      log.push({ sheet: sheetName("weekly_sales"), rowNum: null, columnName: "Week", before: null, after: null, fixType: "missing_week", level: "missing", message: `${s.skuId} has no sales row for ${m}; excluded from averages (not imputed)`, skuId: s.skuId });
    }
    if (missing.length) warn(sheetName("weekly_sales"), null, "Week", `${s.skuId} has ${missing.length} missing week(s): ${missing.join(", ")}`);
  }

  for (const o of plan.outlierNotes) {
    log.push({ sheet: sheetName("weekly_sales"), rowNum: null, columnName: "Units_Sold", before: String(o.value), after: null, fixType: "outlier", level: "warning", message: `Possible outlier ${o.sku_id} ${o.week}: ${o.note} (value unchanged)`, skuId: o.sku_id });
  }

  if (errors.length) return { clean: null, log, errors, warnings };
  return { clean: { skus, distributors, weeklySales, inventory, calendar }, log, errors, warnings };
}
