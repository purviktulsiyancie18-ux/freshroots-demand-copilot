import { z } from "zod";
import { handle, parseId } from "@/lib/api";
import { setPurchaseOrderStatus } from "@/lib/po/store";
import { currentUser } from "@/lib/user";

const Body = z.object({ status: z.enum(["sent", "cancelled"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { status } = Body.parse(await req.json());
    await setPurchaseOrderStatus(parseId((await params).id), status, await currentUser());
    return { ok: true };
  });
}
