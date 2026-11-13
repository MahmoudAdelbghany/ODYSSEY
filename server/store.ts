/**
 * Persistent run history, append-only event log, source cache and feedback.
 * Uses Node's built-in SQLite (node:sqlite), so no native dependency is needed.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RunRow {
  id: string;
  brief: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  planner: string;
  model: string | null;
  error: string | null;
  options: Record<string, unknown>;
}

export interface EventRow {
  runId: string;
  seq: number;
  ts: string;
  type: string;
  payload: unknown;
}

export interface SourceRow {
  url: string;
  sha256: string;
  retrievedAt: string;
  status: number;
  contentType: string;
  title: string | null;
  publishedDate: string | null;
  doi: string | null;
  text: string;
  bytes: number;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, brief TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, planner TEXT NOT NULL,
        model TEXT, error TEXT, options TEXT NOT NULL,
        state TEXT, messages TEXT, report TEXT);
      CREATE TABLE IF NOT EXISTS events (
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL, ts TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY (run_id, seq));
      CREATE TABLE IF NOT EXISTS sources (
        url TEXT PRIMARY KEY, sha256 TEXT NOT NULL, retrieved_at TEXT NOT NULL,
        status INTEGER NOT NULL, content_type TEXT NOT NULL, title TEXT,
        published_date TEXT, doi TEXT, text TEXT NOT NULL, bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL, category TEXT NOT NULL, target TEXT,
        details TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending_review');
    `);
  }

  createRun(brief: string, planner: string, model: string | null, options: Record<string, unknown>): RunRow {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO runs (id, brief, status, created_at, updated_at, planner, model, options) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, brief, 'queued', now, now, planner, model, JSON.stringify(options));
    return this.getRun(id)!;
  }

  getRun(id: string): RunRow | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, string> | undefined;
    return row ? toRun(row) : null;
  }

  listRuns(limit = 50): RunRow[] {
    return (this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(limit) as Record<string, string>[]).map(toRun);
  }

  setStatus(id: string, status: RunStatus, error: string | null = null) {
    this.db.prepare('UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(status, error, new Date().toISOString(), id);
  }

  setPlanner(id: string, planner: string) {
    this.db.prepare('UPDATE runs SET planner = ?, updated_at = ? WHERE id = ?').run(planner, new Date().toISOString(), id);
  }

  saveSnapshot(id: string, state: unknown, messages: unknown) {
    this.db
      .prepare('UPDATE runs SET state = ?, messages = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(state), JSON.stringify(messages), new Date().toISOString(), id);
  }

  loadSnapshot(id: string): { state: unknown; messages: unknown } | null {
    const row = this.db.prepare('SELECT state, messages FROM runs WHERE id = ?').get(id) as { state: string | null; messages: string | null } | undefined;
    if (!row?.state) return null;
    return { state: JSON.parse(row.state), messages: row.messages ? JSON.parse(row.messages) : [] };
  }

  saveReport(id: string, report: unknown) {
    this.db.prepare('UPDATE runs SET report = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(report), new Date().toISOString(), id);
  }

  getReport(id: string): unknown | null {
    const row = this.db.prepare('SELECT report FROM runs WHERE id = ?').get(id) as { report: string | null } | undefined;
    return row?.report ? JSON.parse(row.report) : null;
  }

  appendEvent(runId: string, type: string, payload: unknown): EventRow {
    const next = this.db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM events WHERE run_id = ?').get(runId) as { seq: number };
    const ts = new Date().toISOString();
    this.db.prepare('INSERT INTO events (run_id, seq, ts, type, payload) VALUES (?,?,?,?,?)').run(runId, next.seq, ts, type, JSON.stringify(payload));
    return { runId, seq: next.seq, ts, type, payload };
  }

  events(runId: string, afterSeq = 0): EventRow[] {
    return (this.db.prepare('SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq').all(runId, afterSeq) as Record<string, string | number>[]).map((row) => ({
      runId: String(row.run_id),
      seq: Number(row.seq),
      ts: String(row.ts),
      type: String(row.type),
      payload: JSON.parse(String(row.payload)),
    }));
  }

  putSource(source: SourceRow) {
    this.db
      .prepare('INSERT OR REPLACE INTO sources (url, sha256, retrieved_at, status, content_type, title, published_date, doi, text, bytes) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(source.url, source.sha256, source.retrievedAt, source.status, source.contentType, source.title, source.publishedDate, source.doi, source.text, source.bytes);
  }

  getSource(url: string): SourceRow | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE url = ?').get(url) as Record<string, string | number | null> | undefined;
    if (!row) return null;
    return {
      url: String(row.url),
      sha256: String(row.sha256),
      retrievedAt: String(row.retrieved_at),
      status: Number(row.status),
      contentType: String(row.content_type),
      title: row.title as string | null,
      publishedDate: row.published_date as string | null,
      doi: row.doi as string | null,
      text: String(row.text),
      bytes: Number(row.bytes),
    };
  }

  addFeedback(runId: string, category: string, target: string | null, details: string) {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO feedback (id, run_id, created_at, category, target, details) VALUES (?,?,?,?,?,?)')
      .run(id, runId, new Date().toISOString(), category, target, details);
    return id;
  }

  listFeedback(runId: string) {
    return this.db.prepare('SELECT * FROM feedback WHERE run_id = ? ORDER BY created_at').all(runId);
  }

  /** Mark runs that were running when the process stopped; they can be resumed. */
  recoverInterrupted() {
    this.db.prepare("UPDATE runs SET status = 'failed', error = 'Server restarted during the run; resume to continue.' WHERE status IN ('running','queued')").run();
  }
}

function toRun(row: Record<string, string>): RunRow {
  return {
    id: row.id,
    brief: row.brief,
    status: row.status as RunStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    planner: row.planner,
    model: row.model ?? null,
    error: row.error ?? null,
    options: JSON.parse(row.options || '{}'),
  };
}
