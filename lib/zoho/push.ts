// Pushes a Freshroots draft PO to Zoho Inventory as a draft purchase order.
// Vendors are matched by name and items by SKU; missing ones are created from Freshroots master data
// (no prices — Zoho needs a rate, so 0 is used and procurement sets prices in Zoho).

import type { ZohoClient } from "./client";
import { toZohoPurchaseOrder, type PoForZoho } from "@/lib/po/zoho";

export interface VendorInfo {
  distributorId: string;
  name: string;
}
export interface ItemInfo {
  skuId: string;
  name: string;
  uom: string;
}

type ZContact = { contact_id: string; contact_name: string };
type ZItem = { item_id: string; sku?: string; name: string };

const norm = (s: string) => s.trim().toLowerCase();

export async function ensureVendor(z: ZohoClient, v: VendorInfo): Promise<{ id: string; created: boolean }> {
  const vendors = await z.listAll<ZContact>("/contacts", "contacts", { contact_type: "vendor" });
  const hit = vendors.find((c) => norm(c.contact_name) === norm(v.name));
  if (hit) return { id: hit.contact_id, created: false };
  const j = await z.request<{ contact: ZContact }>("POST", "/contacts", { contact_name: v.name, contact_type: "vendor", notes: `Freshroots distributor ${v.distributorId}` });
  return { id: j.contact.contact_id, created: true };
}

export async function ensureItems(z: ZohoClient, items: ItemInfo[]): Promise<{ ids: Record<string, string>; created: string[] }> {
  const existing = await z.listAll<ZItem>("/items", "items");
  const bySku = new Map(existing.filter((i) => i.sku).map((i) => [norm(i.sku!), i.item_id]));
  const ids: Record<string, string> = {};
  const created: string[] = [];
  for (const it of items) {
    const found = bySku.get(norm(it.skuId));
    if (found) {
      ids[it.skuId] = found;
      continue;
    }
    const j = await z.request<{ item: ZItem }>("POST", "/items", {
      name: it.name,
      sku: it.skuId,
      unit: it.uom,
      item_type: "inventory",
      product_type: "goods",
      rate: 0,
      purchase_rate: 0,
    });
    ids[it.skuId] = j.item.item_id;
    created.push(it.skuId);
  }
  return { ids, created };
}

export async function pushPurchaseOrder(
  z: ZohoClient,
  po: PoForZoho & { distributorName: string },
): Promise<{ purchaseOrderId: string; purchaseOrderNumber: string; createdVendor: boolean; createdItems: string[] }> {
  const vendor = await ensureVendor(z, { distributorId: po.distributorId, name: po.distributorName });
  const items = await ensureItems(z, po.lines.map((l) => ({ skuId: l.skuId, name: l.skuName, uom: l.uom })));
  const { payload, missing } = toZohoPurchaseOrder(po, { vendorIdByDistributor: { [po.distributorId]: vendor.id }, itemIdBySku: items.ids });
  if (!payload) throw new Error(`Zoho is missing ${[...missing.vendors, ...missing.items].join(", ")}`);
  const j = await z.request<{ purchaseorder: { purchaseorder_id: string; purchaseorder_number: string } }>("POST", "/purchaseorders", payload, { ignore_auto_number_generation: "true" });
  return { purchaseOrderId: j.purchaseorder.purchaseorder_id, purchaseOrderNumber: j.purchaseorder.purchaseorder_number, createdVendor: vendor.created, createdItems: items.created };
}

export function zohoPoUrl(dc: string, orgId: string, purchaseOrderId: string): string {
  return `https://inventory.zoho.${dc}/app/${orgId}#/purchaseorders/${purchaseOrderId}`;
}
