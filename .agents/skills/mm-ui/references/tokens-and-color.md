# Tokens, Color & Design Systems

Read this file when creating a design system from zero, defining or updating color/type/spacing scales, configuring dark mode or Tailwind mappings, or documenting an existing codebase in `DESIGN.md`.

## 1 · Codebase Inventory & `DESIGN.md` Contract

Before proposing tokens or new primitives, inspect CSS custom properties, `tokens.*`, `tailwind.config.*`, CSS-in-JS themes, and shared components (`src/components/`, shadcn/ui, MUI, etc.). Reuse existing primitives and map tokens to the existing styling mechanism rather than inventing a parallel build step.

When documenting a design system, keep `DESIGN.md` concise across three sections:

1. **Product & Brand Context**: target audience & usage context, voice & tone (with concrete button/empty-state/error copy examples), aesthetic thesis & design signature, and explicit **What NOT to do** bans.
2. **Tokens & Cross-Component Conventions**: color ramps, semantic mapping, typography (with CJK rhythm if applicable), spacing & control heights, active radii, card elevation rule, input depth treatment, 3-tier button hierarchy, focus/disabled rules, and breakpoints.
3. **Component Index & State Matrix**: table mapping existing components → source paths, variants/sizes, supported states (`default / hover / focus-visible / disabled / loading / error / empty`), token bindings, and known gaps/debt.

## 2 · Color & 9-Step Ramps

Work in HSL/OKLCH rather than hex so lightness and saturation relationships stay legible. (Note: design tools often use HSB where 100% brightness + 100% saturation = HSL 50% lightness.)

Every real UI needs more than a 5-color palette:
- **Neutrals (`neutral`)**: 8–10 shades. Start from a very dark grey, never pure `#000`, and end off-white (`#fff` reserved for raised surfaces/text on dark). Tint greys slightly cool (blue) or warm (yellow/orange), raising saturation at both ends so extremes do not look flat.
- **Primary (`primary`)**: 1–2 hues × 5–10 shades (ultra-light tinted backgrounds to dark text).
- **Accents & semantic states (`success / warning / error / info` + categorical)**: 5–9 shades each as needed.

### Deriving a 9-step ramp (`100..900`)
Never hand-pick arbitrary shades or rely on naive `lighten()`/`darken()`. Derive ramps programmatically with `scripts/generate_ramp.py --name <group> --base <color>` (or `--neutral cool|warm`):
1. Pick `500` first (the shade that works as a button background; no "must be 50% lightness" rule).
2. Anchor `900` (darkest text) and `100` (tinted background — an alert exercises both ends at once).
3. Fill midpoints `700` / `300`, then `800` / `600` / `400` / `200`.
4. **Raise saturation as lightness moves away from 50%**, otherwise light/dark shades look washed out.
5. **Rotate hue (≤ 20–30°)** for extra brightness range without muddying colors: toward `60° / 180° / 300°` to lighten, toward `0° / 120° / 240°` to darken (e.g., darken yellow toward orange).
6. Account for **perceived brightness**: `√(0.299r² + 0.587g² + 0.114b²) / 255` (peaks at yellow/cyan/magenta, troughs at red/green/blue).

### Color Budget & Contrast
- **Surface budget**: ~70% quiet neutral canvas (`--surface`), ~25% structural surfaces & text (`--surface-raised`, `--surface-sunken`, `--border`, `--text*`), ~5% high-intent accent (`--accent`, `--status-*`). Expressive marketing pages may shift toward 60 / 30 / 10.
- **WCAG minimums**: `4.5:1` for body text (`< 18px`), `3:1` for large text (`>= 18px` or `>= 14px` bold). Always verify pairs with `scripts/check_contrast.py`.
- **Flip contrast on colored components**: instead of dark colored blocks with white text grabbing all attention, use a light tinted background (`100`) with dark text (`800/900`).
- **Colored text on colored backgrounds**: never use grey or lowered white `opacity` (looks muddy/washed out and bleeds patterns); pick a same-hue color or rotate slightly toward `60° / 180° / 300°`.

## 3 · Typography, Spacing & Infrastructure Scales

