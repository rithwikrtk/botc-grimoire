# Task 10 report: status timeline property tests

## What was implemented

One file, exactly as scoped: `test/property/statusTimeline.property.test.ts` — five `fc.property` families over generated night-by-night traces (Poisoner, Monk-protected, Butler-marked, with an optional Poisoner execution each day), asserting the §4.4 status-lifetime contract holds end to end rather than only in the `isStatusActive`/`expiryFor` unit tests from Task 3. No production code was created or left modified — `statusTimeline.ts` was not resurrected, per your explicit instruction.

The brief's code block was transcribed close to verbatim, with one substantive fix (below) to a defect the brief's own review process did not catch, because — as warned — it never ran.

## Defect found in the brief, and the fix

**The 4th property (`makes expiry independent of whether the source is alive`) failed as transcribed, but not for the reason it claims to test.**

The brief's `playTrace` gated the Poisoner's `STATUS_APPLIED` event on `if (poisonerAlive)`. That gate is realistic (a dead Poisoner can't act), but it broke the specific comparison this test performs: the `never` variant (Poisoner never executed) keeps applying a *fresh* poison mark every night, while the `early` variant (Poisoner executed after night 1) silently stops generating any new marks from night 2 onward. So at `cut >= 2` the two traces don't just differ in whether the source is alive — they differ in *how many poison marks exist at all*. Running the brief's code verbatim:

```
Counterexample: [[{"poisonTarget":0,"protectTarget":0,"masterTarget":0,"killPoisoner":false},
                  {"poisonTarget":0,"protectTarget":0,"masterTarget":0,"killPoisoner":false}]]
AssertionError: expected [] to deeply equal [ 'p1' ]
```
(`never` has a fresh night-2 poison mark on `p1`; `early` has none, because its Poisoner is already dead by night 2 and the gate suppressed the mark entirely.) This is a false failure: it says nothing about `isStatusActive`/`expiryFor` being actor-driven, only that the test's own trace generator diverges the two branches on an unrelated axis.

**Fix:** removed the `poisonerAlive` gate from the `STATUS_APPLIED` poison event, applying it unconditionally every night in both branches (matching how `protected` and `master` already do it unconditionally). `poisonerAlive` is now used only to guard against emitting a second `DEATH` for an already-dead Poisoner. This makes the `never` and `early` traces identical in every event except the `DEATH`, which is exactly what the invariant is about. After the fix, all five properties pass (see below), and the mutation evidence for this exact invariant (mutation 3) confirms it can still fail when the contract is genuinely violated.

I judged this a real brief defect (not a preference) rather than a NEEDS_CONTEXT escalation, because the fix is entirely inside the test file this task owns and does not touch any production code or change what the invariant asserts — it only removes an incidental confound from the harness.

## Non-vacuity: mutation counterexamples (one per named invariant)

Per your requirement, each of the three invariants named in spec §14 was independently proven capable of failing, by mutating the implementation under test, running the relevant property, capturing the shrunk fast-check counterexample, then reverting. `git status --porcelain` / `git diff --stat` on `src/engine/phase.ts` and `src/engine/reducer/applyEvent.ts` confirmed **no diff remains** on either file after each revert, and the full property file passes green after each.

### 1. "no player carries poisoned into day N+1 from a night-N Poisoner"

Mutated `expiryFor`'s `tonight_and_tomorrow` case in `src/engine/phase.ts` from `{ kind: 'day', number: appliedAt.number }` to `{ kind: 'night', number: appliedAt.number + 1 }` (poison lifetime extended one phase too far).

```
{ seed: -1422043677, path: "0:0:0:0:0:0", endOnFailure: true }
Counterexample: [[{"poisonTarget":0,"protectTarget":0,"masterTarget":0,"killPoisoner":false}]]
AssertionError: expected [] to deeply equal []
  - Expected: []
  + Received: [ 'p1' ]
```
`p1`'s night-1 poison wrongly still shows active at night 2. Reverted; `npx vitest run test/property/statusTimeline.property.test.ts` green (5/5) afterward.

### 2. "protection never survives dawn"

Mutated `expiryFor`'s `until_dawn` case in `src/engine/phase.ts` from `{ kind: 'night', number: appliedAt.number }` to `{ kind: 'day', number: appliedAt.number }` (Monk protection extended into the following day).

```
{ seed: 814967142, path: "0:0:0:0:0:0:0", endOnFailure: true }
Counterexample: [[{"poisonTarget":0,"protectTarget":0,"masterTarget":0,"killPoisoner":false}]]
AssertionError: expected [] to deeply equal []
  - Expected: []
  + Received: [ 'p1' ]
```
`p1`'s Monk protection wrongly still shows active at day 1. Reverted; suite green (5/5) afterward.

### 3. "expiry is independent of whether the source is alive"

Neither `isStatusActive` nor `expiryFor` reference source liveness at all (that's the point of §4.4's "declarative, never actor-driven" design), so there is no single-operator flip inside `phase.ts` that targets this invariant specifically. To produce a meaningful counterexample I temporarily introduced the actor-driven bug this invariant exists to catch, in `applyDeath` (`src/engine/reducer/applyEvent.ts`): on death, purge every status entry sourced by the dying player from every player's ledger.

```diff
  const withDead = mapPlayer(state, playerId, (p) => ({ ...p, alive: false }));
+ // purge any status this player sourced, the instant they die (actor-driven — the bug)
+ const withDead = { ...withDead, players: withDead.players.map(p => ({
+   ...p, statusLedger: p.statusLedger.filter(s => s.sourcePlayerId !== playerId),
+ })) };
```

```
{ seed: -902131173, path: "0:0:0:0:0:0", endOnFailure: true }
Counterexample: [[{"poisonTarget":0,"protectTarget":0,"masterTarget":0,"killPoisoner":false}]]
AssertionError: expected [ 'p1' ] to deeply equal [ 'p1' ]
  - Expected: [ 'p1' ]
  + Received: []
```
Executing the Poisoner (`early` branch) purges `p1`'s poison mark, while the `never` branch (Poisoner never executed) keeps it — exactly the actor-driven divergence the invariant forbids. Reverted; suite green (5/5) afterward.

## Non-vacuity: generated-trace distribution

Instrumented the generator temporarily with `fc.statistics` (added as a throwaway 6th test, run once, then deleted before commit — not part of the shipped file) at the same `numRuns: 200` used by the real properties, classifying each of the 200 generated traces on the three conditions load-bearing for this task:

```
spans night->day.............100.00%
kills source mid-poison.......84.00%
spans day->night (internal)...83.50%
no internal day->night span...16.50%
never kills source............16.00%
```

- **Spans night N → day N** (poison stays active across that boundary): 200/200 — guaranteed by construction (`minLength: 1`, poison always applied at night N with `tonight_and_tomorrow` expiry), and directly exercised.
- **Spans day N → night N+1 *within* the same trace** (the expiry/carry-over case, reached without the test's own manual extra `PHASE_ADVANCED`): 167/200 (83.5%) — requires `actions.length >= 2`, well represented.
- **Kills the Poisoner while a mark they placed that same night is still active** (the source-independence case): 168/200 (84%) — any `killPoisoner: true` action qualifies, since the `DEATH` always fires the same day the night's poison was applied and `tonight_and_tomorrow` poison is active through that whole day.

None of the three is zero or near-zero, so none of the invariants is being asserted vacuously.

## Test evidence

```
$ npm test
...
 Test Files  19 passed (19)
      Tests  243 passed (243)
```
(Up from 238/18 before this task — 5 new tests, 1 new file.)

```
$ npm run typecheck
> tsc --noEmit
(clean, exit 0)

$ npm run lint
> eslint .
(clean, exit 0)
```

All three commands were re-run after every mutation revert to confirm the tree was actually clean, not just visually reverted — `git status --porcelain` showed only the new test file as untracked throughout; `git diff --stat` on `src/engine/phase.ts` and `src/engine/reducer/applyEvent.ts` was empty after each of the three reverts.

## Judgment calls (not transcription)

- Removed the `poisonerAlive` gate on the Poisoner's `STATUS_APPLIED` event inside `playTrace` (see defect above) — the one substantive deviation from the brief's code block.
- Chose to demonstrate mutation 3 by temporarily mutating `applyDeath` in the reducer rather than `phase.ts`, since the invariant it tests has no representation inside `isStatusActive`/`expiryFor` to mutate — the absence of any actor-liveness parameter there is itself the correct design, not a gap. Reverted in full; confirmed via `git diff --stat`.
- Left the `fc.statistics` instrumentation out of the committed file — it was informational-only scaffolding to answer your report requirement, not a permanent part of the suite, and its presence would have added a `console.log`-only "test" with no assertion value to the pristine suite.
