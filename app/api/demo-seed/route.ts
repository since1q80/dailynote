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
import type { Lang } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DemoNote = {
  content: string;
  tags: string[];
  concepts: string[];
  people: string[];
};

const demoNotesZh: DemoNote[] = [
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

const demoNotesEn: DemoNote[] = [
  {
    content: 'During a project review with Peter, I noticed that vague ownership makes me anxious. The task itself was not the hard part; the hard part was not knowing who was supposed to make the decision.',
    tags: ['ownership', 'work-anxiety'],
    concepts: ['Work anxiety', 'Communication habits'],
    people: ['Peter'],
  },
  {
    content: 'Looking back at yesterday’s meeting, I did ask for clearer R&R, but I said it too softly. Next time I want to split the issue into owner, deadline, and decision.',
    tags: ['R&R', 'meeting-review'],
    concepts: ['Communication habits'],
    people: [],
  },
  {
    content: 'Gray reminded me not to absorb every messy system as a personal failure. I often mix up “I have not thought clearly enough” with “this system is actually unclear.”',
    tags: ['self-expectation', 'complex-problems'],
    concepts: ['Work anxiety', 'Self-expectation'],
    people: ['Gray'],
  },
  {
    content: 'Several recent notes circle around the same point: I need to expose uncertainty earlier instead of waiting until I have organized everything. Speaking late makes me look calm, but it also makes me carry the ambiguity alone for too long.',
    tags: ['uncertainty', 'expression-habits'],
    concepts: ['Communication habits', 'Self-expectation'],
    people: [],
  },
  {
    content: 'While reading The Effective Executive, one idea hit me: the scarce resource is not time, but continuous attention. A lot of my recent inefficiency comes from context switching, not from having too many tasks.',
    tags: ['attention', 'reading-notes'],
    concepts: ['Attention management', 'Self-expectation'],
    people: [],
  },
  {
    content: 'Nina said users are not unwilling to try new tools; they are unwilling to pay a large setup cost before seeing value. That applies directly to DailyNote: the trial path should show the value first, then ask users to connect their own model.',
    tags: ['product-launch', 'trial-experience'],
    concepts: ['Product growth', 'User experience'],
    people: ['Nina'],
  },
  {
    content: 'When I write product copy, I tend to start with features. But the thing that actually lands is “you do not have to maintain your knowledge base anymore.” Features are proof, not the opening line.',
    tags: ['product-copy', 'positioning'],
    concepts: ['Product growth', 'Communication habits'],
    people: [],
  },
  {
    content: 'This afternoon I reviewed old notes by topic and noticed that Work anxiety and Communication habits often appear together. Maybe what I call stress management is partly a timing problem in how I communicate.',
    tags: ['reflection', 'pattern-recognition'],
    concepts: ['Work anxiety', 'Communication habits', 'Attention management'],
    people: [],
  },
];

const demoPurpose: Record<Lang, string> = {
  zh: '我想观察自己反复出现的工作焦虑、沟通习惯、注意力管理，以及产品想法如何从模糊变清晰。',
  en: 'I want to notice recurring patterns around work anxiety, communication habits, attention management, and how product ideas become clearer over time.',
};

function demoDataFor(lang: Lang) {
  return lang === 'en'
    ? { notes: demoNotesEn, purpose: demoPurpose.en }
    : { notes: demoNotesZh, purpose: demoPurpose.zh };
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const lang: Lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
    const demo = demoDataFor(lang);
    const existing = await listNotes();
    if (existing.length > 0) {
      return NextResponse.json({ error: 'demo seed only allowed when data is empty' }, { status: 409 });
    }

    const touchedConcepts = new Set<string>();
    await writePurpose(demo.purpose);

    for (const item of demo.notes) {
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
    return NextResponse.json({ ok: true, count: demo.notes.length, lang });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
