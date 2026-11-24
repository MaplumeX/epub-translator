# Modes

Variants of planning that do not need the round-by-round loop. Pick one at the
gate; if you are unsure, the full loop is the safe default because an unnecessary
question costs less than an unnecessary rewrite.

## Lightweight

Use when the problem is defined and the only open question is how to fix it.

- Name the brute-force version in one line first.
- Recommend one fix in 2-3 sentences: what changes, where (file:line if known), why.
- List the files involved; say so explicitly if it is more than eight.
- State one risk.
- Wait for approval.

Do not run rounds here. Do not produce the full output template. Upgrade to full
mode the moment you find three or more genuinely different approaches with
meaningful tradeoffs — at that point the choice is the plan.

## Evaluation

Use for "should we build this", "is this worth it", "do we keep this". One target,
one verdict. Do not produce an implementation plan unless the verdict is to build
and the user asks for one.

Structure:

- **Verdict** — build / don't build / build the smaller thing.
- **Why** — the two or three facts that decide it, not a survey.
- **What would flip it** — the specific evidence that would change the verdict.
  A verdict with no flip condition is an opinion.
- **Cheapest test** — the smallest thing that produces that evidence.

Judging value is not judging difficulty. A thing can be easy and worthless, or hard
and necessary; say which question you are answering.

Exit condition: stop once the verdict, flip condition, and cheapest test are
delivered. If the verdict is `don't build` for a tempting idea likely to be
re-litigated and `.agents/ADR/` exists, offer to record it under `rejected/`.
If the verdict is `build` (or `build the smaller thing`) and the user wants to
plan execution, transition to Full mode.

## Triage

Use when the input is a bundle of independently acceptable or rejectable asks —
a list of feature requests, a pile of screenshots, "are these worth doing".

One table, one row per item, no prose between rows:

| Item | Verdict | Why | Cost |
|---|---|---|---|

Then order only the accepted items, and say what the first one buys. Do not merge
items to make the list shorter; the user needs to see each one judged.

Exit condition: stop once every item has a verdict, accepted items are ordered,
and the first item's payoff is stated. If the user selects an accepted item to
plan, transition to Lightweight or Full mode for that item.

## Attack angles

Run only when the plan involves external dependencies, high concurrency, or data
migration. Skip them for local, single-process changes — a plan that survives
attacks nobody will launch is just longer.

| Angle | Question |
|---|---|
| Dependency failure | If this API, service, or tool is down, what degrades and what fails? |
| Scale explosion | At 10x data or load, which step breaks first? |
| Rollback cost | If the direction is wrong after shipping, what state can we return to? |

If an angle holds, deform the design to survive it. If it shatters the approach,
discard it and say why. Never present a plan that failed an angle without
disclosing the failure.

## Routing out

These are not planning problems, even when phrased as one:

- "Why is this broken" / a stack trace / a flaky test → diagnosis.
- "Is this a bug or expected" → diagnosis.
- "Make this faster" with a measured regression → diagnosis.
- "Clean up this file" with no behavior question → implementation, not planning.

Say which one it is in a single line, then stop. Planning on top of an undiagnosed
defect produces a plan for the wrong problem, and the user pays for it twice.
