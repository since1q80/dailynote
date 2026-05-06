import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  const httpsProxy = process.env.HTTPS_PROXY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'OPENAI_API_KEY is missing.',
      hint: '请在设置或首次启动向导里填写 OpenAI API key。',
    }, { status: 400 });
  }

  try {
    const client = new OpenAI({
      apiKey,
      httpAgent: httpsProxy ? new HttpsProxyAgent(httpsProxy) : undefined,
    });
    const models = await client.models.list();
    return NextResponse.json({
      ok: true,
      modelCount: models.data.length,
      hasProxy: Boolean(httpsProxy),
      checkedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; code?: string };
    return NextResponse.json({
      ok: false,
      status: err.status ?? null,
      code: err.code ?? null,
      error: err.message || String(e),
      hint: httpsProxy
        ? '已经配置代理，但仍无法连接 OpenAI。请检查代理端口是否正在运行。'
        : '当前没有配置代理。如果你所在网络无法直连 OpenAI，请填写 HTTPS_PROXY。',
    }, { status: 502 });
  }
}
