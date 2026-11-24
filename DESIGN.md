# DESIGN.md — EPUB Translator (Warm Editorial Workbench)

## 1. Product & Brand Context

- **Audience & Context**: Personal readers and technical/literary enthusiasts translating foreign-language EPUB books (English fiction and technical books) into Simplified Chinese locally, proofreading bilingual paragraphs chapter by chapter, and exporting clean EPUBs.
- **Voice & Tone**: Calm, editorial, matter-of-fact. Concrete examples:
  - Primary CTA: `开始翻译` / `继续翻译` / `导出 EPUB`
  - Empty state: `导入一本 EPUB 开始翻译` — `拖入 .epub 文件或点击选择。原书将只读保存在本地 data/ 目录，支持双语对照与纯译文无损导出。`
  - Error copy: `缺少必需占位符 [[V1]]（已自动降级重试 2 次并保留原文，导出时不会破坏原排版）`
- **Aesthetic Thesis & Signature**: *Warm Editorial / Bookbinding* — warm rag-paper light surfaces (`#f9f8f6` / `#ffffff`) with deep charcoal ink (`#211d17`) and a single restrained Terracotta Crimson accent (`#b44a2e` light / `#d47250` dark). Generous CJK line-height (`1.72`) inside a bounded `780px` reading sheet.
- **What NOT to do**:
  - No pure `#000000` backgrounds or text.
  - No ungrounded purple/cyan gradients, gradient text, thick colored side-borders on cards, or frosted glass on flat surfaces.
  - No `transition: all` or animations on layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`).
  - No color-only status indicators (always pair icons + text).
  - No modals for long scrolling prose; keep proofreading inline inside the main reading column.

## 2. Tokens & Cross-Component Conventions

Defined in `src/web/styles/tokens.css` (components consume semantic variables exclusively):

- **Color Ramps**: Programmatically generated 9-step ramps (`neutral`, `primary`, `success`, `warning`, `danger`, `info`) with all light and dark text/surface pairs verified `>= 4.5:1` via `check_contrast.py`.
- **Light / Dark Switching**: `[data-theme="dark"]` swaps semantic aliases only; elevated dark surfaces use lighter neutral steps + `1px` borders instead of dark drop shadows.
- **Typography**: Fixed scale `12 / 14 / 16 / 18 / 20 / 24 / 30px`; weights `400 / 500 / 600 / 700` only; English source `15px / 1.62`, Simplified Chinese prose `16px / 1.72`, monospace for inline protected code tokens.
- **Spacing & Controls**: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px`; control heights `32 / 38 / 44px`; strictly 2 active radii (`6px`, `10px`); `z-index` layers `0 / 10 / 20 / 30 / 40 / 50`.
- **Action Pyramid**: 1 solid primary button per view (`--accent`), outline secondary buttons (`--surface-raised`), ghost tertiary actions, and demoted destructive triggers promoted to `--status-danger-solid` only inside confirmation modals.
- **Breakpoints**: Desktop workbench `>= 1024px` (`100dvh`, fixed `280px` sidebar + bounded `780px` reading pane); `< 1024px` unlocks `100dvh` into single-column document flow with slide-over chapter drawer.

## 3. Component Index & State Matrix

| Component | Path | States Covered | Token Bindings |
|---|---|---|---|
| Design Tokens & Base Primitives | `src/web/styles/tokens.css`, `src/web/styles/base.css` | light, dark, hover, focus-visible, disabled, reduced-motion | `--surface*`, `--text*`, `--accent*`, `--status-*` |
| Workbench Shell & Sidebar | `src/web/components/WorkbenchShell.tsx`, `src/web/components/Sidebar.tsx`, `src/web/components/ThemeToggle.tsx` | default, empty, loading, error, mobile `<1024px` drawer | `--sidebar-width`, `--surface`, `--border`, `--accent` |
| Empty Import Stage | `src/web/components/BookImportEmpty.tsx` | empty, drag-over, uploading, api-ready, api-unconfigured, error | `--measure-empty`, `--accent-subtle`, `--status-*` |
| Top Action Bar | `src/web/components/TopActionBar.tsx` | idle, prescanning, translating, paused, completed, failed-count | `--surface-raised`, `--accent`, `--status-danger-*` |
| Chapter Reader & Segment Card | `src/web/components/ChapterReader.tsx`, `src/web/components/SegmentCard.tsx` | default, pending, translating, translated, failed, inline-edit, polish-retranslate, loading-skeleton, edge-overflow | `--measure-reading`, `--leading-cjk`, `--code-bg`, `--status-danger-*` |
| Glossary & Prescan Drawer | `src/web/components/GlossaryDrawer.tsx` | default, empty, prescanning, prescan-complete, summaries-expanded, filtered, form-error | `--surface-raised`, `--z-modal`, `--accent-subtle` |
| Provider Settings Modal | `src/web/components/ProviderSettingsModal.tsx` | default, new-preset, testing, test-ok, test-fail, validation-error | `--surface-raised`, `--status-success-*`, `--status-danger-*` |
| Export Dialog & Confirm Dialog | `src/web/components/ExportPopover.tsx`, `src/web/components/ConfirmDialog.tsx` | bilingual, translated_only, destructive-confirm, busy | `--surface-raised`, `--accent-subtle`, `--status-danger-solid` |
