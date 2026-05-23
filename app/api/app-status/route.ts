import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DesktopConfig = {
  dataDir?: string;
  llmProvider?: string;
  providerApiKey?: string;
  providerBaseUrl?: string;
  openaiApiKey?: string;
  httpsProxy?: string;
  hasCompletedOnboarding?: boolean;
  globalShortcut?: string;
};

async function readDesktopConfig(): Promise<DesktopConfig> {
  const configPath = process.env.DAILYNOTE_CONFIG_PATH;
  if (!configPath) return {};
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf8')) as DesktopConfig;
  } catch {
    return {};
  }
}

export async function GET() {
  const config = await readDesktopConfig();
  const dataDir = process.env.DATA_DIR || config.dataDir || '';
  const httpsProxy = process.env.HTTPS_PROXY || config.httpsProxy || '';

  return NextResponse.json({
    desktop: process.env.DAILYNOTE_DESKTOP === '1',
    dataDir,
    llmProvider: process.env.LLM_PROVIDER || config.llmProvider || 'openai',
    hasProviderKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.PROVIDER_API_KEY || config.providerApiKey || config.openaiApiKey),
    httpsProxy,
    hasProxy: Boolean(httpsProxy),
    hasCompletedOnboarding: Boolean(config.hasCompletedOnboarding),
    globalShortcut: config.globalShortcut || 'Alt+Space',
    lastCheckedAt: new Date().toISOString(),
  });
}
