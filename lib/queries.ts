// Data access shared by API routes and server components.

import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { ACTIONS } from "@/lib/rules/engine";
import { CONFIG_META, validateConfig, type RuleConfig, type RuleConfigKey } from "@/lib/rules/config";
import { loadConfig } from "@/lib/configStore";
import { trailingWeeks } from "@/lib/data/isoWeek";

const { recommendations: rec, skus, distributors, runs, overrides, cleaningLog } = schema;

export const REASON_CODES = [
  "PROMO_OR_SCHEME",
  "NEW_LAUNCH",
  "DISTRIBUTOR_ISSUE",
  "SUPPLY_CONSTRAINT",
  "DATA_ERROR",
  "MARKET_EVENT",
  "SEASONALITY_DIFFERENT",
  "OTHER",
] as const;

export type Tab = "needs_judgment" | "standard" | "no_action" | "all";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- Runs ----------

export async function getRun(runId: number) {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) return null;
  const counts = await runCounts(runId);
  return { ...run, counts };
}

export async function runCounts(runId: number) {
  const db = getDb();
  const [c] = await db
    .select({
      total: sql<number>`count(*)::int`,
      needsJudgment: sql<number>`(count(*) filter (where ${rec.finalTag} = 'NEEDS_JUDGMENT'))::int`,
      standard: sql<number>`(count(*) filter (where ${rec.finalTag} = 'STANDARD' and ${rec.action} <> 'NO_ACTION'))::int`,
      noAction: sql<number>`(count(*) filter (where ${rec.finalTag} = 'STANDARD' and ${rec.action} = 'NO_ACTION'))::int`,
      flagged: sql<number>`(count(*) filter (where cardinality(${rec.flags}) > 0))::int`,
      approved: sql<number>`(count(*) filter (where ${rec.status} = 'approved'))::int`,
      overridden: sql<number>`(count(*) filter (where ${rec.status} = 'overridden'))::int`,
      pendingReview: sql<number>`(count(*) filter (where ${rec.status} = 'pending' and (cardinality(${rec.flags}) > 0 or ${rec.finalTag} = 'NEEDS_JUDGMENT')))::int`,
      exportable: sql<number>`(count(*) filter (where ${rec.status} <> 'pending' and ${rec.finalAction} <> 'NO_ACTION'))::int`,
    })
    .from(rec)
    .where(eq(rec.runId, runId));
  return c;
}

export async function listRuns(limit = 20) {
  const db = getDb();
  return db
    .select({ id: runs.id, runDate: runs.runDate, status: runs.status, startedAt: runs.startedAt, summary: runs.summary })
    .from(runs)
    .orderBy(desc(runs.id))
    .limit(limit);
}

export async function getCleaningLog(runId: number) {
  return getDb().select().from(cleaningLog).where(eq(cleaningLog.runId, runId)).orderBy(asc(cleaningLog.id));
}

// ---------- Review queue ----------

function tabFilter(tab: Tab) {
  switch (tab) {
    case "needs_judgment":
      return eq(rec.finalTag, "NEEDS_JUDGMENT");
    case "standard":
      return and(eq(rec.finalTag, "STANDARD"), ne(rec.action, "NO_ACTION"));
    case "no_action":
      return and(eq(rec.finalTag, "STANDARD"), eq(rec.action, "NO_ACTION"));
    default:
      return undefined;
  }
}

