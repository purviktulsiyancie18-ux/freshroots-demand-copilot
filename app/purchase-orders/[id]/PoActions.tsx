"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { Download, ExternalLink, Printer, Send } from "lucide-react";
import { useToast } from "@/components/Toast";

export function PoActions({ id, status, zohoUrl, zohoMissing }: { id: number; status: string; zohoUrl: string | null; zohoMissing: string[] }) {
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
        <Button
          size="sm"
          variant="outline"
          disabled={busy || zohoMissing.length > 0}
          onClick={pushToZoho}
          title={zohoMissing.length ? `Zoho not connected yet — missing ${zohoMissing.join(", ")}` : "Create this PO as a draft in Zoho Inventory"}
        >
          <Send className="h-3.5 w-3.5" /> Push to Zoho
        </Button>
      ) : null}
      {status === "draft" && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("cancelled", "Cancel this PO draft? Its lines can then go on a new draft.")}>
            Cancel draft
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setStatus("sent", "Mark this PO as sent to procurement?")}>
            Mark sent to procurement
          </Button>
        </>
      )}
    </div>
  );
}
