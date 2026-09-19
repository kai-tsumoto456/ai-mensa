import { describe, expect, it } from 'vitest';
import { countUsage } from '../src/core/scan.js';
import type { HarnessItem, Session } from '../src/core/types.js';
import { isCorrection, markCorrections, newTurn } from '../src/core/util.js';
import { parseLlmJson, redact } from '../src/llm/index.js';
import { aiq, computeMetrics, hasContext, lengthScore, scoreAxes } from '../src/scoring/index.js';

function session(id: string, day: string, userTexts: string[], toolCallsPerTurn = 3): Session {
  const turns = userTexts.flatMap((t) => {
    const u = newTurn('user', t, `${day}T10:00:00Z`);
    const a = newTurn('assistant', 'ok', `${day}T10:01:00Z`);
    a.toolCalls = Array.from({ length: toolCallsPerTurn }, () => ({ name: 'Bash', ok: true, isSubagent: false, detail: null }));
    return [u, a];
  });
  markCorrections(turns);
  return { id, tool: 'claude-code', project: '/p', title: id, startedAt: `${day}T10:00:00Z`, endedAt: null, model: 'm', turns };
}

describe('heuristics', () => {
  it('detects corrections only after an assistant reply and only for short pushback', () => {
    expect(isCorrection('違う、そうじゃない', true)).toBe(true);
    expect(isCorrection("No, that's wrong", true)).toBe(true);
    expect(isCorrection('違う', false)).toBe(false);
    expect(isCorrection('なぜあなたのAI活用は失敗するのか みたいな感じはどう？', true)).toBe(false);
    expect(isCorrection('最後まで勝手に進めて', true)).toBe(false);
  });

  it('scores prompt length with a sweet spot', () => {
    expect(lengthScore(0)).toBe(0);
    expect(lengthScore(10)).toBeLessThan(lengthScore(100));
    expect(lengthScore(300)).toBe(1);
    expect(lengthScore(5000)).toBeLessThan(1);
  });

  it('recognises concrete context', () => {
    expect(hasContext('fix src/app.ts')).toBe(true);
    expect(hasContext('完了条件はテストが通ること')).toBe(true);
    expect(hasContext('hello')).toBe(false);
  });
});

describe('scoring', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  const sessions = [
    session('a', '2026-03-10', ['Implement login in src/auth.ts. 完了条件: tests pass', '違う']),
    session('b', '2026-03-09', ['Write a README for the CLI with install steps']),
  ];

  it('computes metrics', () => {
    const m = computeMetrics(sessions, now);
    expect(m.sessions).toBe(2);
    expect(m.userTurns).toBe(3);
    expect(m.correctionRate).toBeCloseTo(1 / 3);
    expect(m.activeDays30).toBe(2);
    expect(m.streak).toBe(2);
  });

  it('produces six bounded axes and an AIQ in range', () => {
    const axes = scoreAxes(sessions, new Map(), null, now);
    expect(axes.map((a) => a.id)).toEqual(['prompting', 'delegation', 'efficiency', 'harness', 'breadth', 'habit']);
    for (const a of axes) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(a.advice.length).toBe(a.adviceJa.length);
    }
    const q = aiq(axes);
    expect(q).toBeGreaterThanOrEqual(70);
    expect(q).toBeLessThanOrEqual(150);
  });

  it('blends LLM scores 50/50', () => {
    const base = scoreAxes(sessions, new Map(), null, now).find((a) => a.id === 'prompting')!;
    const llm = { at: '', provider: 'x', model: 'y', sampled: 1, summary: '', tips: [], axes: { prompting: { score: 100, rationale: '' } } };
    const blended = scoreAxes(sessions, new Map(), llm, now).find((a) => a.id === 'prompting')!;
    expect(blended.llmScore).toBe(100);
    expect(blended.score).toBe(Math.round((base.statScore + 100) / 2));
  });

  it('aiq maps 0 → 70 and 100 → 150', () => {
    const mk = (score: number) => [{ id: 'prompting', label: '', labelJa: '', score, statScore: score, llmScore: null, signals: [], advice: [], adviceJa: [] }] as any;
    expect(aiq(mk(0))).toBe(70);
    expect(aiq(mk(100))).toBe(150);
  });
});

describe('harness usage', () => {
  it('counts skill and MCP usage from tool calls', () => {
    const s = session('a', '2026-03-10', ['go'], 0);
    s.turns[1].toolCalls = [
      { name: 'Skill', ok: true, isSubagent: false, detail: 'deploy' },
      { name: 'mcp__github__search', ok: true, isSubagent: false, detail: 'github' },
    ];
    const item = (kind: HarnessItem['kind'], name: string): HarnessItem => ({ tool: 'claude-code', kind, name, path: null, scope: 'global', updatedAt: null, sizeBytes: null, usageCount: null });
    const items = [item('skill', 'deploy'), item('skill', 'unused'), item('mcp', 'github'), item('hook', 'Stop')];
    countUsage(items, [s]);
    expect(items.map((i) => i.usageCount)).toEqual([1, 0, 1, null]);
  });
});

describe('llm helpers', () => {
  it('redacts secrets, emails and the home path', () => {
    const out = redact('key sk-ant-abcdefghijklmnopqrstu mail me@example.com at /Users/me/proj', '/Users/me');
    expect(out).not.toContain('sk-ant-');
    expect(out).not.toContain('me@example.com');
    expect(out).toContain('~/proj');
  });

  it('validates LLM JSON strictly', () => {
    const ok = parseLlmJson('```json\n{"axes":{"prompting":{"score":70,"rationale":"a"},"delegation":{"score":60,"rationale":"b"},"efficiency":{"score":80,"rationale":"c"}},"summary":"s","tips":["t"]}\n```');
    expect(ok.axes.prompting?.score).toBe(70);
    expect(() => parseLlmJson('{"axes":{"prompting":{"score":170}}}')).toThrow();
    expect(() => parseLlmJson('no json')).toThrow();
  });
});
