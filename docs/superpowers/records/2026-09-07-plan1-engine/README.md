# Plan 1 (engine) — execution records

What Plan 1 actually cost to build, kept because the reasoning is not recoverable from the
diff. 18 tasks, 42 commits, 538 tests, two independent whole-branch reviews, one fix wave,
one clean scoped re-review.

The spec these argue from is [`../../specs/2026-09-07-botc-storyteller-app-design.md`](../../specs/2026-09-07-botc-storyteller-app-design.md);
the plan is [`../../plans/2026-09-07-botc-slice1-plan1-engine.md`](../../plans/2026-09-07-botc-slice1-plan1-engine.md).
The spec is the binding authority; the plan is its argument.

## What is here

| File | What it is |
|---|---|
| `execution-ledger.md` | The full ledger, ~3,600 lines. **Every one of the 90 rulings with its complete reasoning and what it costs if wrong**, plus the pre-flight conflict scan and all 45 deferred minors. The source of record. |
| `final-review-B.md` | Whole-branch review B, 547 lines. Found the branch's only **Critical**, 6 Important, 7 Minor, triaged all 45 deferred minors, audited all 70 task-level rulings. |
| `final-review-A-summary.md` | Whole-branch review A — **summary only; its full report is lost.** See "Two reviews" below. |
| `fix-wave-report.md` | The single fix wave: 14 items, each with red-then-green mutation evidence. |
| `deferred-minors.txt` | The 45 deferred minors with their original reasoning, as handed to both reviews for triage. |
| `task-reports/` | The 18 implementer reports, fix rounds appended. Per-task evidence. |

Not kept: the 18 task briefs (extracts of the committed plan) and 35 generated diff packages
(~3.5 MB, reconstructible with `git diff`).

## Two reviews ran, and it is the most useful thing that happened

A review dispatched before a session reset was still running when a second was dispatched in the
belief the first was lost. Both were the same most-capable model, same tree, same instructions;
both mutation-tested; both traced consequences to the table. **Their finding sets overlap but are
not the same, and each found real defects the other missed.**

- **A** found the Drunk-belief hole (a Drunk believing `'imp'` silently cancels the Demon's kill
  for the rest of the game), the Undertaker's missing registration answers, and three guards
  deletable with the whole suite green. It found **no Critical**.
- **B** found the only Critical: a second `closeDay` on the same day **executes the runner-up
  nomination** — two executions from one day's votes, a phantom execution the Undertaker reads
  that night, and on a Saint runner-up it hands evil the game. **A had looked directly at that
  same re-entrancy and reasoned it harmless**, on a premise that is wrong in one clause.

A's report was overwritten by B's before it was copied. That loss is recorded rather than tidied
away; `final-review-A-summary.md` is its returned summary, which was enough to act on because the
fix wave had already been dispatched from it.

**The reusable lesson: a single final review is a sample, not a verdict.** On a branch whose
dominant defect shape is *a guard that cannot fail*, the second reader is not redundancy — it is
the only thing that catches a *reviewer's* reasoning error.

## The technique that found nearly everything

Both reviews reported the same thing: every finding neither could have got from reading came from
the **guards → tests** direction — delete a guard, run the suite, see whether anything reddens.
Six real guards on this branch had no witness. The inverse sweep (**tests → mutations**) was
already habitual and structurally cannot find them.

One caveat the fix wave established, and it matters: **a surviving mutation is ambiguous.** It
means only "no test distinguishes this line" — which is equally consistent with an *unwitnessed
guard* and a *redundant* one, and the two want opposite fixes. Review A misread a redundant
dead-Butler check as an unwitnessed guard on exactly this ambiguity.

## Provenance note

These files are kept **byte-for-byte as produced**, deliberately — they are evidence, and editing
them for tidiness would undermine that. Consequently they contain absolute paths from the machine
they were produced on, and reference a copy of the Trouble Brewing storyteller guide that lives
outside this repo. Nothing was curated, redacted, or rewritten after the fact.
