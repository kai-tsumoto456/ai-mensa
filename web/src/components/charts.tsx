import { useId, useMemo } from 'react';
import type { AxisScore, OverviewResponse } from '../../../src/server/api-types';
import type { ToolId } from '../../../src/core/types';
import { useI18n } from '../i18n';
import { fmtDay, fmtMonth, fmtNum, localDate, toolColor } from '../format';

/* ------------------------------------------------------------------ */
/* AIQ scale: 70–150 with a reference bell curve and the 130+ band     */
/* ------------------------------------------------------------------ */

export function AiqScale({ aiq }: { aiq: number }) {
  const uid = useId().replace(/:/g, '');
  const W = 480;
  const H = 108;
  const base = 78;
  const lo = 70;
  const hi = 150;
  const x = (v: number) => ((v - lo) / (hi - lo)) * W;
  const y = (v: number) => base - Math.exp(-(((v - 100) / 15) ** 2) / 2) * 64;
  const clamped = Math.max(lo, Math.min(hi, aiq));

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let v = lo; v <= hi; v += 1) pts.push(`${x(v).toFixed(1)},${y(v).toFixed(1)}`);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const areaTo = (end: number, start = lo) => {
    const pts: string[] = [`${x(start)},${base}`];
    for (let v = start; v <= end; v += 1) pts.push(`${x(v).toFixed(1)},${y(v).toFixed(1)}`);
    pts.push(`${x(end).toFixed(1)},${y(end).toFixed(1)}`, `${x(end)},${base}`);
    return pts.join(' ');
  };

  const ticks = [70, 85, 100, 115, 130, 150];
  return (
    <svg viewBox={`-8 0 ${W + 16} ${H}`} className="block w-full" role="img" aria-label={`AIQ ${aiq} on a 70–150 scale`}>
      <defs>
        <pattern id={`hatch-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--accent)" strokeWidth="1.2" strokeOpacity="0.55" />
        </pattern>
      </defs>
      {/* 130+ band */}
      <rect x={x(130)} y={10} width={x(150) - x(130)} height={base - 10} fill={`url(#hatch-${uid})`} opacity="0.5" />
      <text x={x(140)} y={22} textAnchor="middle" fontSize="10" fill="var(--accent)" fontFamily="var(--font-mono)" letterSpacing="1.2">
        MENSA
      </text>
      <polygon points={areaTo(clamped)} fill="var(--data)" opacity="0.2" />
      <polyline points={curve.join(' ')} fill="none" stroke="var(--ink-2)" strokeWidth="1.2" />
      <line x1={0} x2={W} y1={base} y2={base} stroke="var(--rule-strong)" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={base} y2={base + 5} stroke="var(--rule-strong)" />
          <text
            x={x(v)}
            y={base + 18}
            textAnchor={v === lo ? 'start' : v === hi ? 'end' : 'middle'}
            fontSize="11"
            fill="var(--muted)"
            fontFamily="var(--font-mono)"
          >
            {v}
          </text>
        </g>
      ))}
      {/* marker */}
      <line x1={x(clamped)} x2={x(clamped)} y1={4} y2={base} stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(clamped)} cy={y(clamped)} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
      <polygon
        points={`${x(clamped) - 5},${base + 1} ${x(clamped) + 5},${base + 1} ${x(clamped)},${base - 6}`}
        fill="var(--accent)"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Radar                                                              */
/* ------------------------------------------------------------------ */

