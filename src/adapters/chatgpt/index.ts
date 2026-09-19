import type { Adapter, Session, Turn } from '../../core/types.js';
import { firstLine, markCorrections, newTurn, toIso } from '../../core/util.js';
import { importSources, readJsonArray } from '../exports.js';

const TOOL = 'chatgpt' as const;

function partsText(content: any): string {
  if (!content) return '';
  if (Array.isArray(content.parts)) return content.parts.filter((p: any) => typeof p === 'string').join('\n');
  if (typeof content.text === 'string') return content.text;
  return '';
}

/** Follow parent links from current_node to get the thread the user actually kept. */
function linearMessages(conv: any): any[] {
  const mapping = conv.mapping ?? {};
  let nodeId: string | null = conv.current_node ?? null;
  if (!nodeId) {
    // fall back to the latest leaf
    const leaves = Object.values<any>(mapping).filter((n) => !n.children?.length);
    nodeId = leaves.sort((a, b) => (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0)).pop()?.id ?? null;
  }
  const out: any[] = [];
  const seen = new Set<string>();
  while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
    seen.add(nodeId);
    const n = mapping[nodeId];
    if (n.message) out.push(n.message);
    nodeId = n.parent ?? null;
  }
  return out.reverse();
}

export function parseChatGptConversation(conv: any): Session | null {
  const turns: Turn[] = [];
  let model: string | null = null;
  let current: Turn | null = null;
  for (const m of linearMessages(conv)) {
    const role = m.author?.role;
    if (m.metadata?.is_visually_hidden_from_conversation) continue;
    const at = toIso(m.create_time);
    if (role === 'user') {
      const text = partsText(m.content).trim();
      if (!text) continue;
      current = newTurn('user', text, at);
      turns.push(current);
    } else if (role === 'assistant' || role === 'tool') {
      if (!current || current.role !== 'assistant') {
        current = newTurn('assistant', '', at);
        turns.push(current);
      }
      if (m.metadata?.model_slug && !model) model = m.metadata.model_slug;
      if (role === 'tool') {
        current.toolCalls.push({ name: m.author?.name ?? 'tool', ok: m.status === 'finished_successfully' ? true : null, isSubagent: false, detail: null });
      } else {
        const text = m.content?.content_type === 'text' ? partsText(m.content) : '';
        if (text) current.text += (current.text ? '\n' : '') + text;
        if (m.recipient && m.recipient !== 'all') {
          current.toolCalls.push({ name: m.recipient, ok: null, isSubagent: false, detail: null });
        }
      }
    }
  }
  if (!turns.some((t) => t.role === 'user')) return null;
  markCorrections(turns);
  const firstUser = turns.find((t) => t.role === 'user');
  return {
    id: `${TOOL}:${conv.conversation_id ?? conv.id ?? conv.create_time}`,
    tool: TOOL,
    project: null,
    title: conv.title || (firstUser ? firstLine(firstUser.text) : null),
    startedAt: toIso(conv.create_time),
    endedAt: toIso(conv.update_time ?? conv.create_time),
    model,
    turns,
  };
}

export const chatgpt: Adapter = {
  id: TOOL,
  label: 'ChatGPT',
  async detect(env) {
    const src = await importSources(env, TOOL);
    return src.length
      ? { found: true, detail: `${src.length} imported export(s)`, paths: src.map((s) => s.path) }
      : { found: false, detail: 'no export imported (run: ai-mensa import <chatgpt-export.zip>)', paths: [] };
  },
  listSources: (env) => importSources(env, TOOL),
  async parse(src) {
    const out: Session[] = [];
    for (const conv of await readJsonArray(src.path)) {
      const s = parseChatGptConversation(conv);
      if (s) out.push(s);
    }
    return out;
  },
};
