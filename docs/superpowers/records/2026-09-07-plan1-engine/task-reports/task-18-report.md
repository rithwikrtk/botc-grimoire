# Task 18 report — advisory invariants, answer-class enforcement, scripted full game

Status: **DONE**
Commit: `7379b6d` (parent `b14052c`, `main`, not pushed)
Test summary: `npx vitest run` → **34 files, 500 tests, all passing** (baseline 480 + 20 new: 8 answerClass, 2 replay, 3 advisory property, 7 scripted). `npm run typecheck` clean. `npm run lint` clean.

Files touched (matches R19's corrected list, not the brief's stale one):
- Created: `src/engine/selectors/replay.ts`, `src/engine/selectors/replay.test.ts`, `src/engine/commands/answerClass.test.ts`, `test/property/advisory.property.test.ts`, `test/scripted/fullGame.test.ts`
- Modified: `src/engine/index.ts` (barrel export), `src/engine/commands/nightCommands.test.ts` (barrel-completeness list, 99→100)
- **Not** modified: `src/engine/commands/nightCommands.ts` (no defect found — R19's "stale Files list" call was correct: Task 16 already owns §4.3 enforcement), `src/engine/reducer/applyEvent.ts`, `src/engine/reducer/applyEvent.test.ts` (untouched, correctly dropped from the commit per R19)

---

## The seven corrections — verified against the tree, applied as directed

All seven were checked against the actual code before applying, not taken on faith.

**R23 (scripted roster).** Traced the original brief roster by hand against `onDemonDeath`'s threshold arithmetic (`SCARLET_WOMAN_THRESHOLD = 5`, `aliveCount` counts the dying Demon) and confirmed day 1 killing p2 (the Scarlet Woman under the brief's roster) breaks the promotion the test exists to exercise. Applied the roster swap exactly as specified (`p2 washerwoman / p3 scarlet_woman / p4 saint`, rest unchanged), the two consequential test edits (promoted-demon assertion now names p3; the Saint-execution test nominates `p2 -> p4` with 5 of the 5 non-Butler voters), and both comment corrections. Ran the full scripted game: all 7 tests in `test/scripted/fullGame.test.ts` pass, including the day-3 promotion (`aliveCountAtDeath` = 6, confirmed by trace: 9 seated − 3 already dead at that point) and the day-4 `demon_dead` good win.

