#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`ai-mensa needs Node.js 22.13 or newer (you have ${process.versions.node}).`);
  process.exit(1);
}
// node:sqlite prints an ExperimentalWarning on some Node versions; it is expected.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w);
});
const { main } = await import('../dist/server/cli.js');
main().catch((e) => {
  console.error(`ai-mensa: ${e?.message ?? e}`);
  process.exit(1);
});
