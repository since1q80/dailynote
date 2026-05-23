/**
 * openai.ts — OpenAI API wrapper (server-side only)
 *
 * Kept as a compatibility layer. All callJSON calls delegate to lib/llm.ts
 * which supports multiple providers. This file exports the same API
 * so callers in compile.ts don't need changes.
 */

import { callJSON as _callJSON, type LLMCallOptions } from './llm';

export const MODEL_FAST = 'gpt-5.4-nano';
export const MODEL_SMART = 'gpt-5.4-mini';

export type CallOptions = LLMCallOptions;

export { _callJSON as callJSON };
