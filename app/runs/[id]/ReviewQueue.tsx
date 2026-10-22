"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/Sparkline";
import { useToast } from "@/components/Toast";
import { ACTION_LABEL, FLAG_LABEL, FLAG_TONE, REASON_LABEL, TRIGGER_LABEL, fmt1, fmt2, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Rec = {
  id: number;
  skuId: string;
  name: string;
  perishability: string;
  category: string;
  standardReorderQty: number;
  avg4: number;
  avg12: number;
  isFestival: boolean;
  adjustedWeekly: number;
  unitsOnHand: number;
  weeksOfCover: number | null;
  flags: string[];
  action: string;
  recommendedQty: number;
  ruleTrace: string;
  needsJudgmentByRule: boolean;
  forecastWeekly: number[] | null;
  aiReason: string | null;
  aiTag: string | null;
  aiJudgmentReason: string | null;
  aiConfidence: string | null;
  aiUnavailable: boolean;
  finalTag: string;
  judgmentTriggers: string[];
  status: string;
  finalAction: string | null;
  finalQty: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
};
type Override = { id: number; createdAt: string; originalAction: string; originalQty: number; newAction: string; newQty: number; reasonCode: string; note: string | null; createdBy: string };
type Ctx = { sales: Record<string, { week: string; units: number }[]>; notes: Record<string, string[]>; history: Record<string, Override[]> };
type RunInfo = { id: number; runDate: string; status: string; isFestival: boolean; counts: { total: number; needsJudgment: number; standard: number; noAction: number; flagged: number; pendingReview: number; exportable: number } };

const TABS = [
  { key: "needs_judgment", label: "Needs judgment" },
  { key: "standard", label: "Standard" },
  { key: "no_action", label: "No action" },
  { key: "all", label: "All" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ACTIONS = ["REORDER_NOW", "REORDER_INCREASED", "PAUSE_NEXT_ORDER", "NO_ACTION"];

function inTab(r: Rec, t: TabKey) {
  if (t === "needs_judgment") return r.finalTag === "NEEDS_JUDGMENT";
  if (t === "standard") return r.finalTag === "STANDARD" && r.action !== "NO_ACTION";
  if (t === "no_action") return r.finalTag === "STANDARD" && r.action === "NO_ACTION";
  return true;
}

function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Badge key={f} tone={FLAG_TONE[f] ?? "slate"}>
          {FLAG_LABEL[f] ?? f}
        </Badge>
      ))}
    </div>
  );
}

function TagChips({ r }: { r: Rec }) {
  return (
    <div className="flex flex-wrap gap-1">
      {r.finalTag === "NEEDS_JUDGMENT" ? <Badge tone="violet">Needs judgment</Badge> : <Badge tone="green">Standard</Badge>}
      {r.judgmentTriggers.map((t) => (
        <Badge key={t} tone="slate" title={t === "AI_TAG" && r.aiJudgmentReason ? r.aiJudgmentReason : undefined}>
          {TRIGGER_LABEL[t] ?? t}
        </Badge>
      ))}
    </div>
  );
}

function StatusCell({ r }: { r: Rec }) {
  if (r.status === "pending") return <Badge tone="amber">Pending</Badge>;
  return (
    <div className="space-y-0.5">
      <Badge tone={r.status === "approved" ? "green" : "blue"}>{r.status === "approved" ? "Approved" : "Overridden"}</Badge>
      {r.status === "overridden" && (
        <p className="text-[11px] text-slate-600">
          → {ACTION_LABEL[r.finalAction ?? ""] ?? r.finalAction} {r.finalQty}
        </p>
      )}
      <p className="text-[11px] text-slate-400">{r.decidedBy}</p>
    </div>
  );
}

function Demand({ r }: { r: Rec }) {
  const pct = r.avg12 ? ((r.avg4 / r.avg12 - 1) * 100).toFixed(1) : "—";
  return (
    <span className="tabular-nums">
      {fmt1(r.avg4)} <span className="text-slate-400">vs</span> {fmt1(r.avg12)}
      <span className={cn("ml-1 text-[11px]", Number(pct) > 20 ? "text-blue-700" : "text-slate-500")}>({Number(pct) > 0 ? "+" : ""}{pct}%)</span>
    </span>
  );
}

