import type { AxisId, AxisScore, HarnessFinding, LlmResult, Signal } from '../server/api-types.js';
import { TOOL_LABELS, type HarnessItem, type Session, type ToolId } from '../core/types.js';

export const AXES: { id: AxisId; label: string; labelJa: string }[] = [
  { id: 'prompting', label: 'Prompting', labelJa: '指示力' },
  { id: 'delegation', label: 'Delegation', labelJa: '委任力' },
  { id: 'efficiency', label: 'Efficiency', labelJa: '協働効率' },
  { id: 'harness', label: 'Harness', labelJa: 'ハーネス整備度' },
  { id: 'breadth', label: 'Breadth', labelJa: '活用の幅' },
  { id: 'habit', label: 'Habit', labelJa: '継続性' },
];

export const AGENTIC_TOOLS: ToolId[] = ['claude-code', 'codex', 'cursor'];

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const round = (x: number) => Math.round(x);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Score a prompt length: very short prompts lose context, 40–800 chars is the sweet spot. */
export function lengthScore(len: number): number {
  if (len <= 0) return 0;
  if (len < 40) return clamp01(len / 40) * 0.8;
  if (len <= 800) return 1;
  return clamp01(1 - (len - 800) / 4000) * 0.4 + 0.6;
}

const CONTEXT_RE =
  /```|https?:\/\/|(?:^|[\s"'(])[~.]?\/[\w.@-]+\/[\w./@-]+|\b[\w-]+\.(ts|tsx|js|py|md|json|go|rs|java|rb|css|html|yaml|yml|toml|sql|csv|xlsx|pptx|docx|pdf)\b|条件|要件|ゴール|目的|期待|制約|完了条件|受け入れ|前提|背景|例えば|acceptance|requirement|constraint|expected|should|must|goal|because/i;

export function hasContext(text: string): boolean {
  return CONTEXT_RE.test(text);
}

const CATEGORY_RE: [string, RegExp][] = [
  ['code', /bug|error|test|build|deploy|refactor|implement|function|api|コード|実装|エラー|バグ|テスト|ビルド|デプロイ|関数|リファクタ/i],
  ['writing', /記事|文章|原稿|書いて|メール|ブログ|draft|write|article|email|blog|copy|翻訳|translate|要約|summar/i],
  ['research', /調べ|調査|リサーチ|比較|research|investigate|compare|search|検索/i],
  ['data', /データ|分析|集計|csv|xlsx|sql|spreadsheet|スプレッドシート|グラフ|chart|analy/i],
  ['design', /デザイン|ui|ux|lp|ランディング|figma|画像|図解|スライド|design|slide|image|diagram/i],
  ['ops', /設定|インストール|環境|config|setup|install|git|ci|cron|自動化|automation/i],
];

export function categorize(text: string): string | null {
  for (const [c, re] of CATEGORY_RE) if (re.test(text)) return c;
  return null;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Metrics {
  sessions: number;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  medianPromptLen: number;
  contextShare: number;
  correctionRate: number;
  toolCallsPerTurn: number;
  subagentSessionShare: number;
  longRunShare: number;
  interruptionRate: number;
  toolErrorRate: number;
  loopSessionShare: number;
  cacheHitRate: number | null;
  toolsUsed: number;
  projects: number;
  models: number;
  categories: number;
  activeDays30: number;
  sessionsPerWeek: number;
  streak: number;
  agenticSessions: number;
}

export function computeMetrics(sessions: Session[], now = new Date()): Metrics {
  const agentic = sessions.filter((s) => AGENTIC_TOOLS.includes(s.tool));
  const userTexts: string[] = [];
  let userTurns = 0,
    assistantTurns = 0,
    toolCalls = 0,
    corrections = 0,
    interruptions = 0,
    known = 0,
    errors = 0,
    tokensIn = 0,
    cached = 0,
    agenticUserTurns = 0,
    agenticToolCalls = 0,
    agenticAssistant = 0,
    longRuns = 0;
  let openersWithContext = 0,
    openers = 0,
    subagentSessions = 0,
    loopSessions = 0;
  const categories = new Set<string>();
  for (const s of sessions) {
    let firstUser = true;
    let sessionCorrections = 0;
    let usedSubagent = false;
    const isAgentic = AGENTIC_TOOLS.includes(s.tool);
    for (const t of s.turns) {
      if (t.role === 'user') {
        userTurns++;
        if (isAgentic) agenticUserTurns++;
        if (t.text) userTexts.push(t.text);
        if (t.isCorrection) {
          corrections++;
          sessionCorrections++;
        }
        if (firstUser) {
          openers++;
          if (hasContext(t.text)) openersWithContext++;
          const c = categorize(t.text);
          if (c) categories.add(c);
          firstUser = false;
        }
      } else {
        assistantTurns++;
        toolCalls += t.toolCalls.length;
        if (isAgentic) {
          agenticAssistant++;
          agenticToolCalls += t.toolCalls.length;
          if (t.toolCalls.length >= 10) longRuns++;
        }
        if (t.interrupted) interruptions++;
        for (const c of t.toolCalls) {
          if (c.ok !== null) {
            known++;
            if (!c.ok) errors++;
          }
          if (c.isSubagent) usedSubagent = true;
        }
        if (t.tokensIn && t.tokensCached != null) {
          tokensIn += t.tokensIn;
          cached += t.tokensCached;
        }
      }
    }
    if (usedSubagent) subagentSessions++;
    if (sessionCorrections >= 3) loopSessions++;
  }

  const days = new Set<string>();
  const since30 = now.getTime() - 30 * 864e5;
  const since28 = now.getTime() - 28 * 864e5;
  let recent = 0;
  for (const s of sessions) {
    if (!s.startedAt) continue;
    const t = new Date(s.startedAt).getTime();
    if (t >= since30) days.add(dayKey(s.startedAt));
    if (t >= since28) recent++;
  }
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = dayKey(new Date(now.getTime() - i * 864e5).toISOString());
    if (days.has(d)) streak++;
    else if (i > 0) break; // today may still be empty
  }

  return {
    sessions: sessions.length,
    userTurns,
    assistantTurns,
    toolCalls,
    medianPromptLen: median(userTexts.map((t) => t.length)),
    contextShare: openers ? openersWithContext / openers : 0,
    correctionRate: userTurns ? corrections / userTurns : 0,
    toolCallsPerTurn: agenticUserTurns ? agenticToolCalls / agenticUserTurns : 0,
    subagentSessionShare: agentic.length ? subagentSessions / agentic.length : 0,
    longRunShare: agenticAssistant ? longRuns / agenticAssistant : 0,
    interruptionRate: assistantTurns ? interruptions / assistantTurns : 0,
    toolErrorRate: known ? errors / known : 0,
    loopSessionShare: sessions.length ? loopSessions / sessions.length : 0,
    cacheHitRate: tokensIn ? cached / tokensIn : null,
    toolsUsed: new Set(sessions.map((s) => s.tool)).size,
    projects: new Set(sessions.map((s) => s.project).filter(Boolean)).size,
    models: new Set(sessions.map((s) => s.model).filter(Boolean)).size,
    categories: categories.size,
    activeDays30: days.size,
    sessionsPerWeek: recent / 4,
    streak,
    agenticSessions: agentic.length,
  };
}

interface HarnessSummary {
  score: number;
  signals: Signal[];
  weakest: string[];
}

function sig(key: string, label: string, labelJa: string, value: string): Signal {
  return { key, label, labelJa, value };
}

export function harnessSummary(harness: Map<ToolId, HarnessItem[]>, sessions: Session[]): HarnessSummary {
  const weights = new Map<ToolId, number>();
  for (const s of sessions) if (AGENTIC_TOOLS.includes(s.tool)) weights.set(s.tool, (weights.get(s.tool) ?? 0) + 1);
  let total = 0,
    weighted = 0;
  const missing = new Set<string>();
  const missingWhere: string[] = [];
  let installed = 0,
    used = 0;
  let allItems = 0;
  for (const [tool, w] of weights) {
    const items = harness.get(tool) ?? [];
    allItems += items.length;
    const has = (k: HarnessItem['kind']) => items.some((i) => i.kind === k);
    const checks: [string, boolean, number][] = [
      ['instruction', has('instruction'), 25],
      ['skill', has('skill') || has('command') || has('agent'), 15],
      ['hook', has('hook'), 15],
      ['mcp', has('mcp'), 15],
      ['permission', has('permission'), 10],
    ];
    let s = 0;
    for (const [k, ok, pts] of checks) {
      if (ok) s += pts;
      else {
        missing.add(k);
        missingWhere.push(`${k} (${TOOL_LABELS[tool]})`);
      }
    }
    const measurable = items.filter((i) => ['skill', 'command', 'agent', 'mcp'].includes(i.kind) && i.usageCount !== null);
    const u = measurable.filter((i) => (i.usageCount ?? 0) > 0).length;
    installed += measurable.length;
    used += u;
    s += measurable.length ? (u / measurable.length) * 20 : 0;
    weighted += s * w;
    total += w;
  }
  const score = total ? weighted / total : 0;
  const utilisation = installed ? used / installed : 0;
  return {
    score,
    signals: [
      sig('items', 'Harness items', 'ハーネス項目数', String(allItems)),
      sig('utilisation', 'Skills/MCP actually used', '使われている skill・MCP', installed ? `${used}/${installed}` : '—'),
      sig('missing', 'Missing basics', '未整備の基本項目', missingWhere.length ? missingWhere.join(', ') : 'none'),
    ],
    weakest: [...missing, ...(installed && utilisation < 0.5 ? ['utilisation'] : [])],
  };
}

type Advice = { en: string; ja: string };

const ADVICE: Record<string, Advice> = {
  shortPrompts: {
    en: 'Your prompts are very short. State the goal, constraints and what "done" looks like in the first message.',
    ja: '指示が短めです。最初のメッセージで「目的・制約・完了条件」を書くと、やり直しが減ります。',
  },
  noContext: {
    en: 'Few opening prompts include files, URLs or requirements. Point the agent at the concrete material.',
    ja: '最初の指示にファイルパス・URL・要件が入っていないことが多いです。具体的な材料を指し示しましょう。',
  },
  corrections: {
    en: 'Many follow-ups are corrections. Ask the agent to restate the plan before it starts on bigger tasks.',
    ja: '訂正のやり取りが多めです。大きめの作業は、着手前に計画を言い直させて認識を揃えましょう。',
  },
  lowDelegation: {
    en: 'You hand over small steps one at a time. Try giving a whole task with acceptance criteria and let it run.',
    ja: '1手ずつ指示している傾向です。完了条件つきでタスクを丸ごと任せ、走らせてみましょう。',
  },
  noSubagents: {
    en: 'You rarely use subagents or parallel work. Delegate searches and independent subtasks to them.',
    ja: 'サブエージェントや並列作業をほとんど使っていません。調査や独立したサブタスクを任せてみましょう。',
  },
  interruptions: {
    en: 'You interrupt runs often. Put recurring expectations in your instructions file so you do not have to stop it.',
    ja: '実行を途中で止める回数が多めです。毎回伝えている前提は指示ファイルに書いておきましょう。',
  },
  toolErrors: {
    en: 'Tool calls fail often. Check permissions, environment setup and commands the agent keeps getting wrong.',
    ja: 'ツール呼び出しの失敗が多めです。権限設定・環境構築・よく失敗するコマンドを見直しましょう。',
  },
  loops: {
    en: 'Some sessions go in correction loops. Start a fresh session with a clearer brief instead of pushing on.',
    ja: '訂正が続くセッションがあります。粘るより、要件を整理して新しいセッションで仕切り直しましょう。',
  },
  instruction: {
    en: 'No instructions file (CLAUDE.md / AGENTS.md / rules). Write down your project conventions once.',
    ja: '指示ファイル（CLAUDE.md / AGENTS.md / rules）がありません。プロジェクトの約束事を一度書き出しましょう。',
  },
  skill: {
    en: 'No skills or custom commands. Turn workflows you repeat into a skill.',
    ja: 'skill やカスタムコマンドがありません。繰り返している手順を skill にしましょう。',
  },
  hook: {
    en: 'No hooks. Use hooks for checks you always want (format, lint, notifications).',
    ja: 'hooks が未設定です。毎回やらせたい確認（整形・lint・通知）は hooks に任せられます。',
  },
  mcp: {
    en: 'No MCP servers. Connect the services you copy-paste from (issues, docs, DB).',
    ja: 'MCP サーバーがありません。いつもコピペしている先（課題管理・ドキュメント・DB）をつなぎましょう。',
  },
  permission: {
    en: 'No permission rules. Pre-approve safe commands to cut down on approval prompts.',
    ja: '権限ルールがありません。安全なコマンドを事前許可すると、確認待ちが減ります。',
  },
  utilisation: {
    en: 'Many installed skills / MCP servers are never used. Remove them or reference them in your instructions.',
    ja: '入れたまま使われていない skill・MCP が多めです。整理するか、指示ファイルから使い所を示しましょう。',
  },
  oneTool: {
    en: 'You use a single tool for everything. Try an agentic CLI for multi-step work and chat for thinking.',
    ja: '1つのツールに集中しています。多段の作業はエージェント型CLI、壁打ちはチャット、と使い分けてみましょう。',
  },
  narrow: {
    en: 'Your usage is concentrated in one kind of task. Try AI for research, data or writing as well.',
    ja: '使い道が1種類に偏っています。調査・データ分析・文章作成にも広げてみましょう。',
  },
  habit: {
    en: 'Usage is sporadic. A short daily session builds intuition faster than occasional long ones.',
    ja: '利用が散発的です。たまに長く使うより、毎日短く使うほうが勘所が早く身につきます。',
  },
};

function advise(keys: string[]): { advice: string[]; adviceJa: string[] } {
  const picked = keys.filter((k) => ADVICE[k]).slice(0, 3);
  return { advice: picked.map((k) => ADVICE[k].en), adviceJa: picked.map((k) => ADVICE[k].ja) };
}

export function scoreAxes(
  sessions: Session[],
  harness: Map<ToolId, HarnessItem[]>,
  llm: LlmResult | null,
  now = new Date(),
): AxisScore[] {
  const m = computeMetrics(sessions, now);
  const h = harnessSummary(harness, sessions);
  const out: AxisScore[] = [];

  const push = (id: AxisId, stat: number, signals: Signal[], weak: string[]) => {
    const meta = AXES.find((a) => a.id === id)!;
    const llmScore = llm?.axes[id]?.score ?? null;
    const statScore = round(stat * 100);
    const score = llmScore === null ? statScore : round((statScore + llmScore) / 2);
    out.push({ ...meta, score, statScore, llmScore, signals, ...advise(weak) });
  };

  // prompting
  {
    const len = lengthScore(m.medianPromptLen);
    const corr = 1 - clamp01(m.correctionRate / 0.25);
    const stat = 0.35 * len + 0.35 * m.contextShare + 0.3 * corr;
    const weak: string[] = [];
    if (len < 0.8) weak.push('shortPrompts');
    if (m.contextShare < 0.5) weak.push('noContext');
    if (m.correctionRate > 0.1) weak.push('corrections');
    push(
      'prompting',
      stat,
      [
        sig('medianLen', 'Median prompt length', '指示の文字数（中央値）', `${round(m.medianPromptLen)}`),
        sig('context', 'Openers with concrete context', '具体的な材料つきの初回指示', pct(m.contextShare)),
        sig('corrections', 'Correction rate', '訂正の割合', pct(m.correctionRate)),
      ],
      weak,
    );
  }

  // delegation
  {
    const perTurn = clamp01(m.toolCallsPerTurn / 8);
    const sub = clamp01(m.subagentSessionShare / 0.2);
    const long = clamp01(m.longRunShare / 0.25);
    const stat = m.agenticSessions ? 0.5 * perTurn + 0.25 * sub + 0.25 * long : 0;
    const weak: string[] = [];
    if (perTurn < 0.5) weak.push('lowDelegation');
    if (sub < 0.5) weak.push('noSubagents');
    push(
      'delegation',
      stat,
      [
        sig('perTurn', 'Tool calls per instruction', '1指示あたりのツール実行数', m.toolCallsPerTurn.toFixed(1)),
        sig('subagents', 'Sessions using subagents', 'サブエージェントを使ったセッション', pct(m.subagentSessionShare)),
        sig('longRuns', 'Long autonomous runs (10+ calls)', '長い自律実行（10回以上）', pct(m.longRunShare)),
      ],
      weak,
    );
  }

  // efficiency
  {
    const intr = 1 - clamp01(m.interruptionRate / 0.2);
    const err = 1 - clamp01(m.toolErrorRate / 0.3);
    const loops = 1 - clamp01(m.loopSessionShare / 0.3);
    const cache = m.cacheHitRate === null ? null : clamp01(m.cacheHitRate / 0.7);
    const stat = cache === null ? (intr + err + loops) / 3 : 0.3 * intr + 0.3 * err + 0.25 * loops + 0.15 * cache;
    const weak: string[] = [];
    if (intr < 0.6) weak.push('interruptions');
    if (err < 0.6) weak.push('toolErrors');
    if (loops < 0.7) weak.push('loops');
    push(
      'efficiency',
      sessions.length ? stat : 0,
      [
        sig('interrupts', 'Interrupted runs', '中断した実行', pct(m.interruptionRate)),
        sig('toolErrors', 'Tool error rate', 'ツール失敗率', pct(m.toolErrorRate)),
        sig('loops', 'Sessions with 3+ corrections', '訂正3回以上のセッション', pct(m.loopSessionShare)),
        sig('cache', 'Prompt cache hit rate', 'キャッシュ再利用率', m.cacheHitRate === null ? '—' : pct(m.cacheHitRate)),
      ],
      weak,
    );
  }

  // harness
  push('harness', h.score / 100, h.signals, h.weakest);

  // breadth
  {
    const stat =
      0.35 * clamp01(m.toolsUsed / 3) + 0.25 * clamp01(m.projects / 8) + 0.15 * clamp01(m.models / 3) + 0.25 * clamp01(m.categories / 4);
    const weak: string[] = [];
    if (m.toolsUsed < 2) weak.push('oneTool');
    if (m.categories < 3) weak.push('narrow');
    push(
      'breadth',
      stat,
      [
        sig('tools', 'Tools used', '使っているツール数', String(m.toolsUsed)),
        sig('projects', 'Projects', 'プロジェクト数', String(m.projects)),
        sig('models', 'Models', 'モデル数', String(m.models)),
        sig('categories', 'Task categories', 'タスクの種類', `${m.categories}/6`),
      ],
      weak,
    );
  }

  // habit
  {
    const stat = 0.5 * clamp01(m.activeDays30 / 20) + 0.3 * clamp01(m.sessionsPerWeek / 15) + 0.2 * clamp01(m.streak / 7);
    push(
      'habit',
      stat,
      [
        sig('activeDays', 'Active days (last 30)', '利用日数（直近30日）', String(m.activeDays30)),
        sig('perWeek', 'Sessions per week', '週あたりセッション数', m.sessionsPerWeek.toFixed(1)),
        sig('streak', 'Current streak (days)', '連続利用日数', String(m.streak)),
      ],
      stat < 0.5 ? ['habit'] : [],
    );
  }
  return out;
}

/** AIQ: 70 + 0.8 × mean axis score → 70..150. 130+ is "Mensa class". */
export function aiq(axes: AxisScore[]): number {
  if (!axes.length) return 70;
  const mean = axes.reduce((a, x) => a + x.score, 0) / axes.length;
  return Math.round(70 + 0.8 * mean);
}

export function harnessFindings(tool: ToolId, items: HarnessItem[], sessionCount: number): HarnessFinding[] {
  const out: HarnessFinding[] = [];
  const f = (level: HarnessFinding['level'], message: string, messageJa: string) => out.push({ level, message, messageJa });
  if (!AGENTIC_TOOLS.includes(tool)) return out;
  const has = (k: HarnessItem['kind']) => items.some((i) => i.kind === k);
  if (sessionCount === 0 && items.length === 0) return out;
  if (!has('instruction')) f('warn', 'No instructions file found.', '指示ファイルが見つかりません。');
  else f('good', `${items.filter((i) => i.kind === 'instruction').length} instructions file(s).`, `指示ファイル ${items.filter((i) => i.kind === 'instruction').length} 件。`);
  const unused = items.filter((i) => ['skill', 'command', 'agent', 'mcp'].includes(i.kind) && i.usageCount === 0);
  if (unused.length) {
    f('warn', `${unused.length} skill/command/agent/MCP item(s) never used in your logs.`, `ログ上で一度も使われていない skill・コマンド・エージェント・MCP が ${unused.length} 件あります。`);
  }
  const stale = items.filter((i) => i.kind === 'instruction' && i.updatedAt && Date.now() - new Date(i.updatedAt).getTime() > 180 * 864e5);
  if (stale.length) f('info', `${stale.length} instructions file(s) not updated for 6+ months.`, `半年以上更新されていない指示ファイルが ${stale.length} 件あります。`);
  if (!has('hook')) f('info', 'No hooks configured.', 'hooks は未設定です。');
  if (!has('mcp')) f('info', 'No MCP servers configured.', 'MCP サーバーは未設定です。');
  const bigInstr = items.filter((i) => i.kind === 'instruction' && (i.sizeBytes ?? 0) > 40_000);
  if (bigInstr.length) f('warn', `${bigInstr.length} instructions file(s) over 40KB — they eat context every session.`, `40KB を超える指示ファイルが ${bigInstr.length} 件あります。毎回コンテキストを消費します。`);
  return out;
}
