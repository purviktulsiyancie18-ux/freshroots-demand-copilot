import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  doublePrecision,
  jsonb,
  serial,
  primaryKey,
  date,
  index,
} from "drizzle-orm/pg-core";

export const distributors = pgTable("distributors", {
  distributorId: text("distributor_id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  status: text("status").notNull(), // Active | Inactive
});

export const skus = pgTable("skus", {
  skuId: text("sku_id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  perishability: text("perishability").notNull(), // High | Low
  standardReorderQty: integer("standard_reorder_qty").notNull(),
  uom: text("uom").notNull(),
  distributorId: text("distributor_id")
    .notNull()
    .references(() => distributors.distributorId),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const calendar = pgTable("calendar", {
  yearMonth: text("year_month").primaryKey(), // YYYY-MM
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  isFestival: boolean("is_festival").notNull(),
});

export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  fileNames: text("file_names").array().notNull(),
  rawBlobRef: text("raw_blob_ref"),
  // Parsed raw staging rows: { [sheetName]: Record<string,string>[] }
  rawRows: jsonb("raw_rows"),
  status: text("status").notNull().default("received"),
});

export const weeklySales = pgTable(
  "weekly_sales",
  {
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.skuId),
    isoWeek: text("iso_week").notNull(),
    unitsSold: integer("units_sold").notNull(),
    uploadId: integer("upload_id").references(() => uploads.id),
  },
  (t) => [primaryKey({ columns: [t.skuId, t.isoWeek] })],
);

export const inventorySnapshots = pgTable(
  "inventory_snapshots",
  {
    id: serial("id").primaryKey(),
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.skuId),
    location: text("location").notNull(),
    unitsOnHand: integer("units_on_hand").notNull(),
    asOfDate: date("as_of_date").notNull(),
    uploadId: integer("upload_id").references(() => uploads.id),
  },
  (t) => [index("inv_upload_idx").on(t.uploadId)],
);

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id")
    .notNull()
    .references(() => uploads.id),
  runDate: date("run_date").notNull(),
  // parsing | cleaning | failed_validation | rules | ai | ready_for_review | completed | failed
  status: text("status").notNull().default("parsing"),
  configSnapshot: jsonb("config_snapshot"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }), // pipeline reached ready_for_review / failed
  completedAt: timestamp("completed_at", { withTimezone: true }), // Raghav finished reviewing
  error: jsonb("error"),
  summary: jsonb("summary"),
});

export const cleaningLog = pgTable(
  "cleaning_log",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    sheet: text("sheet"),
    rowNum: integer("row_num"),
    columnName: text("column_name"),
    before: text("before"),
    after: text("after"),
    fixType: text("fix_type"),
    level: text("level").notNull(), // applied | warning | missing | error
    message: text("message"),
    skuId: text("sku_id"),
  },
  (t) => [index("cleaning_run_idx").on(t.runId)],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.skuId),
    avg4: doublePrecision("avg4").notNull(),
    avg12: doublePrecision("avg12").notNull(),
    isFestival: boolean("is_festival").notNull(),
    adjustedWeekly: doublePrecision("adjusted_weekly").notNull(),
    unitsOnHand: integer("units_on_hand").notNull(),
    weeksOfCover: doublePrecision("weeks_of_cover"), // null = infinite
    flags: text("flags").array().notNull(),
    action: text("action").notNull(),
    // Written ONLY by the rules step. A DB trigger blocks any later change.
    recommendedQty: integer("recommended_qty").notNull(),
    ruleTrace: text("rule_trace").notNull(),
    needsJudgmentByRule: boolean("needs_judgment_by_rule").notNull(),
    forecastWeekly: integer("forecast_weekly").array(),
    aiReason: text("ai_reason"),
    aiTag: text("ai_tag"),
    aiJudgmentReason: text("ai_judgment_reason"),
    aiConfidence: text("ai_confidence"),
    aiUnavailable: boolean("ai_unavailable").notNull().default(false),
    finalTag: text("final_tag").notNull().default("NEEDS_JUDGMENT"),
    judgmentTriggers: text("judgment_triggers").array().notNull().default([]),
    status: text("status").notNull().default("pending"), // pending | approved | overridden
    finalAction: text("final_action"),
    finalQty: integer("final_qty"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("rec_run_idx").on(t.runId), index("rec_sku_idx").on(t.skuId)],
);

export const overrides = pgTable(
  "overrides",
  {
    id: serial("id").primaryKey(),
    recommendationId: integer("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.skuId),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    originalAction: text("original_action").notNull(),
    originalQty: integer("original_qty").notNull(),
    newAction: text("new_action").notNull(),
    newQty: integer("new_qty").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ovr_sku_idx").on(t.skuId)],
);

export const ruleConfig = pgTable("rule_config", {
  key: text("key").primaryKey(),
  value: numeric("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ruleConfigLog = pgTable("rule_config_log", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  oldValue: numeric("old_value"),
  newValue: numeric("new_value").notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiCalls = pgTable("ai_calls", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => runs.id),
  purpose: text("purpose").notNull(), // clean | forecast
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  ok: boolean("ok").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
