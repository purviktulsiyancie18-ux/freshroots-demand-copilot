import { handle } from "@/lib/api";
import { listPurchaseOrders } from "@/lib/po/store";

export async function GET(req: Request) {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const runId = Number(q.get("runId")) || undefined;
    const status = q.get("status") ?? undefined;
    return { purchaseOrders: await listPurchaseOrders({ runId, status }) };
  });
}
