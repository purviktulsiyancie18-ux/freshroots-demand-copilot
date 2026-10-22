import { handle, parseId } from "@/lib/api";
import { approveAllStandard } from "@/lib/queries";
import { currentUser } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => ({ approved: await approveAllStandard(parseId((await params).id), await currentUser()) }));
}
