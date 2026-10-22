"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";

export function PoActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

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
        Print / Save PDF
      </Button>
      <a href={`/api/purchase-orders/${id}/csv`} className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50">
        Download CSV
      </a>
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
