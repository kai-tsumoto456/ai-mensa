import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AxisId, EstimateResponse, EvaluationResponse, LlmResult } from '../../../src/server/api-types';
import { api } from '../api';
import { useAsync, useDataVersion } from '../hooks';
import { useI18n } from '../i18n';
import { fmtDateTime, fmtNum, providerName, relTime } from '../format';
import { Button, ErrorState, Meter, Panel, Skeleton, Spinner, cx } from '../components/ui';

const AXIS_LABELS: Record<AxisId, { en: string; ja: string }> = {
  prompting: { en: 'Prompting', ja: '指示力' },
  delegation: { en: 'Delegation', ja: '委任力' },
  efficiency: { en: 'Efficiency', ja: '協働効率' },
  harness: { en: 'Harness', ja: 'ハーネス整備度' },
  breadth: { en: 'Breadth', ja: '活用の幅' },
  habit: { en: 'Habit', ja: '継続性' },
};
const AXIS_ORDER: AxisId[] = ['prompting', 'delegation', 'efficiency', 'harness', 'breadth', 'habit'];

type Phase =
  | { kind: 'idle' }
  | { kind: 'estimating' }
  | { kind: 'confirm'; estimate: EstimateResponse }
  | { kind: 'running'; provider: string | null; startedAt: number }
  | { kind: 'error'; message: string };

export function EvaluationPage() {
  const { t, lang } = useI18n();
  const version = useDataVersion();
  const { data, error, reload } = useAsync(() => api.evaluation(), [version]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [fresh, setFresh] = useState<LlmResult | null>(null);

  const latest = fresh ?? data?.latest ?? null;

  const start = async () => {
    setPhase({ kind: 'estimating' });
    try {
      const estimate = await api.estimate(lang);
      setPhase({ kind: 'confirm', estimate });
    } catch (e) {
      setPhase({ kind: 'error', message: t('e.estimateFailed', { msg: e instanceof Error ? e.message : String(e) }) });
    }
  };

  const run = async (provider: string | null) => {
    setPhase({ kind: 'running', provider, startedAt: Date.now() });
    try {
      const res = await api.runEvaluation(lang);
      setFresh(res);
      setPhase({ kind: 'idle' });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div>
      <div className="rise mb-2 border-b-2 border-ink pb-2">
        <h1 className="font-serif text-3xl text-ink">{t('e.title')}</h1>
      </div>
      <p className="rise mb-6 max-w-2xl text-sm leading-relaxed text-muted" style={{ '--i': 1 } as CSSProperties}>
        {t('e.intro')}
      </p>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]" aria-busy="true">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="space-y-6">
            <ProviderPanel data={data} />
            <RunPanel data={data} phase={phase} hasResult={Boolean(latest)} onRun={start} onDismiss={() => setPhase({ kind: 'idle' })} />
          </div>
          <ResultPanel result={latest} />
        </div>
      )}

      {phase.kind === 'confirm' && (
        <ConfirmDialog
          estimate={phase.estimate}
          onCancel={() => setPhase({ kind: 'idle' })}
          onConfirm={() => run(phase.estimate.provider)}
        />
      )}
    </div>
  );
}

