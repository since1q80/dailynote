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
  analyzeNoteUser,
  detectNoteLinksUser,
  classifyUser,
  classifyFromAnalysisUser,
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
  deleteNote,
  readPurpose,
  writeNoteAnalysis,
  writeNoteProcessingStatus,
  readNoteAnalysis,
  listNoteAnalyses,
  writeReviewItem,
  listReviewItems,
  readReviewItem,
  deleteReviewItem,
  deleteReviewItemsForNote,
  writeNoteLink,
  listNoteLinks,
  deleteNoteLinksForNote,
  getPeopleForNote,
  appendWikiLog,
  rebuildWikiIndex,
  runHealthCheck,
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
  AnalyzeNoteResult,
  NoteAnalysis,
  ReviewItem,
  DetectNoteLinksResult,
  NoteLink,
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
  await appendWikiLog({ action: 'note.created', target: note.id, detail: note.content.slice(0, 80) });
  await writeNoteProcessingStatus({
    note_id: note.id,
    status: 'processing',
    message: 'AI is organizing this note.',
    tags: [],
    people: [],
    concepts: [],
    related_notes: [],
    updated_at: new Date().toISOString(),
  });
  rebuildWikiIndex().catch((err) => console.warn('[index] rebuild after note create failed:', err));

  processSavedNote(note).catch((err) =>
    markNoteProcessingError(note.id, err)
  );

  return {
    note,
    insight: {
      note,
      tags: [],
      people: [],
      possible_concepts: [],
      related_notes: [],
    },
  };
}

async function processSavedNote(note: Note): Promise<void> {
  const [people, tags, analysis] = await Promise.all([
    extractPeopleFromNote(note).catch((err) => {
      console.warn(`[compile] extractPeople(${note.id}) failed:`, err?.message ?? err);
      return [] as string[];
    }),
    extractTagsFromNote(note).catch((err) => {
      console.warn(`[compile] extractTags(${note.id}) failed:`, err?.message ?? err);
      return [] as string[];
    }),
    analyzeNote(note).catch((err) => {
      console.warn(`[compile] analyzeNote(${note.id}) failed:`, err?.message ?? err);
      return null;
    }),
  ]);

  const possibleConcepts = analysis ? analysisConceptTitles(analysis, { minConfidence: 0.78 }) : [];
  const needsReview = analysis ? reviewCandidatesFromAnalysis(note, analysis) : [];

  if (analysis && possibleConcepts.length > 0 && needsReview.length === 0) {
    await attachConceptsAndCompileLater(note.id, possibleConcepts, {
      evidence: evidenceFromAnalysis(analysis),
    });
  } else {
    for (const item of needsReview) {
      await writeReviewItem(item);
      await appendWikiLog({
        action: 'review.created',
        target: item.id,
        detail: `${item.suggestion}: ${item.reason}`,
      });
    }
  }

  console.log(`[compile] processSavedNote(${note.id}) done`, {
    people,
    tags,
    concepts: possibleConcepts,
  });

  const relatedNotes = analysis
    ? await findRelatedNotes(
        { ...note, tags, concepts: possibleConcepts },
        { limit: 3, excludeIds: [note.id], preferConcepts: true }
      ).catch((err) => {
        console.warn(`[insight] related notes for ${note.id} failed:`, err?.message ?? err);
        return [];
      })
    : [];

  await writeNoteProcessingStatus({
    note_id: note.id,
    status: analysis ? 'done' : 'error',
    message: analysis ? analysis.event_summary : 'AI analysis failed. Check AI settings and try again.',
    tags,
    people,
    concepts: possibleConcepts,
    related_notes: relatedNotes,
    updated_at: new Date().toISOString(),
  });

  if (analysis) {
    detectAndWriteNoteLinks(note, analysis).catch((err) =>
      console.warn(`[links] detect note links for ${note.id} failed:`, err?.message ?? err)
    );
  }
}

