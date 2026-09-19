import { useMemo, useState, type CSSProperties } from 'react';
import type { HarnessFinding, HarnessToolBlock } from '../../../src/server/api-types';
import type { HarnessItem, HarnessKind } from '../../../src/core/types';
import { api } from '../api';
import { useAsync, useDataVersion } from '../hooks';
import { useI18n, type MsgKey } from '../i18n';
import { fmtDateTime, fmtNum, relTime, toolColor } from '../format';
import { EmptyState, ErrorState, Skeleton, Tag, cx } from '../components/ui';

const KINDS: HarnessKind[] = ['instruction', 'skill', 'agent', 'command', 'hook', 'mcp', 'permission', 'rule', 'plugin'];
const PAGE = 30;
const kindKey = (k: HarnessKind) => `kind.${k}` as MsgKey;

export function HarnessPage() {
  const { t } = useI18n();
  const version = useDataVersion();
  const { data, error, loading, reload } = useAsync(() => api.harness(), [version]);

  const blocks = useMemo(() => {
    if (!data) return [];
    return [...data.tools].sort((a, b) => Number(b.found) - Number(a.found) || b.items.length - a.items.length);
  }, [data]);

  return (
    <div>
      <div className="rise mb-2 border-b-2 border-ink pb-2">
        <h1 className="font-serif text-3xl text-ink">{t('h.title')}</h1>
      </div>
      <p className="rise mb-6 max-w-2xl text-sm leading-relaxed text-muted" style={{ '--i': 1 } as CSSProperties}>
        {t('h.intro')}
      </p>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <HarnessSkeleton />
      ) : blocks.every((b) => !b.found || b.items.length === 0) && blocks.every((b) => b.findings.length === 0) ? (
        <EmptyState title={t('h.empty')} />
      ) : (
        <div className={cx('space-y-8 transition-opacity', loading && 'opacity-70')}>
          {error && <ErrorState error={error} onRetry={reload} compact />}
          {blocks.map((b, i) => (
            <ToolBlock key={b.tool} block={b} i={i + 2} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolBlock({ block, i }: { block: HarnessToolBlock; i: number }) {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState<HarnessKind | ''>('');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const unused = block.items.filter((x) => x.usageCount === 0).length;
  const presentKinds = KINDS.filter((k) => (block.counts[k] ?? 0) > 0 || block.items.some((x) => x.kind === k));
  const items = useMemo(() => {
    return block.items
      .filter((x) => (!kind || x.kind === kind) && (!unusedOnly || x.usageCount === 0))
      .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
  }, [block.items, kind, unusedOnly]);

  if (!block.found) {
    return (
      <section className="rise flex flex-wrap items-center gap-3 border border-dashed border-rule-strong px-5 py-3" style={{ '--i': i } as CSSProperties}>
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-faint" aria-hidden />
        <span className="font-serif text-lg text-faint">{block.label}</span>
        <span className="text-xs text-faint">{t('h.notFound')}</span>
      </section>
    );
  }

  return (
    <section className="rise border border-rule bg-surface" style={{ '--i': i } as CSSProperties}>
      <header className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-5 py-4 pl-6">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: toolColor(block.tool) }} aria-hidden />
        <h2 className="font-serif text-2xl text-ink">{block.label}</h2>
        <div className="num flex gap-3 font-mono text-xs text-muted">
          <span>
            {fmtNum(block.items.length, lang)} {t('h.items').toLowerCase()}
          </span>
          {unused > 0 && <span className="text-warn">{t('h.unusedCount', { n: unused })}</span>}
        </div>
      </header>

      {/* counts by kind */}
      <div className="grid grid-cols-3 border-b border-rule sm:grid-cols-5 lg:grid-cols-9">
        {KINDS.map((k) => {
          const n = block.counts[k] ?? block.items.filter((x) => x.kind === k).length;
          const active = kind === k;
          return (
            <button
              type="button"
              key={k}
              disabled={n === 0}
              onClick={() => setKind(active ? '' : k)}
              aria-pressed={active}
              className={cx(
                'cursor-pointer border-b border-r border-rule px-3 py-2.5 text-left transition-colors last:border-r-0 disabled:cursor-default lg:border-b-0',
                active ? 'bg-ink text-paper' : n ? 'hover:bg-sunken' : '',
              )}
            >
              <div className={cx('truncate text-[11px]', active ? 'text-paper/80' : n ? 'text-muted' : 'text-faint')}>
                {t(kindKey(k))}
              </div>
              <div className={cx('num font-serif text-2xl leading-tight', active ? 'text-paper' : n ? 'text-ink' : 'text-faint/60')}>
                {n}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)]">
        {/* findings */}
        <div className="border-b border-rule px-5 py-4 lg:border-b-0 lg:border-r">
          <div className="eyebrow mb-2">{t('h.findings')}</div>
          {block.findings.length ? (
            <ul className="space-y-2">
              {block.findings.map((f, j) => (
                <Finding key={j} f={f} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">—</p>
          )}
        </div>

        {/* items */}
        <div className="min-w-0 px-5 py-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="eyebrow">
              {t('h.items')}
              {kind && (
                <button type="button" onClick={() => setKind('')} className="ml-2 cursor-pointer normal-case tracking-normal text-accent hover:underline">
                  {t(kindKey(kind))} ✕
                </button>
              )}
            </div>
            {unused > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={unusedOnly}
                  onChange={(e) => setUnusedOnly(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                {t('h.unusedOnly')}
              </label>
            )}
          </div>
          {block.items.length === 0 ? (
            <p className="py-3 text-sm text-faint">{t('h.noItems')}</p>
          ) : items.length === 0 ? (
            <p className="py-3 text-sm text-faint">{t('h.noMatch')}</p>
          ) : (
            <>
              {/* permission rules alone can run to hundreds of rows; show a page, expand on demand */}
              <ItemsTable items={expanded ? items : items.slice(0, PAGE)} showKind={!kind || presentKinds.length > 1} />
              {items.length > PAGE && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-3 w-full border border-rule py-2 text-sm text-muted transition-colors hover:bg-sunken hover:text-ink"
                >
                  {expanded ? t('h.showLess') : t('h.showAll', { n: fmtNum(items.length, lang) })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Finding({ f }: { f: HarnessFinding }) {
  const { lang } = useI18n();
  const style = {
    good: { icon: '✓', cls: 'text-good bg-good-soft border-good/30' },
    warn: { icon: '!', cls: 'text-warn bg-warn-soft border-warn/30' },
    info: { icon: 'i', cls: 'text-data bg-data-soft border-data/30' },
  }[f.level];
  return (
    <li className="flex gap-2.5 text-[13px] leading-relaxed text-ink">
      <span
        className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold', style.cls)}
        aria-label={f.level}
      >
        {style.icon}
      </span>
      <span className="min-w-0">{lang === 'ja' ? f.messageJa : f.message}</span>
    </li>
  );
}

function ItemsTable({ items, showKind }: { items: HarnessItem[]; showKind: boolean }) {
  const { t, lang } = useI18n();
  const grid = showKind
    ? 'md:grid-cols-[96px_minmax(0,1fr)_78px_104px_56px]'
    : 'md:grid-cols-[minmax(0,1fr)_78px_104px_56px]';
  return (
    <div role="table" className="text-[13px]">
      <div role="row" className={cx('hidden gap-3 border-b border-rule-strong pb-1.5 md:grid', grid)}>
        {showKind && <span role="columnheader" className="eyebrow">{t('h.kind')}</span>}
        <span role="columnheader" className="eyebrow">{t('h.name')}</span>
        <span role="columnheader" className="eyebrow">{t('h.scope')}</span>
        <span role="columnheader" className="eyebrow">{t('h.updated')}</span>
        <span role="columnheader" className="eyebrow text-right">{t('h.usage')}</span>
      </div>
      {items.map((x, j) => {
        const unused = x.usageCount === 0;
        return (
          <div
            role="row"
            key={`${x.kind}-${x.name}-${x.path ?? j}`}
            className={cx(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-rule py-2 md:gap-y-0',
              grid,
              unused && 'bg-warn-soft/45 -mx-2 px-2',
            )}
          >
            {showKind && (
              <span role="cell" className="hidden truncate text-xs text-muted md:block">
                {t(kindKey(x.kind))}
              </span>
            )}
            <span role="cell" className="min-w-0">
              <span className="block truncate font-mono text-[12.5px] text-ink" title={x.path ?? x.name}>
                {x.name}
              </span>
              <span className="block truncate text-[11px] text-muted md:hidden">
                {t(kindKey(x.kind))} · {x.scope === 'global' ? t('h.global') : t('h.project')} · {relTime(x.updatedAt, lang)}
              </span>
              {x.path && (
                <span className="hidden truncate font-mono text-[10.5px] text-faint md:block" title={x.path}>
                  {x.path}
                </span>
              )}
            </span>
            <span role="cell" className="hidden md:block">
              <Tag tone={x.scope === 'global' ? 'neutral' : 'data'}>{x.scope === 'global' ? t('h.global') : t('h.project')}</Tag>
            </span>
            <span role="cell" className="hidden text-xs text-muted md:block" title={fmtDateTime(x.updatedAt, lang)}>
              {relTime(x.updatedAt, lang)}
            </span>
            <span role="cell" className="text-right">
              {x.usageCount === null ? (
                <span className="font-mono text-xs text-faint" title={t('h.usageNA')}>
                  —
                </span>
              ) : unused ? (
                <Tag tone="warn">{t('h.unused')}</Tag>
              ) : (
                <span className="num font-mono text-[12.5px] text-ink">{fmtNum(x.usageCount, lang)}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HarnessSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="border border-rule bg-surface">
          <div className="border-b border-rule p-5">
            <Skeleton className="h-6 w-40" />
          </div>
          <div className="grid grid-cols-3 gap-px p-4 sm:grid-cols-5 lg:grid-cols-9">
            {Array.from({ length: 9 }, (_, j) => (
              <Skeleton key={j} className="h-12" />
            ))}
          </div>
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }, (_, j) => (
              <Skeleton key={j} className="h-5" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
