import os from 'node:os';
import type { AxisId, LlmResult } from '../server/api-types.js';
import type { Session } from '../core/types.js';
import { AGENTIC_TOOLS } from '../scoring/index.js';

export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export const PROVIDERS: { id: ProviderId; envVar: string; defaultModel: string }[] = [
  { id: 'anthropic', envVar: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-5' },
  { id: 'openai', envVar: 'OPENAI_API_KEY', defaultModel: 'gpt-5.4-mini' },
  { id: 'gemini', envVar: 'GEMINI_API_KEY', defaultModel: 'gemini-flash-latest' },
];

// Keys are read at call time, never at import time, so a key exported after start-up still works.
function keyFor(p: ProviderId): string | undefined {
  const spec = PROVIDERS.find((x) => x.id === p)!;
  return process.env[spec.envVar] || (p === 'gemini' ? process.env.GOOGLE_API_KEY : undefined) || undefined;
}

export function pickProvider(preferred?: string): ProviderId | null {
  if (preferred) {
    const p = PROVIDERS.find((x) => x.id === preferred);
    if (!p) throw new Error(`Unknown provider "${preferred}" (use anthropic, openai or gemini)`);
    return keyFor(p.id) ? p.id : null;
  }
  return PROVIDERS.find((p) => keyFor(p.id))?.id ?? null;
}

export function providerStatus() {
  return PROVIDERS.map((p) => ({ provider: p.id, envVar: p.envVar, configured: !!keyFor(p.id) }));
}

const SECRET_RES: RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi,
];

/** Strip secrets, e-mail addresses and the home directory before anything leaves the machine. */
export function redact(text: string, home = os.homedir()): string {
  let t = text;
  for (const re of SECRET_RES) t = t.replace(re, '[REDACTED]');
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]');
  if (home && home.length > 1) t = t.split(home).join('~');
  return t;
}

/** Pick recent, substantial sessions spread across tools. */
export function sampleSessions(sessions: Session[], n: number): Session[] {
  const good = sessions
    .filter((s) => s.turns.filter((t) => t.role === 'user').length >= 2)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const byTool = new Map<string, Session[]>();
  for (const s of good) byTool.set(s.tool, [...(byTool.get(s.tool) ?? []), s]);
  const out: Session[] = [];
  while (out.length < n && [...byTool.values()].some((l) => l.length)) {
    for (const list of byTool.values()) {
      const s = list.shift();
      if (s && out.length < n) out.push(s);
    }
  }
  return out;
}

export function digest(s: Session, maxChars = 3500): string {
  const lines: string[] = [`## Session (${s.tool}${AGENTIC_TOOLS.includes(s.tool) ? ', agentic' : ', chat'})`];
  for (const t of s.turns) {
    if (t.role === 'user') {
      const flag = t.isCorrection ? ' [looks like a correction]' : '';
      lines.push(`USER${flag}: ${t.text.slice(0, 600)}`);
    } else {
      const tools = t.toolCalls.length
        ? ` [tools: ${t.toolCalls.length} calls, ${t.toolCalls.filter((c) => c.ok === false).length} failed${t.toolCalls.some((c) => c.isSubagent) ? ', used subagents' : ''}]`
        : '';
      const intr = t.interrupted ? ' [interrupted by user]' : '';
      lines.push(`AI${tools}${intr}: ${t.text.slice(0, 200)}`);
    }
  }
  const out = redact(lines.join('\n'));
  return out.length > maxChars ? out.slice(0, maxChars) + '\n…' : out;
}

export function estimateTokens(text: string): number {
  // rough: ~3 chars per token across English/Japanese mix
  return Math.ceil(text.length / 3);
}

export function buildPrompt(digests: string[], lang: 'ja' | 'en'): string {
  const language = lang === 'ja' ? 'Japanese' : 'English';
  return `You are evaluating how skilfully one person works with AI assistants and coding agents.
Below are digests of ${digests.length} of their recent sessions. USER lines are what they typed; AI lines are shortened replies with tool-call counts.

Score three skills from 0 to 100 (50 = typical user, 80 = strong, 95 = exceptional):
- prompting: clarity of goals, constraints and context; giving acceptance criteria; few misunderstandings.
- delegation: handing over whole tasks, letting the agent run, using subagents/parallel work appropriately, reviewing rather than micromanaging.
- efficiency: few wasted loops, knowing when to restart, good recovery from failures, not interrupting needlessly.

Judge only from the evidence. Quote nothing personal. Write rationale, summary and tips in ${language}.

Respond with JSON only, no prose, exactly this shape:
{"axes":{"prompting":{"score":0,"rationale":""},"delegation":{"score":0,"rationale":""},"efficiency":{"score":0,"rationale":""}},"summary":"","tips":["","",""]}

${digests.join('\n\n')}`;
}

async function call(provider: ProviderId, model: string, prompt: string): Promise<string> {
  const key = keyFor(provider);
  if (!key) throw new Error(`No API key for ${provider}`);
  const signal = AbortSignal.timeout(180_000);
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${j?.error?.message ?? 'request failed'}`);
    return (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  }
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${j?.error?.message ?? 'request failed'}`);
    return j.choices?.[0]?.message?.content ?? '';
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message ?? 'request failed'}`);
  return (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
}

const LLM_AXES: AxisId[] = ['prompting', 'delegation', 'efficiency'];

/** Validate model output strictly; anything off-shape is an error, not a guess. */
export function parseLlmJson(text: string): Pick<LlmResult, 'axes' | 'summary' | 'tips'> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM did not return JSON');
  const j = JSON.parse(text.slice(start, end + 1));
  const axes: LlmResult['axes'] = {};
  for (const id of LLM_AXES) {
    const a = j?.axes?.[id];
    const score = Number(a?.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`LLM returned an invalid score for ${id}`);
    axes[id] = { score: Math.round(score), rationale: String(a?.rationale ?? '').slice(0, 1200) };
  }
  const tips = Array.isArray(j?.tips) ? j.tips.map((t: unknown) => String(t).slice(0, 400)).filter(Boolean).slice(0, 5) : [];
  return { axes, summary: String(j?.summary ?? '').slice(0, 1500), tips };
}

export interface ScorePlan {
  provider: ProviderId | null;
  model: string | null;
  sessions: Session[];
  prompt: string;
  estTokens: number;
}

export function planScoring(sessions: Session[], opts: { provider?: string; sample?: number; lang?: 'ja' | 'en' } = {}): ScorePlan {
  const provider = pickProvider(opts.provider);
  const sample = sampleSessions(sessions, opts.sample ?? 12);
  const prompt = buildPrompt(sample.map((s) => digest(s)), opts.lang ?? 'en');
  const model = provider ? process.env.AI_MENSA_MODEL || PROVIDERS.find((p) => p.id === provider)!.defaultModel : null;
  return { provider, model, sessions: sample, prompt, estTokens: estimateTokens(prompt) + 800 };
}

export async function runScoring(plan: ScorePlan): Promise<LlmResult> {
  if (!plan.provider || !plan.model) throw new Error('No LLM API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY.');
  if (!plan.sessions.length) throw new Error('Not enough sessions to score (need sessions with 2+ user turns).');
  const text = await call(plan.provider, plan.model, plan.prompt);
  const parsed = parseLlmJson(text);
  return { at: new Date().toISOString(), provider: plan.provider, model: plan.model, sampled: plan.sessions.length, ...parsed };
}
