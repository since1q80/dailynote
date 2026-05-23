import { NextResponse } from 'next/server';
import {
  addNoteIdToPerson,
  ensureConcept,
  listNotes,
  refreshConceptCount,
  updateNoteConcepts,
  updateNoteTags,
  writePurpose,
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
  {
    content: '读《The Effective Executive》时被一句话打到：真正稀缺的不是时间，而是连续、不被打断的注意力。我最近的很多低效都不是因为任务太多，而是切换太碎。',
    tags: ['注意力', '读书笔记'],
    concepts: ['注意力管理', '自我要求'],
    people: [],
  },
  {
    content: '和 Nina 聊到产品发布，她说用户不是不愿意试新工具，而是不愿意先付出一堆配置成本。这个提醒很适合 DailyNote：试用路径必须先让人看到价值，再要求接入自己的模型。',
    tags: ['产品发布', '试用体验'],
    concepts: ['产品推广', '用户体验'],
    people: ['Nina'],
  },
  {
    content: '我发现自己写产品文案时容易先讲功能，但真正能打动人的其实是“你不用再维护知识库”。功能是证据，不是开场白。',
    tags: ['产品文案', '定位'],
    concepts: ['产品推广', '沟通方式'],
    people: [],
  },
  {
    content: '下午试着把旧 note 按主题回看，发现“工作焦虑”和“沟通方式”经常一起出现。也许我以为的压力管理问题，本质上有一半是表达时机问题。',
    tags: ['复盘', '模式识别'],
    concepts: ['工作焦虑', '沟通方式', '注意力管理'],
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
    await writePurpose('我想观察自己反复出现的工作焦虑、沟通习惯、注意力管理，以及产品想法如何从模糊变清晰。');

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
