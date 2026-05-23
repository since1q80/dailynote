import { NextResponse } from 'next/server';
import { readNote, readNoteProcessingStatus } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const note = await readNote(params.id);
    if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const status = await readNoteProcessingStatus(params.id);
    return NextResponse.json({
      note,
      status: status ?? {
        note_id: note.id,
        status: note.tags.length > 0 || note.concepts.length > 0 ? 'done' : 'processing',
        tags: note.tags ?? [],
        people: [],
        concepts: note.concepts ?? [],
        related_notes: [],
        updated_at: note.created_at,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
