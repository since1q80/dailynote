import { NextResponse } from 'next/server';
import { getInstantInsight } from '@/lib/compile';
import { readNote } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const note = await readNote(params.id);
    if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const insight = await getInstantInsight(note);
    return NextResponse.json({ insight });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
