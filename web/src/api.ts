import type {
  EstimateResponse,
  EvaluationResponse,
  HarnessResponse,
  LlmResult,
  OverviewResponse,
  SessionDetailResponse,
  SessionsResponse,
} from '../../src/server/api-types';
import type { ToolId } from '../../src/core/types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Mock data is only reachable in `vite dev` with `?mock` in the URL. */
export const USE_MOCK: boolean =
  import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('mock');

function errorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === 'string') return e;
  }
  return null;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK) {
    const m = await import('./mock');
    return m.mockFetch<T>(path, init);
  }
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        // The local server rejects state-changing requests without this header (CSRF guard).
        ...(init?.method && init.method !== 'GET' ? { 'x-ai-mensa': '1' } : {}),
      },
    });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : 'Network error', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new ApiError(errorMessage(body) ?? (text.slice(0, 200) || `HTTP ${res.status}`), res.status);
  }
  const embedded = errorMessage(body);
  if (embedded) throw new ApiError(embedded, res.status);
  return body as T;
}

export interface SessionQuery {
  tool: ToolId | '';
  project: string;
  q: string;
  limit: number;
  offset: number;
}

export const api = {
  overview: () => http<OverviewResponse>('/api/overview'),
  sessions: (p: SessionQuery) => {
    const qs = new URLSearchParams();
    if (p.tool) qs.set('tool', p.tool);
    if (p.project) qs.set('project', p.project);
    if (p.q.trim()) qs.set('q', p.q.trim());
    qs.set('limit', String(p.limit));
    qs.set('offset', String(p.offset));
    return http<SessionsResponse>(`/api/sessions?${qs.toString()}`);
  },
  session: (id: string) => http<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(id)}`),
  harness: () => http<HarnessResponse>('/api/harness'),
  evaluation: () => http<EvaluationResponse>('/api/evaluation'),
  /** `lang` makes the server return LLM rationale in the UI language. */
  estimate: (lang: 'en' | 'ja') =>
    http<EstimateResponse>(`/api/evaluation/estimate?lang=${lang}`, { method: 'POST', body: '{}' }),
  runEvaluation: (lang: 'en' | 'ja') =>
    http<LlmResult>(`/api/evaluation/run?lang=${lang}`, { method: 'POST', body: '{}' }),
  rescan: () => http<{ ok: true; sessions: number }>('/api/rescan', { method: 'POST', body: '{}' }),
};
