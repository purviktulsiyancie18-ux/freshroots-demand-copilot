"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, FileText, LayoutDashboard, SlidersHorizontal, Sprout, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export function Nav({ user, reviewPending }: { user: string; reviewPending: number }) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, active: pathname === "/" },
    { href: "/review", label: "Review queue", icon: ClipboardCheck, active: pathname.startsWith("/review") || pathname.startsWith("/runs"), badge: reviewPending },
    { href: "/upload", label: "Upload & run", icon: Upload, active: pathname.startsWith("/upload") },
    { href: "/purchase-orders", label: "PO drafts", icon: FileText, active: pathname.startsWith("/purchase-orders") },
    { href: "/settings/rules", label: "Rules", icon: SlidersHorizontal, active: pathname.startsWith("/settings") },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-brand-950 bg-brand-900/95 text-white shadow-lg shadow-brand-950/20 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-saffron-500 to-amber-600 text-brand-950 shadow-inner">
            <Sprout className="h-4.5 w-4.5" strokeWidth={2.4} />
          </span>
          <span className="hidden leading-tight lg:block">
            <span className="block text-sm font-semibold tracking-tight">Freshroots</span>
            <span className="block text-[10px] font-medium tracking-[0.16em] text-brand-100/60 uppercase">Demand Copilot</span>
          </span>
        </Link>
        <nav className="-mx-1 flex flex-1 gap-0.5 overflow-x-auto px-1 text-sm [scrollbar-width:none]">
          {links.map(({ href, label, icon: Icon, active, badge }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors",
                active ? "bg-white/12 font-medium text-white" : "text-brand-100/75 hover:bg-white/6 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn(!active && "sr-only md:not-sr-only")}>{label}</span>
              {!!badge && (
                <span className="ml-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-brand-950 tabular-nums">{badge}</span>
              )}
              {active && <span className="absolute inset-x-2.5 -bottom-2.5 h-0.5 rounded-full bg-saffron-500" />}
            </Link>
          ))}
        </nav>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs font-semibold ring-1 ring-white/20">{user.slice(0, 1)}</span>
          <span className="hidden leading-tight md:block">
            <span className="block text-xs font-medium">{user}</span>
            <span className="block text-[10px] text-brand-100/60">Demand Planner</span>
          </span>
        </div>
      </div>
    </header>
  );
}
