// Dev helper: print per-axis signals, harness counts and parser samples for the local machine.
// Usage: node scripts/inspect.mjs   (after npm run build:server)
import { makeEnv } from '../dist/server/core/scan.js';
import { Store } from '../dist/server/core/store.js';
import { AppState, harnessResponse, overview } from '../dist/server/server/app.js';

const env = makeEnv();
const st = new AppState(env, new Store(env.dataDir));
const t0 = Date.now();
await st.refresh();
console.log('refresh ms', Date.now() - t0);

const o = overview(st, 90);
console.log('AIQ', o.aiq);
for (const a of o.axes) console.log(a.id.padEnd(11), a.score, a.signals.map((s) => `${s.label}=${s.value}`).join(' | '));

for (const b of harnessResponse(st).tools) {
  console.log(`\n[${b.tool}]`, JSON.stringify(b.counts));
  for (const f of b.findings) console.log('  ', f.level, f.message);
  const measured = b.items.filter((i) => ['skill', 'mcp', 'agent', 'command'].includes(i.kind));
  console.log('  ', measured.map((i) => `${i.kind[0]}:${i.name}=${i.usageCount}`).join(', '));
}

for (const tool of ['claude-code', 'codex', 'cursor']) {
  console.log(`\n${tool} samples`);
  for (const s of st.sessions.filter((x) => x.tool === tool).slice(0, 3)) {
    console.log('  ', JSON.stringify([s.title, s.model, s.project, s.turns.length, s.startedAt]));
  }
}
const corr = st.sessions.flatMap((s) => s.turns.filter((t) => t.isCorrection).map((t) => t.text.slice(0, 50).replace(/\n/g, ' ')));
console.log('\ncorrections', corr.length);
for (const c of corr.slice(0, 15)) console.log('  -', c);
