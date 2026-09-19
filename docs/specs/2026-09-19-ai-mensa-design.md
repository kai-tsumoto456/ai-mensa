# AI Mensa — Design Spec

Date: 2026-09-19
Status: Approved (architecture), defaults adopted for scoring/UI details

## 1. Goal

A local-first OSS tool that reads the logs and configuration of the AI tools you use,
and shows **how you use AI**, an **evaluation of that usage**, and the **state of your harness**
(instructions, skills, hooks, MCP servers, permissions) in a local web UI.

```
npx ai-mensa
```

Non-goals (v0.1): hosted service, team leaderboards, real-time monitoring, editing the harness from the UI.

## 2. Decisions

| Topic | Decision |
|---|---|
| Sources | Claude Code, Codex CLI, Cursor, ChatGPT export, Claude.ai export |
| Evaluation | Statistical metrics (always) + LLM rubric scoring (optional) |
| LLM keys | BYOK. Each user's own key from env vars. No key → statistics only |
| Delivery | `npx ai-mensa` → local server on `127.0.0.1` + browser UI |
| Presentation | Overall score (**AIQ**) + 6-axis radar + per-axis advice |
| Stack | TypeScript single package. Node ≥ 22.13 (`node:sqlite`), Hono, React + Vite |

## 3. Architecture

```
[tool logs] ─ Adapter ─→ common model (Session / Turn / ToolCall) ─→ SQLite cache (~/.ai-mensa/cache.db)
[tool config] ─ HarnessScanner ─→ HarnessItem ─────────────────────↗
                                                   ↓
                                    Scoring (stats + optional LLM)
                                                   ↓
                                    Hono JSON API ─→ React SPA
```

### 3.1 Adapters (`src/adapters/<tool>/`)

```ts
interface Adapter {
  id: ToolId;                     // 'claude-code' | 'codex' | 'cursor' | 'chatgpt' | 'claude-ai'
  label: string;
  detect(env: Env): Promise<DetectResult>;          // are logs present?
  listSources(env: Env): Promise<SourceRef[]>;      // files / db rows with a change key
  parse(src: SourceRef, env: Env): Promise<Session[]>;
  scanHarness?(env: Env): Promise<HarnessItem[]>;
}
```

