import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env, SourceRef, ToolId } from '../core/types.js';
import { fileSources } from '../core/util.js';

export function importsDir(env: Env): string {
  return path.join(env.dataDir, 'imports');
}

/** Imported export files for a tool: <dataDir>/imports/<tool>-*.json */
export async function importSources(env: Env, tool: ToolId): Promise<SourceRef[]> {
  let names: string[] = [];
  try {
    names = await readdir(importsDir(env));
  } catch {
    return [];
  }
  const files = names.filter((n) => n.startsWith(`${tool}-`) && n.endsWith('.json')).map((n) => path.join(importsDir(env), n));
  return fileSources(tool, files);
}

export async function readJsonArray(p: string): Promise<any[]> {
  const j = JSON.parse(await readFile(p, 'utf8'));
  return Array.isArray(j) ? j : [];
}
