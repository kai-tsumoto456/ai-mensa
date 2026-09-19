import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { HarnessItem, HarnessKind, Session, SessionSummary, SourceRef, ToolId, Turn } from './types.js';

export async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Recursively list files whose name passes `filter`. Missing dirs yield []. */
export async function walk(dir: string, filter: (name: string) => boolean, maxDepth = 6): Promise<string[]> {
  const out: string[] = [];
  async function rec(d: string, depth: number) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth && e.name !== 'node_modules' && !e.name.startsWith('.git')) await rec(p, depth + 1);
      } else if (e.isFile() && filter(e.name)) {
        out.push(p);
      }
    }
  }
  await rec(dir, 0);
  return out;
}

export async function fileSources(prefix: string, files: string[]): Promise<SourceRef[]> {
  const out: SourceRef[] = [];
  for (const f of files) {
    try {
      const s = await stat(f);
      out.push({ key: `${prefix}:${f}`, path: f, mtimeMs: Math.floor(s.mtimeMs), size: s.size });
    } catch {
      /* vanished */
    }
  }
  return out;
}

export async function harnessFile(
  tool: ToolId,
  kind: HarnessKind,
  name: string,
  p: string,
  scope: 'global' | 'project',
): Promise<HarnessItem | null> {
  try {
    const s = await stat(p);
    return {
      tool,
      kind,
      name,
      path: p,
      scope,
      updatedAt: new Date(s.mtimeMs).toISOString(),
      sizeBytes: s.isFile() ? s.size : null,
      usageCount: null,
    };
  } catch {
    return null;
  }
}

export function harnessEntry(
  tool: ToolId,
  kind: HarnessKind,
  name: string,
  p: string | null,
  scope: 'global' | 'project',
  updatedAt: string | null = null,
): HarnessItem {
  return { tool, kind, name, path: p, scope, updatedAt, sizeBytes: null, usageCount: null };
}

export function toIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // seconds vs milliseconds
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

// Short follow-ups that push back on the previous answer. Heuristic by design:
// it only feeds aggregate rates; the optional LLM scoring judges corrections in context.
const CORRECTION_START: RegExp[] = [
  /^(いや|いいえ|違|ちが|そうじゃな|そうではな|やり直|戻して|元に戻|だめ|ダメ|直って(い)?ない|できてない|動かない|間違)/,
  /^(no\b|nope|wrong|that'?s not|not what|undo|revert|still (not|broken|failing)|it (still )?doesn'?t)/i,
];
const CORRECTION_ANYWHERE: RegExp[] = [
  /(違います|違うよ|ちがう|そうじゃない|やり直して|元に戻して|前に戻して|直ってない|直っていない|できてない|動かない|間違って(い|る))/,
  /\b(that'?s wrong|not what i (asked|wanted|meant)|you broke|doesn'?t work|still broken|try again)\b/i,
];

export function isCorrection(text: string, hasPreviousAssistant: boolean): boolean {
  if (!hasPreviousAssistant) return false;
  const t = text.trim();
  if (!t || t.length > 200) return false;
  if (CORRECTION_START.some((re) => re.test(t))) return true;
  return t.length <= 80 && CORRECTION_ANYWHERE.some((re) => re.test(t));
}

/** Mark corrections on user turns in place. */
export function markCorrections(turns: Turn[]): void {
  let sawAssistant = false;
  for (const t of turns) {
    if (t.role === 'assistant') sawAssistant = true;
    else t.isCorrection = isCorrection(t.text, sawAssistant);
  }
}

export function newTurn(role: 'user' | 'assistant', text: string, at: string | null): Turn {
  return {
    role,
    text,
    at,
    tokensIn: null,
    tokensOut: null,
    tokensCached: null,
    toolCalls: [],
    isCorrection: false,
    interrupted: false,
    invoked: [],
  };
}

export function summarize(s: Session): SessionSummary {
  let userTurns = 0,
    assistantTurns = 0,
    toolCalls = 0,
    toolErrors = 0,
    corrections = 0,
    interruptions = 0,
    tokensIn = 0,
    tokensOut = 0;
  for (const t of s.turns) {
    if (t.role === 'user') userTurns++;
    else assistantTurns++;
    toolCalls += t.toolCalls.length;
    toolErrors += t.toolCalls.filter((c) => c.ok === false).length;
    if (t.isCorrection) corrections++;
    if (t.interrupted) interruptions++;
    tokensIn += t.tokensIn ?? 0;
    tokensOut += t.tokensOut ?? 0;
  }
  return {
    id: s.id,
    tool: s.tool,
    project: s.project,
    title: s.title,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    model: s.model,
    userTurns,
    assistantTurns,
    toolCalls,
    toolErrors,
    corrections,
    interruptions,
    tokensIn,
    tokensOut,
  };
}

export function firstLine(text: string, max = 80): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}
