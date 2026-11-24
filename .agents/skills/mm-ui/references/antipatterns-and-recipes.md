# Antipatterns, Craft & Component Recipes

Read this file when building standard UI components, implementing empty/loading/error/edge states, or diagnosing and fixing an existing interface.

## 1 · Diagnostic Order & Review Checklist

When auditing or fixing an interface (**Refine** / **Review**), sweep in this order and **stop at the first dimension that explains the symptom** (later symptoms are usually downstream):

1. **Hierarchy** → 2. **Layout & Spacing** → 3. **Typography** → 4. **Color** → 5. **Depth** → 6. **Images & Graphics** → 7. **Finishing Touches**

When reviewing (**Review**), audit from rendered screenshots (`1440px` + `400px` + states via `scripts/shoot.py`) and source code against **CRAP + State Coverage**:
- **Contrast**: clear rank between primary, secondary, tertiary text/actions + WCAG contrast (`4.5:1` / `3:1`).
- **Repetition**: consistent token scales, `<= 2` active radii, consistent interaction patterns.
- **Alignment**: shared grid axes and `baseline` alignment on mixed text rows.
- **Proximity**: group gap > inner gap; no orphaned labels or actions.
- **Cognitive load & states**: 1 primary action, progressive disclosure, zero horizontal overflow, realistic domain data (never `Lorem ipsum`), and explicit `empty / loading / error / edge` handling.

## 2 · Symptom → Root Cause → Fix

| Symptom | Fix |
|---|---|
| Everything has similar size/weight; no focal point | Rank content primary/secondary/tertiary; carry hierarchy via weight (`400/500` vs `600/700`) and 3 text colors, not giant headings. |
| Grey text on a colored background looks muddy or washed out | Do not use grey or lowered `opacity` on colored surfaces; hand-pick a same-hue low-contrast tint (or rotate toward `60°/180°/300°`). |
| Row of equally heavy buttons / loud delete button | 1 solid primary, a few outline secondary, rest tertiary links; demote destructive actions until the confirmation modal. |
| Every datum rendered as `Label: value` | Drop obvious labels, merge `"12 left in stock"`, or demote labels visually; invert only in spec tables. |
| Cramped layout or ambiguous label-to-input gaps | Start with excess space and subtract; pull off-scale values onto the spacing scale; make between-group gaps visibly larger than within-group gaps. |
| 600px content stretched across 1400px / card wider on laptop than monitor | Constrain `max-width` (`45–75ch` prose, bounded main column) or split into columns; fix sidebar width and let main flex. |
| Sizes 13/15/17/19 or nested `em` drift; `1.5` line-height everywhere | Snap to scale (`12 14 16 18 20 24 30 36 48 60 72`) in px/rem; drop headline leading to `1.0–1.1`, raise wide/CJK prose to `1.6–1.75`. |
| Mixed font sizes on one row look misaligned vertically | Align on `baseline`, not `center` (icon-only controls/buttons excepted). |
| Long paragraphs centered; numbers hard to scan in tables | Left-align past 2–3 lines (or shorten copy); right-align table numbers (`tabular-nums`). |
| Dirty blurry shadows; every card lifted; flat sticker inputs | Raised = hand-picked lighter top edge + sharp small bottom shadow; inset inputs = top dark inset shadow + lighter bottom lip. Assign 5-step elevation by z-position; siblings usually need none. |
| Every box outlined with borders | Replace redundant borders with background contrast, subtle shadow, or extra spacing (`if both bg difference and border exist, drop the border`). |
| Text illegible over photos; clunky upscaled icons; cropped/bleeding avatars | Lower photo dynamic range (overlay / lower contrast + brightness / desaturate + `multiply` / zero-offset large-blur glow). Enclose 16–24px icons in colored shapes instead of scaling 3–4×. Crop avatars via `object-fit: cover` / `background-size: cover` + subtle inner shadow/semi-transparent inner border. |

## 3 · Depth, Images & Finishing Techniques

- **Light comes from above**: raised elements reveal a lighter top edge (hand-picked color, never semi-transparent white) + sharp dark shadow below; inset elements (inputs, checkboxes) have a dark top inset shadow + lighter bottom lip.
- **Two-part shadows**: pair a larger soft cast shadow with a tighter darker ambient-occlusion shadow directly beneath; fade the ambient layer as elevation rises.
- **Flat depth & overlap**: use lighter/darker same-hue surfaces or zero-blur vertical solid shadows (`0 2px 0 ...`). Overlap cards across background transitions or layer avatars with an invisible border matching the page background.
- **Finishing without redesigning**: replace generic bullets with domain icons; enlarge/recolor quote marks; style custom checkboxes/radios and hover underlines; add a crisp accent border (`card` top, `active nav`, `alert` left edge, short headline underline); break up flat backdrops with `<= 30°` gradients or low-contrast edge patterns/geometry.
- **Think outside standard widgets**: split dropdowns into sections/columns with supporting text and icons; merge related table columns for hierarchy; turn important radio groups into selectable cards.

