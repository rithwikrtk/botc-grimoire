# Final whole-branch review A — the PRE-RESET agent's report (summary only)

**Provenance.** Two independent opus whole-branch reviews ran on this branch. Review A was
dispatched in the session before the reset and was still in flight at handoff; the handoff said so.
When I checked for `final-review.md` at session start it did not exist, so I re-dispatched — that is
review B. Review A then completed and wrote its 225-line report to `final-review.md`; review B
completed later and **overwrote that file**. So `final-review.md` now holds review B. This file is
all that survives of review A, reconstructed from its returned summary. Its full report is lost.

**Verdict: With fixes. 0 Critical · 5 Important · 7 Minor.**
Method: ~50 single-line mutations against production guards, run on a `git archive HEAD` copy in a
scratch dir (repo untouched). **43 caught**, including every guard in §4.5's kill chain, all four
§4.7 rows clause by clause, §4.4's inclusive comparison, the Scarlet Woman threshold, both
`onDemonDeath` preconditions, `threshold` ceil, `voteOrder` orientation both ways, Baron draw order.

## Its five Important findings (all seven wave items came from here)
1. `deal.ts:351` — `validateDeal` never checks the Drunk's believed character is a Townsfolk; a
   believed `'imp'` makes the Drunk win the Imp step's per-night key and the real Imp never kills.
   **Review B independently confirmed this fix as "a genuinely good fix I had missed".**
2. `resolvers.ts:378` — the Undertaker offers no `registration` answer, unlike the Ravenkeeper.
   **Review B reviewed the landed fix and accepted it.**
3. `eslint.config.js:28` — the `ignores` entry for the barrel is not a stale comment, it is the
   exemption that would let the barrel re-export the two §4.1-restricted names with no lint error.
   **Both reviews agree; B verified lint stays clean with the entry deleted.**
4. Three guards deletable with all 501 green: the dead-Butler exemption (`nominations.ts:87`),
   `bySeat`'s sort (`players.ts:22` — the seating ring has no witness anywhere), and the
   backwards-`PHASE_ADVANCED` throw (`applyEvent.ts:271`).
5. `ROLE_CHANGED.reason` written at four call sites, observed by no test at any of them.
   **Review B reached the same finding independently (its I2) by inverting the ternary at all four.**

## Triage and audit
Deferred-minor triage: **0 must-fix · 17 should-fix · 28 leave**, all 45 accounted for.
(Review B triaged the same 45 as **4 must-fix · 11 should-fix · 30 leave** — its four must-fix are
#4 abilityText snapshot, #23 `showCard` spec amendment, #33 = its C1, #38 the eslint entry.)
Rulings audit: R5 accepted after checking both failure modes against the code; Task 8 Ravenkeeper
tuple confirmed right and both prior expert reviews wrong (mutation-CAUGHT); Task 16 barrel removal
"right ruling, landed short"; Task 17 `cause` narrowing correct with all four consequences traced;
R23/R24 agreed and R23 re-derived independently; the §18 self-correction reached independently.

## Where the two reviews differ — recorded, because the difference is the point
- **A found 0 Critical; B found 1** (a second `closeDay` executes the runner-up nomination). A read
  the `closeDay` re-entrancy as a should-fix minor and reasoned it "harmless because `nomineeAlive`
  filters the dead nominee". **B is right and A is wrong**: the filter removes only the player who
  already died, so the runner-up wins the recomputation. I verified the mechanism myself in
  `dayCommands.ts:118-176` before extending the wave.
- **A found four Importants B did not** (the Drunk-belief check, the Undertaker, and two of the
  three suite-green guard deletions), and B says outright it had missed the first.
- They disagree on the four-site demon-death duplication: A says extract now, B says leave but
  agrees the untested `reason` ternary is what the duplication cost. Extraction proceeds — it gives
  that ternary one witness instead of four unobserved copies, which is what both actually want.

**Lesson, recorded because it is the reusable one.** Two opus whole-branch reviews of the same tree,
same instructions, produced overlapping but non-identical finding sets, and **each found real
defects the other missed — including a Critical**. A single final review is a sample, not a verdict.
The accidental duplication here was worth more than either review alone.
