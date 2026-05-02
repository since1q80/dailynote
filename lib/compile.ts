/**
 * compile.ts — 把 prompts / openai / storage 黏合起来的编排层
 *
 * 三个对外方法：
 *   saveNote(content)      — 保存 + 后台分析
 *   compileConcept(title)  — 单独刷新某个概念卡
 *   askAboutConcept(...)   — 同步问答
 */

import { callJSON, MODEL_FAST, MODEL_SMART } from './openai';
import {
  getSystemPrompts,
  classifyUser,
  compileUser,
  askUser,
  extractPeopleUser,
  extractTagsUser,
  askPersonUser,
  globalAskUser,
} from './prompts';
import {
  writeNote,
  listNotes,
  updateNoteConcepts,
  listConcepts,
  readConcept,
  writeConcept,
  ensureConcept,
  refreshConceptCount,
  getNotesForConcept,
  addNoteIdToPerson,
  removeNoteIdFromPerson,
  listPeople,
  getNotesForPerson,
  updateNoteTags,
  readNote,
} from './storage';
import type {
  Note,
  Concept,
  ClassifyResult,
  CompileResult,
  AskResult,
  GlobalAskResult,
  ExtractPeopleResult,
  ExtractTagsResult,
  InstantInsight,
  EchoResult,
  RecentInsights,
  RelatedNote,
} from './types';

/**
 * 完整保存流程：
 *   1. 写 md 文件（快，马上返回给 UI）
 *   2. 后台提取轻量洞察 + 触发概念重编译（fire-and-forget）
 *
 * 返回刚写入的 note + 当前可用的洞察
 */
export async function saveNote(content: string): Promise<{ note: Note; insight: InstantInsight }> {
  const note = await writeNote(content);

  processSavedNote(note).catch((err) =>
    console.warn(`[compile] processSavedNote(${note.id}) failed:`, err?.message ?? err)
  );

  return {
    note,
    insight: {
      note,
      tags: [],
      people: [],
      possible_concepts: [],
      related_notes: await findRelatedNotes(note, { limit: 3, excludeIds: [note.id] }),
    },
  };
}

async function processSavedNote(note: Note): Promise<void> {
  const [people, tags, classifyResult] = await Promise.all([
    extractPeopleFromNote(note).catch((err) => {
      console.warn(`[compile] extractPeople(${note.id}) failed:`, err?.message ?? err);
      return [] as string[];
    }),
    extractTagsFromNote(note).catch((err) => {
      console.warn(`[compile] extractTags(${note.id}) failed:`, err?.message ?? err);
      return [] as string[];
    }),
    classifyNote(note).catch((err) => {
      console.warn(`[compile] classifyNote(${note.id}) failed:`, err?.message ?? err);
      return { matches: [] } as ClassifyResult;
    }),
  ]);

  const possibleConcepts = conceptTitlesFromMatches(classifyResult);

  if (possibleConcepts.length > 0) {
    await attachConceptsAndCompileLater(note.id, possibleConcepts);
  }

  console.log(`[compile] processSavedNote(${note.id}) done`, {
    people,
    tags,
    concepts: possibleConcepts,
  });
}

export async function processNewNote(note: Note): Promise<void> {
  const classifyResult = await classifyNote(note);
  const touchedTitles = conceptTitlesFromMatches(classifyResult);
  if (touchedTitles.length === 0) return; // "未分类" —— 尊严保留
  await attachConceptsAndCompileLater(note.id, touchedTitles, { awaitCompile: true });
}

async function classifyNote(note: Note): Promise<ClassifyResult> {
  const [existing, prompts] = await Promise.all([listConcepts(), getSystemPrompts()]);
  const classifyResult = await callJSON<ClassifyResult>({
    model: MODEL_FAST,
    system: prompts.CLASSIFY_SYSTEM,
    user: classifyUser(note.content, existing),
    maxTokens: 600,
  });
  console.log(`[classify] note=${note.id} result=`, JSON.stringify(classifyResult));
  return classifyResult;
}

