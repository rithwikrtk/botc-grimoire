# Task 12 report — demon death and win conditions

## What was implemented

Five files, exactly as scoped:

- `src/engine/rules/demonDeath.ts` — `onDemonDeath`, `SCARLET_WOMAN_THRESHOLD`,
  `SCARLET_WOMAN_BEATS_STARPASS`, `demonDeathDerivation`.
- `src/engine/rules/demonDeath.test.ts` — 13 tests.
- `src/editions/troubleBrewing/victory.ts` — `VictoryContext`, `VictoryPredicate`,
  `VICTORY_PREDICATES` (§4.7's four rows, in precedence order), `ONGOING`.
- `src/engine/selectors/victory.ts` — `checkVictory`, `victoryDerivation`,
  re-exports `VictoryContext`.
- `src/engine/selectors/victory.test.ts` — 16 tests.

Transcribed from the brief essentially verbatim, with one correction (see
"Defect found" below) and one harmless reordering (moved `demonDeathDerivation`
below `onDemonDeath` and collapsed a duplicated doc-comment above it — no logic
change).

## Test evidence

`npm test`:

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/setup/deal.test.ts (34 tests)
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests)
 ✓ |app| src/engine/selectors/seating.test.ts (21 tests)
 ✓ |app| src/engine/rules/demonKill.test.ts (35 tests)
 ✓ |app| src/engine/selectors/nightCursor.test.ts (14 tests)
 ✓ |app| src/engine/selectors/victory.test.ts (16 tests)
 ✓ |app| src/editions/troubleBrewing/nightOrder.test.ts (22 tests)
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (36 tests)
 ✓ |app| test/property/statusTimeline.property.test.ts (5 tests)
 ✓ |app| test/property/positional.property.test.ts (4 tests)
 ✓ |app| src/engine/phase.test.ts (11 tests)
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests)
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests)
 ✓ |app| src/engine/selectors/predicates.test.ts (13 tests)
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests)
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests)
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests)
 ✓ |app| test/helpers/game.test.ts (5 tests)
 ✓ |app| src/engine/rules/demonDeath.test.ts (13 tests)
 ✓ |app| src/engine/selectors/players.test.ts (7 tests)
 ✓ |app| src/engine/purity-scope.test.ts (1 test)
 ✓ |app| test/eslint-perceived-character.test.ts (5 tests)
   ✓ §4.1 enforcement — where perceivedCharacterId may be imported > rejects the import from a rules module

 Test Files  22 passed (22)
      Tests  307 passed (307)
```

307 passing across 22 files (was 278 across 20 before this task: +29 new tests,
+2 new files). Pristine — no warnings.

`npm run typecheck`:

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```

Clean, no output.

`npm run lint`:

```
> botc-grimoire@0.1.0 lint
> eslint .
```

Clean, no output.

## Row precedence — which test pins it

**`src/engine/selectors/victory.test.ts`, `"row 1 beats row 3 when the Demon's
death brings the count to two"`.**

Fixture: kills p3, p4, p5, p6, leaving p1 (Imp), p2, p7 alive (3), then kills p1.
Two alive, and nobody holds the Demon (no Scarlet Woman in this ROLES set, so no
successor). Expects `{ status: 'good', reason: 'demon_dead' }`.

If `VICTORY_PREDICATES` were reordered so row 3 (`two_alive`) is checked before
row 1 (`demon_dead`), this exact state — 2 alive, no living Demon — would instead
match row 3 first and return `{ status: 'evil', reason: 'two_alive' }`. The test
would go red immediately; it cannot pass under both orderings. That is the
"single-line production change" this test is built to catch (swap the first two
entries of the `VICTORY_PREDICATES` array).

## Scarlet-Woman-vs-starpass constant — both branches

