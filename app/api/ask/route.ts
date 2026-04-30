import { NextResponse } from 'next/server';
import { askAboutConcept } from '@/lib/compile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!title || !question) {
      return NextResponse.json({ error: 'title 或 question 为空' }, { status: 400 });
    }
    const result = await askAboutConcept(title, question);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
