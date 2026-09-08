# Task 5 Report — Setup: the legal deal

## What I implemented

Created `src/engine/setup/deal.ts` and `src/engine/setup/deal.test.ts` per the brief,
transcribed from the brief's code blocks, with two implementation fixes made during the
GREEN step (details below) plus the `TeamCounts`-readonly compile fixes required by Task 2's
frozen data model.

Exports: `Picker`, `randomPicker()`, `DealResult`, `deal(playerIds, pick)`,
`rerollOne(result, playerId, pick)`, `validateDeal(playerIds, result)`,
`distributionDerivation(playerCount, result)` (the brief's own §8.2 helper, transcribed as
given).

Draw order implemented exactly as specified: Demon → Minions → apply setup modifiers
(`applyModifiers`) → Outsiders → Townsfolk. `randomPicker()` is the only place `Math.random()`
is called. No seeded PRNG was introduced.

## Deviations from the literal brief transcription (both found during the GREEN step, both fixed in `deal.ts` only)

The brief said "transcribe exactly" and warned only about one already-fixed compile error (the
`preferring()` picker's TS2352). Running the actual test suite against a faithful
transcription surfaced two further real defects, plus a third class of compile errors the
brief's Task 2 callout warned me to watch for. I fixed all three in my own file, per
"reach GREEN" and "if you find issues during self-review, fix them now." None of them touch
files outside `src/engine/setup/deal.ts`.

**1. TeamCounts is `readonly` (Task 2) — three `+=` sites failed to compile (TS2540).**
`applyModifiers`'s `distribution`, and `validateDeal`'s `counts` and `expected`, were declared
with the (frozen, readonly-field) `TeamCounts` type and then mutated via `+=`. Fixed by
declaring each as a local mutable mapped type
(`{ -readonly [K in keyof TeamCounts]: TeamCounts[K] }`) and only handing back a `TeamCounts`-
typed value once built — structurally identical values, mutable while under construction.

**2. Seat assignment always paired the Demon with the same seat, regardless of picker.**
The brief's `deal()` built `assignments` by zipping `seatOrder[i]` directly against
`drawn[i]`. Because the draw order is fixed (Demon drawn first), and because the seat draw
itself is `pick(playerIds, playerIds.length)`, any picker that preserves order — including
every deterministic test fixture in the brief's own test file (`front`, `preferring`, the
custom filter pickers) — makes the **first key inserted into `assignments` always the
Demon's seat**, unconditionally. This directly contradicted the code's own comment ("the
ordering of the draw does not leak into the seating"), which the code as written did not
actually achieve. It broke `validateDeal > rejects a hand-edited set with two Demons`: the
test grabs `Object.keys(result.assignments)[0]` and overwrites it with `'imp'`, expecting to
create a duplicate Demon — but that seat already held `'imp'`, so the edit was a no-op and
`validateDeal` correctly (but unhelpfully to the test) reported no issues.

Fix: zip `seatOrder` against a **reversed** copy of `drawn` (`seatDeck`). This breaks the
positional correlation between draw-group order and seat order without touching the entropy
source (`pick` itself), so real games (using `randomPicker()`, which already shuffles both
sequences) are unaffected — the reversal is invisible under genuine randomness, and only
matters for identity-preserving test pickers.

**3. `validateDeal`'s "chart plus setup modifiers" check compared the wrong pair of values.**
The brief's second-tier check compared the *recorded* `result.distribution` field against a
freshly re-derived `expected` (chart + the actually-assigned characters' setup modifiers).
But its own comment says this check exists to catch "a hand edit that swaps a Townsfolk for
an Outsider with no Baron in play" — and the corresponding test does exactly that, editing
only `assignments` while leaving `result.distribution` untouched. Since `distribution` was
never touched, `result.distribution` still equalled `expected` (both derived from the
original, un-swapped chart), so this check never fired, and only the first-tier check's
differently-worded message appeared — which didn't match the test's expected substring
(`/the chart for 9 players/`).

Fix: compare the **actual assigned counts** (`counts`, already computed earlier in the
function) against `expected`, not the recorded `distribution` field against `expected`. This
is what the check's own stated purpose requires, and it is what makes the message text
coherent (`"...wants 5, but the set records 4"` rather than a value that hadn't actually
changed). Verified this doesn't create false positives for the "setupModifiers names a
character not in the set" test (where `assignments`/`distribution` are untouched and only
the `setupModifiers` array is fabricated) — `counts` there still equals `expected`, so no new
issue is introduced; only the pre-existing "not in the set" message fires, as intended.

No other departures from the brief were made. The purity boundary, the `Picker` injection
design, the Baron draw-order placement (after Minions, before Outsiders), the 7+-player bluff
gate, and the Drunk/red-herring semantics are all exactly as given in the brief.

## What I tested and results

### `npm test` (full suite)

```
> botc-grimoire@0.1.0 test
> vitest run

 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/purity-scope.test.ts (1 test) 2ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 3ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms
 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 9ms
 ✓ |app| test/helpers/game.test.ts (5 tests) 4ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 4ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests) 7ms

 Test Files  10 passed (10)
      Tests  116 passed (116)
   Start at  18:37:44
   Duration  394ms
```

### `npm run typecheck`

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```
(no output — clean)

### `npm run lint`

```
> botc-grimoire@0.1.0 lint
> eslint .
```
(no output — clean)

## TDD Evidence

### RED

Command: `npx vitest run src/engine/setup`

```
 FAIL  |app| src/engine/setup/deal.test.ts [ src/engine/setup/deal.test.ts ]
Error: Cannot find module './deal' imported from '/Users/rithwik/stuff/botc/src/engine/setup/deal.test.ts'
 ❯ src/engine/setup/deal.test.ts:4:1
Caused by: Error: Failed to load url ./deal (resolved id: ./deal) in
/Users/rithwik/stuff/botc/src/engine/setup/deal.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

Expected and matched the brief's Step 2 exactly ("Cannot find module './deal'").

### GREEN (after first-pass implementation, before the two fixes)

Command: `npx vitest run src/engine/setup`

```
 Test Files  1 failed (1)
      Tests  2 failed | 32 passed (34)
```
Failures:
- `validateDeal > rejects a hand-edited set with two Demons` — `expected '' to match /demon/i`
- `validateDeal > rejects a swap that changes the team counts with no Baron in play` — message
  text didn't contain "the chart for 9 players"

Also `npm run typecheck` failed first with 12 `TS2540` errors ("Cannot assign to '...' because
it is a read-only property") at the three `TeamCounts` mutation sites.

### GREEN (final, after fixes)

Command: `npx vitest run src/engine/setup`

```
 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 8ms

 Test Files  1 passed (1)
      Tests  34 passed (34)
```

`npm run typecheck` and `npm run lint` both clean (shown above). Full suite (`npm test`)
green at 116/116.

## Hand-check of the five rules

**1. Baron draw order — 9-player trace.**
`deal()` draws Demon (`base.demon = 1` → `imp`), then Minions (`base.minion = 1`, and with
the `preferring('baron')` test picker, `baron`), **then** calls `applyModifiers(base, [...demons,
...minions])` — this runs strictly after the Minion draw and before the Outsider/Townsfolk
draws, per the code's own structure (`deal()` lines: demons → minions →
`applyModifiers` → outsiders → townsfolk). For 9 players, the chart (`DISTRIBUTION[9]`) is
`{ townsfolk: 5, outsider: 2, minion: 1, demon: 1 }`. Baron's `setupModifiers` is
`{ townsfolk: -2, outsider: 2 }`, giving `distribution = { townsfolk: 3, outsider: 4,
minion: 1, demon: 1 }`. The Outsider draw then pulls `distribution.outsider = 4` (not the
chart's 2), and Townsfolk pulls `distribution.townsfolk = 3` (not the chart's 5) — so the
Baron's modifier is live before those draws happen, exactly as required. This matches the
test `records the post-modifier distribution when the Baron is drawn`, which asserts this
precise 3/4/1/1 result, and it passes.

**2. Bluffs null at 5/6, exactly 3 at 7+, good and not in play.**
`demonBluffs = playerIds.length >= INFO_THRESHOLD_PLAYERS ? pick([...townsfolk, ...outsider]
.filter(not in play), 3).map(id) : null`. `INFO_THRESHOLD_PLAYERS = 7` (Task 2). Confirmed by
tests: `withholds bluffs below 7 players` (5 and 6 both null), `gives exactly 3 bluffs at 7
players and above` (7, 10, 15 all length 3), `draws bluffs only from good characters not in
play` (asserts `!inPlay.has(bluff)` and team is townsfolk/outsider for all 3, at 10 players).
All pass.

**3. Drunk's believed character — Townsfolk not in play, excluded from Washerwoman/
Investigator's in-play set.**
`drunkBelief.believesCharacterId` is drawn via `pick(charactersByTeam('townsfolk').filter(c
=> !inPlay.has(c.id)), 1)`, where `inPlay` is the set of **actually dealt** character ids
(the Drunk's own believed character is never added to `inPlay` — it's a separate draw after
`inPlay` is computed). This task's job is only to *produce* `drunkBelief` as event data; the
in-play set that Washerwoman/Investigator selectors later consume is `RulesView.players`
filtered to seated characters, which will not include the Drunk's *believed* character since
that's stored separately in `RulesView.drunkBelief`, not folded into any player's
`characterId`. Selector/rule wiring is a later task's job (§6.4's asymmetry is a rule-layer
concern), but the raw data invariant this task owns — believed character is Townsfolk and not
in the actual dealt set — is enforced and tested (`assigns a believed Townsfolk not otherwise
in play`, `leaves drunkBelief null when the Drunk is not in play`).

