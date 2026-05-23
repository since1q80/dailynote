import { NextResponse } from 'next/server';
import { appendWikiLog, readPurpose, rebuildWikiIndex, writePurpose } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const purpose = await readPurpose();
  return NextResponse.json({ purpose });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const content = typeof body?.content === 'string' ? body.content : '';
    const purpose = await writePurpose(content);
    await appendWikiLog({ action: 'purpose.updated', target: 'purpose.md' });
    rebuildWikiIndex().catch((err) => console.warn('[index] rebuild after purpose failed:', err));
    return NextResponse.json({ purpose });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
