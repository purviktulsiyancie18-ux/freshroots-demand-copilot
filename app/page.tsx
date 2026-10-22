import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMetrics, listRuns } from "@/lib/queries";
import { REASON_LABEL, STATUS_LABEL, STATUS_TONE, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "green" | "amber" }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "red" && "text-red-600", tone === "green" && "text-emerald-700", tone === "amber" && "text-amber-600")}>{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function Dashboard() {
  const [m, runs] = await Promise.all([getMetrics(), listRuns(10)]);
  const rate = m.overrideRate;
  const rateTone = rate === null ? undefined : rate > 0.4 ? "red" : rate < 0.25 ? "green" : "amber";
  const maxFlag = Math.max(1, ...m.flagTrend.map((f) => Math.max(f.stockout, f.overstock, f.highDemand)));
  const maxReason = Math.max(1, ...m.reasons.map((r) => r.n));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">90-day pilot measurement · runs every Monday & Thursday</p>
        </div>
        <Link href="/upload" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          New run
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest run</CardTitle>
        </CardHeader>
        <CardContent>
          {m.latest ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="font-medium">Run #{m.latest.id} · {formatDate(m.latest.runDate)}</span>
              <Badge tone={STATUS_TONE[m.latest.status] ?? "slate"}>{STATUS_LABEL[m.latest.status] ?? m.latest.status}</Badge>
              {m.latest.counts && m.latest.counts.total > 0 && (
                <>
                  <span>{m.latest.counts.flagged} flagged / {m.latest.counts.total} SKUs</span>
                  <span className="text-amber-700">{m.latest.counts.needsJudgment} need judgment</span>
                  <span>{m.latest.counts.pendingReview} pending review</span>
                </>
              )}
              <Link href={m.latest.status === "failed_validation" || ["parsing", "cleaning", "rules", "ai"].includes(m.latest.status) ? `/upload?run=${m.latest.id}` : `/runs/${m.latest.id}`} className="ml-auto font-medium text-emerald-700 hover:underline">
                Open →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No runs yet. <Link href="/upload" className="text-emerald-700 hover:underline">Upload this week&apos;s SAP export</Link> to start.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label="Override rate (4 weeks)"
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
          sub={rate === null ? "No decided flagged SKUs yet · target < 25%, kill > 40%" : `${m.overrideCount} of ${m.overrideDecided} flagged decisions · target < 25%${rate > 0.4 ? " · ABOVE KILL THRESHOLD" : ""}`}
          tone={rateTone}
        />
        <Metric label="Runs completed this month" value={String(m.runsCompleted)} sub={`${m.runsOnSchedule} on scheduled Mon/Thu days · reviewed and closed`} />
        <Metric
          label="Median review time"
          value={m.medianReviewHours === null ? "—" : m.medianReviewHours < 1 ? `${Math.round(m.medianReviewHours * 60)} min` : `${m.medianReviewHours.toFixed(1)} h`}
          sub={`Run ready → completed, last 30 days (${m.completedRuns30d} runs) · target < 2 h`}
          tone={m.medianReviewHours === null ? undefined : m.medianReviewHours < 2 ? "green" : "red"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Flags by run</CardTitle>
          </CardHeader>
          <CardContent>
            {m.flagTrend.length === 0 ? (
              <p className="text-sm text-slate-500">Appears after the first completed run.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-4 text-[11px] text-slate-500">
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500" />Stockout</span>
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />Overstock</span>
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-500" />High demand</span>
                </div>
                {m.flagTrend.map((f) => (
                  <div key={f.runId} className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
                    <span className="text-slate-500">{formatDate(f.runDate)}</span>
                    <div className="space-y-0.5">
                      {[
                        [f.stockout, "bg-red-500"],
                        [f.overstock, "bg-amber-500"],
                        [f.highDemand, "bg-blue-500"],
                      ].map(([v, c], i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className={cn("h-2 rounded-sm", c as string)} style={{ width: `${((v as number) / maxFlag) * 85}%`, minWidth: (v as number) ? 4 : 0 }} />
                          <span className="tabular-nums text-slate-600">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top override reasons (90 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {m.reasons.length === 0 ? (
              <p className="text-sm text-slate-500">No overrides yet. Each override reason feeds the next run&apos;s AI context.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {m.reasons.map((r) => (
                  <li key={r.reasonCode} className="grid grid-cols-[150px_1fr] items-center gap-2">
                    <span className="text-slate-700">{REASON_LABEL[r.reasonCode] ?? r.reasonCode}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-sm bg-emerald-600" style={{ width: `${(r.n / maxReason) * 85}%` }} />
                      <span className="tabular-nums text-slate-600">{r.n}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500">No runs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Run</th>
                  <th className="py-1.5 pr-3 font-medium">Run date</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 pr-3 font-medium">Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium">#{r.id}</td>
                    <td className="py-2 pr-3">{formatDate(r.runDate)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{formatDateTime(r.startedAt)}</td>
                    <td className="py-2 text-right">
                      <Link className="text-emerald-700 hover:underline" href={["ready_for_review", "completed"].includes(r.status) ? `/runs/${r.id}` : `/upload?run=${r.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
