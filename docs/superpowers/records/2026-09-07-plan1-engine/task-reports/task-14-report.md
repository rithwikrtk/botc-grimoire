# Task 14 report: the day phase — nominations, votes, thresholds and execution

## What I implemented

Transcribed the brief's four files verbatim, with R9's two import additions applied:

- `src/engine/selectors/nominations.ts` — `threshold`, `thresholdDerivation`, `todaysNominations`,
  `nominationsOnDay`, `tallyFor`, `voteOrder`, `FlagDraft`, `butlerViolations`, `nominationIssues`,
  `voteIssues`, `resolveDayExecution`.
- `src/engine/commands/dayCommands.ts` — `nominate`, `castVote`, `closeNomination`, `closeDay`,
  `beginNight`, `endGame`. Applied R9: added `GameState` to the `../types` import (needed by
  `nextNominationId`) and `butlerViolations` to the `../selectors/nominations` import (needed by
  `closeNomination`). Changed nothing else about those imports.
- `src/engine/selectors/nominations.test.ts` — Step 1 tests plus Step 5's Butler-order-independence
  and per-nomination-threshold additions, with `butlerViolations` added to the import list.
- `src/engine/commands/dayCommands.test.ts` — Step 1 tests, unmodified.

`closeDay` and `beginNight` are implemented as two separate top-level commands, per the binding
decision in the dispatch: `closeDay` resolves the execution, routes a Demon death through §4.6
(reading the pre-DEATH view for `onDemonDeath` so `aliveCountAtDeath` counts the dying Demon), and
lets `checkVictory` run at commit while the phase is still day N — but it does **not** emit
`PHASE_ADVANCED`. `beginNight` is the only path that advances to night N+1, and refuses once
`victory.status !== 'ongoing'`.

## RED/GREEN evidence

**RED** — `npx vitest run src/engine/selectors/nominations.test.ts src/engine/commands/dayCommands.test.ts`
before either production file existed:

```
FAIL  |app| src/engine/commands/dayCommands.test.ts
Error: Cannot find module './dayCommands' imported from '.../dayCommands.test.ts'
FAIL  |app| src/engine/selectors/nominations.test.ts
Error: Cannot find module './nominations' imported from '.../nominations.test.ts'
Test Files  2 failed (2)
     Tests  no tests
```

Expected failure (modules not found) — matches the brief's Step 2 expectation exactly.

**GREEN** — same command after writing `nominations.ts` and `dayCommands.ts` (Steps 1–4, before
Step 5's additions):

```
✓ |app| src/engine/selectors/nominations.test.ts (26 tests) 7ms
✓ |app| src/engine/commands/dayCommands.test.ts (9 tests) 5ms
Test Files  2 passed (2)
     Tests  35 passed (35)
```

Both files passed on the first implementation attempt — no red/fix cycle was needed once the
modules existed, i.e. the brief's code block was internally correct (apart from the R9 import
omissions, fixed before writing).

**GREEN after Step 5** (Butler order-independence + per-nomination threshold tests added):

```
✓ |app| src/engine/selectors/nominations.test.ts (32 tests) 7ms
✓ |app| src/engine/commands/dayCommands.test.ts (9 tests) 5ms
Test Files  2 passed (2)
     Tests  41 passed (41)
```

