import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value || value === 'undefined' || value === 'null') return undefined;
  return value;
}

const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
};

export async function POST() {
  const provider = process.env.LLM_PROVIDER || 'openai';

  if (provider === 'openai') {
    return testOpenAI();
  } else if (provider === 'anthropic') {
    return testAnthropic();
  } else if (provider === 'qwen' || provider === 'zhipu' || provider === 'minimax') {
    return testOpenAICompatible();
  } else {
    return testOpenAICompatible();
  }
}

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  const httpsProxy = process.env.HTTPS_PROXY;
  const baseUrl = optionalEnv('OPENAI_BASE_URL');

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'API key is missing.',
      hint: '请在设置里填写 API key。',
    }, { status: 400 });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      httpAgent: httpsProxy ? new HttpsProxyAgent(httpsProxy) : undefined,
    });
    const models = await client.models.list();
    return NextResponse.json({
      ok: true,
      provider: 'openai',
      modelCount: models.data.length,
      hasProxy: Boolean(httpsProxy),
      checkedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; code?: string };
    return NextResponse.json({
      ok: false,
      provider: 'openai',
      status: err.status ?? null,
      code: err.code ?? null,
      error: err.message || String(e),
      hint: httpsProxy
        ? '已经配置代理，但仍无法连接。请检查代理端口是否正在运行。'
        : '请检查 API key 是否正确，或配置 HTTPS_PROXY。',
    }, { status: 502 });
  }
}

async function testAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const httpsProxy = process.env.HTTPS_PROXY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'Anthropic API key is missing.',
      hint: '请在设置里填写 Anthropic API key。',
    }, { status: 400 });
  }

  try {
    const agent = httpsProxy ? new HttpsProxyAgent(httpsProxy) : undefined;
    const client = new Anthropic({
      apiKey,
      baseURL: optionalEnv('ANTHROPIC_BASE_URL'),
      fetchOptions: agent ? ({ agent } as any) : undefined,
    });
    const models = await client.models.list();
    return NextResponse.json({
      ok: true,
      provider: 'anthropic',
      modelCount: models.data.length,
      hasProxy: Boolean(httpsProxy),
      checkedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({
      ok: false,
      provider: 'anthropic',
      status: err.status ?? null,
      error: err.message || String(e),
      hint: '请检查 API key 是否正确，或配置 HTTPS_PROXY。',
    }, { status: 502 });
  }
}

async function testOpenAICompatible() {
  const provider = process.env.LLM_PROVIDER || 'openai_compatible';
  const baseUrl = optionalEnv('PROVIDER_BASE_URL') || PROVIDER_DEFAULT_BASE_URL[provider];

  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      error: 'Provider base URL is missing.',
      hint: '请在设置里填写 Provider base URL（如 http://localhost:11434/v1）。',
    }, { status: 400 });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.PROVIDER_API_KEY || 'sk-',
      baseURL: baseUrl,
      httpAgent: (() => {
        const proxy = process.env.HTTPS_PROXY;
        return proxy ? new HttpsProxyAgent(proxy) : undefined;
      })(),
      defaultHeaders: { 'Content-Type': 'application/json' },
    });
    const models = await client.models.list();
    return NextResponse.json({
      ok: true,
      provider,
      modelCount: models.data.length,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({
      ok: false,
      provider,
      status: err.status ?? null,
      error: err.message || String(e),
      hint: `无法连接 ${baseUrl}，请检查地址是否正确。`,
    }, { status: 502 });
  }
}
