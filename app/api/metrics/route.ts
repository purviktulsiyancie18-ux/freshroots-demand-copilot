import { handle } from "@/lib/api";
import { getMetrics } from "@/lib/queries";

export async function GET() {
  return handle(() => getMetrics());
}
