import type { Adapter, Session, Turn } from '../../core/types.js';
import { firstLine, markCorrections, newTurn, toIso } from '../../core/util.js';
import { importSources, readJsonArray } from '../exports.js';

const TOOL = 'claude-ai' as const;

function messageText(m: any): string {
  if (typeof m.text === 'string' && m.text.trim()) return m.text;
  return (Array.isArray(m.content) ? m.content : [])
    .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
    .map((c: any) => c.text)
    .join('\n');
}

export function parseClaudeAiConversation(conv: any): Session | null {
  const turns: Turn[] = [];
  for (const m of conv.chat_messages ?? []) {
    const at = toIso(m.created_at);
    if (m.sender === 'human') {
      const text = messageText(m).trim();
      if (!text) continue;
      turns.push(newTurn('user', text, at));
    } else if (m.sender === 'assistant') {
      const t = newTurn('assistant', messageText(m), at);
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c.type === 'tool_use') t.toolCalls.push({ name: c.name ?? 'tool', ok: null, isSubagent: false, detail: null });
        if (c.type === 'tool_result' && c.is_error && t.toolCalls.length) t.toolCalls[t.toolCalls.length - 1].ok = false;
      }
      turns.push(t);
    }
  }
  if (!turns.some((t) => t.role === 'user')) return null;
  markCorrections(turns);
  const firstUser = turns.find((t) => t.role === 'user');
  return {
    id: `${TOOL}:${conv.uuid}`,
    tool: TOOL,
    project: conv.project?.name ?? null,
    title: conv.name || (firstUser ? firstLine(firstUser.text) : null),
    startedAt: toIso(conv.created_at),
    endedAt: toIso(conv.updated_at ?? conv.created_at),
    model: conv.model ?? null,
    turns,
  };
}

export const claudeAi: Adapter = {
  id: TOOL,
  label: 'Claude.ai',
  async detect(env) {
    const src = await importSources(env, TOOL);
    return src.length
      ? { found: true, detail: `${src.length} imported export(s)`, paths: src.map((s) => s.path) }
      : { found: false, detail: 'no export imported (run: ai-mensa import <claude-export.zip>)', paths: [] };
  },
  listSources: (env) => importSources(env, TOOL),
  async parse(src) {
    const out: Session[] = [];
    for (const conv of await readJsonArray(src.path)) {
      const s = parseClaudeAiConversation(conv);
      if (s) out.push(s);
    }
    return out;
  },
};
