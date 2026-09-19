import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Adapter, Env, HarnessItem, Session, SourceRef, ToolCall, Turn } from '../../core/types.js';
import {
  exists,
  fileSources,
  firstLine,
  harnessEntry,
  harnessFile,
  markCorrections,
  newTurn,
  toIso,
  walk,
} from '../../core/util.js';

const TOOL = 'claude-code' as const;

function projectsDir(env: Env) {
  return path.join(env.home, '.claude', 'projects');
}

// User-side text that is harness plumbing, not something the person typed.
const NOISE_PREFIXES = ['<local-command-', '<system-reminder>', '<bash-stdout>', '<bash-stderr>', 'Caveat:', '<task-notification>'];

function extractCommands(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/<command-name>\/?([^<]+)<\/command-name>/g)) out.push(m[1].trim());
  return out;
}

function cleanUserText(text: string): string {
  return text
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-name>([^<]*)<\/command-name>/g, '$1 ')
    .replace(/<command-args>([\s\S]*?)<\/command-args>/g, '$1')
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '')
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function parseClaudeJsonl(raw: string, fallbackId: string): Session | null {
  const turns: Turn[] = [];
  const pendingTools = new Map<string, ToolCall>();
  let assistantById = new Map<string, Turn>();
  let sessionId = fallbackId;
  let project: string | null = null;
  let model: string | null = null;
  let title: string | null = null;
  let customTitle: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d: any;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (d.type === 'ai-title' && d.aiTitle) title = d.aiTitle;
    if (d.type === 'custom-title' && d.customTitle) customTitle = d.customTitle;
    if (d.type === 'summary' && d.summary && !title) title = d.summary;
    if (d.type !== 'user' && d.type !== 'assistant') continue;
    if (d.isSidechain) continue;
    if (d.sessionId) sessionId = d.sessionId;
    if (!project && d.cwd) project = d.cwd;
    const at = toIso(d.timestamp);
    if (at) {
      if (!startedAt || at < startedAt) startedAt = at;
      if (!endedAt || at > endedAt) endedAt = at;
    }
    const msg = d.message ?? {};

    if (d.type === 'assistant') {
      if (!model && msg.model && msg.model !== '<synthetic>') model = msg.model;
      const key = msg.id ?? d.uuid;
      let turn = assistantById.get(key);
      if (!turn) {
        // consecutive assistant messages (tool loop) collapse into one turn per user turn
        const last = turns[turns.length - 1];
        if (last && last.role === 'assistant') turn = last;
        else {
          turn = newTurn('assistant', '', at);
          turns.push(turn);
        }
        assistantById.set(key, turn);
        const u = msg.usage;
        if (u) {
          const cached = u.cache_read_input_tokens ?? 0;
          turn.tokensIn = (turn.tokensIn ?? 0) + (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + cached;
          turn.tokensOut = (turn.tokensOut ?? 0) + (u.output_tokens ?? 0);
          turn.tokensCached = (turn.tokensCached ?? 0) + cached;
        }
      }
      for (const b of Array.isArray(msg.content) ? msg.content : []) {
        if (b.type === 'text' && b.text) turn.text += (turn.text ? '\n' : '') + b.text;
        if (b.type === 'tool_use') {
          const name: string = b.name ?? 'unknown';
          const input = b.input ?? {};
          const isSubagent = name === 'Task' || name === 'Agent';
          let detail: string | null = null;
          if (name === 'Skill') detail = input.skill ?? input.command ?? null;
          else if (isSubagent) detail = input.subagent_type ?? 'general-purpose';
          else if (name.startsWith('mcp__')) detail = name.split('__')[1] ?? null;
          const call: ToolCall = { name, ok: null, isSubagent, detail };
          turn.toolCalls.push(call);
          if (b.id) pendingTools.set(b.id, call);
        }
      }
      continue;
    }

    // user line
    if (d.isMeta) continue;
    const content = msg.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'tool_result') {
          const call = b.tool_use_id ? pendingTools.get(b.tool_use_id) : undefined;
          if (call) call.ok = !b.is_error;
        } else if (b.type === 'text' && b.text) text += (text ? '\n' : '') + b.text;
      }
    }
    if (!text.trim()) continue;
    if (text.startsWith('[Request interrupted by user')) {
      const last = turns[turns.length - 1];
      if (last && last.role === 'assistant') last.interrupted = true;
      continue;
    }
    if (NOISE_PREFIXES.some((p) => text.startsWith(p))) continue;
    const invoked = extractCommands(text);
    const cleaned = cleanUserText(text);
    if (!cleaned && invoked.length === 0) continue;
    const turn = newTurn('user', cleaned, at);
    turn.invoked = invoked;
    turns.push(turn);
    assistantById = new Map();
  }

  if (!turns.some((t) => t.role === 'user')) return null;
  markCorrections(turns);
  const firstUser = turns.find((t) => t.role === 'user');
  return {
    id: `${TOOL}:${sessionId}`,
    tool: TOOL,
    project,
    title: customTitle ?? title ?? (firstUser ? firstLine(firstUser.text) : null),
    startedAt,
    endedAt,
    model,
    turns,
  };
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readJson(p: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

function settingsItems(json: any, p: string, scope: 'global' | 'project', updatedAt: string | null): HarnessItem[] {
  const out: HarnessItem[] = [];
  if (!json) return out;
  for (const [event, entries] of Object.entries<any>(json.hooks ?? {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      for (const h of entry.hooks ?? []) {
        const label = `${event}${entry.matcher ? ` [${entry.matcher}]` : ''}: ${h.command ?? h.type ?? ''}`.slice(0, 160);
        out.push(harnessEntry(TOOL, 'hook', label, p, scope, updatedAt));
      }
    }
  }
  for (const mode of ['allow', 'ask', 'deny'] as const) {
    for (const rule of json.permissions?.[mode] ?? []) {
      out.push(harnessEntry(TOOL, 'permission', `${mode}: ${rule}`, p, scope, updatedAt));
    }
  }
  for (const [plugin, enabled] of Object.entries<any>(json.enabledPlugins ?? {})) {
    if (enabled) out.push(harnessEntry(TOOL, 'plugin', plugin, p, scope, updatedAt));
  }
  return out;
}

async function scanClaudeDir(base: string, scope: 'global' | 'project'): Promise<HarnessItem[]> {
  const out: HarnessItem[] = [];
  const push = (i: HarnessItem | null) => i && out.push(i);
  for (const f of await listDir(path.join(base, 'skills'))) {
    push(await harnessFile(TOOL, 'skill', f, path.join(base, 'skills', f, 'SKILL.md'), scope));
  }
  for (const f of await listDir(path.join(base, 'agents'))) {
    if (f.endsWith('.md')) push(await harnessFile(TOOL, 'agent', f.replace(/\.md$/, ''), path.join(base, 'agents', f), scope));
  }
  for (const f of await listDir(path.join(base, 'commands'))) {
    if (f.endsWith('.md')) push(await harnessFile(TOOL, 'command', f.replace(/\.md$/, ''), path.join(base, 'commands', f), scope));
  }
  for (const name of ['settings.json', 'settings.local.json']) {
    const p = path.join(base, name);
    const item = await harnessFile(TOOL, 'permission', name, p, scope);
    if (item) out.push(...settingsItems(await readJson(p), p, scope, item.updatedAt));
  }
  return out;
}

function mcpItems(servers: any, p: string, scope: 'global' | 'project', updatedAt: string | null): HarnessItem[] {
  return Object.keys(servers ?? {}).map((name) => harnessEntry(TOOL, 'mcp', name, p, scope, updatedAt));
}

export const claudeCode: Adapter = {
  id: TOOL,
  label: 'Claude Code',
  async detect(env) {
    const dir = projectsDir(env);
    if (!(await exists(dir))) return { found: false, detail: `${dir} not found`, paths: [] };
    const files = await walk(dir, (n) => n.endsWith('.jsonl'), 1);
    return { found: files.length > 0, detail: `${files.length} session files`, paths: [dir] };
  },
  async listSources(env) {
    // depth 1: <project>/<session>.jsonl — subagent transcripts live deeper and are skipped
    const files = await walk(projectsDir(env), (n) => n.endsWith('.jsonl'), 1);
    return fileSources(TOOL, files);
  },
  async parse(src: SourceRef) {
    const raw = await readFile(src.path, 'utf8');
    const s = parseClaudeJsonl(raw, path.basename(src.path, '.jsonl'));
    return s ? [s] : [];
  },
  async scanHarness(env) {
    const out: HarnessItem[] = [];
    const claudeHome = path.join(env.home, '.claude');
    const g = await harnessFile(TOOL, 'instruction', 'CLAUDE.md', path.join(claudeHome, 'CLAUDE.md'), 'global');
    if (g) out.push(g);
    out.push(...(await scanClaudeDir(claudeHome, 'global')));

    const claudeJsonPath = path.join(env.home, '.claude.json');
    const claudeJson = await readJson(claudeJsonPath);
    const cjItem = await harnessFile(TOOL, 'mcp', '.claude.json', claudeJsonPath, 'global');
    out.push(...mcpItems(claudeJson?.mcpServers, claudeJsonPath, 'global', cjItem?.updatedAt ?? null));

    for (const dir of env.projectDirs) {
      for (const rel of ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md']) {
        const i = await harnessFile(TOOL, 'instruction', rel, path.join(dir, rel), 'project');
        if (i) out.push(i);
      }
      out.push(...(await scanClaudeDir(path.join(dir, '.claude'), 'project')));
      const mcpPath = path.join(dir, '.mcp.json');
      const mcpFile = await harnessFile(TOOL, 'mcp', '.mcp.json', mcpPath, 'project');
      if (mcpFile) out.push(...mcpItems((await readJson(mcpPath))?.mcpServers, mcpPath, 'project', mcpFile.updatedAt));
      out.push(...mcpItems(claudeJson?.projects?.[dir]?.mcpServers, claudeJsonPath, 'project', cjItem?.updatedAt ?? null));
    }
    return out;
  },
};
