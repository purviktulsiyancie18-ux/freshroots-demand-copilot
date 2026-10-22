// Builds /data/messy/freshroots_sap_export_messy.xlsx from the clean sample: same numbers,
// SAP-style headers and formats. After cleaning it must produce exactly the §7.3 results.
// Usage: npx tsx scripts/make-messy.ts

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const SAMPLE = path.join(process.cwd(), "data", "sample");
const OUT = path.join(process.cwd(), "data", "messy", "freshroots_sap_export_messy.xlsx");

const read = (f: string) =>
  Papa.parse<Record<string, string>>(fs.readFileSync(path.join(SAMPLE, f), "utf8"), { header: true, skipEmptyLines: true }).data;

const num = (id: string) => Number(id.replace(/\D/g, ""));
const skuVariants = [(n: number) => `sku ${n}`, (n: number) => `SKU-${n}`, (n: number) => `Sku_${String(n).padStart(2, "0")}`, (n: number) => `SKU${String(n).padStart(3, "0")}`];
const messySku = (id: string, i: number) => skuVariants[i % skuVariants.length](num(id));
const weekVariants = [
  (y: string, w: string) => `W${w}-${y}`,
  (y: string, w: string) => `${y}-${w}`,
  (y: string, w: string) => `W${w} ${y}`,
  (y: string, w: string) => `${y}-W${w}`,
];
const messyWeek = (wk: string, i: number) => {
  const [y, w] = wk.split("-W");
  return weekVariants[i % weekVariants.length](y, w);
};

const skus = read("sku_master.csv").map((r, i) => ({
  "Item Code": messySku(r.SKU_ID, i),
  "Item Description": `  ${r.SKU_Name} `,
  Category: r.Category,
  Perishable: i % 2 ? r.Perishability.toUpperCase() : r.Perishability.toLowerCase(),
  "Reorder Qty": r.Standard_Reorder_Qty,
  UoM: r.Unit_of_Measure,
  Distributor: `dist ${num(r.Distributor_ID)}`,
}));
const dists = read("distributor_master.csv").map((r) => ({
  "Dist Code": `DIST-${num(r.Distributor_ID)}`,
  "Distributor Name": r.Distributor_Name,
  Region: r.Region,
  Status: r.Status.toUpperCase(),
}));
const sales = read("weekly_sales.csv").map((r, i) => ({ "Item Code": messySku(r.SKU_ID, i), Wk: messyWeek(r.Week, i), "Qty Sold": r.Units_Sold }));
const stock = read("current_inventory.csv").map((r, i) => {
  const [y, m, d] = r.As_Of_Date.split("-");
  return {
    "Item Code": messySku(r.SKU_ID, i + 1),
    Warehouse: r.Location,
    "Stock On Hand": Number(r.Units_On_Hand).toLocaleString("en-US"),
    "Stock Date": `${d}/${m}/${y}`,
  };
});
const cal = read("calendar.csv").map((r) => ({
  Year: r.Year,
  Month: r.Month,
  Period: `${Number(r.Month)}/${r.Year}`,
  Festival: r.Is_Festival_Month === "TRUE" ? "Yes" : "No",
}));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skus), "Item Master");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dists), "Distributors");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sales), "Sales Wk");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stock), "Stock");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cal), "Festival Cal");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("wrote", OUT);
