import { NextResponse } from 'next/server';
import { updateNoteContent } from '@/lib/storage';
import { reprocessNoteAfterEdit } from '@/lib/compile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { content } = await req.json();
    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    const note = await updateNoteContent(params.id, content);
    if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // 重新提取人名和标签，不阻塞响应
    reprocessNoteAfterEdit(note).catch((err) =>
      console.warn(`[reprocess] note=${params.id} failed:`, err?.message ?? err)
    );

    return NextResponse.json({ note });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