async function attachConceptsAndCompileLater(
  noteId: string,
  titles: string[],
  opts: { awaitCompile?: boolean } = {}
): Promise<void> {
  const touchedTitles = cleanTitles(titles);
  for (const title of touchedTitles) {
    await ensureConcept(title);
  }
  await updateNoteConcepts(noteId, touchedTitles);

  for (const t of touchedTitles) {
    await refreshConceptCount(t);
  }

  const compileAll = async () => {
    for (const t of touchedTitles) {
      await compileConcept(t).catch((err) =>
        console.warn(`[compile] compileConcept(${t}) failed:`, err?.message ?? err)
      );
    }
  };

  if (opts.awaitCompile) await compileAll();
  else compileAll().catch((err) => console.warn('[compile] async compile failed:', err));
}

async function extractPeopleFromNote(note: Note): Promise<string[]> {
  const prompts = await getSystemPrompts();
  const { people } = await callJSON<ExtractPeopleResult>({
    model: MODEL_FAST,
    system: prompts.EXTRACT_PEOPLE_SYSTEM,
    user: extractPeopleUser(note.content),
    maxTokens: 200,
  });
  console.log(`[people] note=${note.id} found=`, people);
  const clean = cleanTitles(people || []).filter((name) => noteMentionsName(note.content, name));
  for (const name of clean) {
    await addNoteIdToPerson(name, note.id);
  }
  return clean;
}

async function extractTagsFromNote(note: Note): Promise<string[]> {
  const [prompts, allNotes] = await Promise.all([getSystemPrompts(), listNotes()]);
  const existingTags = Array.from(
    new Set(allNotes.flatMap((n) => n.tags ?? []).filter((t) => t))
  );
  const { tags } = await callJSON<ExtractTagsResult>({
    model: MODEL_FAST,
    system: prompts.EXTRACT_TAGS_SYSTEM,
    user: extractTagsUser(note.content, existingTags),
    maxTokens: 100,
  });
  const clean = cleanTitles(tags || []);
  if (clean.length > 0) {
    await updateNoteTags(note.id, clean);
  }
  return clean;
}

/** 编辑 note 内容后重新提取人名和标签（协调增删） */
export async function reprocessNoteAfterEdit(note: Note): Promise<void> {
  const [prompts, allNotes] = await Promise.all([getSystemPrompts(), listNotes()]);
  const existingTags = Array.from(
    new Set(allNotes.flatMap((n) => n.tags ?? []).filter((t) => t))
  );

  // 并行提取新的人名和标签
  const [peopleResult, tagsResult] = await Promise.all([
    callJSON<ExtractPeopleResult>({
      model: MODEL_FAST,
      system: prompts.EXTRACT_PEOPLE_SYSTEM,
      user: extractPeopleUser(note.content),
      maxTokens: 200,
    }).catch(() => ({ people: [] as string[] })),
    callJSON<ExtractTagsResult>({
      model: MODEL_FAST,
      system: prompts.EXTRACT_TAGS_SYSTEM,
      user: extractTagsUser(note.content, existingTags),
      maxTokens: 100,
    }).catch(() => ({ tags: [] as string[] })),
  ]);

  const newPeople = cleanTitles(peopleResult.people || []).filter((name) =>
    noteMentionsName(note.content, name)
  );
  const newTags = tagsResult.tags || [];

  // 协调人名：找出目前所有持有此 note_id 的人，移除不再提到的，添加新增的
  const allPeople = await listPeople();
  const currentPeople = allPeople
    .filter((p) => p.note_ids.includes(note.id))
    .map((p) => p.name);

  const toRemove = currentPeople.filter((name) => !newPeople.includes(name));
  const toAdd = newPeople.filter((name) => !currentPeople.includes(name));

  await Promise.all([
    ...toRemove.map((name) => removeNoteIdFromPerson(name, note.id)),
    ...toAdd.map((name) => addNoteIdToPerson(name, note.id)),
  ]);

  // 标签直接覆盖
  if (newTags.length > 0) {
    await updateNoteTags(note.id, newTags);
  }
}

