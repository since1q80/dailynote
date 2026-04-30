import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readPromptOverrides, writePromptOverrides } from '@/lib/storage';
import { PROMPT_KEYS, PROMPT_LABELS, getDefaultPrompts } from '@/lib/prompts';
import type { Lang } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getLang(): Lang {
  return cookies().get('lang')?.value === 'en' ? 'en' : 'zh';
}

export async function GET() {
  const lang = getLang();
  const defaults = getDefaultPrompts(lang);
  const overrides = await readPromptOverrides(lang);

  const prompts = PROMPT_KEYS.map((key) => ({
    key,
    label: PROMPT_LABELS[key],
    default: defaults[key],
    current: overrides[key] ?? defaults[key],
    modified: !!overrides[key],
  }));
  return NextResponse.json({ prompts });
}

export async function PUT(req: Request) {
  const lang = getLang();
  const defaults = getDefaultPrompts(lang);
  const body = await req.json();
  const overrides = await readPromptOverrides(lang);

  for (const key of PROMPT_KEYS) {
    if (body[key] !== undefined) {
      const val = String(body[key]).trim();
      if (!val || val === defaults[key]) {
        delete overrides[key];
      } else {
        overrides[key] = val;
      }
    }
  }

  await writePromptOverrides(lang, overrides);
  return NextResponse.json({ ok: true });
}
