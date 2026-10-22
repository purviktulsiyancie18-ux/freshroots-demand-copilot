import { z } from "zod";
import { handle } from "@/lib/api";
import { getConfigRows, updateConfig } from "@/lib/queries";
import { currentUser } from "@/lib/user";

export async function GET() {
  return handle(() => getConfigRows());
}

export async function PUT(req: Request) {
  return handle(async () => {
    const body = z.record(z.string(), z.number()).parse(await req.json());
    return updateConfig(body, await currentUser());
  });
}
