# Task 4 Report: Event catalogue and the reducer core

## What I implemented

Transcribed the brief's code verbatim, case by case, into:

- `src/engine/events.ts` — `GameEventPayloads` (24 keys), `EventType`, the mapped-type
  `GameEvent` discriminated union, `EventOfType<T>`, `NON_UNDOABLE_EVENT_TYPES`, and the
  re-exported `Team` type.
- `src/engine/reducer/applyEvent.ts` — `initialState()`, the `mapPlayer` /
  `stepKeyFromEvent` / `SINGLE_KEY_STEP_IDS` / `withSettled` helpers, `applyDeath`,
  `applyRolesAssigned`, and `applyEvent` with one `switch` case per event type plus the
  `never`-exhaustiveness `default`.
- `src/engine/reducer/fold.ts` — re-exports `applyEvent`/`initialState`/
  `SINGLE_KEY_STEP_IDS`, plus `applyMany` and `reduce`.
- `test/helpers/game.ts` — `LogBuilder`, `advanceTo`, `buildGame`, using the brief's
  *replaced* ending (static `CHARACTERS` import instead of the top-level `await import`
  the brief flagged as awkward).
- `src/engine/reducer/applyEvent.test.ts` and `src/engine/reducer/determinism.test.ts` —
  transcribed verbatim.

No other files were created. Nothing under `src/engine/selectors/`, `src/engine/rules/`,
`src/engine/commands/`, `src/engine/setup/`, `src/engine/index.ts`, or edition files was
touched.

## Transcription fidelity check

I diffed every file I wrote against the exact code blocks in the brief (extracting the
brief's fenced blocks with `sed` by line range and running `diff`). All five files that
have a single code block in the brief came back byte-for-byte identical:

```
EVENTS.TS: IDENTICAL
APPLYEVENT.TS: IDENTICAL
FOLD.TS: IDENTICAL
APPLYEVENT.TEST.TS: IDENTICAL
DETERMINISM.TEST.TS: IDENTICAL
```

`test/helpers/game.ts` is the one file the brief gives in two parts (a first draft, then
"replace those last two declarations with a plain static import"). I built the expected
merged file (first block's body up to the end of `buildGame`, plus the second block's
`TEAM_KEYS`/`teamOf` and its two extra imports merged into the top) and diffed it against
what I wrote:

```
GAME.TS: IDENTICAL
```

## What I tested and test results

TDD ordering followed exactly as the brief's steps.

### RED (Step 3): `npx vitest run src/engine/reducer`, before `fold.ts`/`applyEvent.ts` existed

```
FAIL  |reducer-purity| src/engine/reducer/applyEvent.test.ts [ src/engine/reducer/applyEvent.test.ts ]
Error: Cannot find module './fold' imported from '/Users/rithwik/stuff/botc/src/engine/reducer/applyEvent.test.ts'

FAIL  |reducer-purity| src/engine/reducer/determinism.test.ts [ src/engine/reducer/determinism.test.ts ]
Error: Cannot find module './fold' imported from '/Users/rithwik/stuff/botc/src/engine/reducer/determinism.test.ts'

 Test Files  2 failed | 1 passed (3)
      Tests  5 passed (5)
```

This matches the brief's expected failure exactly (`Cannot find module './fold'`); the one
passing file was the pre-existing `purity.guard.test.ts`.

### GREEN (Step 7): `npx vitest run src/engine && npm run typecheck && npm run lint`

```
 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 4ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (14 tests) 6ms

 Test Files  5 passed (5)
      Tests  34 passed (34)
```

`npm run typecheck` produced zero output (clean, exit 0). `npm run lint` produced zero
output (clean, exit 0).

### Full suite before commit

```
npm test
 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 4ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 6ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (14 tests) 7ms

 Test Files  8 passed (8)
      Tests  73 passed (73)

npm run typecheck   -> exit 0, no output
npm run lint        -> exit 0, no output
```

Test output is pristine throughout — no warnings, no console noise, no skipped tests.

## Case-by-case walk of the 24 event types

Walked every `case` in `applyEvent`'s switch against the corresponding `GameEventPayloads`
entry and the prose in the brief:

1. **GAME_CREATED** — seats players from `players` array order, sets `characterId: ''`,
   `alignment: 'good'`, `team: 'townsfolk'`, `alive: true`, and all `EMPTY_PLAYER_DEFAULTS`.
   Stores `edition`. No derived team/alignment yet (roles arrive later) — matches the first
   test ("derives nothing else from GAME_CREATED").
2. **PLAYER_RENAMED** — `mapPlayer` with a same-name short-circuit (`p.name === ... ? p :
   ...`), so a no-op rename returns the *same player object* and (since nothing else in the
   log changed) the same state — this is exactly what the "identical state object" test
   exercises.
3. **ROLES_ASSIGNED** — `applyRolesAssigned`: looks up each player's assignment (throws if
   omitted), sets `characterId`/`alignment`/`team`, `demonSince: state.phase` for the
   dealt Demon (a `Phase`, not a boolean — matches the "sets demonSince on the initial deal"
   test which asserts `{ kind: 'night', number: 0 }`), and `demonNotified: character.team
   === 'demon'` — Ruling R8's fix, present verbatim. Appends a `redHerring` status entry
   only for the flagged player, and copies `distribution`/`demonBluffs`/`drunkBelief`/
   `redHerring` onto state as literal (unmodified) values from the payload.
