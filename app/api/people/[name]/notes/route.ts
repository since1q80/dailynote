import { NextResponse } from 'next/server';
import { getNotesForPerson } from '@/lib/storage';

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
