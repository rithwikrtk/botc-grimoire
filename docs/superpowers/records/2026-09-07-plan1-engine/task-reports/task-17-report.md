# Task 17 report: §3.4 correction commands

## Status: DONE

## What was built

- `src/engine/commands/correctionCommands.ts` — `addNote`, `clearStatus`, `changeRole`, `recordDeath`, transcribed verbatim from the brief's Step 3.
- `src/engine/commands/correctionCommands.test.ts` — transcribed from the brief's Step 1, with the R15 fix applied (see below).
- `src/engine/index.ts` — added `export { addNote, changeRole, clearStatus, recordDeath } from './commands/correctionCommands';` per R16.
- `src/engine/commands/nightCommands.test.ts` — added `'addNote'`, `'changeRole'`, `'clearStatus'`, `'recordDeath'` to `ENGINE_BARREL_RUNTIME_EXPORTS` (95 → 99 entries) per R16.

Verified `perceivedCharacterId`/`playersWithPerceivedCharacter` are not imported anywhere in `correctionCommands.ts` — all predicates read the true `characterId` via `playerById`/`characterById`. No `eslint-disable` added anywhere.

## R15 — applied as directed, and independently verified

Confirmed the diagnosis by temporarily reverting the test to the brief's single-`recordDeath` form and running it: it fails exactly as predicted —

```
× allows the change once the first Demon is dead
  expected 'chef' to be 'imp'
```

— because the Scarlet Woman at p3 is promoted to Imp in the same transaction as p1's death, so a living Demon remains and `changeRole`'s guard correctly (and, for this test, unhelpfully) drops the change. Added `recordDeath(store, 'p3', 'other')` after the first, and added a comment block above the test explaining why this correction necessarily lands after `checkVictory` has already declared good the winner (no living Demon left, §4.7 row 1) — that is unavoidable and is exactly the scenario `st_correction` exists for. Re-ran with the fix: passes. Full suite, typecheck, and lint are all clean with the fix in place.

## R16 — applied exactly as directed

Both halves done: the barrel export added to `src/engine/index.ts`, and the four names added to the hand-written `ENGINE_BARREL_RUNTIME_EXPORTS` array in `nightCommands.test.ts`. `nightCommands.test.ts` is staged and committed alongside `correctionCommands.ts/test.ts` and `index.ts`.

## Verification pass 1 — tests → mutations (single-line change that reddens each test)

All of the following were empirically confirmed by mutating `correctionCommands.ts` in place and re-running the affected test file (then restoring the original before moving to the next mutation — final state matches the committed file, confirmed clean via `git diff --stat` afterward).

