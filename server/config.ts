/**
 * Server-side configuration. Secrets are read from the process environment or
 * from a local `.env` file that is gitignored. Values are never logged, never
 * serialised into API responses, and never exposed to the Vite client bundle
 * (no VITE_ prefix is ever used for them).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

function loadDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileEnv = loadDotEnv(process.env.ODYSSEY_ENV_FILE ?? resolve(ROOT, '.env'));
const env = (key: string, fallback = '') => (process.env[key]?.trim() || fileEnv[key]?.trim() || fallback);
const num = (key: string, fallback: number) => {
  const value = Number(env(key));
  return Number.isFinite(value) && env(key) !== '' ? value : fallback;
};

export const config = {
  port: num('ODYSSEY_PORT', 8787),
  host: env('ODYSSEY_HOST', '127.0.0.1'),
  dbPath: resolve(ROOT, env('ODYSSEY_DB', 'server/data/odyssey.sqlite')),
  /** Optional bearer token protecting mutating endpoints in shared deployments. */
  apiToken: env('ODYSSEY_API_TOKEN'),
  llm: {
    apiKey: env('OPENCODE_API_KEY'),
    baseUrl: env('OPENCODE_BASE_URL', 'https://opencode.ai/inference/go/openai/v1').replace(/\/+$/, ''),
    model: env('OPENCODE_MODEL', 'deepseek-v4.1-flash'),
    /** Sent as `reasoning_effort`. DeepSeek V4.1 Flash on OpenCode Go honours "none" (0 reasoning tokens). Empty = provider default. */
    reasoningEffort: env('OPENCODE_REASONING_EFFORT', 'none'),
    timeoutMs: num('OPENCODE_TIMEOUT_MS', 90_000),
    maxRetries: num('OPENCODE_MAX_RETRIES', 2),
    userAgent: 'odyssey-mission-agent/1.0',
  },
  serper: {
    apiKey: env('SERPER_API_KEY'),
  },
  python: env('ODYSSEY_PYTHON', 'python3'),
  budgets: {
    maxToolCalls: num('ODYSSEY_MAX_TOOL_CALLS', 64),
    maxLlmTurns: num('ODYSSEY_MAX_LLM_TURNS', 36),
    maxSearchCalls: num('ODYSSEY_MAX_SEARCH_CALLS', 12),
    maxSourceFetches: num('ODYSSEY_MAX_SOURCE_FETCHES', 10),
    runTimeoutMs: num('ODYSSEY_RUN_TIMEOUT_MS', 12 * 60_000),
    toolTimeoutMs: num('ODYSSEY_TOOL_TIMEOUT_MS', 120_000),
    maxConcurrentRuns: num('ODYSSEY_MAX_CONCURRENT_RUNS', 2),
    maxOutputTokens: num('ODYSSEY_MAX_OUTPUT_TOKENS', 4096),
  },
} as const;

/** Redact any configured secret from free text before it is logged or returned. */
export function redact(text: string): string {
  let out = text;
  for (const secret of [config.llm.apiKey, config.serper.apiKey, config.apiToken]) {
    if (secret && secret.length >= 8) out = out.split(secret).join('[REDACTED]');
  }
  return out.replace(/\boc_sk_[A-Za-z0-9_]+/g, '[REDACTED]');
}

/**
 * Optional external components. They are not part of the ODYSSEY repository
 * (see THIRD_PARTY_NOTICES.md): Earth-Location-Nasa has no licence file and the
 * Reranker repository is private. Without them, search and literature reranking
 * are disabled and everything else runs.
 */
export const components = {
  validator: existsSync(resolve(ROOT, 'external/Earth-Location-Nasa/analog_validation/__init__.py')),
  reranker: existsSync(resolve(ROOT, 'external/Reranker/mission_reranker.py')),
};

/** Evidence search needs both a Serper key and the Earth-Location-Nasa validator. */
export const searchAvailable = () => Boolean(config.serper.apiKey) && components.validator;

export function capabilitySummary() {
  return {
    llm: config.llm.apiKey ? { provider: 'opencode', model: config.llm.model, endpoint: config.llm.baseUrl } : null,
    search: searchAvailable() ? { provider: 'serper (via Earth-Location-Nasa)' } : null,
    components: {
      validator: components.validator ? 'installed' : 'not installed (optional)',
      reranker: components.reranker ? 'installed' : 'not installed (optional)',
    },
  };
}
