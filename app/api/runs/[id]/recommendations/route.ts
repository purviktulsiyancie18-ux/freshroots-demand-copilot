import { handle, parseId } from "@/lib/api";
import { getRecommendations, type Tab } from "@/lib/queries";

const TABS: Tab[] = ["needs_judgment", "standard", "no_action", "all"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseId((await params).id);
    const t = new URL(req.url).searchParams.get("tab") as Tab | null;
    return { recommendations: await getRecommendations(id, t && TABS.includes(t) ? t : "all") };
  });
}
