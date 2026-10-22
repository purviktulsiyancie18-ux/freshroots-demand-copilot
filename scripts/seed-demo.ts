// Builds a realistic October 2026 history so every dashboard section has data.
// Each Mon/Thu run goes through the real pipeline (cleaning, validation, rules, Gemini) using only the
// sales weeks that existed on that date; stock is worked back from the 19 Oct snapshot by adding back
// later weeks' sales. Raghav's decisions, overrides and PO drafts are then recorded and timestamps set
// to the run dates. The 22 Oct run is left for review.
//
// Usage: npm run db:demo   (deletes ALL existing runs, uploads, decisions and POs first)

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { sampleRaw } from "@/lib/testing/sample";
import { addWeeks, dateToIsoWeek, formatIsoWeek } from "@/lib/data/isoWeek";
import { executeRun } from "@/lib/pipeline/execute";
import { approveAllStandard, approveRecommendation, getRecommendations, overrideRecommendation } from "@/lib/queries";
import { createDraftsForRun, listPurchaseOrders, setPurchaseOrderStatus } from "@/lib/po/store";
import { PLANNER_NAME } from "@/lib/user";

const RUN_DATES = ["2026-10-01", "2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22"];
const SNAPSHOT_WEEK = "2026-W42"; // current_inventory.csv is as of 19 Oct, i.e. after W42

// Minutes Raghav spent reviewing each run (ready → completed).
const REVIEW_MINUTES = [52, 38, 41, 67, 33, 46];

type Override = { sku: string; action: string; qty: (rulesQty: number) => number; reason: string; note: string };
// Tried in order for each run; applied only when that SKU is flagged and pending in the run.
const OVERRIDES: Record<string, Override[]> = {
  "2026-10-01": [{ sku: "SKU006", action: "NO_ACTION", qty: () => 0, reason: "SEASONALITY_DIFFERENT", note: "Quinoa picks up after Diwali; keep the regular cycle" }],
  "2026-10-05": [{ sku: "SKU007", action: "REORDER_NOW", qty: () => 200, reason: "PROMO_OR_SCHEME", note: "NutriFlow Diwali scheme on coconut water" }],
  "2026-10-08": [{ sku: "SKU004", action: "REORDER_NOW", qty: (q) => Math.max(0, q - 50), reason: "SUPPLY_CONSTRAINT", note: "Almond milk supplier capping allocation this week" }],
  "2026-10-12": [
    { sku: "SKU001", action: "REORDER_NOW", qty: (q) => q + 150, reason: "MARKET_EVENT", note: "Pune cricket series promotion" },
    { sku: "SKU007", action: "REORDER_NOW", qty: () => 200, reason: "PROMO_OR_SCHEME", note: "Scheme still running at NutriFlow" },
  ],
  "2026-10-15": [{ sku: "SKU011", action: "REORDER_NOW", qty: (q) => q - 100, reason: "DISTRIBUTOR_ISSUE", note: "Meridian short on cold storage space" }],
  "2026-10-19": [
    { sku: "SKU007", action: "REORDER_NOW", qty: () => 200, reason: "PROMO_OR_SCHEME", note: "Diwali week demand at NutriFlow outlets" },
    { sku: "SKU013", action: "REORDER_NOW", qty: (q) => q + 60, reason: "OTHER", note: "Gift-hamper order from a Goa retailer" },
  ],
};

const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

function rawFor(runDate: string) {
  const raw = sampleRaw();
  const { year, week } = dateToIsoWeek(new Date(runDate + "T00:00:00Z"));
  const anchor = addWeeks(formatIsoWeek(year, week), -1); // last complete week before the run
  const laterSales = new Map<string, number>();
  for (const r of raw.weekly_sales) if (r.Week > anchor && r.Week <= SNAPSHOT_WEEK) laterSales.set(r.SKU_ID, (laterSales.get(r.SKU_ID) ?? 0) + Number(r.Units_Sold));
  const asOf = new Date(ist(runDate, "00:00").getTime() - 3 * 86400000).toISOString().slice(0, 10);
  return {
    ...raw,
    weekly_sales: raw.weekly_sales.filter((r) => r.Week <= anchor),
    current_inventory: raw.current_inventory.map((r) => ({
      ...r,
      Units_On_Hand: String(Number(r.Units_On_Hand) + (laterSales.get(r.SKU_ID) ?? 0)),
      As_Of_Date: asOf,
    })),
  };
}

async function reset() {
  const db = getDb();
  const tables = ["purchase_order_lines", "purchase_orders", "overrides", "recommendations", "cleaning_log", "ai_calls", "runs", "inventory_snapshots", "weekly_sales", "uploads"];
  for (const t of tables) await db.execute(sql.raw(`delete from ${t}`));
  for (const t of tables.filter((t) => t !== "weekly_sales")) await db.execute(sql.raw(`select setval(pg_get_serial_sequence('${t}', 'id'), 1, false)`));
}