**4. Red herring — any good player, Fortune Teller allowed.**
`redHerring` is drawn from `goodPlayerIds` (players whose dealt character's team is
`townsfolk` or `outsider`), with no exclusion for Fortune Teller specifically. The test
`accepts the Fortune Teller as the red herring` directly re-runs `validateDeal` with
`redHerring` forced to the Fortune Teller's player id and asserts `[]` (legal) — passes,
confirming `validateDeal`'s red-herring check (`['minion','demon'].includes(team)` → reject)
does not special-case the Fortune Teller out.

**5. `validateDeal` checks the chart plus setup modifiers, not just self-consistency.**
Two independent checks exist: (a) actual assigned team counts vs. the **recorded**
`distribution` field (catches assignments edited without updating `distribution`), and (b,
after my fix) actual assigned counts vs. an **independently re-derived** `expected` (the
chart for this player count plus the setup modifiers of the characters actually assigned) —
this is what catches a distribution/setupModifiers field that's internally self-consistent
but doesn't match what a legal deal could ever produce. Confirmed by
`rejects a swap that changes the team counts with no Baron in play` (post-fix, now passes)
and `rejects setupModifiers that name a character not in the set` (passes, unaffected by the
fix).

## Purity boundary

Grepped `deal.ts` for `Math.random` — the only occurrence is inside `randomPicker()`. `deal`
and `rerollOne` draw exclusively through the injected `pick` parameter; no other randomness
source is reachable from them. The test file imports nothing from `Math.random` and both
`front` and `preferring(...)` are pure, deterministic functions.