async function markNoteProcessingError(noteId: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[compile] processSavedNote(${noteId}) failed:`, msg);
  await writeNoteProcessingStatus({
    note_id: noteId,
    status: 'error',
    message: msg,
    tags: [],
    people: [],
    concepts: [],
    related_notes: [],
    updated_at: new Date().toISOString(),
  }).catch((writeErr) =>
    console.warn(`[compile] write processing error ${noteId} failed:`, writeErr?.message ?? writeErr)
  );
}

export async function processNewNote(note: Note): Promise<void> {
  const analysis = await analyzeNote(note);
  const touchedTitles = analysisConceptTitles(analysis, { minConfidence: 0.78 });
  if (touchedTitles.length === 0) return; // "未分类" —— 尊严保留
  await attachConceptsAndCompileLater(note.id, touchedTitles, {
    awaitCompile: true,
    evidence: evidenceFromAnalysis(analysis),
  });
}

async function classifyNote(note: Note): Promise<ClassifyResult> {
  const [existing, prompts, purpose, analysis] = await Promise.all([
    listConcepts(),
    getSystemPrompts(),
    readPurpose(),
    readNoteAnalysis(note.id),
  ]);
  const classifyResult = await callJSON<ClassifyResult>({
    model: MODEL_FAST,
    system: prompts.CLASSIFY_SYSTEM,
    user: analysis
      ? classifyFromAnalysisUser(note, analysis, existing, purpose.content)
      : classifyUser(note.content, existing),
    maxTokens: 600,
  });
  const guardedResult = applySubjectGuard(note.content, classifyResult);
  console.log(`[classify] note=${note.id} result=`, JSON.stringify(guardedResult));
  return guardedResult;
}

async function analyzeNote(note: Note): Promise<NoteAnalysis> {
  const [existing, prompts, purpose] = await Promise.all([
    listConcepts(),
    getSystemPrompts(),
    readPurpose(),
  ]);
  const result = await callJSON<AnalyzeNoteResult>({
    model: MODEL_FAST,
    system: prompts.ANALYZE_NOTE_SYSTEM,
    user: analyzeNoteUser(note.content, existing, purpose.content),
    maxTokens: 900,
  });
  const guardedConcepts = applySubjectGuard(note.content, {
    matches: (result.candidate_concepts || []).map((c) => ({
      concept_title: c.concept_title,
      confidence: c.confidence,
      is_new: c.is_new,
    })),
  }).matches;
  const guardedTitles = new Set(guardedConcepts.map((m) => m.concept_title));
  const analysis: NoteAnalysis = {
    note_id: note.id,
    subject: result.subject || 'user',
    object_people: cleanTitles(result.object_people || []).filter((name) =>
      noteMentionsName(note.content, name)
    ),
    event_summary: result.event_summary || note.content.slice(0, 120),
    emotion: result.emotion ?? null,
    intent: result.intent || '记录',
    candidate_concepts: (result.candidate_concepts || [])
      .filter((c) => guardedTitles.has(c.concept_title))
      .slice(0, 3),
    evidence: (result.evidence || []).slice(0, 3),
    confidence: Number(result.confidence ?? 0),
    updated_at: new Date().toISOString(),
  };
  await writeNoteAnalysis(analysis);
  return analysis;
}

async function detectAndWriteNoteLinks(note: Note, analysis: NoteAnalysis): Promise<NoteLink[]> {
  const [allNotes, allAnalyses, prompts] = await Promise.all([
    listNotes(),
    listNoteAnalyses(),
    getSystemPrompts(),
  ]);
  const existingLinks = await listNoteLinks();
  const candidates = selectLinkCandidates(note, analysis, allNotes, allAnalyses).slice(0, 12);
  if (candidates.length === 0) return [];

  const result = await callJSON<DetectNoteLinksResult>({
    model: MODEL_FAST,
    system: prompts.DETECT_NOTE_LINKS_SYSTEM,
    user: detectNoteLinksUser(note, analysis, candidates),
    maxTokens: 900,
  });

  const validIds = new Set(candidates.map((c) => c.note.id));
  const existingIds = new Set(existingLinks.map((link) => link.id));
  const links: NoteLink[] = (result.links || [])
    .filter((link) => validIds.has(link.from_note_id))
    .filter((link) => Number(link.confidence) >= 0.7)
    .slice(0, 3)
    .map((link) => ({
      id: `${link.from_note_id}--${note.id}--${link.type}`,
      from_note_id: link.from_note_id,
      to_note_id: note.id,
      type: link.type,
      reason: link.reason,
      confidence: Number(link.confidence),
      created_at: new Date().toISOString(),
    }))
    .filter((link) => !existingIds.has(link.id));

  for (const link of links) await writeNoteLink(link);
  for (const link of links) {
    await appendWikiLog({
      action: 'note_link.created',
      target: link.id,
      detail: `${link.type}: ${link.reason}`,
    });
  }
  if (links.length > 0) rebuildWikiIndex().catch((err) => console.warn('[index] rebuild after links failed:', err));
  return links;
}

async function attachConceptsAndCompileLater(
  noteId: string,
  titles: string[],
  opts: { awaitCompile?: boolean; evidence?: Array<{ note_id: string; reason: string }> } = {}
): Promise<void> {
  const touchedTitles = cleanTitles(titles);
  for (const title of touchedTitles) {
    await ensureConcept(title);
  }
  await updateNoteConcepts(noteId, touchedTitles);
  await appendWikiLog({
    action: 'note.concepts.updated',
    target: noteId,
    detail: touchedTitles.join(', '),
  });

  for (const t of touchedTitles) {
    await refreshConceptCount(t);
    if (opts.evidence && opts.evidence.length > 0) {
      const concept = await readConcept(t);
      if (concept) {
        const merged = mergeEvidence(concept.evidence || [], opts.evidence);
        await writeConcept({
          ...concept,
          evidence: merged,
          evidence_note_ids: Array.from(new Set([...(concept.evidence_note_ids || []), noteId])),
        });
      }
    }
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
  rebuildWikiIndex().catch((err) => console.warn('[index] rebuild after concepts failed:', err));
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

  const [allConcepts, prompts, purpose, analyses] = await Promise.all([
    listConcepts(),
    getSystemPrompts(),
    readPurpose(),
    Promise.all(notes.map((n) => readNoteAnalysis(n.id))),
  ]);
  const otherConcepts = allConcepts
    .filter((c) => c.title !== title)
    .map((c) => ({ title: c.title }));
  const existingEvidence = new Map((concept.evidence || []).map((e) => [e.note_id, e.reason]));
  const evidence = notes.map((n) => {
    const analysis = analyses.find((a): a is NoteAnalysis => a !== null && a.note_id === n.id);
    return {
      note_id: n.id,
      reason:
        existingEvidence.get(n.id) ||
        analysis?.candidate_concepts.find((c) => c.concept_title === title)?.reason ||
        analysis?.event_summary ||
        n.content.slice(0, 80),
    };
  });

  const result = await callJSON<CompileResult>({
    model: MODEL_SMART,
    system: prompts.COMPILE_SYSTEM,
    user: compileUser(concept, notes, otherConcepts, purpose.content, analyses.filter((a): a is NoteAnalysis => a !== null)),
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
    evidence_note_ids: notes.map((n) => n.id),
    evidence,
    note_count: notes.length,
    updated_at: new Date().toISOString(),
  });
  await appendWikiLog({ action: 'concept.compiled', target: title, detail: `${notes.length} notes` });
  rebuildWikiIndex().catch((err) => console.warn('[index] rebuild after concept compile failed:', err));

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

  const [prompts, purpose] = await Promise.all([getSystemPrompts(), readPurpose()]);
  const result = await callJSON<AskResult>({
    model: MODEL_SMART,
    system: prompts.ASK_SYSTEM,
    user: askUser(title, question, concept.synthesis ?? '', notes, purpose.content),
    maxTokens: 2000,
  });

  return { ...result, notes };
}

const PAGE_SIZE = 5;

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
  review_items: Array<ReviewItem & { note: Note | null }>;
  note_links_by_note_id: Record<string, Array<NoteLink & { from_note: Note | null; to_note: Note | null }>>;
}> {
  const [concepts, allNotes, people, reviewItems, links] = await Promise.all([
    listConcepts(),
    listNotes(),
    listPeople(),
    listReviewItems(),
    listNoteLinks(),
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
  const reviewNotes = await Promise.all(reviewItems.slice(0, 5).map((item) => readNote(item.note_id)));
  const visibleNoteIds = new Set(allNotes.slice(start, start + PAGE_SIZE).map((note) => note.id));
  const visibleLinks = links.filter(
    (link) => visibleNoteIds.has(link.from_note_id) || visibleNoteIds.has(link.to_note_id)
  );
  const visibleLinkNotes = await Promise.all(
    visibleLinks.flatMap((link) => [readNote(link.from_note_id), readNote(link.to_note_id)])
  );
  const note_links_by_note_id: Record<string, Array<NoteLink & { from_note: Note | null; to_note: Note | null }>> = {};
  visibleLinks.forEach((link, index) => {
    const enriched = {
      ...link,
      from_note: visibleLinkNotes[index * 2],
      to_note: visibleLinkNotes[index * 2 + 1],
    };
    for (const id of [link.from_note_id, link.to_note_id]) {
      if (!note_links_by_note_id[id]) note_links_by_note_id[id] = [];
      note_links_by_note_id[id].push(enriched);
    }
  });
  return {
    concepts: concepts.filter((c) => c.note_count > 0),
    recent_notes: allNotes.slice(start, start + PAGE_SIZE),
    people,
    tags,
    total_notes: allNotes.length,
    page,
    total_pages: Math.max(1, Math.ceil(allNotes.length / PAGE_SIZE)),
    insights: await getRecentInsightsFromData(allNotes, concepts, people, tags, reviewItems.length, links),
    review_items: reviewItems.slice(0, 5).map((item, index) => ({ ...item, note: reviewNotes[index] })),
    note_links_by_note_id,
  };
}

export async function getRecentInsights(): Promise<RecentInsights> {
  const [concepts, allNotes, people, reviewItems, links] = await Promise.all([
    listConcepts(),
    listNotes(),
    listPeople(),
    listReviewItems(),
    listNoteLinks(),
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
  return await getRecentInsightsFromData(allNotes, concepts, people, tags, reviewItems.length, links);
}

async function getRecentInsightsFromData(
  notes: Note[],
  concepts: Concept[],
  people: Awaited<ReturnType<typeof listPeople>>,
  tags: { name: string; count: number }[],
  reviewCount = 0,
  links: NoteLink[] = []
): Promise<RecentInsights> {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recent = notes.filter((n) => new Date(n.created_at).getTime() >= sevenDaysAgo);
  const recentConcepts = new Set(recent.flatMap((n) => n.concepts ?? []));
  const new_concepts = concepts
    .filter((c) => recentConcepts.has(c.title))
    .slice(0, 4)
    .map((c) => c.title);
  const oldEnough = notes.filter((n) => now - new Date(n.created_at).getTime() > 14 * 24 * 60 * 60 * 1000);

  const recentLinks = links
    .filter((link) => new Date(link.created_at).getTime() >= sevenDaysAgo)
    .filter((link) => link.type === 'validated' || link.type === 'outcome')
    .slice(0, 3);
  const linkNotes = await Promise.all(
    recentLinks.flatMap((link) => [readNote(link.from_note_id), readNote(link.to_note_id)])
  );
  const noteMap = new Map<string, Note | null>();
  recentLinks.forEach((link, index) => {
    noteMap.set(link.from_note_id, linkNotes[index * 2]);
    noteMap.set(link.to_note_id, linkNotes[index * 2 + 1]);
  });

  return {
    note_count_7d: recent.length,
    top_tags: tags.slice(0, 4),
    top_people: people.slice(0, 4).map((p) => ({ name: p.name, count: p.note_ids.length })),
    new_concepts,
    resurfaced_note: oldEnough[Math.floor(Math.min(oldEnough.length - 1, 2))] ?? null,
    review_count: reviewCount,
    recent_links: recentLinks.map((link) => ({
      ...link,
      from_note: noteMap.get(link.from_note_id) ?? null,
      to_note: noteMap.get(link.to_note_id) ?? null,
    })),
  };
}

export async function getEcho(content: string): Promise<EchoResult> {
  if (content.trim().length < 12) return { notes: [] };
  const concepts = await classifyDraftConcepts(content).catch((err) => {
    console.warn('[echo] classify draft failed:', err?.message ?? err);
    return [] as string[];
  });
  const ghost: Note = {
    id: '__draft__',
    content,
    created_at: new Date().toISOString(),
    concepts,
    tags: [],
  };
  return { notes: await findRelatedNotes(ghost, { limit: 3, excludeIds: [], preferConcepts: true }) };
}

async function classifyDraftConcepts(content: string): Promise<string[]> {
  const existing = await listConcepts();
  if (existing.length === 0) return [];
  const [prompts, purpose] = await Promise.all([getSystemPrompts(), readPurpose()]);
  const result = await callJSON<ClassifyResult>({
    model: MODEL_FAST,
    system: prompts.CLASSIFY_SYSTEM,
    user: classifyUser(`${purpose.content ? `洞察目标：${purpose.content}\n\n` : ''}${content}`, existing),
    maxTokens: 500,
  });
  return conceptTitlesFromMatches(applySubjectGuard(content, result));
}

export async function getInstantInsight(note: Note): Promise<InstantInsight> {
  const people = await listPeople();
  const possibleConcepts =
    (note.concepts ?? []).length > 0
      ? note.concepts ?? []
      : await classifyDraftConcepts(note.content).catch((err) => {
          console.warn(`[insight] classify note ${note.id} failed:`, err?.message ?? err);
          return [] as string[];
        });
  const noteForRelated = { ...note, concepts: possibleConcepts };
  return {
    note,
    tags: note.tags ?? [],
    people: people.filter((p) => p.note_ids.includes(note.id)).map((p) => p.name),
    possible_concepts: possibleConcepts,
    related_notes: await findRelatedNotes(noteForRelated, {
      limit: 3,
      excludeIds: [note.id],
      preferConcepts: true,
    }),
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
  const [concepts, people, prompts, purpose] = await Promise.all([
    listConcepts(),
    listPeople(),
    getSystemPrompts(),
    readPurpose(),
  ]);
  const filtered = prefilterNotes(allNotes, question, today, concepts, people);
  const result = await callJSON<GlobalAskResult>({
    model: MODEL_FAST,
    system: prompts.GLOBAL_ASK_SYSTEM,
    user: globalAskUser(question, filtered, todayStr, purpose.content),
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

function prefilterNotes(
  notes: Note[],
  question: string,
  today: Date,
  concepts: Concept[] = [],
  people: Awaited<ReturnType<typeof listPeople>> = []
): Note[] {
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

  const conceptHits = concepts.filter((c) => question.includes(c.title));
  if (conceptHits.length > 0) {
    const titles = new Set(conceptHits.flatMap((c) => [c.title, ...(c.related || [])]));
    const matched = notes.filter((n) => (n.concepts || []).some((c) => titles.has(c)));
    if (matched.length > 0) return matched.slice(0, 30);
  }

  const peopleHits = people.filter((p) => question.includes(p.name));
  if (peopleHits.length > 0) {
    const ids = new Set(peopleHits.flatMap((p) => p.note_ids));
    const matched = notes.filter((n) => ids.has(n.id));
    if (matched.length > 0) return matched.slice(0, 30);
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

export async function acceptReviewItem(id: string): Promise<{ ok: boolean; item: ReviewItem | null }> {
  const item = await readReviewItem(id);
  if (!item || item.dismissed) return { ok: false, item };
  const note = await readNote(item.note_id);
  if (!note) return { ok: false, item };
  const analysis = await readNoteAnalysis(note.id);
  await attachConceptsAndCompileLater(note.id, [item.suggestion], {
    evidence: analysis
      ? [{ note_id: note.id, reason: item.reason || analysis.event_summary }]
      : [{ note_id: note.id, reason: item.reason }],
  });
  await deleteReviewItem(id);
  await appendWikiLog({
    action: 'review.accepted',
    target: id,
    detail: `${note.id} -> ${item.suggestion}`,
  });
  rebuildWikiIndex().catch((err) => console.warn('[index] rebuild after review accept failed:', err));
  return { ok: true, item };
}

export async function dismissReviewItem(id: string): Promise<{ ok: boolean }> {
  await deleteReviewItem(id);
  await appendWikiLog({ action: 'review.dismissed', target: id });
  return { ok: true };
}

export async function deleteNoteEverywhere(id: string): Promise<{ ok: boolean; note: Note | null }> {
  const note = await readNote(id);
  if (!note) return { ok: false, note: null };

  const touchedConcepts = [...(note.concepts || [])];
  const people = await getPeopleForNote(id);

  await deleteNote(id);
  await Promise.all([
    ...people.map((person) => removeNoteIdFromPerson(person.name, id)),
    deleteReviewItemsForNote(id),
    deleteNoteLinksForNote(id),
  ]);

  for (const title of touchedConcepts) {
    const concept = await readConcept(title);
    if (!concept) continue;
    await writeConcept({
      ...concept,
      evidence_note_ids: (concept.evidence_note_ids || []).filter((noteId) => noteId !== id),
      evidence: (concept.evidence || []).filter((item) => item.note_id !== id),
    });
    await refreshConceptCount(title);
  }
  await appendWikiLog({ action: 'note.deleted', target: id, detail: note.content.slice(0, 80) });
  rebuildWikiIndex().catch((err) => console.warn('[index] rebuild after delete failed:', err));
  runHealthCheck().catch((err) => console.warn('[health] after delete failed:', err));

  return { ok: true, note };
}

export async function getEnrichedNoteLinks(noteId: string): Promise<Array<NoteLink & {
  from_note: Note | null;
  to_note: Note | null;
}>> {
  const links = (await listNoteLinks()).filter(
    (link) => link.from_note_id === noteId || link.to_note_id === noteId
  );
  const notes = await Promise.all(
    links.flatMap((link) => [readNote(link.from_note_id), readNote(link.to_note_id)])
  );
  return links.map((link, index) => ({
    ...link,
    from_note: notes[index * 2],
    to_note: notes[index * 2 + 1],
  }));
}

type RelatedOptions = {
  limit: number;
  excludeIds: string[];
  preferConcepts?: boolean;
};

async function findRelatedNotes(note: Note, opts: RelatedOptions): Promise<RelatedNote[]> {
  const [allNotes, people, concepts] = await Promise.all([listNotes(), listPeople(), listConcepts()]);
  const keywords = extractKeywords(note.content);
  const notePeople = new Set(
    people.filter((p) => p.note_ids.includes(note.id)).map((p) => p.name)
  );
  const noteConcepts = note.concepts ?? [];
  const relatedConceptMap = new Map(concepts.map((c) => [c.title, c.related || []]));
  const adjacentConcepts = new Set(noteConcepts.flatMap((title) => relatedConceptMap.get(title) || []));

  const scored = allNotes
    .filter((n) => !opts.excludeIds.includes(n.id))
    .map((candidate) => {
      const reasons: string[] = [];
      let score = 0;

      const sharedConcepts = (candidate.concepts ?? []).filter((c) => noteConcepts.includes(c));
      if (sharedConcepts.length > 0) {
        score += sharedConcepts.length * 20;
        reasons.push(`同属 ${sharedConcepts.slice(0, 2).join(' / ')}`);
      }

      const adjacent = (candidate.concepts ?? []).filter((c) => adjacentConcepts.has(c));
      if (adjacent.length > 0) {
        score += adjacent.length * 8;
        reasons.push(`相关主题 ${adjacent.slice(0, 2).join(' / ')}`);
      }

      const sharedTags = (candidate.tags ?? []).filter((t) => (note.tags ?? []).includes(t));
      if (sharedTags.length > 0) {
        score += sharedTags.length * 5;
        reasons.push(`标签 #${sharedTags.slice(0, 2).join(' #')}`);
      }

      const candidatePeople = people
        .filter((p) => p.note_ids.includes(candidate.id) && notePeople.has(p.name))
        .map((p) => p.name);
      if (candidatePeople.length > 0) {
        score += candidatePeople.length * 4;
        reasons.push(`提到 ${candidatePeople.slice(0, 2).join(' / ')}`);
      }

      const candidateKeywords = extractKeywords(candidate.content);
      const sharedKeywords = candidateKeywords.filter((kw) => keywords.includes(kw));
      if (sharedKeywords.length > 0 && !opts.preferConcepts) {
        const keywordScore = Math.min(sharedKeywords.length, opts.preferConcepts ? 2 : 5);
        score += keywordScore;
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
    .filter((item) => item.score > (opts.preferConcepts ? 3 : 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit);

  return scored.map(({ note, reason }) => ({ note, reason }));
}

function cleanTitles(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => (s || '').trim()).filter(Boolean)));
}