1. **`addNote` — "records a game note with an id derived from the log"**: mutate `nextNoteId` to `return 'note1';` unconditionally → note text/scope assertions still pass but this is the shared id-generation path; killed by test 2 below, not needed to redden this one on its own (this test's own discriminator is dropping `text`/`scope` from the payload, e.g. swapping `scope` for a literal `'player'`).
2. **"does not reuse a note id after a reload"**: mutate `nextNoteId` to `return 'note1';` unconditionally → **reddens** (`Set(ids).size` 1 ≠ `ids.length` 2). I also tried two more conservative mutations — dropping the `+1` offset (`for (let n = 1; ...)`) and dropping the `taken.has` guard entirely (`return id` unconditionally, using only `state.notes.length`) — both **survive**, because under the sole producer's invariant (ids assigned monotonically by count, undo only truncates the tail) `state.notes.length + 1` alone never collides. Those two are alternate-correct implementations, not bugs; the test's real job — catching a producer that ignores prior state and reissues an id — is proven by mutation 1.
3. **"attaches a player note to that player"**: mutate `addNote`'s conditional spread to omit `playerId` when passed → `toMatchObject({ scope: 'player', playerId: 'p6' })` reddens (property absent). (Also: the *opposite* mutation — always including `playerId` even when `undefined` — is rejected by `tsc` itself, `exactOptionalPropertyTypes: true` refuses `playerId: string | undefined` against the optional-string field; this branch is enforced by the type system, not just the test.)
4. **`clearStatus` — "removes a status the Storyteller applied by mistake"**: swap `status`/`sourcePlayerId` in the `STATUS_CLEARED` payload → reddens (`statusLedger` retains the poisoned entry). Confirmed by mutation.
5. **`changeRole` — "corrects a mis-dealt role"**: change the guard's `&&` to `||` → reddens (`ruleFlags` no longer `[]`, since the "some other alive Demon" clause alone now trips it even for a non-Demon target). Confirmed by mutation.
6. **"records and FLAGS a change that would create a second living Demon"**: drop the `if (wouldDoubleDemon)` flag call, or flip `wouldDoubleDemon`'s `&&`, → reddens on `result.events` sequence and/or `ruleFlags[0]`. (Covered by the same `&&`→`||` mutation as #5, from the other direction — that mutation makes this test's own player-remains-`chef` and `demon` count assertions still true, since p5's target actually IS the demon here; the discriminator for *this* test is instead the reducer's own two-demon guard, exercised via `applyEvent.test.ts`, not re-verified here since it's Task 16's code.)
7. **"allows the change once the first Demon is dead"**: this is the R15 test. Reverting to the brief's original (single `recordDeath`) reddens it, as shown above; that revert is itself the mutation this test's added second `recordDeath(store, 'p3', 'other')` line guards against.
8. **`recordDeath` — "kills a player who dropped out, leaving them seated"**: negate the `isDemon` guard (`!== 'demon'`) → reddens (`p6`'s death now goes down the Demon path unexpectedly, though for a non-demon `onDemonDeath` isn't even reachable at all with the guard removed the other way — confirmed instead by mutation on test 9, see below, which is the sharper discriminator for this guard).
9. **"routes a Demon drop-out through the demon death handler"**: negate the `isDemon` guard (`!== 'demon'`) → reddens 3 of the 9 tests including this one (`result.events` becomes `['DEATH', 'GAME_ENDED']` instead of `['DEATH','DEMON_DIED','ROLE_CHANGED']`, since skipping `onDemonDeath` for the actual Demon leaves no living Demon and good wins immediately). Confirmed by mutation; restored after.

No test in this file was found to be hollow in the R15 sense (fails as originally written, or passes for a reason unrelated to its name). The one test I initially suspected of being hollow — the note-id reload test — does have real discriminating power against the actual regression its comment describes (a producer that reissues ids), confirmed by mutation; it just doesn't discriminate between two *other*, equally-correct implementation choices, which is expected and not a defect.

## Verification pass 2 — guards → tests (every branch, and what covers it)