export async function getRecommendations(runId: number, tab: Tab = "all") {
  const db = getDb();
  const f = tabFilter(tab);
  return db
    .select({
      id: rec.id,
      skuId: rec.skuId,
      name: skus.name,
      perishability: skus.perishability,
      category: skus.category,
      standardReorderQty: skus.standardReorderQty,
      avg4: rec.avg4,
      avg12: rec.avg12,
      isFestival: rec.isFestival,
      adjustedWeekly: rec.adjustedWeekly,
      unitsOnHand: rec.unitsOnHand,
      weeksOfCover: rec.weeksOfCover,
      flags: rec.flags,
      action: rec.action,
      recommendedQty: rec.recommendedQty,
      ruleTrace: rec.ruleTrace,
      needsJudgmentByRule: rec.needsJudgmentByRule,
      forecastWeekly: rec.forecastWeekly,
      aiReason: rec.aiReason,
      aiTag: rec.aiTag,
      aiJudgmentReason: rec.aiJudgmentReason,
      aiConfidence: rec.aiConfidence,
      aiUnavailable: rec.aiUnavailable,
      finalTag: rec.finalTag,
      judgmentTriggers: rec.judgmentTriggers,
      status: rec.status,
      finalAction: rec.finalAction,
      finalQty: rec.finalQty,
      decidedBy: rec.decidedBy,
      decidedAt: rec.decidedAt,
    })
    .from(rec)
    .innerJoin(skus, eq(skus.skuId, rec.skuId))
    .where(f ? and(eq(rec.runId, runId), f) : eq(rec.runId, runId))
    .orderBy(sql`case ${rec.finalTag} when 'NEEDS_JUDGMENT' then 0 else 1 end`, sql`cardinality(${rec.flags}) desc`, asc(rec.skuId));
}
export type RecRow = Awaited<ReturnType<typeof getRecommendations>>[number];

/** Per-SKU context for the expanded row: 16-week sales, cleaning notes, last 5 overrides. */
export async function getSkuContext(runId: number, skuIds: string[]) {
  const db = getDb();
  const empty = { sales: {}, notes: {}, history: {} } as {
    sales: Record<string, { week: string; units: number }[]>;
    notes: Record<string, string[]>;
    history: Record<string, (typeof overrides.$inferSelect)[]>;
  };
  if (!skuIds.length) return empty;
  const salesRows = await db
    .select({ skuId: schema.weeklySales.skuId, week: schema.weeklySales.isoWeek, units: schema.weeklySales.unitsSold })
    .from(schema.weeklySales)
    .where(inArray(schema.weeklySales.skuId, skuIds));
  const anchor = salesRows.reduce<string | null>((m, s) => (m === null || s.week > m ? s.week : m), null);
  const weeks = new Set(anchor ? trailingWeeks(anchor, 16) : []);
  for (const s of salesRows.filter((r) => weeks.has(r.week)).sort((a, b) => a.week.localeCompare(b.week))) {
    (empty.sales[s.skuId] ??= []).push({ week: s.week, units: s.units });
  }
  const notes = await db
    .select({ skuId: cleaningLog.skuId, message: cleaningLog.message, level: cleaningLog.level })
    .from(cleaningLog)
    .where(and(eq(cleaningLog.runId, runId), inArray(cleaningLog.skuId, skuIds), ne(cleaningLog.level, "applied")));
  for (const n of notes) if (n.skuId) (empty.notes[n.skuId] ??= []).push(n.message ?? "");
  const hist = await db.select().from(overrides).where(inArray(overrides.skuId, skuIds)).orderBy(desc(overrides.createdAt));
  for (const h of hist) {
    const list = (empty.history[h.skuId] ??= []);
    if (list.length < 5) list.push(h);
  }
  return empty;
}

// ---------- Decisions ----------

async function maybeCompleteRun(runId: number) {
  const c = await runCounts(runId);
  if (c.pendingReview === 0) {
    await getDb()
      .update(runs)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.status, "ready_for_review")));
  }
}

async function loadPending(recId: number) {
  const db = getDb();
  const [r] = await db.select().from(rec).where(eq(rec.id, recId));
  if (!r) throw new HttpError(404, "Recommendation not found");
  const [run] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, r.runId));
  if (!run || !["ready_for_review", "completed"].includes(run.status)) throw new HttpError(409, "Run is not ready for review");
  if (r.status !== "pending") throw new HttpError(409, `Already ${r.status}`);
  return r;
}

export async function approveRecommendation(recId: number, user: string) {
  const r = await loadPending(recId);
  await getDb()
    .update(rec)
    .set({ status: "approved", finalAction: r.action, finalQty: r.recommendedQty, decidedBy: user, decidedAt: new Date() })
    .where(and(eq(rec.id, recId), eq(rec.status, "pending")));
  await maybeCompleteRun(r.runId);
}