function analysisConceptTitles(
  analysis: NoteAnalysis,
  opts: { minConfidence: number }
): string[] {
  return cleanTitles(
    (analysis.candidate_concepts || [])
      .filter((c) => Number(c.confidence) >= opts.minConfidence)
      .map((c) => c.concept_title)
  );
}

function selectLinkCandidates(
  note: Note,
  analysis: NoteAnalysis,
  notes: Note[],
  analyses: NoteAnalysis[]
): Array<{ note: Note; analysis: NoteAnalysis | null }> {
  const now = new Date(note.created_at).getTime();
  const notePeople = new Set(analysis.object_people || []);
  const noteConcepts = new Set([
    ...(note.concepts || []),
    ...(analysis.candidate_concepts || []).map((c) => c.concept_title),
  ]);
  const noteTags = new Set(note.tags || []);

  return notes
    .filter((candidate) => candidate.id !== note.id)
    .filter((candidate) => new Date(candidate.created_at).getTime() < now)
    .map((candidate) => {
      const candidateAnalysis = analyses.find((a) => a.note_id === candidate.id) || null;
      const ageDays = (now - new Date(candidate.created_at).getTime()) / (24 * 60 * 60 * 1000);
      let score = Math.max(0, 14 - ageDays);

      const candidatePeople = new Set(candidateAnalysis?.object_people || []);
      for (const person of candidatePeople) if (notePeople.has(person)) score += 8;
      for (const concept of candidate.concepts || []) if (noteConcepts.has(concept)) score += 6;
      for (const tag of candidate.tags || []) if (noteTags.has(tag)) score += 4;

      const intent = candidateAnalysis?.intent || '';
      const content = candidate.content;
      if (/建议|计划|预期|目标|复盘|完成|改进|希望|应该|TODO|TO-DO/i.test(intent + content)) {
        score += 6;
      }
      if (/完成|达成|结果|有效|没效果|失败|验证|按计划/i.test(analysis.intent + note.content)) {
        score += 5;
      }

      return { note: candidate, analysis: candidateAnalysis, score };
    })
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score)
    .map(({ note, analysis }) => ({ note, analysis }));
}

