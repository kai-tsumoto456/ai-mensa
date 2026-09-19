/*
 * Mock backend for UI development without the server.
 * Only loaded when `import.meta.env.DEV && location.search.includes('mock')`.
 *
 *   ?mock         realistic data (Mensa class, Anthropic key configured)
 *   ?mock=empty   no tools detected / no sessions
 *   ?mock=nokey   no BYOK provider configured
 *   ?mock=fail    LLM scoring run returns a provider error
 *   ?mock=error   every GET fails (error states)
 */
import type {
  AxisScore,
  EstimateResponse,
  EvaluationResponse,
  HarnessResponse,
  HarnessToolBlock,
  LlmResult,
  OverviewResponse,
  SessionDetailResponse,
  SessionsResponse,
} from '../../src/server/api-types';
import type { HarnessItem, SessionSummary, ToolCall, ToolId, Turn } from '../../src/core/types';

const mode = new URLSearchParams(location.search).get('mock') ?? '';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const DAY = 86400000;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LABELS: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  cursor: 'Cursor',
  chatgpt: 'ChatGPT',
  'claude-ai': 'Claude.ai',
};

const PROJECTS = ['ai-mensa', 'html-studio', 'mtg-swallow', 'rag-book', 'koguchi-engine', 'corporate-site'];
const TITLES = [
  'Add SQLite cache for parsed sessions',
  'Fix flaky vitest in adapter fixtures',
  'Refactor Hono routes into modules',
  'Cursor composer DB を読み取り専用で開く',
  'Write README in English and Japanese',
  'Investigate ERR_REQUIRE_ESM on Vercel',
  'Design radar chart for six axes',
  '議事録 HTML のレイアウト崩れを直す',
  'Migrate tl;dv integration to Circleback MCP',
  'Explain Firestore security rules',
  'Summarize meeting transcript into action items',
  'Draft proposal slides for client',
  'SQL for weekly retention by cohort',
  'Rename Retriever to MTG-Swallow everywhere',
  'Add Playwright smoke test for upload flow',
  'なぜこの useEffect は2回走るのか',
  'Tighten CSP for user-uploaded HTML',
  'Regex to redact API keys and emails',
  null,
];
const MODELS: Record<ToolId, string[]> = {
  'claude-code': ['claude-opus-4-1', 'claude-sonnet-4-5'],
  codex: ['gpt-5-codex', 'gpt-5'],
  cursor: ['claude-sonnet-4-5', 'gpt-5', 'auto'],
  chatgpt: ['gpt-5', 'gpt-4o'],
  'claude-ai': ['claude-opus-4-1', 'claude-sonnet-4-5'],
};
const TOOL_WEIGHTS: [ToolId, number][] = [
  ['claude-code', 0.52],
  ['codex', 0.16],
  ['cursor', 0.12],
  ['chatgpt', 0.12],
  ['claude-ai', 0.08],
];

function pickTool(r: () => number): ToolId {
  let x = r();
  for (const [t, w] of TOOL_WEIGHTS) {
    if ((x -= w) <= 0) return t;
  }
  return 'claude-code';
}

const SESSIONS: SessionSummary[] = (() => {
  if (mode === 'empty') return [];
  const r = rng(42);
  const out: SessionSummary[] = [];
  for (let i = 0; i < 164; i++) {
    const tool = pickTool(r);
    const ageDays = Math.floor(Math.pow(r(), 1.4) * 88);
    const start = NOW - ageDays * DAY - Math.floor(r() * 12 * 3600000);
    const agentic = tool === 'claude-code' || tool === 'codex' || tool === 'cursor';
    const userTurns = 1 + Math.floor(r() * (agentic ? 18 : 9));
    const toolCalls = agentic ? Math.floor(userTurns * (2 + r() * 9)) : 0;
    out.push({
      id: `${tool}:${(1e9 + Math.floor(r() * 9e9)).toString(36)}-${i}`,
      tool,
      project: agentic ? pick(r, PROJECTS) : r() < 0.3 ? pick(r, PROJECTS) : null,
      title: pick(r, TITLES),
      startedAt: iso(start),
      endedAt: iso(start + (5 + Math.floor(r() * 140)) * 60000),
      model: r() < 0.9 ? pick(r, MODELS[tool]) : null,
      userTurns,
      assistantTurns: userTurns + (agentic ? Math.floor(r() * userTurns) : 0),
      toolCalls,
      toolErrors: toolCalls ? Math.floor(toolCalls * r() * 0.08) : 0,
      corrections: r() < 0.35 ? 1 + Math.floor(r() * 2) : 0,
      interruptions: agentic && r() < 0.2 ? 1 : 0,
      tokensIn: Math.floor(userTurns * (4000 + r() * 60000)),
      tokensOut: Math.floor(userTurns * (600 + r() * 5000)),
    });
  }
  return out.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
})();

