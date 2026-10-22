// Draft purchase orders in Neon: create from a run's approved reorders, list, read, change status, CSV.

import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { HttpError } from "@/lib/queries";
import { buildDraftPos, isPoLine, PO_ACTIONS, type EligibleLine } from "./build";
import { zohoPreview } from "./zoho";

const { purchaseOrders: po, purchaseOrderLines: pol, recommendations: rec, skus, distributors, runs } = schema;

/** Approved/overridden reorders of a run that are not already on a live (non-cancelled) PO. */
export async function eligibleLines(runId: number): Promise<EligibleLine[]> {
  const db = getDb();
  const rows = await db
    .select({
      recommendationId: rec.id,
      skuId: rec.skuId,
      skuName: skus.name,
      uom: skus.uom,
      distributorId: skus.distributorId,
      finalAction: rec.finalAction,
      finalQty: rec.finalQty,
      status: rec.status,
    })
    .from(rec)
    .innerJoin(skus, eq(skus.skuId, rec.skuId))
    .where(and(eq(rec.runId, runId), inArray(rec.status, ["approved", "overridden"]), inArray(rec.finalAction, [...PO_ACTIONS])));
  const onLivePo = await db
    .select({ recommendationId: pol.recommendationId })
    .from(pol)
    .innerJoin(po, eq(po.id, pol.purchaseOrderId))
    .where(and(eq(po.runId, runId), ne(po.status, "cancelled")));
  const taken = new Set(onLivePo.map((r) => r.recommendationId));
  return rows
    .map((r) => ({
      recommendationId: r.recommendationId,
      skuId: r.skuId,
      skuName: r.skuName,
      uom: r.uom,
      distributorId: r.distributorId,
      finalAction: r.finalAction!,
      finalQty: r.finalQty ?? 0,
      wasOverridden: r.status === "overridden",
    }))
    .filter((l) => isPoLine(l) && !taken.has(l.recommendationId));
}

export async function createDraftsForRun(runId: number, user: string) {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new HttpError(404, "Run not found");
  if (!["ready_for_review", "completed"].includes(run.status)) throw new HttpError(409, "Run is not ready for review");
  const lines = await eligibleLines(runId);
  if (!lines.length) throw new HttpError(409, "No approved reorders without a PO draft. Approve or override reorder SKUs first.");
  const taken = await db.select({ n: po.poNumber }).from(po).where(sql`${po.poNumber} like ${`PO-${run.runDate.replace(/-/g, "")}-%`}`);
  const drafts = buildDraftPos(lines, run.runDate, taken.map((t) => t.n));
  const created: { id: number; poNumber: string }[] = [];
  for (const d of drafts) {
    const [row] = await db
      .insert(po)
      .values({ poNumber: d.poNumber, runId, distributorId: d.distributorId, poDate: run.runDate, createdBy: user, status: "draft" })
      .returning({ id: po.id, poNumber: po.poNumber });
    await db.insert(pol).values(
      d.lines.map((l) => ({
        purchaseOrderId: row.id,
        recommendationId: l.recommendationId,
        skuId: l.skuId,
        skuName: l.skuName,
        quantity: l.finalQty,
        uom: l.uom,
        finalAction: l.finalAction,
        wasOverridden: l.wasOverridden,
      })),
    );
    created.push(row);
  }
  return created;
}

