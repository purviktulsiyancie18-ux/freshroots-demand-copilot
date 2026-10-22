import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, checkPassword, createSession } from "@/lib/auth";

const Body = z.object({ password: z.string(), name: z.string().trim().min(1).max(60) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your name and the password" }, { status: 400 });
  if (!checkPassword(parsed.data.password)) return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  const s = await createSession(parsed.data.name);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: s.maxAge });
  return res;
}
