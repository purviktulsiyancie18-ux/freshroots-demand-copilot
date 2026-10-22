import { handle, parseId } from "@/lib/api";
import { approveRecommendation } from "@/lib/queries";
import { currentUser } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await approveRecommendation(parseId((await params).id), await currentUser());
    return { ok: true };
  });
}
