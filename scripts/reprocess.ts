/**
 * 重跑所有历史 note：分类 + 概念编译 + 人名提取 + 标签提取
 * 用法：npx tsx scripts/reprocess.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { listNotes } from '../lib/storage';
import { processNewNote, reprocessNoteAfterEdit } from '../lib/compile';

async function main() {
  const notes = await listNotes();
  console.log(`共 ${notes.length} 条笔记，全部重新处理\n`);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    process.stdout.write(`[${i + 1}/${notes.length}] ${note.id} ... `);
    await Promise.all([
      processNewNote(note),
      reprocessNoteAfterEdit(note),
    ]);
    console.log('完成');
  }

  console.log('\n全部处理完毕');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
