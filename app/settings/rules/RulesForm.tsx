"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/Toast";
import { formatDateTime } from "@/lib/format";

type Row = { key: string; value: number; label: string; help: string; min: number; max: number; integer?: boolean; updatedBy: string | null; updatedAt: string | null };
type Log = { id: number; key: string; oldValue: string | null; newValue: string; changedBy: string; changedAt: string };

export function RulesForm({ initial }: { initial: { rows: Row[]; log: Log[] } }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(initial.rows.map((r) => [r.key, String(r.value)])));
  const [busy, setBusy] = useState(false);
  const labels = Object.fromEntries(initial.rows.map((r) => [r.key, r.label]));

  const fieldError = (r: Row) => {
    const v = Number(values[r.key]);
    if (values[r.key] === "" || !Number.isFinite(v)) return "Enter a number";
    if (v < r.min || v > r.max) return `Between ${r.min} and ${r.max}`;
    if (r.integer && !Number.isInteger(v)) return "Whole number";
    return null;
  };
  const dirty = initial.rows.filter((r) => Number(values[r.key]) !== r.value);
  const hasErrors = initial.rows.some(fieldError);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Rule settings</h1>
        <p className="text-sm text-slate-500">Raghav&apos;s documented rules. The rules engine — not the AI — uses these to set every reorder quantity.</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Changes apply from the next run. Existing runs keep the settings they ran with.</div>
      <Card>
        <CardContent className="divide-y divide-slate-100 pt-2">
          {initial.rows.map((r) => {
            const err = fieldError(r);
            return (
              <div key={r.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_140px] sm:items-center">
                <div>
                  <label htmlFor={r.key} className="text-sm font-medium text-slate-800">
                    {r.label}
                  </label>
                  <p className="text-xs text-slate-500">{r.help}</p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {r.key}
                    {r.updatedBy ? ` · last set by ${r.updatedBy}, ${formatDateTime(r.updatedAt)}` : ""}
                  </p>
                </div>
                <div>
                  <input
                    id={r.key}
                    type="number"
                    step="any"
                    value={values[r.key]}
                    onChange={(e) => setValues({ ...values, [r.key]: e.target.value })}
                    className={`w-full rounded-md border px-3 py-1.5 text-right text-sm tabular-nums ${err ? "border-red-400" : "border-slate-300"}`}
                  />
                  {err && <p className="mt-0.5 text-right text-[11px] text-red-600">{err}</p>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!dirty.length} onClick={() => setValues(Object.fromEntries(initial.rows.map((r) => [r.key, String(r.value)])))}>
          Reset
        </Button>
        <Button
          disabled={!dirty.length || hasErrors || busy}
          onClick={async () => {
            setBusy(true);
            const body = Object.fromEntries(dirty.map((r) => [r.key, Number(values[r.key])]));
            const res = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            setBusy(false);
            if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? "Save failed", "error");
            toast("Saved — applies from the next run");
            router.refresh();
          }}
        >
          {busy ? "Saving…" : `Save ${dirty.length || ""} change${dirty.length === 1 ? "" : "s"}`}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Change log</CardTitle>
        </CardHeader>
        <CardContent>
          {initial.log.length === 0 ? (
            <p className="text-sm text-slate-500">No changes yet — running on the documented defaults.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {initial.log.map((l) => (
                <li key={l.id}>
                  <span className="text-slate-500">{formatDateTime(l.changedAt)}</span> · <b>{l.changedBy}</b> changed {labels[l.key] ?? l.key} from {Number(l.oldValue)} to {Number(l.newValue)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
