import { handle, parseId } from "@/lib/api";
import { executeRun } from "@/lib/pipeline/execute";
import { getRun } from "@/lib/queries";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseId((await params).id);
    await executeRun(id);
    return getRun(id);
  });
}
