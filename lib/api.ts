import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/queries";

export async function handle(fn: () => Promise<Response | unknown>): Promise<Response> {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; "), issues: e.issues }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}

export function parseId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
}
