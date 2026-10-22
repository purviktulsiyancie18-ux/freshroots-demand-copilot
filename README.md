# Freshroots Demand Planning Copilot

Turns Raghav's monthly, two-day Excel forecast into a **twice-weekly (Mon & Thu), ~30-minute review**.

**Rules compute. AI explains. The planner decides.**

```
Upload (Mon/Thu) → parse → Gemini proposes cleaning → code applies + validates (hard gate)
  → rules engine (pure TS) sets flags + quantities → Gemini forecasts, explains, tags
  → review queue (approve / override with reason) → export CSV to procurement
  ↺ overrides + reasons feed the next run's Gemini context
```

## Non-negotiables (and where they are enforced)

| Principle | Enforcement |
|---|---|
| Rules compute quantities, AI never does | `lib/rules/engine.ts` is the only code that sets `recommended_qty`. Gemini output is parsed through a strict zod schema (`AiForecastZ`) and mapped onto AI-only columns (`toAiColumns`); any `recommended_qty` it returns is dropped (tested). A Postgres trigger (`drizzle/0001_recommended_qty_guard.sql`) rejects any UPDATE to `recommended_qty`. |
| Human gate | Nothing is exported until Raghav approves or overrides. No bulk approve for Needs-judgment rows. |
| AI proposes, code applies | `lib/ai/clean.ts` only returns a mapping + proposed fixes. `lib/data/prepare.ts` applies allow-listed deterministic transformers, logs every change to `cleaning_log`, and validates. `other` fixes are never applied. |
| Judgment is protected | Final tag is computed in code (`computeFinalTag`) from rule triggers, AI tag, forecast disagreement > 25%, low confidence, or AI unavailable. |
| Every override teaches the next run | Last 5 overrides + override rate per SKU are injected into the forecast prompt. |

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind v4 with shadcn-style components (`components/ui`) · Neon Postgres + Drizzle ORM · Gemini via `@google/genai` (structured JSON output) · SheetJS + papaparse · zod · vitest · Vercel.

## Setup

```bash
npm install
cp .env.example .env.local      # fill in the values
npm run db:migrate              # creates tables + recommended_qty guard trigger
npm run db:seed                 # loads /data/sample masters + rule_config defaults
npm test                        # 42 tests incl. the §7.3 golden table
npm run dev
```

Sign in at `/login` with any display name (recorded on approvals/overrides) and `APP_PASSWORD`.

### Environment variables

| Name | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | default `gemini-3.8-flash` (see deviations) |
| `GEMINI_THINKING_LEVEL` | optional, default `LOW` |
| `APP_PASSWORD` | shared team password |
| `SESSION_SECRET` | long random string for signing the session cookie |

## Try it

- **Golden run:** upload the 5 files in `data/sample/` with run date **2026-10-22** → 7 of 15 SKUs flagged (5 stockout incl. 1 high-demand, 2 overstock), quantities as in PRD §7.3.
- **Messy SAP export:** `data/messy/freshroots_sap_export_messy.xlsx` (headers like `Item Code`, `Wk`, `Qty Sold`; ids like `sku 1`; weeks like `W42-2026`; `1,200`; `Yes/No`; `DD/MM/YYYY`) → identical results, ~520 fixes in the cleaning log. Regenerate with `npm run make:messy`.
- **Invalid file:** `data/invalid/` (SKU099 in sales but not in sku_master) → `failed_validation`, row-level error (weekly_sales row 242), nothing written to clean tables.

## Code map

| Path | What |
|---|---|
| `lib/rules/engine.ts` | Pure rules engine (§7) + `engine.test.ts` golden table |
| `lib/data/` | parsing, deterministic transformers, fallback header matching, validation gate |
| `lib/ai/` | Gemini wrapper (timeout + 1 retry + `ai_calls` logging), prompts, cleaning, forecast + final tag |
| `lib/pipeline/` | `analyse.ts` (rules → AI → tag, no DB) and `execute.ts` (the run pipeline) |
| `lib/queries.ts` | review queue, decisions, export, config, metrics |
| `app/` | `/` dashboard · `/upload` · `/runs/[id]` review queue · `/settings/rules` · `/api/*` |

## Decisions & deviations from the PRD

All of PRD §15 is followed. Changes:

1. **Model:** `gemini-2.5-flash` is no longer available to new API users, so the default is `gemini-3.8-flash` (override with `GEMINI_MODEL`). Calls use `thinkingLevel: LOW` and the default temperature: with higher thinking a 15-SKU run took 84 s, and low temperatures made Gemini 3 loop.
2. **Cleaning response shape:** Gemini's `responseSchema` can't express dynamic object keys, so `sheet_mapping` / `column_mapping` come back as arrays and are converted in code. `example_before/after` are not requested: Gemini looped inside them on messy SKU ids in roughly 1 in 4 calls, and the cleaning log already records the real before → after for every changed cell.
3. **Deterministic type normalisation:** besides Gemini-proposed fixes, code applies the same allow-listed transformers when a target column's type requires it (e.g. `Week` → ISO week). Each change is logged and says whether Gemini proposed it. A deterministic header matcher fills mapping gaps, so a clean upload never depends on Gemini.
4. **`stockout_multiplier`** (default 1.0) was added to `rule_config` so PRD decision 4 (stockout-only qty = standard qty) is config-driven, as the PRD asks.
5. **Rules use merged history:** weekly sales are upserted into Neon. The rules see all stored weeks for the uploaded SKUs, anchored on the latest week. Missing weeks inside the 12-week window are excluded, and fewer than `min_history_weeks` present → Needs judgment.
6. **Extra columns:** `uploads.raw_rows` (staged raw rows), `runs.completed_at` + `runs.summary`, `cleaning_log.sku_id`, `recommendations.ai_judgment_reason`, plus a `rule_config_log` table for the Settings change log.
7. **Run completion:** a run is `completed` when no `pending` rows remain among SKUs that are flagged **or** tagged Needs judgment.
8. **"Runs on time"** = distinct completed runs dated Monday/Thursday this month vs Mon/Thu slots elapsed.

## Deploy

GitHub `main` → Vercel production; PRs get preview deploys. Set the env vars above in Vercel (Production + Preview). `/api/runs/[id]/execute` has `maxDuration = 300`. With 20 SKUs per Gemini call and 4 calls in parallel, 400 SKUs is 5 waves of ~10–15 s each.
