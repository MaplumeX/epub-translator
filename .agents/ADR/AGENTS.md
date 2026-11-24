# ADR standard

This directory holds decisions, not documentation. A record captures what was
chosen, what was rejected, and what it cost — the parts code, tests, and docs
cannot carry. If the answer is visible in the code, it does not belong here.

## Layout and naming

```
.agents/ADR/{lifecycle}/{class}/yyyy-mm-dd-topic-title.md
```

Both axes live in the path, so the tree is the index. Never add an `INDEX.md`: it
duplicates path metadata and makes unrelated note changes contend on one file.

**Lifecycle** is the top-level folder, and the folder *is* the status:

- `proposed/` — worth doing, not built yet (or only partly).
- `implemented/` — shipped. Kept current with reality: when code moves a file,
  renames a package, or changes a default, update the note's facts in the same
  change. Facts only — never rewrite the decision itself.
- `rejected/` — considered and declined. Create this folder only the first time a
  tempting, plausible mistake needs its rationale preserved; otherwise delete the
  proposal.
- `archived/` — a frozen snapshot of an `implemented/` record that no longer guides
  future work but still has historical value. Never current authority. Create it
  when the first record enters it, and ignore it in `.rgignore` so stale facts stay
  out of default repository searches.

**Class** is the kind of decision. The set is closed — adding one means editing
this file:

| Class | Covers |
|---|---|
| `architecture` | How modules relate, the vocabulary of the system, public seams. |
| `feature` | A new user- or model-facing capability. |
| `bug-fix` | Corrects a defect, or closes a gap that let one happen. |
| `design` | The visual system: type and spacing scales, color ramps, radius and elevation scales, component contracts. |
| `process` | Tooling, gates, workflow around the code — not runtime behavior. |

The `bug-fix` / `feature` line: a bug fix restores behaviour that was already
intended; if the intent itself is new, it is a `feature`. A fix that only changes
the mechanism becomes a record when the defect's cause is worth not repeating.

The date is when the topic was **first proposed**, per git history. Superseding a
decision means adding a new file, never rewriting the old one into its opposite;
keep active records cross-linked (archived records stay frozen, linked from the
new record).

## File format

The first three lines are exactly:

```markdown
# ADR: <title>

Status: <status>
```

followed by a blank line. `Status:` must agree with the folder; the filename holds
the proposal date, and the archive date is the one date recorded in the file:

- `Status: proposed`
- `Status: implemented`
- `Status: rejected — <one line why>`
- `Status: archived`

For `archived/`, the line immediately below `Status: archived` is
`Archived: YYYY-MM-DD`, and only then the blank line. Every other status is
followed directly by the blank line.

Body skeleton, by lifecycle.

`proposed/`:

```markdown
## Problem
## Proposal
…bespoke sections…
## Alternatives considered
## Acceptance criteria
## Risks
```

`implemented/`:

```markdown
## Problem
## Decision
…bespoke sections…
## Alternatives considered
## Consequences
```

`archived/` keeps the `implemented/` skeleton verbatim — archiving changes metadata
only, never prose.

`## Problem` is written to stand without the solution. `## Proposal` may speak in
the future tense; `## Decision` describes shipped reality in the present tense.
Proposal-era headings (`## Proposal`, `## Plan`, `## Acceptance criteria`, `## Risks`)
must not survive into `implemented/` — fold them into `## Decision` and
`## Consequences`.

## Alternatives considered

Every record names each alternative that was actually on the table and why it lost:
one bold-led paragraph per alternative, or a `### Why not <X>?` subsection for
contested ones. Candidates raised during planning, dismissed in an earlier record,
or present in the code and rejected here — if you cannot point at where it was
proposed, delete it. An invented option fabricates a deliberation that never
happened, and a later reader will trust it.

A decision written without what it beat invites re-litigation, which is the failure
these records exist to prevent. But a space that was genuinely one-way says so:

```markdown
None considered — <why only one direction fit>.
```

## Plans

A plan is an execution attachment to one or more `proposed/` records, not a record
itself. The records carry the decisions, the alternatives, and the consequences; the
plan carries steps, verification, and prerequisites. A plan that restates the
rationale has created a second copy that will drift, so it links the records instead.

- One plan per delivery, named `yyyy-mm-dd-<delivery-slug>.plan.md` at the root of
  `proposed/` (sibling to the `{class}/` folders). With a single record the slug is
  the record name, so the two filenames match.
- Header is `# Plan: <title>`, then one `ADR:` line per decision this delivery lands
  using relative paths into `{class}/` (e.g. `feature/2026-11-18-auth.md`). The first
  is the primary record.
- `Depends on:` (optional) lists prerequisite ADR(s) whose delivery must complete
  before this plan runs; `Constrained by:` (optional) lists records that bind the
  work without shipping in it. Always link the ADR (`.md`), never its `.plan.md`
  (plans are deleted when their ADR records are promoted to `implemented/`, while
  ADR links are updated automatically). While a `Depends on:` or `Constrained by:`
  target remains in `proposed/`, it blocks execution of the dependent plan.
