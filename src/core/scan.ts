import os from 'node:os';
import path from 'node:path';
import { ADAPTERS } from '../adapters/index.js';
import { Store } from './store.js';
import type { DetectResult, Env, HarnessItem, Session, ToolId } from './types.js';
import { exists } from './util.js';

const MAX_TEXT = 4000;

export function makeEnv(): Env {
  const home = process.env.AI_MENSA_SOURCE_HOME ?? os.homedir();
  const dataDir = process.env.AI_MENSA_HOME ?? path.join(os.homedir(), '.ai-mensa');
  return { home, dataDir, projectDirs: [] };
}

export interface ScanReport {
  tools: { tool: ToolId; label: string; detect: DetectResult; sources: number; parsed: number; failed: number }[];
  sessions: number;
  ms: number;
}

/** Keep the cache small: long pasted logs don't change any metric beyond their length. */
function trimSession(s: Session): Session {
  for (const t of s.turns) {
    if (t.text.length > MAX_TEXT) t.text = t.text.slice(0, MAX_TEXT) + `\n…[${t.text.length - MAX_TEXT} chars truncated]`;
  }
  return s;
}

export async function scan(env: Env, store: Store, log: (msg: string) => void = () => {}): Promise<ScanReport> {
  const t0 = Date.now();
  const report: ScanReport = { tools: [], sessions: 0, ms: 0 };
  for (const a of ADAPTERS) {
    const detect = await a.detect(env);
    const row = { tool: a.id, label: a.label, detect, sources: 0, parsed: 0, failed: 0 };
    report.tools.push(row);
    const sources = detect.found ? await a.listSources(env) : [];
    row.sources = sources.length;
    for (const src of sources) {
      if (store.isFresh(src)) continue;
      try {
        const sessions = (await a.parse(src, env)).map(trimSession);
        store.replaceSource(a.id, src, sessions);
        row.parsed++;
      } catch (e) {
        row.failed++;
        log(`  ! ${a.label}: failed to parse ${src.path}: ${(e as Error).message}`);
      }
    }
    store.pruneSources(a.id, new Set(sources.map((s) => s.key)));
  }
  report.sessions = store.allSessions().length;
  report.ms = Date.now() - t0;
  return report;
}

/** Project directories worth scanning for project-scoped harness files, busiest first. */
export async function discoverProjectDirs(sessions: Session[], limit = 40): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const s of sessions) if (s.project) counts.set(s.project, (counts.get(s.project) ?? 0) + 1);
  const out: string[] = [];
  for (const [dir] of [...counts].sort((a, b) => b[1] - a[1])) {
    if (out.length >= limit) break;
    if (path.isAbsolute(dir) && (await exists(dir))) out.push(dir);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Fill usageCount on harness items from session activity. */
export function countUsage(items: HarnessItem[], sessions: Session[]): void {
  const byTool = new Map<ToolId, Session[]>();
  for (const s of sessions) byTool.set(s.tool, [...(byTool.get(s.tool) ?? []), s]);
  for (const item of items) {
    const ss = byTool.get(item.tool) ?? [];
    const name = norm(item.name);
    const matches = (v: string | null | undefined) => {
      if (!v) return false;
      const n = norm(v);
      return n === name || n.endsWith(`_${name}`);
    };
    switch (item.kind) {
      case 'skill':
      case 'command':
      case 'agent': {
        let n = 0;
        for (const s of ss)
          for (const t of s.turns) {
            n += t.invoked.filter(matches).length;
            n += t.toolCalls.filter((c) => (item.kind === 'agent' ? c.isSubagent : !c.isSubagent) && matches(c.detail)).length;
          }
        item.usageCount = n;
        break;
      }
      case 'mcp': {
        let n = 0;
        for (const s of ss) for (const t of s.turns) n += t.toolCalls.filter((c) => matches(c.detail)).length;
        item.usageCount = n;
        break;
      }
      case 'instruction': {
        // an instructions file is "used" by every session it applies to
        const dir = item.scope === 'project' && item.path ? path.dirname(item.path).replace(/[\\/]\.claude$/, '') : null;
        item.usageCount = ss.filter((s) => !dir || (s.project ?? '').startsWith(dir)).length;
        break;
      }
      default:
        item.usageCount = null;
    }
  }
}

export async function scanHarness(env: Env, sessions: Session[]): Promise<Map<ToolId, HarnessItem[]>> {
  const out = new Map<ToolId, HarnessItem[]>();
  const e = { ...env, projectDirs: await discoverProjectDirs(sessions) };
  for (const a of ADAPTERS) {
    if (!a.scanHarness) continue;
    let items: HarnessItem[] = [];
    try {
      items = await a.scanHarness(e);
    } catch {
      items = [];
    }
    // de-duplicate (same file reachable from two project dirs)
    const seen = new Set<string>();
    items = items.filter((i) => {
      const k = `${i.kind}|${i.name}|${i.path}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    countUsage(items, sessions);
    out.set(a.id, items);
  }
  return out;
}
