import { NextResponse } from 'next/server';
import { saveNote } from '@/lib/compile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
    const parts: string[] = text
      .split(/\n\s*---\s*\n|\n\s*###\s*\n/g)
      .map((part: string) => part.trim())
      .filter((part: string) => part.length > 0);
    const notes: Awaited<ReturnType<typeof saveNote>>['note'][] = [];
    for (const part of parts) {
      const result = await saveNote(part);
      notes.push(result.note);
    }
    return NextResponse.json({ notes, count: notes.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
