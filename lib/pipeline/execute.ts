// The run pipeline (§5): cleaning → validation → write clean data → rules → AI → ready_for_review.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { CleanDatasets, RawSheets } from "@/lib/data/types";
import { prepareData, type LogEntry } from "@/lib/data/prepare";
import { proposeCleaningPlan } from "@/lib/ai/clean";
import { createGeminiClient, type AiCallLogger } from "@/lib/ai/gemini";
import type { PastOverride } from "@/lib/ai/forecast";
import { loadConfig } from "@/lib/configStore";
import { analyse } from "./analyse";

type Db = ReturnType<typeof getDb>;

async function setStatus(db: Db, runId: number, status: string, extra: Partial<typeof schema.runs.$inferInsert> = {}) {
  await db.update(schema.runs).set({ status, ...extra }).where(eq(schema.runs.id, runId));
}

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function writeLog(db: Db, runId: number, entries: LogEntry[]) {
  await chunked(entries, 500, (c) =>
    db.insert(schema.cleaningLog).values(
      c.map((e) => ({
        runId,
        sheet: e.sheet,
        rowNum: e.rowNum,
        columnName: e.columnName,
        before: e.before,
        after: e.after,
        fixType: e.fixType,
        level: e.level,
        message: e.message,
        skuId: e.skuId ?? null,
      })),
    ),
  );
}