`SCARLET_WOMAN_BEATS_STARPASS = true` (§16.9's recorded default), tested in
`demonDeath.test.ts`:

- **Branch `true` (the default, exercised with no override):**
  - `"gives the Scarlet Woman precedence over the starpass"` — starpass `true`,
    a living functional Scarlet Woman at 7 alive → she is promoted, not a
    Storyteller-chosen successor.
- **Branch `false` (passed explicitly via `opts.scarletWomanBeatsStarpass`):**
  - `"defers to the starpass when SCARLET_WOMAN_BEATS_STARPASS is false"` —
    same fixture, starpass `true`, constant `false` → returns
    `needs_successor_choice`, and the Scarlet Woman is still in `candidates`
    (she remains a legal choice, just not automatic).
  - `"still promotes her on a NON-starpass death when the constant is false"` —
    confirms flipping the constant does not touch the *non*-starpass path: she
    is still promoted on an ordinary death regardless of the flag, because the
    flag only governs the starpass tie-break.

Together these three tests mean the constant is a genuine one-line flip: the
`false` branch's own test would fail if the flip broke the non-starpass case,
and the `true` branch's test would fail if the flip broke the default.

## Defect found (and fixed, not forced)

**`src/editions/troubleBrewing/victory.ts` as given in the brief imports
`characterById` from `./characters` and never uses it.** Every predicate in
`VICTORY_PREDICATES` reads either the already-derived `RulesViewPlayer.team`
(row 1's `livingDemon`) or a literal `characterId` string comparison (rows 2 and
4) — never `characterById`. With `noUnusedLocals: true` in `tsconfig.json`, the
unused import fails `npm run typecheck` (`TS6133`).

This isn't a logic bug — no test's pass/fail changes with or without the
import — so it wasn't "forcing a test to pass for the wrong reason." I removed
the dead import rather than working around it, and did not touch any predicate
logic. Flagging it here per the task's instruction to report rather than
silently patch.

## Judgment calls (not transcribed verbatim)

1. **Removed the unused `characterById` import** from
   `src/editions/troubleBrewing/victory.ts` (see Defect above) — a compile-blocking
   dead import, not a design decision.
2. **Reordered `demonDeathDerivation` to follow `onDemonDeath`** in
   `demonDeath.ts` and collapsed two back-to-back doc-comments above it into one.
   Purely cosmetic — the brief's code block had the derivation function's doc
   comment duplicated (once generic, once specific) immediately above the
   function; I kept the more specific one. No behavioural change, no test
   depends on file layout.

Everything else — the Scarlet-Woman-first ordering (§16.9), the
`aliveCountAtDeath` "before the DEATH event" contract (§16.1), the true-character
guard on the Demon (§16.12), the four `VICTORY_PREDICATES` rows and their
precedence, and row 2's current-phase scoping (the gap the brief itself
flags) — is transcribed as specified and verified against §4.6/§4.7/§16 and the
guide.

## A gap noticed, not in my five files, not fixed

While probing whether the ESLint §4.1 guard would actually fire on my new
`src/engine/selectors/victory.ts` if it imported `perceivedCharacterId`, I found
it does **not** fire for a same-directory relative import. The
`no-restricted-imports` pattern list is `['**/selectors/players',
'@/engine/selectors/players']` — both require the literal string `selectors` to
appear in the import specifier. A file that already lives inside
`src/engine/selectors/` (my `victory.ts` among them) can write
`import { perceivedCharacterId } from './players'` and the glob simply doesn't
match that specifier text, so the rule is silent. Confirmed by hand: I
temporarily added that exact import + a call site to `victory.ts`, ran
`npx eslint src/engine/selectors/victory.ts`, got exit 0 with no error, then
reverted it (the file now on disk matches what's described in this report — no
trace of the experiment remains). `test/eslint-perceived-character.test.ts` only
exercises `src/engine/rules/demonKill.ts` and `src/editions/troubleBrewing/nightOrder.ts`
as fixture paths, so this gap has no covering test either.

My own `victory.ts` doesn't import it, so this doesn't block Task 12. But it's a
live hole in the §4.1 enforcement for any future file placed directly in
`src/engine/selectors/` (outside `nightCursor.ts` and `players.ts`, which are
already on the sanctioned list). `eslint.config.js` isn't one of my five files,
so I didn't touch it — reporting instead, per the "don't edit a file another
task owns" constraint.

## Fix round 1

Reviewer found four Important findings (all "load-bearing guard, no witness"),
authorised the ESLint fix I'd reported, and folded in five cheap minors.
Addressed all of them.

### FIX 1 — row 4's `aliveCount === 3` was unpinned

No production change (the clause was already correct in
`src/editions/troubleBrewing/victory.ts` — it was simply untested in isolation).
Added `"row 4 does not fire at four alive, even with a functional Mayor and no
execution"` to `src/engine/selectors/victory.test.ts`: `dayClosed: true`, a
living functional Mayor, zero executions, four alive.

**Mutation evidence.** Deleted `if (aliveCount(view) !== 3) return false;` from
row 4's test function, backed up via `cp` first. Ran just the new test:

```
FAIL  |app| src/engine/selectors/victory.test.ts > checkVictory (§4.7) > row 4 does not fire at four alive, even with a functional Mayor and no execution
AssertionError: expected { status: 'good', …(1) } to deeply equal { status: 'ongoing', reason: null }
- Expected
+ Received
  {
-   "reason": null,
-   "status": "ongoing",
+   "reason": "mayor_no_execution",
+   "status": "good",
  }
```

Restored from the `cp` backup; reran — 1 passed, 23 skipped (targeted run).

### FIX 2 — consolidated the pre-deal guard

