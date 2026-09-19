import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Adapter, Env, HarnessItem, Session, SourceRef, ToolCall, Turn } from '../../core/types.js';
import { exists, fileSources, firstLine, harnessEntry, harnessFile, markCorrections, newTurn, toIso } from '../../core/util.js';

const TOOL = 'cursor' as const;

export function cursorUserDir(env: Env): string {
  if (process.env.CURSOR_USER_DIR) return process.env.CURSOR_USER_DIR;
  if (process.platform === 'darwin') return path.join(env.home, 'Library', 'Application Support', 'Cursor', 'User');
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(env.home, 'AppData', 'Roaming'), 'Cursor', 'User');
  return path.join(env.home, '.config', 'Cursor', 'User');
}

function dbPath(env: Env) {
  return path.join(cursorUserDir(env), 'globalStorage', 'state.vscdb');
}

async function workspaceFolders(env: Env): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const dir = path.join(cursorUserDir(env), 'workspaceStorage');
  let ids: string[] = [];
  try {
    ids = await readdir(dir);
  } catch {
    return map;
  }
  for (const id of ids) {
    try {
      const j = JSON.parse(await readFile(path.join(dir, id, 'workspace.json'), 'utf8'));
      const folder: string | undefined = j.folder ?? j.workspace;
      if (folder?.startsWith('file://')) map.set(id, decodeURIComponent(new URL(folder).pathname));
    } catch {
      /* no workspace.json */
    }
  }
  return map;
}

function toolCallFrom(tf: any): ToolCall {
  const name: string = tf.name ?? `tool_${tf.tool ?? 'unknown'}`;
  const status: string | undefined = tf.status;
  const ok = status === 'completed' ? true : status === 'error' || status === 'failed' ? false : null;
  let detail: string | null = null;
  if (name.startsWith('mcp_')) detail = name.split('_')[1] ?? null;
  return { name, ok, isSubagent: /task|subagent/i.test(name), detail };
}

interface Bubble {
  type?: number | string;
  text?: string;
  createdAt?: string | number;
  tokenCount?: { inputTokens?: number; outputTokens?: number };
  toolFormerData?: any;
}

/** Build a session from Cursor composer data plus its bubble lookup. Exported for tests. */
export function buildCursorSession(
  composer: any,
  getBubble: (bubbleId: string) => Bubble | null,
  project: string | null,
): Session | null {
  const turns: Turn[] = [];
  const headers: any[] = composer.fullConversationHeadersOnly ?? [];
  const inline: any[] = composer.conversation ?? [];
  const bubbles: Bubble[] = headers.length
    ? headers.map((h) => getBubble(h.bubbleId) ?? { type: h.type })
    : inline;
  let current: Turn | null = null;
  for (const b of bubbles) {
    const role = Number(b.type) === 1 ? 'user' : 'assistant';
    const at = toIso(b.createdAt ?? null);
    if (role === 'user') {
      current = newTurn('user', (b.text ?? '').trim(), at);
      turns.push(current);
      continue;
    }
    if (!current || current.role !== 'assistant') {
      current = newTurn('assistant', '', at);
      turns.push(current);
    }
    if (b.text) current.text += (current.text ? '\n' : '') + b.text;
    if (b.tokenCount) {
      current.tokensIn = (current.tokensIn ?? 0) + (b.tokenCount.inputTokens ?? 0);
      current.tokensOut = (current.tokensOut ?? 0) + (b.tokenCount.outputTokens ?? 0);
    }
    if (b.toolFormerData) current.toolCalls.push(toolCallFrom(b.toolFormerData));
  }
  if (!turns.some((t) => t.role === 'user')) return null;
  markCorrections(turns);
  const firstUser = turns.find((t) => t.role === 'user' && t.text);
  const model = composer.modelConfig?.modelName;
  return {
    id: `${TOOL}:${composer.composerId}`,
    tool: TOOL,
    project,
    title: composer.name || (firstUser ? firstLine(firstUser.text) : null),
    startedAt: toIso(composer.createdAt),
    endedAt: toIso(composer.lastUpdatedAt ?? composer.createdAt),
    model: model && model !== 'default' ? model : null,
    turns,
  };
}

export const cursor: Adapter = {
  id: TOOL,
  label: 'Cursor',
  async detect(env) {
    const p = dbPath(env);
    if (!(await exists(p))) return { found: false, detail: `${p} not found`, paths: [] };
    return { found: true, detail: 'state.vscdb found', paths: [p] };
  },
  async listSources(env) {
    const p = dbPath(env);
    return (await exists(p)) ? fileSources(TOOL, [p]) : [];
  },
  async parse(src: SourceRef, env: Env) {
    const folders = await workspaceFolders(env);
    const db = new DatabaseSync(src.path, { readOnly: true });
    try {
      const kvExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'").get();
      if (!kvExists) return [];
      const workspaceOf = new Map<string, string>();
      const hasHeaders = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='composerHeaders'").get();
      if (hasHeaders) {
        for (const r of db.prepare('SELECT composerId, workspaceId FROM composerHeaders').all() as any[]) {
          if (r.workspaceId && folders.has(String(r.workspaceId))) workspaceOf.set(r.composerId, folders.get(String(r.workspaceId))!);
        }
      }
      const bubbleStmt = db.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
      const sessions: Session[] = [];
      for (const row of db.prepare("SELECT value FROM cursorDiskKV WHERE key LIKE 'composerData:%'").all() as any[]) {
        let composer: any;
        try {
          composer = JSON.parse(String(row.value));
        } catch {
          continue;
        }
        if (!composer?.composerId) continue;
        const getBubble = (bubbleId: string): Bubble | null => {
          const r = bubbleStmt.get(`bubbleId:${composer.composerId}:${bubbleId}`) as any;
          if (!r?.value) return null;
          try {
            return JSON.parse(String(r.value));
          } catch {
            return null;
          }
        };
        const s = buildCursorSession(composer, getBubble, workspaceOf.get(composer.composerId) ?? null);
        if (s) sessions.push(s);
      }
      return sessions;
    } finally {
      db.close();
    }
  },
  async scanHarness(env) {
    const out: HarnessItem[] = [];
    const cursorHome = path.join(env.home, '.cursor');
    const mcpItems = async (p: string, scope: 'global' | 'project') => {
      const f = await harnessFile(TOOL, 'mcp', 'mcp.json', p, scope);
      if (!f) return;
      try {
        const j = JSON.parse(await readFile(p, 'utf8'));
        for (const name of Object.keys(j.mcpServers ?? {})) out.push(harnessEntry(TOOL, 'mcp', name, p, scope, f.updatedAt));
      } catch {
        /* malformed */
      }
    };
    await mcpItems(path.join(cursorHome, 'mcp.json'), 'global');
    for (const dir of env.projectDirs) {
      await mcpItems(path.join(dir, '.cursor', 'mcp.json'), 'project');
      const legacy = await harnessFile(TOOL, 'rule', '.cursorrules', path.join(dir, '.cursorrules'), 'project');
      if (legacy) out.push(legacy);
      const rulesDir = path.join(dir, '.cursor', 'rules');
      let files: string[] = [];
      try {
        files = await readdir(rulesDir);
      } catch {
        /* none */
      }
      for (const f of files) {
        if (/\.(mdc|md)$/.test(f)) {
          const i = await harnessFile(TOOL, 'rule', f.replace(/\.mdc?$/, ''), path.join(rulesDir, f), 'project');
          if (i) out.push(i);
        }
      }
    }
    return out;
  },
};