/** 重新生成某个概念的 synthesis / patterns / related */
export async function compileConcept(title: string): Promise<CompileResult | null> {
  const concept = await readConcept(title);
  if (!concept) return null;

  const notes = await getNotesForConcept(title);
  if (notes.length === 0) return null;

  const [allConcepts, prompts] = await Promise.all([listConcepts(), getSystemPrompts()]);
  const otherConcepts = allConcepts
    .filter((c) => c.title !== title)
    .map((c) => ({ title: c.title }));

  const result = await callJSON<CompileResult>({
    model: MODEL_SMART,
    system: prompts.COMPILE_SYSTEM,
    user: compileUser(concept, notes, otherConcepts),
    maxTokens: 1500,
  });

  // 只保留 LLM 返回的、且在现有概念里存在的 related
  const validTitles = new Set(otherConcepts.map((c) => c.title));
  const cleanRelated = (result.related || []).filter((t) => validTitles.has(t));

  await writeConcept({
    title,
    synthesis: result.synthesis || null,
    patterns: result.patterns || [],
    contradictions: result.contradictions || [],
    evolution: result.evolution || null,
    related: cleanRelated,
    note_count: notes.length,
    updated_at: new Date().toISOString(),
  });

  return { ...result, related: cleanRelated };
}

/** 问答，同步返回 */
export async function askAboutConcept(
  title: string,
  question: string
): Promise<AskResult & { notes: Note[] }> {
  const concept = await readConcept(title);
  if (!concept) throw new Error('概念不存在');

  const notes = await getNotesForConcept(title);
  if (notes.length === 0) {
    return {
      answer: '你还没有关于这个主题的笔记。先写几条再来问我吧。',
      what_you_havent_written: [],
      follow_ups: [],
      notes: [],
    };
  }

  const prompts = await getSystemPrompts();
  const result = await callJSON<AskResult>({
    model: MODEL_SMART,
    system: prompts.ASK_SYSTEM,
    user: askUser(title, question, concept.synthesis ?? '', notes),
    maxTokens: 2000,
  });

  return { ...result, notes };
}

const PAGE_SIZE = 10;

// 给前端列表页用
export async function getHomeData(page = 1): Promise<{
  concepts: Concept[];
  recent_notes: Note[];
  people: Awaited<ReturnType<typeof listPeople>>;
  tags: { name: string; count: number }[];
  total_notes: number;
  page: number;
  total_pages: number;
  insights: RecentInsights;
}> {
  const [concepts, allNotes, people] = await Promise.all([
    listConcepts(),
    listNotes(),
    listPeople(),
  ]);
  const tagMap = new Map<string, number>();
  for (const note of allNotes) {
    for (const tag of note.tags ?? []) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }
  const tags = Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const start = (page - 1) * PAGE_SIZE;
  return {
    concepts: concepts.filter((c) => c.note_count > 0),
    recent_notes: allNotes.slice(start, start + PAGE_SIZE),
    people,
    tags,
    total_notes: allNotes.length,
    page,
    total_pages: Math.max(1, Math.ceil(allNotes.length / PAGE_SIZE)),
    insights: getRecentInsightsFromData(allNotes, concepts, people, tags),
  };
}

export async function getRecentInsights(): Promise<RecentInsights> {
  const [concepts, allNotes, people] = await Promise.all([
    listConcepts(),
    listNotes(),
    listPeople(),
  ]);
  const tagMap = new Map<string, number>();
  for (const note of allNotes) {
    for (const tag of note.tags ?? []) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }
  const tags = Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return getRecentInsightsFromData(allNotes, concepts, people, tags);
}

function getRecentInsightsFromData(
  notes: Note[],
  concepts: Concept[],
  people: Awaited<ReturnType<typeof listPeople>>,
  tags: { name: string; count: number }[]
): RecentInsights {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recent = notes.filter((n) => new Date(n.created_at).getTime() >= sevenDaysAgo);
  const recentConcepts = new Set(recent.flatMap((n) => n.concepts ?? []));
  const new_concepts = concepts
    .filter((c) => recentConcepts.has(c.title))
    .slice(0, 4)
    .map((c) => c.title);
  const oldEnough = notes.filter((n) => now - new Date(n.created_at).getTime() > 14 * 24 * 60 * 60 * 1000);

  return {
    note_count_7d: recent.length,
    top_tags: tags.slice(0, 4),
    top_people: people.slice(0, 4).map((p) => ({ name: p.name, count: p.note_ids.length })),
    new_concepts,
    resurfaced_note: oldEnough[Math.floor(Math.min(oldEnough.length - 1, 2))] ?? null,
  };
}