4. **ROLE_CHANGED** — guards against creating a second living Demon (`existingDemon` check,
   returns unmodified `state` — the §4.8 integrity invariant this task must not violate).
   Otherwise updates `characterId`/`alignment`/`team`, and sets `demonSince` only if unset
   (`p.demonSince ?? state.phase`), preserving the original promotion phase.
5. **PHASE_ADVANCED** — builds `Phase` from payload, throws if it does not strictly advance
   (`comparePhases(phase, state.phase) <= 0`), clears `todaysExecutions` only entering a
   day, not a night. Verified against three separate tests (derives phase, clears on new
   day but not on night, still visible for Undertaker at night).
6. **DAY_CLOSED** — pure passthrough (`return state`) — no `executedId` field exists on
   the payload (`Record<string, never>`), matching the "no executedId" v2 correction.
7. **NIGHT_STEP_RESOLVED** — settles the step key(s) via `stepKeyFromEvent` (group vs.
   per-actor, keyed off `SINGLE_KEY_STEP_IDS`), then for each `actorId` appends an
   `InfoRecord` to `infoHistory` and updates `demonNotified` only for the
   `scarlet_woman_notify` stepId. Verified against both the "night-scopes settled step
   keys" and "keys a group step once" tests (`minion_info` is in `SINGLE_KEY_STEP_IDS`, so
   it settles under one `GROUP` key regardless of `actorIds.length`).
8. **NIGHT_STEP_SKIPPED** — settles the step key(s) only; no player mutation. `reason` is
   stored nowhere (it's forensic-only in this event, consistent with the brief).
9. **NIGHT_KILL_RESOLVED** — settles the step key(s) only. Comment confirms deaths/
   promotions/statuses arrive as separate events in the same transaction.
10. **STATUS_APPLIED** — appends a `StatusEntry` built from
    `{ status, sourcePlayerId, effective, appliedAt: state.phase, expiresAt }` to the
    target's `statusLedger`. `effective` is taken verbatim off the payload (frozen at
    application time per §3.6) — no re-derivation, no defaulting. Verified against the
    ledger-shape test.
11. **STATUS_CLEARED** — filters the ledger by `(status, sourcePlayerId)` match, with a
    length-comparison short-circuit so a no-op clear returns the same player.
12. **DEATH** — `applyDeath`: no-ops if the player is missing or already dead (§4.8
    integrity, verified by the "ignores a DEATH for a player who is already dead" test),
    otherwise flips `alive: false`, appends a `DeathRecord` (conditionally spreading
    `executionKind` only when present, so `exactOptionalPropertyTypes` isn't violated by an
    explicit `undefined`), and — only when `cause === 'execution'` — appends to
    `todaysExecutions`.
13. **DEMON_DIED** — pure forensic passthrough (`return state`); the paired `ROLE_CHANGED`
    in the same transaction does the actual promotion.
14. **NOMINATION_OPENED** — pushes a new `Nomination` with `day: state.phase.number`,
    `votes: []`, `closed: false`, `closedThreshold: null`.
