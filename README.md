# AI Mensa

**See how you actually use AI.** AI Mensa reads the local logs and config of the AI tools you use, scores your usage (**AIQ**), and shows the state of your agent harness — all on your own machine.

[日本語 README](README.ja.md)

```bash
npx ai-mensa
```

That scans your logs and opens a dashboard at `http://127.0.0.1:4319`.

## What you get

- **AIQ** — one overall score from 70 to 150. 130+ is "Mensa class".
- **Six axes, each with the signals behind it and concrete advice**

  | Axis | What it looks at |
  |---|---|
  | Prompting | prompt length, whether first prompts give files/URLs/requirements, correction rate |
  | Delegation | tool calls per instruction, subagent use, long autonomous runs |
  | Efficiency | interrupted runs, tool error rate, correction loops, prompt-cache hit rate |
  | Harness | instructions file, skills, hooks, MCP, permissions; share of installed skills/MCP actually used |
  | Breadth | tools, projects, models and task types you use AI for |
  | Habit | active days, sessions per week, streak |

- **Sessions** — every conversation across tools, with turns, tool calls, errors, interruptions and token counts.
- **Harness** — per tool: instructions files, skills, agents, commands, hooks, MCP servers, permission rules, plugins; when each was last updated and how often it is actually used. Unused skills and MCP servers are flagged.
- **Optional LLM evaluation** — a model reads redacted digests of your sessions and scores prompting / delegation / efficiency with written rationale and tips. It uses **your own API key** and only runs when you ask.

## Supported tools

| Tool | What is read | How |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl`, `CLAUDE.md`, skills, agents, commands, `settings.json`, MCP config | automatic |
| Codex CLI | `~/.codex/sessions`, `archived_sessions`, `AGENTS.md`, `config.toml`, skills, prompts | automatic |
| Cursor | `state.vscdb` (opened read-only), `.cursor/rules`, `.cursorrules`, `mcp.json` | automatic |
| ChatGPT | `conversations.json` from *Settings → Data controls → Export* | `npx ai-mensa import chatgpt-export.zip` |
| Claude.ai | `conversations.json` from *Settings → Privacy → Export data* | `npx ai-mensa import claude-export.zip` |

Project-level harness files are discovered from the working directories that appear in your sessions.

## Commands

```bash
npx ai-mensa                    # scan + dashboard (flags: --port, --no-open, --since <days>)
npx ai-mensa scan               # scan and print AIQ in the terminal
npx ai-mensa doctor             # what was detected, which API keys are set
npx ai-mensa import <file>      # ChatGPT / Claude.ai export (.zip or conversations.json)
npx ai-mensa score              # LLM evaluation (flags: --provider, --sample, --lang, --yes)
```

## LLM evaluation (bring your own key)

Set one of these and restart:

| Provider | Env var | Default model |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| OpenAI | `OPENAI_API_KEY` | `gpt-5.4-mini` |
| Google | `GEMINI_API_KEY` | `gemini-flash-latest` |

Override the model with `AI_MENSA_MODEL`. Before anything is sent, AI Mensa shows how many sessions and roughly how many tokens will go to which provider, and asks you to confirm.

What is sent: up to 12 recent sessions (configurable), as digests — your prompts truncated to 600 chars, assistant replies to 200 chars, and tool-call counts. API keys, tokens, e-mail addresses and your home path are redacted first. When LLM scores exist, each of the three axes is the average of the statistical and LLM score.

## Privacy

- Everything runs locally. The server binds to `127.0.0.1` only, rejects non-loopback `Host` headers, and requires a custom header on write requests so other websites cannot read your logs or trigger scoring.
- No telemetry. The only outbound request is the LLM evaluation you start yourself.
- Logs and the Cursor database are opened read-only. Parsed sessions are cached in `~/.ai-mensa/cache.db` (change with `AI_MENSA_HOME`); delete that folder to remove everything AI Mensa stored.

## How scoring works, and its limits

The statistical scores are heuristics, and the thresholds are in [`src/scoring/index.ts`](src/scoring/index.ts). Some things to know:

- **Correction detection** matches short push-back phrases ("違う", "that's wrong", "revert"…) in Japanese and English. It is deliberately conservative and misses corrections phrased politely; the LLM evaluation judges corrections in context.
- **Delegation** only counts agentic tools (Claude Code, Codex, Cursor). Chat-only users score low there by design.
- **Usage of skills / MCP** is counted from tool calls and slash commands in your logs. Skills that a tool loads implicitly without a visible call are counted as unused.
- Codex guardian reviews and spawned sub-threads are excluded; they are machine-driven, not your sessions.

Thresholds will change as more people use it. Issues with anonymised examples are welcome.

## Development

Requires Node.js 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
npm run build        # server (tsc) + web UI (vite)
npm test             # vitest, synthetic fixtures only
node bin/ai-mensa.js # run the local build
npm run dev:web      # UI dev server on :5173, proxies /api to :4319
```

Layout:

```
src/adapters/<tool>/   one adapter per tool: detect, listSources, parse, scanHarness
src/core/              common model, SQLite cache, scan pipeline, import
src/scoring/           metrics, six axes, AIQ, advice
src/llm/               BYOK providers, redaction, prompt, strict JSON validation
src/server/            Hono API + static UI
web/                   React UI
```

Adding a tool means writing one adapter that returns the common `Session` model (`src/core/types.ts`) and registering it in `src/adapters/index.ts`.

## License

MIT
