import { handle, parseId } from "@/lib/api";
import { HttpError } from "@/lib/queries";
import { getPurchaseOrder } from "@/lib/po/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const p = await getPurchaseOrder(parseId((await params).id));
    if (!p) throw new HttpError(404, "PO not found");
    return p;
  });
}