const AXES: AxisScore[] = [
  {
    id: 'prompting',
    label: 'Prompting',
    labelJa: '指示力',
    score: 81,
    statScore: 78,
    llmScore: 84,
    signals: [
      { key: 'medianLen', label: 'Median prompt length', labelJa: 'プロンプト長（中央値）', value: '212 chars' },
      { key: 'context', label: 'Prompts with context', labelJa: '文脈つきプロンプト', value: '58%' },
      { key: 'correction', label: 'Correction rate', labelJa: '訂正率', value: '6.1%' },
    ],
    advice: ['State acceptance criteria up front: only 21% of prompts say what "done" looks like.'],
    adviceJa: ['完了条件を最初に書きましょう。「何ができたら終わりか」を書いたプロンプトは 21% だけです。'],
  },
  {
    id: 'delegation',
    label: 'Delegation',
    labelJa: '委任力',
    score: 76,
    statScore: 74,
    llmScore: 78,
    signals: [
      { key: 'callsPerTurn', label: 'Tool calls per prompt', labelJa: 'プロンプトあたりのツール呼び出し', value: '6.4' },
      { key: 'runLength', label: 'Median autonomous run', labelJa: '自走の長さ（中央値）', value: '9 steps' },
      { key: 'subagents', label: 'Sessions using subagents', labelJa: 'サブエージェント利用', value: '14%' },
    ],
    advice: [
      'Try subagents for independent searches; only 14% of long sessions use them.',
      'Batch related asks into one prompt instead of drip-feeding follow-ups.',
    ],
    adviceJa: [
      '独立した調査はサブエージェントに任せましょう。長いセッションでの利用は 14% です。',
      '関連する依頼は小出しにせず、1つのプロンプトにまとめましょう。',
    ],
  },
  {
    id: 'efficiency',
    label: 'Efficiency',
    labelJa: '協働効率',
    score: 70,
    statScore: 66,
    llmScore: 74,
    signals: [
      { key: 'interrupt', label: 'Interruption rate', labelJa: '中断率', value: '4.8%' },
      { key: 'toolErr', label: 'Tool error rate', labelJa: 'ツールエラー率', value: '3.2%' },
      { key: 'loops', label: 'Correction loops (2+)', labelJa: '訂正ループ（2回以上）', value: '11' },
      { key: 'cache', label: 'Cache hit ratio', labelJa: 'キャッシュヒット率', value: '71%' },
    ],
    advice: ['11 sessions had back-to-back corrections. When the second correction happens, restate the goal from scratch.'],
    adviceJa: ['連続した訂正が 11 セッションで起きています。2回目の訂正が出たら、ゴールを最初から言い直しましょう。'],
  },
  {
    id: 'harness',
    label: 'Harness',
    labelJa: 'ハーネス整備度',
    score: 88,
    statScore: 88,
    llmScore: null,
    signals: [
      { key: 'basics', label: 'Basics present', labelJa: '基本要素', value: '5 / 5' },
      { key: 'util', label: 'Utilisation', labelJa: '利用率', value: '64%' },
      { key: 'fresh', label: 'Updated in last 30 days', labelJa: '30日以内の更新', value: '9 items' },
    ],
    advice: ['3 skills installed but never used in 30 days: canvas-design, xlsx, doc-coauthoring.'],
    adviceJa: ['30日間一度も使われていないスキルが 3 つあります: canvas-design, xlsx, doc-coauthoring。'],
  },
  {
    id: 'breadth',
    label: 'Breadth',
    labelJa: '活用の幅',
    score: 79,
    statScore: 79,
    llmScore: null,
    signals: [
      { key: 'tools', label: 'Tools', labelJa: 'ツール数', value: '5' },
      { key: 'projects', label: 'Projects', labelJa: 'プロジェクト数', value: '6' },
      { key: 'models', label: 'Models', labelJa: 'モデル数', value: '7' },
    ],
    advice: [],
    adviceJa: [],
  },
  {
    id: 'habit',
    label: 'Habit',
    labelJa: '継続性',
    score: 73,
    statScore: 73,
    llmScore: null,
    signals: [
      { key: 'active30', label: 'Active days (30d)', labelJa: '稼働日数（30日）', value: '22' },
      { key: 'weekly', label: 'Sessions per week', labelJa: '週あたりセッション', value: '12.8' },
      { key: 'streak', label: 'Current streak', labelJa: '連続日数', value: '6 days' },
    ],
    advice: ['Weekends are empty; that is fine, but short daily reviews keep context warm.'],
    adviceJa: ['週末はほぼ使っていません。問題ではありませんが、短い振り返りを毎日入れると文脈が途切れにくくなります。'],
  },
];

