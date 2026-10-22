import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, CalendarCheck, CheckCircle2, ClipboardCheck, FileText, History, MessageSquareQuote, Percent, Timer, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlagTrendChart } from "@/components/charts/FlagTrendChart";
import { getMetrics, listRuns } from "@/lib/queries";
import { listPurchaseOrders } from "@/lib/po/store";
import { PLANNER_NAME } from "@/lib/user";
import { REASON_LABEL, STATUS_LABEL, STATUS_TONE, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Next Monday or Thursday after today (IST). */
function nextRunDay() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if ([1, 4].includes(d.getDay())) return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
  }
  return "";
}

/** Value on a 0→max track with labelled target markers. */
function TargetBar({ value, max, marks, tone }: { value: number; max: number; marks: { at: number; label: string }[]; tone: "good" | "warn" | "bad" }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-full bg-slate-100">
        <div className={cn("h-2 rounded-full", tone === "good" ? "bg-brand-600" : tone === "warn" ? "bg-saffron-500" : "bg-red-500")} style={{ width: pct(value) }} />
        {marks.map((m) => (
          <span key={m.label} className="absolute -top-1 h-4 w-0.5 rounded bg-slate-400" style={{ left: pct(m.at) }} />
        ))}
      </div>
      <div className="relative mt-1.5 h-3 text-[10px] text-slate-500">
        {marks.map((m) => (
          <span key={m.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(m.at) }}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatTile({ icon, label, value, sub, status, children }: { icon: React.ReactNode; label: string; value: string; sub: string; status?: { tone: "good" | "warn" | "bad"; text: string }; children?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>
        {status && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              status.tone === "good" ? "bg-brand-50 text-brand-800" : status.tone === "warn" ? "bg-saffron-100 text-amber-900" : "bg-red-50 text-red-700",
            )}
          >
            {status.tone === "good" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {status.text}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm text-slate-500">{label}</p>
      <p className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
      {children}
    </Card>
  );
}

export default async function Dashboard() {
  const [m, runs, draftPos] = await Promise.all([getMetrics(), listRuns(8), listPurchaseOrders({ status: "draft" })]);
  const rate = m.overrideRate;
  const rateTone = rate === null ? undefined : rate > 0.4 ? "bad" : rate < 0.25 ? "good" : "warn";
  const reviewHours = m.medianReviewHours;
  const maxReason = Math.max(1, ...m.reasons.map((r) => r.n));
  const latest = m.latest;
  const latestOpen = latest && ["ready_for_review", "completed"].includes(latest.status);
  const pending = latest?.counts?.pendingReview ?? 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-6 text-white shadow-xl shadow-brand-900/20 sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-saffron-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-saffron-500 uppercase">Demand planning · Maharashtra & Goa</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {greeting()}, {PLANNER_NAME}
            </h1>
            {latest ? (
              <p className="mt-2 text-brand-100/80">
                {pending > 0 ? (
                  <>
                    Run #{latest.id} from {formatDate(latest.runDate)} has <b className="text-white">{pending} SKU{pending === 1 ? "" : "s"}</b> waiting for your decision
                    {latest.counts?.needsJudgment ? `, ${latest.counts.needsJudgment} needing judgment` : ""}.
                  </>
                ) : (
                  <>You&apos;re all caught up. The latest run (#{latest.id}, {formatDate(latest.runDate)}) is {STATUS_LABEL[latest.status]?.toLowerCase() ?? latest.status}.</>
                )}
              </p>
            ) : (
              <p className="mt-2 text-brand-100/80">Upload this week&apos;s SAP export to run the first forecast.</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {latest && latestOpen ? (
                <Link href={`/runs/${latest.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-saffron-500 px-4 text-sm font-semibold text-brand-950 shadow-lg shadow-black/10 transition hover:bg-amber-400">
                  <ClipboardCheck className="h-4 w-4" />
                  {pending > 0 ? "Open review queue" : "View latest run"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
              <Link href="/upload" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/15">
                <Upload className="h-4 w-4" />
                New run
              </Link>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:min-w-[340px]">
            {[
              { label: "Flagged SKUs", value: latest?.counts ? `${latest.counts.flagged}/${latest.counts.total}` : "—" },
              { label: "Need judgment", value: latest?.counts ? String(latest.counts.needsJudgment) : "—" },
              { label: "PO drafts open", value: String(draftPos.length) },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10 backdrop-blur">
                <p className="text-2xl font-semibold">{s.value}</p>
                <p className="mt-0.5 text-[11px] text-brand-100/70">{s.label}</p>
              </div>
            ))}
            <p className="col-span-3 mt-1 flex items-center gap-1.5 text-xs text-brand-100/70">
              <CalendarCheck className="h-3.5 w-3.5" /> Next scheduled run: {nextRunDay()}
            </p>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          icon={<Percent />}
          label="Override rate · last 4 weeks"
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
          sub={rate === null ? "No decided flagged SKUs yet" : `${m.overrideCount} of ${m.overrideDecided} flagged decisions overridden`}
          status={rateTone ? { tone: rateTone, text: rateTone === "good" ? "On target" : rateTone === "warn" ? "Above target" : "Kill threshold" } : undefined}
        >
          <TargetBar value={(rate ?? 0) * 100} max={60} marks={[{ at: 25, label: "Target 25%" }, { at: 40, label: "Kill 40%" }]} tone={rateTone ?? "good"} />
        </StatTile>
        <StatTile icon={<History />} label="Runs completed this month" value={String(m.runsCompleted)} sub={`${m.runsOnSchedule} on scheduled Monday/Thursday runs · reviewed and closed`} />
        <StatTile
          icon={<Timer />}
          label="Median review time · 30 days"
          value={reviewHours === null ? "—" : reviewHours < 1 ? `${Math.round(reviewHours * 60)} min` : `${reviewHours.toFixed(1)} h`}
          sub={`Run ready → completed, across ${m.completedRuns30d} run${m.completedRuns30d === 1 ? "" : "s"}`}
          status={reviewHours === null ? undefined : reviewHours < 2 ? { tone: "good", text: "Under 2 h" } : { tone: "bad", text: "Over 2 h" }}
        >
          {reviewHours !== null && <TargetBar value={reviewHours * 60} max={180} marks={[{ at: 120, label: "Target 2 h" }]} tone={reviewHours < 2 ? "good" : "bad"} />}
        </StatTile>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle icon={<BarChart3 />}>Flags by run</CardTitle>
            <span className="text-xs text-slate-500">Last {m.flagTrend.length} runs</span>
          </CardHeader>
          <CardContent>
            {m.flagTrend.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Appears after the first run.</p> : <FlagTrendChart data={m.flagTrend} />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle icon={<MessageSquareQuote />}>Why Raghav overrides</CardTitle>
            <span className="text-xs text-slate-500">90 days</span>
          </CardHeader>
          <CardContent>
            {m.reasons.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">No overrides yet. Each reason feeds the next run&apos;s AI context.</p>
            ) : (
              <ul className="space-y-3.5">
                {m.reasons.map((r) => (
                  <li key={r.reasonCode}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="text-slate-700">{REASON_LABEL[r.reasonCode] ?? r.reasonCode}</span>
                      <span className="font-medium text-slate-900 tabular-nums">{r.n}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-r-[4px] rounded-l-full bg-brand-600" style={{ width: `${(r.n / maxReason) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-5 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-800">Overrides and their reasons are sent to Gemini on the next run, so explanations learn from your judgment.</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle icon={<FileText />}>Recent runs</CardTitle>
          <Link href="/upload" className={buttonClass("outline", "sm")}>
            <Upload className="h-3.5 w-3.5" /> New run
          </Link>
        </CardHeader>
        <div className="overflow-x-auto">
          {runs.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">No runs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-y border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Run date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Flagged</th>
                  <th className="px-3 py-2 text-right font-medium">Need judgment</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Started</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const s = (r.summary ?? {}) as { flagged?: number; skus?: number; needsJudgment?: number };
                  const href = ["ready_for_review", "completed"].includes(r.status) ? `/runs/${r.id}` : `/upload?run=${r.id}`;
                  return (
                    <tr key={r.id} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-medium">#{r.id}</td>
                      <td className="px-3 py-3">{formatDate(r.runDate)}</td>
                      <td className="px-3 py-3">
                        <Badge dot tone={STATUS_TONE[r.status] ?? "slate"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{s.flagged !== undefined ? `${s.flagged}/${s.skus}` : "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{s.needsJudgment ?? "—"}</td>
                      <td className="hidden px-3 py-3 text-slate-500 md:table-cell">{formatDateTime(r.startedAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900" href={href}>
                          Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