function evidenceFromAnalysis(analysis: NoteAnalysis): Array<{ note_id: string; reason: string }> {
  const reason =
    analysis.candidate_concepts.find((c) => Number(c.confidence) >= 0.78)?.reason ||
    analysis.event_summary ||
    analysis.evidence.join(' / ');
  return [{ note_id: analysis.note_id, reason }];
}

function reviewCandidatesFromAnalysis(note: Note, analysis: NoteAnalysis): ReviewItem[] {
  const strong = analysisConceptTitles(analysis, { minConfidence: 0.78 });
  const uncertain = (analysis.candidate_concepts || []).filter(
    (c) => c.concept_title && Number(c.confidence) >= 0.55 && Number(c.confidence) < 0.78
  );
  const aboutOtherPerson =
    analysis.subject &&
    !/^user$|^用户$|^我$|^自己$/i.test(analysis.subject) &&
    (analysis.intent.includes('建议') || analysis.intent.toLowerCase().includes('advice'));
  const needsReview = uncertain.length > 0 || (strong.length > 0 && aboutOtherPerson);

  if (!needsReview) return [];

  const candidates = uncertain.length > 0
    ? uncertain
    : (analysis.candidate_concepts || []).filter((c) => strong.includes(c.concept_title));

  return candidates.slice(0, 3).map((candidate) => ({
    id: `${note.id}-${slugify(candidate.concept_title)}`,
    note_id: note.id,
    type: 'concept',
    suggestion: candidate.concept_title,
    reason: candidate.reason || analysis.event_summary,
    confidence: Number(candidate.confidence ?? analysis.confidence ?? 0),
    created_at: new Date().toISOString(),
  }));
}