function overview(): OverviewResponse {
  const activity: OverviewResponse['activity'] = [];
  for (let i = 89; i >= 0; i--) {
    const d = ymd(NOW - i * DAY);
    const day = SESSIONS.filter((s) => s.startedAt && ymd(Date.parse(s.startedAt)) === d);
    activity.push({ date: d, sessions: day.length, userTurns: day.reduce((a, s) => a + s.userTurns, 0) });
  }
  const tools = (Object.keys(LABELS) as ToolId[]).map((tool) => {
    const n = SESSIONS.filter((s) => s.tool === tool).length;
    const detail: Record<ToolId, string> = {
      'claude-code': '~/.claude/projects · 412 files',
      codex: '~/.codex/sessions · 88 files',
      cursor: 'state.vscdb · 31 composers',
      chatgpt: 'imported 2026-08-30',
      'claude-ai': 'imported 2026-09-02',
    };
    return { tool, label: LABELS[tool], found: mode !== 'empty' && n > 0, sessions: n, detail: mode === 'empty' ? '' : detail[tool] };
  });
  const empty = mode === 'empty';
  const weighted = AXES.reduce((a, x) => a + x.score, 0) / AXES.length;
  const aiq = empty ? 70 : Math.round(70 + 0.8 * weighted);
  return {
    aiq,
    mensaClass: aiq >= 130,
    axes: empty ? AXES.map((a) => ({ ...a, score: 0, statScore: 0, llmScore: null, advice: [], adviceJa: [] })) : AXES,
    activity,
    tools,
    totals: {
      sessions: SESSIONS.length,
      userTurns: SESSIONS.reduce((a, s) => a + s.userTurns, 0),
      toolCalls: SESSIONS.reduce((a, s) => a + s.toolCalls, 0),
      projects: new Set(SESSIONS.map((s) => s.project).filter(Boolean)).size,
      activeDays30: activity.slice(-30).filter((d) => d.sessions > 0).length,
    },
    llm: empty ? { provider: null, lastScoredAt: null } : { provider: 'anthropic', lastScoredAt: iso(NOW - 3 * DAY) },
    generatedAt: iso(NOW),
  };
}

function sessions(q: URLSearchParams): SessionsResponse {
  const tool = q.get('tool');
  const project = q.get('project');
  const text = (q.get('q') ?? '').toLowerCase();
  const limit = Number(q.get('limit') ?? 50);
  const offset = Number(q.get('offset') ?? 0);
  const filtered = SESSIONS.filter(
    (s) =>
      (!tool || s.tool === tool) &&
      (!project || s.project === project) &&
      (!text || (s.title ?? '').toLowerCase().includes(text) || s.id.includes(text)),
  );
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    projects: [...new Set(SESSIONS.map((s) => s.project).filter((p): p is string => !!p))].sort(),
  };
}