export const OverrideBody = z
  .object({
    newAction: z.enum(ACTIONS as [string, ...string[]]),
    newQty: z.number().int().min(0).max(10_000_000),
    reasonCode: z.enum(REASON_CODES),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((b) => b.reasonCode !== "OTHER" || (b.note && b.note.length > 0), { message: "A note is required when the reason is OTHER", path: ["note"] });

export async function overrideRecommendation(recId: number, body: z.infer<typeof OverrideBody>, user: string) {
  const r = await loadPending(recId);
  const db = getDb();
  await db.insert(overrides).values({
    recommendationId: r.id,
    skuId: r.skuId,
    runId: r.runId,
    originalAction: r.action,
    originalQty: r.recommendedQty,
    newAction: body.newAction,
    newQty: body.newQty,
    reasonCode: body.reasonCode,
    note: body.note || null,
    createdBy: user,
  });
  await db
    .update(rec)
    .set({ status: "overridden", finalAction: body.newAction, finalQty: body.newQty, decidedBy: user, decidedAt: new Date() })
    .where(eq(rec.id, recId));
  await maybeCompleteRun(r.runId);
}

export async function approveAllStandard(runId: number, user: string) {
  const db = getDb();
  const [run] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId));
  if (!run || run.status !== "ready_for_review") throw new HttpError(409, "Run is not ready for review");
  const res = await db
    .update(rec)
    .set({ status: "approved", finalAction: sql`${rec.action}`, finalQty: sql`${rec.recommendedQty}`, decidedBy: user, decidedAt: new Date() })
    .where(and(eq(rec.runId, runId), eq(rec.status, "pending"), eq(rec.finalTag, "STANDARD"), ne(rec.action, "NO_ACTION")))
    .returning({ id: rec.id });
  await maybeCompleteRun(runId);
  return res.length;
}

