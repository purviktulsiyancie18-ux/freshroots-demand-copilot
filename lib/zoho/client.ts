// Minimal Zoho Inventory API client: refresh-token OAuth, org-scoped requests, typed errors.

export interface ZohoConfig {
  dc: string; // "in", "com", "eu", …
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
}

export function zohoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ZohoConfig | null {
  const { ZOHO_DC, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID } = env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN || !ZOHO_ORG_ID) return null;
  return { dc: ZOHO_DC || "in", clientId: ZOHO_CLIENT_ID, clientSecret: ZOHO_CLIENT_SECRET, refreshToken: ZOHO_REFRESH_TOKEN, orgId: ZOHO_ORG_ID };
}

/** Which settings are missing — shown in the UI so it's clear why Zoho is not connected yet. */
export function missingZohoSettings(env: NodeJS.ProcessEnv = process.env): string[] {
  return ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORG_ID"].filter((k) => !env[k]);
}

export class ZohoError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
  ) {
    super(message);
  }
}

type FetchFn = typeof fetch;

export class ZohoClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private cfg: ZohoConfig,
    private fetchFn: FetchFn = fetch,
  ) {}

  get orgId() {
    return this.cfg.orgId;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.fetchFn(`https://accounts.zoho.${this.cfg.dc}/oauth/v2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        refresh_token: this.cfg.refreshToken,
      }),
    });
    const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !j.access_token) throw new ZohoError(`Zoho sign-in failed: ${j.error ?? res.status}`, 401);
    this.token = { value: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  async request<T>(method: "GET" | "POST", path: string, body?: unknown, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(`https://www.zohoapis.${this.cfg.dc}/inventory/v1${path}`);
    url.searchParams.set("organization_id", this.cfg.orgId);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url, {
      method,
      headers: { Authorization: `Zoho-oauthtoken ${await this.accessToken()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (!res.ok || (j.code !== undefined && j.code !== 0)) throw new ZohoError(`Zoho: ${j.message ?? res.statusText}`, res.status, j.code);
    return j as T;
  }

  /** Follows Zoho's page_context pagination. */
  async listAll<T>(path: string, key: string, query: Record<string, string> = {}): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 50; page++) {
      const j = await this.request<Record<string, unknown> & { page_context?: { has_more_page?: boolean } }>("GET", path, undefined, { ...query, page: String(page), per_page: "200" });
      out.push(...((j[key] as T[]) ?? []));
      if (!j.page_context?.has_more_page) break;
    }
    return out;
  }
}
