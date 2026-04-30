import { NextResponse } from 'next/server';
import { compileConcept } from '@/lib/compile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { title: string } }
) {
  try {
    const title = decodeURIComponent(params.title);
    const result = await compileConcept(title);
    if (!result) {
      return NextResponse.json({ error: '概念不存在或没有笔记' }, { status: 404 });
    }
    return NextResponse.json({ result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
