import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listPurchaseOrders } from "@/lib/po/store";
import { PO_STATUS_LABEL, PO_STATUS_TONE, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent to procurement" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status ?? "";
  const all = await listPurchaseOrders();
  const pos = status ? all.filter((p) => p.status === status) : all;
  const count = (k: string) => (k ? all.filter((p) => p.status === k).length : all.length);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Procurement"
        title="PO drafts"
        description="One draft purchase order per distributor, built from the reorders Raghav approved. Procurement issues them; nothing is ordered automatically."
      />

      <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-200/50 p-1 sm:w-fit">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/purchase-orders?status=${f.key}` : "/purchase-orders"}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition", status === f.key ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
          >
            {f.label} <span className="rounded-full bg-white/70 px-1.5 text-[11px] tabular-nums text-slate-500">{count(f.key)}</span>
          </Link>
        ))}
      </div>

      {pos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {all.length === 0 ? (
            <>
              No PO drafts yet. Approve reorders in a <Link href="/" className="text-brand-700 hover:underline">run&apos;s review queue</Link>, then click <b>Create PO drafts</b>.
            </>
          ) : (
            "No POs with this status."
          )}
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">PO number</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Distributor</th>
                  <th className="px-3 py-2 text-right font-medium">Lines</th>
                  <th className="px-3 py-2 text-right font-medium">Units</th>
                  <th className="px-3 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <Link href={`/purchase-orders/${p.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {p.poNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{formatDate(p.poDate)}</td>
                    <td className="px-3 py-2.5">
                      {p.distributorName}
                      <span className="block text-[11px] text-slate-400">
                        {p.distributorId} · {p.region}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {p.lineCount}
                      {p.overriddenLines > 0 && <span className="block text-[11px] text-blue-700">{p.overriddenLines} overridden</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{p.totalUnits.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/runs/${p.runId}`} className="text-slate-600 hover:underline">
                        #{p.runId}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={PO_STATUS_TONE[p.status] ?? "slate"}>{PO_STATUS_LABEL[p.status] ?? p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-3 md:hidden">
            {pos.map((p) => (
              <Link key={p.id} href={`/purchase-orders/${p.id}`} className="block">
                <Card className="space-y-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-brand-700">{p.poNumber}</span>
                    <Badge tone={PO_STATUS_TONE[p.status] ?? "slate"}>{PO_STATUS_LABEL[p.status] ?? p.status}</Badge>
                  </div>
                  <p className="text-sm">{p.distributorName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(p.poDate)} · {p.lineCount} lines · {p.totalUnits.toLocaleString("en-IN")} units
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
