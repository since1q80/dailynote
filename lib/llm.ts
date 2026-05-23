/**
 * llm.ts — Provider-agnostic LLM interface
 *
 * All LLM calls share the same shape:
 *   model + system message + user message + maxTokens → JSON
 *
 * Supported providers:
 *   openai              — OpenAI API (default)
 *   anthropic           — Anthropic Claude API
 *   openai_compatible   — Any OpenAI-compatible endpoint (Ollama, vLLM, etc.)
 */

import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import Anthropic from '@anthropic-ai/sdk';
import { HttpsProxyAgent } from 'https-proxy-agent';

export type LLMCallOptions = {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
};

export type LLMProviderAdapter = {
  callJSON<T>(opts: LLMCallOptions): Promise<T>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Strip markdown code fences that some models wrap around JSON. */
function extractJSON(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function parseJSON<T>(raw: string, label: string): T {
  const text = extractJSON(raw);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `${label} returned non-JSON: ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`
    );
  }
}

// ─── Model mapping ────────────────────────────────────────────────────────
// compile.ts passes MODEL_FAST / MODEL_SMART which are OpenAI model names.
// When the active provider is not OpenAI we map them to equivalent models.

const MODEL_MAP: Record<string, Record<string, string>> = {
  anthropic: {
    'gpt-5.4-nano': 'claude-sonnet-4-20250514',
    'gpt-5.4-mini': 'claude-sonnet-4-20250514',
  },
  qwen: {
    'gpt-5.4-nano': 'qwen-turbo',
    'gpt-5.4-mini': 'qwen-plus',
  },
  zhipu: {
    'gpt-5.4-nano': 'glm-4-flash',
    'gpt-5.4-mini': 'glm-4-plus',
  },
  // minimax: uses compatible names directly, no mapping needed
};

function resolveModel(model: string, provider: ProviderName): string {
  // Allow user override: MODEL_FAST_OVERRIDE / MODEL_SMART_OVERRIDE
  if (process.env.MODEL_FAST_OVERRIDE && model === 'gpt-5.4-nano') return process.env.MODEL_FAST_OVERRIDE;
  if (process.env.MODEL_SMART_OVERRIDE && model === 'gpt-5.4-mini') return process.env.MODEL_SMART_OVERRIDE;
  return MODEL_MAP[provider]?.[model] ?? model;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value || value === 'undefined' || value === 'null') return undefined;
  return value;
}

// ─── OpenAI adapter ────────────────────────────────────────────────────────

export class OpenAIAdapter implements LLMProviderAdapter {
  protected client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    const proxy = process.env.HTTPS_PROXY || '';
    const httpAgent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    this.client = new OpenAI({ apiKey, baseURL: baseUrl, httpAgent });
  }

  async callJSON<T>(opts: LLMCallOptions): Promise<T> {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model: opts.model,
      max_completion_tokens: opts.maxTokens ?? 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    };
    const res = await this.client.chat.completions.create(params);
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error('LLM returned empty response');
    return parseJSON<T>(text, 'OpenAI');
  }
}

// ─── Anthropic adapter ─────────────────────────────────────────────────────
// JSON is requested via a system-level instruction + user suffix.
// extractJSON strips markdown code fences that Claude sometimes adds.

export class AnthropicAdapter implements LLMProviderAdapter {
  private client: Anthropic;

  constructor(apiKey: string) {
    const proxy = process.env.HTTPS_PROXY || '';
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    this.client = new Anthropic({
      apiKey,
      baseURL: optionalEnv('ANTHROPIC_BASE_URL'),
      fetchOptions: agent ? ({ agent } as any) : undefined,
    });
  }

  async callJSON<T>(opts: LLMCallOptions): Promise<T> {
    const jsonInstruction =
      '\n\nIMPORTANT: Return ONLY valid JSON. Do NOT wrap it in markdown code fences. Output the raw JSON object directly.';
    const res = await this.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: 'user' as const, content: opts.user + jsonInstruction }],
    });

    const text = res.content.find((c) => c.type === 'text')?.text;
    if (!text) throw new Error('Anthropic returned empty response');
    return parseJSON<T>(text, 'Anthropic');
  }
}

// ─── OpenAI-compatible adapter (Ollama, vLLM, etc.) ────────────────────────
// Extends OpenAIAdapter but uses max_tokens and gracefully falls back when
// response_format is not supported.

export class OpenAICompatibleAdapter extends OpenAIAdapter {
  constructor(apiKey: string, baseUrl: string) {
    const key = apiKey === 'NOT_NEEDED' ? 'sk-' : apiKey;
    super(key, baseUrl);
  }

