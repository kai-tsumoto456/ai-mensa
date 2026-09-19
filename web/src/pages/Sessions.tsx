import { useEffect, useState, type CSSProperties } from 'react';
import type { SessionSummary, ToolId } from '../../../src/core/types';
import { api } from '../api';
import { useAsync, useDataVersion, useDebounced } from '../hooks';
import { useI18n } from '../i18n';
import { fmtCompact, fmtDateTime, fmtNum, relTime, TOOL_NAMES, TOOL_ORDER, toolColor } from '../format';
import { Button, EmptyState, ErrorState, Select, Skeleton, Tag } from '../components/ui';

const LIMIT = 50;

/** Filters survive navigating to a session and back. */
const saved = { tool: '' as ToolId | '', project: '', q: '', page: 0 };

export function SessionsPage() {
  const { t, lang } = useI18n();
  const version = useDataVersion();
  const [tool, setTool] = useState<ToolId | ''>(saved.tool);
  const [project, setProject] = useState(saved.project);
  const [q, setQ] = useState(saved.q);
  const [page, setPage] = useState(saved.page);
  const dq = useDebounced(q, 300);

  useEffect(() => {
    Object.assign(saved, { tool, project, q, page });
  }, [tool, project, q, page]);

  const { data, error, loading, reload } = useAsync(
    () => api.sessions({ tool, project, q: dq, limit: LIMIT, offset: page * LIMIT }),
    [tool, project, dq, page, version],
  );

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };
  const filtered = Boolean(tool || project || q.trim());
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const projects = data?.projects ?? [];

  return (
    <div>
      <div className="rise mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-2">
        <h1 className="font-serif text-3xl text-ink">{t('s.title')}</h1>
        {data && <span className="num font-mono text-xs text-muted">{t('s.count', { n: fmtNum(total, lang) })}</span>}
      </div>

      <div className="rise mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_220px]" style={{ '--i': 1 } as CSSProperties}>
        <label className="relative block min-w-0">
          <span className="sr-only">{t('s.search')}</span>
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <input
            type="search"
            value={q}
            placeholder={t('s.search')}
            onChange={(e) => reset(() => setQ(e.target.value))}
            className="w-full rounded-[3px] border border-rule-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-faint hover:border-ink-2"
          />
        </label>
        <Select label={t('s.tool')} value={tool} onChange={(v) => reset(() => setTool(v as ToolId | ''))}>
          <option value="">{t('s.allTools')}</option>
          {TOOL_ORDER.map((id) => (
            <option key={id} value={id}>
              {TOOL_NAMES[id]}
            </option>
          ))}
        </Select>
        <Select label={t('s.project')} value={project} onChange={(v) => reset(() => setProject(v))}>
          <option value="">{t('s.allProjects')}</option>
          {project && !projects.includes(project) && <option value={project}>{project}</option>}
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState title={filtered ? t('s.empty') : t('s.emptyAll')}>
          {filtered && (
            <Button
              className="mt-3"
              onClick={() => {
                setTool('');
                setProject('');
                setQ('');
                setPage(0);
              }}
            >
              {t('s.clear')}
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          {error && (
            <div className="mb-3">
              <ErrorState error={error} onRetry={reload} compact />
            </div>
          )}
          <ol className={`border-x border-t border-rule bg-surface transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {data.items.map((s, i) => (
              <SessionRow key={s.id} s={s} i={i} />
            ))}
          </ol>
          <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
            <span className="num font-mono text-xs text-muted">
              {t('s.range', {
                a: fmtNum(page * LIMIT + 1, lang),
                b: fmtNum(Math.min(total, (page + 1) * LIMIT), lang),
                n: fmtNum(total, lang),
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                ← {t('common.prev')}
              </Button>
              <span className="num px-1 font-mono text-xs text-muted">{t('s.page', { p: page + 1, n: pages })}</span>
              <Button disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                {t('common.next')} →
              </Button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

function SessionRow({ s, i }: { s: SessionSummary; i: number }) {
  const { t, lang } = useI18n();
  const href = `#/sessions/${encodeURIComponent(s.id)}`;
  return (
    <li className="rise border-b border-rule" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
      <a
        href={href}
        className="group relative grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 px-4 py-3 pl-5 transition-colors hover:bg-sunken/70 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      >
        {/* tool colour strip widens on hover */}
        <span
          className="absolute inset-y-0 left-0 w-[3px] transition-[width] duration-200 group-hover:w-[6px]"
          style={{ background: toolColor(s.tool) }}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="truncate text-[14.5px] text-ink group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">
            {s.title?.trim() || <span className="italic text-muted">{t('common.untitled')}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="text-ink-2">{TOOL_NAMES[s.tool]}</span>
            <span aria-hidden>·</span>
            <span className="max-w-[16rem] truncate font-mono text-[11.5px]">{s.project ?? t('common.noProject')}</span>
            {s.model && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono text-[11.5px]">{s.model}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <time dateTime={s.startedAt ?? undefined} title={fmtDateTime(s.startedAt, lang)}>
              {relTime(s.startedAt, lang)}
            </time>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11.5px] text-muted md:justify-end">
          <Stat n={s.userTurns} label={t('s.prompts')} lang={lang} />
          <Stat n={s.toolCalls} label={t('s.calls')} lang={lang} />
          <Stat n={s.tokensIn + s.tokensOut} label={t('s.tokens')} lang={lang} compact />
          {s.toolErrors > 0 && <Tag tone="bad">{s.toolErrors} {t('s.errors')}</Tag>}
          {s.corrections > 0 && <Tag tone="accent">{s.corrections} {t('s.corrections')}</Tag>}
          {s.interruptions > 0 && <Tag tone="warn">{s.interruptions} {t('s.interruptions')}</Tag>}
        </div>
      </a>
    </li>
  );
}

function Stat({ n, label, lang, compact }: { n: number; label: string; lang: 'en' | 'ja'; compact?: boolean }) {
  return (
    <span className="num whitespace-nowrap">
      <span className="text-ink">{compact ? fmtCompact(n, lang) : fmtNum(n, lang)}</span> {label}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="border-x border-t border-rule bg-surface" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 border-b border-rule px-5 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: `${40 + ((i * 17) % 45)}%` }} />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="hidden h-3 w-48 md:block" />
        </div>
      ))}
    </div>
  );
}
