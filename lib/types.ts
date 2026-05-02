export type Note = {
  id: string; // filename stem, e.g. "240324-235012-a1b2"
  content: string;
  created_at: string; // ISO
  concepts: string[]; // concept titles this note belongs to
  tags: string[];     // user-editable + auto-generated labels
};

export type Concept = {
  title: string; // also the filename stem
  synthesis: string | null;
  patterns: string[];
  contradictions: string[];
  evolution: string | null;
  related: string[];
  note_count: number;
  updated_at: string;
};

export type Person = {
  name: string;
  note_ids: string[];
  updated_at: string;
};

export type ExtractPeopleResult = {
  people: string[];
};

export type ExtractTagsResult = {
  tags: string[];
};

export type ClassifyResult = {
  matches: Array<{
    concept_title: string;
    confidence: number;
    is_new: boolean;
  }>;
};

export type CompileResult = {
  synthesis: string;
  patterns: string[];
  contradictions: string[];
  evolution: string | null;
  related: string[];
};

export type AskResult = {
  answer: string;
  what_you_havent_written: string[];
  follow_ups: string[];
};

export type GlobalAskResult = {
  answer: string;
  relevant_note_ids: number[]; // 1-indexed，对应传入 notes 的顺序
  follow_ups: string[];
};

export type RelatedNote = {
  note: Note;
  reason: string;
};

export type InstantInsight = {
  note: Note;
  tags: string[];
  people: string[];
  possible_concepts: string[];
  related_notes: RelatedNote[];
};

export type EchoResult = {
  notes: RelatedNote[];
};

export type RecentInsights = {
  note_count_7d: number;
  top_tags: Array<{ name: string; count: number }>;
  top_people: Array<{ name: string; count: number }>;
  new_concepts: string[];
  resurfaced_note: Note | null;
};
