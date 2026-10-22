"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Point = { runId: number; runDate: string; stockout: number; overstock: number; highDemand: number };

// Validated categorical slots (blue, orange, aqua); identity is never colour-only: legend + labels + table.
export const FLAG_SERIES = [
  { key: "stockout", label: "Stockout risk", color: "var(--color-flag-stockout)" },
  { key: "overstock", label: "Overstock risk", color: "var(--color-flag-overstock)" },
  { key: "highDemand", label: "High demand", color: "var(--color-flag-demand)" },
] as const;

const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function niceMax(n: number) {
  if (n <= 4) return 4;
  const step = n <= 10 ? 2 : n <= 20 ? 5 : 10;
  return Math.ceil(n / step) * step;
}

export function FlagTrendChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = data.map((d) => d.stockout + d.overstock + d.highDemand);
  const max = niceMax(Math.max(1, ...totals));
  const ticks = [0, max / 2, max];
  const H = 168;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {FLAG_SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-medium">
          {["Chart", "Table"].map((v) => (
            <button key={v} onClick={() => setTable(v === "Table")} className={cn("rounded-md px-2 py-0.5", (v === "Table") === table ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {table ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1.5 font-medium">Run</th>
              {FLAG_SERIES.map((s) => (
                <th key={s.key} className="py-1.5 text-right font-medium">
                  {s.label}
                </th>
              ))}
              <th className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((d, i) => (
              <tr key={d.runId} className="border-t border-slate-100">
                <td className="py-1.5">
                  #{d.runId} · {shortDate(d.runDate)}
                </td>
                <td className="py-1.5 text-right">{d.stockout}</td>
                <td className="py-1.5 text-right">{d.overstock}</td>
                <td className="py-1.5 text-right">{d.highDemand}</td>
                <td className="py-1.5 text-right font-medium">{totals[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative pl-7">
          {/* gridlines */}
          <div className="absolute inset-x-0 top-0 left-7" style={{ height: H }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-slate-100" style={{ bottom: (t / max) * H }}>
                <span className="absolute -left-7 -translate-y-1/2 text-[10px] text-slate-400 tabular-nums">{t}</span>
              </div>
            ))}
          </div>
          <div className="relative flex items-end justify-around gap-1" style={{ height: H }}>
            {data.map((d, i) => {
              const segs = FLAG_SERIES.map((s) => ({ ...s, v: d[s.key] })).filter((s) => s.v > 0);
              return (
                <div
                  key={d.runId}
                  className="group relative flex h-full flex-1 cursor-default items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {hover === i && <div className="absolute inset-y-0 -inset-x-0.5 rounded-md bg-slate-900/[0.035]" />}
                  <div className="relative flex w-full max-w-6 flex-col-reverse gap-[2px]" style={{ height: (totals[i] / max) * H }}>
                    {segs.map((s, k) => (
                      <div key={s.key} className={cn("w-full", k === segs.length - 1 && "rounded-t-[4px]")} style={{ flex: s.v, background: s.color }} />
                    ))}
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-medium text-slate-700 tabular-nums">{totals[i]}</span>
                  </div>
                  {hover === i && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-xl bg-slate-900 p-3 text-xs text-white shadow-xl">
                      <p className="mb-1.5 font-medium">
                        Run #{d.runId} · {shortDate(d.runDate)}
                      </p>
                      {FLAG_SERIES.map((s) => (
                        <p key={s.key} className="flex items-center justify-between gap-2 text-slate-300">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                            {s.label}
                          </span>
                          <span className="font-medium text-white tabular-nums">{d[s.key]}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-around gap-1">
            {data.map((d) => (
              <Link key={d.runId} href={`/runs/${d.runId}`} className="flex-1 text-center text-[11px] text-slate-500 hover:text-brand-700">
                {shortDate(d.runDate)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
