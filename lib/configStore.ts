import { getDb, schema } from "@/lib/db";
import { DEFAULT_CONFIG, type RuleConfig } from "@/lib/rules/config";

export async function loadConfig(): Promise<RuleConfig> {
  const rows = await getDb().select().from(schema.ruleConfig);
  const cfg: RuleConfig = { ...DEFAULT_CONFIG };
  for (const r of rows) if (r.key in cfg) cfg[r.key as keyof RuleConfig] = Number(r.value);
  return cfg;
}