// ---------- Export ----------

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(runId: number): Promise<{ filename: string; csv: string; rows: number }> {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new HttpError(404, "Run not found");
  const rows = await db
    .select({
      skuId: rec.skuId,
      skuName: skus.name,
      distributorId: skus.distributorId,
      distributorName: distributors.name,
      finalAction: rec.finalAction,
      finalQty: rec.finalQty,
      rulesQty: rec.recommendedQty,
      status: rec.status,
      decidedBy: rec.decidedBy,
      decidedAt: rec.decidedAt,
      reasonCode: overrides.reasonCode,
      note: overrides.note,
    })
    .from(rec)
    .innerJoin(skus, eq(skus.skuId, rec.skuId))
    .innerJoin(distributors, eq(distributors.distributorId, skus.distributorId))
    .leftJoin(overrides, eq(overrides.recommendationId, rec.id))
    .where(and(eq(rec.runId, runId), inArray(rec.status, ["approved", "overridden"]), ne(rec.finalAction, "NO_ACTION")))
    .orderBy(asc(rec.skuId));
  const header = ["SKU_ID", "SKU_Name", "Distributor_ID", "Distributor_Name", "Final_Action", "Final_Qty", "Rules_Qty", "Was_Overridden", "Reason", "Approved_By", "Approved_At"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const overridden = r.status === "overridden";
    lines.push(
      [
        r.skuId,
        r.skuName,
        r.distributorId,
        r.distributorName,
        r.finalAction,
        r.finalQty,
        r.rulesQty,
        overridden ? "TRUE" : "FALSE",
        overridden ? `${r.reasonCode}${r.note ? `: ${r.note}` : ""}` : "",
        r.decidedBy,
        r.decidedAt?.toISOString(),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return { filename: `freshroots_reorder_${run.runDate}.csv`, csv: lines.join("\n") + "\n", rows: rows.length };
}

// ---------- Config ----------

export async function getConfigRows() {
  const db = getDb();
  const cfg = await loadConfig();
  const rows = await db.select().from(schema.ruleConfig);
  const meta = new Map(rows.map((r) => [r.key, r]));
  const log = await db.select().from(schema.ruleConfigLog).orderBy(desc(schema.ruleConfigLog.changedAt)).limit(20);
  return {
    config: cfg,
    rows: (Object.keys(CONFIG_META) as RuleConfigKey[]).map((k) => ({
      key: k,
      value: cfg[k],
      ...CONFIG_META[k],
      updatedBy: meta.get(k)?.updatedBy ?? null,
      updatedAt: meta.get(k)?.updatedAt ?? null,
    })),
    log,
  };
}

export async function updateConfig(values: Partial<RuleConfig>, user: string) {
  const db = getDb();
  const current = await loadConfig();
  const next = { ...current, ...values } as RuleConfig;
  const errs = validateConfig(next);
  if (errs.length) throw new HttpError(400, errs.join("; "));
  const changed = (Object.keys(values) as RuleConfigKey[]).filter((k) => k in CONFIG_META && Number(values[k]) !== current[k]);
  for (const k of changed) {
    await db
      .insert(schema.ruleConfig)
      .values({ key: k, value: String(next[k]), updatedBy: user, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.ruleConfig.key, set: { value: String(next[k]), updatedBy: user, updatedAt: new Date() } });
    await db.insert(schema.ruleConfigLog).values({ key: k, oldValue: String(current[k]), newValue: String(next[k]), changedBy: user });
  }
  return { changed };
}

// ---------- Metrics (§10.4) ----------

export async function getMetrics() {
  const db = getDb();
  const since28 = new Date(Date.now() - 28 * 86400000);
  const [ov] = await db
    .select({
      decided: sql<number>`count(*)::int`,
      overridden: sql<number>`(count(*) filter (where ${rec.status} = 'overridden'))::int`,
    })
    .from(rec)
    .where(and(ne(rec.status, "pending"), sql`cardinality(${rec.flags}) > 0`, gte(rec.decidedAt, since28)));
  const overrideRate = ov.decided ? ov.overridden / ov.decided : null;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let slots = 0;
  for (let d = new Date(monthStart); d <= now; d.setUTCDate(d.getUTCDate() + 1)) if ([1, 4].includes(d.getUTCDay())) slots++;
  const [onTime] = await db
    .select({ n: sql<number>`count(distinct ${runs.runDate})::int` })
    .from(runs)
    .where(
      and(
        eq(runs.status, "completed"),
        gte(runs.runDate, monthStart.toISOString().slice(0, 10)),
        sql`extract(isodow from ${runs.runDate}) in (1, 4)`,
      ),
    );

  const [median] = await db
    .select({
      hours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${runs.completedAt} - ${runs.finishedAt})) / 3600)`,
      n: sql<number>`count(*)::int`,
    })
    .from(runs)
    .where(and(eq(runs.status, "completed"), gte(runs.completedAt, new Date(Date.now() - 30 * 86400000))));

  const flagTrend = await db
    .select({
      runId: runs.id,
      runDate: runs.runDate,
      stockout: sql<number>`(count(*) filter (where 'STOCKOUT_RISK' = any(${rec.flags})))::int`,
      overstock: sql<number>`(count(*) filter (where 'OVERSTOCK_RISK' = any(${rec.flags})))::int`,
      highDemand: sql<number>`(count(*) filter (where 'HIGH_DEMAND' = any(${rec.flags})))::int`,
    })
    .from(runs)
    .innerJoin(rec, eq(rec.runId, runs.id))
    .groupBy(runs.id, runs.runDate)
    .orderBy(desc(runs.id))
    .limit(10);

  const reasons = await db
    .select({ reasonCode: overrides.reasonCode, n: sql<number>`count(*)::int` })
    .from(overrides)
    .where(gte(overrides.createdAt, new Date(Date.now() - 90 * 86400000)))
    .groupBy(overrides.reasonCode)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const [latest] = await db.select().from(runs).orderBy(desc(runs.id)).limit(1);
  const latestCounts = latest ? await runCounts(latest.id) : null;

  return {
    overrideRate,
    overrideDecided: ov.decided,
    overrideCount: ov.overridden,
    runsOnTime: onTime.n,
    scheduledSlots: slots,
    medianReviewHours: median.hours === null ? null : Number(median.hours),
    completedRuns30d: median.n,
    flagTrend: flagTrend.reverse(),
    reasons,
    latest: latest ? { ...latest, counts: latestCounts } : null,
  };
}
