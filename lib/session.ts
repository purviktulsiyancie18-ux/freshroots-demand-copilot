import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";

/** Display name of the signed-in planner (used for decided_by / created_by). */
export async function currentUser(): Promise<string> {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return s?.name ?? "unknown";
}