export async function getEcho(content: string): Promise<EchoResult> {
  if (content.trim().length < 12) return { notes: [] };
  const ghost: Note = {
    id: '__draft__',
    content,
    created_at: new Date().toISOString(),
    concepts: [],
    tags: [],
  };
  return { notes: await findRelatedNotes(ghost, { limit: 3, excludeIds: [] }) };
}

export async function getInstantInsight(note: Note): Promise<InstantInsight> {
  const people = await listPeople();
  return {
    note,
    tags: note.tags ?? [],
    people: people.filter((p) => p.note_ids.includes(note.id)).map((p) => p.name),
    possible_concepts: note.concepts ?? [],
    related_notes: await findRelatedNotes(note, { limit: 3, excludeIds: [note.id] }),
  };
}

/** 全局搜索 / 跨主题问答 */
export async function askGlobal(
  question: string
): Promise<GlobalAskResult & { notes: Note[] }> {
  const allNotes = await listNotes();
  if (allNotes.length === 0) {
    return { answer: '你还没有写过任何笔记。', relevant_note_ids: [], follow_ups: [], notes: [] };
  }
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const filtered = prefilterNotes(allNotes, question, today);
  const prompts = await getSystemPrompts();
  const result = await callJSON<GlobalAskResult>({
    model: MODEL_FAST,
    system: prompts.GLOBAL_ASK_SYSTEM,
    user: globalAskUser(question, filtered, todayStr),
    maxTokens: 2000,
  });
  // notes 返回完整 filtered 数组，保证答案里的 [n] 编号和数组下标对齐
  return { ...result, notes: filtered };
}

