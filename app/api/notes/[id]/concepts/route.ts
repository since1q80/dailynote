import { NextResponse } from 'next/server';
import { readNote, updateNoteConcepts, refreshConceptCount } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const tags: string[] = (body?.concepts ?? [])
      .map((t: unknown) => String(t).trim())
      .filter(Boolean);
    const before = await readNote(params.id);
    if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await updateNoteConcepts(params.id, tags);
    const touched = Array.from(new Set([...(before.concepts ?? []), ...tags]));
    await Promise.all(touched.map((title) => refreshConceptCount(title)));
    return NextResponse.json({ concepts: tags });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