**R17 (fabricated Empath, night 1).** Confirmed no Poisoner exists in the 9-player roster (`RESOLVERS`/`nightOrder.ts` inspection) and that the original `poisoner:` handler in `fullGame.test.ts` was unreachable dead code. Deleted it. Replaced the Empath handler with its own `store.transaction(...)` emitting `STATUS_APPLIED { status: 'poisoned', sourcePlayerId: null, expiresAt: { kind: 'day', number: 1 } }` before resolving the `fabricated` answer. Verified `runNight` calls handlers outside any transaction (read `nightCommands.ts`/`store.ts` directly), so the nested `store.transaction` is legal, not the re-entrant case `store.ts` throws on. Test passes; the fabricated-answer path is genuinely exercised (actor is genuinely poisoned at the time `resolveAnswer`'s `isDrunk(actor) || isPoisoned(actor, view.phase)` check runs).

**R18 (day-1 poison-expiry assertion).** Confirmed p5 is the fixture's `redHerring` (a permanent status entry written at `ROLES_ASSIGNED`), so the original `statusLedger.length > 0` assertion was green with or without the poison ever being applied. Replaced with `isPoisoned(p5, phase)` (false, at night 2) **and** `statusLedger.some(s => s.status === 'poisoned')` (true) — the pair that can only both hold if §4.4's inclusive phase-comparison boundary (`isStatusActive` in `phase.ts`) is right. Confirmed the arithmetic by hand: poison applied night 1 expires end of day 1 (`ordinal` 3); night 2 is ordinal 4 → inactive.

**R22 (answerClass.test.ts self-containment).** Confirmed `seeded()`/`toImp` are module-private to `nightCommands.test.ts` and no `walkTo` exists anywhere in the tree (`grep` across the repo). Wrote a fully self-contained `answerClass.test.ts`: its own imports, its own `seeded()` reproducing Task 16's 12-player fixture verbatim, its own `walkTo(store, stepId)` (autoSkipUnmetSteps + skipStep + guard counter). For the stChoice-guard test, built a second roster (`p5 investigator`, `p10 recluse`, same-team swaps, chart stays 7/2/2/1) and confirmed empirically (`-t "requires stChoice"` run in isolation) that the `registration`-class candidate is actually found — the test exercises the real branch, not the `if (!ruled) return` vacuous-pass escape hatch the brief had.

**R21 (advisory fixture, deliberately illegal).** Left the 7-player 3/1/2/1 roster untouched; added the comment explaining why (never reaches `validateDeal`, raw `ROLES_ASSIGNED` emission, and legalizing it would cost the Saint, the second Minion, or the player count — each changing what the fuzz explores).

**R24 (replay.test.ts neighbour-swap defect).** Confirmed by direct execution: built the brief's original roster (`p2 poisoner / p4 chef`, kill p2), and the "later death changes the live answer" assertion **does fail** exactly as R24 predicts — `aliveNeighbours` skips the dead p2 and lands on p1 (also evil), so `empathCount` is 1 both before and after. Applied the fix (`p2 <-> chef`, `p4 <-> poisoner`, kill p4 instead), re-ran: neighbours go good/evil (1) → good/good (0), both assertions independently meaningful. Applied the identical swap to the second test's roster per instruction (its own assertion is unaffected either way, confirmed).

**R19 (git add / commit message).** Staged exactly: `test/property/advisory.property.test.ts`, `test/scripted/fullGame.test.ts`, `src/engine/commands/answerClass.test.ts`, `src/engine/selectors/replay.ts`, `src/engine/selectors/replay.test.ts`, `src/engine/index.ts`, `src/engine/commands/nightCommands.test.ts`. Did **not** stage `applyEvent.ts`/`applyEvent.test.ts` (untouched) or `nightCommands.ts` (untouched — no defect found in it; the "Modify" line in the brief's Files list was stale, confirming R19's read). Rewrote the commit message to attribute the two-Demons reducer guard to Task 4/17 (already shipped) rather than crediting this task with adding it — this task's property test is what *proves* the guard holds under fuzzing, which the message says explicitly.

**One folded minor.** Deleted the dead `imp:` handlers from both night-1 `runNight` calls in `fullGame.test.ts` (§6.3 — no Imp step on night 1). Added a comment to `replay.ts` about the `RESOLVERS[stepId]` vs `resolverId` lookup: verified by inspection of `nightOrder.ts` that all eight resolver-backed steps name their resolver after their own id, and documented that this stops being safe the day one doesn't, with the safer alternative named.

---

## Tests → mutations (non-hollow, checked)

- **`answerClass.test.ts`** (8 tests): each maps to a specific throw/no-throw branch in `nightCommands.ts`'s `resolveAnswer` — e.g. deleting the `chosen.answerClass !== answerClass` check reddens "refuses a registration class on a canonical answer and vice versa"; deleting the `!droisoned` throw reddens "refuses a fabricated answer from a sober actor"; deleting the `value[0] === null && !resolution.stChoice` guard reddens the stChoice test (verified this is the *only* test in the plan touching that branch — confirmed by grep across `test/` and `src/`).
- **`replay.test.ts`** (2 tests): mutating `answersAtSeq` to read `reduce(events)` (full log, not `.slice(0, seq)`) reddens the first test (`answersAtSeq` would then agree with the live, not historical, answer). The second test reddens if `RESOLVERS[stepId]` is changed to throw instead of returning `[]` for an unknown key.
- **`advisory.property.test.ts`** (3 tests): mutation-tested empirically, not just asserted — see below.
- **`fullGame.test.ts`** (7 tests): each assertion maps to a single production line (e.g. `SCARLET_WOMAN_THRESHOLD = 5` → 6 reddens the day-3 promotion assertion; `closeDay`'s `dayClosed: true` option removed reddens the Mayor-win test; the `oldest`/threshold `<` vs `<=` in `resolveDayExecution` reddens the execution-threshold day). I did not find a test in this file that has no corresponding single-line mutation.

## Guards → tests (the direction that finds gaps)

Walked every guard/branch in the files this task touches (`nightCommands.ts`'s `resolveAnswer`, `replay.ts`, the property-test's `invariants()`):
- `nightCommands.ts:279` (`value[0] === null && !stChoice`) — covered, and per R22 this was previously **uncovered** in the transcribed brief (vacuous test). Now covered by `answerClass.test.ts`'s stChoice test, confirmed non-vacuous.
- All other `resolveAnswer` branches — each has a corresponding `answerClass.test.ts` case (see above).
- `answersAtSeq`'s `if (!resolver) return []` — covered by `replay.test.ts`'s second test.
- No guard found with zero covering test in the files I touched or added tests for.

## Property-test non-vacuity — empirical, not asserted

Mutated production code and captured shrunk counterexamples (each reverted afterward; `git diff` confirmed clean before committing):
- Removing the `if (existingDemon) return state;` guard in `applyEvent.ts`'s `ROLE_CHANGED` case → "never produces two living Demons" fails after 7 generated cases, shrunk to a single action: `[{"kind":"promote","playerId":"p4"}]`.
- Loosening `applyDeath`'s `if (!player || !player.alive) return state;` to `if (!player) return state;` → "cannot be driven into a corrupt state" fails, shrunk to 3 actions (`death p6`, `execution p6`, `promote p1`), on the death-count-per-player invariant.
- Removing the duplicate-vote guard in `VOTE_CAST`'s reducer case → the same test fails, shrunk to 3 actions, on the vote-uniqueness invariant.

Measured trace distribution over 400 runs (via a throwaway instrumented copy, deleted before committing — `git status` was clean of it): **50.7%** of generated action sequences attempt a `promote` while a Demon is already alive (i.e., actually stress the two-Demons guard), **26.0%** attempt a repeat death on an already-dead player, and **1.3%** attempt a duplicate vote by the same voter on the same nomination (rarer because it needs `nominate` then the same `vote` twice within a short, 6-way-branching sequence — still non-zero across 400 runs). None of the three invariant classes is vacuous.

## What the scripted game exercises (§14 Tier 2, end to end)

Per the plan's acceptance-test framing: the deal and chart validation, both first-night and other-nights orders, poison and protection lifetimes (including expiry across the day/night boundary), a `fabricated` answer through the command layer, nominations and vote thresholds, two kinds of execution (vote-only; no Virgin/Slayer path in this script), a Scarlet Woman promotion by daytime execution with delayed (`night N+1`) notification, the Imp's per-night settle scope (no double kill after mid-night promotion), the Mayor's no-execution win and its suppression by poison, the Butler/Master vote-order non-flag, the Saint-executed evil win, and a full log round-trip (`reduce(events) === state`) plus undo-to-nothing.

## Concerns (round 1, superseded below)

None outstanding. All three verification commands are clean with pristine output, the working tree is clean, and every one of the seven corrections behaved exactly as diagnosed when checked against the running code (I reproduced R24's failure empirically before applying its fix, and reproduced R23's would-be failure by tracing rather than running, since fixing the roster in place was the only sane way to test it). No eighth defect was found in the files this task touches or created.

**Correction (fix round 1):** that last sentence was wrong, and plainly so rather than softened. The reviewer found an eighth and ninth defect — both in code transcribed verbatim from the brief, both invisible from the redden-mapping I did (they are assertions that pass under the exact mutation they exist to catch), and both of exactly the shape this whole task was warned about. "No eighth defect was found" should have read "no eighth defect was found in the files I wrote fresh" — I did not adequately stress-test the code I transcribed rather than composed. See below.

Also, the "What the scripted game exercises" line above overclaims: it lists "poison and protection lifetimes" as covered end-to-end by the scripted game. Protection is applied in the script but never actually blocks a kill there (see folded minor (e) below) — the real command-level coverage for a blocked kill is `src/engine/commands/nightCommands.test.ts`'s `'records a blocked kill with no death'` (Task 16), not this file.

---

## Fix round 1 (opus review: spec ✅, quality Needs fixes — 2 Important, several Minor)

FIX_BASE: `7379b6d`. All witnesses below were captured by mutating the production line, running the covering test to see it **fail**, then reverting and running it again to see it **pass** — pasted in both states, not asserted from memory.

### FIX 1 (Important) — `play()`'s blanket `catch {}` made §4.8's headline untestable

**Diagnosis, confirmed correct.** The brief's justification ("a backwards PHASE_ADVANCED throws") is true but incomplete: it is the *only* throw any of the six action kinds can produce against this fixture, so the catch was doing nothing today — but that also meant it would silently absorb a *future* regression (a command throwing instead of recording-and-flagging, which is precisely the §4.8 violation this file exists to catch).

**Fix.** `play()` now returns the count of swallowed errors instead of `void`; each of the three `it` blocks asserts `expect(play(...)).toBe(0)` before running its other invariants. The docstring says explicitly why this is the assertion, not a log.

**Witness — loosening `applyDeath`'s already-dead guard from `return state` to `throw`:**

Before the fix (mutation applied, old `void`-returning `play()`): all three properties passed silently — this is the bug, not evidence of anything working.

After the fix (mutation applied, new counting `play()`) — **FAILURE, as required:**
```
FAIL  test/property/advisory.property.test.ts > ... > cannot be driven into a corrupt state by any sequence of flagged events
Caused by: AssertionError: expected 1 to be +0

FAIL  test/property/advisory.property.test.ts > ... > never produces two living Demons
Error: Property failed after 2 tests
Counterexample: [[{"kind":"death","playerId":"p1"},{"kind":"death","playerId":"p1"}]]
Caused by: AssertionError: expected 1 to be +0

FAIL  test/property/advisory.property.test.ts > ... > survives undoing every transaction back to the seed
Error: Property failed after 8 tests
Counterexample: [[{"kind":"death","playerId":"p4"},{"kind":"execution","playerId":"p4"},{"kind":"nominate","nominatorId":"p1","nomineeId":"p1"}]]
Caused by: AssertionError: expected 1 to be +0
```
All three properties reddened, each on the new `swallowedErrors` assertion.

After reverting the mutation — **PASS:**
```
✓ test/property/advisory.property.test.ts (3 tests) 84ms
Tests  3 passed (3)
```

### FIX 2 (Important) — the `perceivedCharacterId` assertion couldn't fail for the reason it named

**Diagnosis, confirmed correct.** `answerClass.test.ts` asserted `perceivedCharacterId: 'empath'` at the empath step, where step id and character id are the same string — green under `position.step.id` as much as under the real field. Grepped the whole tree: no other assertion anywhere touches `perceivedCharacterId` on the emitted event, and `scarlet_woman_notify` is confirmed (by reading every step in `nightOrder.ts`) to be the only step where the step id is not a valid character id.

**Fix.** Kept the Empath assertion as a positive case, corrected its comment to say plainly it cannot witness the step-id bug. Added the real witness at the existing mid-night-promotion fixture in `fullGame.test.ts`: `takeCanonicalOrConfirm` and `takeCanonical` now return `TransactionResult` (previously `void`) so the `scarlet_woman_notify` resolution's payload can be asserted: `perceivedCharacterId: 'imp'` — the promoted p3's true and perceived character, which differs from the step id.

**Witness — mutating `nightCommands.ts` back to `perceivedCharacterId: position.step.id`:**
```
× fullGame.test.ts > ... > gives the promoted Scarlet Woman no second kill on the same night
  AssertionError: expected { Object (stepId, actorIds, ...) } to match object { perceivedCharacterId: 'imp' }
  - Expected: "perceivedCharacterId": "imp"
  + Received: "perceivedCharacterId": "scarlet_woman_notify"

✓ answerClass.test.ts > answer classes (§4.3) > stamps the actor's perceived character   (unchanged, still green)
```
1 failed, 14 passed across the two files — exactly the contrast required: the new assertion catches the regression, the Empath assertion does not (confirming it never could).

After reverting the mutation — **PASS:**
```
✓ answerClass.test.ts (8 tests), ✓ fullGame.test.ts (7 tests)
Tests  15 passed (15)
```

### Folded minors

**(a) Unfalsifiable `invariants()` clauses, commented honestly.** `aliveCount >= 0` / `aliveCount <= players.length` are pure tautologies over the same filter they're compared against — no mutation anywhere can redden them; said so in the comment rather than leaving them looking like coverage. The seat clause is similarly not exercised by the fuzz: `seat` is written in exactly one place (`applyEvent.ts`'s `GAME_CREATED` case), no event in the catalogue perturbs it, and the fixture's seed never changes it — so this corrects a ruling from Task 17 review that had called this property test the seat-immutability witness. It is not; §18 is enforced by the absence of a write path, which is stronger than any test but means the clause here is standing, not exercised. Commented at the clause.

**(b) Inert `tx.flag(...)` calls — now asserted.** Added `flagInvariant(store)`, called alongside `invariants(store.getState())` at all three call sites (including inside the undo loop): the committed `RULE_FLAGGED` count must equal committed `DEATH` + `NOMINATION_OPENED` count, since `play()`'s death/execution and nominate branches are the only ones that flag, each pairing exactly one flag with its event in the same transaction (so undo, which removes a whole transaction, can't desync the pair).

