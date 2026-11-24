# ADR: Warm Editorial Design System and Two-Column Proofreading Workbench

Status: implemented

## Problem

An EPUB translation workbench mixes two demanding UI modes: long-form bilingual reading/proofreading (English source alongside Simplified Chinese prose) and stateful batch task management (chapter progress, failures, glossary/prescan, and API settings). Generic dashboard styling produces harsh contrast, cramped CJK line rhythm, cluttered chrome, and jarring dark-mode glare during extended reading sessions.

## Decision

The frontend (`src/web/`) implements a **Warm Editorial / Bookbinding** design system with semantic light/dark themes and a **two-column workbench** layout (`standard` density), documented in [`DESIGN.md`](../../../../DESIGN.md):

### Direction & Peer Benchmark
- **Peers**: Readwise Reader (bounded reading sheet, quiet secondary metadata), iA Writer (distraction-free typographic rhythm, clear focus affordances), Linear (crisp `1px` surface boundaries and compact status badges).
- **Keep**: Fixed left chapter navigation + bounded right reading pane muscle memory.
- **Break**: Replace dense desktop toolbars and cool grey forms with quiet paper-like surfaces and inline editorial annotations.
- **Visual thesis**: Warm rag-paper light surfaces (`#f9f8f6` / `#ffffff`) with deep charcoal-ink typography and a single restrained Terracotta Crimson accent; dark mode flips strictly via `[data-theme="dark"]` semantic tokens to warm charcoal surfaces (`#211d17` / `#3c352b`) with `1px` warm borders.
- **Content plan**: When no book is loaded, chapter and task chrome stay hidden and a centered `520px` EPUB dropzone with an API readiness banner takes the stage. When books exist, the default top-level view is the bounded `max-width: 960px` book library (see [the Book Library management view](../feature/2026-11-24-book-library-management.md)). With a book open in the reader, the shell renders a compact top action bar, a fixed `280px` left chapter tree, and a `max-width: 780px` bilingual proofreading flow.
- **Interaction thesis**: Hover/focus on a paragraph reveals lightweight inline edit and polish re-translate actions (`opacity`/`transform`, `150ms ease-out`); reduced-motion users receive instant opacity transitions without motion.

### Programmatic 9-Step Color Ramps & Semantic Tokens
Defined in `src/web/styles/tokens.css`, derived via `generate_ramp.py`, and verified `>= 4.5:1` WCAG AA across light and dark modes via `check_contrast.py`:

- **Warm Neutral**: `100 #f9f8f6`, `200 #dfd9d1`, `300 #c4baae`, `400 #a79b8c`, `500 #897c6c`, `600 #706555`, `700 #564d40`, `800 #3c352b`, `900 #211d17`
- **Primary (Terracotta Crimson)**: `100 #fcf4ee`, `200 #f0ccb8`, `300 #e2a184`, `400 #d47250`, `500 #b44a2e`, `600 #993825`, `700 #7d281d`, `800 #601a15`, `900 #430f0e`
- **Status ramps**: `success` (`#2f7a53` base), `warning` (`#b7791f` base), `danger` (`#b83232` base), `info` (`#3b608c` base).
- **Light (`:root`)**: `--surface: #f9f8f6`, `--surface-raised: #ffffff`, `--border: #dfd9d1`, `--border-strong: #c4baae`, `--text: #211d17`, `--text-secondary: #564d40`, `--text-muted: #706555`, `--accent: #b44a2e`, `--accent-hover: #993825`, `--accent-subtle: #fcf4ee`, `--accent-text: #993825`, `--accent-fg: #ffffff`.
- **Dark (`[data-theme="dark"]`)**: `--surface: #211d17`, `--surface-raised: #3c352b`, `--border: #564d40`, `--border-strong: #706555`, `--text: #f9f8f6`, `--text-secondary: #dfd9d1`, `--text-muted: #c4baae`, `--accent: #d47250`, `--accent-hover: #e2a184`, `--accent-subtle: #430f0e`, `--accent-text: #e2a184`, `--accent-fg: #211d17`.

### Typography, Layout, State Coverage & Bans
- **Type scale**: `12 14 16 18 20 24 30px`; weights `400 / 500 / 600 / 700` only; headings `1.2`, UI `1.35`, English source `15px / 1.62`, Chinese translation `16px / 1.72` (with optional serif reading toggle).
- **Spacing & controls**: `4 8 12 16 24 32 48 64px`; control heights `32 / 38 / 44px`; strictly 2 active radii (`6px`, `10px`); `:focus-visible` `2px` ring with `2px` offset; `z-index` layers `0 / 10 / 20 / 30 / 40 / 50`.
- **Responsive workbench**: `>= 1024px` uses `100dvh` with independent scrollable `280px` sidebar and fluid main pane (`max-width: 780px` reading column); `< 1024px` unlocks `100dvh` into single-column document flow with a slide-over chapter drawer.
- **Explicit bans**: No pure `#000000` (guarded by `tests/architecture/boundaries.test.ts`), no ungrounded purple/cyan gradients, no gradient text, no thick colored side-borders on cards, no frosted glass on flat surfaces, no `transition: all`, no layout-property animations, and no color-only status indicators.
- **State Matrix**: Every primary view and overlay (`WorkbenchShell`, `BookImportEmpty`, `ChapterReader`, `ChapterDocumentView`, `SegmentBlock`, `RichContent`, `GlossaryDrawer`, `ProviderSettingsModal`, `ExportPopover`, `ConfirmDialog`) implements explicit `default`, `empty`, `loading`, `error`, and overflow/`edge` states, auditable via `?state=default|empty|loading|error` and `?theme=dark`. The continuous full-chapter reading sheet and inline proofreading flow are governed in detail by [the continuous chapter reader decision](../feature/2026-11-24-continuous-chapter-reader.md).

## Alternatives considered

- **Cool Technical Workbench (Linear/Raycast cool greys + blue accent)**: High visual precision for task telemetry, but feels cold and fatiguing for prolonged bilingual book reading.
- **Light-only Warm Editorial**: Reduces token maintenance slightly, but fails night-time reading and proofreading comfort; semantic token switching makes dark mode low-cost.
- **Single-column progressive pipeline (`max-width: 720px`)**: Lower initial layout complexity, but repeatedly opening/closing preview drawers across chapters makes inspecting translations and repairing failed segments inefficient.
- **Three-column professional CAT editor (chapter tree + split columns + side inspector)**: Optimizes for sentence-by-sentence professional localization, but imposes heavy visual load and awkward responsive behavior for a lightweight personal EPUB tool.

## Consequences

- **Automated visual & contrast gates**: Both light and dark modes pass `check_contrast.py` (`>= 4.5:1`) and Playwright `shoot.py --strict` across `1440px` and `400px` in all four states (`default`, `empty`, `loading`, `error`) with zero horizontal overflow and zero console/page errors.
- **System font fallbacks**: Serif reading mode relies on local system serif stacks (`Source Serif 4`, `Songti SC`, `Noto Serif SC`, `Georgia`), trading uniform cross-OS glyph metrics for zero webfont download latency in a local offline-capable app.
- **Long code/identifier handling**: Inline protected code tokens wrap via `overflow-wrap: anywhere` inside `--code-bg` chips so long symbols never break the `780px` reading measure or `400px` mobile viewport.
