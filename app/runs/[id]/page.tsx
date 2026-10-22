import { notFound, redirect } from "next/navigation";
import { getRecommendations, getRun, getSkuContext, REASON_CODES } from "@/lib/queries";
import { ReviewQueue } from "./ReviewQueue";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const run = await getRun(id);
  if (!run) notFound();
  if (!["ready_for_review", "completed"].includes(run.status)) redirect(`/upload?run=${id}`);
  const recs = await getRecommendations(id, "all");
  const ctx = await getSkuContext(id, recs.map((r) => r.skuId));
  return (
    <ReviewQueue
      run={{ id: run.id, runDate: run.runDate, status: run.status, counts: run.counts, isFestival: recs.some((r) => r.isFestival) }}
      recs={JSON.parse(JSON.stringify(recs))}
      ctx={JSON.parse(JSON.stringify(ctx))}
      reasonCodes={[...REASON_CODES]}
    />
  );
}
