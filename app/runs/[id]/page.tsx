import { notFound, redirect } from "next/navigation";
import { getRecommendations, getRun, getSkuContext, REASON_CODES } from "@/lib/queries";
import { poCountsForRun } from "@/lib/po/store";
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
  const po = await poCountsForRun(id);
  return (
    <ReviewQueue
      po={{ eligible: po.eligible, live: po.live.map((p) => ({ id: p.id, poNumber: p.poNumber, status: p.status })) }}
      run={{ id: run.id, runDate: run.runDate, status: run.status, counts: run.counts, isFestival: recs.some((r) => r.isFestival) }}
      recs={JSON.parse(JSON.stringify(recs))}
      ctx={JSON.parse(JSON.stringify(ctx))}
      reasonCodes={[...REASON_CODES]}
    />
  );
}
