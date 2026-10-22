import { describe, expect, it } from "vitest";
import { buildDraftPos, isPoLine, poNumberFor, type EligibleLine } from "./build";
import { toZohoPurchaseOrder, zohoPreview } from "./zoho";

// Golden run decisions: everything approved as the rules say, SKU007 overridden to reorder 200.
const line = (skuId: string, distributorId: string, finalAction: string, finalQty: number, wasOverridden = false): EligibleLine => ({
  recommendationId: Number(skuId.slice(3)),
  skuId,
  skuName: `Freshroots ${skuId}`,
  uom: "Units",
  distributorId,
  finalAction,
  finalQty,
  wasOverridden,
});
const decided = [
  line("SKU013", "DIST001", "REORDER_NOW", 120),
  line("SKU001", "DIST001", "REORDER_NOW", 750),
  line("SKU007", "DIST001", "REORDER_NOW", 200, true),
  line("SKU003", "DIST002", "REORDER_NOW", 300),
  line("SKU004", "DIST002", "REORDER_NOW", 150),
  line("SKU006", "DIST003", "PAUSE_NEXT_ORDER", 0),
  line("SKU011", "DIST004", "REORDER_NOW", 500),
  line("SKU002", "DIST001", "NO_ACTION", 0),
];

describe("buildDraftPos", () => {
  it("one PO per distributor, only reorders with qty > 0", () => {
    const pos = buildDraftPos(decided, "2026-10-22", []);
    expect(pos.map((p) => [p.poNumber, p.lines.map((l) => `${l.skuId}:${l.finalQty}`)])).toEqual([
      ["PO-20261022-DIST001", ["SKU001:750", "SKU007:200", "SKU013:120"]],
      ["PO-20261022-DIST002", ["SKU003:300", "SKU004:150"]],
      ["PO-20261022-DIST004", ["SKU011:500"]],
    ]);
  });

  it("pauses, no-action and zero-qty overrides are never PO lines", () => {
    expect(isPoLine({ finalAction: "PAUSE_NEXT_ORDER", finalQty: 0 })).toBe(false);
    expect(isPoLine({ finalAction: "NO_ACTION", finalQty: 0 })).toBe(false);
    expect(isPoLine({ finalAction: "REORDER_NOW", finalQty: 0 })).toBe(false);
    expect(isPoLine({ finalAction: "REORDER_INCREASED", finalQty: 50 })).toBe(true);
  });

  it("numbers stay unique when a later batch adds a PO for the same distributor", () => {
    expect(poNumberFor("2026-10-22", "DIST001", new Set(["PO-20261022-DIST001"]))).toBe("PO-20261022-DIST001-2");
    const pos = buildDraftPos([line("SKU001", "DIST001", "REORDER_NOW", 10)], "2026-10-22", ["PO-20261022-DIST001", "PO-20261022-DIST001-2"]);
    expect(pos[0].poNumber).toBe("PO-20261022-DIST001-3");
  });
});

describe("Zoho payload", () => {
  const po = { poNumber: "PO-20261022-DIST002", poDate: "2026-10-22", distributorId: "DIST002", runId: 7, notes: null, lines: [
    { skuId: "SKU003", skuName: "Brown Rice 1kg", quantity: 300, uom: "Units" },
    { skuId: "SKU004", skuName: "Almond Milk 500ml", quantity: 150, uom: "Units" },
  ] };

  it("maps to Zoho Inventory purchase order fields", () => {
    const { payload, missing } = toZohoPurchaseOrder(po, { vendorIdByDistributor: { DIST002: "v1" }, itemIdBySku: { SKU003: "i3", SKU004: "i4" } });
    expect(missing).toEqual({ vendors: [], items: [] });
    expect(payload).toMatchObject({ vendor_id: "v1", purchaseorder_number: "PO-20261022-DIST002", date: "2026-10-22", reference_number: "Freshroots run #7" });
    expect(payload!.line_items).toEqual([
      { item_id: "i3", name: "Brown Rice 1kg", quantity: 300, unit: "Units" },
      { item_id: "i4", name: "Almond Milk 500ml", quantity: 150, unit: "Units" },
    ]);
  });

  it("reports unmatched vendors/items instead of sending a partial PO", () => {
    const { payload, missing } = toZohoPurchaseOrder(po, { vendorIdByDistributor: {}, itemIdBySku: { SKU003: "i3" } });
    expect(payload).toBeNull();
    expect(missing).toEqual({ vendors: ["DIST002"], items: ["SKU004"] });
  });

  it("preview uses placeholders", () => {
    expect(zohoPreview(po).vendor_id).toBe("<Zoho vendor_id for DIST002>");
  });
});
