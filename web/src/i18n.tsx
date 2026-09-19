import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'ja';

const en = {
  'nav.overview': 'Overview',
  'nav.sessions': 'Sessions',
  'nav.harness': 'Harness',
  'nav.evaluation': 'Evaluation',
  'header.tagline': 'How you use AI',
  'header.rescan': 'Rescan',
  'header.rescanning': 'Scanning…',
  'header.rescanned': 'Rescanned · {n} sessions',
  'header.rescanFailed': 'Rescan failed: {msg}',
  'header.lang': 'Language',

  'common.retry': 'Retry',
  'common.error': "Couldn't load this view",
  'common.errorHint': 'Is the ai-mensa server still running? Check the terminal where you started it.',
  'common.all': 'All',
  'common.prev': 'Previous',
  'common.next': 'Next',
  'common.showMore': 'Show more',
  'common.showLess': 'Show less',
  'common.untitled': 'Untitled session',
  'common.noProject': 'no project',
  'common.back': 'All sessions',
  'common.close': 'Close',

  'footer.local': 'Runs on 127.0.0.1. Nothing leaves your machine unless you run LLM scoring.',
  'footer.generated': 'Data generated {t}',

  'ov.eyebrow': 'Overall result',
  'ov.aiqSub': 'AI usage quotient',
  'ov.mensa': 'Mensa class',
  'ov.toMensa': '{n} points to Mensa class (130)',
  'ov.scaleNote':
    'Curve for reference only. AIQ maps your weighted axis mean onto 70–150; it is not normed against other people.',
  'ov.radar': 'Six axes',
  'ov.blended': 'Score',
  'ov.statistical': 'Statistical',
  'ov.llmScore': 'LLM',
  'ov.axes': 'Breakdown by axis',
  'ov.signals': 'Signals',
  'ov.advice': 'Advice',
  'ov.noAdvice': 'Nothing to fix here. Keep going.',
  'ov.heuristic': 'Corrections are detected with a heuristic keyword match.',
  'ov.activity': 'Activity',
  'ov.activitySub': 'Last 90 days',
  'ov.activeDays': '{n} active days',
  'ov.dayCell': '{d}: {n} sessions, {u} prompts',
  'ov.less': 'Less',
  'ov.more': 'More',
  'ov.tools': 'Tools',
  'ov.toolsSub': 'Share of sessions',
  'ov.notDetected': 'not detected',
  'ov.totals.sessions': 'Sessions',
  'ov.totals.userTurns': 'Prompts',
  'ov.totals.toolCalls': 'Tool calls',
  'ov.totals.projects': 'Projects',
  'ov.totals.activeDays': 'Active days / 30',
  'ov.llmScored': 'Includes LLM scores from {p}, {t}',
  'ov.llmNone': 'Statistics only. LLM scoring has not been run.',
  'ov.llmRun': 'Run LLM scoring',
  'ov.emptyTitle': 'No AI tool logs found yet',
  'ov.emptyBody': 'AI Mensa reads local logs and config from these tools. Nothing was found in the usual places:',
  'ov.emptyImport':
    'ChatGPT and Claude.ai keep no local logs. Export your data from their settings, then import the file:',
  'ov.emptyRescan': 'Once logs exist or an export is imported, press Rescan.',
  'ov.found': 'found',

  's.title': 'Sessions',
  's.search': 'Search titles and prompts',
  's.tool': 'Tool',
  's.project': 'Project',
  's.allTools': 'All tools',
  's.allProjects': 'All projects',
  's.count': '{n} sessions',
  's.range': '{a}–{b} of {n}',
  's.empty': 'No sessions match these filters.',
  's.emptyAll': 'No sessions yet. Use an AI tool, then press Rescan.',
  's.clear': 'Clear filters',
  's.prompts': 'prompts',
  's.calls': 'tool calls',
  's.errors': 'errors',
  's.corrections': 'corrections',
  's.interruptions': 'interrupts',
  's.tokens': 'tokens',
  's.page': 'Page {p} of {n}',

  'd.you': 'You',
  'd.ai': 'Assistant',
  'd.correction': 'Correction',
  'd.heuristic': 'heuristic',
  'd.interrupted': 'Interrupted',
  'd.in': 'in',
  'd.out': 'out',
  'd.cached': 'cached',
  'd.subagent': 'subagent',
  'd.more': '+{n} more',
  'd.duration': 'Duration',
  'd.started': 'Started',
  'd.model': 'Model',
  'd.project': 'Project',
  'd.turns': 'Turns',
  'd.noTurns': 'This session has no turns.',
  'd.toolError': 'failed',
  'd.invoked': 'Invoked explicitly (slash command / skill)',
  'd.legend': 'Tool calls: ✓ ok · ✕ failed · ○ unknown',

  'h.title': 'Harness',
  'h.intro': 'What each tool is set up with — instructions, skills, hooks, MCP servers, permissions — and whether you actually use it.',
  'h.notFound': 'Not detected on this machine',
  'h.findings': 'Findings',
  'h.items': 'Items',
  'h.showAll': 'Show all {n}',
  'h.showLess': 'Show fewer',
  'h.kind': 'Kind',
  'h.name': 'Name',
  'h.scope': 'Scope',
  'h.updated': 'Updated',
  'h.usage': 'Uses',
  'h.unused': 'unused',
  'h.unusedOnly': 'Unused only',
  'h.unusedCount': '{n} unused',
  'h.global': 'global',
  'h.project': 'project',
  'h.noItems': 'No harness items for this tool.',
  'h.noMatch': 'No items match this filter.',
  'h.empty': 'No harness configuration was detected for any tool.',
  'h.usageNA': 'Usage not measurable',
  'h.allKinds': 'All',

  'kind.instruction': 'Instructions',
  'kind.skill': 'Skills',
  'kind.agent': 'Agents',
  'kind.command': 'Commands',
  'kind.hook': 'Hooks',
  'kind.mcp': 'MCP',
  'kind.permission': 'Permissions',
  'kind.rule': 'Rules',
  'kind.plugin': 'Plugins',

  'e.title': 'Evaluation',
  'e.intro':
    'Statistical scores are always computed locally. Optionally, an LLM reads a redacted sample of your sessions and scores prompting, delegation and efficiency against a rubric. It never runs on its own.',
  'e.providers': 'Providers (bring your own key)',
  'e.active': 'will be used',
  'e.configured': 'key set',
  'e.notConfigured': 'not set',
  'e.noKeyTitle': 'No API key found',
  'e.noKeyBody':
    'LLM scoring uses your own API key. Set one of these environment variables in the shell where you start AI Mensa, then restart it:',
  'e.noKeyFoot': 'The key stays on your machine and is only used for requests you confirm here.',
  'e.run': 'Run LLM scoring',
  'e.rerun': 'Score again',
  'e.estimating': 'Estimating…',
  'e.confirmTitle': 'Send sessions to {p}?',
  'e.confirmBody': '{n} sessions (about {t} tokens) will be sent to {p} using your own API key. Usage is billed to your account.',
  'e.confirmRedact':
    'Only truncated prompts, tool-call names and outcomes are included. Key-like strings, email addresses and your home path are redacted first.',
  'e.nothing': 'There are no sessions to score yet.',
  'e.cancel': 'Cancel',
  'e.send': 'Send and score',
  'e.running': 'Scoring with {p}…',
  'e.runningHint': 'This usually takes 30–90 seconds. You can keep browsing; the result is saved.',
  'e.elapsed': '{s}s elapsed',
  'e.failed': 'LLM scoring failed',
  'e.failedHint': 'Your statistical scores are unaffected.',
  'e.latest': 'Latest LLM result',
  'e.none': 'No LLM scoring has been run yet.',
  'e.summary': 'Summary',
  'e.rationale': 'Rationale by axis',
  'e.tips': 'Tips',
  'e.meta': '{p} · {m} · {n} sessions sampled · {t}',
  'e.estimateFailed': 'Could not estimate: {msg}',
} as const;

