import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import { importExport } from './core/import.js';
import { makeEnv } from './core/scan.js';
import { Store } from './core/store.js';
import { planScoring, providerStatus, runScoring } from './llm/index.js';
import { aiq } from './scoring/index.js';
import { AppState, createApp, overview } from './server/app.js';

const HELP = `ai-mensa — see how you use AI

Usage:
  ai-mensa [--port 4319] [--no-open] [--since 90]   scan logs and open the dashboard
  ai-mensa scan                                      scan only and print a summary
  ai-mensa score [--provider anthropic|openai|gemini] [--sample 12] [--lang ja|en] [--yes]
                                                     LLM scoring with your own API key
  ai-mensa import <export.zip|conversations.json>    import a ChatGPT / Claude.ai export
  ai-mensa doctor                                    show which tools were detected

Environment:
  ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY   enable LLM scoring (BYOK)
  AI_MENSA_MODEL     override the scoring model
  AI_MENSA_HOME      data dir (default ~/.ai-mensa)
`;

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* no browser available; the URL is printed anyway */
  }
}

async function confirm(q: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${q} [y/N] `)).trim().toLowerCase();
  rl.close();
  return a === 'y' || a === 'yes';
}

function listen(app: ReturnType<typeof createApp>, port: number, tries = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => resolve(info.port));
    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' && tries > 0) listen(app, port + 1, tries - 1).then(resolve, reject);
      else reject(e);
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      port: { type: 'string', default: '4319' },
      'no-open': { type: 'boolean', default: false },
      since: { type: 'string', default: '90' },
      provider: { type: 'string' },
      sample: { type: 'string', default: '12' },
      lang: { type: 'string' },
      yes: { type: 'boolean', short: 'y', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const cmd = positionals[0] ?? 'serve';
  if (values.help || cmd === 'help') {
    process.stdout.write(HELP);
    return;
  }
  const env = makeEnv();
  const store = new Store(env.dataDir);
  const state = new AppState(env, store);
  const windowDays = Number(values.since) > 0 ? Number(values.since) : null;
  const log = (m: string) => console.error(m);

  if (cmd === 'import') {
    const file = positionals[1];
    if (!file) throw new Error('Usage: ai-mensa import <export.zip|conversations.json>');
    const r = await importExport(file, env);
    console.log(`Imported ${r.conversations} ${r.tool} conversations → ${r.storedAt}`);
    return;
  }

  if (cmd === 'doctor') {
    const r = await state.refresh(log);
    for (const t of r.tools) console.log(`${t.detect.found ? '✓' : '·'} ${t.label.padEnd(12)} ${t.detect.detail}${t.failed ? `  (${t.failed} failed)` : ''}`);
    console.log('');
    for (const p of providerStatus()) console.log(`${p.configured ? '✓' : '·'} LLM ${p.provider.padEnd(9)} ${p.envVar}${p.configured ? '' : ' not set'}`);
    console.log(`\nData dir: ${env.dataDir}`);
    return;
  }

  console.error('Scanning AI tool logs…');
  const report = await state.refresh(log);
  for (const t of report.tools) if (t.detect.found) console.error(`  ${t.label}: ${state.sessions.filter((s) => s.tool === t.tool).length} sessions${t.parsed ? ` (${t.parsed} updated)` : ''}`);
  console.error(`  done in ${(report.ms / 1000).toFixed(1)}s`);

  if (cmd === 'scan') {
    const o = overview(state, windowDays);
    console.log(`\nAIQ ${o.aiq}${o.mensaClass ? '  ★ Mensa class' : ''}   (last ${windowDays ?? 'all'} days, ${o.totals.sessions} sessions)`);
    for (const a of o.axes) console.log(`  ${a.label.padEnd(11)} ${String(a.score).padStart(3)}  ${'█'.repeat(Math.round(a.score / 5))}`);
    return;
  }

  if (cmd === 'score') {
    const lang = values.lang === 'ja' || values.lang === 'en' ? values.lang : (Intl.DateTimeFormat().resolvedOptions().locale.startsWith('ja') ? 'ja' : 'en');
    const plan = planScoring(state.inWindow(windowDays), { provider: values.provider, sample: Number(values.sample) || 12, lang });
    if (!plan.provider) throw new Error('No LLM API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY.');
    console.log(`\nWill send ${plan.sessions.length} redacted session digests (~${plan.estTokens.toLocaleString()} tokens) to ${plan.provider} (${plan.model}) using your API key.`);
    if (!values.yes && !(await confirm('Continue?'))) {
      console.log('Cancelled.');
      return;
    }
    const result = await runScoring(plan);
    store.saveLlm(result);
    for (const [id, a] of Object.entries(result.axes)) console.log(`\n${id}: ${a!.score}\n  ${a!.rationale}`);
    console.log(`\n${result.summary}`);
    for (const t of result.tips) console.log(`  • ${t}`);
    console.log(`\nAIQ with LLM scores: ${aiq(overview(state, windowDays).axes)}`);
    return;
  }

  if (cmd !== 'serve') throw new Error(`Unknown command "${cmd}". Run ai-mensa --help.`);
  const app = createApp(state, { windowDays });
  const port = await listen(app, Number(values.port) || 4319);
  const url = `http://127.0.0.1:${port}/`;
  console.error(`\nAI Mensa is running at ${url}  (Ctrl+C to stop)`);
  if (!values['no-open']) openBrowser(url);
}
