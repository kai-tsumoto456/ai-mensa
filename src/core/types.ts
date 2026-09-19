export type ToolId = 'claude-code' | 'codex' | 'cursor' | 'chatgpt' | 'claude-ai';

export const TOOL_LABELS: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  cursor: 'Cursor',
  chatgpt: 'ChatGPT',
  'claude-ai': 'Claude.ai',
};

export interface ToolCall {
  name: string;
  /** true = succeeded, false = errored, null = unknown */
  ok: boolean | null;
  isSubagent: boolean;
  /** skill name, subagent type, MCP server, etc. when known */
  detail: string | null;
}

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  /** ISO timestamp or null */
  at: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensCached: number | null;
  toolCalls: ToolCall[];
  /** user turn that reads like a correction of the previous answer */
  isCorrection: boolean;
  /** user interrupted / aborted the assistant during this turn */
  interrupted: boolean;
  /** slash commands / skills the user invoked explicitly in this turn */
  invoked: string[];
}

export interface Session {
  /** stable id: `${tool}:${nativeId}` */
  id: string;
  tool: ToolId;
  project: string | null;
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  model: string | null;
  turns: Turn[];
}

export interface SessionSummary {
  id: string;
  tool: ToolId;
  project: string | null;
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  model: string | null;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  toolErrors: number;
  corrections: number;
  interruptions: number;
  tokensIn: number;
  tokensOut: number;
}

export type HarnessKind =
  | 'instruction'
  | 'skill'
  | 'agent'
  | 'command'
  | 'hook'
  | 'mcp'
  | 'permission'
  | 'rule'
  | 'plugin';

export interface HarnessItem {
  tool: ToolId;
  kind: HarnessKind;
  name: string;
  path: string | null;
  scope: 'global' | 'project';
  updatedAt: string | null;
  sizeBytes: number | null;
  /** filled in after sessions are loaded; null = not measurable */
  usageCount: number | null;
}

export interface Env {
  home: string;
  /** ai-mensa data dir (cache, imports, config) */
  dataDir: string;
  /** project directories discovered from sessions, used for project-scoped harness */
  projectDirs: string[];
}

export interface SourceRef {
  key: string;
  path: string;
  mtimeMs: number;
  size: number;
  /** adapter-specific extra (e.g. db row key) */
  extra?: string;
}

export interface DetectResult {
  found: boolean;
  detail: string;
  paths: string[];
}

export interface Adapter {
  id: ToolId;
  label: string;
  detect(env: Env): Promise<DetectResult>;
  listSources(env: Env): Promise<SourceRef[]>;
  parse(src: SourceRef, env: Env): Promise<Session[]>;
  scanHarness?(env: Env): Promise<HarnessItem[]>;
}
