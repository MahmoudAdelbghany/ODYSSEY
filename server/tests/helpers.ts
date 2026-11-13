import type { ChatRequest, ChatResult, LLMProvider } from '../llm/provider.ts';

/** Scripted provider for isolated tests. Each step sees the request and returns a reply. */
export class FakeLLM implements LLMProvider {
  readonly name = 'fake';
  readonly model = 'fake-model';
  calls: ChatRequest[] = [];
  /** mode 'agent': only agent turns (requests offering tools) are scripted; internal calls get `{}`. */
  constructor(private readonly script: (request: ChatRequest, index: number) => Partial<ChatResult>, private readonly mode: 'all' | 'agent' = 'all') {}
  available() {
    return true;
  }
  /** Agent turns only (requests that offer tools); tool-internal calls (parsing, extraction) get `{}`. */
  turns = 0;
  async chat(request: ChatRequest): Promise<ChatResult> {
    this.calls.push(request);
    if (request.signal?.aborted) throw new Error('aborted');
    if (this.mode === 'agent' && !request.tools?.length) return { content: '{}', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1, cachedTokens: 0 }, model: this.model, responseId: 'internal', latencyMs: 1 };
    const index = this.turns;
    this.turns += 1;
    const reply = this.script(request, index);
    return { content: null, toolCalls: [], finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5, cachedTokens: 0 }, model: this.model, responseId: `r${index}`, latencyMs: 1, ...reply };
  }
}

export const call = (name: string, args: Record<string, unknown> = {}, id = `${name}-${Math.random().toString(36).slice(2, 7)}`) => ({ id, name, arguments: JSON.stringify(args) });

export const SAMPLE_BRIEF = 'Plan a seven-day simulated lunar surface expedition that includes geological sampling, rover navigation, equipment deployment, thermal survival and dust mitigation.';

export async function waitFor(predicate: () => boolean, timeoutMs = 120_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
}
