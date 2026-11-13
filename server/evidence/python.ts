/** Spawn the isolated Python bridge with a bounded timeout. Secrets go via env only. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config, ROOT, redact } from '../config.ts';

const BRIDGE = resolve(ROOT, 'server/evidence/bridge.py');

export class BridgeError extends Error {}

export function runBridge<T>(payload: Record<string, unknown>, options: { timeoutMs?: number; signal?: AbortSignal; session?: string } = {}): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(config.python, ['-I', BRIDGE], {
      cwd: resolve(ROOT, 'server/evidence'),
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        SERPER_API_KEY: config.serper.apiKey,
        OPENCODE_API_KEY: config.llm.apiKey,
        OPENCODE_BASE_URL: config.llm.baseUrl,
        OPENCODE_MODEL: config.llm.model,
        OPENCODE_REASONING_EFFORT: config.llm.reasoningEffort,
        ODYSSEY_SESSION: options.session ?? 'odyssey-bridge',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 120_000);
    const abort = () => child.kill('SIGKILL');
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new BridgeError(`python bridge failed to start: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (signal) return reject(new BridgeError(options.signal?.aborted ? 'aborted' : 'python bridge timed out'));
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) return reject(new BridgeError(redact(parsed.error ?? 'bridge error')));
        resolvePromise(parsed.result as T);
      } catch {
        reject(new BridgeError(redact(`python bridge exited ${code}: ${stderr.slice(-400)}`)));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
