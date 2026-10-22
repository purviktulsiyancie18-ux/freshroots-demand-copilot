"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import { UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

type Issue = { level: string; sheet: string | null; row: number | null; column: string | null; message: string };
type LogRow = { id: number; sheet: string | null; rowNum: number | null; columnName: string | null; before: string | null; after: string | null; fixType: string | null; level: string; message: string | null };
type Run = {
  id: number;
  runDate: string;
  status: string;
  error: { errors?: Issue[]; warnings?: Issue[]; message?: string } | null;
  summary: { fixesApplied?: number; warnings?: number; missingWeeks?: number; cleaningSource?: string; flagged?: number; skus?: number; needsJudgment?: number; aiErrors?: string[] } | null;
  counts: { total: number };
};

const STEPS = ["Parsing", "Cleaning", "Validation", "Rules", "AI", "Ready"];
const STEP_OF: Record<string, number> = { parsing: 0, cleaning: 1, failed_validation: 2, rules: 3, ai: 4, ready_for_review: 5, completed: 5 };
const TERMINAL = ["failed_validation", "ready_for_review", "completed", "failed"];

function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function Tracker({ status }: { status: string }) {
  const current = STEP_OF[status] ?? 0;
  const failed = status === "failed_validation" || status === "failed";
  const done = status === "ready_for_review" || status === "completed";
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      {STEPS.map((s, i) => {
        const state = done || i < current ? "done" : i === current ? (failed ? "failed" : "active") : "todo";
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium",
                state === "done" && "bg-brand-50 text-brand-800",
                state === "active" && "bg-blue-50 text-blue-800",
                state === "failed" && "bg-red-50 text-red-700",
                state === "todo" && "bg-slate-100 text-slate-500",
              )}
            >
              {state === "done" ? "✓" : state === "failed" ? "✕" : state === "active" ? <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" /> : i + 1}
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function IssueTable({ issues }: { issues: Issue[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Sheet</th>
            <th className="py-1.5 pr-3 font-medium">Row</th>
            <th className="py-1.5 pr-3 font-medium">Column</th>
            <th className="py-1.5 font-medium">Message</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((e, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <td className="py-1.5 pr-3 font-mono text-xs">{e.sheet ?? "—"}</td>
              <td className="py-1.5 pr-3 tabular-nums">{e.row ?? "—"}</td>
              <td className="py-1.5 pr-3 font-mono text-xs">{e.column ?? "—"}</td>
              <td className="py-1.5">{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [runDate, setRunDate] = useState(todayLocal);
  const [runId, setRunId] = useState<number | null>(params.get("run") ? Number(params.get("run")) : null);
  const [run, setRun] = useState<Run | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchRun = useCallback(async (id: number) => {
    const res = await fetch(`/api/runs/${id}?log=1`);
    if (!res.ok) return null;
    const data = (await res.json()) as { run: Run; log: LogRow[] };
    setRun(data.run);
    setLog(data.log ?? []);
    return data.run;
  }, []);

  // Poll every 2s while the run is in progress.
  useEffect(() => {
    if (!runId) return;
    let stop = false;
    const tick = async () => {
      const r = await fetchRun(runId);
      if (!stop && r && !TERMINAL.includes(r.status)) setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [runId, fetchRun]);

  const execute = async (id: number) => {
    const res = await fetch(`/api/runs/${id}/execute`, { method: "POST" });
    if (!res.ok) toast((await res.json().catch(() => ({}))).error ?? "The run failed", "error");
    await fetchRun(id);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (picked.length !== list.length) toast("Only .xlsx and .csv files are accepted", "error");
    setFiles((prev) => {
      const merged = [...prev.filter((p) => !picked.some((n) => n.name === p.name)), ...picked];
      return merged;
    });
  };

  const start = async () => {
    setBusy(true);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("runDate", runDate);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      toast(data.error ?? "Upload failed", "error");
      return;
    }
    setRunId(data.runId);
    router.replace(`/upload?run=${data.runId}`);
    await execute(data.runId);
    setBusy(false);
  };

  const reset = () => {
    setRunId(null);
    setRun(null);
    setLog([]);
    setFiles([]);
    router.replace("/upload");
  };

  const xlsxCount = files.filter((f) => /\.xlsx?$/i.test(f.name)).length;
  const fileError =
    xlsxCount > 1 || (xlsxCount && files.length > 1) ? "Upload one .xlsx, or up to 5 .csv files — not both." : files.length > 5 ? "At most 5 .csv files." : null;
  const errors = run?.error?.errors ?? [];
  const warnings = run?.error?.warnings ?? [];
  const logWarnings = log.filter((l) => l.level === "warning" || l.level === "missing");
  const applied = log.filter((l) => l.level === "applied");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Every Monday & Thursday"
        title="Upload & run"
        description="Drop this week's SAP export. Gemini proposes cleaning fixes, code applies and validates them, and the rules engine sets every quantity."
      />

      {!runId && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all",
                drag ? "scale-[1.01] border-brand-600 bg-brand-50" : "border-slate-300 bg-slate-50/50 hover:border-brand-600/60 hover:bg-brand-50/40",
              )}
            >
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-200 transition group-hover:-translate-y-0.5">
                <UploadCloud className="h-6 w-6" />
              </span>
              <p className="font-medium">Drag files here or click to choose</p>
              <p className="mt-1 text-sm text-slate-500">One .xlsx with 5 sheets, or 5 .csv files: sku_master, distributor_master, weekly_sales, current_inventory, calendar</p>
              <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center justify-between px-3 py-2">
                    <span className="truncate font-mono text-xs">{f.name}</span>
                    <span className="flex items-center gap-3 text-xs text-slate-500">
                      {(f.size / 1024).toFixed(1)} KB
                      <button className="text-slate-400 hover:text-red-600" onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Remove ${f.name}`}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {fileError && <p className="text-sm text-red-600">{fileError}</p>}
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-sm">
                <span className="block font-medium text-slate-700">Run date</span>
                <input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
              </label>
              <Button size="lg" onClick={start} disabled={!files.length || !!fileError || busy || !runDate}>
                {busy ? "Starting…" : "Run forecast"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {runId && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>
              Run #{runId}
              {run && <span className="ml-2 font-normal text-slate-500">· run date {run.runDate}</span>}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={reset}>
              New upload
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {run ? <Tracker status={run.status} /> : <p className="text-sm text-slate-500">Loading…</p>}

            {run?.status === "parsing" && !busy && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-600">This run was uploaded but hasn&apos;t started.</span>
                <Button size="sm" onClick={() => execute(runId)}>
                  Start run
                </Button>
              </div>
            )}

            {run && !TERMINAL.includes(run.status) && run.status !== "parsing" && (
              <p className="text-sm text-slate-600">Working… this takes under a minute for a normal upload. You can leave this page; the run continues.</p>
            )}

            {run?.status === "failed_validation" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="font-medium text-red-800">Validation failed — {errors.length} error{errors.length === 1 ? "" : "s"}. Nothing was saved to the clean tables.</p>
                  <p className="mt-1 text-sm text-red-700">Fix these in the file and upload again. Each upload is a new run.</p>
                </div>
                <IssueTable issues={errors} />
                {warnings.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-amber-700">{warnings.length} warning(s)</summary>
                    <div className="mt-2">
                      <IssueTable issues={warnings} />
                    </div>
                  </details>
                )}
                <Button onClick={reset}>Upload corrected files</Button>
              </div>
            )}

            {run?.status === "failed" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                The run stopped with an unexpected error: {run.error?.message ?? "unknown"}. Try again; if it repeats, check the Vercel logs.
              </div>
            )}

            {(run?.status === "ready_for_review" || run?.status === "completed") && (
              <div className="space-y-4">
                <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                  <p className="font-medium text-brand-900">
                    {run.summary?.fixesApplied ?? applied.length} fixes applied, {run.summary?.warnings ?? 0} warning{run.summary?.warnings === 1 ? "" : "s"}
                    {run.summary?.missingWeeks ? `, ${run.summary.missingWeeks} missing week(s) excluded` : ""}.
                  </p>
                  <p className="mt-1 text-sm text-brand-800">
                    {run.summary?.flagged ?? "—"} of {run.summary?.skus ?? run.counts.total} SKUs flagged · {run.summary?.needsJudgment ?? "—"} need your judgment
                    {run.summary?.cleaningSource === "fallback" && " · Gemini cleaning unavailable, deterministic header matching used"}
                    {run.summary?.aiErrors?.length ? " · AI forecast unavailable for some SKUs (tagged Needs judgment)" : ""}
                  </p>
                </div>
                <Link href={`/runs/${runId}`} className="inline-flex h-11 items-center rounded-md bg-brand-700 px-6 font-medium text-white hover:bg-brand-800">
                  Open review queue →
                </Link>
              </div>
            )}

            {log.length > 0 && (
              <div>
                <button className="text-sm font-medium text-slate-700 hover:underline" onClick={() => setShowLog(!showLog)}>
                  {showLog ? "▾" : "▸"} Cleaning log ({applied.length} applied, {logWarnings.length} warnings/missing)
                </button>
                {showLog && (
                  <div className="mt-2 max-h-96 overflow-auto rounded-md border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Level</th>
                          <th className="px-2 py-1.5 font-medium">Sheet</th>
                          <th className="px-2 py-1.5 font-medium">Row</th>
                          <th className="px-2 py-1.5 font-medium">Column</th>
                          <th className="px-2 py-1.5 font-medium">Before → After</th>
                          <th className="px-2 py-1.5 font-medium">Rule / message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {log.map((l) => (
                          <tr key={l.id} className="border-t border-slate-100 align-top">
                            <td className="px-2 py-1">
                              <Badge tone={l.level === "applied" ? "green" : l.level === "error" ? "red" : "amber"}>{l.level}</Badge>
                            </td>
                            <td className="px-2 py-1 font-mono">{l.sheet ?? "—"}</td>
                            <td className="px-2 py-1 tabular-nums">{l.rowNum ?? "—"}</td>
                            <td className="px-2 py-1 font-mono">{l.columnName ?? "—"}</td>
                            <td className="px-2 py-1 font-mono">{l.before !== null || l.after !== null ? `${l.before ?? ""} → ${l.after ?? ""}` : "—"}</td>
                            <td className="px-2 py-1">
                              {l.fixType && <span className="mr-1 font-mono text-slate-500">[{l.fixType}]</span>}
                              {l.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadInner />
    </Suspense>
  );
}