function ProviderPanel({ data }: { data: EvaluationResponse }) {
  const { t } = useI18n();
  const none = !data.provider;
  return (
    <Panel eyebrow="BYOK" title={t('e.providers')} i={2}>
      <ul className="divide-y divide-rule">
        {data.available.map((p) => {
          const active = p.provider === data.provider;
          return (
            <li key={p.provider} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span
                className={cx('h-2 w-2 shrink-0 rounded-full', p.configured ? 'bg-good' : 'border border-faint')}
                aria-hidden
              />
              <span className={cx('text-sm', p.configured ? 'text-ink' : 'text-muted')}>{providerName(p.provider)}</span>
              <code className="font-mono text-[11px] text-faint">{p.envVar}</code>
              <span className="flex-1" />
              {active ? (
                <span className="rounded-[3px] bg-ink px-1.5 py-px font-mono text-[10.5px] uppercase tracking-wider text-paper">
                  {t('e.active')}
                </span>
              ) : (
                <span className={cx('font-mono text-[10.5px] uppercase tracking-wider', p.configured ? 'text-good' : 'text-faint')}>
                  {p.configured ? t('e.configured') : t('e.notConfigured')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {none && (
        <div className="mt-4 border-l-2 border-accent bg-accent-soft/50 px-4 py-3">
          <p className="font-serif text-base text-ink">{t('e.noKeyTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t('e.noKeyBody')}</p>
          <pre className="mt-3 overflow-x-auto border border-rule bg-surface px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
            {data.available.map((p, i) => (
              <span key={p.envVar}>
                <span className="text-faint">{i === 0 ? '$ ' : '# '}</span>
                {i === 0 ? '' : 'or: '}export {p.envVar}=…{'\n'}
              </span>
            ))}
            <span className="text-faint">$ </span>npx ai-mensa
          </pre>
          <p className="mt-2 text-[11.5px] text-muted">{t('e.noKeyFoot')}</p>
        </div>
      )}
    </Panel>
  );
}

function RunPanel({
  data,
  phase,
  hasResult,
  onRun,
  onDismiss,
}: {
  data: EvaluationResponse;
  phase: Phase;
  hasResult: boolean;
  onRun: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const busy = phase.kind === 'estimating' || phase.kind === 'running';
  return (
    <Panel eyebrow={providerName(data.provider)} title={hasResult ? t('e.rerun') : t('e.run')} i={3}>
      {phase.kind === 'running' ? (
        <Running provider={phase.provider ?? data.provider} startedAt={phase.startedAt} />
      ) : (
        <>
          <Button variant="primary" className="w-full py-2.5" disabled={!data.provider || busy} onClick={onRun}>
            {phase.kind === 'estimating' ? (
              <>
                <Spinner /> {t('e.estimating')}
              </>
            ) : hasResult ? (
              t('e.rerun')
            ) : (
              t('e.run')
            )}
          </Button>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">{t('e.confirmRedact')}</p>
          {phase.kind === 'error' && (
            <div role="alert" className="mt-4 border border-bad/40 bg-bad-soft/60 px-4 py-3">
              <p className="font-serif text-base text-bad">{t('e.failed')}</p>
              <p className="mt-1 break-words font-mono text-[11.5px] text-ink-2">{phase.message}</p>
              <p className="mt-2 text-xs text-muted">{t('e.failedHint')}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" onClick={onRun} disabled={!data.provider}>
                  {t('common.retry')}
                </Button>
                <Button variant="quiet" onClick={onDismiss}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function Running({ provider, startedAt }: { provider: string | null; startedAt: number }) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.floor((now - startedAt) / 1000);
  return (
    <div aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-ink">
        <Spinner className="text-accent" /> {t('e.running', { p: providerName(provider) })}
      </div>
      <div className="progress-line mt-3 h-0.5 w-full bg-sunken" />
      <div className="mt-2 flex justify-between text-[11.5px] text-muted">
        <span>{t('e.runningHint')}</span>
        <span className="num shrink-0 pl-3 font-mono">{t('e.elapsed', { s })}</span>
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: LlmResult | null }) {
  const { t, lang } = useI18n();
  if (!result) {
    return (
      <Panel eyebrow={t('e.latest')} title="—" i={4}>
        <div className="flex flex-col items-center py-10 text-center">
          <svg width="56" height="56" viewBox="0 0 56 56" className="text-faint" aria-hidden>
            <rect x="10" y="6" width="36" height="44" rx="2" fill="none" stroke="currentColor" />
            {[16, 23, 30, 37].map((y) => (
              <line key={y} x1="16" x2={y === 37 ? 30 : 40} y1={y} y2={y} stroke="currentColor" strokeDasharray="2 2" />
            ))}
          </svg>
          <p className="mt-3 text-sm text-muted">{t('e.none')}</p>
        </div>
      </Panel>
    );
  }
  const axes = AXIS_ORDER.filter((id) => result.axes[id]);
  return (
    <Panel
      eyebrow={t('e.latest')}
      title={<span title={fmtDateTime(result.at, lang)}>{relTime(result.at, lang)}</span>}
      aside={
        <span className="font-mono text-[11px]">
          {t('e.meta', { p: providerName(result.provider), m: result.model, n: fmtNum(result.sampled, lang), t: fmtDateTime(result.at, lang) })}
        </span>
      }
      i={4}
    >
      <div className="eyebrow mb-1.5">{t('e.summary')}</div>
      <p className="font-serif text-[17px] leading-relaxed text-ink">{result.summary}</p>

      <div className="eyebrow mb-2 mt-6">{t('e.rationale')}</div>
      <div className="space-y-px border border-rule bg-rule">
        {axes.map((id) => {
          const a = result.axes[id]!;
          return (
            <div key={id} className="bg-surface px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-base text-ink">{AXIS_LABELS[id][lang]}</span>
                <span className="num font-mono text-lg text-accent">{Math.round(a.score)}</span>
              </div>
              <Meter value={a.score} tone="accent" className="mt-1.5" />
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{a.rationale}</p>
            </div>
          );
        })}
      </div>

      {result.tips.length > 0 && (
        <>
          <div className="eyebrow mb-2 mt-6">{t('e.tips')}</div>
          <ol className="space-y-2.5">
            {result.tips.map((tip, i) => (
              <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-ink">
                <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent font-mono text-[10.5px] text-accent">
                  {i + 1}
                </span>
                <span className="min-w-0">{tip}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}

function ConfirmDialog({
  estimate,
  onCancel,
  onConfirm,
}: {
  estimate: EstimateResponse;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t, lang } = useI18n();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const p = providerName(estimate.provider) + (estimate.model ? ` (${estimate.model})` : '');
  const nothing = estimate.sessions === 0 || !estimate.provider;

  useEffect(() => {
    (nothing ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, nothing]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="backdrop-in absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="dialog-in relative max-h-[calc(100vh-24px)] w-full max-w-lg overflow-y-auto border border-rule-strong bg-surface"
      >
        <div className="h-1 bg-accent" aria-hidden />
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="eyebrow">{t('e.run')}</div>
          <h2 id="confirm-title" className="mt-1 font-serif text-2xl text-ink">
            {t('e.confirmTitle', { p })}
          </h2>
          {nothing ? (
            <p className="mt-3 text-sm text-ink-2">{t('e.nothing')}</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 border border-rule">
                <div className="border-r border-rule px-4 py-3">
                  <div className="eyebrow">{t('ov.totals.sessions')}</div>
                  <div className="num font-serif text-3xl text-ink">{fmtNum(estimate.sessions, lang)}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="eyebrow">{t('s.tokens')}</div>
                  <div className="num font-serif text-3xl text-ink">~{fmtNum(estimate.estTokens, lang)}</div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink">
                {t('e.confirmBody', { n: fmtNum(estimate.sessions, lang), t: fmtNum(estimate.estTokens, lang), p })}
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{t('e.confirmRedact')}</p>
            </>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} onClick={onCancel}>
              {t('e.cancel')}
            </Button>
            {!nothing && (
              <Button ref={confirmRef} variant="accent" onClick={onConfirm}>
                {t('e.send')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