export type MsgKey = keyof typeof en;

const ja: Record<MsgKey, string> = {
  'nav.overview': '概要',
  'nav.sessions': 'セッション',
  'nav.harness': 'ハーネス',
  'nav.evaluation': '評価',
  'header.tagline': 'あなたのAIの使い方',
  'header.rescan': '再スキャン',
  'header.rescanning': 'スキャン中…',
  'header.rescanned': '再スキャン完了 · {n} セッション',
  'header.rescanFailed': '再スキャンに失敗しました: {msg}',
  'header.lang': '言語',

  'common.retry': '再試行',
  'common.error': 'この画面を読み込めませんでした',
  'common.errorHint': 'ai-mensa のサーバーは起動したままですか？起動したターミナルを確認してください。',
  'common.all': 'すべて',
  'common.prev': '前へ',
  'common.next': '次へ',
  'common.showMore': 'もっと見る',
  'common.showLess': '折りたたむ',
  'common.untitled': '無題のセッション',
  'common.noProject': 'プロジェクトなし',
  'common.back': 'セッション一覧',
  'common.close': '閉じる',

  'footer.local': '127.0.0.1 で動作しています。LLM評価を実行しない限り、データは外部に送信されません。',
  'footer.generated': 'データ生成 {t}',

  'ov.eyebrow': '総合結果',
  'ov.aiqSub': 'AI活用指数',
  'ov.mensa': 'Mensa class',
  'ov.toMensa': 'Mensa class（130）まであと {n} ポイント',
  'ov.scaleNote':
    '曲線は目安です。AIQ は各軸の加重平均を 70〜150 に写したもので、他の人との比較で標準化した値ではありません。',
  'ov.radar': '6つの軸',
  'ov.blended': 'スコア',
  'ov.statistical': '統計',
  'ov.llmScore': 'LLM',
  'ov.axes': '軸ごとの内訳',
  'ov.signals': '指標',
  'ov.advice': 'アドバイス',
  'ov.noAdvice': '改善点は見つかりませんでした。この調子で。',
  'ov.heuristic': '訂正の検出はキーワードによる推定です。',
  'ov.activity': 'アクティビティ',
  'ov.activitySub': '直近90日',
  'ov.activeDays': '稼働 {n} 日',
  'ov.dayCell': '{d}: {n} セッション / {u} プロンプト',
  'ov.less': '少',
  'ov.more': '多',
  'ov.tools': 'ツール',
  'ov.toolsSub': 'セッション数の割合',
  'ov.notDetected': '未検出',
  'ov.totals.sessions': 'セッション',
  'ov.totals.userTurns': 'プロンプト',
  'ov.totals.toolCalls': 'ツール呼び出し',
  'ov.totals.projects': 'プロジェクト',
  'ov.totals.activeDays': '稼働日数 / 30日',
  'ov.llmScored': '{p} による LLM 評価を含みます（{t}）',
  'ov.llmNone': '統計のみ。LLM 評価はまだ実行していません。',
  'ov.llmRun': 'LLM 評価を実行',
  'ov.emptyTitle': 'AIツールのログがまだ見つかりません',
  'ov.emptyBody': 'AI Mensa は次のツールのローカルログと設定を読み取ります。標準の場所には何も見つかりませんでした:',
  'ov.emptyImport':
    'ChatGPT と Claude.ai はローカルにログを残しません。各サービスの設定からデータをエクスポートし、ファイルをインポートしてください:',
  'ov.emptyRescan': 'ログができたら、またはインポートしたら「再スキャン」を押してください。',
  'ov.found': '検出',

  's.title': 'セッション',
  's.search': 'タイトルとプロンプトを検索',
  's.tool': 'ツール',
  's.project': 'プロジェクト',
  's.allTools': 'すべてのツール',
  's.allProjects': 'すべてのプロジェクト',
  's.count': '{n} セッション',
  's.range': '{n} 件中 {a}–{b}',
  's.empty': '条件に合うセッションはありません。',
  's.emptyAll': 'まだセッションがありません。AIツールを使ってから再スキャンしてください。',
  's.clear': '条件をクリア',
  's.prompts': 'プロンプト',
  's.calls': 'ツール',
  's.errors': 'エラー',
  's.corrections': '訂正',
  's.interruptions': '中断',
  's.tokens': 'トークン',
  's.page': '{p} / {n} ページ',

  'd.you': 'あなた',
  'd.ai': 'アシスタント',
  'd.correction': '訂正',
  'd.heuristic': '推定',
  'd.interrupted': '中断',
  'd.in': '入力',
  'd.out': '出力',
  'd.cached': 'キャッシュ',
  'd.subagent': 'サブエージェント',
  'd.more': '他 {n} 件',
  'd.duration': '所要時間',
  'd.started': '開始',
  'd.model': 'モデル',
  'd.project': 'プロジェクト',
  'd.turns': 'ターン',
  'd.noTurns': 'このセッションにはターンがありません。',
  'd.toolError': '失敗',
  'd.invoked': '明示的に呼び出し（スラッシュコマンド / スキル）',
  'd.legend': 'ツール呼び出し: ✓ 成功 · ✕ 失敗 · ○ 不明',

  'h.title': 'ハーネス',
  'h.intro': '各ツールに何が設定されているか（指示・スキル・フック・MCP・権限）と、それを実際に使っているか。',
  'h.notFound': 'このマシンでは検出されませんでした',
  'h.findings': '所見',
  'h.items': '項目',
  'h.showAll': 'すべて表示（{n} 件）',
  'h.showLess': '折りたたむ',
  'h.kind': '種類',
  'h.name': '名前',
  'h.scope': 'スコープ',
  'h.updated': '更新',
  'h.usage': '使用',
  'h.unused': '未使用',
  'h.unusedOnly': '未使用のみ',
  'h.unusedCount': '未使用 {n}',
  'h.global': 'グローバル',
  'h.project': 'プロジェクト',
  'h.noItems': 'このツールのハーネス項目はありません。',
  'h.noMatch': 'この条件に合う項目はありません。',
  'h.empty': 'どのツールでもハーネス設定は検出されませんでした。',
  'h.usageNA': '使用回数は計測できません',
  'h.allKinds': 'すべて',

  'kind.instruction': '指示ファイル',
  'kind.skill': 'スキル',
  'kind.agent': 'エージェント',
  'kind.command': 'コマンド',
  'kind.hook': 'フック',
  'kind.mcp': 'MCP',
  'kind.permission': '権限',
  'kind.rule': 'ルール',
  'kind.plugin': 'プラグイン',

  'e.title': '評価',
  'e.intro':
    '統計スコアは常にローカルで計算されます。任意で、LLM が匿名化したセッションのサンプルを読み、指示力・委任力・協働効率をルーブリックで採点します。自動では実行されません。',
  'e.providers': 'プロバイダー（自分のAPIキーを使用）',
  'e.active': '使用されます',
  'e.configured': '設定済み',
  'e.notConfigured': '未設定',
  'e.noKeyTitle': 'APIキーが見つかりません',
  'e.noKeyBody':
    'LLM 評価にはあなた自身の API キーを使います。AI Mensa を起動するシェルで次のいずれかの環境変数を設定し、再起動してください:',
  'e.noKeyFoot': 'キーはこのマシンから出ず、ここで確認したリクエストにだけ使われます。',
  'e.run': 'LLM 評価を実行',
  'e.rerun': 'もう一度評価',
  'e.estimating': '見積もり中…',
  'e.confirmTitle': '{p} にセッションを送信しますか？',
  'e.confirmBody': '{n} セッション（約 {t} トークン）を、あなたの API キーで {p} に送信します。利用料金はあなたのアカウントに請求されます。',
  'e.confirmRedact':
    '送るのは短く切り詰めたプロンプト、ツール呼び出し名、結果だけです。送信前にキーらしき文字列・メールアドレス・ホームディレクトリのパスを伏せ字にします。',
  'e.nothing': '評価できるセッションがまだありません。',
  'e.cancel': 'キャンセル',
  'e.send': '送信して評価',
  'e.running': '{p} で評価中…',
  'e.runningHint': '通常 30〜90 秒かかります。他の画面を見ていても結果は保存されます。',
  'e.elapsed': '{s} 秒経過',
  'e.failed': 'LLM 評価に失敗しました',
  'e.failedHint': '統計スコアには影響ありません。',
  'e.latest': '最新の LLM 評価',
  'e.none': 'LLM 評価はまだ実行されていません。',
  'e.summary': '総評',
  'e.rationale': '軸ごとの根拠',
  'e.tips': '改善のヒント',
  'e.meta': '{p} · {m} · {n} セッションを抽出 · {t}',
  'e.estimateFailed': '見積もりに失敗しました: {msg}',
};

const dicts: Record<Lang, Record<MsgKey, string>> = { en, ja };

export type TFn = (key: MsgKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'ai-mensa.lang';

function initialLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ja' || q === 'en') return q;
  } catch {
    /* ignore */
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    document.documentElement.lang = lang;
    const dict = dicts[lang];
    const t: TFn = (key, vars) => {
      let s = dict[key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
    return { lang, setLang, t };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
