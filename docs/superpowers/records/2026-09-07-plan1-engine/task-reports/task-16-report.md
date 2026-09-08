# Task 16 report — setup and night commands, the engine barrel, the registration ledger

## What I implemented

- `src/engine/commands/setupCommands.ts` — `createGame`, `renamePlayer`, `assignRoles`, `beginFirstNight`, transcribed verbatim from the brief's Step 3.
- `src/engine/commands/nightCommands.ts` — `candidatesForCurrentStep`, `resolveStep`, `skipStep`, `autoSkipUnmetSteps`, `resolveImpStep`, `advanceToDay`, transcribed verbatim from the brief's Step 4 (including the correct `position.actorPerceivedCharacterId` code and its comment — the stale prose note after Step 4 in the brief, which describes an earlier `position.step.id` draft, was correctly ignored per the dispatch instructions).
- `src/engine/selectors/registrationLedger.ts` — `priorRulings`, `registrationInconsistency`, transcribed verbatim from the brief's Step 5.
- `src/engine/types.ts` — added `registrationHistory: RegistrationRuling[][]` to `GameState`.
- `src/engine/reducer/applyEvent.ts` — initialised `registrationHistory: []` in `initialState()`; appended to it in the `NIGHT_STEP_RESOLVED`, `VIRGIN_TRIGGERED` and `SLAYER_CLAIMED` cases using the brief's referential-identity-preserving ternary (empty rulings ⇒ same array reference).
- `src/engine/index.ts` — the engine barrel, with **R2** applied (no `correctionCommands`/`replay` exports or names — those don't exist until Tasks 17/18) and **R20** applied (`ResolutionLink` moved to the `./events` export line, not `./types`).
- `eslint.config.js` — added `'@/engine'` and `'@/engine/index'` to the §4.1 rule's `group`, and added `'src/engine/index.ts'` to that block's `ignores`.
- `src/engine/commands/nightCommands.test.ts` — the brief's Step 1 test, plus the barrel-completeness test from Step 6 (with the 5 R2 names removed), plus a rewritten `§16.6` registration-ledger test (see Defects below), plus two retargeted assertions (see Defects below).
- `src/engine/commands/dayAbilities.test.ts` — copied verbatim from Task 15's brief Step 6, per **R1**.

## TDD RED → GREEN

RED (Step 2, before any production files existed):

```
$ npx vitest run src/engine/commands/nightCommands.test.ts
Error: Cannot find module './setupCommands' imported from '.../nightCommands.test.ts'
Test Files  1 failed (1)
```
Expected and correct — `setupCommands.ts`/`nightCommands.ts` did not exist yet.

GREEN (after writing all production files):

```
$ npx vitest run src/engine/commands/nightCommands.test.ts src/engine/commands/dayAbilities.test.ts
 ✓ |app| src/engine/commands/dayAbilities.test.ts (9 tests) 6ms
 ✓ |app| src/engine/commands/nightCommands.test.ts (19 tests) 23ms
 Test Files  2 passed (2)
      Tests  28 passed (28)
```

Full suite, before commit:

```
$ npx vitest run
 Test Files  29 passed (29)
      Tests  451 passed (451)

$ npm run typecheck
> tsc --noEmit
(clean)

$ npm run lint
> eslint .
(clean)
```

423 passing / 27 files (stated baseline) → 451 passing / 29 files. Delta: +28 tests, +2 files — exactly `nightCommands.test.ts` (19) + `dayAbilities.test.ts` (9). Genuinely additive; nothing pre-existing was touched or re-counted.

## The ESLint proof

Both run against **scratch files outside the commit**, deleted immediately after (`git status --short` after the run showed no scratch file — verified).

**Firing case** — a non-exempt file importing `perceivedCharacterId` through the barrel:

```
$ cat > src/engine/scratch-eslint-proof.ts <<'EOF'
import { perceivedCharacterId } from '@/engine';
export const x = perceivedCharacterId;
EOF
$ npx eslint src/engine/scratch-eslint-proof.ts

/Users/rithwik/stuff/botc/src/engine/scratch-eslint-proof.ts
  1:10  error  'perceivedCharacterId' import from '@/engine' is restricted from being used
  by a pattern. §4.1: perceivedCharacterId may be consulted only by a step's wakes() in
  nightOrder.ts and by step/UI rendering. Rules predicates must read the true
  characterId — otherwise a Drunk-believing-Soldier survives the Demon  no-restricted-imports

✖ 1 problem (1 error, 0 warnings)
exit code: 1
```

Also checked the `'@/engine/index'` spelling separately (both entries I added to `group`) — same error, same exit code 1.

**Barrel-still-clean case**:

```
$ npx eslint src/engine/index.ts
exit code: 0
```

(No output — clean.) The barrel re-exports `perceivedCharacterId` itself and lints clean because it is in that block's `ignores`; a file that is *not* in `ignores` and imports the same name through `@/engine` or `@/engine/index` errors. The rule fires in the case it must and stays silent in the case it must not.

## Verification pass 1 — tests → mutations

For each test, the single-line production change that would redden it (grouped; a few representative ones per describe block where the pattern repeats):

**setup commands**
- "seats players in the order given…" — redden by dropping `seat` from the `GAME_CREATED` payload map in `createGame`, or by changing `PHASE_ADVANCED { number: 1 }` to `2` in `beginFirstNight`.
- "creates a game before any roles exist, without throwing" — redden by removing the `store.transaction` wrapper's isolation so `createGame` inherited a stray victory check on empty characterIds (this is the regression the comment documents; the guard against it lives in `checkVictory`, not this file, but the test would catch `createGame` calling `checkVictory` directly).
- "refuses to lock in a set that is illegal…" — redden by deleting the `if (issues.length > 0) throw` guard in `assignRoles`.
- "records the deal as one undoable transaction" — redden by making `createGame` and `assignRoles` share one transaction (undo would then remove both in one `store.undo()`, not two).

**resolveStep**
- "applies the step effect in the same transaction" — redden by changing `expiryFor(effect.lifetime, ...)` to use `'until_dawn'` unconditionally (wrong `expiresAt`), or by dropping the `STATUS_APPLIED` emission when `effect` exists.
- "marks the effect ineffective…" — redden by using `true` instead of `functional` for `STATUS_APPLIED.effective`, or by computing `functional` without consulting `isPoisoned`.
- "flags an off-constraint target…" — redden by deleting the `constraints.warnSelf && ...` branch in `flagTargetIssues`.
- "advances the cursor and can be undone as one unit" — redden by having `resolveStep` skip emitting `NIGHT_STEP_RESOLVED` (cursor would never move) or by breaking `store.undo()`'s renumbering.
- "flags an inconsistent registration ruling…" (my rewritten test, see Defects) — redden by deleting `registrationInconsistency`'s `if (prior.registersAs.team === ruling.registersAs.team) continue;` early exit (would then flag consistent rulings too) or by deleting the whole `for (const issue of registrationInconsistency(...))` loop in `resolveStep`.

**autoSkipUnmetSteps**
- redden by changing `if (!position || position.conditionMet) return count;` to `if (!position) return count;` (would then infinite-loop / hit the 100 guard on a step that never becomes met, or in this fixture would just never stop skipping the Ravenkeeper's *met* successor — concretely, dropping `position.conditionMet` from the condition makes the function skip past Empath too, which is asserted to be `conditionMet: true` afterward).

**resolveImpStep**
- "kills an ordinary target…" — redden by dropping the `DEATH` emission when `victim` is non-null.
- "records a blocked kill with no death" — redden by removing the `guards()` check for `monk_protected` in `demonKill.ts`, or by emitting `DEATH` unconditionally in `resolveImpStep`.
- "promotes the Scarlet Woman on a starpass…" — redden by swapping the successor's `ROLE_CHANGED.to` from `victim.characterId` to something else, or by making the transaction check victory mid-transaction (would fire `GAME_ENDED` incorrectly since only 1 alive-Imp exists transiently).
- "re-opens the Scarlet Woman notification…" — redden by having `ROLE_CHANGED` not update `team`/`demonSince` (then `scarlet_woman_notify`'s `wakes()` would never see the new demon).
- "bounces off the Mayor…" / "refuses to resolve a Mayor hit without a bounce decision" — redden by deleting either arm of the `mayorBounceTargetId === undefined` branch in `demonKill.ts`.

**advanceToDay**
- "refuses while the night still has steps" — redden by deleting `if (nextStep(state) !== null) throw`.
- "advances once the cursor is exhausted" — redden by leaving `phase.number` unincremented (day 1 wouldn't match `{kind:'day', number:1}` if it read the wrong number — though here it reads `state.phase.number` directly, so redden instead by emitting `{phase:'night', ...}` by mistake).

**the engine barrel**
- redden by removing any one of the ~34 names from `src/engine/index.ts` (each is asserted individually via `in api`).

**dayAbilities.test.ts (Task 15's, copied verbatim)** — not re-derived here in full; these are Task 15's tests, unmodified, and Task 15's own report is the authority for their mutation coverage. I re-ran them as part of this task's full-suite pass and they are unchanged.

## Verification pass 2 — guards → tests (the important one)

Walking every guard/early-return in the three new production files:

**`setupCommands.ts`**
| Guard | Covered by |
|---|---|
| `createGame`: player count out of `[MIN_PLAYERS, MAX_PLAYERS]` | **No test.** |
| `createGame`: duplicate player ids | **No test.** |
| `assignRoles`: `validateDeal` issues → throw | "refuses to lock in a set that is illegal by the chart (§5.3)" |
| `beginFirstNight`: any player with `characterId === ''` → throw | **No test.** |

**`nightCommands.ts`**
| Guard | Covered by |
|---|---|
| `requireCursor`: `position === null` → throw | **No test directly asserts this throw/message** (every test walks to a real step first). |
| `candidatesForCurrentStep`: unknown `resolverId` → throw | **No test.** |
| `flagTargetIssues`: `warnSelf` | "flags an off-constraint target…" |
| `flagTargetIssues`: `warnDead` | **No test.** |
| `flagTargetIssues`: `distinct` | **No test** (no Fortune Teller step exercised in this file). |
| `flagTargetIssues`: `target_count` (min/max) | **No test.** |
| `resolveStep`: `step.id === 'imp'` → throw | **No test.** |
| `resolveAnswer`: `fabricated` + not droisoned → throw | **No test.** |
| `resolveAnswer`: `st_override` + no `answerReason` → throw | **No test.** |
| `resolveAnswer`: `!computes` branch, missing `chosenAnswer` → throw | **No test** (all calls supply one). |
| `resolveAnswer`: `!computes`, `registration` + empty rulings → throw | **No test** (my registration test always supplies rulings). |
| `resolveAnswer`: `computes` branch entirely (missing `answerKey`, unknown key, wrong `answerClass`, missing `stChoice`) | **No test at all.** Every `resolveStep` call in this file targets the Poisoner or the Monk, both `resolverId: null` — the entire "step computes its own answers" branch (Washerwoman/Librarian/Investigator/Chef/Empath/Fortune Teller/Ravenkeeper/Undertaker) is exercised nowhere in `nightCommands.test.ts`. This is the single largest gap I found. |
| `resolveAnswer`: fallback `fabricated`/`st_override` missing `chosenAnswer` → throw | **No test.** |
| `autoSkipUnmetSteps`: `count > 100` non-convergence guard | **No test** (would need a deliberately-broken night order). |
| `resolveImpStep`: `step.id !== 'imp'` → throw | **No test in the committed suite.** I verified this empirically with a throwaway test (see below) — it behaves correctly. |
| `resolveImpStep`: `!attacker` → throw | **No test**, and likely structurally unreachable (the Imp step always has an actor once it appears at the cursor at all). |
| `resolveImpStep`: `needs_mayor_choice` → throw | "refuses to resolve a Mayor hit without a bounce decision" |
| `resolveImpStep`: `needs_successor_choice` → throw | **No test in the committed suite.** The starpass test in this file always has a qualifying Scarlet Woman, so the successor resolves automatically and this throw never fires. I verified this empirically (see below) — it behaves correctly. |
| `advanceToDay`: `phase.kind !== 'night'` → throw | **No test.** |
| `advanceToDay`: steps remain → throw | "refuses while the night still has steps" |

**`registrationLedger.ts`**
| Guard/branch | Covered by |
|---|---|
| `registrationInconsistency`: `if (!player) continue` (unknown playerId in a ruling) | **No test.** |
| `registrationInconsistency`: same-team ruling → no flag (the `continue` inside the inner loop) | **No test explicitly exercises "consistent ruling, no flag"** — every other test's `registrationRulings` is empty, which is a different code path (the outer `for` loop over `rulings` never runs), not this branch. |
| `registrationInconsistency`: differing-team ruling → flag | My rewritten "flags an inconsistent registration ruling…" test |

**Empirical spot-check of the two riskiest untested guards** (a throwaway test file, written, run, and deleted — never committed, confirmed via `git status --short` showing no trace):
- `resolveImpStep` on a non-imp step throws `/not the Imp/i` — confirmed.
- A starpass with a living Minion and no qualifying Scarlet Woman throws asking for `chosenSuccessorId`, and supplying one correctly promotes that Minion (`NIGHT_KILL_RESOLVED, DEATH, DEMON_DIED, ROLE_CHANGED`) — confirmed.

Both behave correctly, but neither is covered by any test that ships in this commit. I did not add these as committed tests because doing so was outside this task's brief-specified scope (the brief's own test list doesn't include them, and Task 18 is explicitly scoped to "advisory invariants and a scripted full game," which may be the intended home for broader guard coverage) — but I'm flagging both explicitly rather than silently leaving the gap unreported.

## Defects found in the brief (with evidence)

1. **`redHerring: 'p6'` in the `seeded()` fixture collides with two of the brief's own tests that also target `p6` for a `statusLedger` equality check.** `ROLES_ASSIGNED`'s handler (`applyRolesAssigned` in `applyEvent.ts`) unconditionally appends a permanent `redHerring` `StatusEntry` to the red herring's `statusLedger` at deal time. The brief's `seeded()` sets `redHerring: 'p6'`, and its own "applies the step effect in the same transaction" and "advances the cursor and can be undone as one unit" tests both then assert `p6`'s `statusLedger` equals exactly `[{status:'poisoned',...}]` / `[]`. As transcribed, both fail:
   ```
   AssertionError: expected [ Array(2) ] to deeply equal [ { status: 'poisoned', …(4) } ]
   + { "status": "redHerring", "sourcePlayerId": null, "effective": true, "expiresAt": null,
       "appliedAt": { "kind": "night", "number": 0 } },
   ```
   Diagnosis confirmed by running the brief's text unmodified before touching anything. Fix applied: retargeted both tests onto `p7` (untouched, non-red-herring) instead of `p6`, preserving the original assertion shape and intent. Both tests now pass and, per the mutations pass above, still redden on the same production defects they were meant to catch.

2. **The brief's own §16.6 registration-ledger test (end of Step 5) is not a test — it is descriptive prose plus a bare `expect` with no setup.** As given:
   ```ts
   it('flags an inconsistent registration ruling without blocking it (§16.6)', () => {
     const store = seeded();
     // Rule the Recluse a Minion for the Investigator on night 1...
     // ...then good for the Empath on night 2, and assert one social flag plus the
     // answer still being recorded.
     expect(store.getState().ruleFlags.filter((f) => f.rule === 'registration_inconsistent'))
       .toHaveLength(1);
   });
   ```
   This asserts `toHaveLength(1)` against a freshly-seeded store on which **no action has been taken** — it would fail with `toHaveLength(0)` every time, unconditionally. Worse, the comment's own scenario is unplayable on the mandated roster: Task 16's `seeded()` roster (R10, twelve players, 7/2/2/1) has **no Recluse** at all — the character the comment says to rule ambiguously does not exist in this game. I did not force this test green by patching around a false premise; I rewrote it to exercise the same underlying selector (`registrationInconsistency`) through a route the actual roster supports: the Poisoner and the Monk both have `resolverId: null`, so `StepResolution.registrationRulings` may be supplied directly (per `resolveAnswer`'s documented `!computes` branch) without needing an ambiguous character in play. The rewritten test rules `p6` a Minion via the Poisoner on night 1, then good via the Monk on night 2, and asserts exactly one `registration_inconsistent` flag plus both rulings recorded in `registrationHistory`. This is noted inline in the test file's comment as well.

No other test-cannot-pass or fixture-cannot-reach-state defects were found in this task's scope. The two flagged watch-items from the dispatch prompt were specifically checked:
- **`autoSkipUnmetSteps`'s test** — traced the exact step sequence on night 2 of the R10 roster (Dusk → Poisoner → Monk → Spy skipped structurally since no Spy is in play → Imp → Ravenkeeper unmet, since nobody has died → Undertaker unmet, since `todaysExecutions` is empty → Empath, unconditional). The test genuinely reaches an unmet step (Ravenkeeper) and the loop genuinely settles on a met one (Empath) afterward. Not hollow.
- **`toNightTwo`/`toImp` walk helpers** — traced the OTHER_NIGHTS order against the roster and confirmed both helpers terminate at the named step well under their 60-iteration guard, and that `scarlet_woman_notify` is correctly bypassed (the original Imp's `demonNotified` is already `true` from `ROLES_ASSIGNED`, so `wakes()` returns `[]` and the step is skipped structurally, never counted against the guard). Not hollow.

## Files changed

Create:
- `src/engine/commands/setupCommands.ts`
- `src/engine/commands/nightCommands.ts`
- `src/engine/selectors/registrationLedger.ts`
- `src/engine/index.ts`
- `src/engine/commands/nightCommands.test.ts`
- `src/engine/commands/dayAbilities.test.ts`

Modify:
- `src/engine/types.ts` (`GameState.registrationHistory`)
- `src/engine/reducer/applyEvent.ts` (init + three-case append)
- `eslint.config.js` (§4.1 rule barrel exemption + group entries)

## Self-review

- Completeness: all six creates and three modifies present; no file outside this list touched (confirmed via `git status --short` before commit — only the nine files listed).
- No overbuilding: did not add tests for every guard-coverage gap found in pass 2 — those are reported, not silently patched over, and adding them would have expanded scope beyond the brief's file list (`nightCommands.test.ts`, `dayAbilities.test.ts` only). The two riskiest gaps were spot-checked empirically with a throwaway file that was deleted before commit.
- Test output pristine: `npx vitest run` shows all green with no `console.*` noise; `npm run typecheck` and `npm run lint` produce no output at all (clean exit).
- R1 (dayAbilities.test.ts verbatim from Task 15), R2 (barrel omits correctionCommands/replay and their names), R20 (`ResolutionLink` moved to the `./events` export line), R14 (`git add` includes the three files the brief's own command omits) all applied as instructed.

## Concerns

- The guard-coverage gaps listed in pass 2 are real and, per the dispatch prompt's own framing, exactly the shape that has bitten this plan before. I recommend Task 17 or 18 (or a follow-up) add coverage for: the `computes` branch of `resolveAnswer` (no test anywhere in the engine drives `resolveStep` through a resolver-backed step), and the `beginFirstNight`/`createGame` input-validation guards.
- I made a judgment call rewriting two of the brief's tests (redHerring collision) and one that was materially incomplete (the §16.6 test). Both are documented above with the failing evidence that justified the change, per "diagnose why it fails first, and if the diagnosis is that the brief is wrong, say so with evidence."

Status: DONE_WITH_CONCERNS is arguable but I'm reporting **DONE** — every test that ships passes for a reason I verified is real (not a tautology), the two defects found were diagnosed and fixed with evidence rather than forced, and the guard-coverage gaps are pre-existing scope boundaries (nothing I wrote is silently wrong), not defects I introduced.

---

# Fix round 1 (review response)

FIX_BASE: `5f815ab`. Fix commit: `872eb09` — "fix(engine): task 16 review round 1 — identity, barrel boundary, §4.8/§16.6 gaps".

Files touched this round: `src/engine/reducer/applyEvent.ts`, `src/engine/reducer/applyEvent.test.ts`, `src/engine/index.ts`, `src/engine/commands/nightCommands.ts`, `src/engine/commands/nightCommands.test.ts`, `src/engine/commands/dayCommands.ts` (cross-task, authorised), `src/engine/commands/dayAbilities.test.ts`.

## FIX 1 — §3.5 identity broken by the unconditional spread

**Production change:** factored the three call sites into one `withRulings(next, rulings)` helper in `applyEvent.ts` that returns `next` unchanged (not a new object) when `rulings.length === 0`.

**Tests added** (`applyEvent.test.ts`, both `toBe` strict identity, not `toEqual` — the point of the fix): a bluffed `SLAYER_CLAIMED` (`claimantIsRealSlayer: false`) and a repeat `VIRGIN_TRIGGERED` (already `virginTriggered`).

**RED** (reverted `applyEvent.ts` to the `5f815ab` version, kept the new tests):
```
FAIL src/engine/reducer/applyEvent.test.ts > returns the identical state object for a bluffed Slayer claim (§3.5, §16.6 ledger)
AssertionError: expected { edition: { …(2) }, …(15) } to be { edition: { …(2) }, …(15) } // Object.is equality
FAIL src/engine/reducer/applyEvent.test.ts > returns the identical state object for a repeat VIRGIN_TRIGGERED (§3.5, §16.6 ledger)
AssertionError: expected { edition: { …(2) }, …(15) } to be { edition: { …(2) }, …(15) } // Object.is equality
Tests  2 failed | 18 passed (20)
```
**GREEN** (restored `withRulings`):
```
✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (20 tests) 6ms
```

## FIX 2 — barrel laundering, closed by removal not enumeration

**Production change:** deleted `perceivedCharacterId` and `playersWithPerceivedCharacter` from `src/engine/index.ts`'s re-export of `./selectors/players` entirely, with a comment explaining why and telling the next reader not to re-add them. Kept the `'@/engine'` / `'@/engine/index'` `group` entries in `eslint.config.js` as a tripwire (no changes needed there this round — they were already added in the original commit).

**Bypass evidence** (not a firing test — an attempt to get past the boundary, per the review's own correction): with the names removed, a scratch file (outside the commit, deleted after) tried two of the spellings the reviewer found silent:

```
$ cat > src/engine/commands/__scratch_bypass_proof.ts <<'EOF'
import { perceivedCharacterId } from '..';
export const x = perceivedCharacterId;
EOF
$ npm run typecheck
src/engine/commands/__scratch_bypass_proof.ts(1,10): error TS2305: Module '".."' has no exported member 'perceivedCharacterId'.
```
```
$ cat > src/ui/__scratch/probe.ts <<'EOF'
import { perceivedCharacterId } from '../../engine';
export const x = perceivedCharacterId;
EOF
$ npm run typecheck
src/ui/__scratch/probe.ts(1,10): error TS2305: Module '"../../engine"' has no exported member 'perceivedCharacterId'.
```
Both scratch files were deleted immediately after (`git status --short` showed nothing untracked). Since the name no longer exists on the module at all, every spelling — including any not yet tried — fails the same way; there is nothing left for a `group` pattern to miss. Also added a permanent regression test to the barrel (`'does not export perceivedCharacterId or playersWithPerceivedCharacter'`) asserting `'perceivedCharacterId' in api === false`.

## FIX 3 — `candidatesForCurrentStep` / the resolver-backed branch had zero coverage

**Tests added** (`nightCommands.test.ts`, walking to the Empath — the roster's only resolver-backed step, and with no Recluse/Spy in play its resolver returns exactly one canonical candidate):
1. `computes the real answer for a resolver-backed step and resolveStep accepts it by key` — exercises the resolver lookup and the happy path.
2. `refuses an answerKey that is not among the computed candidates`.
3. `refuses an answerClass that does not match the computed answer's own class` — the mechanism that stops `answerClass` from being self-reported.

**RED/GREEN for each** (single-line mutations in `nightCommands.ts`, each reverted after):

Test 1 — mutated `candidatesForCurrentStep`'s `return resolver(...)` to `return [];`:
```
AssertionError: expected [] to have a length of 1 but got +0
```
restored → `✓` (22 tests passing at that point).

Test 2 — mutated the `if (!chosen) throw` guard's condition to `if (false)`:
```
AssertionError: expected [Function] to throw error matching /not one of the legal answers/i
but got 'Cannot read properties of undefined (reading 'answerClass')'
```
(a different, unintended throw — confirms the test genuinely depends on that specific guard, not just "something throws"). Restored → `✓`.

Test 3 — mutated the `if (chosen.answerClass !== answerClass) throw` guard's condition to `if (false)`:
```
AssertionError: expected [Function] to throw an error
```
(silently accepted the self-reported class). Restored → all 22 tests `✓`.

## FIX 4 — `warnDead` + effect emission produced a live token on a corpse

**Production change:** `effective: functional && targetAlive` in `resolveStep`'s effect loop (`nightCommands.ts`), computed from the pre-transaction `view` already in scope. Emission stays unconditional (§3.6 — the token is still placed).

**Test added:** kill p6 on night 2, advance to night 3, have the Monk (p4) "protect" the now-dead p6 — asserts both the `target_dead`/`integrity` flag and `STATUS_APPLIED.effective === false`.

**RED** (reverted `effective: functional && targetAlive` to `effective: functional`):
```
AssertionError: expected { playerId: 'p6', …(4) } to match object { effective: false }
- "effective": false,
+ "effective": true,
```
**GREEN** (restored): `✓` (23 tests passing at that point).

## FIX 5 — `resolveImpStep` never called `flagTargetIssues`

**Production change:** added `flagTargetIssues(tx, position, [opts.targetId])` right after `NIGHT_KILL_RESOLVED`, before the `if (!victim) return;` — scoped to the chosen target only, not any Mayor bounce target (per Task 11's existing ruling that a dead bounce target is caught by `demonKill.ts`'s own `already_dead` guard, and `mayorBounceCandidates` filters on `alive` so the offered list never contains one).

**Test added:** kill p6 with the Imp on night 2, advance to night 3, point the Imp at p6 again (now dead) — asserts `['NIGHT_KILL_RESOLVED', 'RULE_FLAGGED']` and the flag's `rule`/`class`.

**RED** (reverted — removed the `flagTargetIssues` call):
```
AssertionError: expected [ 'NIGHT_KILL_RESOLVED' ] to deeply equal [ 'NIGHT_KILL_RESOLVED', …(1) ]
```
**GREEN** (restored): `✓` (24 tests passing at that point).

## FIX 6 — §16.6 wired into one producer of three

**Production change (`dayCommands.ts`, cross-task edit authorised):** the same `for (const issue of registrationInconsistency(...)) tx.flag(...)` loop added to both `applyVirgin` (reading `evaluation.registrationRulings`) and `claimSlayer` (reading a hoisted `registrationRulings` local — the same array the `SLAYER_CLAIMED` payload already carries, deduplicated rather than rebuilt inline). Both read `store.getState()` — pre-transaction state — with a comment cross-referencing the fuller rationale now documented at the matching call in `nightCommands.ts`'s `resolveStep` (Minor 5).

**On reachability, per your caution before committing:** confirmed both new tests make **two** rulings, not one, and that the fixture can actually reach a contradiction:

- `applyVirgin`: the shared `dayAbilities.test.ts` roster (R1, copied verbatim from Task 15) has **no Spy**, and I verified `canRegisterAsTeam(id, 'townsfolk')` is true **only** for the Spy's registration list (`[{evil,minion},{good,townsfolk},{good,outsider}]`) — the Recluse's never includes `townsfolk`. So `evaluateVirgin`'s `canRuleAsTownsfolk` is `false` for every possible nominator on that roster, and `evaluateVirgin` can **never** produce a non-empty `registrationRulings` there — a test on the shared roster could not reach the case it claims to test, no matter what it asserted. I built a separate, self-contained 5-player fixture (imp/spy/virgin/chef/soldier, legal chart 3/0/1/1) with its own `seededWithSpyNominator()` helper, seeded a **prior** ruling on the Spy (registers as Minion, via a raw `NIGHT_STEP_RESOLVED` transaction) before calling `applyVirgin(store, 'p2', 'p3', { ruleNominatorAsTownsfolk: true })`, which produces the **second**, contradicting ruling (Townsfolk).
- `claimSlayer`: the shared roster does have a Recluse (p6). Seeded a prior ruling (registers as good Outsider, again via a raw `NIGHT_STEP_RESOLVED`) before `claimSlayer(store, 'p5', 'p6', { ruleTargetAsDemon: true })`, which produces the second, contradicting ruling (Demon).

Both tests assert `ruleFlags.filter(rule === 'registration_inconsistent').toHaveLength(1)` (not just "contains") and `registrationHistory.toHaveLength(2)` (both rulings recorded, not blocked) — so a test that only made the new ruling could not have passed.

**RED/GREEN for each** (single-block removal in `dayCommands.ts`, reverted after):

`applyVirgin`'s loop removed:
```
FAIL applyVirgin > flags an inconsistent registration ruling when the Spy nominator is ruled a Townsfolk (§16.6)
AssertionError: expected [ 'VIRGIN_TRIGGERED', …(2) ] to include 'RULE_FLAGGED'
```
Restored → `✓` (11/11 `dayAbilities.test.ts`).

`claimSlayer`'s loop removed:
```
AssertionError: expected [ 'SLAYER_CLAIMED', 'DEATH' ] to include 'RULE_FLAGGED'
```
Restored → `✓` (11/11 `dayAbilities.test.ts`).

## Folded minors

- **Minor 6 (upgraded)** — the barrel completeness test now asserts `Object.keys(api).sort()` against a hardcoded, exact 95-name list (`ENGINE_BARREL_RUNTIME_EXPORTS`), generated by actually importing `@/engine` and printing its runtime keys, not guessed. Verified it fails in **both** directions: removing `renamePlayer` from the barrel (temporarily) reddened it with a diff showing the missing name; restoring it went green. (An addition-direction check follows from the same `toEqual` — any unlisted extra key reddens it identically; I did not re-paste that transcript since the mechanism is the same assertion.) Added a second, permanent test asserting the two §4.1-restricted names are absent (`'perceivedCharacterId' in api === false`), covering FIX 2 going forward.
- **Minor 1** — dropped the unread `functional` parameter from `resolveAnswer` and its `void functional;` suppression; updated the one call site.
- **Minor 3** — the `computes` branch of `resolveAnswer` now re-asserts non-empty `registrationRulings` for a `registration` answer, mirroring the `!computes` branch. Documented in-line that this is currently unreachable through any resolver this edition ships (every `RESOLVERS` answer's `answerClass` is already derived from `rulings.length > 0` in `resolvers.ts`'s own `answer()` helper) — it is a defence against a future or malformed resolver, not a case any test can reach today. I did not fabricate a test for it; reporting it as an intentionally-defensive, currently-unreachable guard rather than silently claiming coverage.
- **Minor 5** — documented, at both call sites (`nightCommands.ts`'s `resolveStep` and `dayCommands.ts`'s two producers), why `registrationInconsistency` reads pre-transaction `store.getState()` while `flagTargetIssues` reads `tx.view()`: the former asks a question about history (does this contradict a PRIOR transaction's ruling, which must never be checked against itself) and the latter asks a question about now (is the target alive at this point in the transaction).
- **Minor 7** — three new setup-command tests: duplicate player ids (`createGame` throws `/unique/i`), the player-count bound (`MIN_PLAYERS - 1` and `MAX_PLAYERS + 1`, both throw `/between/i`), and `beginFirstNight` refusing before roles are locked in (`/locked in/i`).
- **Minor 8** — the one non-null assertion in `nightCommands.ts` (`resolveImpStep`'s successor lookup) is now a throw with a message naming the missing id, rather than `!`.

## Deferred — confirmed untouched

Per instruction, did not touch: the `registersAs.alignment` comparison gap, contradictory rulings within a single event, the synthetic §16.6 test in `nightCommands.test.ts` (still there — FIX 3's and FIX 6's new tests are additional, realistic routes, not a replacement for it), or `nightCommands.ts`'s length.

## Verification before commit

Full suite (both projects), typecheck, lint, all after every fix was applied and every revert restored:

```
$ npx vitest run
 Test Files  29 passed (29)
      Tests  464 passed (464)

$ npm run typecheck
> tsc --noEmit
(clean)

$ npm run lint
> eslint .
(clean)
```

423 (Task 16 baseline stated in the brief) → 451 (my original Task 16 commit, `5f815ab`) → 464 (this fix round, `872eb09`): **+13**, verified two ways. Full-suite: `npx vitest run` reports 451 → 464. Per file, counting `it(` blocks against `5f815ab`: `nightCommands.test.ts` 19 → 28 (+9: FIX 3's three, FIX 4's one, FIX 5's one, the barrel section's one old test replaced by two new ones (net +1), Minor 7's three); `dayAbilities.test.ts` 9 → 11 (+2, FIX 6); `applyEvent.test.ts` 18 → 20 (+2, FIX 1). 9 + 2 + 2 = 13, matching the full-suite delta exactly, with no other file touched.

No file outside this round's list was touched. `git status --short` before commit showed exactly the seven files above, nothing else, no leftover scratch files (`__scratch_*`, `/tmp/*.ts.fix*`) from any RED/GREEN revert.

Status: **DONE**.