15. **VOTE_CAST** — no-ops on unknown nomination, unknown voter, or a voter who already
    voted on this nomination (idempotent). Appends `{ voterId, wasDead }` captured at cast
    time, and separately marks `deadVoteSpent` on the voter the first time a dead player
    votes (guide §12's ghost vote).
16. **NOMINATION_CLOSED** — sets `closed: true` and freezes `closedThreshold` from
    `auditThreshold`. `auditTally` and `butlerVotesFlagged` are read from the payload but
    never written anywhere — matching "write-only forensic record… no selector reads
    these" verbatim.
17. **EXECUTION** — pure forensic passthrough; the paired `DEATH` in the same transaction
    is what actually kills and appends to `todaysExecutions`.
18. **VIRGIN_TRIGGERED** — marks `nomineeId` (the Virgin) `virginTriggered: true`
    idempotently; does not touch the nominator (a separate `DEATH` handles that).
19. **SLAYER_CLAIMED** — only sets `slayerUsed` when `claimantIsRealSlayer` is true;
    a bluffing claimant leaves state untouched.
20. **RULE_FLAGGED** — appends `{ ...payload, phase: state.phase, seq: event.seq }` to
    `ruleFlags`. Produces no other derived state change, per §4.8.
21. **NOTE_ADDED** — appends a note, conditionally spreading `playerId` only if present
    (again respecting `exactOptionalPropertyTypes`).
22. **SPY_VIEWED** — pure passthrough. Present in `NON_UNDOABLE_EVENT_TYPES`.
23. **SPY_VIEW_ENDED** — pure passthrough. Present in `NON_UNDOABLE_EVENT_TYPES`.
24. **GAME_ENDED** — sets `victory: { status: winner, reason }`.

`default` branch: `const exhaustive: never = event;` — this only compiles because the
switch covers all 24 `EventType` members; confirmed by `npm run typecheck` passing with
zero errors. The "throws on an unrecognised event type" test exercises this branch via an
`as unknown as GameEvent` cast and asserts the thrown message matches `/unhandled event
type/i`.

No mistyped field names or `??`/`||` slips found in the walk — every payload field read
matches the field name in `GameEventPayloads`, and every write target matches the
corresponding `Player`/`GameState`/`Nomination`/etc. field in `src/engine/types.ts`.

## Purity

Walked every function reachable from `applyEvent`: `mapPlayer`, `stepKeyFromEvent`,
`withSettled`, `applyDeath`, `applyRolesAssigned`, and the `characterById`/`alignmentOf`
imports from Task 2. None call `Math.random`, `Date`/`new Date()`, `performance.now()`, or
`crypto.*`. `ts` is read only from `event.ts` (never defaulted or stamped inside
`applyEvent`) — the command layer's job, not this task's. The `reducer-purity` Vitest
project (which stubs all four to throw) ran both test files and all 34 reducer tests
passed, which is the actual enforcement mechanism, not just my reading.

## Referential stability

Two tests in `applyEvent.test.ts` cover this (§3.5):

1. **"returns identical sub-objects for everything the event did not touch"** — applies a
   `DEATH` for `p3` on top of a freshly-reduced state and asserts: `p3`'s player object is
   a *new* reference (it changed), `p1`/`p2`/`p4`/`p5` are the *same* references as before
   (untouched players are not rebuilt), and `nominations`, `ruleFlags`, `notes`,
   `settledStepIds`, and `distribution` are all the same top-level references (untouched
   collections are not rebuilt). Passed.
2. **"returns the identical state object when an event changes nothing"** — applies a
   `PLAYER_RENAMED` with the player's existing name and asserts `after === before` (the
   *entire* state object, not just a sub-object). This works because `PLAYER_RENAMED`'s
   case has the same-name short-circuit inside `mapPlayer`'s callback, so `next === prior`
   at the player level, which makes `mapPlayer` return the original `state` object
   unchanged. Passed.

## Files changed

- `src/engine/events.ts` (new)
- `src/engine/reducer/applyEvent.ts` (new)
- `src/engine/reducer/fold.ts` (new)
- `src/engine/reducer/applyEvent.test.ts` (new)
- `src/engine/reducer/determinism.test.ts` (new)
- `test/helpers/game.ts` (new)

Commit: `5beb296` — "feat(engine): add the event catalogue and the reducer core"

## Self-review findings

- Verified exactly 24 keys in `GameEventPayloads` via a script that extracts and counts the
  interface's top-level members: confirmed 24, listed above, no `CLAIM_RECORDED`/
  `CLAIM_RETRACTED`, `NOTE_ADDED` present.
- Verified `NON_UNDOABLE_EVENT_TYPES` contains exactly `SPY_VIEWED` and `SPY_VIEW_ENDED`.
- Verified no `perceivedCharacterId` field was added to `Player` (grepped `src/engine/types.ts`
  — untouched by this task; the field only appears as an optional payload field on
  `NIGHT_STEP_RESOLVED`, per the brief).
- Verified no files were created outside the six the brief specifies (`git status --short`
  before staging showed exactly those six as untracked).
