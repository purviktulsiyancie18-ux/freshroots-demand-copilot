import { handle, parseId } from "@/lib/api";
import { OverrideBody, overrideRecommendation } from "@/lib/queries";
import { currentUser } from "@/lib/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = OverrideBody.parse(await req.json());
    await overrideRecommendation(parseId((await params).id), body, await currentUser());
    return { ok: true };
  });
}