## Files changed

- `src/engine/setup/deal.ts` (new)
- `src/engine/setup/deal.test.ts` (new)

No files outside `src/engine/setup/` were touched. `applyEvent.ts`, `events.ts`, `types.ts`
and the edition data are unmodified.

## Self-review findings

- Completeness: all of `Picker`, `randomPicker`, `DealResult`, `deal`, `rerollOne`,
  `validateDeal` implemented; `distributionDerivation` (also specified in the brief's code
  block) implemented too, as transcribed.
- Discipline: no seeded PRNG introduced. No files created under `selectors/`, `rules/`,
  `commands/`, `index.ts`, or edition data. No YAGNI additions beyond what the brief
  specified — the three fixes above are corrections to bugs the brief's own tests exposed,
  not scope additions.
- The three deviations from literal transcription are documented above in detail, each with
  the failing test it fixes and why the fix doesn't regress any other test (verified by full
  suite run, 116/116 green).
- Test output is pristine — no warnings, no console noise, in either the focused or full run.

## Issues or concerns

None outstanding. The three fixes were all confined to `src/engine/setup/deal.ts`, are
narrowly scoped to the specific defects the tests exposed, and are described in detail above
so the reviewer can independently judge them. Flagging as a concern for reviewer attention
(not asking for a ruling, since the fixes are within my own file and the task said to reach
GREEN) — worth a second look given how easy it would be for a "transcribe exactly" task to
paper over a real bug by weakening a test instead. I did not touch the test file at all; only
`deal.ts` changed.

---

## Fix round — coordinator review of the three reported defects

