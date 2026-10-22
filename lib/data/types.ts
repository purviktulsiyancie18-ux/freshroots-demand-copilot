// Canonical (clean) dataset shapes — §6 of the PRD.

export type Perishability = "High" | "Low";

export interface SkuRow {
  skuId: string;
  name: string;
  category: string;
  perishability: Perishability;
  standardReorderQty: number;
  uom: string;
  distributorId: string;
}

export interface DistributorRow {
  distributorId: string;
  name: string;
  region: string;
  status: "Active" | "Inactive";
}

export interface SalesRow {
  skuId: string;
  week: string; // YYYY-Www
  unitsSold: number;
}

export interface InventoryRow {
  skuId: string;
  location: string;
  unitsOnHand: number;
  asOfDate: string; // YYYY-MM-DD
}

export interface CalendarRow {
  year: number;
  month: number;
  yearMonth: string; // YYYY-MM
  isFestival: boolean;
}

export interface CleanDatasets {
  skus: SkuRow[];
  distributors: DistributorRow[];
  weeklySales: SalesRow[];
  inventory: InventoryRow[];
  calendar: CalendarRow[];
}

export const DATASETS = [
  "sku_master",
  "distributor_master",
  "weekly_sales",
  "current_inventory",
  "calendar",
] as const;
export type DatasetName = (typeof DATASETS)[number];

export const REQUIRED_COLUMNS: Record<DatasetName, string[]> = {
  sku_master: [
    "SKU_ID",
    "SKU_Name",
    "Category",
    "Perishability",
    "Standard_Reorder_Qty",
    "Unit_of_Measure",
    "Distributor_ID",
  ],
  distributor_master: ["Distributor_ID", "Distributor_Name", "Region", "Status"],
  weekly_sales: ["SKU_ID", "Week", "Units_Sold"],
  current_inventory: ["SKU_ID", "Location", "Units_On_Hand", "As_Of_Date"],
  calendar: ["Year", "Month", "Year_Month", "Is_Festival_Month"],
};

/** Raw staged rows: every value is a string, keyed by the uploaded header. */
export type RawSheets = Record<string, Record<string, string>[]>;