function parseDateRange(question: string, today: Date): { from: Date; to: Date } | null {
  const q = question;
  const clone = (d: Date) => new Date(d.getTime());

  if (/昨天/.test(q)) {
    const from = clone(today); from.setDate(today.getDate() - 1); from.setHours(0, 0, 0, 0);
    const to = clone(today); to.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (/今天/.test(q)) {
    const from = clone(today); from.setHours(0, 0, 0, 0);
    const to = clone(today); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (/上周|这周|本周|最近一周/.test(q)) {
    const from = clone(today); from.setDate(today.getDate() - 7); from.setHours(0, 0, 0, 0);
    return { from, to: today };
  }
  if (/最近|近期/.test(q)) {
    const from = clone(today); from.setDate(today.getDate() - 14); from.setHours(0, 0, 0, 0);
    return { from, to: today };
  }
  if (/上个月|上月/.test(q)) {
    const from = clone(today); from.setMonth(today.getMonth() - 1); from.setHours(0, 0, 0, 0);
    return { from, to: today };
  }
  return null;
}

function prefilterNotes(notes: Note[], question: string, today: Date): Note[] {
  // 1. 时间过滤：命中则只传该时间段内的 note
  const range = parseDateRange(question, today);
  if (range) {
    const temporal = notes.filter((n) => {
      const d = new Date(n.created_at);
      return d >= range.from && d <= range.to;
    });
    if (temporal.length > 0) return temporal;
  }

  // 2. 关键词过滤：去掉常见停用词后，匹配 note 内容
  const stopWords = new Set(['什么', '说过', '说了', '有没有', '关于', '的', '了', '吗',
    '呢', '么', '我', '你', '他', '她', '是', '在', '有', '和', '与', '都', '也',
    '不', '没', '会', '能', '想', '要', '就', '还', '很', '这', '那', '一', '个']);
  const keywords = question
    .replace(/[？。！，、""''【】《》？\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  if (keywords.length > 0) {
    const matched = notes.filter((n) => keywords.some((kw) => n.content.includes(kw)));
    if (matched.length >= 2) return matched.slice(0, 30);
  }

  // 3. 兜底：最近 30 条
  return notes.slice(0, 30);
}

/** 问关于某人的问题 */
export async function askAboutPerson(
  name: string,
  question: string
): Promise<AskResult & { notes: Note[] }> {
  const notes = await getNotesForPerson(name);
  if (notes.length === 0) {
    return {
      answer: `你还没有提到过「${name}」的笔记。`,
      what_you_havent_written: [],
      follow_ups: [],
      notes: [],
    };
  }
  const prompts = await getSystemPrompts();
  const result = await callJSON<AskResult>({
    model: MODEL_SMART,
    system: prompts.ASK_SYSTEM,
    user: askPersonUser(name, question, notes),
    maxTokens: 2000,
  });
  return { ...result, notes };
}

type RelatedOptions = {
  limit: number;
  excludeIds: string[];
};

async function findRelatedNotes(note: Note, opts: RelatedOptions): Promise<RelatedNote[]> {
  const [allNotes, people] = await Promise.all([listNotes(), listPeople()]);
  const keywords = extractKeywords(note.content);
  const notePeople = new Set(
    people.filter((p) => p.note_ids.includes(note.id)).map((p) => p.name)
  );

  const scored = allNotes
    .filter((n) => !opts.excludeIds.includes(n.id))
    .map((candidate) => {
      const reasons: string[] = [];
      let score = 0;

      const sharedTags = (candidate.tags ?? []).filter((t) => (note.tags ?? []).includes(t));
      if (sharedTags.length > 0) {
        score += sharedTags.length * 5;
        reasons.push(`#${sharedTags.slice(0, 2).join(' #')}`);
      }

      const sharedConcepts = (candidate.concepts ?? []).filter((c) => (note.concepts ?? []).includes(c));
      if (sharedConcepts.length > 0) {
        score += sharedConcepts.length * 6;
        reasons.push(sharedConcepts.slice(0, 2).join(' / '));
      }

      const candidatePeople = people
        .filter((p) => p.note_ids.includes(candidate.id) && notePeople.has(p.name))
        .map((p) => p.name);
      if (candidatePeople.length > 0) {
        score += candidatePeople.length * 4;
        reasons.push(candidatePeople.slice(0, 2).join(' / '));
      }

      const candidateKeywords = extractKeywords(candidate.content);
      const sharedKeywords = candidateKeywords.filter((kw) => keywords.includes(kw));
      if (sharedKeywords.length > 0) {
        score += Math.min(sharedKeywords.length, 5);
        reasons.push(sharedKeywords.slice(0, 3).join(' / '));
      }

      const ageDays = (Date.now() - new Date(candidate.created_at).getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > 7) score += 0.5;

      return {
        note: candidate,
        reason: reasons.length > 0 ? reasons.slice(0, 2).join(' · ') : '内容相近',
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit);

  return scored.map(({ note, reason }) => ({ note, reason }));
}

function cleanTitles(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => (s || '').trim()).filter(Boolean)));
}

function conceptTitlesFromMatches(result: ClassifyResult): string[] {
  return cleanTitles(
    (result.matches || [])
      .filter((m) => Number(m.confidence) >= 0.7)
      .map((m) => m.concept_title)
  );
}

function noteMentionsName(content: string, name: string): boolean {
  if (!name) return false;
  return content.toLowerCase().includes(name.toLowerCase());
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '什么', '说过', '说了', '有没有', '关于', '的', '了', '吗', '呢', '么', '我',
    '你', '他', '她', '是', '在', '有', '和', '与', '都', '也', '不', '没', '会',
    '能', '想', '要', '就', '还', '很', '这', '那', '一个', 'the', 'and', 'for',
    'with', 'that', 'this', 'have', 'not', 'you', 'but', 'are', 'was', 'were',
  ]);
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[？。！，、""''【】《》?.,;:()[\]{}\s]/g, ' ')
        .split(/\s+/)
        .flatMap((chunk) => {
          if (/^[\u4e00-\u9fff]+$/.test(chunk)) {
            const words: string[] = [];
            for (let i = 0; i < chunk.length - 1; i++) words.push(chunk.slice(i, i + 2));
            return words;
          }
          return [chunk];
        })
        .filter((w) => w.length >= 2 && !stopWords.has(w))
    )
  ).slice(0, 40);
}
