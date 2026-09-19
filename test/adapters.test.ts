import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { parseChatGptConversation } from '../src/adapters/chatgpt/index.js';
import { parseClaudeAiConversation } from '../src/adapters/claude-ai/index.js';
import { claudeCode, parseClaudeJsonl } from '../src/adapters/claude-code/index.js';
import { parseCodexJsonl } from '../src/adapters/codex/index.js';
import { cursor } from '../src/adapters/cursor/index.js';
import { detectExportKind } from '../src/core/import.js';
import type { Env } from '../src/core/types.js';

const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n');

describe('claude code', () => {
  const raw = jsonl([
    { type: 'user', sessionId: 's1', cwd: '/work/app', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'Fix the failing test in src/app.ts' } },
    {
      type: 'assistant',
      timestamp: '2026-01-01T00:00:05Z',
      message: {
        id: 'm1',
        model: 'claude-opus-5',
        content: [
          { type: 'text', text: 'Looking.' },
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } },
        ],
        usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 20 },
      },
    },
    // same message id split across lines must not double count usage
    {
      type: 'assistant',
      timestamp: '2026-01-01T00:00:05Z',
      message: { id: 'm1', model: 'claude-opus-5', content: [{ type: 'tool_use', id: 't2', name: 'Skill', input: { skill: 'tdd' } }], usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 20 } },
    },
    { type: 'user', timestamp: '2026-01-01T00:00:06Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'fail' }] } },
    { type: 'user', timestamp: '2026-01-01T00:00:07Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }] } },
    { type: 'user', timestamp: '2026-01-01T00:00:08Z', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    { type: 'user', isMeta: true, message: { role: 'user', content: 'meta noise' } },
    { type: 'user', isSidechain: true, message: { role: 'user', content: 'subagent prompt' } },
    { type: 'user', timestamp: '2026-01-01T00:01:00Z', message: { role: 'user', content: '違う、そうじゃない' } },
    { type: 'ai-title', aiTitle: 'Fix test' },
  ]);

  it('parses turns, tool results, usage, interruptions and corrections', () => {
    const s = parseClaudeJsonl(raw, 'fallback')!;
    expect(s.id).toBe('claude-code:s1');
    expect(s.project).toBe('/work/app');
    expect(s.model).toBe('claude-opus-5');
    expect(s.title).toBe('Fix test');
    expect(s.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    const a = s.turns[1];
    expect(a.tokensIn).toBe(100);
    expect(a.tokensCached).toBe(90);
    expect(a.toolCalls.map((c) => [c.name, c.ok, c.detail])).toEqual([
      ['Bash', false, null],
      ['Skill', true, 'tdd'],
    ]);
    expect(a.interrupted).toBe(true);
    expect(s.turns[2].isCorrection).toBe(true);
    expect(s.turns[0].isCorrection).toBe(false);
  });

  it('records slash commands', () => {
    const s = parseClaudeJsonl(
      jsonl([{ type: 'user', message: { role: 'user', content: '<command-name>/review</command-name><command-args>PR 12</command-args>' } }]),
      'x',
    )!;
    expect(s.turns[0].invoked).toEqual(['review']);
    expect(s.turns[0].text).toBe('/review PR 12');
  });

  it('scans a fake home for harness items', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'mensa-cc-'));
    mkdirSync(path.join(home, '.claude', 'skills', 'deploy'), { recursive: true });
    writeFileSync(path.join(home, '.claude', 'skills', 'deploy', 'SKILL.md'), '# deploy');
    writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '# rules');
    writeFileSync(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] }, permissions: { allow: ['Bash(ls:*)'] } }),
    );
    writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { github: {} } }));
    const env: Env = { home, dataDir: path.join(home, '.ai-mensa'), projectDirs: [] };
    const items = await claudeCode.scanHarness!(env);
    const kinds = items.map((i) => `${i.kind}:${i.name}`);
    expect(kinds).toContain('instruction:CLAUDE.md');
    expect(kinds).toContain('skill:deploy');
    expect(kinds).toContain('mcp:github');
    expect(kinds).toContain('permission:allow: Bash(ls:*)');
    expect(kinds.some((k) => k.startsWith('hook:Stop'))).toBe(true);
  });
});

