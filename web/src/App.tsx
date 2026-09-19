import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, USE_MOCK } from './api';
import { DataVersionContext } from './hooks';
import { useI18n, type Lang, type MsgKey } from './i18n';
import { Button, Spinner, cx } from './components/ui';
import { OverviewPage } from './pages/Overview';
import { SessionsPage } from './pages/Sessions';
import { SessionDetailPage } from './pages/SessionDetail';
import { HarnessPage } from './pages/Harness';
import { EvaluationPage } from './pages/Evaluation';

type Route =
  | { page: 'overview' }
  | { page: 'sessions' }
  | { page: 'session'; id: string }
  | { page: 'harness' }
  | { page: 'evaluation' };

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const [seg, ...rest] = path.split('/');
  switch (seg) {
    case 'sessions': {
      if (rest.length && rest.join('/')) {
        let id = rest.join('/');
        try {
          id = decodeURIComponent(id);
        } catch {
          /* keep raw */
        }
        return { page: 'session', id };
      }
      return { page: 'sessions' };
    }
    case 'harness':
      return { page: 'harness' };
    case 'evaluation':
      return { page: 'evaluation' };
    default:
      return { page: 'overview' };
  }
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const NAV: { key: 'overview' | 'sessions' | 'harness' | 'evaluation'; label: MsgKey }[] = [
  { key: 'overview', label: 'nav.overview' },
  { key: 'sessions', label: 'nav.sessions' },
  { key: 'harness', label: 'nav.harness' },
  { key: 'evaluation', label: 'nav.evaluation' },
];

export function App() {
  const route = useRoute();
  const { t } = useI18n();
  const [version, setVersion] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((text: string, tone: 'ok' | 'err') => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === 'ok' ? 3500 : 7000);
  }, []);

  const rescan = async () => {
    setScanning(true);
    try {
      const r = await api.rescan();
      setVersion((v) => v + 1);
      showToast(t('header.rescanned', { n: r.sessions }), 'ok');
    } catch (e) {
      showToast(t('header.rescanFailed', { msg: e instanceof Error ? e.message : String(e) }), 'err');
    } finally {
      setScanning(false);
    }
  };

  const active = route.page === 'session' ? 'sessions' : route.page;

  useEffect(() => {
    const name = NAV.find((n) => n.key === active);
    document.title = name && active !== 'overview' ? `${t(name.label)} · AI Mensa` : 'AI Mensa';
  }, [active, t]);

  return (
    <DataVersionContext.Provider value={version}>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur-md">
          <div className={cx('absolute inset-x-0 top-0 h-0.5', scanning && 'progress-line')} aria-hidden />
          <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
            <a href="#/" className="flex shrink-0 items-center gap-2.5" aria-label="AI Mensa">
              <Logo busy={scanning} />
              <span className="leading-none">
                <span className="block font-serif text-[19px] tracking-tight text-ink">AI Mensa</span>
                <span className="hidden font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted sm:block">
                  {t('header.tagline')}
                </span>
              </span>
            </a>
            <DesktopNav active={active} />
            <div className="ml-auto flex items-center gap-2">
              {USE_MOCK && (
                <span className="rounded-[3px] border border-dashed border-warn px-1.5 py-px font-mono text-[10px] uppercase text-warn">
                  mock
                </span>
              )}
              <LangToggle />
              <Button variant="primary" onClick={rescan} disabled={scanning} className="!px-2.5 sm:!px-3">
                {scanning ? <Spinner /> : <RescanIcon />}
                <span className="hidden sm:inline">{scanning ? t('header.rescanning') : t('header.rescan')}</span>
                <span className="sr-only sm:hidden">{t('header.rescan')}</span>
              </Button>
            </div>
          </div>
          <nav className="relative grid grid-cols-4 border-t border-rule md:hidden" aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.key}
                href={`#/${n.key}`}
                aria-current={active === n.key ? 'page' : undefined}
                className={cx(
                  'relative py-2.5 text-center text-[13px] transition-colors',
                  active === n.key ? 'text-ink' : 'text-muted',
                )}
              >
                {t(n.label)}
              </a>
            ))}
            {/* one indicator that slides between the four equal columns */}
            <span
              aria-hidden
              className="nav-ink absolute bottom-0 left-0 h-0.5 bg-accent"
              style={{ width: 'calc(25% - 24px)', transform: `translateX(calc(${NAV.findIndex((n) => n.key === active)} * (100vw / 4) + 12px))` }}
            />
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          {/* keyed wrapper replays the enter animation on every route change */}
          <div key={route.page === 'session' ? `session:${route.id}` : route.page} className="page-in">
            {route.page === 'overview' && <OverviewPage />}
            {route.page === 'sessions' && <SessionsPage />}
            {route.page === 'session' && <SessionDetailPage id={route.id} />}
            {route.page === 'harness' && <HarnessPage />}
            {route.page === 'evaluation' && <EvaluationPage />}
          </div>
        </main>

        <footer className="border-t border-rule">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-faint sm:px-6 lg:px-10">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-good" aria-hidden />
              {t('footer.local')}
            </span>
            <a
              href="https://github.com/kai-tsumoto456/ai-mensa"
              target="_blank"
              rel="noreferrer"
              className="font-mono hover:text-ink"
            >
              ai-mensa · MIT
            </a>
          </div>
        </footer>
      </div>

      {toast && (
        <div
          role="status"
          className={cx(
            'rise fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 border px-4 py-2.5 text-sm',
            toast.tone === 'ok' ? 'border-ink bg-ink text-paper' : 'border-bad bg-bad-soft text-bad',
          )}
        >
          {toast.text}
        </div>
      )}
    </DataVersionContext.Provider>
  );
}

function DesktopNav({ active }: { active: string }) {
  const { t, lang } = useI18n();
  const navRef = useRef<HTMLElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);

  // measure the active link so a single underline can glide between items
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (el) setInk({ x: el.offsetLeft + 12, w: el.offsetWidth - 24 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, lang]);

  return (
    <nav ref={navRef} className="relative ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
      {NAV.map((n) => (
        <a
          key={n.key}
          href={`#/${n.key}`}
          aria-current={active === n.key ? 'page' : undefined}
          className={cx('relative px-3 py-1.5 text-sm transition-colors', active === n.key ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          {t(n.label)}
        </a>
      ))}
      {ink && (
        <span
          aria-hidden
          className="nav-ink absolute -bottom-[13px] left-0 h-0.5 bg-accent"
          style={{ width: ink.w, transform: `translateX(${ink.x}px)` }}
        />
      )}
    </nav>
  );
}

function LangToggle() {
  const { lang, setLang, t } = useI18n();
  const opts: { v: Lang; label: string }[] = [
    { v: 'en', label: 'EN' },
    { v: 'ja', label: '日本語' },
  ];
  return (
    <div role="group" aria-label={t('header.lang')} className="flex rounded-[3px] border border-rule-strong p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLang(o.v)}
          aria-pressed={lang === o.v}
          className={cx(
            'cursor-pointer rounded-[2px] px-2 py-0.5 text-xs transition-colors',
            lang === o.v ? 'bg-ink text-paper' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Logo({ busy }: { busy?: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <polygon points="16,6 25,11 25,21 16,26 7,21 7,11" fill="none" stroke="var(--paper)" strokeWidth="1.4" />
      <polygon className={cx('logo-core', busy && 'busy')} points="16,10 22,13.5 20.5,19.5 16,22.5 10.5,19 11,13" fill="var(--accent)" />
    </svg>
  );
}

function RescanIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12.5 1.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
