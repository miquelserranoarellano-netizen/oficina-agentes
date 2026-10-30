import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AgentId,
  ChatMessage,
  LogEntry,
  LogKind,
  Project,
  ProjectStatus,
  ResultInfo,
  Speed,
  Task,
  TaskStatus,
} from '../shared/types.ts';

// SQLite con el módulo que trae Node (sin compilar nada, también en ARM64).

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  totp_secret: string | null;
  totp_pending: string | null;
  totp_last_step: number;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_pending TEXT,
  totp_last_step INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS login_failures (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_failures_ip_at ON login_failures (ip, at);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT NOT NULL,
  progress REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL,
  duration REAL NOT NULL,
  gain REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks (status);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  agent_id TEXT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  day TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS llm_calls_day ON llm_calls (day);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  error INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chat_conversation ON chat_messages (agent_id, project_id, id);
`;

/** Columnas añadidas en la fase 3 a la tabla de tareas. */
const TASK_COLUMNS: Array<[string, string]> = [
  ['brief', 'TEXT'],
  ['source', 'TEXT'],
  ['result_file', 'TEXT'],
  ['summary', 'TEXT'],
  ['error', 'TEXT'],
  ['started_at', 'INTEGER'],
];

export function openDb(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'oficina.db'));
  db.exec(SCHEMA);
  const existing = new Set((db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name));
  for (const [name, type] of TASK_COLUMNS) {
    if (!existing.has(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
  }
  return new Store(db);
}

function taskFromRow(r: Record<string, unknown>): Task {
  const opt = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    agentId: String(r.agent_id) as AgentId,
    title: String(r.title),
    status: String(r.status) as TaskStatus,
    progress: Number(r.progress),
    duration: Number(r.duration),
    gain: Number(r.gain),
    createdAt: Number(r.created_at),
    brief: opt(r.brief),
    source: opt(r.source) as Task['source'],
    resultFile: opt(r.result_file),
    summary: opt(r.summary),
    error: opt(r.error),
    startedAt: r.started_at === null || r.started_at === undefined ? undefined : Number(r.started_at),
  };
}

export class Store {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /* ---------- ajustes ---------- */

  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string) {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  getSettings(): { paused: boolean; speed: Speed; autopilot: boolean } {
    const speed = Number(this.getMeta('speed') ?? 1);
    return {
      paused: this.getMeta('paused') === '1',
      speed: speed === 2 || speed === 4 ? speed : 1,
      // Apagado por defecto: con IA de pago, que no gaste sin que lo pidas.
      autopilot: this.getMeta('autopilot') === '1',
    };
  }

  saveSettings(paused: boolean, speed: Speed, autopilot: boolean) {
    this.setMeta('paused', paused ? '1' : '0');
    this.setMeta('speed', String(speed));
    this.setMeta('autopilot', autopilot ? '1' : '0');
  }

  /* ---------- proyectos ---------- */

  loadProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY position').all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description),
      color: String(r.color),
      progress: Number(r.progress),
      status: String(r.status) as ProjectStatus,
      createdAt: String(r.created_at),
    }));
  }

  /** Guarda la lista completa (orden incluido) y borra las que ya no están. */
  saveProjects(projects: Project[]) {
    const upsert = this.db.prepare(`
      INSERT INTO projects (id, position, name, description, color, progress, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET position = excluded.position, name = excluded.name,
        description = excluded.description, color = excluded.color, progress = excluded.progress,
        status = excluded.status`);
    this.transaction(() => {
      projects.forEach((p, i) => upsert.run(p.id, i, p.name, p.description, p.color, p.progress, p.status, p.createdAt));
      const ids = projects.map((p) => p.id);
      const placeholders = ids.map(() => '?').join(',');
      if (ids.length) this.db.prepare(`DELETE FROM projects WHERE id NOT IN (${placeholders})`).run(...ids);
      else this.db.exec('DELETE FROM projects');
    });
  }

  /* ---------- tareas ---------- */

  saveTask(t: Task) {
    this.db
      .prepare(`
        INSERT INTO tasks (id, project_id, agent_id, title, status, progress, duration, gain, created_at, updated_at,
          brief, source, result_file, summary, error, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, progress = excluded.progress,
          updated_at = excluded.updated_at, result_file = excluded.result_file, summary = excluded.summary,
          error = excluded.error, started_at = excluded.started_at`)
      .run(
        t.id,
        t.projectId,
        t.agentId,
        t.title,
        t.status,
        t.progress,
        t.duration,
        t.gain,
        t.createdAt,
        Date.now(),
        t.brief ?? null,
        t.source ?? null,
        t.resultFile ?? null,
        t.summary ?? null,
        t.error ?? null,
        t.startedAt ?? null,
      );
  }

  /** Tareas pendientes o a medias (se recuperan al arrancar). */
  activeTasks(): Task[] {
    const rows = this.db
      .prepare("SELECT * FROM tasks WHERE status IN ('pendiente', 'asignada', 'en-curso') ORDER BY created_at")
      .all() as Array<Record<string, unknown>>;
    return rows.map(taskFromRow);
  }

  /** Últimas tareas terminadas con resultado, la más reciente primero. */
  doneTasks(limit: number, projectId?: string): Task[] {
    const rows = (
      projectId
        ? this.db
            .prepare("SELECT * FROM tasks WHERE status = 'hecha' AND project_id = ? ORDER BY updated_at DESC LIMIT ?")
            .all(projectId, limit)
        : this.db.prepare("SELECT * FROM tasks WHERE status = 'hecha' ORDER BY updated_at DESC LIMIT ?").all(limit)
    ) as Array<Record<string, unknown>>;
    return rows.map(taskFromRow);
  }

  results(projectId: string): ResultInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks WHERE project_id = ? AND result_file IS NOT NULL ORDER BY updated_at DESC LIMIT 200')
      .all(projectId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      taskId: String(r.id),
      projectId: String(r.project_id),
      agentId: String(r.agent_id) as AgentId,
      title: String(r.title),
      at: Number(r.updated_at),
      file: String(r.result_file),
      summary: r.summary ? String(r.summary) : '',
    }));
  }

  taskById(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? taskFromRow(row) : undefined;
  }

  /* ---------- llamadas a la IA ---------- */

  addLlmCall(c: {
    at: number;
    day: string;
    agentId: string;
    provider: string;
    model: string;
    purpose: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    ok: boolean;
    error?: string;
  }) {
    this.db
      .prepare(
        'INSERT INTO llm_calls (at, day, agent_id, provider, model, purpose, tokens_in, tokens_out, cost_usd, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(c.at, c.day, c.agentId, c.provider, c.model, c.purpose, c.tokensIn, c.tokensOut, c.cost, c.ok ? 1 : 0, c.error ?? null);
  }

  llmDay(day: string): { calls: number; spent: number } {
    const row = this.db
      .prepare('SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS spent FROM llm_calls WHERE day = ?')
      .get(day) as { calls: number; spent: number };
    return { calls: Number(row.calls), spent: Number(row.spent) };
  }

  /* ---------- chat ---------- */

  addChat(m: Omit<ChatMessage, 'id'>): ChatMessage {
    const res = this.db
      .prepare('INSERT INTO chat_messages (at, agent_id, project_id, role, text, error) VALUES (?, ?, ?, ?, ?, ?)')
      .run(m.at, m.agentId, m.projectId ?? '', m.role, m.text, m.error ? 1 : 0);
    return { ...m, id: Number(res.lastInsertRowid) };
  }

  /** Últimos mensajes de una conversación, en orden cronológico. */
  chatHistory(agentId: string, projectId: string | null, limit: number): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM chat_messages WHERE agent_id = ? AND project_id = ? ORDER BY id DESC LIMIT ?')
      .all(agentId, projectId ?? '', limit) as Array<Record<string, unknown>>;
    return rows.reverse().map((r) => ({
      id: Number(r.id),
      at: Number(r.at),
      agentId: String(r.agent_id) as AgentId,
      projectId: r.project_id ? String(r.project_id) : null,
      role: String(r.role) as ChatMessage['role'],
      text: String(r.text),
      error: Number(r.error) === 1 || undefined,
    }));
  }

  /* ---------- actividad ---------- */

  addActivity(e: LogEntry) {
    this.db
      .prepare('INSERT OR REPLACE INTO activity (id, at, agent_id, kind, text) VALUES (?, ?, ?, ?, ?)')
      .run(e.id, e.at, e.agentId ?? null, e.kind, e.text);
  }

  recentActivity(limit: number): LogEntry[] {
    const rows = this.db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      at: Number(r.at),
      agentId: r.agent_id ? (String(r.agent_id) as AgentId) : undefined,
      kind: String(r.kind) as LogKind,
      text: String(r.text),
    }));
  }

  /* ---------- usuarios ---------- */

  userCount(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n);
  }

  findUser(username: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  }

  userById(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  /** Un único usuario: crear uno nuevo borra el anterior y sus sesiones. */
  replaceUser(username: string, passwordHash: string) {
    this.transaction(() => {
      this.db.exec('DELETE FROM sessions');
      this.db.exec('DELETE FROM users');
      this.db
        .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
        .run(username, passwordHash, Date.now());
    });
  }

  setTotpPending(userId: number, secret: string | null) {
    this.db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(secret, userId);
  }

  setTotp(userId: number, secret: string | null, lastStep: number) {
    this.db
      .prepare('UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_last_step = ? WHERE id = ?')
      .run(secret, lastStep, userId);
  }

  setTotpLastStep(userId: number, step: number) {
    this.db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, userId);
  }

  /* ---------- sesiones ---------- */

  createSession(tokenHash: string, userId: number, expiresAt: number, ip: string, userAgent: string) {
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tokenHash, userId, Date.now(), expiresAt, ip, userAgent.slice(0, 200));
  }

  sessionUser(tokenHash: string): UserRow | undefined {
    return this.db
      .prepare(
        'SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
      )
      .get(tokenHash, Date.now()) as UserRow | undefined;
  }

  deleteSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  /* ---------- intentos fallidos ---------- */

  addFailure(ip: string) {
    this.db.prepare('INSERT INTO login_failures (ip, at) VALUES (?, ?)').run(ip, Date.now());
  }

  /** Marcas de los últimos fallos de esa IP dentro de la ventana, el más reciente primero. */
  recentFailures(ip: string, since: number, limit: number): number[] {
    const rows = this.db
      .prepare('SELECT at FROM login_failures WHERE ip = ? AND at > ? ORDER BY at DESC LIMIT ?')
      .all(ip, since, limit) as Array<{ at: number }>;
    return rows.map((r) => Number(r.at));
  }

  clearFailures(ip: string) {
    this.db.prepare('DELETE FROM login_failures WHERE ip = ?').run(ip);
  }

  cleanup(olderThan: number) {
    this.db.prepare('DELETE FROM login_failures WHERE at < ?').run(olderThan);
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }

  private transaction(fn: () => void) {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