describe('codex', () => {
  const raw = jsonl([
    { timestamp: '2026-02-01T00:00:00Z', type: 'session_meta', payload: { id: 'c1', cwd: '/work/api', source: 'cli' } },
    { timestamp: '2026-02-01T00:00:00Z', type: 'turn_context', payload: { model: 'gpt-5.4' } },
    { timestamp: '2026-02-01T00:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
    { timestamp: '2026-02-01T00:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Add pagination to /users' }] } },
    { timestamp: '2026-02-01T00:00:03Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'k1', arguments: '{}' } },
    { timestamp: '2026-02-01T00:00:04Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'k1', output: 'Process exited with code 1\nboom' } },
    { timestamp: '2026-02-01T00:00:05Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 7 } } } },
    { timestamp: '2026-02-01T00:00:06Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] } },
    { timestamp: '2026-02-01T00:00:07Z', type: 'event_msg', payload: { type: 'turn_aborted' } },
  ]);

  it('parses user/assistant turns, exit codes, tokens and aborts', () => {
    const s = parseCodexJsonl(raw, 'x')!;
    expect(s.id).toBe('codex:c1');
    expect(s.model).toBe('gpt-5.4');
    expect(s.turns.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(s.turns[0].text).toBe('Add pagination to /users');
    const a = s.turns[1];
    expect(a.toolCalls[0].ok).toBe(false);
    expect(a.tokensIn).toBe(100);
    expect(a.tokensCached).toBe(40);
    expect(a.text).toBe('Done');
    expect(a.interrupted).toBe(true);
  });

  it('skips machine-driven child threads', () => {
    const child = raw.replace('"source":"cli"', '"source":{"subagent":{"other":"guardian"}}');
    expect(parseCodexJsonl(child, 'x')).toBeNull();
  });
});

describe('cursor', () => {
  it('reads composers and bubbles from state.vscdb read-only', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'mensa-cursor-'));
    const userDir = path.join(home, 'CursorUser');
    mkdirSync(path.join(userDir, 'globalStorage'), { recursive: true });
    const dbFile = path.join(userDir, 'globalStorage', 'state.vscdb');
    const db = new DatabaseSync(dbFile);
    db.exec('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)');
    const put = db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)');
    put.run(
      'composerData:k1',
      JSON.stringify({
        composerId: 'k1',
        name: 'Refactor',
        createdAt: 1767225600000,
        fullConversationHeadersOnly: [
          { bubbleId: 'b1', type: 1 },
          { bubbleId: 'b2', type: 2 },
        ],
      }),
    );
    put.run('bubbleId:k1:b1', JSON.stringify({ type: 1, text: 'Split utils.ts into modules' }));
    put.run('bubbleId:k1:b2', JSON.stringify({ type: 2, text: 'ok', tokenCount: { inputTokens: 5, outputTokens: 3 }, toolFormerData: { name: 'edit_file', status: 'completed' } }));
    db.close();

    process.env.CURSOR_USER_DIR = userDir;
    try {
      const env: Env = { home, dataDir: path.join(home, 'd'), projectDirs: [] };
      const [src] = await cursor.listSources(env);
      const [s] = await cursor.parse(src, env);
      expect(s.title).toBe('Refactor');
      expect(s.turns.map((t) => t.role)).toEqual(['user', 'assistant']);
      expect(s.turns[1].toolCalls[0]).toMatchObject({ name: 'edit_file', ok: true });
      expect(s.turns[1].tokensIn).toBe(5);
    } finally {
      delete process.env.CURSOR_USER_DIR;
    }
  });
});

describe('exports', () => {
  const chatgpt = {
    id: 'g1',
    title: 'Trip plan',
    create_time: 1767225600,
    current_node: 'n3',
    mapping: {
      n0: { id: 'n0', parent: null, children: ['n1'], message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } } },
      n1: { id: 'n1', parent: 'n0', children: ['n2', 'nx'], message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['Plan 3 days in Kyoto'] }, create_time: 1767225601 } },
      nx: { id: 'nx', parent: 'n1', children: [], message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['abandoned branch'] } } },
      n2: { id: 'n2', parent: 'n1', children: ['n3'], message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Day 1…'] }, metadata: { model_slug: 'gpt-5' } } },
      n3: { id: 'n3', parent: 'n2', children: [], message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['いや、違う'] } } },
    },
  };
  const claudeAi = {
    uuid: 'a1',
    name: 'Essay',
    created_at: '2026-01-01T00:00:00Z',
    chat_messages: [
      { sender: 'human', text: 'Edit my essay', created_at: '2026-01-01T00:00:00Z' },
      { sender: 'assistant', text: 'Here', content: [{ type: 'text', text: 'Here' }, { type: 'tool_use', name: 'web_search' }] },
    ],
  };

  it('follows the kept ChatGPT branch', () => {
    const s = parseChatGptConversation(chatgpt)!;
    expect(s.turns.map((t) => t.text)).toEqual(['Plan 3 days in Kyoto', 'Day 1…', 'いや、違う']);
    expect(s.model).toBe('gpt-5');
    expect(s.turns[2].isCorrection).toBe(true);
  });

  it('parses Claude.ai conversations', () => {
    const s = parseClaudeAiConversation(claudeAi)!;
    expect(s.turns).toHaveLength(2);
    expect(s.turns[1].toolCalls[0].name).toBe('web_search');
  });

  it('detects export kind', () => {
    expect(detectExportKind([chatgpt])).toBe('chatgpt');
    expect(detectExportKind([claudeAi])).toBe('claude-ai');
    expect(detectExportKind({})).toBeNull();
  });
});