- `nextNoteId`'s `taken.has(id)` check: covered (mutation 2 above kills a producer that ignores it).
- `addNote`'s `playerId ? {playerId} : {}` spread: covered by the runtime test (mutation 3) on the omit side; the include-`undefined` side is a compile error, not a runtime path (`exactOptionalPropertyTypes`).
- `changeRole`'s `wouldDoubleDemon` (both clauses of the `&&`): both clauses independently exercised — `team === 'demon'` true/false via the double-Demon test vs. the mis-dealt-role test; "some other alive Demon" true/false via the double-Demon test vs. the once-first-Demon-is-dead test. The `&&`→`||` mutation confirms both clauses are load-bearing (test 5).
- `changeRole`'s `if (wouldDoubleDemon) tx.flag(...)`: covered (double-Demon test asserts the exact `ruleFlags[0]` shape and the `['ROLE_CHANGED','RULE_FLAGGED']` event sequence).
- `recordDeath`'s `isDemon` branch: both true (Imp) and false (Empath) exercised; negating it reddens 3 tests (confirmed by mutation).
- `recordDeath`'s `demonDeath && demonDeath.kind === 'resolved'` check: the `kind === 'resolved'` half is **structurally unreachable as false** at this call site — `recordDeath` always calls `onDemonDeath` with `starpass: false`, and `onDemonDeath` only ever returns `kind: 'needs_successor_choice'` when `starpass` is true. I confirmed this empirically: deleting the `kind === 'resolved'` clause (leaving just `if (demonDeath)`) still passes all 9 correctionCommands tests and the full 473-test suite, but **fails `tsc`** — TypeScript's discriminated-union narrowing refuses to let `successorId`/`successorReason` be read off the `needs_successor_choice` arm without the check. So this guard's false branch has no *test* covering it, but it is enforced by the type checker, and it is dead code with respect to the runtime behavior of `recordDeath` specifically (it's still necessary in general — `onDemonDeath` is also called with `starpass: true` from the night-kill/execution/Slayer call sites in earlier tasks, where this guard is genuinely live). Not a defect: it's the same shared, phase-agnostic handler's contract as documented in `demonDeath.ts`, and `recordDeath` is one of several callers, most of which pass `starpass: false` by design (§18 drop-outs don't starpass).
- `recordDeath`'s `demonDeath.successorId` truthy branch: both true (Scarlet Woman promotes) and false (no successor left, in the R15 test's second `recordDeath`) are exercised; a mutation that always assigns a successor would leave a living Demon and break the R15 test's final assertion.
- `recordDeath`'s `successorReason === 'starpass' ? 'starpass' : 'scarlet_woman'` ternary: **no test observes the `reason` field's value** for a ROLE_CHANGED produced by `recordDeath` (only event *types* are asserted, never payloads). I mutated it to hardcode `'starpass'` and reran the full 473-test suite plus `correctionCommands.test.ts`, `applyEvent.test.ts`, and `demonDeath.test.ts` specifically — all still pass. This is not a live bug: the reducer's `ROLE_CHANGED` case never reads `reason` (it's forensic-only, stored solely in the event log, not in derived `GameState`), and since `recordDeath` hardcodes `starpass: false`, `onDemonDeath` can only ever return `successorReason: 'scarlet_woman'` here in practice (never `'starpass'`), so the ternary's true branch is dead code at this call site by construction — same shape as the note-id and `kind==='resolved'` findings above. I left it as-is (matches the brief verbatim, and matches the same ternary pattern at the other three §4.6 call sites from earlier tasks, where `starpass` genuinely can be true) rather than hardcoding `'scarlet_woman'` here, since that would diverge from the shared pattern for no behavioral gain. Flagging it rather than silently patching, per instructions — it's the plan's twentieth instance of a "cannot fail" shape, but it's benign: no derived state depends on it.

## Commands

```
npx vitest run       →  30 files, 473 passed (was 29 files / 464; +1 file, +9 tests)
npm run typecheck    →  clean (tsc --noEmit, no output)
npm run lint         →  clean (eslint ., no output)
```

## Commit

```
git add src/engine/commands/correctionCommands.ts src/engine/commands/correctionCommands.test.ts src/engine/index.ts src/engine/commands/nightCommands.test.ts
git commit -c user.email=rithwik@trypencil.com -m "..."
```

Commit sha: see the final message returned to the controller.

## Concerns for the controller

1. The three dead/unreachable-branch findings above (`nextNoteId`'s alternate-implementation insensitivity, `kind === 'resolved'`'s false-arm being TS-enforced rather than test-enforced, and the `successorReason` ternary's dead true-arm in this call site) are all benign — none change observable game behavior, and two are backstopped by the type checker rather than a test. None warranted a production-code change; noted for the record per the task's instruction to report rather than silently patch or silently pass over.
2. `recordDeath`'s `cause` parameter is typed as the full `DeathCause` (with `= 'other'` default) rather than the brief's Interfaces-section literal `'other'` — this matches the brief's own Step 3 code block verbatim, so I did not narrow it; only 'other' is ever passed in tests or (so far) call sites.

---

# Fix round 1 (5 rounds total; opus review: 0 Critical, 3 Important, 6 Minor)

FIX_BASE: 54bc5cf. All six items below applied. Files touched: `src/engine/commands/correctionCommands.ts`, `src/engine/commands/correctionCommands.test.ts` (same two files as the base commit — no other file needed changes).

Cleared by the review, untouched: R15's test (verified against applyEvent.ts:255's `p.alive` guard, both directions), the barrel contract, and the pre-transaction `characterById`/`playerById` ordering.

