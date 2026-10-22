import fs from "node:fs";
import path from "node:path";
import { parseFiles } from "@/lib/data/parse";
import { fallbackPlan } from "@/lib/data/fallbackPlan";
import { prepareData } from "@/lib/data/prepare";
import type { RawSheets } from "@/lib/data/types";

export const SAMPLE_DIR = path.join(process.cwd(), "data", "sample");
export const MESSY_FILE = path.join(process.cwd(), "data", "messy", "freshroots_sap_export_messy.xlsx");

export function loadRaw(files: string[]): RawSheets {
  return parseFiles(files.map((f) => ({ name: path.basename(f), data: new Uint8Array(fs.readFileSync(f)) })));
}

export function sampleRaw(): RawSheets {
  return loadRaw(fs.readdirSync(SAMPLE_DIR).filter((f) => f.endsWith(".csv")).map((f) => path.join(SAMPLE_DIR, f)));
}

export function sampleClean(runDate = "2026-10-22") {
  const raw = sampleRaw();
  const res = prepareData(raw, fallbackPlan(raw), runDate);
  if (!res.clean) throw new Error("sample failed validation: " + JSON.stringify(res.errors));
  return res.clean;
}
