# ADR: Dedicated Book Library Management View and Entry Consolidation

Status: implemented

## Problem

Imported EPUB books previously had no dedicated management interface. Switching books relied on a narrow `<select>` dropdown in the sidebar, importing additional books hid behind a single-file button next to that dropdown, and lifecycle actions (`重置译文` / `删除本书`) sat inside the chapter proofreading header where they could only act on the currently open book and cluttered the reading flow. Opening the application when books existed jumped straight into the most recently updated book, giving users no overview of translation progress, failure counts, chapter counts, file sizes, or search/filter controls across their local library.

## Decision

The frontend introduces a dedicated **Book Library** top-level view (`src/web/components/BookLibrary.tsx` + `src/web/utils/library.ts`) that pairs with the two-column proofreading workbench in [the Warm Editorial design system](../design/2026-11-24-warm-editorial-design-system.md) and builds directly atop the local Hono/SQLite endpoints in [the local EPUB translator architecture](../architecture/2026-11-24-epub-translator-architecture.md):

1. **Three-mode shell with hash synchronization**:
   - `WorkbenchShell` supports `empty` (0 books, `520px` dropzone), `library` (`>= 1` book, bounded `max-width: 960px` via `--measure-library`, reusing the quiet topbar shell with a single solid primary `导入 EPUB` CTA), and `reader` (`280px` sidebar + `780px` bilingual proofreading column).
   - Opening `/` with existing books lands on the Library view by default. Opening a book syncs `#/book/<id>` via `history.pushState` and listens to `hashchange` so reloads and browser Back/Forward preserve context without colliding with `?state=...&theme=...` preview hooks; invalid `#/book/<missing>` hashes fall back cleanly to the Library view and clear the stale hash.
2. **Basic management scope with zero schema migration**:
   - `BookRecord` (`src/core/types.ts`) includes `chapterCount: number`, computed via SQL subquery in `AppDatabase.listBooks()` and `AppDatabase.getBook()` (`src/server/db.ts`) without altering SQLite tables.
   - `BookLibrary` provides keyword search (title, translated title, author, source filename), status filter tabs (`全部` / `进行中` / `已完成` / `有失败` with live counts), sorting (`最近更新` / `书名` / `翻译进度`), sequential single/multi-file `.epub` drag-and-drop or picker import with per-file error reporting, and per-book actions (`打开校对`, live `暂停` when translating/prescanning, `导出`, `重置`, `删除`) driving shared `ExportPopover` and `ConfirmDialog` overlays targeted at the chosen book ID.
   - While the Library view is open and at least one book has `status === "translating" | "prescanning"`, the client polls `GET /api/books` every 2 seconds and stops automatically when leaving the Library view or when no job is running.
3. **Entry consolidation & predictable post-import navigation**:
   - Book lifecycle actions are consolidated into the Library view: `Sidebar` replaces `+ 导入` with `← 全部书籍 (N)` alongside the quick-switch `<select>`, and `ChapterReader` removes `重置译文` and `删除本书` from the chapter header so proofreading stays focused.
   - Importing from the empty stage (0 books) immediately opens the newly imported book's proofreading view; importing 1 or more books from the Library view stays in the Library and highlights newly imported rows with a crisp `--accent` border and `新导入` badge.

## Alternatives considered

- **Library modal/drawer launched from the sidebar (keeping the reader as the sole main screen)**: Requires minimal shell changes, but cramps multi-book browsing, forces stacked modals (library modal -> delete confirmation modal), and poorly accommodates drag-and-drop multi-file import.
- **Dual-mode sidebar (`书库 / 章节` tabs inside the `280px` sidebar)**: Allows switching without leaving the reader, but `280px` cannot cleanly display author, file size, progress bar, failure count, and lifecycle actions without cluttering the quiet editorial sidebar.
- **Extended shelf with EPUB cover extraction, metadata editing, and bulk multi-select delete**: Adds bookshelf visuals and batch operations, but requires EPUB parser changes, cover asset storage/backfill for existing books, and extra edit/selection state beyond the requested basic management view.
- **Default landing directly on the most recently updated book**: Saves one click when continuing a single book, but hides the library overview on fresh app launch; hash sync (`#/book/<id>`) already preserves reload continuity for active proofreading.
- **Keeping duplicate import/reset/delete entries in `Sidebar` and `ChapterReader`**: Preserves old click paths, but leaves destructive actions exposed inside the reading header and splits management across two surfaces.
- **Auto-opening the reader after any single-file import from the Library**: Saves one click for single-book import, but surprises users organizing or sequentially importing several books in the Library view.

## Consequences

- **Verified invariants**: Automated tests cover `chapterCount` SQL aggregation, book reset and delete APIs, hash route parsing/building, library search/filter/sort/formatting helpers, and Warm Editorial CSS guardrails (`pnpm run build && pnpm test`, 18 tests across 5 files). Headless Playwright `shoot.py --strict` checks pass across desktop (`1440px`) and mobile (`400px`) for light/dark Library (`default`, `empty`, `loading`, `error`) and Reader (`default`, `loading`, `error`) with zero horizontal overflow and zero console/page errors.
- **Zero-migration backward compatibility**: Existing local `data/app.db` databases immediately display accurate chapter counts without schema migrations.
- **Conditional polling tradeoff**: The 2-second poll runs strictly while the Library view is mounted and at least one book is actively running, avoiding a new global SSE endpoint while keeping idle libraries silent.
- **Deferred capabilities**: EPUB cover extraction/caching, manual book metadata editing (`title` / `translatedTitle` / `author`), multi-select bulk actions, and tags/folders remain intentionally deferred and can layer onto `BookLibrary` cleanly later.