export function Radar({ axes }: { axes: AxisScore[] }) {
  const { lang, t } = useI18n();
  const W = 500;
  const H = 420;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 138;
  const n = Math.max(axes.length, 3);
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number): [number, number] => [
    cx + Math.cos(angle(i)) * R * (Math.max(0, Math.min(100, v)) / 100),
    cy + Math.sin(angle(i)) * R * (Math.max(0, Math.min(100, v)) / 100),
  ];
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const hasLlm = axes.some((a) => a.llmScore !== null);
  const statDiffers = axes.some((a) => a.statScore !== a.score);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[520px]" role="img" aria-label={t('ov.radar')}>
        {[25, 50, 75, 100].map((r) => (
          <polygon
            key={r}
            points={poly(axes.map(() => r))}
            fill={r === 100 ? 'var(--sunken)' : 'none'}
            fillOpacity={r === 100 ? 0.45 : 0}
            stroke="var(--rule-strong)"
            strokeWidth={r === 100 ? 1 : 0.8}
            strokeDasharray={r === 100 ? undefined : '2 3'}
          />
        ))}
        {axes.map((_, i) => {
          const [x2, y2] = pt(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="var(--rule-strong)" strokeWidth="0.8" />;
        })}
        {[50, 100].map((r) => {
          const [, yy] = pt(0, r);
          return (
            <text key={r} x={cx + 5} y={yy + 11} fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">
              {r}
            </text>
          );
        })}

        <g className="radar-shape" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {statDiffers && (
            <polygon
              points={poly(axes.map((a) => a.statScore))}
              fill="none"
              stroke="var(--ink-2)"
              strokeOpacity="0.6"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          )}
          <polygon
            points={poly(axes.map((a) => a.score))}
            fill="var(--data)"
            fillOpacity="0.2"
            stroke="var(--data)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {axes.map((a, i) => {
            const [px, py] = pt(i, a.score);
            return <circle key={a.id} cx={px} cy={py} r="3.5" fill="var(--surface)" stroke="var(--data)" strokeWidth="2" />;
          })}
          {axes.map((a, i) => {
            if (a.llmScore === null) return null;
            const [px, py] = pt(i, a.llmScore);
            return (
              <rect
                key={`llm-${a.id}`}
                x={px - 3.5}
                y={py - 3.5}
                width="7"
                height="7"
                transform={`rotate(45 ${px} ${py})`}
                fill="var(--accent)"
              />
            );
          })}
        </g>

        {axes.map((a, i) => {
          const ang = angle(i);
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const lx = cx + c * (R + 22);
          const ly = cy + s * (R + 22);
          const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
          const dy = s < -0.5 ? -18 : s > 0.5 ? 12 : -4;
          return (
            <g key={`lbl-${a.id}`}>
              <text
                x={lx}
                y={ly + dy}
                textAnchor={anchor}
                fontSize="15"
                fill="var(--ink)"
                fontFamily="var(--font-serif)"
              >
                {lang === 'ja' ? a.labelJa : a.label}
              </text>
              <text
                x={lx}
                y={ly + dy + 18}
                textAnchor={anchor}
                fontSize="13"
                fill="var(--data)"
                fontFamily="var(--font-mono)"
                fontWeight="600"
              >
                {Math.round(a.score)}
              </text>
            </g>
          );
        })}
      </svg>
      {(hasLlm || statDiffers) && (
        <figcaption className="mt-1 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-data" /> {t('ov.blended')}
          </span>
          {statDiffers && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-ink-2" /> {t('ov.statistical')}
            </span>
          )}
          {hasLlm && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rotate-45 bg-accent" /> {t('ov.llmScore')}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* 90-day heatmap (weeks as columns, Monday first)                     */
/* ------------------------------------------------------------------ */

export function Heatmap({ activity }: { activity: OverviewResponse['activity'] }) {
  const { lang, t } = useI18n();
  const cell = 13;
  const gap = 3;
  const step = cell + gap;
  const left = lang === 'ja' ? 18 : 26;
  const top = 16;

  const model = useMemo(() => {
    if (!activity.length) return null;
    const first = localDate(activity[0]!.date);
    const pad = (first.getDay() + 6) % 7;
    const max = Math.max(1, ...activity.map((d) => d.sessions));
    const cols = Math.ceil((pad + activity.length) / 7);
    const cells = activity.map((d, i) => {
      const k = pad + i;
      const level = d.sessions === 0 ? 0 : Math.max(1, Math.ceil((d.sessions / max) * 4));
      return { ...d, col: Math.floor(k / 7), row: k % 7, level, dateObj: localDate(d.date) };
    });
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (const c of cells) {
      if (c.row === 0 || c === cells[0]) {
        const m = c.dateObj.getMonth();
        if (m !== lastMonth) {
          if (!months.length || c.col - months[months.length - 1]!.col >= 3) {
            months.push({ col: c.col, label: fmtMonth(c.dateObj, lang) });
          }
          lastMonth = m;
        }
      }
    }
    return { cells, cols, months, max };
  }, [activity, lang]);

  if (!model) return null;
  const W = left + model.cols * step;
  const H = top + 7 * step;
  const fills = [
    'var(--sunken)',
    'color-mix(in oklab, var(--data) 28%, var(--sunken))',
    'color-mix(in oklab, var(--data) 52%, var(--sunken))',
    'color-mix(in oklab, var(--data) 76%, var(--sunken))',
    'var(--data)',
  ];
  const dayLabels = lang === 'ja' ? ['月', '', '水', '', '金', '', ''] : ['Mon', '', 'Wed', '', 'Fri', '', ''];
  const activeDays = activity.filter((d) => d.sessions > 0).length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ maxWidth: Math.round(W * 1.9) }}
        role="img"
        aria-label={t('ov.activity')}
      >
        {model.months.map((m) => (
          <text key={m.col} x={left + m.col * step} y={10} fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">
            {m.label}
          </text>
        ))}
        {dayLabels.map((d, r) =>
          d ? (
            <text key={r} x={0} y={top + r * step + cell - 3} fontSize="8.5" fill="var(--faint)" fontFamily="var(--font-mono)">
              {d}
            </text>
          ) : null,
        )}
        {model.cells.map((c) => (
          <rect
            key={c.date}
            x={left + c.col * step}
            y={top + c.row * step}
            width={cell}
            height={cell}
            rx="2"
            style={{ fill: fills[c.level] }}
            stroke={c.level === 0 ? 'var(--rule)' : 'none'}
            strokeWidth="0.6"
          >
            <title>
              {t('ov.dayCell', { d: fmtDay(c.dateObj, lang), n: c.sessions, u: c.userTurns })}
            </title>
          </rect>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="num">{t('ov.activeDays', { n: fmtNum(activeDays, lang) })}</span>
        <span className="inline-flex items-center gap-1">
          {t('ov.less')}
          {fills.map((f, i) => (
            <span
              key={i}
              className="inline-block h-2.5 w-2.5 rounded-[2px]"
              style={{ background: f, border: i === 0 ? '0.5px solid var(--rule)' : undefined }}
            />
          ))}
          {t('ov.more')}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tool share                                                          */
/* ------------------------------------------------------------------ */

export function ToolShare({ tools }: { tools: OverviewResponse['tools'] }) {
  const { lang, t } = useI18n();
  const total = tools.reduce((s, x) => s + x.sessions, 0);
  const sorted = [...tools].sort((a, b) => Number(b.found) - Number(a.found) || b.sessions - a.sessions);
  const withSessions = sorted.filter((x) => x.sessions > 0);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-[2px] bg-sunken" aria-hidden>
        {withSessions.map((x) => (
          <div
            key={x.tool}
            className="h-full border-r border-surface last:border-r-0"
            style={{ width: `${(x.sessions / Math.max(1, total)) * 100}%`, background: toolColor(x.tool as ToolId) }}
          />
        ))}
      </div>
      <ul className="mt-4 divide-y divide-rule">
        {sorted.map((x) => {
          const share = total ? (x.sessions / total) * 100 : 0;
          return (
            <li key={x.tool} className="flex items-center gap-3 py-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: x.found ? toolColor(x.tool) : 'transparent', border: x.found ? undefined : '1px dashed var(--faint)' }}
              />
              <div className="min-w-0 flex-1">
                <div className={x.found ? 'text-sm text-ink' : 'text-sm text-faint'}>{x.label}</div>
                <div className="truncate font-mono text-[10.5px] text-faint" title={x.detail}>
                  {x.found ? x.detail : t('ov.notDetected')}
                </div>
              </div>
              {x.found && (
                <div className="text-right">
                  <div className="num font-mono text-sm text-ink">{fmtNum(x.sessions, lang)}</div>
                  <div className="num font-mono text-[10.5px] text-muted">{share.toFixed(share < 10 && share > 0 ? 1 : 0)}%</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
