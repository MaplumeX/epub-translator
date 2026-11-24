# ADR: Local EPUB Translator Architecture and 7C-Lite Translation Pipeline

Status: implemented

## Problem

Translating full-length foreign-language EPUB books (particularly English fiction and technical books) into Simplified Chinese requires solving four coupled problems simultaneously:

1. **Structural fidelity**: EPUB 2/3 books contain XHTML spine items, OPF metadata, NCX/Nav tables of contents, code blocks (`<pre>`, `<code>`), MathML/SVG formulas, and inline formatting (`<em>`, `<strong>`, `<a>`, footnote refs). Naive text replacement corrupts XHTML or breaks ebook readers.
2. **Context and terminology consistency vs. token cost**: Translating paragraph-by-paragraph loses cross-paragraph pronoun and character-name continuity and triggers rate limits, whereas full multi-pass book polishing triples token spend and complicates resume state.
3. **Resumable local execution without CORS barriers**: Cloud OpenAI-compatible LLM APIs block direct browser requests via CORS, and large EPUB archives cannot comfortably live inside browser storage without risking memory pressure or lost progress on refresh/restart.
4. **Interactive proofreading and flexible export**: Readers need to monitor chapter progress live, inspect bilingual side-by-side output, filter and repair failed paragraphs inline, and export either bilingual or translated-only EPUBs from the same translated dataset.

## Decision