| Category | Canonical Scale / Values | Rules |
|---|---|---|
| **Type sizes** | `12 14 16 18 20 24 30 36 48 60 72` (px/rem) | Avoid modular-ratio fractions and nested `em` units. |
| **Font stack** | `-apple-system, Segoe UI, Roboto, Noto Sans, Ubuntu, Cantarell, Helvetica Neue` | Safe neutral default. Custom body faces need >= 5 weights (>= 10 styles) and generous x-height; never condensed/short-x-height for UI body. |
| **Weights** | `400/500` normal, `600/700` emphasis | Never below `400` for UI text. |
| **Line height & measure** | Headings `1.0–1.25`, compact UI `1.35`, body `1.5`, wide/CJK prose `1.625–1.75`; `45–75ch` (`20–35em`, `--measure-prose: 65ch`) | Never use `1.5` everywhere; leading rises with line width and falls as font size grows. |
| **Spacing** | `4 8 12 16 24 32 48 64 96 128 192 256 384 512 640 768` | Base 16px; >= ~25% between adjacent steps (linear 4px grids fail). |
| **Control heights** | `--control-sm: 32px`, `--control-md: 36–40px`, `--control-lg: 44px` | Desktop min `32×32px`; touch min `44×44px` (extend hit area via padding/pseudo-element if needed); `>= 8px` gap between adjacent targets. |
| **Radius** | Pick <= 2 active steps from `4 / 6 / 8 / 12px`, or `0` | Small = neutral, large = playful, none = formal. Never mix square and rounded corners. |
| **Borders & focus** | `1px / 2px`; focus `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` | Never set `outline: none` globally. Keep ring visible on dark surfaces (high-contrast or double ring). DOM order must match visual order. |
| **Elevation (5 steps)** | `0 1px 3px`, `0 4px 6px`, `0 5px 15px`, `0 10px 24px`, `0 15px 35px` (at `hsla(0,0%,0%,.2)`) | Small = buttons, medium = dropdowns, large = modals. |
| **z-index (6 layers)** | `0` base, `10` sticky, `20` dropdown/popover, `30` overlay, `40` modal/drawer, `50` toast | Never `z-index: 9999`. Watch `transform` creating unintended stacking contexts. |
| **Motion** | `150–200ms` buttons/hover, `200–300ms` dropdowns/drawers (`ease-out` in, `ease-in` out), `200–250ms` modals, `300–400ms` pages | Animate `transform` & `opacity` only (max ~8–16px travel). Under `prefers-reduced-motion: reduce`, drop translation/scaling and keep opacity only. |
| **Breakpoints** | `400px` mobile, `768px` 2-col, `1024px` sidebar, `1280px` max content width | Content decides breakpoints, not device labels. |

## 4 · Semantic Aliases & Dark Mode

Raw ramps live on `:root`; **components consume semantic tokens only**:

| Group | Semantic Tokens | Typical Light Mapping |
|---|---|---|
| Surfaces | `--surface`, `--surface-raised`, `--surface-sunken` | `neutral-100`, `#fff` / `neutral-50`, `neutral-200` |
| Text | `--text`, `--text-secondary`, `--text-muted` | `neutral-900`, `neutral-700`, `neutral-500` |
| Borders | `--border`, `--border-strong` | `neutral-200`, `neutral-300` |
| Accent | `--accent`, `--accent-hover`, `--accent-subtle`, `--accent-fg` | `primary-600`, `primary-700`, `primary-100`, `#fff` |
| Status | `--status-<state>-bg`, `--status-<state>-border`, `--status-<state>-fg` | `100`, `500`, `800`/`900` |
| Interactive | `--focus-ring`, `--disabled-bg`, `--disabled-fg` | `primary-600`, `neutral-100`, `neutral-400` |

Dark mode rules (`[data-theme="dark"]` or project selector):
1. **Swap semantic aliases only** — never use `filter: invert()` or scatter `dark:` overrides across every component (unless joining an existing `dark:` codebase).
2. **Never `#000`**: use near-black neutrals (`neutral-950` / `neutral-900`).
3. **Shadows disappear on dark**: express elevation with a slightly lighter raised surface + `1px` border.
4. **Step accents 1–2 shades lighter** (`primary-600` → `primary-400`) and **re-measure every pair** with `scripts/check_contrast.py`.

## 5 · Optional Tailwind Mapping & New System Deliverables

Tailwind's default spacing (`1..32` = `4..128px`) and type (`text-xs..text-7xl` = `12..72px`) match the scales above — avoid arbitrary overrides like `p-[13px]` and never use Tailwind's default `indigo` / `gray` as finished brand colors. If using `50` and `950`, assign explicit semantic roles (`50` = page bg, `950` = darkest text). Map `@theme` / `theme.extend` to semantic CSS vars (`bg-surface`, `text-text`) and use `max-w-prose` (`65ch`) for paragraphs.

When initializing a design system from zero:
- **Outside Tailwind / standalone design system**: produce `tokens.json`, `tokens.css`, `DESIGN.md`, and `preview.html` (all token swatches/scales + 4 canary specimens: Button, Form Input, Card, Alert, plus theme toggle if dark mode is enabled).
- **New Tailwind project**: `tokens.css` (mapped via `@theme inline` / `theme.extend`) + a concise `DESIGN.md` component/token index suffice; `tokens.json` and a separate `preview.html` are optional when real app routes already exercise all states.
- If `.agents/ADR/` exists, record the system rationale, token values, and rejected options in `proposed/design/` per `.agents/ADR/AGENTS.md`.
