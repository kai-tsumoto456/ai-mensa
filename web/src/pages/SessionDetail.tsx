import { useState, type CSSProperties, type ReactNode } from 'react';
import type { ToolCall, Turn } from '../../../src/core/types';
import { api } from '../api';
import { useAsync, useDataVersion } from '../hooks';
import { useI18n } from '../i18n';
import { fmtCompact, fmtDateTime, fmtDuration, fmtNum, relTime, TOOL_NAMES, toolColor } from '../format';
import { Button, EmptyState, ErrorState, Skeleton, Tag, cx } from '../components/ui';
import { useInView } from '../motion';

export function SessionDetailPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const version = useDataVersion();
  const { data, error, reload } = useAsync(() => api.session(id), [id, version]);

  const back = (
    <a href="#/sessions" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      ← {t('common.back')}
    </a>
  );

  if (error && !data)
    return (
      <div className="space-y-4">
        {back}
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  if (!data) return <DetailSkeleton back={back} />;

  const s = data.summary;
  const facts: [string, string][] = [
    [t('d.started'), fmtDateTime(data.startedAt, lang)],
    [t('d.duration'), fmtDuration(data.startedAt, data.endedAt, lang)],
    [t('d.model'), data.model ?? '—'],
    [t('d.project'), data.project ?? t('common.noProject')],
  ];
  const counts: [string, number, 'neutral' | 'bad' | 'accent' | 'warn'][] = [
    [t('s.prompts'), s.userTurns, 'neutral'],
    [t('s.calls'), s.toolCalls, 'neutral'],
    [t('s.errors'), s.toolErrors, s.toolErrors ? 'bad' : 'neutral'],
    [t('s.corrections'), s.corrections, s.corrections ? 'accent' : 'neutral'],
    [t('s.interruptions'), s.interruptions, s.interruptions ? 'warn' : 'neutral'],
  ];
  const toneText = { neutral: 'text-ink', bad: 'text-bad', accent: 'text-accent', warn: 'text-warn' } as const;

  return (
    <div>
      {back}
      <header className="rise mt-3 border border-rule bg-surface">
        <div className="relative px-5 py-5 sm:px-7">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: toolColor(data.tool) }} aria-hidden />
          <div className="eyebrow">
            {TOOL_NAMES[data.tool]} · <span title={fmtDateTime(data.startedAt, lang)}>{relTime(data.startedAt, lang)}</span>
          </div>
          <h1 className="mt-1 break-words font-serif text-2xl leading-snug text-ink sm:text-3xl">
            {data.title?.trim() || <span className="italic text-muted">{t('common.untitled')}</span>}
          </h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-0.5 truncate font-mono text-[12.5px] text-ink" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <dl className="grid grid-cols-3 border-t border-rule sm:grid-cols-6">
          {counts.map(([k, v, tone]) => (
            <div key={k} className="border-b border-r border-rule px-4 py-2.5 sm:border-b-0">
              <dt className="eyebrow truncate">{k}</dt>
              <dd className={cx('num mt-0.5 font-serif text-2xl', toneText[tone])}>{fmtNum(v, lang)}</dd>
            </div>
          ))}
          <div className="border-b border-rule px-4 py-2.5 sm:border-b-0">
            <dt className="eyebrow truncate">{t('s.tokens')}</dt>
            <dd className="num mt-0.5 font-mono text-[12px] leading-tight text-ink">
              {fmtCompact(s.tokensIn, lang)} <span className="text-faint">{t('d.in')}</span>
              <br />
              {fmtCompact(s.tokensOut, lang)} <span className="text-faint">{t('d.out')}</span>
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
        <h2 className="font-serif text-2xl text-ink">
          {t('d.turns')} <span className="num font-mono text-sm text-muted">{data.turns.length}</span>
        </h2>
        <span className="text-[11px] text-muted">{t('d.legend')}</span>
      </div>

      {data.turns.length === 0 ? (
        <EmptyState title={t('d.noTurns')} />
      ) : (
        <ol className="relative">
          <span className="absolute bottom-2 left-[15px] top-2 w-px bg-rule-strong sm:left-[19px]" aria-hidden />
          {data.turns.map((turn, i) => (
            <TurnItem key={i} turn={turn} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TurnItem({ turn, index }: { turn: Turn; index: number }) {
  const { t, lang } = useI18n();
  const isUser = turn.role === 'user';
  const [open, setOpen] = useState(false);
  const LIMIT = 700;
  const long = turn.text.length > LIMIT;
  const text = long && !open ? `${turn.text.slice(0, LIMIT).trimEnd()}…` : turn.text;
  const hasTokens = turn.tokensIn !== null || turn.tokensOut !== null || turn.tokensCached !== null;
  // long sessions: reveal turns as they scroll in instead of animating hundreds at once
  const [ref, inView] = useInView<HTMLLIElement>({ rootMargin: '0px 0px -6% 0px' });

  return (
    <li
      ref={ref}
      className={cx('reveal relative pb-4 pl-10 sm:pl-12', inView && 'in')}
      style={{ transitionDelay: `${Math.min(index, 6) * 40}ms` } as CSSProperties}
    >
      <span
        className={cx(
          'absolute left-[8px] top-3 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 transition-transform duration-500 sm:left-[12px]',
          inView ? 'scale-100' : 'scale-0',
          turn.isCorrection
            ? 'border-accent bg-accent'
            : turn.interrupted
              ? 'border-warn bg-warn-soft'
              : isUser
                ? 'border-ink bg-ink'
                : 'border-data bg-surface',
        )}
        aria-hidden
      />
      <div
        className={cx(
          'min-w-0 border px-4 py-3',
          isUser ? 'bg-surface' : 'bg-paper/60',
          turn.isCorrection ? 'border-accent/60' : isUser ? 'border-rule-strong' : 'border-rule',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cx('eyebrow', isUser ? '!text-ink' : '!text-data')}>
            <span className="num text-faint">#{index + 1}</span> {isUser ? t('d.you') : t('d.ai')}
          </span>
          {turn.isCorrection && (
            <Tag tone="accent" title={t('ov.heuristic')}>
              {t('d.correction')} <span className="opacity-70">· {t('d.heuristic')}</span>
            </Tag>
          )}
          {turn.interrupted && <Tag tone="warn">{t('d.interrupted')}</Tag>}
          {turn.invoked.map((name) => (
            <Tag key={name} tone="data" title={t('d.invoked')}>
              {name}
            </Tag>
          ))}
          <span className="flex-1" />
          {turn.at && (
            <time className="font-mono text-[10.5px] text-faint" title={fmtDateTime(turn.at, lang)}>
              {new Date(turn.at).toLocaleTimeString(lang === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
        </div>
        {turn.text && (
          <div
            className={cx(
              'mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed',
              isUser ? 'text-ink' : 'text-ink-2',
            )}
          >
            {text}
          </div>
        )}
        {long && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 cursor-pointer text-xs text-accent hover:underline">
            {open ? t('common.showLess') : t('common.showMore')}
          </button>
        )}
        {turn.toolCalls.length > 0 && <ToolCalls calls={turn.toolCalls} />}
        {hasTokens && (
          <div className="num mt-2 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-faint">
            {turn.tokensIn !== null && (
              <span>
                {fmtNum(turn.tokensIn, lang)} {t('d.in')}
              </span>
            )}
            {turn.tokensOut !== null && (
              <span>
                {fmtNum(turn.tokensOut, lang)} {t('d.out')}
              </span>
            )}
            {turn.tokensCached !== null && turn.tokensCached > 0 && (
              <span>
                {fmtNum(turn.tokensCached, lang)} {t('d.cached')}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function ToolCalls({ calls }: { calls: ToolCall[] }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const MAX = 18;
  const shown = all ? calls : calls.slice(0, MAX);
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5">
      {shown.map((c, i) => {
        const state = c.ok === false ? 'err' : c.ok === true ? 'ok' : 'unk';
        return (
          <li
            key={i}
            title={[c.name, c.detail, state === 'err' ? t('d.toolError') : null].filter(Boolean).join(' — ')}
            className={cx(
              'inline-flex max-w-full items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[11px]',
              state === 'err' && 'border-bad/50 bg-bad-soft text-bad',
              state === 'ok' && 'border-rule-strong bg-surface text-ink-2',
              state === 'unk' && 'border-dashed border-rule-strong text-muted',
            )}
          >
            <span aria-hidden className={state === 'ok' ? 'text-good' : undefined}>
              {state === 'err' ? '✕' : state === 'ok' ? '✓' : '○'}
            </span>
            <span className="truncate">{c.name}</span>
            {c.detail && <span className="truncate text-muted">· {c.detail}</span>}
            {c.isSubagent && <span className="rounded-[2px] bg-data-soft px-1 text-[9.5px] uppercase text-data">{t('d.subagent')}</span>}
          </li>
        );
      })}
      {calls.length > MAX && (
        <li>
          <Button variant="quiet" className="!px-1 !py-0.5 font-mono text-[11px]" onClick={() => setAll((a) => !a)}>
            {all ? t('common.showLess') : t('d.more', { n: calls.length - MAX })}
          </Button>
        </li>
      )}
    </ul>
  );
}

function DetailSkeleton({ back }: { back: ReactNode }) {
  return (
    <div aria-busy="true">
      {back}
      <div className="mt-3 space-y-3 border border-rule bg-surface p-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="ml-12 h-20" />
        ))}
      </div>
    </div>
  );
}