The application is implemented as a single-repository TypeScript local Web application on Node.js 24 (`pnpm` with `pnpm-workspace.yaml` allowing `esbuild` builds, plus dedicated `vitest.config.ts` at root so Vite's `src/web` root does not hide root `tests/`), split into three strict layers:

1. **Pure Core Engine (`src/core/`)** — Zero dependencies on React, Hono, or `node:sqlite`, enforced by `tests/architecture/boundaries.test.ts` so it stays reusable for a future CLI:
   - **EPUB 2/3 round-trip engine (`src/core/epub/`)**: Uses `jszip` and `cheerio` (`xmlMode: true` with `serializeUtf8Xml` decoding non-ASCII hex entities back to clean UTF-8 while keeping XML-sensitive entities escaped) to parse `META-INF/container.xml`, OPF manifest/spine/metadata, and TOC (`toc.ncx` and EPUB 3 `nav.xhtml`). Extracts leaf translatable blocks via deterministic `domPath` traversal while skipping `<pre>`, `<script>`, `<style>`, and standalone `<svg>`/`<math>` blocks. Folds inline protected elements into numbered placeholders (`[[I1]]...[[/I1]]` for paired inline tags, `[[V1]]` for opaque payloads like `<code>`, `<math>`, `<svg>`, footnote markers, `<br/>`, `<img/>`) with exact DOM fragments stored for restoration.
   - **Dual-mode exporter (`src/core/epub/exporter.ts`)**: Generates either `bilingual` (preserving list numbering inside `<li>`, inline `<span class="epub-tr-zh">` for headings/table cells, sibling `<p class="epub-tr-zh">` for paragraphs, plus injected `epub-translator-bilingual.css`) or `translated_only` (in-place replacement), updating OPF title/description and NCX/Nav TOC labels. Always writes `mimetype` first with `compression: "STORE"`, passes untouched binary assets through verbatim, and falls back failed/invalid segments to untouched original XHTML.
   - **OpenAI-compatible Provider & 7C-Lite pipeline (`src/core/translation/`)**: Exposes `TranslationProvider` and `OpenAICompatibleProvider` (custom `baseUrl`, `apiKey`, `model`, connectivity test, retry with exponential backoff and `Retry-After` on 429/5xx, `AbortSignal`).
     - **Default fast path**: Groups pending chapter segments under a character budget (`maxBatchChars`, default `2600`), injects 2–3 preceding context segments and matching glossary entries, extracts JSON tolerantly across markdown fences, and validates exact segment ID coverage plus placeholder multiset/nesting integrity. On partial or full batch validation failure, keeps valid segments and degrades only invalid segments to single-segment retry (up to 2 attempts with explicit validation feedback); persistent failures mark the segment `failed` with a structured error reason.
     - **Optional whole-book prescan (`src/core/translation/prescan.ts`)**: Resumably samples capped chapter text (`6000` chars head+tail) with bounded concurrency to extract deduplicated character/terminology candidates and a 2-sentence summary per chapter, feeding directly into the same single-pass pipeline. Inline manual edits and ad-hoc polish re-translations run per segment in the workbench.

2. **Local HTTP/SSE Server & Persistence (`src/server/`)**:
   - Hono server (`src/server/index.ts`, `src/server/app.ts`) binds strictly to `127.0.0.1` (default port `3456`, configurable via `PORT`, optional `.env` seed loaded on boot) and serves built `dist/web` static assets in production.
   - `AppDatabase` (`src/server/db.ts`) uses Node 24's built-in `node:sqlite` (`data/app.db` in WAL mode with foreign keys), stores original EPUBs read-only under `data/books/<bookId>/source.epub`, and keeps `data/` gitignored. Multiple Provider presets are managed via `/api/providers` with masked keys in list responses.
   - `TranslationJobManager` (`src/server/jobManager.ts`) commits each settled segment transactionally, streams live progress over SSE (`/api/books/:id/events`), and on server startup resets stale `translating` segments to `pending` and interrupted books to `paused` for safe resume.

3. **Two-Column Proofreading Workbench (`src/web/`)**:
   - React 19 + Vite frontend styled per [the Warm Editorial design system](../design/2026-11-24-warm-editorial-design-system.md).

## Alternatives considered

- **CLI-only first version**: Faster initial delivery, but lacks immediate visual inspection of bilingual output, chapter progress, glossary editing, and inline repair of failed paragraphs. Keeping `src/core/` framework-free preserves low-cost future CLI reuse.
- **Desktop app (Tauri / Electron)**: Double-click distribution for non-technical users, but cross-platform packaging and native bridge overhead are disproportionate for a personal v1 tool.
- **Browser-only SPA with IndexedDB**: Avoids a local server process, but cloud LLM endpoints block browser requests via CORS and large EPUB binary archives degrade browser memory stability.
- **Next.js full-stack app**: Heavier build/runtime model and less direct control over long-running background queues, `AbortController` pause/resume, and SSE fan-out than a small Hono Node server.
- **Python / Go / Rust stacks**: Python (`lxml`/`ebooklib`) forces a split frontend/backend stack when paired with React; Go/Rust trade away fast XHTML DOM fault-tolerance and UI iteration speed.
- **Traditional MT APIs (DeepL / Google Translate) or dual backend in v1**: MT APIs lack cross-paragraph literary context and glossary steering; building both LLM and MT chunking/error paths in v1 doubles surface complexity.
- **Single-mode export (bilingual-only or translated-only)**: Switching writeback strategy at export time has minimal incremental cost once segment translation is stored cleanly.
- **Per-paragraph raw HTML requests**: Causes excessive API call volume, rate-limit throttling, lost cross-paragraph context, and frequent LLM corruption of HTML attributes.
- **7C-Full (whole-book prescan + draft + full second-pass polish)**: Triples token cost and latency, adds dual-draft state/diff complexity, and risks drifting exact technical phrasing in technical books.
- **`.env`-only read-only API key config**: Prevents switching between OpenAI, DeepSeek, and Ollama or testing connectivity without editing files and restarting; binding strictly to `127.0.0.1` and gitignoring `data/` preserves local safety.

## Consequences

- **Verified invariants**: Automated tests cover `src/core/` import purity, EPUB 2/3 round-trip fidelity (uncompressed `mimetype`, `epub:type="noteref"`, MathML, `<pre>`, list numbering, bilingual & translated-only export), batch-to-single fallback retry, 429 `Retry-After` backoff, prescan deduplication, and SQLite restart crash recovery.
- **Runtime requirement**: Depends on Node.js `>= 24` for built-in `node:sqlite`; avoids C++ native addon compilation at the cost of tracking Node's experimental SQLite API stability.
- **Cheerio XML entity handling**: Because `cheerio` / `dom-serializer` encodes non-ASCII codepoints as hex numeric entities in `xmlMode`, `serializeUtf8Xml` decodes printable codepoints `>= 0xA0` back to native UTF-8 while keeping `&`, `<`, `>`, and quotes XML-escaped.
- **Deferred capabilities**: Whole-book second-pass polish (7C-Full), vertical Japanese / `<ruby>` layout, traditional MT providers, and standalone CLI entry remain intentionally out of scope for v1 and can build cleanly atop `src/core/` later.
