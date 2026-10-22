// MVP auth (§11): shared APP_PASSWORD → HMAC-signed session cookie carrying a display name.
// Uses Web Crypto so it runs in both middleware (edge) and route handlers (node).

export const SESSION_COOKIE = "fr_session";
const MAX_AGE_S = 60 * 60 * 24 * 14;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function createSession(name: string): Promise<{ value: string; maxAge: number }> {
  const payload = b64url(enc.encode(JSON.stringify({ name, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S })));
  return { value: `${payload}.${await hmac(payload)}`, maxAge: MAX_AGE_S };
}

export async function verifySession(value: string | undefined): Promise<{ name: string } | null> {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { name: string; exp: number };
    if (data.exp < Date.now() / 1000) return null;
    return { name: data.name };
  } catch {
    return null;
  }
}

export function checkPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return false;
  if (input.length !== pw.length) return false;
  let diff = 0;
  for (let i = 0; i < pw.length; i++) diff |= input.charCodeAt(i) ^ pw.charCodeAt(i);
  return diff === 0;
}
