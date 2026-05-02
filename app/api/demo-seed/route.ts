import { NextResponse } from 'next/server';
import {
  addNoteIdToPerson,
  ensureConcept,
  listNotes,
  refreshConceptCount,
  updateNoteConcepts,
  updateNoteTags,
  writeNote,
} from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const demoNotes = [
  {
    content: '今天和 Peter 复盘项目时，我发现自己一遇到职责边界模糊就会开始焦虑。真正让我卡住的不是任务本身，而是不知道谁该做决定。',
    tags: ['职责边界', '工作焦虑'],
    concepts: ['工作焦虑', '沟通方式'],
    people: ['Peter'],
  },
  {
    content: '晚上回看昨天的会议，我其实已经提过需要更清楚的 R&R，但当时说得太委婉。下次我想直接把问题拆成 owner、deadline、decision 三块。',
    tags: ['R&R', '会议复盘'],
    concepts: ['沟通方式'],
    people: [],
  },
  {
    content: 'Gray 今天提醒我别把所有复杂问题都先往自己身上揽。我好像经常把“我没想清楚”和“这个系统本来就混乱”混在一起。',
    tags: ['自我要求', '复杂问题'],
    concepts: ['工作焦虑', '自我要求'],
    people: ['Gray'],
  },
  {
    content: '最近几次写 note 都绕回同一个点：我需要更早暴露不确定性，而不是等到自己整理完才开口。晚开口会让我显得稳，但也会让我独自承担太久。',
    tags: ['不确定性', '表达习惯'],
    concepts: ['沟通方式', '自我要求'],
    people: [],
  },
];

export async function POST() {
  try {
    const existing = await listNotes();
    if (existing.length > 0) {
      return NextResponse.json({ error: 'demo seed only allowed when data is empty' }, { status: 409 });
    }

    const touchedConcepts = new Set<string>();
    for (const item of demoNotes) {
      const note = await writeNote(item.content);
      await updateNoteTags(note.id, item.tags);
      await updateNoteConcepts(note.id, item.concepts);
      for (const title of item.concepts) {
        touchedConcepts.add(title);
        await ensureConcept(title);
      }
      for (const person of item.people) {
        await addNoteIdToPerson(person, note.id);
      }
    }

    await Promise.all(Array.from(touchedConcepts).map((title) => refreshConceptCount(title)));
    return NextResponse.json({ ok: true, count: demoNotes.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
