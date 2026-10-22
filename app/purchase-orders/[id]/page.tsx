import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getPurchaseOrder } from "@/lib/po/store";
import { ACTION_LABEL, PO_STATUS_LABEL, PO_STATUS_TONE, REASON_LABEL, formatDate, formatDateTime } from "@/lib/format";
import { PoActions } from "./PoActions";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const p = await getPurchaseOrder(id);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/purchase-orders" className="text-sm text-slate-500 hover:underline">
          ← All PO drafts
        </Link>
        <PoActions id={p.id} status={p.status} />
      </div>

      <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-8">
        {p.status !== "sent" && (
          <span className="pointer-events-none absolute top-10 right-[-52px] rotate-45 bg-amber-100 px-16 py-1 text-xs font-semibold tracking-widest text-amber-800 uppercase">
            {p.status === "cancelled" ? "Cancelled" : "Draft"}
          </span>
        )}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-700 font-bold text-white">FR</span>
            <div>
              <p className="font-semibold">Freshroots</p>
              <p className="text-xs text-slate-500">Maharashtra & Goa</p>
            </div>
          </div>
          <div className="pr-12 text-right sm:pr-14">
            <h1 className="text-lg font-semibold tracking-tight">Purchase Order</h1>
            <p className="font-mono text-sm">{p.poNumber}</p>
            <div className="mt-1">
              <Badge tone={PO_STATUS_TONE[p.status] ?? "slate"}>{PO_STATUS_LABEL[p.status] ?? p.status}</Badge>
            </div>
          </div>
        </header>

        <section className="grid gap-4 py-5 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</p>
            <p className="font-medium">{p.distributorName}</p>
            <p className="text-slate-600">
              {p.distributorId} · {p.region}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">PO date</p>
            <p>{formatDate(p.poDate)}</p>
            <p className="text-xs text-slate-500">
              Planning run{" "}
              <Link href={`/runs/${p.runId}`} className="no-print text-emerald-700 hover:underline">
                #{p.runId}
              </Link>
              <span className="hidden print:inline">#{p.runId}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prepared by</p>
            <p>{p.createdBy}, Demand Planning</p>
            <p className="text-xs text-slate-500">{formatDateTime(p.createdAt)}</p>
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500 print:bg-white">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Basis</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={l.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{l.skuId}</td>
                  <td className="px-3 py-2.5">{l.skuName}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{l.quantity.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2.5">{l.uom}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {l.wasOverridden ? (
                      <>
                        Planner override (rules: {l.rulesQty}) — {REASON_LABEL[l.reasonCode ?? ""] ?? l.reasonCode}
                        {l.note ? `: ${l.note}` : ""}
                      </>
                    ) : (
                      `${ACTION_LABEL[l.finalAction] ?? l.finalAction} — rules qty approved`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right text-sm font-medium">
                  Total units
                </td>
                <td className="px-3 py-3 text-right text-base font-semibold tabular-nums">{p.totalUnits.toLocaleString("en-IN")}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        <footer className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p>Quantities come from the Freshroots rules engine and were approved or overridden by the planner. Prices are applied by procurement when the PO is issued.</p>
          {p.statusChangedAt && (
            <p>
              {PO_STATUS_LABEL[p.status]} by {p.statusChangedBy} on {formatDateTime(p.statusChangedAt)}.
            </p>
          )}
        </footer>
      </article>

      <details className="no-print rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Zoho Inventory payload (ready for when Zoho is connected)</summary>
        <p className="mt-2 text-xs text-slate-500">
          This is the body that would be sent to <code>POST /inventory/v1/purchaseorders</code>. The placeholders become real Zoho vendor and item ids once the account is linked.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(p.zoho, null, 2)}</pre>
      </details>
    </div>
  );
}
