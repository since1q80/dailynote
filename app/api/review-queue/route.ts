import { NextResponse } from 'next/server';
import { listReviewItems, readNote } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await listReviewItems();
  const notes = await Promise.all(items.map((item) => readNote(item.note_id)));
  return NextResponse.json({
    items: items.map((item, index) => ({ ...item, note: notes[index] })),
  });
}
