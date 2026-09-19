import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { ToolId } from '../../../src/core/types';
import { TOOL_NAMES, toolColor } from '../format';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Panel({
  eyebrow,
  title,
  aside,
  children,
  className,
  i = 0,
  bodyClassName,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  i?: number;
}) {
  return (
    <section
      className={cx('rise min-w-0 border border-rule bg-surface', className)}
      style={{ '--i': i } as CSSProperties}
    >
      {(eyebrow || title || aside) && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="font-serif text-lg leading-snug text-ink">{title}</h2>}
          </div>
          {aside && <div className="text-xs text-muted">{aside}</div>}
        </header>
      )}
      <div className={cx('px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </section>
  );
}

type Variant = 'primary' | 'ghost' | 'accent' | 'quiet';

export function Button({
  variant = 'ghost',
  className,
  children,
  ...rest
}: ComponentProps<'button'> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-ink text-paper hover:bg-ink-2 border border-ink',
    accent: 'bg-accent text-surface hover:opacity-90 border border-accent',
    ghost: 'border border-rule-strong text-ink hover:bg-sunken',
    quiet: 'text-muted hover:text-ink',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[3px] px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cx('spin h-3.5 w-3.5', className)} aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cx('skeleton', className)} style={style} aria-hidden />;
}

export function ErrorState({ error, onRetry, compact }: { error: Error; onRetry?: () => void; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className={cx(
        'rise border border-bad/40 bg-bad-soft/60 text-ink',
        compact ? 'px-4 py-3' : 'px-5 py-6 sm:px-8 sm:py-8',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow !text-bad">Error</div>
          <p className={cx('mt-1 font-serif text-ink', compact ? 'text-base' : 'text-xl')}>{t('common.error')}</p>
          <p className="mt-2 break-words font-mono text-xs text-ink-2">{error.message}</p>
          {!compact && <p className="mt-3 max-w-prose text-sm text-muted">{t('common.errorHint')}</p>}
        </div>
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rise flex flex-col items-center border border-dashed border-rule-strong px-6 py-12 text-center">
      <div className="mb-4 text-faint">{icon ?? <EmptyGlyph />}</div>
      <p className="font-serif text-lg text-ink">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

function EmptyGlyph() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <polygon points="22,4 38,13 38,31 22,40 6,31 6,13" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <polygon points="22,14 29,18 29,26 22,30 15,26 15,18" fill="none" stroke="currentColor" strokeDasharray="2 2" />
    </svg>
  );
}

export function ToolDot({ tool, className }: { tool: ToolId; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ background: toolColor(tool) }}
    />
  );
}

export function ToolTag({ tool }: { tool: ToolId }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2">
      <ToolDot tool={tool} />
      {TOOL_NAMES[tool]}
    </span>
  );
}

export function Tag({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'bad' | 'warn' | 'good' | 'data';
  className?: string;
  title?: string;
}) {
  const tones = {
    neutral: 'border-rule-strong text-muted',
    accent: 'border-accent/50 bg-accent-soft text-accent',
    bad: 'border-bad/40 bg-bad-soft text-bad',
    warn: 'border-warn/40 bg-warn-soft text-warn',
    good: 'border-good/40 bg-good-soft text-good',
    data: 'border-data/40 bg-data-soft text-data',
  } as const;
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[3px] border px-1.5 py-px font-mono text-[10.5px] uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Meter({ value, tone = 'data', className }: { value: number; tone?: 'data' | 'accent' | 'muted'; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone === 'data' ? 'var(--data)' : tone === 'accent' ? 'var(--accent)' : 'var(--faint)';
  return (
    <div className={cx('relative h-1 w-full bg-sunken', className)} aria-hidden>
      <div className="absolute inset-y-0 left-0 transition-[width] duration-700" style={{ width: `${v}%`, background: color }} />
      {[25, 50, 75].map((x) => (
        <span key={x} className="absolute inset-y-0 w-px bg-paper/80" style={{ left: `${x}%` }} />
      ))}
    </div>
  );
}

export function Select({
  value,
  onChange,
  children,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <label className={cx('relative block min-w-0', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none truncate rounded-[3px] border border-rule-strong bg-surface py-2 pl-3 pr-8 text-sm text-ink hover:border-ink-2"
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" viewBox="0 0 12 12" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </label>
  );
}
