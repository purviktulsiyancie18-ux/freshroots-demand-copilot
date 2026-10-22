import { handle, parseId } from "@/lib/api";
import { pushToZoho } from "@/lib/po/store";

export const maxDuration = 60;

/** Creates this PO as a draft purchase order in Zoho Inventory (vendors/items created if missing). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => pushToZoho(parseId((await params).id)));
}