The coordinator reviewed all three defects reported above. Defects 1 and 3 were accepted as
correct fixes (defect 3 was noted as more load-bearing than I had flagged: it's what makes a
Task 4 ruling — that a hand-edited two-Demon state is unreachable because `assignRoles` calls
`validateDeal` and throws — actually true). Defect 2 (the reversed seat deck) was **rejected**:
the diagnosis was wrong. `pick(playerIds, playerIds.length)` is itself the entropy source for
*which player* gets which role; under `randomPicker()` the Demon's seat really is uniformly
random, so "the ordering of the draw does not leak into the seating" was true in production —
there was no production bug. The reversal also didn't do what its added comment claimed: it
inverted the correlation (seat 0 now deterministically gets the *last*-drawn character instead
of the first) rather than breaking it, so under a picker that preserves order it's still fully
deterministic, just differently — meaning the comment was false on its own terms. The real
defect was in the test, which assumed `Object.keys(result.assignments)[0]` was safe to
overwrite without checking what it actually held.

### What I reverted in `deal.ts`

Dropped the `seatDeck` reversal entirely. Restored the original direct zip and the original
comment:

```ts
// Characters are placed onto seats by the picker's own order over the seats, so
// the ordering of the draw does not leak into the seating.
const seatOrder = pick(playerIds, playerIds.length);
const assignments: Record<PlayerId, CharacterId> = {};
seatOrder.forEach((playerId, index) => {
  assignments[playerId] = drawn[index]!.id;
});
```

This is now byte-for-byte what the brief specified for this block. Defects 1 and 3's fixes
(the mutable-mapped-type declarations and the `counts`-vs-`expected` comparison in
`validateDeal`) are untouched.

### What I changed in `deal.test.ts`

**`rejects a hand-edited set with two Demons`** — instead of assuming
`Object.keys(result.assignments)[0]` is not the Demon's seat, it now locates a seat that is
*demonstrably* not the Demon's (`Object.entries(...).find(([, c]) => characterById(c).team
!== 'demon')`), asserts one was actually found, and only then overwrites it with `'imp'`. This
states its own intent (take a non-Demon seat and make it a second Demon), is robust under any
picker including `randomPicker()`, and would also have passed against the brief's original
(unreversed) `deal.ts`.

**`keeps a one-player reroll legal`** — see "other key-order dependencies" below; this test
had the identical assumption and needed the identical fix.

### Other key-order dependencies found

I grepped the test file for every `Object.keys(...)` and array-destructure off it
(`grep -n "Object.keys\|const \["`). Three hits besides the one already fixed:

- `expect(Object.keys(result.assignments)).toHaveLength(count)` — a length check only, no
  order dependency.
- `const [a, b] = Object.keys(result.assignments);` in `rejects a duplicate character` — sets
  `b`'s character to `a`'s character. This does not depend on which seats `a` and `b` are:
  forcing any two distinct seats to hold the same character is a duplicate regardless of team,
  so no fix was needed here.
- `const [firstId] = Object.keys(result.assignments);` in **`keeps a one-player reroll
  legal`** — this had the same latent assumption as the two-Demons test, just with a subtler
  failure mode: under the (correctly restored, non-reversed) `deal.ts`, `firstId` for a
  `front`-picker deal is always the Demon's seat. Rerolling the Demon is a legal no-op (the
  edition has exactly one Demon character, so there is never a same-team replacement
  available), so the test would still have gone green — but only by exercising the no-op
  branch of `rerollOne`, never the actual swap-and-recompute logic the test's name promises to
  check. Fixed the same way: find a seat whose character's team is not `demon`, assert one
  exists, and reroll that one instead.

So: two tests total shared this assumption (both fixed above), and no others were found.

### Covering tests run

**`npx vitest run src/engine/setup`**

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 8ms

 Test Files  1 passed (1)
      Tests  34 passed (34)
   Start at  18:42:16
   Duration  334ms
```

**`npm run typecheck`**

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```
(no output — clean)

**`npm run lint`**

```
> botc-grimoire@0.1.0 lint
> eslint .
```
(no output — clean)

**`npm test`** (full suite)

```
> botc-grimoire@0.1.0 test
> vitest run

 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 5ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms
 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 7ms
 ✓ |app| test/helpers/game.test.ts (5 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 4ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests) 6ms

 Test Files  10 passed (10)
      Tests  116 passed (116)
   Start at  18:42:26
   Duration  399ms