- Every listed `ADR:` record ships with this plan. A record that half-shipped stays in
  `proposed/` — `implemented/` means delivered, not attempted — and is removed from
  the header before promoting the rest.
- Plans exist only in `proposed/`. Finding a plan outside `proposed/`, or lingering
  after its `ADR:` records moved to `implemented/`, means promotion and cleanup were
  left incomplete.
- Plans are edited freely — they are working state, not history.
- Delete the plan in the same change/PR that promotes its records to `implemented/`.
  Git holds the history; a retained plan becomes a second source of rationale.
- When the direction changes, the records are superseded and the old plan is deleted.
  A plan never migrates to different records.
- Decisions already made and shipped directly in a change may be written straight
  into `implemented/` without passing through `proposed/` or a `.plan.md`.

## Moving between lifecycles

Moving a file means updating `Status:` and re-satisfying that folder's skeleton in
the same change. `proposed/` → `implemented/` rewrites `## Proposal` into a
present-tense `## Decision` and folds `## Acceptance criteria` and `## Risks` into
`## Consequences`. `proposed/` → `rejected/` only adds the reason to `Status:` and
freezes the file. `implemented/` → `archived/` changes no prose at all — see
[Archiving](#archiving).

## Supersession and consolidation

**Every new or promoted `implemented/` record triggers a supersession check.**
Search active records covering the same decision, mechanism, or rejected
alternative and classify every full or partial overlap in the same change/PR:
archive or delete qualifying `implemented/` records (per [Archiving](#archiving)),
keep partial supersessions active and cross-linked, reject obsolete `proposed/`
records, and delete `rejected/` records that no longer prevent a plausible mistake.

Superseding a decision adds a new record; it never rewrites the old file into its
opposite, and never lets git history be the only copy of the old rationale. If the
superseded record remains active in `implemented/`, keep both cross-linked. If it
is archived alongside the superseding change (per [Archiving](#archiving)), the
new record links to the archived copy while the archived file's prose remains
frozen untouched.

A fully superseded `implemented/` record may be consolidated into the current owner
and deleted, but only when the owner preserves every unique rationale, alternative,
consequence, required verification, and named coverage gap, and every inbound link
is repaired. Partial supersession does not qualify: keep both, linked. Consolidation
must not reverse the old decision's meaning.

## Archiving

Delete rather than archive an `implemented/` record that covers only small UI
adjustments or purely mechanical changes (and repair or remove inbound links). Move
other `implemented/` records to `archived/` only when the decision is fully
shipped, its rationale is unlikely to guide future work, and it still has
historical value. Keep it active instead when any of these is still load-bearing:
alternatives, ownership boundaries, negative guarantees, durable or wire semantics,
security rules, or conditions for reintroduction.

Judge every record semantically — never archive by age, word count, or quota.
Archiving happens in two places: inline in the same change/PR whenever a new or
promoted `implemented/` record supersedes or retires an older one, or on demand
when auditing stale records.

Never archive a `proposed/` record — reject or delete it. Keep a `rejected/` record
only while it prevents a tempting, plausible mistake; otherwise delete it and
repair or remove inbound links.

Archiving changes exactly two things: the file moves to `archived/{class}/`, and
`Status: implemented` becomes:

```markdown
Status: archived
Archived: YYYY-MM-DD
```

Nothing else in the file changes. An archived record keeps the `implemented/`
skeleton, is permanently frozen — never edited, reformatted, moved, or deleted —
and is not authority for current behaviour. Active records may still link into the
archive when citing history; never validate or repair outbound links inside
`archived/`. Keep `.agents/ADR/archived/` in `.rgignore` so frozen snapshots do not
pollute default repository searches (query the archive directory explicitly when
history is needed).

## Cross-references

Link other records with relative markdown links, never bare numbers or prose:
`[the storage decision](../architecture/2026-03-04-session-storage.md)`. Links stay
mechanically checkable and survive moves between folders.

A record in the same folder is linked by bare filename; anything else is relative
from the record's own folder, so `../../` reaches the ADR root. Pointing out to code,
docs, or a plan works the same way — the link carries the address, the sentence
carries the reason.

Link text names the decision (`[the storage decision]`), not the action
(`[see here]`). State the relationship in the sentence — supersedes, constrained by,
deferred — because a link alone does not say whether two records agree.

## References from code

A comment references a record only when the code cannot explain its own constraint,
and it leads with the consequence:

```ts
// Reads ordering before spawn. Dropping it silently disables range termination.
// See ADR 2026-06-11-dev-invariants-over-deep-readonly.
```

Use `ADR <date>-<slug>`, not a path — paths break on lifecycle moves, the slug
survives them. Never restate the rationale, and never put a record reference in a
public API doc comment: that is a contract for callers, not history for maintainers.

## Language

Paths, `Status:` values, and section headings stay in English — they are the
machine-checked structure. Prose is written in the language you think in; mixing
languages across records is fine, mixing heading vocabulary is not.

## What not to record

Local UI tweaks, purely mechanical refactors, and anything fully explained by the
code or its tests. A small change is not exempt when it decides something durable.
