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
  evidence_note_ids: string[];
  evidence: Array<{ note_id: string; reason: string }>;
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

export type Purpose = {
  content: string;
  updated_at: string;
};

export type NoteAnalysis = {
  note_id: string;
  subject: string;
  object_people: string[];
  event_summary: string;
  emotion: string | null;
  intent: string;
  candidate_concepts: Array<{
    concept_title: string;
    confidence: number;
    is_new: boolean;
    reason: string;
  }>;
  evidence: string[];
  confidence: number;
  updated_at: string;
};

export type AnalyzeNoteResult = Omit<NoteAnalysis, 'note_id' | 'updated_at'>;

export type ReviewItem = {
  id: string;
  note_id: string;
  type: 'concept';
  suggestion: string;
  reason: string;
  confidence: number;
  created_at: string;
  dismissed?: boolean;
};

export type NoteLinkType = 'follow_up' | 'outcome' | 'validated' | 'contradicts';

export type NoteLink = {
  id: string;
  from_note_id: string;
  to_note_id: string;
  type: NoteLinkType;
  reason: string;
  confidence: number;
  created_at: string;
};

export type DetectNoteLinksResult = {
  links: Array<{
    from_note_id: string;
    type: NoteLinkType;
    reason: string;
    confidence: number;
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
  review_count: number;
  recent_links: Array<NoteLink & { from_note: Note | null; to_note: Note | null }>;
};
