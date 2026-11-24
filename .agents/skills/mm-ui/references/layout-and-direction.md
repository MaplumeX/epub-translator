# Layout, Hierarchy & Direction

Read this file when defining visual direction for a new surface, exploring structural layout options, or building responsive/workbench/scroll-narrative layouts.

## 1 · Aesthetic Direction & Peer Benchmark

For a new product or major surface, do a fast **2–3 peer benchmark**:
- Pick 2–3 distinct category peers (not clones of one template), extract concrete traits (radius philosophy, surface-depth treatment, color weight, typography pairing), and state **what category convention to keep** (muscle memory) and **what convention to break** (distinct point of view).
- **Name a concrete material, scene, or character** — never stop at vague adjectives like *"clean"*, *"modern"*, *"minimal"*, or *"premium"*. Examples: *rough newsprint broadsheet*, *anodized aluminum cockpit*, *warm analog ledger*, *terse CLI utility*. If a user cites a product ("like Linear"), extract its concrete radius, surface-depth, and accent rules instead of treating the name as a spec.
- **State a 3-line direction** before writing markup:
  - **Visual thesis**: mood, material, and energy in one sentence.
  - **Content plan**: sequence of sections/states (dashboards and apps start with status/action, not a marketing hero unless requested).
  - **Interaction thesis**: 1–2 signature micro-interactions, or `none` with an evidence-based reason.
- Inside a mature product, inherit the existing direction from `DESIGN.md` and sibling components unless a deviation is explicitly justified.

### Absolute Bans & AI Slop Tells
Avoid these machine-generated reflex patterns unless explicitly justified by the direction:
- **Thick side-border accents** on cards (use background step, elevation step, or nothing).
- **Gradient text** (illegible edges, contrast failures; use solid high-contrast color).
- **Default glass / frosted cards** on flat pages (grey smear without a rich backdrop).
- **Purple-to-blue or cyan-on-dark gradients** without brand justification.
- **Three identical rounded shadow-cards in a row** (vary emphasis by importance, or use a list/table/split layout).
- **Modals for ordinary overflow** (use inline expansion, drawer, or dedicated route).
- **Motion bans**: never `transition: all` (name properties explicitly); never animate layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`) — animate `transform` and `opacity` only.
- **Default reflex check**: Inter/system font with no reason, ungrounded gradients, centered hero with two side-by-side CTAs, identical 3-card row, generic top navbar.

## 2 · Structural Exploration (When Layout Is Open)

- **Start with a real feature, not the navigation shell**: build one core workflow first; the right shell emerges from real features.
- **Work in low fidelity / grayscale first**: spacing, size, and contrast should carry hierarchy before color or shadows enter. Keep early sketches disposable; design the **smallest shippable version** without implying unbuilt features.
- When exploring options, propose **2–3 genuinely distinct directions** differing across at least two axes:
  1. **Layout architecture** (e.g., fixed sidebar + bounded main vs single-column progressive flow vs split-pane master-detail vs multi-panel workbench);
  2. **Primary interaction model** (inline editing vs slide-over drawer vs command/keyboard-first vs step wizard);
  3. **Information density tier** (`compact` analyst/tool vs `standard` SaaS vs `spacious` editorial/focused).
- Never present 3 clones that share one skeleton and only swap colors or radii. Include ASCII wireframes, state handling (`empty` / overflow), explicit `max-width`, trade-offs, and **1 clear recommendation**.

## 3 · Hierarchy, Spacing & Typography Craft

### Hierarchy
- **Emphasize by de-emphasizing**: if the primary element or active nav item will not stand out, soften competitors instead of making the primary louder. At section scale, remove a competing sidebar's background rather than restyling its contents.
- **Three text colors + two font weights**: dark primary, grey secondary, lighter grey tertiary; `400/500` normal vs `600/700` emphasis (never `< 400` for UI text). Never rely on font size alone.
- **Labels are a last resort**: omit labels when format/context speaks (`janedoe@example.com`, `$19.99`, role subtitle under a name), or merge label + value (*"12 left in stock"* instead of *"In stock: 12"*). When labels are necessary, make them smaller/lighter — invert only on spec tables where users scan for the label.
- **Separate document semantics from visual size**: choose `h1`–`h6` for accessibility/structure, style for hierarchy (section headings often act like small labels).
- **Balance weight and contrast**: heavy solid icons cannot change weight — lower their contrast; if a `1px` border is too subtle and a darker color feels harsh, thicken to `2px`.
- **Action pyramid**: 1 primary (solid high-contrast), a few secondary (outline or subtle fill), several tertiary (link-styled). Demote destructive actions by default and save the loud danger treatment for the confirmation step.

### Spacing & Width
- **Start with too much white space, then subtract**: adding until it stops looking broken always undershoots. Dense UIs must be a deliberate choice.
- **Design narrow (~400px) first** and adapt upward; give components an explicit `max-width` so cards never grow wider on a mid-size screen than on a large monitor.
- **Do not fill wide canvases**: keep 600px content at 600px (or split into columns like form + helper column). Use full width only when content genuinely requires it (data tables, canvas editors).
- **Fixed sidebars, fluid main**: size sidebars to their content; let the main column flex and constrain inner prose/forms.
- **Large elements shrink faster than small ones**: never derive button padding or heading scale strictly from `em`; large buttons need disproportionately generous padding, and gaps must compress on mobile.
- **Group gap > inner gap** (both vertical and horizontal): applies to label/input pairs, heading/section pairs, list items (item gap must exceed line-height), and horizontal control groups.

### Typography
- **Measure**: keep body copy at `45–75ch` (`20–35em`), even inside wider containers alongside media.
- **Baseline alignment**: align mixed font sizes on the **baseline**, not vertical center.
- **Proportional line-height**: rises with line length (narrow `~1.5`, wide up to `2.0`) and falls as font size grows (large headlines `1.0–1.1`). For CJK text, glyphs fill more of the em box, so test rhythm on actual CJK copy and give slightly looser leading (`1.6–1.75`) for body prose.
- **Link-dense UIs**: use weight or darker color instead of bright link blue everywhere; reveal underline/color on hover for peripheral links.
- **Alignment & tracking**: left-align copy past 2–3 lines (or rewrite shorter rather than centering); right-align table numbers; hyphenate justified text; tighten letter-spacing slightly when using a body face for headlines (never loosen headline faces for body text); add letter-spacing to all-caps labels.

## 4 · Responsive, Workbench & Narrative Layout Patterns

- **Fluid viewport rhythm (`clamp()`)**: never scale a `1440px` desktop layout 1:1 down to mobile (keep body `>= 16px`, targets `>= 44×44px`). Use `clamp(min, preferred, max)` for display type (`clamp(30px, 4.5vw, 60px)`) and section vertical padding (`clamp(32px, 6vw, 96px)`), keeping `min`/`max` on the project scale.
- **App workbenches (`>= 1024px`)**: use `100dvh` (not `100vh`) to avoid mobile chrome clipping; give independent scrolling columns `min-height: 0; overflow-y: auto;` inside the shell; **below `1024px`**, disable locked `100dvh` inner scrolls and collapse to single-document vertical flow.
- **Marketing & scroll narratives** (only when explicitly building landing/editorial pages): pair a constrained scrolling text column (`45–65ch`) with a `position: sticky; top: 96px;` visual stage that reserves explicit `aspect-ratio` / `min-height` to avoid layout shift; animate `transform`/`opacity` only (`200–300ms`, `8–16px` travel); disable parallax/scrubbing under `prefers-reduced-motion`; unpin sticky stages below `768px` into sequential beat → visual pairs.
