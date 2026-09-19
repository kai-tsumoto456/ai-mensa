import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { importsDir } from '../adapters/exports.js';
import type { Env, ToolId } from './types.js';

export function detectExportKind(json: unknown): ToolId | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0] as any;
  if (first && typeof first === 'object') {
    if ('mapping' in first) return 'chatgpt';
    if ('chat_messages' in first) return 'claude-ai';
  }
  return null;
}

/** Import a ChatGPT / Claude.ai export (.zip or conversations.json) into the data dir. */
export async function importExport(file: string, env: Env): Promise<{ tool: ToolId; conversations: number; storedAt: string }> {
  const buf = await readFile(file);
  let text: string;
  if (file.toLowerCase().endsWith('.zip')) {
    const entries = unzipSync(new Uint8Array(buf), { filter: (f) => /(^|\/)conversations\.json$/.test(f.name) });
    const name = Object.keys(entries)[0];
    if (!name) throw new Error('conversations.json not found in the zip');
    text = strFromU8(entries[name]);
  } else {
    text = buf.toString('utf8');
  }
  const json = JSON.parse(text);
  const tool = detectExportKind(json);
  if (!tool) throw new Error('Unrecognised export format (expected ChatGPT or Claude.ai conversations.json)');
  await mkdir(importsDir(env), { recursive: true });
  const storedAt = path.join(importsDir(env), `${tool}-${Date.now()}.json`);
  if (file.toLowerCase().endsWith('.zip')) await writeFile(storedAt, text);
  else await copyFile(file, storedAt);
  return { tool, conversations: (json as unknown[]).length, storedAt };
}
