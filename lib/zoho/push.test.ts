import { describe, expect, it } from "vitest";
import { ZohoClient, missingZohoSettings, zohoConfigFromEnv } from "./client";
import { pushPurchaseOrder } from "./push";

// In-memory fake of the Zoho Inventory endpoints we call.
function fakeZoho(seed: { vendors?: { contact_id: string; contact_name: string }[]; items?: { item_id: string; sku: string; name: string }[] } = {}) {
  const vendors = [...(seed.vendors ?? [])];
  const items = [...(seed.items ?? [])];
  const posted: { path: string; body: Record<string, unknown>; query: URLSearchParams }[] = [];
  let n = 0;
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.pathname === "/oauth/v2/token") return json({ access_token: "tok", expires_in: 3600 });
    expect(url.searchParams.get("organization_id")).toBe("org1");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Zoho-oauthtoken tok");
    const path = url.pathname.replace("/inventory/v1", "");
    if (init?.method === "GET" && path === "/contacts") return json({ code: 0, contacts: vendors, page_context: { has_more_page: false } });
    if (init?.method === "GET" && path === "/items") return json({ code: 0, items, page_context: { has_more_page: false } });
    const body = JSON.parse(String(init?.body));
    posted.push({ path, body, query: url.searchParams });
    if (path === "/contacts") {
      const c = { contact_id: `v${++n}`, contact_name: body.contact_name };
      vendors.push(c);
      return json({ code: 0, contact: c });
    }
    if (path === "/items") {
      const it = { item_id: `i${++n}`, sku: body.sku, name: body.name };
      items.push(it);
      return json({ code: 0, item: it });
    }
    if (path === "/purchaseorders") return json({ code: 0, purchaseorder: { purchaseorder_id: "po99", purchaseorder_number: body.purchaseorder_number } });
    return json({ code: 5, message: "unexpected" }, 404);
  }) as typeof fetch;
  return { fetchFn, posted };
}

const cfg = { dc: "in", clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "org1" };
const po = {
  poNumber: "PO-20261019-DIST001",
  poDate: "2026-10-19",
  distributorId: "DIST001",
  distributorName: "NutriFlow Distributors",
  runId: 6,
  notes: null,
  lines: [
    { skuId: "SKU001", skuName: "Freshroots Mango Drink 200ml", quantity: 750, uom: "Units" },
    { skuId: "SKU007", skuName: "Freshroots Coconut Water 330ml", quantity: 200, uom: "Units" },
  ],
};

describe("Zoho push", () => {
  it("creates missing vendor and items, then a PO with our number and planner quantities", async () => {
    const z = fakeZoho({ items: [{ item_id: "existing1", sku: "SKU001", name: "Mango" }] });
    const r = await pushPurchaseOrder(new ZohoClient(cfg, z.fetchFn), po);
    expect(r).toMatchObject({ purchaseOrderId: "po99", purchaseOrderNumber: "PO-20261019-DIST001", createdVendor: true, createdItems: ["SKU007"] });
    const poCall = z.posted.find((p) => p.path === "/purchaseorders")!;
    expect(poCall.query.get("ignore_auto_number_generation")).toBe("true");
    expect(poCall.body.vendor_id).toBe("v1");
    expect(poCall.body.line_items).toEqual([
      { item_id: "existing1", name: "Freshroots Mango Drink 200ml", quantity: 750, unit: "Units" },
      { item_id: "i2", name: "Freshroots Coconut Water 330ml", quantity: 200, unit: "Units" },
    ]);
  });

  it("reuses an existing vendor matched by name", async () => {
    const z = fakeZoho({
      vendors: [{ contact_id: "vX", contact_name: "nutriflow distributors " }],
      items: [{ item_id: "a", sku: "SKU001", name: "" }, { item_id: "b", sku: "sku007", name: "" }],
    });
    const r = await pushPurchaseOrder(new ZohoClient(cfg, z.fetchFn), po);
    expect(r.createdVendor).toBe(false);
    expect(z.posted.map((p) => p.path)).toEqual(["/purchaseorders"]);
  });

  it("surfaces Zoho errors", async () => {
    const fetchFn = (async (input: string | URL) =>
      String(input).includes("oauth") ? new Response(JSON.stringify({ access_token: "tok" })) : new Response(JSON.stringify({ code: 6063, message: "Action cannot be completed" }), { status: 400 })) as typeof fetch;
    await expect(pushPurchaseOrder(new ZohoClient(cfg, fetchFn), po)).rejects.toThrow("Zoho: Action cannot be completed");
  });

  it("is not configured until the organization id exists", () => {
    const env = { ZOHO_CLIENT_ID: "c", ZOHO_CLIENT_SECRET: "s", ZOHO_REFRESH_TOKEN: "r" } as unknown as NodeJS.ProcessEnv;
    expect(zohoConfigFromEnv(env)).toBeNull();
    expect(missingZohoSettings(env)).toEqual(["ZOHO_ORG_ID"]);
  });
});
