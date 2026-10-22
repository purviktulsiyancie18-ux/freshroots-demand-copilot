import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { getReviewTarget } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Header "Review queue": opens the run awaiting review (or the latest reviewed one). */
export default async function ReviewPage() {
  const target = await getReviewTarget();
  if (target) redirect(`/runs/${target.runId}`);
  return (
    <Card className="mx-auto mt-10 max-w-lg p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <ClipboardCheck className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">Nothing to review yet</h1>
      <p className="mt-1 text-sm text-slate-500">Upload this week&apos;s SAP export and the review queue will open here.</p>
      <Link href="/upload" className={buttonClass("default", "default", "mt-5")}>
        Upload & run
      </Link>
    </Card>
  );
}
