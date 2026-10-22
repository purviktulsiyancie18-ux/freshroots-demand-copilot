import { handle, parseId } from "@/lib/api";
import { createDraftsForRun, poCountsForRun } from "@/lib/po/store";
import { currentUser } from "@/lib/user";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => poCountsForRun(parseId((await params).id)));
}

/** Creates one draft PO per distributor from the run's approved reorders not yet on a PO. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => ({ created: await createDraftsForRun(parseId((await params).id), await currentUser()) }));
}
