import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LlmResult } from '../server/api-types.js';
import type { Session, SourceRef, ToolId } from './types.js';

const SCHEMA_VERSION = 3;

export class Store {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'cache.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS sources (key TEXT PRIMARY KEY, tool TEXT, mtime INTEGER, size INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, source_key TEXT, tool TEXT, started_at TEXT, json TEXT);
      CREATE INDEX IF NOT EXISTS sessions_source ON sessions(source_key);
      CREATE TABLE IF NOT EXISTS llm_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, json TEXT);
    `);
    const v = this.db.prepare("SELECT v FROM meta WHERE k='schema'").get() as { v: string } | undefined;
    if (v && Number(v.v) !== SCHEMA_VERSION) {
      // parser output changed shape: drop the cache, it is rebuilt from the logs
      this.db.exec('DELETE FROM sources; DELETE FROM sessions;');
    }
    this.db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', ?)").run(String(SCHEMA_VERSION));
  }

  isFresh(src: SourceRef): boolean {
    const r = this.db.prepare('SELECT mtime, size FROM sources WHERE key = ?').get(src.key) as any;
    return !!r && r.mtime === src.mtimeMs && r.size === src.size;
  }

  replaceSource(tool: ToolId, src: SourceRef, sessions: Session[]): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM sessions WHERE source_key = ?').run(src.key);
      const ins = this.db.prepare('INSERT OR REPLACE INTO sessions (id, source_key, tool, started_at, json) VALUES (?, ?, ?, ?, ?)');
      for (const s of sessions) ins.run(s.id, src.key, tool, s.startedAt, JSON.stringify(s));
      this.db
        .prepare('INSERT OR REPLACE INTO sources (key, tool, mtime, size) VALUES (?, ?, ?, ?)')
        .run(src.key, tool, src.mtimeMs, src.size);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Remove sources of `tool` that are no longer present. Returns how many were dropped. */
  pruneSources(tool: ToolId, keep: Set<string>): number {
    const rows = this.db.prepare('SELECT key FROM sources WHERE tool = ?').all(tool) as { key: string }[];
    let n = 0;
    for (const { key } of rows) {
      if (keep.has(key)) continue;
      this.db.prepare('DELETE FROM sessions WHERE source_key = ?').run(key);
      this.db.prepare('DELETE FROM sources WHERE key = ?').run(key);
      n++;
    }
    return n;
  }

  allSessions(): Session[] {
    const rows = this.db.prepare('SELECT json FROM sessions ORDER BY started_at DESC').all() as { json: string }[];
    return rows.map((r) => JSON.parse(r.json));
  }

  saveLlm(result: LlmResult): void {
    this.db.prepare('INSERT INTO llm_scores (at, json) VALUES (?, ?)').run(result.at, JSON.stringify(result));
  }

  latestLlm(): LlmResult | null {
    const r = this.db.prepare('SELECT json FROM llm_scores ORDER BY id DESC LIMIT 1').get() as { json: string } | undefined;
    return r ? JSON.parse(r.json) : null;
  }

  close(): void {
    this.db.close();
  }
}