Removed the two dead `view.players.length > 0 &&` clauses from rows 1 and 3 in
`src/editions/troubleBrewing/victory.ts` (they could never fire: seats exist
from `GAME_CREATED`, before `ROLES_ASSIGNED`, so by the time either predicate is
reachable the clause is always true). Added a block comment on
`VICTORY_PREDICATES` stating the predicates assume a dealt game and that
`checkVictory`'s own `characterId === ''` check is the actual gate — the single
place that assumption is made safe. Did **not** make the predicates
`characterId`-aware individually, per the ruling.

Added `"reports ongoing for seats that exist but have not been dealt characters
yet"` to `victory.test.ts` — `GAME_CREATED` only, no `ROLES_ASSIGNED`, built with
`new LogBuilder()` directly (switched the `victory.test.ts` import of
`LogBuilder` from type-only to a value import, since it's now constructed, not
just used as an annotation).

**Mutation evidence.** Weakened `checkVictory`'s guard from
`view.players.length === 0 || view.players.some((p) => p.characterId === '')`
to just `view.players.length === 0`, backed up via `cp` first. Ran the new test:

```
FAIL  |app| src/engine/selectors/victory.test.ts > checkVictory (§4.7) > reports ongoing for seats that exist but have not been dealt characters yet
AssertionError: expected { Object (status, reason) } to deeply equal { status: 'ongoing', reason: null }
- Expected
+ Received
  {
-   "reason": null,
-   "status": "ongoing",
+   "reason": "demon_dead",
+   "status": "good",
  }
```

(Reason is `demon_dead`, not e.g. a crash, because every undealt seat defaults to
`team: 'townsfolk'` — row 1's `livingDemon` finds none, and row 1 is checked
before anything reads a character string.) Restored from the `cp` backup;
reran — 1 passed, 23 skipped.

### FIX 3 — §16.12's true-character guard had no witness

Added a `describe('onDemonDeath — the true-character guard (§4.6, §16.12)')`
block to `demonDeath.test.ts` with a small `RECLUSE_ROLES` fixture and one test:
calling `onDemonDeath` on a living Recluse (`p2`) throws, matching
`/whose true character is not the Demon/`-shaped text exactly (`/whose true
character is recluse, not the Demon/`). No production change — the guard was
already correct, only untested.

**Mutation evidence.** Deleted the `characterById(dead.characterId).team !==
'demon'` throw block from `onDemonDeath`, backed up via `cp` first:

```
FAIL  |app| src/engine/rules/demonDeath.test.ts > onDemonDeath — the true-character guard (§4.6, §16.12) > throws when the dead player's true character is not the Demon — a Recluse dying to the Slayer promotes nobody
AssertionError: expected [Function] to throw an error
- Expected:
null
+ Received:
undefined
```

Restored from the `cp` backup; full `demonDeath.test.ts` reran green (20/20).

### FIX 4 — §4.1 held only by absence; added the Drunk explicitly

Added two tests to `victory.test.ts`, both via `buildGame`'s `drunkBelief`:

- A Drunk (true `characterId: 'drunk'`) believing they are the Saint, executed
  by vote (`characterIdAtDeath: 'drunk'` recorded, as any real caller must) →
  `ongoing`. Proves row 2 cannot be fooled by a believed Saint.
- A Drunk believing they are the Mayor, alive with two others (no real Mayor in
  the roles list) on a closed day with zero executions → `ongoing`. Proves
  row 4 cannot be fooled by a believed Mayor.

No production change — `abilityFunctional` and both predicates already read the
true `characterId` exclusively (never `perceivedCharacterId`, confirmed absent
from all five task files). These are regression tests against a future switch
to a perceived read, not fixes to an existing bug.

### FIX 5 — enforced §16.1's pre-DEATH-view precondition

