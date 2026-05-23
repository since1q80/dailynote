import { NextResponse } from 'next/server';
import { updateNoteTags } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const tags: string[] = (body?.tags ?? [])
      .map((t: unknown) => String(t).trim())
      .filter(Boolean);
    await updateNoteTags(params.id, tags);
    return NextResponse.json({ tags });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
