// Maps a Freshroots draft PO onto the Zoho Inventory "create purchase order" request body
// (POST /inventory/v1/purchaseorders?organization_id=…). Not called yet: once Zoho credentials exist,
// a client only needs vendor/item id lookups and to POST this payload, then store zoho_purchaseorder_id.

export interface PoForZoho {
  poNumber: string;
  poDate: string;
  distributorId: string;
  runId: number;
  notes: string | null;
  lines: { skuId: string; skuName: string; quantity: number; uom: string }[];
}

export interface ZohoLookups {
  vendorIdByDistributor: Record<string, string>;
  itemIdBySku: Record<string, string>;
}

export interface ZohoPurchaseOrderPayload {
  vendor_id: string;
  purchaseorder_number: string;
  date: string;
  reference_number: string;
  notes: string;
  line_items: { item_id: string; name: string; quantity: number; unit: string }[];
}

export function toZohoPurchaseOrder(
  po: PoForZoho,
  lookups: ZohoLookups,
): { payload: ZohoPurchaseOrderPayload | null; missing: { vendors: string[]; items: string[] } } {
  const vendorId = lookups.vendorIdByDistributor[po.distributorId];
  const missingItems = po.lines.filter((l) => !lookups.itemIdBySku[l.skuId]).map((l) => l.skuId);
  const missing = { vendors: vendorId ? [] : [po.distributorId], items: missingItems };
  if (!vendorId || missingItems.length) return { payload: null, missing };
  return {
    payload: {
      vendor_id: vendorId,
      purchaseorder_number: po.poNumber,
      date: po.poDate,
      reference_number: `Freshroots run #${po.runId}`,
      notes: po.notes ?? "Draft from Freshroots Demand Copilot — quantities approved by the planner.",
      line_items: po.lines.map((l) => ({ item_id: lookups.itemIdBySku[l.skuId], name: l.skuName, quantity: l.quantity, unit: l.uom })),
    },
    missing,
  };
}

/** Payload with placeholder ids — shown in the app so procurement can see exactly what would be sent. */
export function zohoPreview(po: PoForZoho): ZohoPurchaseOrderPayload {
  return toZohoPurchaseOrder(po, {
    vendorIdByDistributor: { [po.distributorId]: `<Zoho vendor_id for ${po.distributorId}>` },
    itemIdBySku: Object.fromEntries(po.lines.map((l) => [l.skuId, `<Zoho item_id for ${l.skuId}>`])),
  }).payload!;
}