async function writeCleanData(db: Db, uploadId: number, clean: CleanDatasets) {
  await chunked(clean.distributors, 500, (c) =>
    db
      .insert(schema.distributors)
      .values(c.map((d) => ({ distributorId: d.distributorId, name: d.name, region: d.region, status: d.status })))
      .onConflictDoUpdate({
        target: schema.distributors.distributorId,
        set: { name: sql`excluded.name`, region: sql`excluded.region`, status: sql`excluded.status` },
      }),
  );
  const activeDist = new Set(clean.distributors.filter((d) => d.status === "Active").map((d) => d.distributorId));
  await chunked(clean.skus, 500, (c) =>
    db
      .insert(schema.skus)
      .values(
        c.map((s) => ({
          skuId: s.skuId,
          name: s.name,
          category: s.category,
          perishability: s.perishability,
          standardReorderQty: s.standardReorderQty,
          uom: s.uom,
          distributorId: s.distributorId,
          active: activeDist.has(s.distributorId),
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: schema.skus.skuId,
        set: {
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          perishability: sql`excluded.perishability`,
          standardReorderQty: sql`excluded.standard_reorder_qty`,
          uom: sql`excluded.uom`,
          distributorId: sql`excluded.distributor_id`,
          active: sql`excluded.active`,
          updatedAt: sql`now()`,
        },
      }),
  );
  await chunked(clean.calendar, 500, (c) =>
    db
      .insert(schema.calendar)
      .values(c.map((r) => ({ yearMonth: r.yearMonth, year: r.year, month: r.month, isFestival: r.isFestival })))
      .onConflictDoUpdate({ target: schema.calendar.yearMonth, set: { isFestival: sql`excluded.is_festival` } }),
  );
  await chunked(clean.weeklySales, 1000, (c) =>
    db
      .insert(schema.weeklySales)
      .values(c.map((s) => ({ skuId: s.skuId, isoWeek: s.week, unitsSold: s.unitsSold, uploadId })))
      .onConflictDoUpdate({
        target: [schema.weeklySales.skuId, schema.weeklySales.isoWeek],
        set: { unitsSold: sql`excluded.units_sold`, uploadId: sql`excluded.upload_id` },
      }),
  );
  await chunked(clean.inventory, 1000, (c) =>
    db.insert(schema.inventorySnapshots).values(
      c.map((i) => ({ skuId: i.skuId, location: i.location, unitsOnHand: i.unitsOnHand, asOfDate: i.asOfDate, uploadId })),
    ),
  );
}

/** Feedback loop: last 5 overrides + override rate per SKU, fed into the forecast prompt. */
export async function loadOverrideHistory(db: Db, skuIds: string[]) {
  const overridesBySku = new Map<string, PastOverride[]>();
  const overrideRateBySku = new Map<string, number>();
  if (!skuIds.length) return { overridesBySku, overrideRateBySku };
  const rows = await db
    .select()
    .from(schema.overrides)
    .where(inArray(schema.overrides.skuId, skuIds))
    .orderBy(desc(schema.overrides.createdAt));
  for (const o of rows) {
    const list = overridesBySku.get(o.skuId) ?? [];
    if (list.length < 5) {
      list.push({
        date: o.createdAt.toISOString().slice(0, 10),
        original_action: o.originalAction,
        original_qty: o.originalQty,
        new_action: o.newAction,
        new_qty: o.newQty,
        reason_code: o.reasonCode,
        note: o.note,
      });
      overridesBySku.set(o.skuId, list);
    }
  }
  const rates = await db
    .select({
      skuId: schema.recommendations.skuId,
      decided: sql<number>`count(*) filter (where ${schema.recommendations.status} <> 'pending')`,
      overridden: sql<number>`count(*) filter (where ${schema.recommendations.status} = 'overridden')`,
    })
    .from(schema.recommendations)
    .where(inArray(schema.recommendations.skuId, skuIds))
    .groupBy(schema.recommendations.skuId);
  for (const r of rates) if (Number(r.decided) > 0) overrideRateBySku.set(r.skuId, Number(r.overridden) / Number(r.decided));
  return { overridesBySku, overrideRateBySku };
}

export async function executeRun(runId: number): Promise<void> {
  const db = getDb();
  // Claim the run atomically so a double-click can't execute it twice.
  const claimed = await db
    .update(schema.runs)
    .set({ status: "cleaning" })
    .where(and(eq(schema.runs.id, runId), eq(schema.runs.status, "parsing")))
    .returning();
  if (!claimed.length) return;
  const run = claimed[0];

  try {
    const [upload] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, run.uploadId));
    const raw = (upload.rawRows ?? {}) as RawSheets;
    const client = createGeminiClient();
    const logger: AiCallLogger = async (rec) => {
      await db.insert(schema.aiCalls).values(rec);
    };

    // Gemini proposes; code applies + validates.
    const { plan, aiError } = await proposeCleaningPlan(raw, { client, runId, logger });
    const prep = prepareData(raw, plan, run.runDate);
    const log = [...prep.log];
    if (aiError) log.unshift({ sheet: null, rowNum: null, columnName: null, before: null, after: null, fixType: "ai", level: "warning", message: `Gemini cleaning unavailable — used deterministic header matching (${aiError.slice(0, 200)})` });
    for (const e of prep.errors) log.push({ sheet: e.sheet, rowNum: e.row, columnName: e.column, before: null, after: null, fixType: "validation", level: "error", message: e.message });
    for (const w of prep.warnings) log.push({ sheet: w.sheet, rowNum: w.row, columnName: w.column, before: null, after: null, fixType: "validation", level: "warning", message: w.message });
    await writeLog(db, runId, log);

    const cleaningSummary = {
      fixesApplied: prep.log.filter((l) => l.level === "applied").length,
      warnings: prep.warnings.length + (aiError ? 1 : 0),
      missingWeeks: prep.log.filter((l) => l.level === "missing").length,
      cleaningSource: plan.source,
    };

    if (!prep.clean) {
      await setStatus(db, runId, "failed_validation", {
        finishedAt: new Date(),
        error: { errors: prep.errors, warnings: prep.warnings },
        summary: cleaningSummary,
      });
      await db.update(schema.uploads).set({ status: "failed_validation" }).where(eq(schema.uploads.id, run.uploadId));
      return;
    }

    await writeCleanData(db, run.uploadId, prep.clean);
    await db.update(schema.uploads).set({ status: "clean" }).where(eq(schema.uploads.id, run.uploadId));

    await setStatus(db, runId, "rules", { summary: cleaningSummary });
    const config = await loadConfig();
    await db.update(schema.runs).set({ configSnapshot: config }).where(eq(schema.runs.id, runId));

    // Merge sales history already in Neon (earlier uploads) for these SKUs.
    const skuIds = prep.clean.skus.map((s) => s.skuId);
    const history = await db
      .select({ skuId: schema.weeklySales.skuId, week: schema.weeklySales.isoWeek, unitsSold: schema.weeklySales.unitsSold })
      .from(schema.weeklySales)
      .where(inArray(schema.weeklySales.skuId, skuIds));
    const clean: CleanDatasets = { ...prep.clean, weeklySales: history };

    const { overridesBySku, overrideRateBySku } = await loadOverrideHistory(db, skuIds);
    await setStatus(db, runId, "ai");
    const { recs, aiErrors } = await analyse({
      clean,
      config,
      runDate: run.runDate,
      outlierNotes: plan.outlierNotes,
      overridesBySku,
      overrideRateBySku,
      client,
      runId,
      logger,
    });

    await chunked(recs, 200, (c) =>
      db.insert(schema.recommendations).values(
        c.map((r) => ({
          runId,
          skuId: r.rule.sku_id,
          avg4: r.rule.avg4,
          avg12: r.rule.avg12,
          isFestival: r.rule.is_festival,
          adjustedWeekly: r.rule.adjusted_weekly,
          unitsOnHand: r.rule.units_on_hand,
          weeksOfCover: Number.isFinite(r.rule.weeks_of_cover) ? r.rule.weeks_of_cover : null,
          flags: r.rule.flags,
          action: r.rule.action,
          recommendedQty: r.rule.recommended_qty, // from rules ONLY
          ruleTrace: r.rule.rule_trace,
          needsJudgmentByRule: r.rule.needs_judgment_by_rule,
          forecastWeekly: r.forecastWeekly,
          aiReason: r.aiReason,
          aiTag: r.aiTag,
          aiJudgmentReason: r.aiJudgmentReason,
          aiConfidence: r.aiConfidence,
          aiUnavailable: r.aiUnavailable,
          finalTag: r.finalTag,
          judgmentTriggers: r.judgmentTriggers,
          status: "pending",
        })),
      ),
    );

    await setStatus(db, runId, "ready_for_review", {
      finishedAt: new Date(),
      summary: {
        ...cleaningSummary,
        skus: recs.length,
        flagged: recs.filter((r) => r.rule.flags.length).length,
        needsJudgment: recs.filter((r) => r.finalTag === "NEEDS_JUDGMENT").length,
        aiErrors,
      },
    });
  } catch (e) {
    await setStatus(db, runId, "failed", {
      finishedAt: new Date(),
      error: { message: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
