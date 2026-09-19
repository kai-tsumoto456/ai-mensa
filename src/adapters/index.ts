import type { Adapter } from '../core/types.js';
import { chatgpt } from './chatgpt/index.js';
import { claudeAi } from './claude-ai/index.js';
import { claudeCode } from './claude-code/index.js';
import { codex } from './codex/index.js';
import { cursor } from './cursor/index.js';

export const ADAPTERS: Adapter[] = [claudeCode, codex, cursor, chatgpt, claudeAi];
