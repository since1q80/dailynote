import { NextResponse } from 'next/server';
import { appendWikiLog, rebuildWikiIndex, runHealthCheck } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await runHealthCheck();
  return NextResponse.json({ report });
}

export async function POST() {
  try {
    const [report] = await Promise.all([runHealthCheck(), rebuildWikiIndex()]);
    await appendWikiLog({
      action: 'health.checked',
      target: 'health.md',
      detail: `${report.issues.length} issues`,
    });
    return NextResponse.json({ report });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