  async callJSON<T>(opts: LLMCallOptions): Promise<T> {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    };

    try {
      const res = await this.client.chat.completions.create(params);
      const text = res.choices[0]?.message?.content;
      if (!text) throw new Error('LLM returned empty response');
      return parseJSON<T>(text, 'LLM');
    } catch (err: unknown) {
      // Fallback: retry without response_format for servers that don't support it
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('response_format') || msg.includes('json_object')) {
        const { response_format: _, ...fallbackParams } = params;
        const jsonHint = '\n\nReturn your answer as a valid JSON object. Do NOT wrap in markdown.';
        (fallbackParams.messages as Array<{ role: string; content: string }>)[1].content += jsonHint;
        const res = await this.client.chat.completions.create(fallbackParams as ChatCompletionCreateParamsNonStreaming);
        const text = res.choices[0]?.message?.content;
        if (!text) throw new Error('LLM returned empty response');
        return parseJSON<T>(text, 'LLM');
      }
      throw err;
    }
  }
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'openai_compatible'
  | 'qwen'
  | 'zhipu'
  | 'minimax';

// Singleton cache — avoids creating a new SDK client on every call
let _cachedProvider: LLMProviderAdapter | null = null;
let _cachedProviderKey = '';

function providerCacheKey(): string {
  const provider = process.env.LLM_PROVIDER || 'openai';
  const isCompatible = ['openai_compatible', 'qwen', 'zhipu', 'minimax'].includes(provider);
  const key =
    provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY || ''
      : isCompatible
      ? process.env.PROVIDER_API_KEY || ''
      : process.env.OPENAI_API_KEY || '';
  const base =
    provider === 'anthropic'
      ? optionalEnv('ANTHROPIC_BASE_URL') || ''
      : isCompatible
      ? optionalEnv('PROVIDER_BASE_URL') || ''
      : optionalEnv('OPENAI_BASE_URL') || '';
  const proxy = process.env.HTTPS_PROXY || '';
  return `${provider}|${key}|${base}|${proxy}`;
}

export function getProvider(): LLMProviderAdapter {
  const cacheKey = providerCacheKey();
  if (_cachedProvider && _cachedProviderKey === cacheKey) return _cachedProvider;

  const provider = (process.env.LLM_PROVIDER || 'openai') as ProviderName;

  switch (provider) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY || '';
      if (!apiKey) throw new Error('OPENAI_API_KEY 未设置。请在设置中填写 API key。');
      _cachedProvider = new OpenAIAdapter(apiKey, optionalEnv('OPENAI_BASE_URL'));
      break;
    }
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY || '';
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未设置。请在设置中填写 API key。');
      _cachedProvider = new AnthropicAdapter(apiKey);
      break;
    }
    case 'qwen': {
      const qwenBase = optionalEnv('PROVIDER_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      _cachedProvider = new OpenAICompatibleAdapter(
        process.env.PROVIDER_API_KEY || '',
        qwenBase,
      );
      break;
    }
    case 'zhipu': {
      const zhipuBase = optionalEnv('PROVIDER_BASE_URL') || 'https://open.bigmodel.cn/api/paas/v4';
      _cachedProvider = new OpenAICompatibleAdapter(
        process.env.PROVIDER_API_KEY || '',
        zhipuBase,
      );
      break;
    }
    case 'minimax': {
      const miniBase = optionalEnv('PROVIDER_BASE_URL') || 'https://api.minimax.chat/v1';
      _cachedProvider = new OpenAICompatibleAdapter(
        process.env.PROVIDER_API_KEY || '',
        miniBase,
      );
      break;
    }
    case 'openai_compatible': {
      const baseUrl = optionalEnv('PROVIDER_BASE_URL') || '';
      if (!baseUrl) throw new Error('PROVIDER_BASE_URL 未设置。请在设置中填写接口地址。');
      _cachedProvider = new OpenAICompatibleAdapter(
        process.env.PROVIDER_API_KEY || 'NOT_NEEDED',
        baseUrl,
      );
      break;
    }
    default:
      throw new Error(`不支持的 LLM_PROVIDER: ${provider}`);
  }

  _cachedProviderKey = cacheKey;
  return _cachedProvider;
}

export async function callJSON<T>(opts: LLMCallOptions): Promise<T> {
  const provider = (process.env.LLM_PROVIDER || 'openai') as ProviderName;
  const resolved = { ...opts, model: resolveModel(opts.model, provider) };
  return getProvider().callJSON<T>(resolved);
}