## FIX 1 (I1) — an already-dead target now gets both of §4.8's treatments

`recordDeath` now reads `player.alive` from the pre-transaction view. When the target is already dead: `onDemonDeath` is **never called** (so its §16.1 precondition throw — reserved for a caller passing the post-DEATH view — can't fire on a plain double-tap), and the transaction emits `DEATH` then `tx.flag('target_dead', 'integrity', ...)`, reusing the same rule name/class as `nightCommands.ts:88-98`'s target-dead flag. `onDemonDeath`'s throwing precondition itself is untouched.

Two new tests in `recordDeath (§18)`:
- `flags, rather than silently no-ops, a second death for an already-dead non-Demon`
- `flags, rather than throwing or re-promoting, a second death for an already-dead Demon`

**Witness — revert `recordDeath` to the base commit's already-dead handling** (drop the `player.alive` guard and the flag branch), run the two tests:

```
× recordDeath (§18) > flags, rather than silently no-ops, a second death for an already-dead non-Demon
  AssertionError: expected [ 'DEATH' ] to deeply equal [ 'DEATH', 'RULE_FLAGGED' ]
× recordDeath (§18) > flags, rather than throwing or re-promoting, a second death for an already-dead Demon
  AssertionError: expected [Function] to not throw an error but 'Error: onDemonDeath called for p1, who is already dead in this view — pass the state from BEFORE the DEATH event is applied, so aliveCountAtDeath counts the dying Demon (§16.1)' was thrown
```

Both branches fail differently, as predicted — the non-Demon case silently drops the flag, the Demon case throws §16.1's precondition. Restored the fix, reran:

```
✓ recordDeath (§18) > flags, rather than silently no-ops, a second death for an already-dead non-Demon
✓ recordDeath (§18) > flags, rather than throwing or re-promoting, a second death for an already-dead Demon
 Tests  2 passed | 14 skipped (16)
```

## FIX 2 (I2) — the reload test renamed to what it witnesses; the real guard now has a test

- Renamed "does not reuse a note id after a reload" → `gives a second Store built from the same log a distinct next id`, with a comment explaining it does NOT show reload-safety across a process restart (module state survives `createStore` within one test process) — it shows a fixed/constant id producer would collide, which it still correctly rules out.
- Added `does not collide with an existing id when the note log has a gap`: seeds a store directly from a raw event log holding `note1` and `note3` (a gap), then `addNote`s a third note and asserts the result is `['note1', 'note3', 'note4']` with no collision — the case the reviewer supplied, where `state.notes.length + 1` alone (`'note3'`) would collide with the existing `note3`.

**Witness — delete `nextNoteId`'s `taken` collision guard** (`return \`note${state.notes.length + 1}\`;`), run the `addNote` describe block:

```
× addNote (§3.4) > does not collide with an existing id when the note log has a gap
  AssertionError: expected [ 'note1', 'note3', 'note3' ] to deeply equal [ 'note1', 'note3', 'note4' ]
 Tests  1 failed | 5 passed | 10 skipped (16)
```

The gap test reddens; the renamed reload test (and the other 4 `addNote` tests) stay green — exactly the contrast the finding was about. Restored the fix, reran: all 6 `addNote` tests pass.

## FIX 3 (I3) — `recordDeath`'s `cause` narrowed to `'other' | 'demon' | 'slayer'`

Excludes `'execution'`, with a comment explaining executions arrive only via §7's nomination flow / the Virgin trigger, resolved by `closeDay`, and why accepting `'execution'` here would silently corrupt the Undertaker/Mayor/Saint victory checks. No day guard or `EXECUTION` emit was added, per the instruction not to give the app a second execution route.

**Witness — scratch file, deleted after, `git status` confirmed clean:**

```ts
// src/engine/commands/__fix3_scratch__.ts (never committed)
import { createStore } from '@/engine/commands/store';
import { recordDeath } from '@/engine/commands/correctionCommands';
const store = createStore([]);
recordDeath(store, 'p1', 'execution');
```

```
$ npx tsc --noEmit
src/engine/commands/__fix3_scratch__.ts(5,26): error TS2345: Argument of type '"execution"' is not
assignable to parameter of type '"demon" | "slayer" | "other" | undefined'.
```

Scratch file deleted; `npx tsc --noEmit` clean afterward; `git status --short` showed only the two intended files modified (correctionCommands.ts/test.ts).

No other caller of `recordDeath` exists yet in this tree (`grep -rn "recordDeath("` outside `correctionCommands.*` returns nothing) — Task 18 doesn't exist yet, so nothing to verify against directly; the narrowing is otherwise unconstrained.

## FIX 4 (M1) — commented the `successorReason` ternary

Added the same two-line rationale used at `dayCommands.ts`'s `claimSlayer` call site (the other call site that also hardcodes `starpass: false`, as opposed to `resolveImpStep`'s genuinely starpass-capable one): the `'starpass'` arm is TypeScript narrowing, not a live branch, because this call site hardcodes `starpass: false` above. Not restructured — matches all four call sites' idiom.

