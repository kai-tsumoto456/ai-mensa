import type { CSSProperties } from 'react';
import type { AxisScore, OverviewResponse } from '../../../src/server/api-types';
import { api } from '../api';
import { useAsync, useDataVersion } from '../hooks';
import { useI18n } from '../i18n';
import { fmtCompact, fmtNum, providerName, relTime, TOOL_NAMES } from '../format';
import { AiqScale, Heatmap, Radar, ToolShare } from '../components/charts';
import { ErrorState, Meter, Panel, Skeleton, ToolDot } from '../components/ui';
import type { ToolId } from '../../../src/core/types';

export function OverviewPage() {
  const version = useDataVersion();
  const { data, error, loading, reload } = useAsync(() => api.overview(), [version]);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <OverviewSkeleton />;
  if (data.totals.sessions === 0) return <EmptyOverview data={data} />;

  return (
    <div className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      {error && (
        <div className="mb-4">
          <ErrorState error={error} onRetry={reload} compact />
        </div>
      )}
      <Hero data={data} />
      <Totals data={data} />
      <AxisGrid axes={data.axes} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ActivityPanel data={data} />
        <ToolsPanel data={data} />
      </div>
    </div>
  );
}

function Hero({ data }: { data: OverviewResponse }) {
  const { t, lang } = useI18n();
  const gap = Math.max(0, 130 - data.aiq);
  return (
    <section className="rise grid border border-rule bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative flex flex-col border-b border-rule px-5 pb-6 pt-5 sm:px-8 sm:pt-7 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">{t('ov.eyebrow')}</span>
          <span className="eyebrow num">{new Date(data.generatedAt).toISOString().slice(0, 10)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="font-serif text-sm italic text-muted">AIQ · {t('ov.aiqSub')}</div>
            <div
              className="num font-serif leading-[0.85] tracking-tight text-ink"
              style={{ fontSize: 'clamp(88px, 17vw, 148px)' }}
            >
              {data.aiq}
            </div>
          </div>
          <div className="pb-3">
            {data.mensaClass ? (
              <span className="stamp">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <polygon points="6,0.5 7.6,4.3 11.5,4.5 8.4,7 9.5,11 6,8.7 2.5,11 3.6,7 0.5,4.5 4.4,4.3" fill="currentColor" />
                </svg>
                {t('ov.mensa')}
              </span>
            ) : (
              <span className="inline-block max-w-[14rem] text-sm text-muted">{t('ov.toMensa', { n: gap })}</span>
            )}
          </div>
        </div>
        <div className="mt-6">
          <AiqScale aiq={data.aiq} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">{t('ov.scaleNote')}</p>
        <div className="mt-auto pt-5 text-xs text-muted">
          {data.llm.lastScoredAt ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rotate-45 bg-accent" />
              {t('ov.llmScored', { p: providerName(data.llm.provider), t: relTime(data.llm.lastScoredAt, lang) })}
            </span>
          ) : (
            <span>
              {t('ov.llmNone')}{' '}
              <a href="#/evaluation" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
                {t('ov.llmRun')} →
              </a>
            </span>
          )}
        </div>
      </div>
      <div className="px-2 py-4 sm:px-6 sm:py-6">
        <div className="eyebrow px-3 sm:px-0">{t('ov.radar')}</div>
        <Radar axes={data.axes} />
      </div>
    </section>
  );
}