function mergeEvidence(
  existing: Array<{ note_id: string; reason: string }>,
  incoming: Array<{ note_id: string; reason: string }>
): Array<{ note_id: string; reason: string }> {
  const map = new Map(existing.map((e) => [e.note_id, e.reason]));
  for (const item of incoming) map.set(item.note_id, item.reason);
  return Array.from(map.entries()).map(([note_id, reason]) => ({ note_id, reason }));
}

function slugify(input: string): string {
  return input.replace(/[/\\:*?"<>|\s]+/g, '-').slice(0, 80);
}

function conceptTitlesFromMatches(result: ClassifyResult): string[] {
  return cleanTitles(
    (result.matches || [])
      .filter((m) => Number(m.confidence) >= 0.7)
      .map((m) => m.concept_title)
  );
}

function applySubjectGuard(content: string, result: ClassifyResult): ClassifyResult {
  const aboutOtherPerson =
    /给\s*[\u4e00-\u9fffA-Za-z0-9_-]{1,24}\s*的(?:建议|要求|任务|计划)/.test(content) ||
    /(?:希望|让|要求|建议)\s*(?:他|她|ta|TA|孩子|儿子|女儿|同事|朋友|学生)/.test(content);
  const explicitSelfReflection =
    /我(?:自己|个人|发现自己|要求自己|给自己|对自己|需要|应该|必须|想要|焦虑|担心)/.test(content);

  if (!aboutOtherPerson || explicitSelfReflection) return result;

  return {
    matches: (result.matches || []).filter((match) => !/自我|自己|self/i.test(match.concept_title)),
  };
}

function noteMentionsName(content: string, name: string): boolean {
  if (!name) return false;
  return content.toLowerCase().includes(name.toLowerCase());
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '什么', '说过', '说了', '有没有', '关于', '的', '了', '吗', '呢', '么', '我',
    '你', '他', '她', '是', '在', '有', '和', '与', '都', '也', '不', '没', '会',
    '能', '想', '要', '就', '还', '很', '这', '那', '一个', '已经', '需要', '问题',
    '今天', '昨天', '明天', '现在', '最近', '事情', '下来', '然后', '类似', '制定',
    '计划', '完成', '不会', '不是', '是不', '这个', '这样', '那里', '这里', 'the', 'and', 'for',
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