- `npm run lint` exit code 0, zero output — no ESLint findings, including
  `consistent-type-imports` and `no-explicit-any` (both configured as errors).
- No issues found requiring fixes; nothing was changed after the byte-for-byte diff
  verification.

## Concerns

None. All three verification diffs (events.ts, applyEvent.ts/fold.ts/tests, game.ts) came
back byte-for-byte identical to the brief, all tests pass, typecheck and lint are clean,
and the case-by-case walk found no field-name or operator slips.

---

## Fix report — Round 1 (review findings)

Review found 4 Important and 14 Minor. Per the coordinator's ruling, fixed the 4
Important plus 4 folded-in Minors (6, 7, 8, and the `advanceTo` test coverage
half of what was labelled Important #3). Left everything the coordinator
explicitly ruled DO NOT change untouched (VOTE_CAST's `closed` check, the three
missing no-change short-circuits, double `characterById` lookups,
`initialState()`'s hardcoded edition, idempotency guards on
`NOMINATION_OPENED`/`NOTE_ADDED`, the determinism-test redundancy).

### What changed, file by file

**`src/engine/reducer/applyEvent.ts`**

- **Fix 1 (Important):** no code change here — the guard at the `ROLE_CHANGED`
  case was already correct. The gap was missing test coverage (see
  `applyEvent.test.ts` below).
- **Fix 2 (Important):** hoisted the bare `'scarlet_woman_notify'` literal to
  an exported `SCARLET_WOMAN_NOTIFY_STEP_ID` constant, declared beside
  `SINGLE_KEY_STEP_IDS` with a comment noting Task 9 must add it to the
  agreement-test coverage (the coordinator confirmed this is carried into
  Task 9 as an exit criterion).
- **Fix 4 (Important):** `stepKeyFromEvent` now throws
  `` `Per-actor step "${stepId}" resolved with no actorIds` `` when a step not
  in `SINGLE_KEY_STEP_IDS` arrives with `actorIds: []`, instead of returning
  `[]` and silently settling nothing.
- **Fix 5 (Important, escalated from Minor):** `PHASE_ADVANCED`'s
  `todaysExecutions` clearing is now
  `phase.kind === 'day' && state.todaysExecutions.length > 0 ? [] : state.todaysExecutions`
  instead of `phase.kind === 'day' ? [] : state.todaysExecutions` — preserves
  identity when the list was already empty.
- **Fix 6 (Minor):** removed `statusLedger`, `claims`, `infoHistory` from
  `EMPTY_PLAYER_DEFAULTS` (dead weight — all three are re-declared per player
  right after the spread in the `GAME_CREATED` case). Removed the
  now-unused `StatusEntry` import.
- **Fix 7 (Minor):** `NOTE_ADDED`'s optional `playerId` spread changed from
  `...(playerId ? { playerId } : {})` to `...(playerId !== undefined ? { playerId } : {})`,
  so an (unlikely but valid) empty-string `playerId` is not silently dropped.
  Left the look-alike pattern in `applyDeath`'s `executionKind` spread
  unchanged, per the coordinator's ruling that `ExecutionKind` has no falsy
  member so it's already safe.

**`test/helpers/game.ts`**

- **Fix 3, part 1 (Important):** `advanceTo` now computes the next candidate
  phase, checks the overshoot guard, and only pushes if the check passes —
  previously it pushed first and checked after, so an unreachable target left
  up to three spurious `PHASE_ADVANCED` events in the log before throwing.

**`test/helpers/game.test.ts`** (new file)

- **Fix 3, part 2 (Important):** added the first test coverage for this
  fixture helper, covering exactly the four things the coordinator asked for:
  `buildGame` event shapes, `push(..., sameTx)` txId grouping, `advanceTo`
  emitting the right `PHASE_ADVANCED` sequence to a distant target, and an
  unreachable target throwing with `builder.events` left unchanged (the
  assertion that pins the Fix 3 part 1 change above).

**`src/engine/reducer/applyEvent.test.ts`**

- **Fix 1 (Important):** added `describe('applyEvent — ROLE_CHANGED integrity
  guard (§4.8)')` with two cases:
  - (a) `ROLE_CHANGED { playerId: 'p2', to: 'imp', reason: 'st_correction' }`
    while `p1` is a living Imp: asserts `p1` unchanged (`alive: true, team:
    'demon'`), `p2` unchanged (`characterId: 'poisoner', team: 'minion'`), and
    exactly one living Demon.
  - (b) `DEATH { playerId: 'p1' }` then `ROLE_CHANGED { playerId: 'p2', to:
    'imp', reason: 'scarlet_woman' }` in an explicit **shared** `txId`: asserts
    `p1` is dead, `p2` IS promoted (`characterId: 'imp', team: 'demon',
    alignment: 'evil'`), `p2.demonSince` is the current phase, and exactly one
    living Demon after both events.
- **Fix 4 (Important):** added `'throws when a per-actor step resolves with no
  actorIds'`, asserting `applyEvent` throws `/no actorIds/i` for a
  `NIGHT_STEP_SKIPPED` on `stepId: 'empath'` (not in `SINGLE_KEY_STEP_IDS`)
  with `actorIds: []`.
- **Fix 5 (Important):** added `'preserves todaysExecutions identity across a
  night -> day transition with no executions'` to the §3.5 referential-
  stability `describe` block, asserting `after.todaysExecutions).toBe(before.todaysExecutions)`.
- **Fix 8 (Minor):** moved the `nextSeq = 0` reset out of `fivePlayerLog()`'s
  body and into a `beforeEach`, so every test's seq allocation no longer
  depends on `fivePlayerLog` having just run. Renamed `fourPlayerLog` to
  `fivePlayerLog` throughout the file (it builds five players; the old name
  was simply wrong).

### Spot-check: are the four new/changed tests real, or test-fitted?

Reverted each of the four Important fixes one at a time in the working tree,
ran the single covering test, confirmed it failed, then restored the file
byte-for-byte (`diff` against a backup copy) before moving to the next:

1. **Fix 4** (empty-`actorIds` guard removed): the "throws when a per-actor
   step resolves with no actorIds" test failed with
   `AssertionError: expected [Function] to throw an error` — confirms the test
   exercises the throw, not a tautology.
2. **Fix 5** (`todaysExecutions` unconditional reset restored): the
   "preserves todaysExecutions identity…" test failed with
   `expected [] to be [] // Object.is equality` (same value, different
   reference) — confirms the test checks referential identity, not just
   equality.
3. **Fix 1a** (two-Demons guard block removed entirely): the "refuses a
   ROLE_CHANGED that would create a second living Demon" test failed —
   `p2` was promoted to `imp`/`demon` instead of staying `poisoner`/`minion` —
   confirms the guard is load-bearing and the test catches its absence.
4. **Fix 1b** (guard's `p.alive` check dropped, so it blocks on ANY same-team
   corpse): the "promotes the Scarlet Woman…" test failed — `p2` stayed
   `poisoner`/`minion` instead of being promoted — confirms this test is what
   catches an over-firing guard, exactly as the coordinator said it should.

After each revert+check the file was restored and re-diffed identical to the
pre-check backup before moving on.

### Covering tests run and results

`npx vitest run src/engine/reducer test/helpers`:

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 4ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests) 7ms
 ✓ |app| test/helpers/game.test.ts (5 tests) 3ms

 Test Files  4 passed (4)
      Tests  31 passed (31)
