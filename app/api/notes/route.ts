import { NextResponse } from 'next/server';
import { saveNote } from '@/lib/compile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return NextResponse.json({ error: 'content 为空' }, { status: 400 });
    }
    const note = await saveNote(content);
    return NextResponse.json({ note });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