function Totals({ data }: { data: OverviewResponse }) {
  const { t, lang } = useI18n();
  const items: { label: string; value: string; sub?: string }[] = [
    { label: t('ov.totals.sessions'), value: fmtNum(data.totals.sessions, lang) },
    { label: t('ov.totals.userTurns'), value: fmtCompact(data.totals.userTurns, lang) },
    { label: t('ov.totals.toolCalls'), value: fmtCompact(data.totals.toolCalls, lang) },
    { label: t('ov.totals.projects'), value: fmtNum(data.totals.projects, lang) },
    { label: t('ov.totals.activeDays'), value: `${data.totals.activeDays30}`, sub: '/30' },
  ];
  return (
    <dl
      className="rise mt-6 grid grid-cols-2 border-l border-t border-rule sm:grid-cols-3 lg:grid-cols-5"
      style={{ '--i': 2 } as CSSProperties}
    >
      {items.map((it, i) => (
        <div
          key={it.label}
          className={`border-b border-r border-rule bg-surface px-4 py-3.5 sm:px-5 ${i === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}
        >
          <dt className="eyebrow">{it.label}</dt>
          <dd className="num mt-1 font-serif text-3xl text-ink">
            {it.value}
            {it.sub && <span className="ml-0.5 font-mono text-sm text-faint">{it.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AxisGrid({ axes }: { axes: AxisScore[] }) {
  const { t } = useI18n();
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
        <h2 className="font-serif text-2xl text-ink">{t('ov.axes')}</h2>
        <span className="eyebrow">0 — 100</span>
      </div>
      <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2 xl:grid-cols-3">
        {axes.map((a, i) => (
          <AxisCard key={a.id} axis={a} index={i} />
        ))}
      </div>
    </section>
  );
}

function AxisCard({ axis, index }: { axis: AxisScore; index: number }) {
  const { t, lang } = useI18n();
  const advice = lang === 'ja' ? axis.adviceJa : axis.advice;
  const heuristic = axis.id === 'prompting' || axis.id === 'efficiency';
  return (
    <article className="rise flex min-w-0 flex-col bg-surface px-5 pb-5 pt-4" style={{ '--i': 3 + index } as CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow num">{String(index + 1).padStart(2, '0')} · {axis.id}</div>
          <h3 className="mt-0.5 font-serif text-xl text-ink">{lang === 'ja' ? axis.labelJa : axis.label}</h3>
        </div>
        <div className="num shrink-0 font-serif text-4xl leading-none text-ink">
          {Math.round(axis.score)}
        </div>
      </div>
      <Meter value={axis.score} className="mt-3" />
      {axis.llmScore !== null && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="flex justify-between text-muted">
              <span>{t('ov.statistical')}</span>
              <span className="num font-mono text-ink">{Math.round(axis.statScore)}</span>
            </div>
            <Meter value={axis.statScore} tone="muted" className="mt-1" />
          </div>
          <div>
            <div className="flex justify-between text-muted">
              <span>{t('ov.llmScore')}</span>
              <span className="num font-mono text-accent">{Math.round(axis.llmScore)}</span>
            </div>
            <Meter value={axis.llmScore} tone="accent" className="mt-1" />
          </div>
        </div>
      )}

      {axis.signals.length > 0 && (
        <dl className="mt-4 space-y-1.5">
          {axis.signals.map((s) => (
            <div key={s.key} className="flex items-baseline gap-2 text-[13px]">
              <dt className="min-w-0 text-ink-2">{lang === 'ja' ? s.labelJa : s.label}</dt>
              <span className="min-w-4 flex-1 border-b border-dotted border-rule-strong" aria-hidden />
              <dd className="num shrink-0 font-mono text-[12.5px] text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 border-t border-rule pt-3">
        <div className="eyebrow mb-1.5">{t('ov.advice')}</div>
        {advice.length ? (
          <ul className="space-y-1.5">
            {advice.map((line, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                <span className="mt-[3px] shrink-0 font-mono text-[11px] text-accent">→</span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">{t('ov.noAdvice')}</p>
        )}
      </div>
      {heuristic && <p className="mt-auto pt-3 text-[10.5px] text-faint">* {t('ov.heuristic')}</p>}
    </article>
  );
}

function ActivityPanel({ data }: { data: OverviewResponse }) {
  const { t } = useI18n();
  return (
    <Panel eyebrow={t('ov.activitySub')} title={t('ov.activity')} i={9}>
      <Heatmap activity={data.activity} />
    </Panel>
  );
}

function ToolsPanel({ data }: { data: OverviewResponse }) {
  const { t } = useI18n();
  return (
    <Panel eyebrow={t('ov.toolsSub')} title={t('ov.tools')} i={10}>
      <ToolShare tools={data.tools} />
    </Panel>
  );
}

const TOOL_WHERE: Record<ToolId, string> = {
  'claude-code': '~/.claude/projects/**/*.jsonl',
  codex: '~/.codex/sessions/**/*.jsonl',
  cursor: 'Cursor · globalStorage/state.vscdb',
  chatgpt: 'conversations.json (export)',
  'claude-ai': 'conversations.json (export)',
};

function EmptyOverview({ data }: { data: OverviewResponse }) {
  const { t } = useI18n();
  const tools = data.tools.length
    ? data.tools
    : (Object.keys(TOOL_NAMES) as ToolId[]).map((tool) => ({ tool, label: TOOL_NAMES[tool], found: false, sessions: 0, detail: '' }));
  return (
    <section className="rise mx-auto max-w-3xl border border-rule bg-surface px-5 py-8 sm:px-10 sm:py-10">
      <div className="eyebrow">AI Mensa</div>
      <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">{t('ov.emptyTitle')}</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">{t('ov.emptyBody')}</p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {tools.map((x) => (
          <li key={x.tool} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <ToolDot tool={x.tool} />
            <span className="w-28 text-sm text-ink">{x.label}</span>
            <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-muted">{x.detail || TOOL_WHERE[x.tool]}</code>
            <span className={`font-mono text-[10.5px] uppercase tracking-wider ${x.found ? 'text-good' : 'text-faint'}`}>
              {x.found ? t('ov.found') : t('ov.notDetected')}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm leading-relaxed text-ink-2">{t('ov.emptyImport')}</p>
      <pre className="mt-3 overflow-x-auto border border-rule bg-sunken px-4 py-3 font-mono text-[12.5px] text-ink">
        <span className="text-faint">$ </span>npx ai-mensa import ~/Downloads/chatgpt-export.zip{'\n'}
        <span className="text-faint">$ </span>npx ai-mensa import ~/Downloads/claude-export/conversations.json
      </pre>
      <p className="mt-5 text-sm text-muted">{t('ov.emptyRescan')}</p>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true">
      <div className="grid border border-rule bg-surface lg:grid-cols-2">
        <div className="space-y-4 border-b border-rule p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-28 w-48" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="flex items-center justify-center p-8">
          <Skeleton className="aspect-square w-3/5 rounded-full" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="mt-10 grid gap-px sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