const USER_TEXTS = [
  'Read src/adapters/cursor/index.ts and make the DB open read-only. The acceptance criterion: `npm test` passes and no write lock is taken.',
  'この関数、null のときに落ちるので直して。テストも足してください。',
  'Can you look at why the heatmap is off by one day in JST?',
  'Good. Now run the full test suite and summarize failures only.',
  '違う、そうじゃなくて adapter 側で正規化したい。',
  'Actually, keep the old API and add a new endpoint instead.',
  'Refactor this to use a single SQL query:\n\n```ts\nfor (const s of sessions) {\n  await db.run(`insert into sessions values (?)`, [JSON.stringify(s)]);\n}\n```',
  'Please write the README section on privacy. Mention 127.0.0.1 binding, no telemetry, and BYOK.',
];
const AI_TEXTS = [
  "I'll start by reading the adapter and its fixture to see how the DB is opened.",
  'The failure comes from `new Date(ymd)` being parsed as UTC. I switched to constructing a local date from the parts and added a test for Asia/Tokyo.',
  '了解しました。正規化は adapter 側に移し、scoring 側からは削除します。',
  'All 48 tests pass. Two warnings remain about deprecated `vi.fn` typings, unrelated to this change.',
  '',
  'Here is the privacy section:\n\n- The server binds to 127.0.0.1 only.\n- Nothing leaves your machine unless you run LLM scoring with your own key.\n- No telemetry.',
];
const TOOLS = ['Read', 'Edit', 'Bash', 'Grep', 'Glob', 'Write', 'TodoWrite', 'Task', 'mcp__github__create_pull_request', 'Skill', 'WebFetch'];

function detail(id: string): SessionDetailResponse | null {
  const s = SESSIONS.find((x) => x.id === id);
  if (!s) return null;
  const r = rng(id.length * 7919 + id.charCodeAt(id.length - 1));
  const turns: Turn[] = [];
  let at = Date.parse(s.startedAt ?? iso(NOW));
  let callsLeft = s.toolCalls;
  let errorsLeft = s.toolErrors;
  let corrLeft = s.corrections;
  let intLeft = s.interruptions;
  for (let u = 0; u < s.userTurns; u++) {
    const isCorr = u > 0 && corrLeft > 0 && r() < 0.4;
    if (isCorr) corrLeft--;
    at += 60000 + r() * 400000;
    turns.push({
      role: 'user',
      text: isCorr ? pick(r, ['違う、そうじゃなくて adapter 側で正規化したい。', 'No, wrong file. Use the one under src/server.', 'Actually, revert that and keep the old API.']) : pick(r, USER_TEXTS),
      at: iso(at),
      tokensIn: null,
      tokensOut: null,
      tokensCached: null,
      toolCalls: [],
      isCorrection: isCorr,
      interrupted: false,
      invoked: !isCorr && r() < 0.15 ? [pick(r, ['/aidesigner', 'frontend-design', '/commit'])] : [],
    });
    const nCalls = u === s.userTurns - 1 ? callsLeft : Math.min(callsLeft, Math.floor(r() * (2 * s.toolCalls) / s.userTurns));
    callsLeft -= nCalls;
    const calls: ToolCall[] = Array.from({ length: nCalls }, () => {
      const err = errorsLeft > 0 && r() < 0.15;
      if (err) errorsLeft--;
      const name = pick(r, TOOLS);
      const detail =
        name === 'Skill'
          ? pick(r, ['frontend-design', 'systematic-debugging', 'verification-before-completion'])
          : name === 'Task'
            ? pick(r, ['Explore', 'code-reviewer'])
            : name.startsWith('mcp__')
              ? 'github'
              : null;
      return { name, ok: err ? false : r() < 0.05 ? null : true, isSubagent: name === 'Task', detail };
    });
    const interrupted = intLeft > 0 && r() < 0.3;
    if (interrupted) intLeft--;
    at += 20000 + r() * 300000;
    turns.push({
      role: 'assistant',
      text: pick(r, AI_TEXTS),
      at: iso(at),
      tokensIn: Math.floor(s.tokensIn / s.userTurns),
      tokensOut: Math.floor(s.tokensOut / s.userTurns),
      tokensCached: Math.floor((s.tokensIn / s.userTurns) * 0.7),
      toolCalls: calls,
      isCorrection: false,
      interrupted,
      invoked: [],
    });
  }
  return {
    id: s.id,
    tool: s.tool,
    project: s.project,
    title: s.title,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    model: s.model,
    turns,
    summary: s,
  };
}

function item(
  tool: ToolId,
  kind: HarnessItem['kind'],
  name: string,
  path: string | null,
  scope: HarnessItem['scope'],
  ageDays: number | null,
  usageCount: number | null,
): HarnessItem {
  return {
    tool,
    kind,
    name,
    path,
    scope,
    updatedAt: ageDays === null ? null : iso(NOW - ageDays * DAY),
    sizeBytes: 1200,
    usageCount,
  };
}

