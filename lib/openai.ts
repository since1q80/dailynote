/**
 * openai.ts — OpenAI API 封装（服务端）
 *
 * - 只在 Next.js API routes 里调用，key 绝不进入客户端。
 * - 强制 JSON 返回（response_format），省掉正则提取。
 * - 两个模型分工：
 *     nano — 分类（便宜快）
 *     mini — 编译/问答（质量好、成本适中）
 */

import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const MODEL_FAST = 'gpt-5.4-nano';
export const MODEL_SMART = 'gpt-5.4-mini';

let _client: OpenAI | null = null;
let _clientKey = '';
let _clientProxy = '';

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY 未设置。复制 .env.example 到 .env.local 并填入你的 key。'
    );
  }
  const proxy = process.env.HTTPS_PROXY || '';
  if (_client && _clientKey === apiKey && _clientProxy === proxy) return _client;
  const httpAgent = proxy
    ? new HttpsProxyAgent(proxy)
    : undefined;
  _client = new OpenAI({ apiKey, httpAgent });
  _clientKey = apiKey;
  _clientProxy = proxy;
  return _client;
}

export type CallOptions = {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
};

export async function callJSON<T>(opts: CallOptions): Promise<T> {
  const res = await client().chat.completions.create({
    model: opts.model,
    max_completion_tokens: opts.maxTokens ?? 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  });

  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error('OpenAI 返回为空');

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `OpenAI 返回的 JSON 无法解析：${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`
    );
  }
}
