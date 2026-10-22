// Loads /data/sample/*.csv masters (distributors, SKUs, calendar) into Neon and seeds rule_config defaults.
// Usage: npm run db:seed

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fallbackPlan } from "@/lib/data/fallbackPlan";
import { prepareData } from "@/lib/data/prepare";
import { sampleRaw } from "@/lib/testing/sample";
import { DEFAULT_CONFIG } from "@/lib/rules/config";

async function main() {
  const db = getDb();
  const raw = sampleRaw();
  const res = prepareData(raw, fallbackPlan(raw), new Date().toISOString().slice(0, 10));
  if (!res.clean) throw new Error("Sample data failed validation: " + JSON.stringify(res.errors, null, 2));
  const { distributors, skus, calendar } = res.clean;

  await db
    .insert(schema.distributors)
    .values(distributors.map((d) => ({ distributorId: d.distributorId, name: d.name, region: d.region, status: d.status })))
    .onConflictDoNothing();
  await db
    .insert(schema.skus)
    .values(
      skus.map((s) => ({
        skuId: s.skuId,
        name: s.name,
        category: s.category,
        perishability: s.perishability,
        standardReorderQty: s.standardReorderQty,
        uom: s.uom,
        distributorId: s.distributorId,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(schema.calendar)
    .values(calendar.map((c) => ({ yearMonth: c.yearMonth, year: c.year, month: c.month, isFestival: c.isFestival })))
    .onConflictDoNothing();
  await db
    .insert(schema.ruleConfig)
    .values(Object.entries(DEFAULT_CONFIG).map(([key, value]) => ({ key, value: String(value), updatedBy: "seed" })))
    .onConflictDoNothing();

  const counts = await db.execute(
    sql`select (select count(*) from distributors) d, (select count(*) from skus) s, (select count(*) from calendar) c, (select count(*) from rule_config) r`,
  );
  console.log("Seeded:", counts.rows[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
