import { NextResponse } from 'next/server';
import { getNotesForPerson, removeNoteIdFromPerson } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const name = decodeURIComponent(params.name);
    const notes = await getNotesForPerson(name);
    return NextResponse.json({ notes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const name = decodeURIComponent(params.name);
    const body = await req.json();
    const noteId = typeof body?.note_id === 'string' ? body.note_id.trim() : '';
    if (!noteId) return NextResponse.json({ error: 'note_id required' }, { status: 400 });
    await removeNoteIdFromPerson(name, noteId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
