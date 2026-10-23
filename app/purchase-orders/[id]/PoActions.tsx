"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Download, ExternalLink, Eye, Printer, Send, XCircle } from "lucide-react";
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
    const zohoItem = zohoUrl
      ? { label: "Open in Zoho", hint: "View this PO in Zoho Inventory", icon: ExternalLink, href: zohoUrl, external: true }
      : {
          label: "Push to Zoho",
          hint: status === "cancelled" ? "Cancelled POs can't go to Zoho" : zohoMissing.length ? "Zoho not connected yet" : "Create it as a draft in Zoho Inventory",
          icon: Send,
          onSelect: pushToZoho,
          disabled: status === "cancelled" || zohoMissing.length > 0,
        };
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Link href={`/purchase-orders/${id}`} className={icon} title="View PO" aria-label="View PO">
          <Eye className="h-4 w-4" />
        </Link>
        <a href={`/api/purchase-orders/${id}/csv`} className={icon} title="Download CSV" aria-label="Download CSV">
          <Download className="h-4 w-4" />
        </a>
        <button className={cn(icon, "hover:bg-red-50 hover:text-red-600")} onClick={cancel} disabled={busy || status !== "draft"} title={status === "draft" ? "Cancel draft" : "Only drafts can be cancelled"} aria-label="Cancel draft">
          <XCircle className="h-4 w-4" />
        </button>
        <ActionsMenu
          busy={busy}
          primary={status === "draft"}
          items={[
            { label: "Print / Save PDF", hint: "Opens the PO and the print dialog", icon: Printer, href: `/purchase-orders/${id}?print=1` },
            zohoItem,
            {
              label: "Mark sent to procurement",
              hint: status === "draft" ? "Hand this PO to procurement" : status === "sent" ? "Already sent" : "Cancelled POs can't be sent",
              icon: Check,
              onSelect: markSent,
              disabled: status !== "draft",
            },
          ]}
        />
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

type MenuItem = {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
};

/** Primary row CTA: a dropdown rendered with fixed positioning so the scrolling table can't clip it. */
function ActionsMenu({ items, busy, primary }: { items: MenuItem[]; busy: boolean; primary: boolean }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "mousedown" && (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menu.current?.querySelector<HTMLElement>("a,button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  };

  const row = "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <>
      <Button ref={btn} size="sm" variant={primary ? "default" : "outline"} className="ml-1.5 w-[104px]" onClick={toggle} disabled={busy} aria-haspopup="menu" aria-expanded={!!pos}>
        Actions <ChevronDown className={cn("h-3.5 w-3.5 transition", pos && "rotate-180")} />
      </Button>
      {pos && (
        <div ref={menu} role="menu" className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10" style={{ top: pos.top, right: pos.right }}>
          {items.map((it) => {
            const body = (
              <>
                <it.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{it.label}</span>
                  <span className="block text-xs text-slate-500">{it.hint}</span>
                </span>
              </>
            );
            return it.href && !it.disabled ? (
              <a key={it.label} role="menuitem" href={it.href} target={it.external ? "_blank" : undefined} rel={it.external ? "noreferrer" : undefined} className={row} onClick={() => setPos(null)}>
                {body}
              </a>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className={row}
                disabled={it.disabled || busy}
                onClick={() => {
                  setPos(null);
                  it.onSelect?.();
                }}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
