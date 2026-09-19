import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
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

const TOOL = 'codex' as const;

function codexHome(env: Env) {
  return process.env.CODEX_HOME ?? path.join(env.home, '.codex');
}

// Injected context that arrives as role=user but was not typed by the person:
// Codex wraps it in a lowercase pseudo-XML tag (<environment_context>, <recommended_plugins>, …).
const INJECTED = /^\s*(<[a-z][a-z_ -]*>|# AGENTS\.md instructions)/;

function userText(content: any[]): string {
  const text = content
    .filter((c) => c.type === 'input_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
  // IDE extension wraps the actual request after this marker
  const marker = '## My request for Codex:';
  const i = text.indexOf(marker);
  return (i >= 0 ? text.slice(i + marker.length) : text).trim();
}

function exitOk(output: unknown): boolean | null {
  if (typeof output !== 'string') return null;
  const m = output.match(/(?:Process exited with code|"exit_code":)\s*(-?\d+)/);
  if (m) return Number(m[1]) === 0;
  try {
    const j = JSON.parse(output);
    if (typeof j?.metadata?.exit_code === 'number') return j.metadata.exit_code === 0;
  } catch {
    /* not json */
  }
  return null;
}

export function parseCodexJsonl(raw: string, fallbackId: string): Session | null {
  const turns: Turn[] = [];
  const calls = new Map<string, ToolCall>();
  let id = fallbackId;
  let project: string | null = null;
  let model: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let current: Turn | null = null;
  let isChildThread = false;

  const assistant = (at: string | null): Turn => {
    if (current && current.role === 'assistant') return current;
    current = newTurn('assistant', '', at);
    turns.push(current);
    return current;
  };

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d: any;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const p = d.payload ?? {};
    const at = toIso(d.timestamp);
    if (at) {
      if (!startedAt || at < startedAt) startedAt = at;
      if (!endedAt || at > endedAt) endedAt = at;
    }
    if (d.type === 'session_meta') {
      id = p.id ?? p.session_id ?? id;
      project = p.cwd ?? project;
      // guardian reviews and spawned agents are machine-driven threads, not the person's own sessions
      if (p.source && typeof p.source === 'object' && 'subagent' in p.source) isChildThread = true;
      continue;
    }
    if (d.type === 'turn_context') {
      if (p.model && !String(p.model).includes('review')) model = p.model;
      project = project ?? p.cwd ?? null;
      continue;
    }
    if (d.type === 'event_msg') {
      if (p.type === 'token_count' && p.info?.last_token_usage) {
        const u = p.info.last_token_usage;
        const t = assistant(at);
        t.tokensIn = (t.tokensIn ?? 0) + (u.input_tokens ?? 0);
        t.tokensOut = (t.tokensOut ?? 0) + (u.output_tokens ?? 0);
        t.tokensCached = (t.tokensCached ?? 0) + (u.cached_input_tokens ?? 0);
      }
      if (p.type === 'turn_aborted' && current && current.role === 'assistant') current.interrupted = true;
      continue;
    }
    if (d.type !== 'response_item') continue;

    if (p.type === 'message') {
      if (p.role === 'user') {
        const content = Array.isArray(p.content) ? p.content : [];
        const raw = content.map((c: any) => c.text ?? '').join('\n');
        if (INJECTED.test(raw)) continue;
        const text = userText(content);
        if (!text) continue;
        current = newTurn('user', text, at);
        const cmd = text.match(/^\/([\w:-]+)/);
        if (cmd) current.invoked.push(cmd[1]);
        for (const m of text.matchAll(/\$([a-z][\w-]{2,})/g)) current.invoked.push(m[1]);
        turns.push(current);
      } else if (p.role === 'assistant') {
        const text = (Array.isArray(p.content) ? p.content : [])
          .filter((c: any) => c.type === 'output_text')
          .map((c: any) => c.text)
          .join('\n');
        const t = assistant(at);
        if (text) t.text += (t.text ? '\n' : '') + text;
      }
      continue;
    }
    if (['function_call', 'custom_tool_call', 'local_shell_call', 'web_search_call', 'image_generation_call', 'tool_search_call'].includes(p.type)) {
      const name: string = p.name ?? p.type.replace(/_call$/, '');
      const isSubagent = /spawn_agent|delegate|subagent/i.test(name);
      let detail: string | null = null;
      if (name.startsWith('mcp__')) detail = name.split('__')[1] ?? null;
      else if (typeof p.namespace === 'string') detail = p.namespace;
      const call: ToolCall = { name, ok: p.status === 'failed' ? false : null, isSubagent, detail };
      assistant(at).toolCalls.push(call);
      if (p.call_id) calls.set(p.call_id, call);
      continue;
    }
    if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
      const call = calls.get(p.call_id);
      if (call && call.ok === null) call.ok = exitOk(typeof p.output === 'string' ? p.output : p.output?.content);
    }
  }

  if (isChildThread || !turns.some((t) => t.role === 'user')) return null;
  markCorrections(turns);
  const firstUser = turns.find((t) => t.role === 'user');
  return {
    id: `${TOOL}:${id}`,
    tool: TOOL,
    project,
    title: firstUser ? firstLine(firstUser.text) : null,
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

export const codex: Adapter = {
  id: TOOL,
  label: 'Codex CLI',
  async detect(env) {
    const home = codexHome(env);
    if (!(await exists(home))) return { found: false, detail: `${home} not found`, paths: [] };
    const files = await this.listSources(env);
    return { found: files.length > 0, detail: `${files.length} session files`, paths: [home] };
  },
  async listSources(env) {
    const home = codexHome(env);
    const files = [
      ...(await walk(path.join(home, 'sessions'), (n) => n.endsWith('.jsonl'))),
      ...(await walk(path.join(home, 'archived_sessions'), (n) => n.endsWith('.jsonl'), 0)),
    ];
    return fileSources(TOOL, files);
  },
  async parse(src: SourceRef) {
    const raw = await readFile(src.path, 'utf8');
    const s = parseCodexJsonl(raw, path.basename(src.path, '.jsonl'));
    return s ? [s] : [];
  },
  async scanHarness(env) {
    const home = codexHome(env);
    const out: HarnessItem[] = [];
    const push = (i: HarnessItem | null) => i && out.push(i);
    push(await harnessFile(TOOL, 'instruction', 'AGENTS.md', path.join(home, 'AGENTS.md'), 'global'));
    for (const f of await listDir(path.join(home, 'skills'))) {
      if (!f.startsWith('.')) push(await harnessFile(TOOL, 'skill', f, path.join(home, 'skills', f, 'SKILL.md'), 'global'));
    }
    for (const f of await listDir(path.join(home, 'prompts'))) {
      if (f.endsWith('.md')) push(await harnessFile(TOOL, 'command', f.replace(/\.md$/, ''), path.join(home, 'prompts', f), 'global'));
    }
    for (const f of await listDir(path.join(home, 'rules'))) {
      push(await harnessFile(TOOL, 'rule', f, path.join(home, 'rules', f), 'global'));
    }
    const cfgPath = path.join(home, 'config.toml');
    const cfgItem = await harnessFile(TOOL, 'permission', 'config.toml', cfgPath, 'global');
    if (cfgItem) {
      let cfg: any = {};
      try {
        cfg = parseToml(await readFile(cfgPath, 'utf8'));
      } catch {
        /* unreadable config */
      }
      const u = cfgItem.updatedAt;
      for (const name of Object.keys(cfg.mcp_servers ?? {})) out.push(harnessEntry(TOOL, 'mcp', name, cfgPath, 'global', u));
      for (const [name, v] of Object.entries<any>(cfg.plugins ?? {})) {
        if (v?.enabled !== false) out.push(harnessEntry(TOOL, 'plugin', name, cfgPath, 'global', u));
      }
      if (cfg.approval_policy) out.push(harnessEntry(TOOL, 'permission', `approval_policy: ${JSON.stringify(cfg.approval_policy)}`, cfgPath, 'global', u));
      if (cfg.sandbox_mode) out.push(harnessEntry(TOOL, 'permission', `sandbox_mode: ${cfg.sandbox_mode}`, cfgPath, 'global', u));
      if (cfg.notify) out.push(harnessEntry(TOOL, 'hook', 'notify', cfgPath, 'global', u));
    }
    for (const dir of env.projectDirs) {
      push(await harnessFile(TOOL, 'instruction', 'AGENTS.md', path.join(dir, 'AGENTS.md'), 'project'));
      push(await harnessFile(TOOL, 'instruction', 'AGENTS.override.md', path.join(dir, 'AGENTS.override.md'), 'project'));
    }
    return out;
  },
};