Added a guard to `onDemonDeath` in `demonDeath.ts`: throws if `deadDemonId` is
already dead (`!dead.alive`) in the given view, citing §16.1. Placed after the
true-character check (order doesn't matter for correctness here, but the
true-character check is the more informative failure when both would fire —
they can't both fire for the same call in practice, since a dead demon's
character doesn't change).

Added `"throws if handed a view where the named Demon is already dead"` to
`demonDeath.test.ts`, reusing the existing `game()` helper to kill `p1` first,
then calling `onDemonDeath` on the same id.

**Mutation evidence.** Deleted the new guard block, backed up via `cp` first:

```
FAIL  |app| src/engine/rules/demonDeath.test.ts > onDemonDeath — the pre-death view contract (§16.1) > throws if handed a view where the named Demon is already dead
AssertionError: expected [Function] to throw an error
- Expected:
null
+ Received:
undefined
```

Restored from the `cp` backup; `diff` against the backup afterward confirmed
byte-identical restoration. Full `demonDeath.test.ts` reran green (20/20).

### FIX 6 — the ESLint hole (authorised)

Added `'./players'` and `'../players'` to the `no-restricted-imports` pattern
group in `eslint.config.js`, with a comment explaining why the two existing glob
patterns (`'**/selectors/players'`, `'@/engine/selectors/players'`) can never
match a same-directory-or-one-up relative specifier — the literal text
`selectors` never appears in `'./players'`.

**Before the fix**, verified empirically:

```
$ npx eslint --stdin --stdin-filename src/engine/selectors/probe.ts <<< "import { perceivedCharacterId } from './players'; export const x = perceivedCharacterId;"
(no output, exit 0)
```

**After the fix**, same input:

```
/Users/rithwik/stuff/botc/src/engine/selectors/probe.ts
  1:10  error  'perceivedCharacterId' import from './players' is restricted from being used by a pattern. §4.1: perceivedCharacterId may be consulted only by a step's wakes() in nightOrder.ts and by step/UI rendering. Rules predicates must read the true characterId — otherwise a Drunk-believing-Soldier survives the Demon  no-restricted-imports

✖ 1 problem (1 error, 0 warnings)
```

Added `"rejects the same-directory relative form (a file inside selectors/
itself)"` to `test/eslint-perceived-character.test.ts`, using
`'src/engine/selectors/victory.ts'` as the fixture path (a real, non-ignored
file in that directory) and asserting both `no-restricted-imports` and the
`§4.1` message text match, matching the existing cases' rigor.

### Cheap minors

- **`ONGOING` frozen.** `export const ONGOING: Victory =
  Object.freeze({ status: 'ongoing', reason: null });` — same hazard class as
  `VICTORY_PREDICATES`'s freeze.
- **`chosenSuccessorId: null` documented and tested.** Expanded the doc comment
  on `onDemonDeath` to state the three-way contract (`undefined` / `null` /
  `PlayerId`) explicitly, and added
  `"accepts a declined starpass (chosenSuccessorId: null) as no successor"` to
  `demonDeath.test.ts`.
- **Non-null assertion removed.** `scarletWoman!.id` replaced with narrowing via
  `if (scarletWoman && ...)`, which TypeScript narrows correctly inside the
  block — no assertion needed.
- **Stray triple space fixed** in the "alive at death" derivation string
  (`  (the dying Demon counts...` → ` (the dying Demon counts...`).
- **`needs_successor_choice` derivation text fixed.** `demonDeathDerivation` now
  takes the same `opts` used to produce the outcome, and computes *why* the
  Scarlet Woman didn't take precedence (no living/functional Scarlet Woman;
  present but below the alive-count threshold; or present and qualifying but
  `SCARLET_WOMAN_BEATS_STARPASS` is `false`) instead of always claiming "no
  Scarlet Woman" — which was wrong in the latter two, reachable cases. This is a
  **signature change** from the brief (`demonDeathDerivation(view, deadDemonId,
  outcome)` → `demonDeathDerivation(view, deadDemonId, opts, outcome)`), a
  judgment call: the brief's version had no coverage at all, so there was no
  existing caller or test to break, and every caller of `onDemonDeath` already
  has `opts` in hand to pass through.
- **Derivation coverage added**, per "same treatment as `killDerivation`" — one
  `it` per distinguishable branch, asserting the full rendered array:
  - `demonDeathDerivation`: Scarlet Woman promoted, starpass successor, no
    successor, and — the specific case the wrong-prose defect lived in —
    `needs_successor_choice` with a Scarlet Woman present but below threshold
    (proves the fixed text, not just that some text renders).
  - `victoryDerivation`: an ongoing game, a good win with nobody holding the
    Demon, an evil win with a populated "executed today" line, and a closed-day
    Mayor win. Not exhaustive (e.g. Mayor "not in play" and a `st_override`-style
    branch aren't separately covered) — flagging rather than claiming full
    coverage.

### Verification

`npm test`:

```
 Test Files  22 passed (22)
      Tests  323 passed (323)
```

(was 307 before this round: +7 in `demonDeath.test.ts`, +8 in `victory.test.ts`,
+1 in `test/eslint-perceived-character.test.ts` = +16.)

`npm run typecheck`: clean, no output.
`npm run lint`: clean, no output.

Grep-verified afterward that every fix's marker text is present in the final
files (guard messages, test names, the eslint pattern additions) — see the
commands run during this session; all matched.

### Files touched this round (beyond the original five)

- `eslint.config.js` — authorised by the coordinator for FIX 6.
- `test/eslint-perceived-character.test.ts` — the boundary test for FIX 6.

Both are outside my original five-file scope but explicitly authorised in the
coordinator's message for this round.