## FIX 5 (M2, M3, M4) — `clearStatus` and `addNote` now validate their inputs

- `clearStatus` now calls `playerById` on the pre-transaction view and throws `Unknown player id: ...` for an unknown `playerId` — matching `changeRole`/`recordDeath`. It deliberately does **not** guard a `status`/`sourcePlayerId` pair that matches nothing in the ledger (commented in place, so a future reader doesn't "finish" the guard) — new test `does not refuse clearing a status that was never applied` pins that as intentional.
- `addNote` throws `"addNote: scope 'player' requires a playerId"` when `scope === 'player'` and no `playerId` is given, and throws `Unknown player id: ...` (via `playerById`) when `playerId` names nobody. Two new tests: `refuses a player-scoped note with no playerId`, `refuses a note for an unknown playerId`.
- `addNote`'s `nextNoteId(store.getState())` call moved out of the transaction body to before `store.transaction(...)` opens, matching `nextNominationId`'s pattern in `dayCommands.ts`.

New test: `clearStatus (§3.4, §4.4) > refuses an unknown playerId`.

## FIX 6 (M5, clearStatus half) — vacuous-pass guard added

Added `expect(...).toHaveLength(1)` on the `STATUS_APPLIED` fixture before calling `clearStatus`, so the existing "removes a status..." test can no longer pass vacuously if the fixture stopped applying the status. (The `seat` half of M5 was explicitly deferred by the reviewer to Task 18's property test — left untouched.)

## Test count reconciliation: 473 → 480 (+7)

`correctionCommands.test.ts` went from 9 to 16 `it` blocks. New blocks:
1. `addNote (§3.4) > does not collide with an existing id when the note log has a gap` (FIX 2)
2. `addNote (§3.4) > refuses a player-scoped note with no playerId` (FIX 5)
3. `addNote (§3.4) > refuses a note for an unknown playerId` (FIX 5)
4. `clearStatus (§3.4, §4.4) > refuses an unknown playerId` (FIX 5)
5. `clearStatus (§3.4, §4.4) > does not refuse clearing a status that was never applied` (FIX 5)
6. `recordDeath (§18) > flags, rather than silently no-ops, a second death for an already-dead non-Demon` (FIX 1)
7. `recordDeath (§18) > flags, rather than throwing or re-promoting, a second death for an already-dead Demon` (FIX 1)

(The 8th change to the file — renaming the reload test per FIX 2 — is not a net addition, just a rename+recomment of an existing block; FIX 6's `toHaveLength(1)` is an added assertion inside an existing block, not a new `it`.)

## Final verification

```
npx vitest run       →  30 files, 480 passed (was 473; +7 `it` blocks, all named above)
npm run typecheck    →  clean (tsc --noEmit, no output)
npm run lint         →  clean (eslint ., no output)
git status --short   →  only correctionCommands.ts and correctionCommands.test.ts modified
```

## Concerns for the controller (fix round 1)

None blocking. FIX 3's absence of an existing caller to verify against (Task 18 not yet built) means the narrowing is unconstrained by any real call site today — flagging for visibility, not as a defect, since the brief's own Interfaces block already specifies the narrower `'other'` literal for this signature.