**Witness — deleting the death/execution branch's `tx.flag('fuzz', 'integrity', 'generated')` call:**
```
FAIL  ... > cannot be driven into a corrupt state by any sequence of flagged events
Caused by: AssertionError: expected 1 to be 2 (flagInvariant, test/property/advisory.property.test.ts:237:17)

FAIL  ... > survives undoing every transaction back to the seed
Caused by: AssertionError: expected 1 to be 2 (flagInvariant)
```
2 of 3 properties reddened (the two-Demons test doesn't call `flagInvariant`, correctly — it isn't about flags). Restored: all three pass again (`3 passed (3)`).

**(c) Day-4 `nextStep === null` assertion corrected, real witness added.** The phase is day 4 at that point, so `nextStep` returns null on the phase check alone, before ever consulting `victory.status` — it cannot witness "the night cannot continue past the end of the game." Added `expect(() => beginNight(store)).toThrow(/game is over/i)`, softened the kept null-check's comment to say it's a sanity check, not the witness. Named mutation (not re-run, per the instruction that only FIX 1/FIX 2/(d) need a pasted witness): deleting `dayCommands.ts`'s `if (state.victory.status !== 'ongoing') throw new Error('The game is over — there is no next night');` in `beginNight` reddens the new assertion — `beginNight` would then proceed to open night 5 on a decided game instead of throwing.

