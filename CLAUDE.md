# DailyNote Project Guide

## Project Overview
DailyNote is a personal AI-powered wiki/note-taking app that lets knowledge structures emerge organically from daily writing. Built with Next.js 14 + Electron for Mac desktop.

## Tech Stack
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Desktop:** Electron 41, bundled via electron-builder
- **Storage:** Markdown files with gray-matter frontmatter (./data/ directory)
- **AI:** OpenAI API (GPT-4) for note analysis, concept classification, concept compilation, Q&A, and more
- **UI conventions:** Defined in `lib/ui.tsx`

## Architecture

### Data Model (lib/types.ts)
- **Note** — individual note with id, content, concepts, tags
- **Concept** — emergent knowledge categories with synthesis, patterns, contradictions, evolution, related concepts, evidence
- **Person** — entities mentioned across notes
- **Purpose** — user's insight goal
- **NoteAnalysis** — LLM-generated analysis of each note (subject, people, concepts, intent, emotion)
- **ReviewItem** — human-in-the-loop concept suggestions needing confirmation
- **NoteLink** — typed relationships between notes (follow_up, outcome, validated, contradicts)
- **HealthReport/HealthIssue** — system health monitoring

### Key Modules
- `lib/storage.ts` — File-based persistence layer. All data stored as markdown files in DATA_DIR (notes/, concepts/, people/, analysis/, review-queue/, note-links/). Supports Obsidian/VSCode direct access.
- `lib/compile.ts` — Orchestration layer. saveNote() writes file then fire-and-forgets analysis; compileConcept() regenerates synthesis; askAboutConcept() does synchronous Q&A; plus findRelatedNotes, auto-tagging, auto-linking, global Q&A, and health checks.
- `lib/openai.ts` — OpenAI API client with callJSON helper
- `lib/prompts.ts` — All LLM system/user prompts
- `lib/i18n.ts` — i18n support (zh/en)
- `lib/lang.ts` — Language utilities

### Electron Integration (electron/main.cjs)
- Runs embedded Next.js server on configurable port (default 3487)
- Two windows: main window (home/concepts) + quick-capture window
- Tray icon with menu (quick record, open, AI status, open data folder, quit)
- Global shortcut (default Alt+Space) opens quick-capture window
- Config stored in app.getPath('userData')/config.json (dataDir, openaiApiKey, proxy, shortcut)
- IPC channels: config:get/save, data-dir:choose/open, server:restart, window:show-main/close-quick-capture, note:saved

### Data Directory Structure
```
DATA_DIR/
  notes/<id>.md          — individual notes with frontmatter
  concepts/<title>.md    — concept cards with synthesis as body
  people/<name>.md       — person profiles with note_ids
  analysis/<id>.md       — LLM analysis results per note
  review-queue/<id>.md   — pending concept review items
  note-links/<id>.md     — typed note-to-note links
  purpose.md             — user's insight purpose
  index.md               — auto-generated wiki index
  log.md                 — wiki action log
  health.md              — auto-generated health report
  prompts.json           — user prompt overrides
```

## Pages
- `/` — Home: recent notes feed with concepts, people, tags, insights
- `/capture` — Note capture page
- `/quick-capture` — Quick capture window page
- `/onboarding` — Initial setup flow
- `/settings` — AI configuration (API key, proxy, data dir, shortcut)
- `/concepts/[title]` — Concept detail with synthesis and Q&A
- `/concepts/[title]/ask` — Ask about a concept
- `/tags/[name]` — Notes tagged with a specific tag
- `/people/[name]` — Notes about a person

## API Routes
- `POST /api/notes` — Create note
- `GET /api/notes` — List notes (paginated)
- `GET/PUT/DELETE /api/notes/[id]` — CRUD
- `POST /api/notes/[id]/tags` — Update tags
- `POST /api/notes/[id]/concepts` — Update concepts
- `POST /api/notes/[id]/insight` — Get instant insight
- `POST /api/ask` — Ask about a concept
- `POST /api/ask-global` — Global Q&A across all notes
- `POST /api/polish` — Polish/refine note content
- `POST /api/prompts` — Prompt overrides
- `GET/POST /api/people/[name]` — Person pages
- `POST /api/people/[name]/ask` — Ask about a person
- `GET /api/review-queue` — Pending concept reviews
- `POST/DELETE /api/review-queue/[id]` — Accept/dismiss review
- `POST /api/import-notes` — Import notes
- `GET/POST /api/backup` — Backup/restore
- `GET /api/app-status` — App health and OpenAI status

## Conventions
- Note IDs are timestamp-based: YYMMDD-HHMMSS-XXXX
- File-based storage means data is portable (Obsidian-compatible)
- LLM analysis happens asynchronously after note save
- Concepts emerge via LLM classification with human review
- "Subject guard" prevents misclassifying person-focused notes as self-reflection notes
- Health checks detect orphan concepts, stale analyses, broken links

## Common Commands
- `npm run dev` — Start web dev server
- `npm run electron:dev` — Start desktop dev mode
- `npm run desktop:build` — Build Mac app
- `npm run desktop:pack` — Package without signing

## Coding Guidelines
Follow these principles to maintain code quality and clarity:

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → Write tests for invalid inputs, then make them pass
- "Fix the bug" → Write a test that reproduces it, then make it pass
- "Refactor X" → Ensure tests pass before and after

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you work independently. Weak criteria ("make it work") require constant clarification.
