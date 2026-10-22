import { handle, parseId } from "@/lib/api";
import { HttpError } from "@/lib/queries";
import { getPurchaseOrder, purchaseOrdersCsv } from "@/lib/po/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseId((await params).id);
    const p = await getPurchaseOrder(id);
    if (!p) throw new HttpError(404, "PO not found");
    return new Response(await purchaseOrdersCsv([id]), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${p.poNumber}.csv"` },
    });
  });
}
