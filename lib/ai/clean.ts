// Gemini — data cleaning (§8.1). Gemini only PROPOSES a mapping and fixes; lib/data/prepare.ts applies them.

import { z } from "zod";
import { type RawSheets, DATASETS, REQUIRED_COLUMNS } from "@/lib/data/types";
import type { CleaningPlan } from "@/lib/data/prepare";
import { fallbackPlan, mergePlans } from "@/lib/data/fallbackPlan";
import { normalizeId, normalizeWeek } from "@/lib/data/normalize";
import { type AiCallLogger, type GeminiClient, callGeminiJson } from "./gemini";
import { PROMPT_CLEAN_V2, PROMPT_CLEAN_VERSION } from "./prompts";

const SAMPLE_ROWS = 30;

const FIX_TYPES = ["normalize_sku_id", "normalize_week_format", "trim_whitespace", "parse_number", "parse_boolean", "other"] as const;

// Gemini's responseSchema can't express dynamic object keys, so mappings come back as arrays.
// Short-field length caps + maxOutputTokens stop the model looping on messy values (seen in testing: a 30K-char
// sku_id). Gemini rejects this schema if maxItems is added, so list sizes are limited by the prompt instead.
// example_before/after (PRD §8.1) are not requested: Gemini looped inside them ~1 in 4 calls on messy SKU ids,
// and the cleaning log already records the real before → after for every changed cell.
const STR = (maxLength: number) => ({ type: "STRING", maxLength: String(maxLength) });
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sheet_mapping: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { uploaded_sheet: STR(100), target: { type: "STRING", enum: [...DATASETS] } },
        required: ["uploaded_sheet", "target"],
      },
    },
    column_mapping: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { sheet: STR(100), source_column: STR(100), target_column: STR(40) },
        required: ["sheet", "source_column", "target_column"],
      },
    },
    proposed_fixes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: [...FIX_TYPES] },
          sheet: STR(100),
          column: STR(100),
          description: STR(300),
        },
        required: ["type", "sheet", "column", "description"],
      },
    },
    outlier_notes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { sku_id: STR(12), week: STR(10), value: { type: "NUMBER" }, note: STR(200) },
        required: ["sku_id", "week", "value", "note"],
      },
    },
  },
  required: ["sheet_mapping", "column_mapping", "proposed_fixes", "outlier_notes"],
};

const ResponseZ = z.object({
  sheet_mapping: z.array(z.object({ uploaded_sheet: z.string(), target: z.string() })),
  column_mapping: z.array(z.object({ sheet: z.string(), source_column: z.string(), target_column: z.string() })),
  proposed_fixes: z.array(
    z.object({
      type: z.string(),
      sheet: z.string(),
      column: z.string(),
      description: z.string(),
      example_before: z.string().optional(),
      example_after: z.string().optional(),
    }),
  ),
  outlier_notes: z.array(z.object({ sku_id: z.string(), week: z.string(), value: z.number(), note: z.string() })),
});

export function buildCleanPrompt(raw: RawSheets): string {
  const sheets = Object.entries(raw).map(([name, rows]) => ({
    sheet_name: name,
    headers: Array.from(new Set(rows.flatMap((r) => Object.keys(r)))),
    row_count: rows.length,
    sample_rows: rows.slice(0, SAMPLE_ROWS),
  }));
  return JSON.stringify(
    {
      target_schema: REQUIRED_COLUMNS,
      target_formats: {
        SKU_ID: "SKU + 3 digits, e.g. SKU001",
        Distributor_ID: "DIST + 3 digits, e.g. DIST001",
        Week: "ISO week YYYY-Www, e.g. 2026-W42",
        Units_Sold: "integer ≥ 0",
        Units_On_Hand: "integer ≥ 0",
        As_Of_Date: "YYYY-MM-DD",
        Year_Month: "YYYY-MM",
        Is_Festival_Month: "TRUE | FALSE",
        Perishability: "High | Low",
        Status: "Active | Inactive",
      },
      uploaded_sheets: sheets,
    },
    null,
    0,
  );
}

export async function proposeCleaningPlan(
  raw: RawSheets,
  opts: { client: GeminiClient | null; runId: number | null; logger?: AiCallLogger },
): Promise<{ plan: CleaningPlan; aiError: string | null }> {
  const fb = fallbackPlan(raw);
  try {
    const r = await callGeminiJson({
      client: opts.client,
      system: PROMPT_CLEAN_V2,
      user: buildCleanPrompt(raw),
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 4000,
      timeoutMs: 60_000,
      zod: ResponseZ,
      purpose: "clean",
      promptVersion: PROMPT_CLEAN_VERSION,
      runId: opts.runId,
      logger: opts.logger,
    });
    const ai: CleaningPlan = {
      sheetMapping: Object.fromEntries(r.sheet_mapping.map((m) => [m.uploaded_sheet, m.target])),
      columnMapping: r.column_mapping.reduce<Record<string, Record<string, string>>>((acc, m) => {
        (acc[m.sheet] ??= {})[m.source_column] = m.target_column;
        return acc;
      }, {}),
      proposedFixes: r.proposed_fixes,
      // Normalise ids in code so notes attach to the right SKU even if Gemini echoes a messy id.
      outlierNotes: r.outlier_notes.map((o) => ({ ...o, sku_id: normalizeId(o.sku_id, "SKU") ?? o.sku_id, week: normalizeWeek(o.week) ?? o.week })),
      source: "gemini",
    };
    return { plan: mergePlans(ai, fb, raw), aiError: null };
  } catch (e) {
    return { plan: fb, aiError: e instanceof Error ? e.message : String(e) };
  }
}
