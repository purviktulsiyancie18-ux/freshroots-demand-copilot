// Parse uploaded files into raw staging sheets (all values as strings).

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { RawSheets } from "./types";

export interface UploadedFile {
  name: string;
  data: Uint8Array;
}

function cleanHeaderRows(rows: Record<string, unknown>[]): Record<string, string>[] {
  return rows.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = String(k).trim();
      if (!key || key.startsWith("__EMPTY")) continue;
      out[key] = v === null || v === undefined ? "" : String(v);
    }
    return out;
  });
}

export function parseFiles(files: UploadedFile[]): RawSheets {
  const sheets: RawSheets = {};
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".csv")) {
      const text = new TextDecoder("utf-8").decode(f.data).replace(/^﻿/, "");
      const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
      sheets[f.name.replace(/\.csv$/i, "")] = cleanHeaderRows(res.data);
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const wb = XLSX.read(f.data, { type: "array", cellDates: false });
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { raw: false, defval: "" });
        if (rows.length) sheets[name] = cleanHeaderRows(rows);
      }
    } else {
      throw new Error(`Unsupported file type: ${f.name} (upload .xlsx or .csv)`);
    }
  }
  return sheets;
}