## 4 · Canonical Component Recipes

*(Replace `primary` / `neutral` / `danger`, spacing `N1..N6`, and type `T1..T5` with the project's semantic tokens and scale steps.)*

- **Button**:
  - `primary`: `--accent` bg, `--accent-fg` text, `padding 12/24`, `radius md`, `weight 600`; hover drops 1 shade (`--accent-hover`, never opacity alone).
  - `secondary`: transparent bg, `1px --border`, `--text-secondary`; hover darkens border/text 1 shade.
  - `tertiary`: no bg/border, `--accent` text, tighter inline `padding 8/12`.
  - Sizes `sm 8/16`, `md 12/24`, `lg 16/32` (large buttons scale padding disproportionately). Disabled: `--disabled-bg` / `--disabled-fg`, no shadow. Focus: `2px` `:focus-visible` outline + `2px` offset.
- **Form Group & Accessibility**:
  - Label (`T2`, `weight 500`, `--text-secondary`) → Input (`height 36–40px`, `padding N2/N3`, `radius md`, `1px --border-strong`, top inset shadow) → Help (`T2`, `--text-muted`, `N1` gap) or Error (`T2`, `--status-error-fg`, `N1` gap). Group-to-group gap (`N5`) must be at least 2 scale steps larger than label-to-input gap.
  - Every input needs `<label for>` or `aria-label` (**placeholder is never a label**). Mark required fields with words, not a lone red asterisk. Errors require `aria-invalid="true"`, `aria-describedby`, and **actionable recovery copy** (never *"invalid input"*). Group related inputs with `<fieldset>` / `<legend>`.
- **Card**:
  - `--surface-raised` on `--surface` (drop redundant border when bg differs), `padding N4`, `radius md/lg`, explicit `max-width`, 1 primary action. Only lift interactive/featured cards with the lowest elevation step.
- **Empty State**:
  - Low-contrast geometric mark or illustration + title (`T4`) + 1-line explanation (`45–75ch`) + 1 primary CTA. **Hide tabs, filters, and search controls that do nothing while empty.** Never ship a bare `"No data yet"` line.
- **Table**:
  - Header (`T2`, `--text-muted`, `weight 500`, `1px` bottom border); cells (`T2`, `vertical padding N2`); numbers right-aligned; separate rows via subtle zebra bg or spacing rather than heavy horizontal rules. Merge related fields into multi-line cells, show `—` for empty cells, and limit row actions to 1 explicit action + overflow menu.
- **Dropdown**:
  - `--surface-raised`, `radius md`, medium elevation (step 3), `padding N1`, items `>= 32px` height, `1px` divider only between groups, subtle bg change on hover (keep text color stable).
- **Modal**:
  - Scrim `neutral-900` ~40% opacity, panel `max-width 480–560px`, `padding N4`, `radius lg`, high elevation (step 5), top-right close button + **`Escape` closes**, actions bottom-right with primary last. For destructive actions, state the consequence in the title and keep Cancel clearly available.
- **Alert**:
  - `100`-step tinted background + `4px` left accent border (`500`-step) + `800/900`-step dark text (`>= 4.5:1`), status icon alongside text (never color alone), optional tertiary action (`Undo`) on the right.

## 5 · Loading, Error, Edge States & Browser Capture

- **Loading thresholds**: `< 300ms` show nothing (avoid spinner flicker); `300ms–1s` inline spinner or skeleton; `> 1s` content-shaped skeleton matching real loaded dimensions (prevent layout jump); `> 10s` progress indicator + cancel action.
- **Truncation**: use single-line `ellipsis` only in strictly single-line slots; multi-line uses explicit `line-clamp`; **always provide a reveal path** (tooltip, expand, or detail view) so truncation never deletes content.
- **State hooks for `scripts/shoot.py`**: in standalone HTML prototypes or preview pages, expose `?state=empty|loading|error|edge` or clickable `[data-state="<state>"]` triggers so `shoot.py --states default,empty,loading,error` can capture and audit every state automatically.