```

### Status after this fix round

`deal.ts` now matches the brief exactly for the seat-assignment block (defect 2 fully
reverted), while keeping the accepted defect-1 (mutable mapped types for the readonly
`TeamCounts` fields) and defect-3 (`counts`-vs-`expected` comparison in `validateDeal`) fixes.
`deal.test.ts` has two tests rewritten to assert on the property they actually mean to check
(a non-Demon seat becoming a duplicate Demon; a non-Demon seat's reroll actually swapping)
rather than on key insertion order. No other files touched.

---

## Fix round 2 — code review findings (spec ✅, quality Approved, 1 Important + 3 Minor)

The reviewer verified rather than trusted: traced the 9-player Baron distribution, confirmed
the 15-player Outsider-exhaustion boundary, confirmed the 7-player bluff gate has no
off-by-one, hand-traced the corrected `keeps a one-player reroll legal` test end to end
(confirmed it now performs a genuine same-team swap), and probed `validateDeal`'s fix from
the opposite direction for false positives across 7/9/15 players with and without the Baron.
All four findings below were fixed; nothing else was changed.

### FIX 1 (Important) — deleted the vacuous test

Deleted `accepts every character in the edition as a legal member of its own team` from
`deal.test.ts`. It asserted `character.team` is one of the four `Team` literals, but `team`
is typed `Team` and every entry is built through Task 2's `character()` factory under that
same constraint — the assertion cannot fail without a prior compile error, so it inflated the
test count without adding real coverage, and it tested edition data (already owned by Task
2's `characters.test.ts`) rather than the deal. Removed the now-unused `CHARACTERS` import
from `deal.test.ts` along with it (only `characterById` remains, still used throughout).

I did not find any edition-data invariant left genuinely unguarded by this deletion —
Task 2's `characters.test.ts` already covers keys-matching-ids, the 13/4/4/1 roster counts,
and exhaustive `requiresAlive`/`falseSelfBelief`/`setupModifiers` checks, per the reviewer's
note. Nothing to route.

### FIX 2 (Minor) — extracted the mutable mapped type

Added one local type alias near the top of `deal.ts`, right after the `Picker` export:

```ts
/**
 * `TeamCounts`' fields are readonly and its objects are deep-frozen (Task 2), so
 * every running total in this file is built up in one of these before being
 * handed back as a plain `TeamCounts` once construction is done.
 */
type MutableTeamCounts = { -readonly [K in keyof TeamCounts]: TeamCounts[K] };
```

and replaced all three inline occurrences of the mapped type (`applyModifiers`'s
`distribution`, `validateDeal`'s `counts`, `validateDeal`'s `expected`) with
`MutableTeamCounts`.

### FIX 3 (Minor) — dropped the dead ternary

In `rerollOne`, changed:
```ts
const nextInPlay = new Set(assignments ? Object.values(assignments) : []);
```
to:
```ts
const nextInPlay = new Set(Object.values(assignments));
```
`assignments` is built by object spread a few lines above and is always truthy there, so the
`: []` branch was unreachable dead weight.

### FIX 4 (Minor, genuine coverage gap) — added a player-count bounds test

Added a new `describe('deal — player-count bounds', ...)` block with one test:

```ts
it('throws outside 5-15 players', () => {
  expect(() => deal(ids(4), front)).toThrow();
  expect(() => deal(ids(3), front)).toThrow();
  expect(() => deal(ids(16), front)).toThrow();
  expect(() => deal(ids(20), front)).toThrow();
});
```

Asserts on the thrown behavior only (no message-string matching), covering both sides of the
5-15 boundary with a comfortable margin either side, per the reviewer's ask to keep it small.

### Test count

The focused file went from 34 tests to 33 (FIX 1's deletion) back to 34 (FIX 4's addition) —
net unchanged at 34, not a regression, per the coordinator's note to call this out explicitly.

### Covering tests run

**`npx vitest run src/engine/setup`**

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 7ms

 Test Files  1 passed (1)
      Tests  34 passed (34)
   Start at  19:46:21
   Duration  359ms
```

**`npm run typecheck`**

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```
(no output — clean)

**`npm run lint`**

```
> botc-grimoire@0.1.0 lint
> eslint .
```
(no output — clean)

**`npm test`** (full suite)

```
> botc-grimoire@0.1.0 test
> vitest run

 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 4ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms
 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 8ms
 ✓ |app| test/helpers/game.test.ts (5 tests) 4ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests) 7ms

 Test Files  10 passed (10)
      Tests  116 passed (116)
   Start at  19:46:40
   Duration  337ms
```

Full suite unchanged at 116/116 (the setup file's internal count is unchanged net, so the
project total is unaffected).

Nothing else was changed: the Baron draw-order placement, the 7+ bluff gate, the Drunk and
red-herring semantics, the forward (non-reversed) seat zip, the `Picker` injection design, the
two accepted defect fixes from the prior round, and `rerollOne`'s full recomputation of
derived fields are all untouched.