```

`npm run typecheck`:

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit

(exit 0, no output)
```

`npm run lint`:

```
> botc-grimoire@0.1.0 lint
> eslint .

(exit 0, no output)
```

`npm test` (full suite, run once before committing):

```
> botc-grimoire@0.1.0 test
> vitest run


 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 4ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 4ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms
 ✓ |app| test/helpers/game.test.ts (5 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 6ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests) 9ms

 Test Files  9 passed (9)
      Tests  82 passed (82)
```

All pristine — no warnings, no console noise.

### A note on process

While spot-checking, I ran `git stash` to snapshot my working tree before
reverting a fix, which stashed ALL uncommitted changes (all four files) rather
than the one file I intended to isolate. I immediately ran `git stash pop` to
restore, verified via `grep` that every fix (`fivePlayerLog`, `beforeEach`,
the `ROLE_CHANGED integrity guard` describe block, `SCARLET_WOMAN_NOTIFY_STEP_ID`,
the `todaysExecutions.length > 0` guard, the `advanceTo` overshoot-before-push
order) was present and correct, then re-ran the full suite to confirm nothing
was lost. Nothing was lost, but for the remaining spot-checks I used targeted
`python3`/`sed` edits with a file-level backup and `diff` restore instead, to
avoid touching the rest of the working tree.

### Commit

`0f4a464` — "fix(engine): close review findings on the reducer core", on top
of `5beb296`.

### Concerns

None. All four Important findings are fixed and covered by a test that fails
without the fix (verified by reverting each one individually). The three Minor
findings folded in (6, 7, 8) are small and low-risk. Full suite, typecheck,
and lint are all clean.