async function main() {
  const db = getDb();
  await reset();
  console.log("Cleared existing runs.");

  for (const [i, runDate] of RUN_DATES.entries()) {
    const raw = rawFor(runDate);
    const started = ist(runDate, "09:30");
    const [upload] = await db
      .insert(schema.uploads)
      .values({ uploadedBy: PLANNER_NAME, uploadedAt: started, fileNames: ["calendar.csv", "current_inventory.csv", "distributor_master.csv", "sku_master.csv", "weekly_sales.csv"], rawRows: raw, status: "parsed" })
      .returning({ id: schema.uploads.id });
    const [run] = await db.insert(schema.runs).values({ uploadId: upload.id, runDate, status: "parsing", startedAt: started }).returning({ id: schema.runs.id });
    const t0 = Date.now();
    await executeRun(run.id);
    const pipelineSecs = Math.round((Date.now() - t0) / 1000);
    const finished = addMin(started, 1);
    await db.update(schema.runs).set({ finishedAt: finished }).where(eq(schema.runs.id, run.id));
    await db.update(schema.aiCalls).set({ createdAt: started }).where(eq(schema.aiCalls.runId, run.id));

    const [r] = await db.select().from(schema.runs).where(eq(schema.runs.id, run.id));
    const recs = await getRecommendations(run.id, "all");
    const flagged = recs.filter((x) => x.flags.length);
    console.log(`Run #${run.id} ${runDate}: ${r.status} in ${pipelineSecs}s — ${flagged.length} flagged, ${recs.filter((x) => x.finalTag === "NEEDS_JUDGMENT").length} need judgment`);
    if (r.status !== "ready_for_review" || i === RUN_DATES.length - 1) continue; // leave the latest run for review

    // Raghav's review: judgment calls first, then bulk-approve Standard.
    const done: string[] = [];
    for (const o of OVERRIDES[runDate] ?? []) {
      const target = recs.find((x) => x.skuId === o.sku && x.flags.length && x.status === "pending");
      if (!target) continue;
      await overrideRecommendation(target.id, { newAction: o.action, newQty: o.qty(target.recommendedQty), reasonCode: o.reason as never, note: o.note }, PLANNER_NAME);
      done.push(`${o.sku} (${o.reason})`);
    }
    for (const x of recs.filter((x) => x.finalTag === "NEEDS_JUDGMENT" && x.status === "pending" && x.flags.length && !done.some((d) => d.startsWith(x.skuId)))) {
      await approveRecommendation(x.id, PLANNER_NAME);
    }
    await approveAllStandard(run.id, PLANNER_NAME).catch(() => 0);
    // Any remaining pending judgment rows without flags (e.g. AI-only tags) are approved as no-action.
    for (const x of (await getRecommendations(run.id, "needs_judgment")).filter((x) => x.status === "pending")) await approveRecommendation(x.id, PLANNER_NAME);

    // Spread decision times across the review window; complete the run at the end of it.
    const completed = addMin(finished, REVIEW_MINUTES[i]);
    const decided = (await getRecommendations(run.id, "all")).filter((x) => x.status !== "pending");
    for (const [k, x] of decided.entries()) {
      const at = addMin(finished, Math.round(((k + 1) / decided.length) * REVIEW_MINUTES[i]));
      await db.update(schema.recommendations).set({ decidedAt: at }).where(eq(schema.recommendations.id, x.id));
      await db.update(schema.overrides).set({ createdAt: at }).where(eq(schema.overrides.recommendationId, x.id));
    }
    await db.update(schema.runs).set({ completedAt: completed }).where(eq(schema.runs.id, run.id));

    // PO drafts; older runs have already gone to procurement.
    const created = await createDraftsForRun(run.id, PLANNER_NAME);
    await db.update(schema.purchaseOrders).set({ createdAt: addMin(completed, 4) }).where(inArray(schema.purchaseOrders.id, created.map((c) => c.id)));
    if (i < RUN_DATES.length - 2) {
      for (const p of created) await setPurchaseOrderStatus(p.id, "sent", PLANNER_NAME);
      await db.update(schema.purchaseOrders).set({ statusChangedAt: ist(runDate, "16:15") }).where(inArray(schema.purchaseOrders.id, created.map((c) => c.id)));
    }
    console.log(`   overrides: ${done.join(", ") || "none"} · ${created.length} PO drafts · review ${REVIEW_MINUTES[i]} min`);
  }

  const pos = await listPurchaseOrders();
  console.log(`Done: ${RUN_DATES.length} runs, ${pos.length} POs (${pos.filter((p) => p.status === "sent").length} sent).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