| Tool | Logs | Harness |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` (incl. `subagents/`) | `CLAUDE.md` (global + project), `~/.claude/skills`, `agents`, `commands`, `settings.json` hooks/permissions, MCP (`~/.claude.json`, `.mcp.json`), plugins |
| Codex CLI | `~/.codex/sessions/**/*.jsonl`, `~/.codex/archived_sessions/*.jsonl` | `~/.codex/AGENTS.md`, project `AGENTS.md`, `config.toml` (mcp_servers, plugins, approval), `~/.codex/skills` |
| Cursor | `globalStorage/state.vscdb` (`cursorDiskKV` composerData / bubbleId), opened read-only | `~/.cursor/mcp.json`, project `.cursor/rules/*`, `.cursorrules` |
| ChatGPT | `conversations.json` from official export (zip or json) via `ai-mensa import` | none |
| Claude.ai | `conversations.json` from official export via `ai-mensa import` | none |

Unknown or missing fields become `null`. A parse failure of one source is logged and skipped; it never aborts the scan.

### 3.2 Common model

- `Session { id, tool, project, title, startedAt, endedAt, model, turns[], stats }`
- `Turn { role: 'user'|'assistant', text, at, tokensIn, tokensOut, toolCalls[], isCorrection }`
- `ToolCall { name, ok: boolean|null, isSubagent }`
- `HarnessItem { tool, kind: 'instruction'|'skill'|'agent'|'command'|'hook'|'mcp'|'permission'|'rule'|'plugin', name, path, scope: 'global'|'project', updatedAt, sizeBytes, usageCount }`

Usage counts are computed by matching tool calls / text references in sessions (e.g. `Skill` tool input, `mcp__<server>__*` names).

### 3.3 Cache

`~/.ai-mensa/cache.db` (overridable with `AI_MENSA_HOME`). Tables: `sources(key, mtime, size)`, `sessions(json)`, `llm_scores`. Re-parse only sources whose `(mtime,size)` changed. Imported exports are copied into `~/.ai-mensa/imports/`.

### 3.4 CLI

| Command | Action |
|---|---|
| `ai-mensa` | scan then serve UI and open browser |
| `ai-mensa scan` | scan only, print summary |
| `ai-mensa score [--provider] [--sample N] [--yes]` | LLM scoring |
| `ai-mensa import <file>` | import ChatGPT / Claude.ai export |
| `ai-mensa doctor` | show what was detected per tool |

Flags: `--port`, `--no-open`, `--since <days>`.

## 4. Scoring

Six axes, each 0–100. Statistical score always; LLM score blended 50/50 on axes it covers when present.

| Axis | 日本語 | Statistical signals |
|---|---|---|
| prompting | 指示力 | median prompt length (sweet spot band), share of prompts with context (paths, code, constraints, acceptance criteria), low correction rate |
| delegation | 委任力 | tool calls per user turn, autonomous run length, subagent / parallel use |
| efficiency | 協働効率 | low interruption rate, low tool error rate, few correction loops, cache hit ratio |
| harness | ハーネス整備度 | presence of instructions/skills/hooks/MCP/permissions, utilisation (used ÷ installed), freshness |
| breadth | 活用の幅 | number of tools, projects, task categories, models |
| habit | 継続性 | active days in last 30, weekly session count, streak |

Correction detection uses short follow-up prompts matching a small multilingual lexicon (違う/やり直し/no,/wrong/actually…). It is a heuristic and labelled as such in the UI.

**AIQ** = `round(70 + 0.8 × weighted mean)` → range 70–150. 130+ is labelled "Mensa class". Weights default equal; exposed in `~/.ai-mensa/config.json`.

Each axis ships 1–3 rule-based advice strings chosen from the weakest signals (e.g. "3 skills installed but never used in 30 days").

### 4.1 LLM scoring (BYOK)

- Providers: `anthropic` (`ANTHROPIC_API_KEY`), `openai` (`OPENAI_API_KEY`), `gemini` (`GEMINI_API_KEY`). First key found wins unless `--provider`. Raw `fetch`, no SDKs.
- Samples N sessions (default 12), builds a compact digest: user prompts (truncated), tool-call names, outcomes. Redacts secrets (key-like strings), emails, and the home path.
- Shows count of sessions and estimated tokens, asks for confirmation (skipped with `--yes`).
- Rubric returns JSON: per-axis score for prompting / delegation / efficiency with rationale, plus 3 improvement tips. Results stored in `llm_scores`.
- Never runs automatically. Only via `ai-mensa score` or the UI button (which also asks for confirmation).

## 5. UI

Single-page app, served from the package. Routes:

1. **Overview** — AIQ, radar, axis cards with advice, 90-day activity heatmap, per-tool share
2. **Sessions** — filterable list (tool, project, date), detail with turns and tool-call timeline
3. **Harness** — per tool: items by kind, scope, last update, usage count; flags for unused items and missing basics
4. **Evaluation** — LLM scoring status, provider detected, run button, latest rationale and tips

Light/dark via `prefers-color-scheme`. Responsive down to 390px. Japanese and English labels (`?lang=`, default from browser).

## 6. Privacy

- Server binds to `127.0.0.1` only.
- Nothing leaves the machine except explicit LLM scoring requests to the provider the user's key belongs to.
- No telemetry.
- Cursor DB and all logs are opened read-only.

## 7. Error handling

- Missing tool → `detect` returns `{found:false}`, shown in doctor/UI, not an error.
- Malformed line/record → skipped, counted in `scan` summary as `skipped`.
- LLM error → keep statistical scores, show provider error message in UI.
- Port busy → try next 10 ports.

## 8. Testing

- Vitest. Each adapter has small synthetic fixtures (no real user data) under `test/fixtures/<tool>/`.
- Unit tests for metrics, scoring, redaction, AIQ mapping.
- Smoke test: build package, run `scan` against fixtures via `AI_MENSA_HOME` + fixture home override, start server, hit `/api/overview`.

## 9. Repository

- `github.com/kai-tsumoto456/ai-mensa`, MIT license, README in English + Japanese.
