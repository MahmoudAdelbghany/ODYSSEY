/**
 * Reasoning-provider abstraction. The agent depends on `LLMProvider` only, so the
 * backend can be swapped without touching the orchestration code.
 *
 * `OpenCodeProvider` speaks the OpenAI-compatible chat-completions contract that
 * OpenCode documents for both Zen (`/inference/openai/v1`) and Go
 * (`/inference/go/openai/v1`). Go requires a stable `x-opencode-session` header
 * per conversation and a client-specific user agent; both are sent.
 */
import { config, redact } from '../config.ts';

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[]; reasoning?: string | null }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ChatToolCall[];
  finishReason: string | null;
  usage: ChatUsage;
  model: string;
  responseId: string | null;
  latencyMs: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  sessionId: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  available(): boolean;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export class LLMError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(redact(message));
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new LLMError('aborted', false));
    }, { once: true });
  });

/** Make text safe for JSON transport: replace lone surrogates, drop control characters. */
export function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally strips control characters before JSON transport
  return text.toWellFormed().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
}

function toWire(message: ChatMessage) {
  if ('content' in message && typeof message.content === 'string') message = { ...message, content: sanitizeText(message.content) } as ChatMessage;
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content ?? '',
      ...(message.tool_calls?.length
        ? {
            tool_calls: message.tool_calls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    };
  }
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.tool_call_id, content: message.content };
  }
  return message;
}

export class OpenCodeProvider implements LLMProvider {
  readonly name = 'opencode';
  constructor(
    readonly model = config.llm.model,
    private readonly baseUrl = config.llm.baseUrl,
    private readonly apiKey = config.llm.apiKey,
  ) {}

  available() {
    return Boolean(this.apiKey);
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    if (!this.apiKey) throw new LLMError('OPENCODE_API_KEY is not configured', false);
    const body = {
      model: this.model,
      messages: request.messages.map(toWire),
      max_tokens: request.maxTokens ?? config.budgets.maxOutputTokens,
      temperature: request.temperature ?? 0.2,
      ...(config.llm.reasoningEffort ? { reasoning_effort: config.llm.reasoningEffort } : {}),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.parameters },
            })),
            tool_choice: 'auto',
          }
        : {}),
      ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };
    let lastError: LLMError | null = null;
    for (let attempt = 0; attempt <= config.llm.maxRetries; attempt += 1) {
      if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1), request.signal);
      const started = Date.now();
      const timeout = AbortSignal.timeout(config.llm.timeoutMs);
      const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
            'user-agent': config.llm.userAgent,
            'x-opencode-session': request.sessionId,
          },
          body: JSON.stringify(body),
          signal,
        });
        const text = await response.text();
        if (!response.ok) {
          let detail = '';
          try {
            const parsed = JSON.parse(text);
            detail = parsed?.error?.message ?? parsed?.error?.type ?? '';
          } catch {
            detail = text.slice(0, 160);
          }
          const retryable = response.status === 429 || response.status >= 500;
          throw new LLMError(`LLM HTTP ${response.status}: ${detail}`, retryable, response.status);
        }
        const payload = JSON.parse(text);
        const choice = payload.choices?.[0];
        if (!choice) throw new LLMError('LLM returned no choices', true);
        const toolCalls: ChatToolCall[] = (choice.message?.tool_calls ?? []).map(
          (call: { id: string; function: { name: string; arguments: string } }, index: number) => ({
            id: call.id || `call_${index}`,
            name: call.function?.name ?? '',
            arguments: call.function?.arguments ?? '{}',
          }),
        );
        return {
          content: choice.message?.content ?? null,
          toolCalls,
          finishReason: choice.finish_reason ?? null,
          usage: {
            promptTokens: payload.usage?.prompt_tokens ?? 0,
            completionTokens: payload.usage?.completion_tokens ?? 0,
            cachedTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          },
          model: payload.model ?? this.model,
          responseId: payload.id ?? null,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        if (request.signal?.aborted) throw new LLMError('aborted', false);
        lastError =
          error instanceof LLMError
            ? error
            : new LLMError(`LLM request failed: ${(error as Error).name}`, true);
        if (!lastError.retryable) throw lastError;
      }
    }
    throw lastError ?? new LLMError('LLM request failed', false);
  }
}

/** Parse a JSON object from model text, tolerating code fences. Throws on failure. */
export function parseJsonObject(text: string | null): Record<string, unknown> {
  if (!text) throw new Error('empty model output');
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  const parsed = JSON.parse(stripped.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('model output is not an object');
  return parsed as Record<string, unknown>;
}

export function defaultProvider(): LLMProvider {
  return new OpenCodeProvider();
}