**(d) §3.6's exclusive-boundary was untested — added and witnessed.** The existing `replay.test.ts` case takes its seq at `NIGHT_STEP_RESOLVED`, which doesn't itself change the Empath's neighbours, so `slice(0, seq)` vs `slice(0, seq + 1)` are indistinguishable there. Added a new case taking the seq at the `DEATH` event itself, where the two slices genuinely disagree (p4 alive vs. dead changes `empathCount` for p3 from 1 to 0).

**Witness — mutating `replay.ts`'s `events.slice(0, seq)` to `events.slice(0, seq + 1)`:**
```
× replay.test.ts > answersAtSeq (§3.6) > is exclusive at the boundary: the state at an event's own seq excludes that event
  AssertionError: expected [ +0 ] to deeply equal [ 1 ]

✓ replay.test.ts > ... > recomputes the answer set as it stood before that event   (unchanged, still green — confirms it never covered this)
✓ replay.test.ts > ... > returns nothing for a step with no resolver               (unchanged, still green)
```
1 failed, 2 passed — the new test alone catches it. Restored: `3 passed (3)`.

**(e) Protection-lifetime coverage — investigated, claim corrected, no new test added.** Checked Task 16's `nightCommands.test.ts` first, as instructed: `'records a blocked kill with no death'` (line 438) already resolves a Monk protection on p6 via `resolveStep`, then `resolveImpStep({ targetId: 'p6' })`, and asserts `finalVictimId: null`, `resolutionChain: [{ result: 'monk_protected' }]`, and `p6.alive === true` — genuine command-level coverage of a blocked kill. Since it's already covered, I corrected the claim rather than adding a duplicate: added a comment at `fullGame.test.ts`'s night-2 Monk handler saying plainly that this script's Monk protection is never actually tested against a kill (the Imp never targets the protected player), naming where the real coverage lives, and explaining why no scripted kill was retargeted to manufacture it (it would break the alive-count arithmetic every later day's execution threshold depends on — exactly the caution given). Also corrected this report's own "poison and protection lifetimes" claim above.

**(f) Vote-uniqueness clause fires in ~1.3% of fuzzed traces — deterministic witness found and cited.** Did not touch the generator. Found `src/engine/selectors/nominations.test.ts`'s `'flags a duplicate vote on the same nomination as integrity'`: its last two lines push a second `VOTE_CAST` for the same voter through the log, replay it through the real reducer, and assert `tallyFor(...)` is unchanged — i.e., it exercises the exact `applyEvent.ts` `VOTE_CAST` dedup guard the property test's clause depends on, deterministically, not probabilistically. Cited it in a comment beside the clause in `invariants()`. No gap to report — the deterministic witness exists.

### Deferred, left untouched as instructed

Per the coordinator's explicit list: `answersAtSeq`'s `if (!resolver) return []` (typo vs. legitimate no-resolver step), `expect(ruleFlags).toEqual([])` in the st_override test (unreddenable-by-deletion forward guard), and `expect(night2).not.toContain('poisoner')` (near-tautological) are all left exactly as they were — not touched this round.

R18's assertion itself was also left unchanged; only its comment was softened to stop claiming it witnesses §4.4's inclusive boundary (it doesn't — the Mayor-poison test pair does) and to say instead what it actually shows: the ledger entry persists while the predicate reads false.

### Verification after the fix round

- `npx vitest run` → **34 files, 501 tests, all passing** (500 → 501: one new `it` added — folded minor (d)'s boundary-exclusivity case in `src/engine/selectors/replay.test.ts`; FIX 1, FIX 2, (b) and (c) added assertions to existing `it` blocks rather than new ones).
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `git status` — clean before commit; confirmed no scratch/instrumented file survives (the two `.bak` files under `docs/superpowers/specs/` are pre-existing, tracked, unrelated to this task — verified via `git log`).

## Concerns (final)

None outstanding. Both Important findings are fixed and witnessed (mutation → failure → revert → pass, pasted above for both). All six folded minors are addressed: three with a pasted witness ((d) plus the two Important fixes already cover that requirement), one with a named-but-not-rerun mutation ((c), per instruction), one investigated-and-corrected rather than papered over with a redundant test ((e)), and one resolved by citing an existing deterministic test rather than perturbing the generator ((f)). The three items the coordinator flagged as deferred to the final whole-branch review were left untouched. `npx vitest run`, `npm run typecheck`, and `npm run lint` are all clean with pristine output, and the tree is clean of any scratch or instrumentation file.
