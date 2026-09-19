// JSON shapes returned by the local API. Imported (type-only) by the web UI.
import type { HarnessItem, HarnessKind, Session, SessionSummary, ToolId } from '../core/types.js';

export type AxisId = 'prompting' | 'delegation' | 'efficiency' | 'harness' | 'breadth' | 'habit';

export interface Signal {
  key: string;
  label: string;
  labelJa: string;
  /** human readable value, e.g. "42%" or "3.1" */
  value: string;
}

export interface AxisScore {
  id: AxisId;
  label: string;
  labelJa: string;
  /** blended final score 0-100 */
  score: number;
  statScore: number;
  llmScore: number | null;
  signals: Signal[];
  advice: string[];
  adviceJa: string[];
}

export interface OverviewResponse {
  aiq: number;
  mensaClass: boolean;
  axes: AxisScore[];
  /** last 90 days, oldest first */
  activity: { date: string; sessions: number; userTurns: number }[];
  tools: { tool: ToolId; label: string; found: boolean; sessions: number; detail: string }[];
  totals: { sessions: number; userTurns: number; toolCalls: number; projects: number; activeDays30: number };
  llm: { provider: string | null; lastScoredAt: string | null };
  generatedAt: string;
}

export interface SessionsResponse {
  items: SessionSummary[];
  total: number;
  projects: string[];
}

export type SessionDetailResponse = Session & { summary: SessionSummary };

export interface HarnessFinding {
  level: 'info' | 'warn' | 'good';
  message: string;
  messageJa: string;
}

export interface HarnessToolBlock {
  tool: ToolId;
  label: string;
  found: boolean;
  counts: Partial<Record<HarnessKind, number>>;
  items: HarnessItem[];
  findings: HarnessFinding[];
}

export interface HarnessResponse {
  tools: HarnessToolBlock[];
}

export interface LlmResult {
  at: string;
  provider: string;
  model: string;
  sampled: number;
  axes: Partial<Record<AxisId, { score: number; rationale: string }>>;
  tips: string[];
  summary: string;
}

export interface EvaluationResponse {
  /** provider that will be used, null if no key */
  provider: string | null;
  available: { provider: string; envVar: string; configured: boolean }[];
  latest: LlmResult | null;
}

export interface EstimateResponse {
  provider: string | null;
  model: string | null;
  sessions: number;
  estTokens: number;
}
