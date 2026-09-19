import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { scan, scanHarness, type ScanReport } from '../core/scan.js';
import type { Store } from '../core/store.js';
import { TOOL_LABELS, type Env, type HarnessItem, type HarnessKind, type Session, type ToolId } from '../core/types.js';
import { summarize } from '../core/util.js';
import { planScoring, providerStatus, runScoring } from '../llm/index.js';
import { aiq, harnessFindings, scoreAxes } from '../scoring/index.js';
import type {
  EstimateResponse,
  EvaluationResponse,
  HarnessResponse,
  OverviewResponse,
  SessionDetailResponse,
  SessionsResponse,
} from './api-types.js';

export class AppState {
  sessions: Session[] = [];
  harness = new Map<ToolId, HarnessItem[]>();
  report: ScanReport | null = null;

  constructor(
    public env: Env,
    public store: Store,
  ) {}

  async refresh(log?: (m: string) => void): Promise<ScanReport> {
    this.report = await scan(this.env, this.store, log);
    this.sessions = this.store.allSessions();
    this.harness = await scanHarness(this.env, this.sessions);
    return this.report;
  }

  inWindow(days: number | null): Session[] {
    if (!days) return this.sessions;
    const since = Date.now() - days * 864e5;
    return this.sessions.filter((s) => s.startedAt && new Date(s.startedAt).getTime() >= since);
  }
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function overview(state: AppState, windowDays: number | null): OverviewResponse {
  const sessions = state.inWindow(windowDays);
  const latest = state.store.latestLlm();
  const axes = scoreAxes(sessions, state.harness, latest);
  const score = aiq(axes);

  const activityMap = new Map<string, { sessions: number; userTurns: number }>();
  const now = new Date();
  for (let i = 89; i >= 0; i--) activityMap.set(localDay(new Date(now.getTime() - i * 864e5)), { sessions: 0, userTurns: 0 });
  for (const s of state.sessions) {
    if (!s.startedAt) continue;
    const a = activityMap.get(localDay(new Date(s.startedAt)));
    if (!a) continue;
    a.sessions++;
    a.userTurns += s.turns.filter((t) => t.role === 'user').length;
  }

  const since30 = Date.now() - 30 * 864e5;
  const days30 = new Set(
    state.sessions.filter((s) => s.startedAt && new Date(s.startedAt).getTime() >= since30).map((s) => localDay(new Date(s.startedAt!))),
  );
  let userTurns = 0,
    toolCalls = 0;
  for (const s of sessions)
    for (const t of s.turns) {
      if (t.role === 'user') userTurns++;
      toolCalls += t.toolCalls.length;
    }

  return {
    aiq: score,
    mensaClass: score >= 130,
    axes,
    activity: [...activityMap].map(([date, v]) => ({ date, ...v })),
    tools: (state.report?.tools ?? []).map((t) => ({
      tool: t.tool,
      label: t.label,
      found: t.detect.found,
      sessions: sessions.filter((s) => s.tool === t.tool).length,
      detail: t.detect.detail,
    })),
    totals: {
      sessions: sessions.length,
      userTurns,
      toolCalls,
      projects: new Set(sessions.map((s) => s.project).filter(Boolean)).size,
      activeDays30: days30.size,
    },
    llm: { provider: latest?.provider ?? null, lastScoredAt: latest?.at ?? null },
    generatedAt: new Date().toISOString(),
  };
}

export function harnessResponse(state: AppState): HarnessResponse {
  const tools = (state.report?.tools ?? []).filter((t) => state.harness.has(t.tool));
  return {
    tools: tools.map((t) => {
      const items = state.harness.get(t.tool) ?? [];
      const counts: Partial<Record<HarnessKind, number>> = {};
      for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
      const sessionCount = state.sessions.filter((s) => s.tool === t.tool).length;
      return {
        tool: t.tool,
        label: TOOL_LABELS[t.tool],
        found: t.detect.found || items.length > 0,
        counts,
        items,
        findings: harnessFindings(t.tool, items, sessionCount),
      };
    }),
  };
}

// dist/server/server/app.js → dist/web
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export function createApp(state: AppState, opts: { windowDays: number | null }) {
  const app = new Hono();
  let scoring: Promise<unknown> | null = null;

  // The API exposes private logs and can spend the user's API key, so only the local UI may call it:
  // - Host must be loopback (blocks DNS-rebinding pages)
  // - POST needs a custom header (cross-site forms/fetches can't send it without a CORS preflight we never grant)
  app.use('/api/*', async (c, next) => {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return c.json({ error: 'forbidden host' }, 403);
    if (c.req.method !== 'GET' && c.req.header('x-ai-mensa') !== '1') return c.json({ error: 'missing x-ai-mensa header' }, 403);
    await next();
  });

  app.get('/api/overview', (c) => c.json(overview(state, opts.windowDays)));

  app.get('/api/sessions', (c) => {
    const tool = c.req.query('tool');
    const project = c.req.query('project');
    const q = (c.req.query('q') ?? '').toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50));
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
    let list = state.sessions;
    if (tool) list = list.filter((s) => s.tool === tool);
    if (project) list = list.filter((s) => s.project === project);
    if (q) list = list.filter((s) => (s.title ?? '').toLowerCase().includes(q) || s.turns.some((t) => t.role === 'user' && t.text.toLowerCase().includes(q)));
    const body: SessionsResponse = {
      items: list.slice(offset, offset + limit).map(summarize),
      total: list.length,
      projects: [...new Set(state.sessions.map((s) => s.project).filter((p): p is string => !!p))].sort(),
    };
    return c.json(body);
  });

  app.get('/api/sessions/:id', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const s = state.sessions.find((x) => x.id === id);
    if (!s) return c.json({ error: 'not found' }, 404);
    const body: SessionDetailResponse = { ...s, summary: summarize(s) };
    return c.json(body);
  });

  app.get('/api/harness', (c) => c.json(harnessResponse(state)));

  app.get('/api/evaluation', (c) => {
    const body: EvaluationResponse = {
      provider: planScoring([], {}).provider,
      available: providerStatus(),
      latest: state.store.latestLlm(),
    };
    return c.json(body);
  });

  const lang = (c: { req: { query(k: string): string | undefined; header(k: string): string | undefined } }): 'ja' | 'en' =>
    (c.req.query('lang') ?? c.req.header('accept-language') ?? '').toLowerCase().startsWith('ja') ? 'ja' : 'en';

  app.post('/api/evaluation/estimate', (c) => {
    const plan = planScoring(state.inWindow(opts.windowDays), { lang: lang(c) });
    const body: EstimateResponse = { provider: plan.provider, model: plan.model, sessions: plan.sessions.length, estTokens: plan.estTokens };
    return c.json(body);
  });

  app.post('/api/evaluation/run', async (c) => {
    if (scoring) return c.json({ error: 'Scoring is already running.' }, 409);
    const plan = planScoring(state.inWindow(opts.windowDays), { lang: lang(c) });
    if (!plan.provider) return c.json({ error: 'No LLM API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY and restart.' }, 400);
    const p = runScoring(plan);
    scoring = p;
    try {
      const result = await p;
      state.store.saveLlm(result);
      return c.json(result);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    } finally {
      scoring = null;
    }
  });

  app.post('/api/rescan', async (c) => {
    const r = await state.refresh();
    return c.json({ ok: true, sessions: r.sessions });
  });

  // static SPA
  app.get('*', async (c) => {
    const rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(WEB_DIR, rel);
    const target = file.startsWith(WEB_DIR + path.sep) ? file : path.join(WEB_DIR, 'index.html');
    for (const f of [target, path.join(WEB_DIR, 'index.html')]) {
      try {
        const buf = await readFile(f);
        return c.body(buf, 200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
      } catch {
        /* try fallback */
      }
    }
    return c.text('UI bundle not found. Run `npm run build` first.', 500);
  });

  return app;
}
