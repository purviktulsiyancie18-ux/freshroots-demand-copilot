// Thin wrapper around Gemini structured output: timeout + 1 retry, zod validation, and ai_calls logging.

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { ZodType } from "zod";

export interface GenerateArgs {
  system: string;
  user: string;
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface GenerateResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Injectable so tests can mock Gemini. */
export interface GeminiClient {
  model: string;
  generate(args: GenerateArgs): Promise<GenerateResult>;
}

export interface AiCallRecord {
  runId: number | null;
  purpose: "clean" | "forecast";
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  ok: boolean;
  error: string | null;
}

export type AiCallLogger = (rec: AiCallRecord) => Promise<void> | void;

export function defaultModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

function thinkingLevel(): ThinkingLevel {
  const v = (process.env.GEMINI_THINKING_LEVEL || "LOW").toUpperCase();
  return (Object.values(ThinkingLevel) as string[]).includes(v) ? (v as ThinkingLevel) : ThinkingLevel.LOW;
}

export function createGeminiClient(): GeminiClient | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  const model = defaultModel();
  return {
    model,
    async generate({ system, user, responseSchema, maxOutputTokens, signal }) {
      const res = await ai.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema,
          // Gemini 3 models are tuned for the default temperature (1.0); lower values made it loop in testing.
          maxOutputTokens,
          // Low thinking keeps a 20-SKU batch to seconds, so 400 SKUs fit the 300 s function limit.
          thinkingConfig: { thinkingLevel: thinkingLevel() },
          abortSignal: signal,
        },
      });
      return {
        text: res.text ?? "",
        inputTokens: res.usageMetadata?.promptTokenCount,
        outputTokens: res.usageMetadata?.candidatesTokenCount,
      };
    },
  };
}

export class AiUnavailableError extends Error {}

export async function callGeminiJson<T>(opts: {
  client: GeminiClient | null;
  system: string;
  user: string;
  responseSchema: Record<string, unknown>;
  zod: ZodType<T>;
  purpose: "clean" | "forecast";
  promptVersion: string;
  runId: number | null;
  logger?: AiCallLogger;
  maxOutputTokens?: number;
  timeoutMs?: number;
  retries?: number;
}): Promise<T> {
  const { client, logger, maxOutputTokens = 8192, timeoutMs = 90_000, retries = 1 } = opts;
  if (!client) throw new AiUnavailableError("GEMINI_API_KEY is not configured");

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let tokens: { in?: number; out?: number } = {};
    try {
      const res = await Promise.race([
        client.generate({ system: opts.system, user: opts.user, responseSchema: opts.responseSchema, maxOutputTokens, signal: ctrl.signal }),
        new Promise<never>((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new Error(`Gemini timed out after ${timeoutMs} ms`)))),
      ]);
      tokens = { in: res.inputTokens, out: res.outputTokens };
      const parsed = opts.zod.parse(JSON.parse(res.text));
      await logger?.({
        runId: opts.runId,
        purpose: opts.purpose,
        model: client.model,
        promptVersion: opts.promptVersion,
        latencyMs: Date.now() - started,
        inputTokens: tokens.in ?? null,
        outputTokens: tokens.out ?? null,
        ok: true,
        error: null,
      });
      return parsed;
    } catch (e) {
      lastErr = e;
      await logger?.({
        runId: opts.runId,
        purpose: opts.purpose,
        model: client.model,
        promptVersion: opts.promptVersion,
        latencyMs: Date.now() - started,
        inputTokens: tokens.in ?? null,
        outputTokens: tokens.out ?? null,
        ok: false,
        error: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
      });
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AiUnavailableError(lastErr instanceof Error ? lastErr.message : String(lastErr));
}
