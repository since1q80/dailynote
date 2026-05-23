import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function runZip(dataDir: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('zip', ['-r', output, '.'], { cwd: dataDir });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `zip exited with ${code}`));
    });
  });
}

export async function POST() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = path.join(dataDir, `../DailyNote-backup-${stamp}.zip`);
    await runZip(dataDir, output);
    return NextResponse.json({ ok: true, path: path.resolve(output) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
