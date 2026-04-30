/**
 * compile.ts — 把 prompts / openai / storage 黏合起来的编排层
 *
 * 三个对外方法：
 *   saveNote(content)      — 保存 + 异步分类 + 触发概念编译
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
} from './types';

/**
 * 完整保存流程：
 *   1. 写 md 文件（快，马上返回给 UI）
 *   2. 异步分类 + 触发相关概念重编译（fire-and-forget）
 *
 * 返回最新的 note（分类可能还没完成，前端可以稍后刷新）
 */
export async function saveNote(content: string): Promise<Note> {
  const note = await writeNote(content);
  // 人名 + 标签提取并行 await（都是 nano，快；保证跳转后 UI 立即正确）
  await Promise.all([
    extractPeopleFromNote(note).catch((err) =>
      console.warn(`[compile] extractPeople(${note.id}) failed:`, err?.message ?? err)
    ),
    extractTagsFromNote(note).catch((err) =>
      console.warn(`[compile] extractTags(${note.id}) failed:`, err?.message ?? err)
    ),
  ]);
  // 分类 + 概念编译 fire-and-forget（慢，不阻塞跳转）
  processNewNote(note).catch((err) =>
    console.warn(`[compile] processNewNote(${note.id}) failed:`, err?.message ?? err)
  );
  return note;
}

export async function processNewNote(note: Note): Promise<void> {
  const [existing, prompts] = await Promise.all([listConcepts(), getSystemPrompts()]);

  // Step 1: 分类
  const classifyResult = await callJSON<ClassifyResult>({
    model: MODEL_FAST,
    system: prompts.CLASSIFY_SYSTEM,
    user: classifyUser(note.content, existing),
    maxTokens: 600,
  });
  console.log(`[classify] note=${note.id} result=`, JSON.stringify(classifyResult));
  const { matches } = classifyResult;

  if (!matches || matches.length === 0) {
    return; // "未分类" —— 尊严保留
  }

  // Step 2: 保证概念存在并关联
  const touchedTitles: string[] = [];
  for (const m of matches) {
    const title = (m.concept_title || '').trim();
    if (!title) continue;
    await ensureConcept(title);
    touchedTitles.push(title);
  }
  await updateNoteConcepts(note.id, touchedTitles);

  // Step 3: 对每个被触及的概念刷新 note_count，然后重新编译
  for (const t of touchedTitles) {
    await refreshConceptCount(t);
  }
  for (const t of touchedTitles) {
    await compileConcept(t).catch((err) =>
      console.warn(`[compile] compileConcept(${t}) failed:`, err?.message ?? err)
    );
  }
}

async function extractPeopleFromNote(note: Note): Promise<void> {
  const prompts = await getSystemPrompts();
  const { people } = await callJSON<ExtractPeopleResult>({
    model: MODEL_FAST,
    system: prompts.EXTRACT_PEOPLE_SYSTEM,
    user: extractPeopleUser(note.content),
    maxTokens: 200,
  });
  console.log(`[people] note=${note.id} found=`, people);
  for (const name of people || []) {
    if (name.trim()) await addNoteIdToPerson(name.trim(), note.id);
  }
}

async function extractTagsFromNote(note: Note): Promise<void> {
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
  if (tags && tags.length > 0) {
    await updateNoteTags(note.id, tags);
  }
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

  const newPeople = (peopleResult.people || []).map((n) => n.trim()).filter(Boolean);
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
