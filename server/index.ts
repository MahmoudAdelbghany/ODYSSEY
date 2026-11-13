/**
 * ODYSSEY backend. Plain node:http, input validation, optional bearer auth,
 * per-IP rate limits, structured errors, SSE progress, and static serving of the
 * built frontend for single-process deployment.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { capabilitySummary, config, redact, ROOT } from './config.ts';
import { defaultProvider } from './llm/provider.ts';
import { Store } from './store.ts';
import { AgentRunner } from './agent/loop.ts';
import { TOOL_BY_NAME, TOOL_SPECS } from './agent/tools.ts';
import type { AgentState } from './agent/state.ts';
import { MODELS } from './science/interventions.ts';
import { DIMENSIONS, earthSiteProfile, planetaryProfile, type PlanetaryTargetId } from './science/profile.ts';
import { compareMeasurements, alignBaseline } from './science/mismatch.ts';
import { AGGREGATE_DEFINITION } from './science/candidates.ts';
import { SITE_BY_ID } from './science/data.ts';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, url: URL) => Promise<void> | void;

export function createApp(store: Store, runner: AgentRunner) {
  const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler; mutating: boolean }> = [];
  const route = (method: string, path: string, handler: Handler) => {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, pattern, keys, handler, mutating: method !== 'GET' });
  };

  const buckets = new Map<string, { tokens: number; at: number }>();
  const limit = (key: string, perMinute: number, burst: number) => {
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: burst, at: now };
    bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 60_000) * perMinute);
    bucket.at = now;
    if (bucket.tokens < 1) throw new HttpError(429, 'rate_limited', 'Too many requests; slow down.');
    bucket.tokens -= 1;
    buckets.set(key, bucket);
  };

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const readBody = async (req: IncomingMessage, max = 64_000): Promise<Record<string, unknown>> => {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > max) throw new HttpError(413, 'too_large', 'Request body too large');
      chunks.push(chunk as Buffer);
    }
    if (!chunks.length) return {};
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch {
      throw new HttpError(400, 'invalid_json', 'Body must be a JSON object');
    }
  };

  const runOr404 = (id: string) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'invalid_id', 'Invalid run id');
    const run = store.getRun(id);
    if (!run) throw new HttpError(404, 'not_found', 'Run not found');
    return run;
  };

  route('GET', '/api/health', (_req, res) => json(res, 200, { ok: true, capabilities: capabilitySummary(), activeRuns: runner.activeCount(), budgets: config.budgets }));

  route('GET', '/api/meta', (_req, res) =>
    json(res, 200, {
      tools: TOOL_SPECS.map((t) => ({ name: t.name, description: t.description })),
      dimensions: DIMENSIONS,
      aggregateDefinition: AGGREGATE_DEFINITION,
      components: {
        evidenceRetriever: 'Earth-Location-Nasa@455870d (Serper + allow-list filters)',
        evidenceVerifier: 'ODYSSEY full-source retrieval + verbatim claim verification',
        evidenceReranker: 'WA-on-test2/Reranker@8d706dc (candidates) · BM25 (sources)',
        missionPlanner: 'ODYSSEY agent loop (OpenCode LLM tool calling + deterministic completion)',
        experimentPlanner: 'src/mission archetype recipes',
        interventionPlanner: 'server/science/interventions.ts',
        campaignOptimizer: 'src/campaign exact search over pruned options',
      },
    }),
  );

  route('POST', '/api/runs', async (req, res) => {
    limit(`runs:${req.socket.remoteAddress}`, 0.2, 6);
    const body = await readBody(req);
    const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
    if (brief.length < 12 || brief.length > 2000) throw new HttpError(422, 'invalid_brief', 'brief must be 12–2000 characters');
    const planner = body.planner === 'deterministic' ? 'deterministic' : 'auto';
    try {
      const run = runner.start(brief, { planner });
      json(res, 202, { run });
    } catch (error) {
      if ((error as Error).message === 'busy') throw new HttpError(429, 'busy', `At most ${config.budgets.maxConcurrentRuns} concurrent runs; try again shortly.`);
      throw error;
    }
  });

  route('GET', '/api/runs', (_req, res) => json(res, 200, { runs: store.listRuns(50).map((r) => ({ ...r, active: runner.isActive(r.id) })) }));

  route('GET', '/api/runs/:id', (_req, res, { id }) => {
    const run = runOr404(id);
    const snapshot = store.loadSnapshot(id);
    json(res, 200, { run: { ...run, active: runner.isActive(id) }, state: snapshot?.state ?? null });
  });

  route('GET', '/api/runs/:id/events', (_req, res, { id }, url) => {
    runOr404(id);
    json(res, 200, { events: store.events(id, Number(url.searchParams.get('after') ?? 0) || 0) });
  });

  route('GET', '/api/runs/:id/stream', (req, res, { id }, url) => {
    runOr404(id);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const after = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0) || 0;
    const send = (row: { seq?: number; type: string }) => {
      res.write(`${row.seq ? `id: ${row.seq}\n` : ''}event: ${row.type}\ndata: ${JSON.stringify(row)}\n\n`);
    };
    for (const row of store.events(id, after)) send(row);
    if (!runner.isActive(id)) {
      send({ type: 'end' });
      res.end();
      return;
    }
    const unsubscribe = runner.subscribe(id, (row) => {
      send(row as { type: string });
      if ((row as { type: string }).type === 'end') res.end();
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  route('POST', '/api/runs/:id/cancel', (_req, res, { id }) => {
    runOr404(id);
    json(res, 200, { cancelled: runner.cancel(id) });
  });

  route('POST', '/api/runs/:id/resume', (_req, res, { id }) => {
    const run = runOr404(id);
    if (run.status === 'completed') throw new HttpError(409, 'completed', 'Run already completed');
    try {
      json(res, 202, { run: runner.resume(id) });
    } catch (error) {
      throw new HttpError(409, 'cannot_resume', (error as Error).message);
    }
  });

  route('POST', '/api/runs/:id/investigate', async (req, res, { id }) => {
    runOr404(id);
    if (runner.isActive(id)) throw new HttpError(409, 'run_active', 'Wait for the run to finish before investigating a gap.');
    const body = await readBody(req);
    const key = typeof body.key === 'string' ? body.key : '';
    if (!/^(metric|dimension):[A-Za-z.]{2,60}$/.test(key)) throw new HttpError(400, 'invalid_key', 'key must be metric:<name> or dimension:<name>');
    const snapshot = store.loadSnapshot(id);
    if (!snapshot?.state) throw new HttpError(409, 'no_state', 'This run has no saved state yet.');
    const state = snapshot.state as AgentState;
    const tool = TOOL_BY_NAME.get('investigate_evidence_gap')!;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const result = await tool.run({ key, search: body.search === true }, { state, store, llm: null, signal: controller.signal, sessionId: id, emit: () => {} });
      store.saveSnapshot(id, state, snapshot.messages);
      store.appendEvent(id, 'investigation', { key, state: (result.data as { state: string }).state, outcome: (result.data as { outcome: string }).outcome });
      json(res, 200, { investigation: result.data, budgets: state.budgets });
    } catch (error) {
      throw new HttpError(400, 'investigation_failed', (error as Error).message.slice(0, 300));
    } finally {
      clearTimeout(timer);
    }
  });

  route('GET', '/api/runs/:id/report.json', (_req, res, { id }) => {
    runOr404(id);
    const report = store.getReport(id);
    if (!report) throw new HttpError(404, 'no_report', 'Report not available yet');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="odyssey-${id.slice(0, 8)}.json"` });
    const { markdown: _md, ...rest } = report as Record<string, unknown>;
    res.end(JSON.stringify(rest, null, 2));
  });

  route('GET', '/api/runs/:id/report.md', (_req, res, { id }) => {
    runOr404(id);
    const report = store.getReport(id) as { markdown?: string } | null;
    if (!report?.markdown) throw new HttpError(404, 'no_report', 'Report not available yet');
    res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="odyssey-${id.slice(0, 8)}.md"` });
    res.end(report.markdown);
  });

  route('POST', '/api/runs/:id/feedback', async (req, res, { id }) => {
    runOr404(id);
    limit(`fb:${req.socket.remoteAddress}`, 6, 20);
    const body = await readBody(req, 8000);
    const category = String(body.category ?? '');
    if (!['preference', 'site_evaluation', 'scientific_correction', 'test_outcome'].includes(category)) throw new HttpError(422, 'invalid_category', 'category must be preference, site_evaluation, scientific_correction or test_outcome');
    const details = String(body.details ?? '').trim();
    if (details.length < 4 || details.length > 4000) throw new HttpError(422, 'invalid_details', 'details must be 4–4000 characters');
    const fid = store.addFeedback(id, category, typeof body.target === 'string' ? body.target.slice(0, 200) : null, details);
    json(res, 201, { id: fid, reviewStatus: 'pending_review', note: 'Feedback never edits scores or evidence automatically.' });
  });

  route('GET', '/api/runs/:id/feedback', (_req, res, { id }) => {
    runOr404(id);
    json(res, 200, { feedback: store.listFeedback(id) });
  });

  route('POST', '/api/interventions/simulate', async (req, res) => {
    limit(`sim:${req.socket.remoteAddress}`, 120, 60);
    const body = await readBody(req, 4000);
    const inputs = (body.inputs ?? {}) as Record<string, number>;
    for (const v of Object.values(inputs)) if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(422, 'invalid_inputs', 'inputs must be finite numbers');
    try {
      switch (body.model) {
        case 'vacuum_pumpdown_ideal':
          return json(res, 200, MODELS.vacuumPumpdown({ volumeM3: inputs.volumeM3, pumpSpeedLps: inputs.pumpSpeedLps, startPa: inputs.startPa ?? 101_325, targetPa: inputs.targetPa }));
        case 'radiative_equilibrium_plate':
          return json(res, 200, MODELS.radiativeEquilibrium({ irradianceWm2: inputs.irradianceWm2, absorptivity: inputs.absorptivity, emissivity: inputs.emissivity, incidenceDeg: inputs.incidenceDeg ?? 0, shroudK: inputs.shroudK ?? 77 }));
        case 'gravity_offload_statics':
          return json(res, 200, MODELS.gravityOffload({ massKg: inputs.massKg, targetG: inputs.targetG }));
        case 'thermal_cycle_protocol':
          return json(res, 200, MODELS.thermalCycleProtocol({ lowK: inputs.lowK, highK: inputs.highK, rampKPerMin: inputs.rampKPerMin, dwellH: inputs.dwellH, cycles: inputs.cycles }));
        default:
          throw new HttpError(422, 'unknown_model', 'model must be vacuum_pumpdown_ideal, radiative_equilibrium_plate, gravity_offload_statics or thermal_cycle_protocol');
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(422, 'invalid_inputs', (error as Error).message);
    }
  });

  route('GET', '/api/targets/:id', (_req, res, { id }) => {
    if (id !== 'moon_south_pole' && id !== 'mars_jezero') throw new HttpError(404, 'not_found', 'Unknown target');
    json(res, 200, planetaryProfile(id));
  });

  route('GET', '/api/sites/:id/comparison', (_req, res, { id }, url) => {
    const site = SITE_BY_ID.get(id);
    if (!site) throw new HttpError(404, 'not_found', 'Unknown site');
    const targetId = (url.searchParams.get('target') ?? 'moon_south_pole') as PlanetaryTargetId;
    if (targetId !== 'moon_south_pole' && targetId !== 'mars_jezero') throw new HttpError(422, 'invalid_target', 'Unknown target');
    const target = planetaryProfile(targetId);
    const earth = alignBaseline(earthSiteProfile(site), target);
    json(res, 200, { site: site.id, target: targetId, comparisons: DIMENSIONS.map((d) => compareMeasurements(earth.measurements[d.key], target.measurements[d.key])) });
  });

  const dist = resolve(ROOT, 'dist');
  const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
  const serveStatic = (res: ServerResponse, pathname: string) => {
    if (!existsSync(dist)) return false;
    const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dist, safe);
    if (!file.startsWith(dist)) return false;
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
    return true;
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && serveStatic(res, url.pathname)) return;
        throw new HttpError(404, 'not_found', 'Not found');
      }
      limit(`all:${req.socket.remoteAddress}`, 600, 300);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const match = url.pathname.match(r.pattern);
        if (!match) continue;
        if (r.mutating && config.apiToken) {
          const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
          const expected = Buffer.from(config.apiToken);
          if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, 'unauthorized', 'Missing or invalid bearer token');
        }
        const params = Object.fromEntries(r.keys.map((k, i) => [k, match[i + 1]]));
        await r.handler(req, res, params, url);
        return;
      }
      throw new HttpError(404, 'not_found', 'No such endpoint');
    } catch (error) {
      if (res.headersSent) return res.end();
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : 'internal_error';
      const message = error instanceof HttpError ? error.message : 'Internal error';
      if (status === 500) console.error('[odyssey]', redact(String((error as Error).stack ?? error)));
      json(res, status, { error: { code, message: redact(message) } });
    }
  });
}

if (import.meta.main) {
  const store = new Store(config.dbPath);
  store.recoverInterrupted();
  const runner = new AgentRunner(store, () => {
    const provider = defaultProvider();
    return provider.available() ? provider : null;
  });
  const server = createApp(store, runner);
  server.listen(config.port, config.host, () => {
    const caps = capabilitySummary();
    console.log(`[odyssey] backend on http://${config.host}:${config.port} · LLM ${caps.llm ? caps.llm.model : 'not configured (deterministic planner)'} · search ${caps.search ? 'enabled' : 'disabled'}`);
  });
}
