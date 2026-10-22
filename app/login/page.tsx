"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [name, setName] = useState("Raghav");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
        setBusy(false);
        if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Sign-in failed");
        router.push(next.startsWith("/") ? next : "/");
        router.refresh();
      }}
    >
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Your name</span>
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
        <span className="mt-1 block text-xs text-slate-500">Recorded on every approval and override.</span>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Team password</span>
        <input type="password" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-700 font-bold text-white">FR</span>
        <div>
          <h1 className="text-lg font-semibold">Freshroots Demand Copilot</h1>
          <p className="text-sm text-slate-500">Rules compute. AI explains. You decide.</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
