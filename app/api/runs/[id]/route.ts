import { handle, parseId } from "@/lib/api";
import { HttpError, getCleaningLog, getRun } from "@/lib/queries";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseId((await params).id);
    const run = await getRun(id);
    if (!run) throw new HttpError(404, "Run not found");
    const withLog = new URL(req.url).searchParams.get("log") === "1";
    return { run, log: withLog ? await getCleaningLog(id) : undefined };
  });
}
