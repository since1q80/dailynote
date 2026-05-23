/**
 * storage.ts — 用 markdown 文件做持久化
 *
 * 数据目录（默认 ./data，可通过 DATA_DIR 环境变量改）：
 *   data/
 *     notes/<id>.md         — 每条笔记一个文件，frontmatter 存元数据
 *     concepts/<title>.md   — 每个概念一个文件
 *
 * 这样 data/ 目录可以直接用 Obsidian/VSCode 打开，
 * 也可以 git 同步或 iCloud/Dropbox 同步。
 *
 * 性能假设：个人使用 <5000 条笔记，全量读硬盘完全 OK。
 * 真要扩展的时候加个索引缓存就行。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import matter from 'gray-matter';
import type {
  Note,
  Concept,
  Person,
  Purpose,
  NoteAnalysis,
  NoteProcessingStatus,
  ReviewItem,
  NoteLink,
  WikiLogEntry,
  HealthReport,
  HealthIssue,
} from './types';

function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function notesDir(): string {
  return path.join(dataDir(), 'notes');
}

function conceptsDir(): string {
  return path.join(dataDir(), 'concepts');
}

function peopleDir(): string {
  return path.join(dataDir(), 'people');
}

function analysisDir(): string {
  return path.join(dataDir(), 'analysis');
}

function processingDir(): string {
  return path.join(dataDir(), 'processing');
}

function reviewQueueDir(): string {
  return path.join(dataDir(), 'review-queue');
}

function noteLinksDir(): string {
  return path.join(dataDir(), 'note-links');
}

function purposeFile(): string {
  return path.join(dataDir(), 'purpose.md');
}

function indexFile(): string {
  return path.join(dataDir(), 'index.md');
}

function logFile(): string {
  return path.join(dataDir(), 'log.md');
}

function healthFile(): string {
  return path.join(dataDir(), 'health.md');
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(notesDir(), { recursive: true });
  await fs.mkdir(conceptsDir(), { recursive: true });
  await fs.mkdir(peopleDir(), { recursive: true });
  await fs.mkdir(analysisDir(), { recursive: true });
  await fs.mkdir(processingDir(), { recursive: true });
  await fs.mkdir(reviewQueueDir(), { recursive: true });
  await fs.mkdir(noteLinksDir(), { recursive: true });
}

// ─────────── note id & 文件名 ───────────

// Simple in-memory mutex for write operations
const writeLocks = new Map<string, Promise<void>>();

async function acquireLock(key: string): Promise<() => void> {
  while (writeLocks.has(key)) {
    await writeLocks.get(key);
  }
  // Create a promise that resolves when released
  let release: () => void;
  const lock = new Promise<void>((resolve) => { release = resolve; });
  writeLocks.set(key, lock);
  return () => {
    writeLocks.delete(key);
    release!();
  };
}

function nowId(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  // Use crypto.randomBytes for better entropy: 3 bytes = 24 bits ≈ 16M combinations
  const rand = randomBytes(3).toString('hex').slice(0, 4);
  return `${ymd}-${hms}-${rand}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// 概念标题 → 安全文件名
function conceptFilename(title: string): string {
  // 保留中文，替换文件系统不安全字符
  const safe = title.replace(/[/\\:*?"<>|]/g, '_').trim();
  return `${safe}.md`;
}

// ─────────── notes ───────────

export async function writeNote(content: string): Promise<Note> {
  await ensureDirs();
  const id = nowId();
  const release = await acquireLock(`note:${id}`);
  try {
    const created_at = new Date().toISOString();
    const fm = {
      id,
      created_at,
      concepts: [] as string[],
      tags: [] as string[],
    };
    const body = matter.stringify(content.trim() + '\n', fm);
    await fs.writeFile(path.join(notesDir(), `${id}.md`), body, 'utf8');
    return { id, content: content.trim(), created_at, concepts: [], tags: [] };
  } finally {
    release();
  }
}

export async function readNote(id: string): Promise<Note | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(notesDir(), `${id}.md`), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<Note>;
    return {
      id,
      content: parsed.content.trim(),
      created_at: fm.created_at || new Date(0).toISOString(),
      concepts: fm.concepts || [],
      tags: fm.tags || [],
    };
  } catch {
    return null;
  }
}

export async function listNotes(): Promise<Note[]> {
  await ensureDirs();
  const files = await fs.readdir(notesDir());
  const notes = await Promise.all(
    files
      .filter((f) => f.endsWith('.md'))
      .map((f) => readNote(f.replace(/\.md$/, '')))
  );
  return notes
    .filter((n): n is Note => n !== null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

async function writeNoteFile(note: Note): Promise<void> {
  const fm = {
    id: note.id,
    created_at: note.created_at,
    concepts: note.concepts,
    tags: note.tags,
  };
  const body = matter.stringify(note.content + '\n', fm);
  await fs.writeFile(path.join(notesDir(), `${note.id}.md`), body, 'utf8');
}

export async function updateNoteConcepts(id: string, concepts: string[]): Promise<void> {
  const release = await acquireLock(`note:${id}`);
  try {
    const note = await readNote(id);
    if (!note) return;
    await writeNoteFile({ ...note, concepts: cleanList(concepts) });
  } finally {
    release();
  }
}

export async function updateNoteTags(id: string, tags: string[]): Promise<void> {
  const release = await acquireLock(`note:${id}`);
  try {
    const note = await readNote(id);
    if (!note) return;
    await writeNoteFile({ ...note, tags: cleanList(tags) });
  } finally {
    release();
  }
}

export async function updateNoteContent(id: string, content: string): Promise<Note | null> {
  const release = await acquireLock(`note:${id}`);
  try {
    const note = await readNote(id);
    if (!note) return null;
    const updated = { ...note, content: content.trim() };
    await writeNoteFile(updated);
    return updated;
  } finally {
    release();
  }
}

export async function deleteNote(id: string): Promise<Note | null> {
  const note = await readNote(id);
  if (!note) return null;
  await fs.rm(path.join(notesDir(), `${id}.md`), { force: true });
  await fs.rm(path.join(analysisDir(), `${id}.md`), { force: true });
  await fs.rm(path.join(processingDir(), `${id}.md`), { force: true });
  return note;
}

export async function getNotesForConcept(title: string): Promise<Note[]> {
  const all = await listNotes();
  return all.filter((n) => n.concepts.includes(title));
}

export async function getNotesForTag(tag: string): Promise<Note[]> {
  const all = await listNotes();
  return all.filter((n) => (n.tags ?? []).includes(tag));
}

function cleanList(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));
}

// ─────────── concepts ───────────

type ConceptFrontmatter = {
  title: string;
  synthesis: string | null;
  patterns: unknown[];
  contradictions: string[];
  evolution: string | null;
  related: string[];
  evidence_note_ids: string[];
  evidence: Array<{ note_id: string; reason: string }>;
  note_count: number;
  updated_at: string;
};

export async function readConcept(title: string): Promise<Concept | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(conceptsDir(), conceptFilename(title)), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<ConceptFrontmatter>;
    return {
      title: fm.title || title,
      synthesis: fm.synthesis ?? (parsed.content.trim() || null),
      patterns: (fm.patterns || []).map((p: unknown) =>
        typeof p === 'string' ? p : (p as Record<string, string>).pattern ?? ''
      ).filter(Boolean),
      contradictions: fm.contradictions || [],
      evolution: fm.evolution ?? null,
      related: fm.related || [],
      evidence_note_ids: fm.evidence_note_ids || [],
      evidence: fm.evidence || [],
      note_count: fm.note_count ?? 0,
      updated_at: fm.updated_at || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeConcept(c: Concept): Promise<void> {
  await ensureDirs();
  const fm: ConceptFrontmatter = {
    title: c.title,
    synthesis: c.synthesis,
    patterns: c.patterns,
    contradictions: c.contradictions,
    evolution: c.evolution,
    related: c.related,
    evidence_note_ids: c.evidence_note_ids || [],
    evidence: c.evidence || [],
    note_count: c.note_count,
    updated_at: c.updated_at,
  };
  // 正文就是 synthesis，这样 Obsidian 打开直接就看到有用的东西
  const body = matter.stringify((c.synthesis || '').trim() + '\n', fm);
  await fs.writeFile(path.join(conceptsDir(), conceptFilename(c.title)), body, 'utf8');
}

export async function ensureConcept(title: string): Promise<Concept> {
  const existing = await readConcept(title);
  if (existing) return existing;
  const c: Concept = {
    title,
    synthesis: null,
    patterns: [],
    contradictions: [],
    evolution: null,
    related: [],
    evidence_note_ids: [],
    evidence: [],
    note_count: 0,
    updated_at: new Date().toISOString(),
  };
  await writeConcept(c);
  return c;
}

export async function listConcepts(): Promise<Concept[]> {
  await ensureDirs();
  const files = await fs.readdir(conceptsDir());
  const concepts = await Promise.all(
    files
      .filter((f) => f.endsWith('.md'))
      .map((f) => readConcept(decodeURIComponent(f.replace(/\.md$/, ''))))
  );
  return concepts
    .filter((c): c is Concept => c !== null)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

/** 根据 notes 里实际的 concepts 归属，刷新某个概念的 note_count */
export async function refreshConceptCount(title: string): Promise<number> {
  const notes = await getNotesForConcept(title);
  const c = await readConcept(title);
  if (!c) return 0;
  c.note_count = notes.length;
  c.evidence_note_ids = notes.map((n) => n.id);
  c.updated_at = new Date().toISOString();
  await writeConcept(c);
  return notes.length;
}

