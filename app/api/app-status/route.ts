import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DesktopConfig = {
  dataDir?: string;
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
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY || config.openaiApiKey);

  return NextResponse.json({
    desktop: process.env.DAILYNOTE_DESKTOP === '1',
    dataDir,
    hasOpenAIKey,
    httpsProxy,
    hasProxy: Boolean(httpsProxy),
    hasCompletedOnboarding: Boolean(config.hasCompletedOnboarding),
    globalShortcut: config.globalShortcut || 'Alt+Space',
    lastCheckedAt: new Date().toISOString(),
  });
}