function harness(): HarnessResponse {
  if (mode === 'empty') {
    return {
      tools: (Object.keys(LABELS) as ToolId[]).map((tool) => ({ tool, label: LABELS[tool], found: false, counts: {}, items: [], findings: [] })),
    };
  }
  const cc: HarnessItem[] = [
    item('claude-code', 'instruction', 'CLAUDE.md', '~/.claude/CLAUDE.md', 'global', 4, null),
    item('claude-code', 'instruction', 'CLAUDE.md', '~/workspace/CLAUDE.md', 'project', 1, null),
    item('claude-code', 'instruction', 'CLAUDE.md', '~/workspace/engineering/CLAUDE.md', 'project', 12, null),
    ...['frontend-design', 'systematic-debugging', 'verification-before-completion', 'pptx', 'diagram-design', 'gemini'].map((n, i) =>
      item('claude-code', 'skill', n, `~/.claude/skills/${n}/SKILL.md`, 'global', 3 + i * 9, [23, 11, 38, 4, 9, 2][i]!),
    ),
    ...['canvas-design', 'xlsx', 'doc-coauthoring'].map((n, i) =>
      item('claude-code', 'skill', n, `~/.claude/skills/${n}/SKILL.md`, 'global', 70 + i * 20, 0),
    ),
    item('claude-code', 'agent', 'code-reviewer', '.claude/agents/code-reviewer.md', 'project', 40, 6),
    item('claude-code', 'agent', 'aidesigner-frontend', '.claude/agents/aidesigner-frontend.md', 'project', 55, 0),
    item('claude-code', 'command', '/aidesigner', '.claude/commands/aidesigner.md', 'project', 50, 3),
    item('claude-code', 'hook', 'PreToolUse · Bash guard', '~/.claude/settings.json', 'global', 20, null),
    item('claude-code', 'hook', 'Stop · notify', '~/.claude/settings.json', 'global', 20, null),
    item('claude-code', 'mcp', 'html-studio', '.mcp.json', 'project', 9, 17),
    item('claude-code', 'mcp', 'github', '~/.claude.json', 'global', 60, 29),
    item('claude-code', 'mcp', 'supabase', '~/.claude.json', 'global', 85, 0),
    item('claude-code', 'permission', 'allow: Bash(git status:*) +23', '~/.claude/settings.json', 'global', 2, null),
    item('claude-code', 'plugin', 'commit-commands', '~/.claude/plugins', 'global', 30, 5),
  ];
  const codex: HarnessItem[] = [
    item('codex', 'instruction', 'AGENTS.md', '~/.codex/AGENTS.md', 'global', 45, null),
    item('codex', 'mcp', 'github', '~/.codex/config.toml', 'global', 45, 0),
    item('codex', 'permission', 'approval_policy = on-request', '~/.codex/config.toml', 'global', 45, null),
  ];
  const cursor: HarnessItem[] = [
    item('cursor', 'rule', 'typescript.mdc', 'html-studio/.cursor/rules/typescript.mdc', 'project', 120, null),
    item('cursor', 'rule', '.cursorrules', 'corporate-site/.cursorrules', 'project', 200, null),
    item('cursor', 'mcp', 'figma', '~/.cursor/mcp.json', 'global', 33, 2),
  ];
  const count = (xs: HarnessItem[]) => {
    const c: HarnessToolBlock['counts'] = {};
    for (const x of xs) c[x.kind] = (c[x.kind] ?? 0) + 1;
    return c;
  };
  return {
    tools: [
      {
        tool: 'claude-code',
        label: 'Claude Code',
        found: true,
        counts: count(cc),
        items: cc,
        findings: [
          { level: 'good', message: 'Global and project instructions are both present.', messageJa: 'グローバルとプロジェクトの両方に指示ファイルがあります。' },
          { level: 'warn', message: '3 skills installed but never used in 30 days.', messageJa: '30日間使われていないスキルが 3 つあります。' },
          { level: 'warn', message: 'MCP server "supabase" has not been called in 85 days.', messageJa: 'MCP サーバー「supabase」は 85 日間呼ばれていません。' },
          { level: 'info', message: 'Hooks run on every Bash call; usage count is not measurable.', messageJa: 'フックは Bash 実行ごとに動くため、使用回数は計測できません。' },
        ],
      },
      {
        tool: 'codex',
        label: 'Codex CLI',
        found: true,
        counts: count(codex),
        items: codex,
        findings: [
          { level: 'warn', message: 'No project-level AGENTS.md in any of the 4 projects used with Codex.', messageJa: 'Codex で使った 4 プロジェクトのどれにもプロジェクト用 AGENTS.md がありません。' },
          { level: 'info', message: 'No skills installed under ~/.codex/skills.', messageJa: '~/.codex/skills にスキルがありません。' },
        ],
      },
      {
        tool: 'cursor',
        label: 'Cursor',
        found: true,
        counts: count(cursor),
        items: cursor,
        findings: [{ level: 'warn', message: '.cursorrules is legacy; move rules to .cursor/rules/*.mdc.', messageJa: '.cursorrules は旧形式です。.cursor/rules/*.mdc に移しましょう。' }],
      },
      { tool: 'chatgpt', label: 'ChatGPT', found: true, counts: {}, items: [], findings: [{ level: 'info', message: 'Chat exports have no harness.', messageJa: 'チャットのエクスポートにはハーネスがありません。' }] },
      { tool: 'claude-ai', label: 'Claude.ai', found: false, counts: {}, items: [], findings: [] },
    ],
  };
}