function Detail({ r, ctx }: { r: Rec; ctx: Ctx }) {
  const history = ctx.history[r.skuId] ?? [];
  const notes = ctx.notes[r.skuId] ?? [];
  return (
    <div className="grid gap-5 bg-slate-50/60 p-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sales (16 weeks) & AI forecast (next 4)</h4>
          <Sparkline sales={ctx.sales[r.skuId] ?? []} forecast={r.forecastWeekly} />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Rule trace</h4>
          <p className="rounded-md bg-white p-2 font-mono text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200">{r.ruleTrace}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Standard reorder qty {r.standardReorderQty} · on hand {r.unitsOnHand} · weekly demand used {fmt1(r.adjustedWeekly)}
            {r.isFestival ? " (festival uplift applied)" : ""}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">AI explanation</h4>
          {r.aiUnavailable ? (
            <p className="text-sm text-slate-500">AI was unavailable for this SKU — the rules result above is still valid. Tagged Needs judgment.</p>
          ) : (
            <div className="space-y-1 text-sm">
              <p>{r.aiReason}</p>
              {r.aiJudgmentReason && <p className="text-violet-700">Why judgment: {r.aiJudgmentReason}</p>}
              <p className="text-[11px] text-slate-500">Confidence: {r.aiConfidence}</p>
            </div>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cleaning notes</h4>
          {notes.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-700">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No warnings for this SKU.</p>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Your last overrides for this SKU</h4>
          {history.length ? (
            <ul className="space-y-1 text-xs">
              {history.map((h) => (
                <li key={h.id} className="rounded bg-white px-2 py-1 ring-1 ring-slate-200">
                  <span className="text-slate-500">{formatDateTime(h.createdAt)}</span> · {ACTION_LABEL[h.originalAction]} {h.originalQty} → <b>{ACTION_LABEL[h.newAction]} {h.newQty}</b> · {REASON_LABEL[h.reasonCode] ?? h.reasonCode}
                  {h.note ? ` — “${h.note}”` : ""} <span className="text-slate-400">({h.createdBy})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">None yet. Overrides are fed to the AI on the next run.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function OverrideModal({ r, reasonCodes, onClose, onSaved }: { r: Rec; reasonCodes: string[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [action, setAction] = useState(r.action);
  const [qty, setQty] = useState(String(r.recommendedQty));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const qtyNum = Number(qty);
  const qtyOk = qty !== "" && Number.isInteger(qtyNum) && qtyNum >= 0;
  const valid = qtyOk && reason && (reason !== "OTHER" || note.trim());

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ovr-title" className="w-full max-w-md rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="ovr-title" className="text-base font-semibold">
          Override {r.skuId} · {r.name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Rules recommend <b>{ACTION_LABEL[r.action]}</b>
          {r.recommendedQty ? ` · ${r.recommendedQty} units` : ""}. Your reason is saved and given to the AI next run.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            const res = await fetch(`/api/recommendations/${r.id}/override`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ newAction: action, newQty: qtyNum, reasonCode: reason, note: note.trim() || null }),
            });
            setBusy(false);
            if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? "Override failed", "error");
            toast(`${r.skuId} overridden`);
            onSaved();
          }}
        >
          <label className="block text-sm">
            <span className="font-medium text-slate-700">New action</span>
            <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">New quantity (units)</span>
            <input type="number" min={0} step={1} inputMode="numeric" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={qty} onChange={(e) => setQty(e.target.value)} />
            {!qtyOk && <span className="text-xs text-red-600">Whole number ≥ 0</span>}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Reason (required)</span>
            <select required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {reasonCodes.map((c) => (
                <option key={c} value={c}>
                  {REASON_LABEL[c] ?? c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Note {reason === "OTHER" ? "(required)" : "(optional)"}</span>
            <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Distributor running a Diwali scheme" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || busy}>
              {busy ? "Saving…" : "Save override"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ReviewQueue({ run, recs, ctx, reasonCodes }: { run: RunInfo; recs: Rec[]; ctx: Ctx; reasonCodes: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>(run.counts.needsJudgment > 0 ? "needs_judgment" : "standard");
  const [open, setOpen] = useState<number | null>(null);
  const [overriding, setOverriding] = useState<Rec | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const rows = useMemo(() => recs.filter((r) => inTab(r, tab)), [recs, tab]);
  const pendingStandard = recs.filter((r) => r.finalTag === "STANDARD" && r.action !== "NO_ACTION" && r.status === "pending").length;
  const counts = { needs_judgment: run.counts.needsJudgment, standard: run.counts.standard, no_action: run.counts.noAction, all: run.counts.total };

  const approve = async (r: Rec) => {
    setBusyId(r.id);
    const res = await fetch(`/api/recommendations/${r.id}/approve`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? "Approve failed", "error");
    toast(`${r.skuId} approved`);
    router.refresh();
  };

  const approveStandard = async () => {
    if (!confirm(`Approve all ${pendingStandard} pending Standard recommendations as the rules suggest?`)) return;
    const res = await fetch(`/api/runs/${run.id}/approve-standard`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error ?? "Bulk approve failed", "error");
    toast(`${data.approved} Standard recommendations approved`);
    router.refresh();
  };

  const actions = (r: Rec) =>
    r.status === "pending" ? (
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => approve(r)} disabled={busyId === r.id}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOverriding(r)}>
          Override
        </Button>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">Review queue · {formatDate(run.runDate)}</h1>
            {run.isFestival && <Badge tone="orange">Festival month · ×uplift applied</Badge>}
            <Badge tone={run.status === "completed" ? "green" : "amber"}>{run.status === "completed" ? "Completed" : `${run.counts.pendingReview} to review`}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Run #{run.id} · {run.counts.flagged} of {run.counts.total} SKUs flagged · <span className="text-violet-700">{run.counts.needsJudgment} need judgment</span> · {run.counts.standard} standard · {run.counts.noAction} no action
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pendingStandard > 0 && (
            <Button variant="outline" onClick={approveStandard}>
              Approve all Standard ({pendingStandard})
            </Button>
          )}
          {run.counts.exportable > 0 ? (
            <a href={`/api/runs/${run.id}/export`} className="inline-flex h-9 items-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800">
              Export approved CSV ({run.counts.exportable})
            </a>
          ) : (
            <Button disabled title="Approve at least one actionable SKU first">
              Export approved CSV
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap", tab === t.key ? "border-emerald-700 font-medium text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800")}
          >
            {t.label} <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs tabular-nums text-slate-600">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {tab === "needs_judgment" ? "Nothing needs your judgment in this run." : "No SKUs in this tab."}
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                  <th className="px-3 py-2 text-right font-medium">Cover (wks)</th>
                  <th className="px-3 py-2 font-medium">avg4 vs avg12</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">AI reason</th>
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className={cn("border-t border-slate-100 align-top", open === r.id && "bg-slate-50/60")}>
                      <td className="px-3 py-2.5">
                        <button className="text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                          <span className="mr-1 text-slate-400">{open === r.id ? "▾" : "▸"}</span>
                          <span className="font-mono text-xs font-semibold">{r.skuId}</span>
                          <span className="block max-w-[180px] text-xs text-slate-600">{r.name}</span>
                          <span className="text-[11px] text-slate-400">{r.perishability} perishability</span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <Flags flags={r.flags} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt2(r.weeksOfCover)}</td>
                      <td className="px-3 py-2.5 text-xs">
                        <Demand r={r} />
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium">{ACTION_LABEL[r.action]}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.recommendedQty}</td>
                      <td className="max-w-[280px] px-3 py-2.5 text-xs text-slate-700">{r.aiUnavailable ? <span className="text-slate-400">AI unavailable</span> : r.aiReason}</td>
                      <td className="px-3 py-2.5">
                        <TagChips r={r} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusCell r={r} />
                      </td>
                      <td className="px-3 py-2.5">{actions(r)}</td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <Detail r={r} ctx={ctx} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {rows.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs font-semibold">{r.skuId}</p>
                      <p className="text-sm">{r.name}</p>
                      <p className="text-[11px] text-slate-400">{r.perishability} perishability</p>
                    </div>
                    <StatusCell r={r} />
                  </div>
                  <Flags flags={r.flags} />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Action</p>
                      <p className="font-medium">
                        {ACTION_LABEL[r.action]} {r.recommendedQty ? `· ${r.recommendedQty}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Cover</p>
                      <p className="tabular-nums">{fmt2(r.weeksOfCover)} wks</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-500">avg4 vs avg12</p>
                      <Demand r={r} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-700">{r.aiUnavailable ? "AI unavailable" : r.aiReason}</p>
                  <TagChips r={r} />
                  <div className="flex items-center justify-between pt-1">
                    {actions(r) ?? <span />}
                    <button className="text-xs text-emerald-700" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      {open === r.id ? "Hide details" : "Details"}
                    </button>
                  </div>
                </div>
                {open === r.id && <Detail r={r} ctx={ctx} />}
              </Card>
            ))}
          </div>
        </>
      )}

      {overriding && (
        <OverrideModal
          r={overriding}
          reasonCodes={reasonCodes}
          onClose={() => setOverriding(null)}
          onSaved={() => {
            setOverriding(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
