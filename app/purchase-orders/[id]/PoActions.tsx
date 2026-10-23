"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Download, ExternalLink, Eye, Printer, Send, XCircle } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

type Props = { id: number; status: string; zohoUrl: string | null; zohoMissing: string[]; compact?: boolean };

/** Every PO action. `compact` renders icon buttons for list rows; the full version sits on the PO page. */
export function PoActions({ id, status, zohoUrl, zohoMissing, compact }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pushToZoho = async () => {
    setBusy(true);
    const res = await fetch(`/api/purchase-orders/${id}/zoho`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(data.error ?? "Zoho push failed", "error");
    toast(data.alreadyPushed ? "Already in Zoho" : "Draft PO created in Zoho Inventory");
    router.refresh();
  };

  const setStatus = async (next: "sent" | "cancelled", confirmText: string) => {
    if (!confirm(confirmText)) return;
    setBusy(true);
    const res = await fetch(`/api/purchase-orders/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    setBusy(false);
    if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? "Update failed", "error");
    toast(next === "sent" ? "Marked as sent to procurement" : "PO draft cancelled");
    router.refresh();
  };

  const zohoTitle = zohoMissing.length ? `Zoho not connected yet (missing ${zohoMissing.join(", ")})` : "Push to Zoho: create this PO as a draft in Zoho Inventory";
  const cancel = () => setStatus("cancelled", "Cancel this PO draft? Its lines can then go on a new draft.");
  const markSent = () => setStatus("sent", "Mark this PO as sent to procurement?");

  if (compact) {
    const icon = "inline-grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Link href={`/purchase-orders/${id}`} className={icon} title="View PO" aria-label="View PO">
          <Eye className="h-4 w-4" />
        </Link>
        <Link href={`/purchase-orders/${id}?print=1`} className={icon} title="Print / Save PDF" aria-label="Print or save as PDF">
          <Printer className="h-4 w-4" />
        </Link>
        <a href={`/api/purchase-orders/${id}/csv`} className={icon} title="Download CSV" aria-label="Download CSV">
          <Download className="h-4 w-4" />
        </a>
        {zohoUrl ? (
          <a href={zohoUrl} target="_blank" rel="noreferrer" className={cn(icon, "text-brand-700 hover:bg-brand-50 hover:text-brand-800")} title="Open in Zoho" aria-label="Open in Zoho">
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <button className={icon} onClick={pushToZoho} disabled={busy || status === "cancelled" || zohoMissing.length > 0} title={status === "cancelled" ? "Cancelled POs can't go to Zoho" : zohoTitle} aria-label="Push to Zoho">
            <Send className="h-4 w-4" />
          </button>
        )}
        <button className={cn(icon, "hover:bg-red-50 hover:text-red-600")} onClick={cancel} disabled={busy || status !== "draft"} title={status === "draft" ? "Cancel draft" : "Only drafts can be cancelled"} aria-label="Cancel draft">
          <XCircle className="h-4 w-4" />
        </button>
        {status === "draft" ? (
          <Button size="sm" className="ml-1.5" onClick={markSent} disabled={busy} title="Mark sent to procurement">
            <Check className="h-3.5 w-3.5" /> Mark sent
          </Button>
        ) : (
          <span className="ml-1.5 inline-flex h-8 w-[92px] items-center justify-center text-[11px] text-slate-400">{status === "sent" ? "Sent" : "Cancelled"}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" /> Print / Save PDF
      </Button>
      <a href={`/api/purchase-orders/${id}/csv`} className={buttonClass("outline", "sm")}>
        <Download className="h-3.5 w-3.5" /> Download CSV
      </a>
      {zohoUrl ? (
        <a href={zohoUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
          <ExternalLink className="h-3.5 w-3.5" /> Open in Zoho
        </a>
      ) : status !== "cancelled" ? (
        <Button size="sm" variant="outline" disabled={busy || zohoMissing.length > 0} onClick={pushToZoho} title={zohoTitle}>
          <Send className="h-3.5 w-3.5" /> Push to Zoho
        </Button>
      ) : null}
      {status === "draft" && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={cancel}>
            Cancel draft
          </Button>
          <Button size="sm" disabled={busy} onClick={markSent}>
            Mark sent to procurement
          </Button>
        </>
      )}
    </div>
  );
}

/** Opens the print dialog once when the page is reached with ?print=1 (the list's Print button). */
export function AutoPrint({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      window.print();
      router.replace(window.location.pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [enabled, router]);
  return null;
}