// ── Purpose ────────────────────────────────────────────────────────────────

export async function readPurpose(): Promise<Purpose> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(purposeFile(), 'utf8');
    const parsed = matter(raw);
    return {
      content: parsed.content.trim(),
      updated_at: parsed.data.updated_at || new Date(0).toISOString(),
    };
  } catch {
    return { content: '', updated_at: new Date(0).toISOString() };
  }
}

export async function writePurpose(content: string): Promise<Purpose> {
  await ensureDirs();
  const purpose = { content: content.trim(), updated_at: new Date().toISOString() };
  const body = matter.stringify(`${purpose.content}\n`, { updated_at: purpose.updated_at });
  await fs.writeFile(purposeFile(), body, 'utf8');
  return purpose;
}

// ── Note analysis ──────────────────────────────────────────────────────────

export async function readNoteAnalysis(noteId: string): Promise<NoteAnalysis | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(analysisDir(), `${noteId}.md`), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<NoteAnalysis>;
    return {
      note_id: fm.note_id || noteId,
      subject: fm.subject || '',
      object_people: fm.object_people || [],
      event_summary: fm.event_summary || parsed.content.trim(),
      emotion: fm.emotion ?? null,
      intent: fm.intent || '',
      candidate_concepts: fm.candidate_concepts || [],
      evidence: fm.evidence || [],
      confidence: Number(fm.confidence ?? 0),
      updated_at: fm.updated_at || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeNoteAnalysis(analysis: NoteAnalysis): Promise<void> {
  await ensureDirs();
  const body = matter.stringify(`${analysis.event_summary || ''}\n`, analysis);
  await fs.writeFile(path.join(analysisDir(), `${analysis.note_id}.md`), body, 'utf8');
}

export async function listNoteAnalyses(): Promise<NoteAnalysis[]> {
  await ensureDirs();
  const files = await fs.readdir(analysisDir());
  const analyses = await Promise.all(
    files
      .filter((f) => f.endsWith('.md'))
      .map((f) => readNoteAnalysis(f.replace(/\.md$/, '')))
  );
  return analyses.filter((a): a is NoteAnalysis => a !== null);
}

// ── Note processing status ──────────────────────────────────────────────────

export async function readNoteProcessingStatus(noteId: string): Promise<NoteProcessingStatus | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(processingDir(), `${noteId}.md`), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<NoteProcessingStatus>;
    return {
      note_id: fm.note_id || noteId,
      status: fm.status || 'processing',
      message: fm.message || parsed.content.trim() || undefined,
      tags: fm.tags || [],
      people: fm.people || [],
      concepts: fm.concepts || [],
      related_notes: fm.related_notes || [],
      updated_at: fm.updated_at || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeNoteProcessingStatus(
  status: NoteProcessingStatus
): Promise<NoteProcessingStatus> {
  await ensureDirs();
  const next = { ...status, updated_at: status.updated_at || new Date().toISOString() };
  const body = matter.stringify(`${next.message || ''}\n`, next);
  await fs.writeFile(path.join(processingDir(), `${next.note_id}.md`), body, 'utf8');
  return next;
}

// ── Review queue ───────────────────────────────────────────────────────────

function reviewFilename(id: string): string {
  const safe = id.replace(/[/\\:*?"<>|]/g, '_').trim();
  return `${safe}.md`;
}

export async function writeReviewItem(item: ReviewItem): Promise<void> {
  await ensureDirs();
  const body = matter.stringify(`${item.reason || ''}\n`, item);
  await fs.writeFile(path.join(reviewQueueDir(), reviewFilename(item.id)), body, 'utf8');
}

export async function readReviewItem(id: string): Promise<ReviewItem | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(reviewQueueDir(), reviewFilename(id)), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<ReviewItem>;
    return {
      id: fm.id || id,
      note_id: fm.note_id || '',
      type: fm.type || 'concept',
      suggestion: fm.suggestion || '',
      reason: fm.reason || parsed.content.trim(),
      confidence: Number(fm.confidence ?? 0),
      created_at: fm.created_at || new Date(0).toISOString(),
      dismissed: Boolean(fm.dismissed),
    };
  } catch {
    return null;
  }
}

export async function listReviewItems(): Promise<ReviewItem[]> {
  await ensureDirs();
  const files = await fs.readdir(reviewQueueDir());
  const items = await Promise.all(
    files
      .filter((f) => f.endsWith('.md'))
      .map((f) => readReviewItem(f.replace(/\.md$/, '')))
  );
  return items
    .filter((item): item is ReviewItem => item !== null)
    .filter((item) => !item.dismissed)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function deleteReviewItem(id: string): Promise<void> {
  await fs.rm(path.join(reviewQueueDir(), reviewFilename(id)), { force: true });
}

export async function deleteReviewItemsForNote(noteId: string): Promise<number> {
  const items = await listReviewItems();
  const targets = items.filter((item) => item.note_id === noteId);
  await Promise.all(targets.map((item) => deleteReviewItem(item.id)));
  return targets.length;
}

// ── Note links ─────────────────────────────────────────────────────────────

function noteLinkFilename(id: string): string {
  const safe = id.replace(/[/\\:*?"<>|]/g, '_').trim();
  return `${safe}.md`;
}

export async function writeNoteLink(link: NoteLink): Promise<void> {
  await ensureDirs();
  const body = matter.stringify(`${link.reason || ''}\n`, link);
  await fs.writeFile(path.join(noteLinksDir(), noteLinkFilename(link.id)), body, 'utf8');
}

export async function readNoteLink(id: string): Promise<NoteLink | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(noteLinksDir(), noteLinkFilename(id)), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<NoteLink>;
    return {
      id: fm.id || id,
      from_note_id: fm.from_note_id || '',
      to_note_id: fm.to_note_id || '',
      type: fm.type || 'follow_up',
      reason: fm.reason || parsed.content.trim(),
      confidence: Number(fm.confidence ?? 0),
      created_at: fm.created_at || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function listNoteLinks(): Promise<NoteLink[]> {
  await ensureDirs();
  const files = await fs.readdir(noteLinksDir());
  const links = await Promise.all(
    files
      .filter((f) => f.endsWith('.md'))
      .map((f) => readNoteLink(f.replace(/\.md$/, '')))
  );
  return links
    .filter((link): link is NoteLink => link !== null)
    .filter((link) => link.from_note_id && link.to_note_id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getNoteLinksForNote(noteId: string): Promise<NoteLink[]> {
  const links = await listNoteLinks();
  return links.filter((link) => link.from_note_id === noteId || link.to_note_id === noteId);
}

export async function deleteNoteLink(id: string): Promise<void> {
  await fs.rm(path.join(noteLinksDir(), noteLinkFilename(id)), { force: true });
}

export async function deleteNoteLinksForNote(noteId: string): Promise<number> {
  const links = await getNoteLinksForNote(noteId);
  await Promise.all(links.map((link) => deleteNoteLink(link.id)));
  return links.length;
}

// ─────────── people ───────────

function personFilename(name: string): string {
  const safe = name.replace(/[/\\:*?"<>|]/g, '_').trim();
  return `${safe}.md`;
}

export async function readPerson(name: string): Promise<Person | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(peopleDir(), personFilename(name)), 'utf8');
    const fm = matter(raw).data as Partial<Person>;
    return {
      name: fm.name || name,
      note_ids: fm.note_ids || [],
      updated_at: fm.updated_at || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writePerson(p: Person): Promise<void> {
  await ensureDirs();
  const body = matter.stringify('', {
    name: p.name,
    note_ids: p.note_ids,
    updated_at: p.updated_at,
  });
  await fs.writeFile(path.join(peopleDir(), personFilename(p.name)), body, 'utf8');
}

export async function addNoteIdToPerson(name: string, noteId: string): Promise<void> {
  const existing = await readPerson(name);
  const note_ids = existing ? existing.note_ids : [];
  if (note_ids.includes(noteId)) return;
  await writePerson({
    name,
    note_ids: [...note_ids, noteId],
    updated_at: new Date().toISOString(),
  });
}

export async function removeNoteIdFromPerson(name: string, noteId: string): Promise<void> {
  const existing = await readPerson(name);
  if (!existing) return;
  const note_ids = existing.note_ids.filter((id) => id !== noteId);
  if (note_ids.length === 0) {
    await fs.rm(path.join(peopleDir(), personFilename(name)), { force: true });
    return;
  }
  await writePerson({ ...existing, note_ids, updated_at: new Date().toISOString() });
}

export async function getPeopleForNote(noteId: string): Promise<Person[]> {
  const people = await listPeople();
  return people.filter((p) => p.note_ids.includes(noteId));
}

export async function listPeople(): Promise<Person[]> {
  await ensureDirs();
  const files = await fs.readdir(peopleDir());
  const people = await Promise.all(
    files
      .filter((f) => f.endsWith('.md'))
      .map((f) => readPerson(decodeURIComponent(f.replace(/\.md$/, ''))))
  );
  return people
    .filter((p): p is Person => p !== null)
    .filter((p) => p.note_ids.length > 0)
    .sort((a, b) => b.note_ids.length - a.note_ids.length);
}

export async function getNotesForPerson(name: string): Promise<Note[]> {
  const person = await readPerson(name);
  if (!person) return [];
  const notes = await Promise.all(person.note_ids.map((id) => readNote(id)));
  return notes
    .filter((n): n is Note => n !== null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// ── Prompt overrides ────────────────────────────────────────────────────────

function promptsFile(): string {
  return path.join(dataDir(), 'prompts.json');
}

type PromptStore = Record<string, Record<string, string>>;

async function readPromptStore(): Promise<PromptStore> {
  try {
    const raw = await fs.readFile(promptsFile(), 'utf-8');
    const data = JSON.parse(raw);
    // Migrate old flat format (all-zh) to new per-lang format
    if (!data.zh && !data.en) return { zh: data, en: {} };
    return data as PromptStore;
  } catch {
    return { zh: {}, en: {} };
  }
}

export async function readPromptOverrides(lang: string): Promise<Record<string, string>> {
  const store = await readPromptStore();
  return store[lang] ?? {};
}

export async function writePromptOverrides(lang: string, overrides: Record<string, string>): Promise<void> {
  const store = await readPromptStore();
  store[lang] = overrides;
  await ensureDirs();
  await fs.writeFile(promptsFile(), JSON.stringify(store, null, 2), 'utf-8');
}

// ── Wiki index / log / health ──────────────────────────────────────────────

export async function appendWikiLog(entry: Omit<WikiLogEntry, 'created_at'>): Promise<void> {
  await ensureDirs();
  const item: WikiLogEntry = { ...entry, created_at: new Date().toISOString() };
  const line = `- ${formatDateTime(item.created_at)} · ${item.action}${item.target ? ` · ${item.target}` : ''}${item.detail ? ` — ${item.detail}` : ''}\n`;
  try {
    await fs.appendFile(logFile(), line, 'utf8');
  } catch {
    await fs.writeFile(logFile(), `# DailyNote Log\n\n${line}`, 'utf8');
  }
}

export async function rebuildWikiIndex(): Promise<string> {
  const [purpose, notes, concepts, people, links, reviews] = await Promise.all([
    readPurpose(),
    listNotes(),
    listConcepts(),
    listPeople(),
    listNoteLinks(),
    listReviewItems(),
  ]);
  const updated = new Date().toISOString();
  const topConcepts = concepts.filter((c) => c.note_count > 0).slice(0, 20);
  const topPeople = people.slice(0, 20);
  const recentLinks = links.slice(0, 10);
  const recentNotes = notes.slice(0, 10);
  const body = `# DailyNote Index

Updated: ${formatDateTime(updated)}

## Purpose

${purpose.content || '_No insight purpose set yet._'}

## Stats

- Notes: ${notes.length}
- Concepts: ${concepts.filter((c) => c.note_count > 0).length}
- People: ${people.length}
- Note links: ${links.length}
- Pending reviews: ${reviews.length}

## Concepts

${topConcepts.map((c) => `- [[concepts/${c.title}.md|${c.title}]] · ${c.note_count} notes${c.synthesis ? ` — ${truncate(c.synthesis, 120)}` : ''}`).join('\n') || '_No concepts yet._'}

## People

${topPeople.map((p) => `- [[people/${p.name}.md|${p.name}]] · ${p.note_ids.length} notes`).join('\n') || '_No people yet._'}

## Recent Note Links

${recentLinks.map((link) => `- ${link.type}: [[notes/${link.from_note_id}.md|${link.from_note_id}]] → [[notes/${link.to_note_id}.md|${link.to_note_id}]] — ${truncate(link.reason, 140)}`).join('\n') || '_No note links yet._'}

## Recent Notes

${recentNotes.map((note) => `- ${formatDateTime(note.created_at)} · [[notes/${note.id}.md|${note.id}]] — ${truncate(note.content, 120)}`).join('\n') || '_No notes yet._'}
`;
  await ensureDirs();
  await fs.writeFile(indexFile(), body, 'utf8');
  return body;
}

export async function runHealthCheck(): Promise<HealthReport> {
  const [notes, concepts, people, links, reviews, analyses] = await Promise.all([
    listNotes(),
    listConcepts(),
    listPeople(),
    listNoteLinks(),
    listReviewItems(),
    listNoteAnalyses(),
  ]);
  const noteIds = new Set(notes.map((n) => n.id));
  const issues: HealthIssue[] = [];

  for (const concept of concepts) {
    const actualCount = notes.filter((note) => (note.concepts || []).includes(concept.title)).length;
    if (concept.note_count > 0 && actualCount === 0) {
      issues.push({
        type: 'orphan_concept',
        severity: 'warning',
        title: `孤儿主题：${concept.title}`,
        detail: '主题记录了笔记数量，但当前没有任何 note 指向它。',
        target: concept.title,
      });
    }
    if (concept.note_count !== actualCount) {
      issues.push({
        type: 'concept_count_mismatch',
        severity: 'warning',
        title: `主题计数不一致：${concept.title}`,
        detail: `frontmatter 是 ${concept.note_count}，实际是 ${actualCount}。`,
        target: concept.title,
      });
    }
    if (actualCount > 0 && (concept.evidence || []).length === 0) {
      issues.push({
        type: 'missing_evidence',
        severity: 'info',
        title: `主题缺少证据：${concept.title}`,
        detail: '这个主题有 notes，但还没有 evidence；重新分析后会补上。',
        target: concept.title,
      });
    }
  }

  for (const link of links) {
    if (!noteIds.has(link.from_note_id) || !noteIds.has(link.to_note_id)) {
      issues.push({
        type: 'broken_note_link',
        severity: 'error',
        title: '断开的 note link',
        detail: `${link.from_note_id} → ${link.to_note_id}`,
        target: link.id,
      });
    }
  }

  for (const person of people) {
    const missing = person.note_ids.filter((id) => !noteIds.has(id));
    if (missing.length > 0) {
      issues.push({
        type: 'broken_people_link',
        severity: 'warning',
        title: `人物引用了不存在的 note：${person.name}`,
        detail: missing.join(', '),
        target: person.name,
      });
    }
  }

  const analysisIds = new Set(analyses.map((a) => a.note_id));
  for (const note of notes) {
    const analysis = analyses.find((a) => a.note_id === note.id);
    if (!analysis) continue;
    if (new Date(analysis.updated_at).getTime() < new Date(note.created_at).getTime()) {
      issues.push({
        type: 'stale_analysis',
        severity: 'info',
        title: '分析可能过期',
        detail: `${note.id} 的 analysis 早于 note 创建时间。`,
        target: note.id,
      });
    }
  }
  for (const review of reviews) {
    if (review.note_id && !noteIds.has(review.note_id)) {
      issues.push({
        type: 'pending_review',
        severity: 'warning',
        title: '待确认项引用了不存在的 note',
        detail: `${review.id} → ${review.note_id}`,
        target: review.id,
      });
    }
  }

  const report: HealthReport = {
    generated_at: new Date().toISOString(),
    issues,
    stats: {
      notes: notes.length,
      concepts: concepts.filter((c) => c.note_count > 0).length,
      people: people.length,
      note_links: links.length,
      pending_reviews: reviews.length,
    },
  };
  await writeHealthReport(report);
  return report;
}

async function writeHealthReport(report: HealthReport): Promise<void> {
  const body = `# DailyNote Health

Generated: ${formatDateTime(report.generated_at)}

## Stats

- Notes: ${report.stats.notes}
- Concepts: ${report.stats.concepts}
- People: ${report.stats.people}
- Note links: ${report.stats.note_links}
- Pending reviews: ${report.stats.pending_reviews}

## Issues

${report.issues.map((issue) => `- [${issue.severity}] ${issue.title}${issue.target ? ` (${issue.target})` : ''}: ${issue.detail}`).join('\n') || '_No issues found._'}
`;
  await ensureDirs();
  await fs.writeFile(healthFile(), body, 'utf8');
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncate(text: string, max: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}
