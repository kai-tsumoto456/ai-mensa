import type { Lang } from './i18n';
import type { ToolId } from '../../src/core/types';

export const TOOL_ORDER: ToolId[] = ['claude-code', 'codex', 'cursor', 'chatgpt', 'claude-ai'];

export const TOOL_NAMES: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  cursor: 'Cursor',
  chatgpt: 'ChatGPT',
  'claude-ai': 'Claude.ai',
};

export function toolColor(tool: ToolId): string {
  return `var(--tool-${tool})`;
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

export function providerName(p: string | null | undefined): string {
  if (!p) return '—';
  return PROVIDER_NAMES[p] ?? p;
}

function locale(lang: Lang) {
  return lang === 'ja' ? 'ja-JP' : 'en-US';
}

export function fmtNum(n: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang)).format(n);
}

export function fmtCompact(n: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(iso: string | null | undefined, lang: Lang): string {
  const d = parse(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function fmtDay(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short', day: 'numeric', weekday: 'short' }).format(date);
}

export function fmtMonth(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short' }).format(date);
}

const STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.345, 'week'],
  [12, 'month'],
  [Number.POSITIVE_INFINITY, 'year'],
];

export function relTime(iso: string | null | undefined, lang: Lang): string {
  const d = parse(iso);
  if (!d) return '—';
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  let v = (d.getTime() - Date.now()) / 1000;
  for (const [n, unit] of STEPS) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
    v /= n;
  }
  return fmtDateTime(iso, lang);
}

export function fmtDuration(start: string | null, end: string | null, lang: Lang): string {
  const a = parse(start);
  const b = parse(end);
  if (!a || !b) return '—';
  const mins = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (lang === 'ja') return h ? `${h}時間${m}分` : `${m}分`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Parse a YYYY-MM-DD string as a local date. */
export function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