export async function listPurchaseOrders(filter: { runId?: number; status?: string } = {}) {
  const db = getDb();
  const conds = [filter.runId ? eq(po.runId, filter.runId) : undefined, filter.status ? eq(po.status, filter.status) : undefined].filter(Boolean);
  return db
    .select({
      id: po.id,
      poNumber: po.poNumber,
      runId: po.runId,
      runDate: runs.runDate,
      distributorId: po.distributorId,
      distributorName: distributors.name,
      region: distributors.region,
      status: po.status,
      poDate: po.poDate,
      createdBy: po.createdBy,
      createdAt: po.createdAt,
      statusChangedAt: po.statusChangedAt,
      lineCount: sql<number>`(select count(*)::int from ${pol} where ${pol.purchaseOrderId} = ${po.id})`,
      totalUnits: sql<number>`(select coalesce(sum(${pol.quantity}), 0)::int from ${pol} where ${pol.purchaseOrderId} = ${po.id})`,
      overriddenLines: sql<number>`(select count(*)::int from ${pol} where ${pol.purchaseOrderId} = ${po.id} and ${pol.wasOverridden})`,
    })
    .from(po)
    .innerJoin(distributors, eq(distributors.distributorId, po.distributorId))
    .innerJoin(runs, eq(runs.id, po.runId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(po.poDate), desc(po.id));
}
export type PoListRow = Awaited<ReturnType<typeof listPurchaseOrders>>[number];

export async function getPurchaseOrder(id: number) {
  const db = getDb();
  const [header] = await db
    .select({
      id: po.id,
      poNumber: po.poNumber,
      runId: po.runId,
      runDate: runs.runDate,
      distributorId: po.distributorId,
      distributorName: distributors.name,
      region: distributors.region,
      status: po.status,
      poDate: po.poDate,
      notes: po.notes,
      createdBy: po.createdBy,
      createdAt: po.createdAt,
      statusChangedBy: po.statusChangedBy,
      statusChangedAt: po.statusChangedAt,
      zohoPurchaseOrderId: po.zohoPurchaseOrderId,
    })
    .from(po)
    .innerJoin(distributors, eq(distributors.distributorId, po.distributorId))
    .innerJoin(runs, eq(runs.id, po.runId))
    .where(eq(po.id, id));
  if (!header) return null;
  const lines = await db
    .select({
      id: pol.id,
      skuId: pol.skuId,
      skuName: pol.skuName,
      quantity: pol.quantity,
      uom: pol.uom,
      finalAction: pol.finalAction,
      wasOverridden: pol.wasOverridden,
      rulesQty: rec.recommendedQty,
      reasonCode: schema.overrides.reasonCode,
      note: schema.overrides.note,
    })
    .from(pol)
    .innerJoin(rec, eq(rec.id, pol.recommendationId))
    .leftJoin(schema.overrides, eq(schema.overrides.recommendationId, pol.recommendationId))
    .where(eq(pol.purchaseOrderId, id))
    .orderBy(asc(pol.skuId));
  const zoho = zohoPreview({ poNumber: header.poNumber, poDate: header.poDate, distributorId: header.distributorId, runId: header.runId, notes: header.notes, lines });
  return { ...header, lines, totalUnits: lines.reduce((a, l) => a + l.quantity, 0), zoho };
}
export type PoDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>;

const TRANSITIONS: Record<string, string[]> = { draft: ["sent", "cancelled"], sent: [], cancelled: [] };

export async function setPurchaseOrderStatus(id: number, status: "sent" | "cancelled", user: string) {
  const db = getDb();
  const [cur] = await db.select({ status: po.status }).from(po).where(eq(po.id, id));
  if (!cur) throw new HttpError(404, "PO not found");
  if (!TRANSITIONS[cur.status]?.includes(status)) throw new HttpError(409, `A ${cur.status} PO cannot be marked ${status}`);
  await db.update(po).set({ status, statusChangedBy: user, statusChangedAt: new Date() }).where(and(eq(po.id, id), eq(po.status, cur.status)));
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One CSV row per PO line; works for a single PO or all live POs of a run. */
export async function purchaseOrdersCsv(ids: number[]): Promise<string> {
  const header = ["PO_Number", "PO_Date", "Status", "Distributor_ID", "Distributor_Name", "SKU_ID", "SKU_Name", "Quantity", "Unit", "Rules_Qty", "Was_Overridden", "Override_Reason"];
  const out = [header.join(",")];
  for (const id of ids) {
    const p = await getPurchaseOrder(id);
    if (!p) continue;
    for (const l of p.lines) {
      out.push(
        [p.poNumber, p.poDate, p.status, p.distributorId, p.distributorName, l.skuId, l.skuName, l.quantity, l.uom, l.rulesQty, l.wasOverridden ? "TRUE" : "FALSE", l.reasonCode ? `${l.reasonCode}${l.note ? `: ${l.note}` : ""}` : ""]
          .map(cell)
          .join(","),
      );
    }
  }
  return out.join("\n") + "\n";
}

export async function poCountsForRun(runId: number) {
  const pos = await listPurchaseOrders({ runId });
  return { live: pos.filter((p) => p.status !== "cancelled"), eligible: (await eligibleLines(runId)).length };
}