**Full engine suite** (`npx vitest run src/engine`): 16 files, **273 passed** (was 232 before this
task; +41 is exactly this task's new tests — 32 selector + 9 command).

**Full repo suite** (`npx vitest run`): 25 files, **390 passed** (was 349 at the start of this
task per the dispatch; +41, reconciled — this task added exactly 2 test files and 41 tests, no
other file changed).

**Typecheck**: `npm run typecheck` → clean, no output beyond the tsc invocation.

**Lint**: `npm run lint` → clean, no output beyond the eslint invocation. No `eslint-disable` was
added anywhere.

## Redden-mapping: the single-line production change for every test

Grouped by describe block. "Production line" refers to `nominations.ts` unless stated otherwise.

### `threshold` / `thresholdDerivation`
- `%i alive needs %i votes` (×4, `it.each`): change `Math.ceil(aliveCount(view) / 2)` to
  `Math.floor(...)` — 7-alive and 5-alive cases both redden (4→3, 3→2).
- `shows its working`: change the derivation string `\`ceil(${alive} alive / 2)\`` to drop
  "ceil(" or change the result line's `Math.ceil(alive / 2)`.

### `voteOrder`
- `starts clockwise from the nominee's left and wraps`: change
  `ring.slice(start + 1).concat(ring.slice(0, start + 1))` to `ring.slice(start).concat(ring.slice(0, start))`
  (drop the `+1`, i.e. start from the nominee instead of their left neighbour) — reverses the whole
  expected array.
- `includes the dead, who may still spend a ghost vote`: add `.filter((p) => p.alive)` after
  `ringOrder(view)`.

### `nominationIssues`
- `accepts a clean nomination`: flip any one guard to fire unconditionally, e.g. change
  `if (!nominator.alive)` to `if (true)` — the clean fixture would then get a spurious issue.
- `flags a dead nominator as integrity`: delete the `if (!nominator.alive) { issues.push(...) }`
  block, or change its `class` from `'integrity'` to `'social'`.
- `flags a dead nominee as integrity`: same, for the `nominee_dead` block.
- `flags self-nomination as integrity`: same, for the `if (nominatorId === nomineeId)` block.
- `flags a second nomination by the same nominator as social`: delete the
  `nominator_already_nominated` block or change its class to `'integrity'`.
- `flags a second nomination against the same nominee as social`: same, for
  `nominee_already_nominated`.
- `does not carry yesterday's nominations into today`: change
  `const today = todaysNominations(state);` to `const today = state.nominations;` — yesterday's
  nomination would then trip `nominator_already_nominated`/`nominee_already_nominated`.

### `voteIssues` — Butler ruling
- `flags a Butler voting without their Master... vote still counts`: delete the final
  `if (voter.characterId === 'butler' && ...)` block in `voteIssues`. (The "vote still counts"
  half of this test is guaranteed by the Task-4 reducer, not by this task's code — `voteIssues`
  never calls `emit`, so it structurally cannot block a vote. There is no single line in this
  task's files that would break that half; it is inherent to the architecture.)
- `does not flag a Butler who votes after their Master`: in the same block, change the guard
  `if (master && !nomination.votes.some((v) => v.voterId === master.id))` to `if (master)` (drop
  the "master hasn't voted yet" clause).
- `does not flag a poisoned Butler`: drop `abilityFunctional(view, voter)` from that block's
  outer condition.
- `does not restrict a dead Butler's ghost vote`: drop `voter.alive` from the same condition.

### `butlerViolations` (Step 5)
- `clears the violation once the Master votes, whatever the order`: change
  `return !voted.has(master.id);` to `return true;` — the Butler would stay flagged even after
  the Master votes.
- `reports a violation when the Master never votes`: change the same line to `return false;`.
- `does not report a poisoned Butler`: drop `!abilityFunctional(view, voter)` from the `.filter`
  chain in `butlerViolations`.
- `ignores an expired Master mark from a previous night`: **no single line in this task's two
  files reddens this one.** `nominations.ts` only calls `masterOf(view, voter.id)` on a freshly
  built `view`; the expiry logic lives entirely in `masterOf` (`selectors/statuses.ts`, dropping
  its `effective`/active-status check) and `isStatusActive` (`phase.ts`). I'm flagging this
  honestly rather than inventing a line in a file I don't own — it is a genuine regression test,
  just not one this task's production code can redden on its own; it pins the composition of
  Tasks 4/9's expiry machinery with this task's Butler check.

### `voteIssues` — dead votes
- `does not flag a dead player's first vote`: change
  `if (!voter.alive && storedVoter?.deadVoteSpent)` to `if (!voter.alive)` (drop the
  `deadVoteSpent` clause).
- `flags a second dead vote as social, and counts it`: delete that same block entirely (issues
  list check half); the "counts it" half is again reducer-guaranteed, not blockable here.
- `flags a duplicate vote on the same nomination as integrity`: change the `duplicate_vote`
  block's class from `'integrity'` to `'social'`, or delete the block.

### `resolveDayExecution`
- `executes nobody when no nomination met the threshold`: change the `qualifying` filter from
  `tallies.filter((row) => row.tally >= row.required && row.nomineeAlive)` to
  `tallies.filter((row) => row.nomineeAlive)` (drop the threshold clause).
- `executes the unique highest tally that met the threshold`: change
  `const highest = Math.max(...qualifying.map((row) => row.tally));` to `Math.min(...)`.
- `executes nobody on a tie at the top`: delete the `if (leaders.length > 1) { return ... }`
  branch.
- `executes nobody on a day with no nominations`: delete the `if (today.length === 0) { return ... }`
  early-return block.
- `counts an invalid Butler vote toward the tally that decides the execution`: there is no line
  to *delete* here — `tallyFor` is already unconditional (`nomination.votes.length`). This test
  is the guard against ever *adding* a filter, e.g. inserting
  `nomination.votes.filter((v) => !butlerViolations(...).includes(v.voterId)).length` into
  `tallyFor` or `resolveDayExecution`. Naming the change as an insertion rather than a deletion,
  per the instructions' intent.

### `resolveDayExecution` — per-nomination threshold (Step 5)
- `judges each nomination against the threshold it was voted under`: change
  `required: nomination.closedThreshold ?? liveThreshold` to `required: liveThreshold`. **Verified
  this is not hollow**: the fixture starts at 8 alive (threshold 4), closes nomination A at 3
  votes, then kills two players so the live threshold drops to 3 — with the one-line change above,
  A's 3 votes would meet the now-live threshold of 3 and it would be wrongly executed. The
  assertion (`playerId` null, derivation mentions "threshold of 4") only holds with the frozen
  `closedThreshold`.
- `never executes a nominee who is already dead`: drop `&& row.nomineeAlive` from the `qualifying`
  filter (same line as above, different clause).

## `dayCommands.test.ts`

- `opens a nomination and flags an illegal one in the same transaction`: reorder `nominate`'s
  transaction body so `emitFlags(tx, issues)` runs before `tx.emit('NOMINATION_OPENED', ...)` —
  breaks the exact `['NOMINATION_OPENED', 'RULE_FLAGGED']` event-type sequence.
- `undoes the nomination and its flag together`: split `nominate` into two `store.transaction()`
  calls (one for the open, one for the flags) instead of one — `store.undo()` would then only
  drop the second transaction, leaving the nomination behind. (Not literally a one-line edit, but
  the qualitative single change: stop treating "one Storyteller action" as "one transaction.")
- `records a vote and closes the nomination with write-only forensics`: in `closeNomination`,
  change `auditThreshold: threshold(view)` to a stale or wrong value (e.g. drop the `view` capture
  and use `threshold(toRulesView(store.getState()))` computed after emitting other events) — or,
  more simply, hardcode `auditTally: nomination.votes.length + 1`.
- `closes a day with zero nominations... Mayor win reachable`: add
  `tx.emit('PHASE_ADVANCED', { phase: 'night', number: state.phase.number + 1 })` inside
  `closeDay`'s transaction body. This is the single assertion
  (`expect(store.getState().phase).toEqual({ kind: 'day', number: 1 })`) that is the entire guard
  on the "closeDay does not advance the phase" decision, exactly as flagged in the dispatch.
- `executes at day close in one undoable transaction, leaving the phase on the day`: move
  `const view = tx.view();` to after `tx.emit('DEATH', ...)` — `onDemonDeath` would then throw
  because the victim already reads as dead in that view (§16.1's own guard), turning a silent
  miscount into a loud failure, but still reddening this test.
- `awards evil the game when a Saint is executed by vote (§4.7 row 2)`: add the same
  `PHASE_ADVANCED` line as above inside `closeDay` — `checkVictory` would then run against
  `view.phase = night 2` while `death.phase = day 1`, and row 2's phase-equality clause would
  never fire, so evil would never win. **Verified this genuinely exercises the command-layer
  path**: `seededWithSaint()` → `nominate` → four `castVote`s → `closeNomination` → `closeDay`,
  with no direct call to the victory predicate or to `checkVictory` in the test itself.
- `does not award it for a POISONED Saint`: same `PHASE_ADVANCED` insertion — with the phase
  advanced before commit, the Saint's poison (applied night 1, expiring day 1) would already read
  as inactive, `abilityFunctional` would flip to true, and row 2 would fire despite the poison —
  turning "ongoing" into "evil wins" and reddening the test.
- `refuses to begin the night once the game is decided`: delete
  `if (state.victory.status !== 'ongoing') { throw new Error(...) }` from `beginNight`.
- `ends an abandoned game so the reason has a producer`: change `endGame`'s
  `tx.emit('GAME_ENDED', { winner, reason })` to hardcode one field, e.g. `{ winner: 'good', reason }`
  ignoring the passed-in `winner`.

## Defects found in the brief

Only the two R9 import omissions given in the dispatch (both applied, nothing else changed):
1. `nextNominationId(state: GameState)` needed `GameState` added to the `../types` import.
2. `closeNomination`'s call to `butlerViolations(state, nominationId)` needed `butlerViolations`
   added to the `../selectors/nominations` import.

R10 (drop `applyEvent.ts` from the commit, and correct the commit message) is applied below.

I found **no third defect**. Both code blocks compiled and passed on the first write, both
before and after Step 5's additions. I specifically checked the three things called out in the
dispatch as likely hiding places for a hollow test:
- The per-nomination-threshold `resolveDayExecution` test genuinely depends on
  `closedThreshold ?? liveThreshold` — confirmed above by hand-tracing the fixture (8→4 at close,
  8→6 alive after two deaths → live threshold 3, frozen threshold 4 still governs).
- The day-close phase assertion is real and is exactly what the "does not advance the phase"
  decision rests on — verified it fails if `PHASE_ADVANCED` is added inside `closeDay`.
- The Saint-execution test reaches §4.7 row 2 through `nominate`/`castVote`/`closeNomination`/
  `closeDay`, not through a direct call to `checkVictory` or the predicate.
- `voteOrder`'s full 8-element assertion matches `seating.ts`'s documented seat+1-is-left
  convention exactly; reversing `ring.slice(start + 1).concat(ring.slice(0, start + 1))`'s offset
  would flip it.

The one honest gap I did find (not a defect, a coverage note): no test in either file exercises
a **non-empty** `butlerVotesFlagged` through `closeNomination` at the command layer — the only
command-level test of that field passes with an empty array, which would pass even if
`closeNomination` hardcoded `[]` instead of calling `butlerViolations`. `butlerViolations` itself
is thoroughly tested at the selector level (four dedicated tests plus the "clears... whatever the
order" test), so the underlying logic is pinned; only the one-line wiring in `closeNomination` is
technically unverified at the command layer. I did not add a test for this because the brief did
not ask for one and the four owned files are meant to be a faithful transcription — flagging it
here rather than silently patching in an extra test.

## Files changed

- `src/engine/selectors/nominations.ts` (new)
- `src/engine/selectors/nominations.test.ts` (new)
- `src/engine/commands/dayCommands.ts` (new)
- `src/engine/commands/dayCommands.test.ts` (new)

No other file was touched. `git status --porcelain` shows exactly these four untracked files.

## Self-review findings

- Diffed against the brief line-by-line; the only deviations are R9's two import lines, applied
  exactly as instructed and nothing else.
- No file owned by another task was touched (`applyEvent.ts` was read only, never edited, per
  R10).
- No `eslint-disable` anywhere; `npm run lint` is clean.
- No perceived-character import in either new file; both selectors import only
  `{ aliveCount, playerById }` from `./players`, which is unrestricted.
- Test output is pristine: no console warnings, no `.only`/`.skip` left in, no flaky timing
  (`LogBuilder`'s clock is deterministic, `createStore`'s clock in `dayCommands.test.ts` is a
  seeded counter).
- Full suite count reconciles exactly: 349 → 390 (+41), matching 32 new selector tests + 9 new
  command tests, across 23 → 25 files (+2, the two new test files).

## Commit

Applied R10: `applyEvent.ts` dropped from `git add` and from the commit message (it was never
touched — read only, to confirm the brief's claim about a reducer Butler check was false, which it
was: no such string exists in `applyEvent.ts`). Corrected the day-close paragraph to say `closeDay`
resolves the execution and routes a Demon death through §4.6 in one undoable transaction but does
**not** advance the phase, and that a separate `beginNight` does. Deleted the final paragraph
claiming a reducer fix.

## Concerns

- The Butler-related tests that assert `toEqual([])` are only meaningful paired with their
  positive counterparts, as the dispatch anticipated; I've verified every pairing exists and named
  the reddening line for each, with one honest exception (the expired-Master-mark test, whose
  regression line lives in `statuses.ts`/`phase.ts`, not in this task's files).
- Minor coverage gap noted above: `closeNomination`'s `butlerVotesFlagged` wiring is only
  exercised with an empty array at the command layer. Not fixed, since it's outside the brief's
  literal scope and the underlying selector is well covered.

---

# Fix round 1 (review: spec ✅, quality Needs fixes — 0 Critical, 3 Important, 13 Minor)

FIX_BASE: `d944291`.

## What changed

### FIX 1 (Important) — `closeDay` had no phase precondition

`src/engine/commands/dayCommands.ts`: added `if (state.phase.kind !== 'day') throw new Error('It is not day');`
as the first line of `closeDay`'s body, matching `beginNight`'s existing symmetric guard twelve
lines below. Documented why in the docstring: row 4 (§4.7) checks only `dayClosed`, `aliveCount`,
`todaysExecutions` and the Mayor — no phase clause — so a `closeDay` called during a night is
reachable and would commit `{ dayClosed: true }` against a night state, silently handing good a
win row 4 never intended to award there.

**Covering test** (`dayCommands.test.ts`, `'refuses to close a day that is not the current phase'`):
uses a new `seededAtNight()` fixture (same roster as `seeded()`, stopped after the night-1
`PHASE_ADVANCED`, no day advance) and asserts `closeDay(store)` throws `/it is not day/i`.

**RED** — reverted the guard (deleted the `if` line) and ran the covering test alone:

```
npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to close a day that is not the current phase"

 × day commands (§4.8, §7) > refuses to close a day that is not the current phase 5ms
   → expected [Function] to throw an error
 AssertionError: expected [Function] to throw an error
 Tests  1 failed | 12 skipped (13)
```

**GREEN** — restored the guard from the pre-edit backup, ran the same test:

```
npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to close a day that is not the current phase"

 ✓ |app| src/engine/commands/dayCommands.test.ts (13 tests | 12 skipped) 2ms
 Tests  1 passed | 12 skipped (13)
```

Restored file diffed byte-identical against the pre-experiment copy (`diff ... && echo IDENTICAL`
printed `IDENTICAL`) before moving on, so the revert-and-restore left no residue.

### FIX 2 (Important) — `closeNomination`'s `butlerVotesFlagged` wiring was unexercised at the command layer

No production change was needed — `closeNomination` already wires
`butlerVotesFlagged: butlerViolations(state, nominationId)` correctly (this was the disclosed gap
from the first pass: the only existing command-layer test asserted `[]`, which passes identically
whether or not the wiring is real). Added a fixture, `seededWithButlerMaster(masterId)` (same
7-seat roster as `seeded()`, with a `master` STATUS_APPLIED for `p3` → `masterId` during night 1,
so the mark is active on day 1 per `expiryFor('tonight_and_tomorrow', ...)`), and a new test:
Butler `p3` votes, their Master genuinely never does, `closeNomination` is asserted to produce
`butlerVotesFlagged: ['p3']`.

**RED** — temporarily hardcoded `butlerVotesFlagged: []` in `closeNomination` (deleting the call to
`butlerViolations`) and ran the covering test:

```
npx vitest run src/engine/commands/dayCommands.test.ts -t "records the Butler in the closed nomination"

 × ... records the Butler in the closed nomination's forensic record when they voted without their Master (§16.3) 6ms
   → expected { id: 'nom1', auditTally: 1, …(2) } to match object { butlerVotesFlagged: [ 'p3' ] }
   - Expected
   +   "butlerVotesFlagged": [],
 Tests  1 failed | 12 skipped (13)
```

**GREEN** — restored `butlerVotesFlagged: butlerViolations(state, nominationId)`, ran the same test:

```
npx vitest run src/engine/commands/dayCommands.test.ts -t "records the Butler in the closed nomination"

 ✓ |app| src/engine/commands/dayCommands.test.ts (13 tests | 12 skipped) 4ms
 Tests  1 passed | 12 skipped (13)
```

### FIX 3 (Important) — the Scarlet Woman promotion branch inside `closeDay` was entirely uncovered

No production change was needed either — the branch (`if (demonDeath.successorId) { ... tx.emit('ROLE_CHANGED', ...) }`)
was already correct. Added a 6-seat fixture matching the guide §2 chart exactly (3 townsfolk, 1
outsider, 1 minion, 1 demon: imp / scarlet_woman / butler / chef / empath / monk) via
`seededWithScarletWoman()`, and a new test: nominate and execute the Imp by vote with all 6 alive
(threshold 3, three votes), through `nominate` → `castVote` → `closeNomination` → `closeDay`.
Asserts the `DEMON_DIED` event's payload (`aliveCountAtDeath: 6, successorId: 'p2', successorReason:
'scarlet_woman'`), that `p2`'s `characterId` became `'imp'`, and that `victory` is still `{ status:
'ongoing', reason: null }`.

Confirming `aliveCountAtDeath` counts the dying Demon and is not one less: the assertion is an exact
match (`toMatchObject({ aliveCountAtDeath: 6, ... })`) against a 6-player roster with nobody dead
before the execution — if `onDemonDeath` had been called against the post-DEATH view (the off-by-one
this whole file's docstrings warn about), `aliveCountAtDeath` would read 5, not 6, and this exact
assertion would fail. `onDemonDeath` itself also throws if handed a view where the named player is
already dead (§16.1's own guard, Task 12), which is a second, independent check that the
pre-DEATH-view contract here is honoured — a caller who accidentally moved `tx.view()` to after the
`DEATH` emit would not get a silently wrong number, it would get a thrown error instead, and this
test would still redden (differently) either way.

**RED** — temporarily neutered the promotion branch (`if (false && demonDeath.successorId)`,
suppressing the `ROLE_CHANGED` emit while keeping the rest of the transaction intact) and ran the
covering test:

```
npx vitest run src/engine/commands/dayCommands.test.ts -t "promotes the Scarlet Woman"

 × ... promotes the Scarlet Woman when the Demon is executed by vote with 5+ alive (§4.6, §16.9) 6ms
   → expected 'scarlet_woman' to be 'imp' // Object.is equality
 Tests  1 failed | 12 skipped (13)
```

(With the branch suppressed, `p2` never actually becomes the Demon; `checkVictory` would in fact
have gone on to see no living Demon and end the game for good on the spot — exactly the failure
mode described in the review — but the test fails at the `characterId` assertion first, which is
sufficient to redden it.)

**GREEN** — restored the branch (including the type-narrowing comment) and ran the same test:

```
npx vitest run src/engine/commands/dayCommands.test.ts -t "promotes the Scarlet Woman"

 ✓ |app| src/engine/commands/dayCommands.test.ts (13 tests | 12 skipped) 3ms
 Tests  1 passed | 12 skipped (13)
```

### Minors folded in

- **Minor 4**: `thresholdDerivation` now calls `threshold(view)` for its result line instead of
  recomputing `Math.ceil(alive / 2)` inline.
- **Minor 5**: extracted `restrictedButlerMaster(view, player): RulesViewPlayer | null` in
  `nominations.ts` — the shared butler ∧ alive ∧ ability-functional ∧ has-an-active-Master
  eligibility test — and switched both `butlerViolations` and `voteIssues` to call it instead of
  each carrying its own copy of the four-clause check.
- **Minor 6**: `castVote` now throws `Unknown nomination: ${nominationId}` on an unrecognised
  nomination id, matching `closeNomination`'s existing guard. Covered by a new test
  (`'refuses to cast a vote on an unknown nomination'`).
- **Minor 7**: added a `vote_after_close` test (`voteIssues` flags a vote cast after
  `NOMINATION_CLOSED` as social, and it still counts) and a `todaysNominations` night-guard test
  (a `NOMINATION_OPENED` pushed directly during night 1 is invisible to `todaysNominations`, even
  though the night and the day that follows share a phase number).
- **Minor 9**: `withButlerMaster` moved to module scope in `nominations.test.ts` and parametrized
  with an optional `{ poison?: string }`; the three previously-inlined copies (the two
  poisoned-Butler tests and the invalid-Butler-vote `resolveDayExecution` test) now call it.
- **Minor 10**: `SAINT_ROLES`' declared `distribution` in `dayCommands.test.ts` corrected from
  `{ townsfolk: 5, outsider: 0, ... }` (the 7-player chart's default) to `{ townsfolk: 4, outsider:
  1, ... }` (the roster's true counts, since the Saint occupies the Outsider slot).
- **Minor 11**: the poisoned-Saint test now also asserts `p3`'s `alive` is `false`, so it witnesses
  the execution it is named for rather than passing identically if `closeDay` never executed
  anyone.
- **Minor 12**: `emitFlags`'s parameter is now typed `FlagDraft[]` (imported as a `type` from
  `../selectors/nominations`) instead of `ReturnType<typeof nominationIssues>`; the pointless
  `[...tallies.map(...)]` spread in `resolveDayExecution`'s derivation construction was simplified
  to a bare `tallies.map(...)`; the stray blank line before `closeDay`'s transaction body closes
  was removed.
- **Comment-only note** (not a code change, per the review's explicit instruction not to
  restructure): added a comment at the `ROLE_CHANGED` emit in `closeDay` explaining that the
  `'starpass'` arm of `demonDeath.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman'` is
  unreachable through this call site (which hardcodes `starpass: false`) but is a type narrowing,
  not dead code, and is kept for consistency with the identical idiom Tasks 15 and 17 repeat at
  their own starpass-capable call sites.
- **One test beyond the review**: added a test for `nominationsOnDay` (`'is readable on a later
  day, unlike todaysNominations'`) — exported, zero-tested production code whose consumer is Task
  16's Undertaker step. Reddens if `nominationsOnDay`'s day filter, or `todaysNominations`'s
  night-emptiness, drifts.

### Not touched, per the review's explicit instruction

- No `resolved`/`superseded` field was added to `RuleFlag` for the never-retracted
  `butler_without_master` flag.
- `closeDay`'s re-entrancy across transactions was left as-is.

## Verification

Focused suite:

```
npx vitest run src/engine/selectors/nominations.test.ts src/engine/commands/dayCommands.test.ts
✓ |app| src/engine/selectors/nominations.test.ts (35 tests) 7ms
✓ |app| src/engine/commands/dayCommands.test.ts (13 tests) 7ms
Test Files  2 passed (2)
     Tests  48 passed (48)
```

(35 = 32 from the initial pass + 3 new: `vote_after_close`, the `todaysNominations` night guard,
`nominationsOnDay`. 13 = 9 from the initial pass + 4 new: FIX 1's night-phase-throw test, FIX 2's
non-empty `butlerVotesFlagged` test, FIX 3's Scarlet Woman promotion test, Minor 6's
unknown-nomination-throw test.)

Full suite:

```
npx vitest run
Test Files  25 passed (25)
     Tests  397 passed (397)
```

397 = 390 (end of the initial pass) + 7 (3 selector + 4 command), reconciled exactly with no other
file touched (`git status --porcelain` shows only the same four files, now modified rather than
added).

```
npm run typecheck   -> clean
npm run lint        -> clean
```

## Self-review

- Diffed against `d944291`: only the four owned files changed
  (`git diff --stat d944291` → `dayCommands.test.ts`, `dayCommands.ts`, `nominations.test.ts`,
  `nominations.ts`; +313/-82 across all four).
- No `eslint-disable` added anywhere.
- Every one of the three Importants has real revert/restore evidence above, not just a passing
  test — this round exists specifically because a passing test alone was judged insufficient
  evidence in earlier rounds of this plan.
- Did not touch the two deferred findings (`RuleFlag`'s missing resolved/superseded field,
  `closeDay`'s re-entrancy) — recorded in the review as explicitly out of scope for this round.
- Did not disturb any of the three load-bearing properties the review credited: the §16.3 exact-
  threshold tally test, the retroactive-clearing-both-ways fixture, or the `closeDay`/`beginNight`
  split's four guards.

## Concerns

None beyond what's already on record from the first pass. This round's three Importants are all
now backed by revert-shown-red, restore-shown-green evidence.
