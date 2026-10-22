"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload & run" },
  { href: "/purchase-orders", label: "PO drafts" },
  { href: "/settings/rules", label: "Rules" },
];

export function Nav({ user }: { user: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-700 text-xs font-bold text-white">FR</span>
          <span className="hidden sm:inline">Freshroots Demand Copilot</span>
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={cn("rounded-md px-2.5 py-1.5 whitespace-nowrap", active ? "bg-emerald-50 font-medium text-emerald-800" : "text-slate-600 hover:bg-slate-100")}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <span className="hidden text-sm text-slate-600 sm:inline">{user} · Planner</span>
      </div>
    </header>
  );
}
