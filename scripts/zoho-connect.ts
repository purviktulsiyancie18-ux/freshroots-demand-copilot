// Finds the Zoho Inventory organization for the saved OAuth credentials and writes ZOHO_ORG_ID to .env.local.
// Usage: npm run zoho:connect

import fs from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

async function main() {
  const { ZOHO_DC = "in", ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) throw new Error("Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN in .env.local first");
  const tok = await (
    await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET, refresh_token: ZOHO_REFRESH_TOKEN }),
    })
  ).json();
  if (!tok.access_token) throw new Error(`Zoho sign-in failed: ${tok.error}`);
  const j = await (await fetch(`https://www.zohoapis.${ZOHO_DC}/inventory/v1/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` } })).json();
  const orgs: { organization_id: string; name: string }[] = j.organizations ?? [];
  if (!orgs.length) {
    console.log("No Zoho Inventory organization yet. Create one at https://inventory.zoho.in (Zoho support must lift error 6063 first).");
    return;
  }
  const org = orgs.find((o) => /freshroots/i.test(o.name)) ?? orgs[0];
  const env = fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => !l.startsWith("ZOHO_ORG_ID="));
  fs.writeFileSync(".env.local", [...env.filter(Boolean), `ZOHO_ORG_ID=${org.organization_id}`].join("\n") + "\n");
  console.log(`Connected to "${org.name}" (${org.organization_id}). Add ZOHO_ORG_ID=${org.organization_id} to Vercel too.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
