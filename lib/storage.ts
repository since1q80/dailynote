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
import matter from 'gray-matter';
import type { Note, Concept, Person } from './types';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const NOTES_DIR = path.join(DATA_DIR, 'notes');
const CONCEPTS_DIR = path.join(DATA_DIR, 'concepts');
const PEOPLE_DIR = path.join(DATA_DIR, 'people');

async function ensureDirs(): Promise<void> {
  await fs.mkdir(NOTES_DIR, { recursive: true });
  await fs.mkdir(CONCEPTS_DIR, { recursive: true });
  await fs.mkdir(PEOPLE_DIR, { recursive: true });
}

// ─────────── note id & 文件名 ───────────

function nowId(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
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
  const created_at = new Date().toISOString();
  const fm = {
    id,
    created_at,
    concepts: [] as string[],
    tags: [] as string[],
  };
  const body = matter.stringify(content.trim() + '\n', fm);
  await fs.writeFile(path.join(NOTES_DIR, `${id}.md`), body, 'utf8');
  return { id, content: content.trim(), created_at, concepts: [], tags: [] };
}

export async function readNote(id: string): Promise<Note | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(NOTES_DIR, `${id}.md`), 'utf8');
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
  const files = await fs.readdir(NOTES_DIR);
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
  await fs.writeFile(path.join(NOTES_DIR, `${note.id}.md`), body, 'utf8');
}

export async function updateNoteConcepts(id: string, concepts: string[]): Promise<void> {
  const note = await readNote(id);
  if (!note) return;
  await writeNoteFile({ ...note, concepts: cleanList(concepts) });
}

export async function updateNoteTags(id: string, tags: string[]): Promise<void> {
  const note = await readNote(id);
  if (!note) return;
  await writeNoteFile({ ...note, tags: cleanList(tags) });
}

export async function updateNoteContent(id: string, content: string): Promise<Note | null> {
  const note = await readNote(id);
  if (!note) return null;
  const updated = { ...note, content: content.trim() };
  await writeNoteFile(updated);
  return updated;
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
  note_count: number;
  updated_at: string;
};

export async function readConcept(title: string): Promise<Concept | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(CONCEPTS_DIR, conceptFilename(title)), 'utf8');
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
    note_count: c.note_count,
    updated_at: c.updated_at,
  };
  // 正文就是 synthesis，这样 Obsidian 打开直接就看到有用的东西
  const body = matter.stringify((c.synthesis || '').trim() + '\n', fm);
  await fs.writeFile(path.join(CONCEPTS_DIR, conceptFilename(c.title)), body, 'utf8');
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
    note_count: 0,
    updated_at: new Date().toISOString(),
  };
  await writeConcept(c);
  return c;
}

export async function listConcepts(): Promise<Concept[]> {
  await ensureDirs();
  const files = await fs.readdir(CONCEPTS_DIR);
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
  c.updated_at = new Date().toISOString();
  await writeConcept(c);
  return notes.length;
}

// ─────────── people ───────────

function personFilename(name: string): string {
  const safe = name.replace(/[/\\:*?"<>|]/g, '_').trim();
  return `${safe}.md`;
}

export async function readPerson(name: string): Promise<Person | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(path.join(PEOPLE_DIR, personFilename(name)), 'utf8');
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
  await fs.writeFile(path.join(PEOPLE_DIR, personFilename(p.name)), body, 'utf8');
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
    await fs.rm(path.join(PEOPLE_DIR, personFilename(name)), { force: true });
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
  const files = await fs.readdir(PEOPLE_DIR);
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

const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');

type PromptStore = Record<string, Record<string, string>>;

async function readPromptStore(): Promise<PromptStore> {
  try {
    const raw = await fs.readFile(PROMPTS_FILE, 'utf-8');
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
  await fs.writeFile(PROMPTS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}