const LLM: LlmResult = {
  at: iso(NOW - 3 * DAY),
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  sampled: 12,
  axes: {
    prompting: {
      score: 84,
      rationale:
        'Prompts usually name the file, the constraint and how to verify. Weaker when follow-ups arrive as one-liners without restating what changed.',
    },
    delegation: {
      score: 78,
      rationale: 'You let the agent run multi-step plans and review at the end. Parallel work (subagents) is rare even where searches are independent.',
    },
    efficiency: {
      score: 74,
      rationale: 'Most sessions converge quickly. Two sampled sessions drifted through three corrections because the goal changed mid-way.',
    },
  },
  tips: [
    'When the goal changes, start a fresh prompt that restates the whole goal instead of correcting the last answer.',
    'Hand independent lookups to subagents in parallel, then ask for a merged summary.',
    'Close each task prompt with an explicit "done when…" line.',
  ],
  summary:
    'A disciplined, context-rich style: you brief the agent like a colleague and verify results. The main upside left is parallelism and cleaner resets when the plan changes.',
};

let latest: LlmResult | null = mode === 'empty' || mode === 'nokey' ? null : LLM;

function evaluation(): EvaluationResponse {
  const hasKey = mode !== 'nokey' && mode !== 'empty';
  return {
    provider: hasKey ? 'anthropic' : null,
    available: [
      { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', configured: hasKey },
      { provider: 'openai', envVar: 'OPENAI_API_KEY', configured: false },
      { provider: 'gemini', envVar: 'GEMINI_API_KEY', configured: false },
    ],
    latest,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, location.origin);
  const method = (init?.method ?? 'GET').toUpperCase();
  await sleep(250 + Math.random() * 450);
  if (mode === 'error' && method === 'GET') throw new Error('connect ECONNREFUSED 127.0.0.1:4319');
  const p = url.pathname;

  if (method === 'GET' && p === '/api/overview') return overview() as T;
  if (method === 'GET' && p === '/api/sessions') return sessions(url.searchParams) as T;
  if (method === 'GET' && p.startsWith('/api/sessions/')) {
    const d = detail(decodeURIComponent(p.slice('/api/sessions/'.length)));
    if (!d) throw new Error('Session not found');
    return d as T;
  }
  if (method === 'GET' && p === '/api/harness') return harness() as T;
  if (method === 'GET' && p === '/api/evaluation') return evaluation() as T;
  if (method === 'POST' && p === '/api/evaluation/estimate') {
    const e: EstimateResponse = { provider: evaluation().provider, model: "gpt-5.4-mini", sessions: Math.min(12, SESSIONS.length), estTokens: 18400 };
    return e as T;
  }
  if (method === 'POST' && p === '/api/evaluation/run') {
    await sleep(4000);
    if (mode === 'fail') throw new Error('anthropic 401: invalid x-api-key');
    latest = { ...LLM, at: iso(Date.now()) };
    return latest as T;
  }
  if (method === 'POST' && p === '/api/rescan') {
    await sleep(900);
    return { ok: true, sessions: SESSIONS.length } as T;
  }
  throw new Error(`mock: no handler for ${method} ${p}`);
}
