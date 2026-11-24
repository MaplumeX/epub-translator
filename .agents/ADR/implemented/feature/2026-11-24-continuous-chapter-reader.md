# ADR: Continuous Full-Chapter Reader and Inline Proofreading View

Status: implemented

## Problem

The translation workbench previously rendered each extracted `SegmentRecord` as an isolated bordered card with a permanently visible `#N · TAG` header bar and action buttons (`编辑`, `重译 / 润色`). While matching the underlying block-level extraction model in [the EPUB translator architecture](../architecture/2026-11-24-epub-translator-architecture.md), this presentation fractured reading flow into disconnected form-like cards, hid non-translatable chapter elements (illustrations, `<pre>` code blocks, tables, horizontal rules, standalone formulas), flattened inline formatting (italics, bold, superscript footnote references), and required switching the whole book back to bilingual mode just to inspect one paragraph's English source.

## Decision

The chapter preview replaces the card-per-segment list with a **continuous, full-chapter reading and inline proofreading sheet** built atop [the Warm Editorial design system](../design/2026-11-24-warm-editorial-design-system.md) and the read-only local `source.epub` archive:

1. **Sanitized chapter document AST (`src/core/epub/document.ts`, `src/core/types.ts`)**:
   - `buildChapterDocument` parses the original chapter XHTML `<body>` using the exact same `selectTranslatableBlocks` traversal used during import and export, mapping each translatable leaf block 1:1 to a `{ kind: "segment", domPath, tagName, id?, attrs? }` anchor node.
   - Structural and non-translatable elements (`section`, `div`, `blockquote`, `figure`, `figcaption`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `pre`, `code`, `hr`, `img`, `svg`, `math`, headings, links) pass through strict tag and attribute whitelists. Scripts, inline styles, event handlers, and unsafe URL schemes (`javascript:`, `vbscript:`, unsafe `data:`) are stripped.
   - Relative image references (`img[src]`, `svg image[href/xlink:href]`) resolve via `resolveZipPath` to `/api/books/:id/assets/<zipPath>`; links are classified as same-chapter anchors (`#id`), cross-chapter links (`chapterHref` + optional `#hash`), or safe external `http(s)` links.
   - Void inline placeholders (`<code>`, footnote `<sup>`/`<a>`, inline `<img>`/`<svg>`/`<math>`, `<br/>`) are sanitized into `placeholderNodes` on the server so the browser renders rich inline content without bundling `cheerio`.

2. **Local chapter document API and safe EPUB asset proxy (`src/server/epubAssets.ts`, `src/server/routes/books.ts`)**:
   - `GET /api/books/:id/chapters/:chapterId/document` loads the chapter from `data/books/<bookId>/source.epub` via `EpubAssetCache` (an in-memory LRU cache capped at 4 books and invalidated on book deletion) and returns `{ chapter, nodes, segments, placeholderNodes, fallback }`. When `source.epub` or the chapter entry is missing, the endpoint degrades gracefully (`fallback: true`) via `buildFallbackChapterNodes`.
   - `GET /api/books/:id/assets/*` serves only allowlisted image media types (`png`, `jpeg`, `gif`, `webp`, `avif`, `svg+xml`) with path-traversal rejection, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`, and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` on SVGs. The legacy `/segments` endpoint remains available.

3. **Native React continuous sheet, inline rich text, and progressive proofreading (`src/web/`)**:
   - `ChapterDocumentView`, `RichContent`, `SegmentBlock`, and `src/web/utils/inlineTemplate.ts` render the chapter natively in React (zero `dangerouslySetInnerHTML`) inside one bounded warm-paper `.chapter-sheet` (`max-width: 780px`) styled with Warm Editorial light/dark typography (`h1–h6` scale, CJK `1.72` leading, `1px` `blockquote` border, scrollable `<pre>` and `<table>` wrappers, responsive images, superscript footnotes with smooth in-chapter scroll and cross-chapter navigation).
   - `SegmentBlock` is wrapped in `React.memo` so live SSE `segment_updated` events re-render only the changed segment without flickering or losing editor focus. At rest, prose displays cleanly without card chrome; hover, keyboard focus, or touch tap reveals a subtle background tint and floating micro-toolbar (`#N · TAG`, single-segment `原文` peek toggle in `translated_only` mode, `编辑`, `重译`). Opening inline edit or polish automatically shows that segment's source text; `translating` and `failed` states remain visible inline.
   - Bilingual mode stacks source above translation inside each segment within the `780px` reading sheet, matching the exported bilingual EPUB flow.
   - Switching the chapter header tab to 「仅看失败」 displays a compact failed-segment repair list with a 「在书页中定位」 action that returns to the full sheet and scrolls/highlights the target `domPath`.

## Alternatives considered

- **Continuous reading sheet from segments only (without non-translatable EPUB blocks)**: Lower implementation effort, but omits illustrations, `<pre>` code blocks, tables, and rules that are essential when proofreading technical and illustrated books.
- **Sandboxed `<iframe>` rendering original XHTML with publisher CSS**: Preserves custom publisher styling, but publisher CSS frequently breaks dark-mode contrast and CJK rhythm, introduces double scrollbars, complicates real-time SSE updates, and forces editing out of the reading flow into modals or drawers (violating `DESIGN.md`).
- **Side-by-side two-column bilingual layout (`1120px`)**: Enables horizontal sentence comparison for pure prose, but fractures around tables, nested lists, and figures, causes width jumps when toggling bilingual/translated-only modes, and still requires responsive fallback below `1024px`.
- **Keep plain-text segment rendering without inline rich-text restoration**: Minimizes code changes, but without card borders the page relies on typographic hierarchy and proper superscript footnotes, emphasis, and code chips to remain legible.
- **Replace the 「仅看失败」 tab with an in-page "jump to next failure" pager**: Keeps full context at all times, but scanning and batch-repairing multiple errors in long chapters is slower than a focused failure checklist with one-click return to context.

## Consequences

- **Zero schema migration and zero new dependencies**: Reuses existing `source.epub`, `chapters.href`, `segments.dom_path`, `jszip`, `cheerio`, and React 19; previously imported books immediately render in the continuous full-chapter sheet.
- **Verified invariants**: Automated tests cover 1:1 `domPath` document alignment, XSS/script/style/protocol stripping, SVG CSP and asset traversal rejection, missing-EPUB graceful fallback, nested/malformed inline template parsing, core/architecture boundaries, WCAG AA contrast (`>= 4.5:1`), and Playwright `shoot.py --strict` across `1440px` and `400px` in `default,empty,loading,error` and dark modes with zero overflow or console errors.
- **Intentional trade-offs**: Publisher CSS stylesheets and inline `style` rules are deliberately ignored in favor of consistent Warm Editorial light/dark readability; editing remains scoped to individual `SegmentRecord` templates to preserve lossless EPUB placeholder validation and export fidelity.
- **Edge-case mitigations**: Malformed EPUBs without `<body>` fall back to root traversal and unknown wrapper tags unwrap safely; narrow table cells and `<1024px` mobile viewports render the segment toolbar inline on activation to prevent horizontal clipping; repeated image requests reuse the bounded 4-book `JSZip` LRU cache.
