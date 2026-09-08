# Task 6 Report — Perceived character, ability functionality, and the ESLint boundary

## What I implemented

Transcribed the brief verbatim:

- `src/engine/selectors/statuses.ts` — `activeStatuses`, `isPoisoned`, `isProtected`
  (both via a shared `hasEffectiveStatus` that requires `effective === true`),
  `isRedHerring`, `masterOf`, `grimoireTokens` + `GrimoireToken` (projection without
  `effective`).
- `src/engine/selectors/players.ts` — `alive`, `livingPlayers`, `aliveCount`,
  `playerById`, `bySeat`, and the two restricted selectors
  `perceivedCharacterId` / `playersWithPerceivedCharacter`.
- `src/engine/selectors/predicates.ts` — `isDrunk`, `abilityFunctional` (reads
  `character.requiresAlive`, never hardcodes `alive`; does not gate registration).
- `src/engine/selectors/rulesView.ts` — `toRulesView` and `toRulesViewPlayer`,
  built field by field, no spreads.
- `eslint.config.js` — added the `no-restricted-imports` block confining
  `perceivedCharacterId` / `playersWithPerceivedCharacter` to
  `nightOrder.ts`, `nightCursor.ts` (not yet created — future task's sanctioned
  reader), `players.ts` itself, `src/ui/**`, and test files.
- `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` — added the `@test/*` →
  `test/*` alias in all three resolvers (ruling R4).
- Test files: `src/engine/selectors/predicates.test.ts`,
  `src/engine/selectors/players.test.ts`, `test/eslint-perceived-character.test.ts`,
  transcribed verbatim. In `predicates.test.ts` I applied the brief's own
  documented fix: hoisted `registrationOptionsForCharacterId` to a top-level
  import instead of the `await import` inside a non-async test (which the brief
  itself says will not compile).

No other files were touched. `applyEvent.ts`, `events.ts`, `types.ts`, `phase.ts`,
`deal.ts`, and the edition data are untouched.

## TDD evidence

**RED** — before Step 6/7 (ESLint config + `@test` alias) were added:

```
$ npx vitest run src/engine/selectors test/eslint-perceived-character.test.ts
...
 FAIL  |app| src/engine/selectors/players.test.ts [ src/engine/selectors/players.test.ts ]
Error: Cannot find package '@test/helpers/game' imported from
  '/Users/rithwik/stuff/botc/src/engine/selectors/players.test.ts'
 FAIL  |app| src/engine/selectors/predicates.test.ts [ ... ]
Error: Cannot find package '@test/helpers/game' ...

 FAIL  |app| test/eslint-perceived-character.test.ts > ... > rejects the import from a rules module
AssertionError: expected '' to match /no-restricted-imports/
 FAIL  |app| test/eslint-perceived-character.test.ts > ... > rejects the aliased import from a rules module too
AssertionError: expected '' to match /no-restricted-imports/

 Test Files  3 failed (3)
      Tests  2 failed | 3 passed (5)
```

This matches the brief's Step 2 expectation exactly: modules not found (no
`@test` alias yet) and the ESLint boundary test reporting no
`no-restricted-imports` message (rule not yet added).

**GREEN** — after Steps 6/7:

```
$ npx vitest run
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests)
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests)
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests)
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests)
 ✓ |app| src/engine/setup/deal.test.ts (34 tests)
 ✓ |app| test/helpers/game.test.ts (5 tests)
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests)
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests)
 ✓ |app| src/engine/purity-scope.test.ts (1 test)
 ✓ |app| src/engine/phase.test.ts (11 tests)
 ✓ |app| src/engine/selectors/players.test.ts (7 tests)
 ✓ |app| src/engine/selectors/predicates.test.ts (12 tests)
 ✓ |app| test/eslint-perceived-character.test.ts (5 tests)
   ✓ ... > rejects the import from a rules module  470ms

 Test Files  13 passed (13)
      Tests  140 passed (140)
```

```
$ npm run typecheck
> tsc --noEmit
(clean, no output)

$ npm run lint
> eslint .
(clean, no output)
```

## Specific evidence the ESLint boundary rule fires

Beyond the vitest-driven `lintText` test above, I dropped an actual file on disk
containing the forbidden import and ran the real ESLint CLI against it (not
`lintText`, the on-disk binary):

```
$ cat src/engine/rules/demonKill.ts
import { perceivedCharacterId } from '../selectors/players';
export const x = perceivedCharacterId;

$ npx eslint src/engine/rules/demonKill.ts
/Users/rithwik/stuff/botc/src/engine/rules/demonKill.ts
  1:10  error  'perceivedCharacterId' import from '../selectors/players' is
  restricted from being used by a pattern. §4.1: perceivedCharacterId may be
  consulted only by a step's wakes() in nightOrder.ts and by step/UI rendering.
  Rules predicates must read the true characterId — otherwise a
  Drunk-believing-Soldier survives the Demon  no-restricted-imports

✖ 1 problem (1 error, 0 warnings)
exit code: 1
```

The scratch file was removed after the check (`rm -rf src/engine/rules`); it is
not part of the commit. All five boundary tests in
`test/eslint-perceived-character.test.ts` pass genuinely (2 reject cases fire the
rule with the §4.1 message, 3 allow cases correctly produce no
`no-restricted-imports` message).

## Findings on the five self-review checks

1. **Does the ESLint rule actually fire?** Yes — confirmed both via the vitest
   `lintText`-based test suite (all 5 pass) and independently via the real
   `eslint` CLI against a scratch file (above). `npm run lint` is clean on the
   real tree.
2. **Ravenkeeper / Saint correctness?** Both pass: "is true for a DEAD
   Ravenkeeper" and "is true for a DEAD executed Saint" both green, because
   `abilityFunctional` reads `character.requiresAlive` (false for both) rather
   than hardcoding `alive &&`.
3. **`isPoisoned`/`isProtected` require `effective === true`?** Yes —
   `hasEffectiveStatus` filters on `s.effective`. Tests "ignores a poison mark
   applied with effective: false" and "ignores a protection mark applied with
   effective: false" both pass, and the token is still present in
   `statusLedger` (length 1) while `isPoisoned` reads false.
4. **`grimoireTokens` projection free of `effective`?** Yes — `GrimoireToken`
   has only `status`, `sourcePlayerId`, `expiresAt`. The canary test asserts
   `Object.keys(tokens[0]).not.toContain('effective')` AND
   `JSON.stringify(tokens).not.toMatch(/effective/)` — both a shape check and a
   serialization check, so it isn't just asserting on a type that happens not
   to carry the field; it directly checks the runtime object.
5. **`toRulesView` field-by-field, no spreads, `stPrivate` absent?** Yes — both
   `toRulesView` and `toRulesViewPlayer` construct object literals field by
   field. The privacy test asserts `'stPrivate' in v === false` along with
   `notes`, `ruleFlags`, `nominations`, `settledStepIds`, and per-player
   `claims`, `infoHistory`, `deadVoteSpent` — all pass.

## Files changed

- Created: `src/engine/selectors/statuses.ts`, `src/engine/selectors/players.ts`,
  `src/engine/selectors/predicates.ts`, `src/engine/selectors/rulesView.ts`,
  `src/engine/selectors/predicates.test.ts`, `src/engine/selectors/players.test.ts`,
  `test/eslint-perceived-character.test.ts`.
- Modified: `eslint.config.js`, `tsconfig.json`, `vite.config.ts`,
  `vitest.config.ts`.

Commit: `77514a7` — "feat(engine): add perceived character, ability
functionality and the §4.1 boundary".

## Self-review findings

No deviations from the brief were needed. The one documented fix (hoisting the
`registrationOptionsForCharacterId` import out of the `await import` inside a
non-async test) was already called out by the brief itself as required for
compilation, and I applied it exactly as specified. Everything else transcribed
without modification. No other files were touched; `applyEvent.ts`, `events.ts`,
`types.ts`, `phase.ts`, and `deal.ts` are untouched, and no out-of-scope selector
files (`seating.ts`, `nightCursor.ts`, `nominations.ts`, etc.) were created.

## Issues or concerns

None. The task's known limitation (transitive re-export defeats
`no-restricted-imports`) is recorded in the code comment as instructed, not
"fixed" — there is currently no re-export of `perceivedCharacterId` anywhere in
the tree, so the mitigation holds today.

## Fix report (review round 1)

Reviewer verdict: spec ✅, quality Approved, one Important + one Minor finding.
Both addressed in commit `7d81a8b` on top of `77514a7`. No other files touched
— eslint.config.js and the three R4-authorised config files, the ESLint boundary
tests, `abilityFunctional`'s `requiresAlive` logic, `effective` gating, and
`grimoireTokens`/`toRulesView` were all left alone as instructed.

### FIX 1 (Important) — hollow registration assertion

`src/engine/selectors/predicates.test.ts`'s `registration is not an ability`
test poisoned the Recluse, correctly asserted `abilityFunctional(...)` is
false, then also asserted `registrationOptionsForCharacterId('recluse')` has
length 3 — an assertion that takes only a `characterId`, never sees player or
poison state, and so cannot detect a regression in `abilityFunctional` or in
registration gating. Came verbatim from the brief.

Change: removed the `registrationOptionsForCharacterId` assertion and its now-
unused import. Kept the real `abilityFunctional(...).toBe(false)` assertion.
Retitled the `describe` block from `'registration is not an ability (§4.2)'` to
`'registration is not gated by abilityFunctional (§4.2)'` and the `it` to `'a
poisoned Recluse still has a non-functional ability'`, since that is now
accurately what the test proves. Added a comment naming the two places the
not-gated invariant is actually enforced, per the reviewer's finding:
- `src/editions/troubleBrewing/registration.test.ts:53-58` (structural arity
  test — no state/phase/aliveness parameter exists to gate on)
- Task 8's `describe('a poisoned Recluse still registers ambiguously (§4.2, §14
  Tier 2)')` (behavioural test against a real `RulesView`)

Did not attempt to strengthen the assertion in place, per instruction — there is
nothing stronger available at this layer without duplicating one of the above.

### FIX 2 (Minor) — undealt-role guard uncovered

`abilityFunctional`'s `if (player.characterId === '') return false;` guard
(predicates.ts:15) stops `characterById('')` from throwing for a seated-but-
undealt player, but had no test pinning it.

Change: added `'is false for a seated player with no role assigned yet'` inside
the `abilityFunctional (§4.2)` describe block. Built the fixture with a raw
`LogBuilder` (imported alongside `buildGame` from `@test/helpers/game`) pushing
only `GAME_CREATED` with one player and no `ROLES_ASSIGNED`, so `characterId`
stays `''` as the reducer's `GAME_CREATED` case sets it. Asserts
`player(v, 'p1').characterId === ''` and `abilityFunctional(v, player(v, 'p1'))
=== false`.

### Net test-count change

`predicates.test.ts`: 12 → 13 tests (one assertion removed from an existing
test — the test itself still counts as one; one new test added). Full suite:
140 → 141 tests. This is a net +1, not a regression.

### Covering tests run and output

```
$ npx vitest run src/engine/selectors
 ✓ |app| src/engine/selectors/players.test.ts (7 tests) 2ms
 ✓ |app| src/engine/selectors/predicates.test.ts (13 tests) 4ms

 Test Files  2 passed (2)
      Tests  20 passed (20)
   Duration  305ms
```

```
$ npm run typecheck
> tsc --noEmit
(clean, no output)
```

```
$ npm run lint
> eslint .
(clean, no output)
```

```
$ npx vitest run   # full suite (npm test)
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests)
 ✓ |app| src/engine/phase.test.ts (11 tests)
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests)
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests)
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests)
 ✓ |app| src/engine/setup/deal.test.ts (34 tests)
 ✓ |app| test/helpers/game.test.ts (5 tests)
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests)
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests)
 ✓ |app| src/engine/selectors/predicates.test.ts (13 tests)
 ✓ |app| src/engine/purity-scope.test.ts (1 test)
 ✓ |app| src/engine/selectors/players.test.ts (7 tests)
 ✓ |app| test/eslint-perceived-character.test.ts (5 tests)
   ✓ ... > rejects the import from a rules module  385ms

 Test Files  13 passed (13)
      Tests  141 passed (141)
   Duration  926ms
```

Commit: `7d81a8b` — "fix(engine): drop hollow registration assertion, cover
undealt-role guard", on top of `77514a7`. Only
`src/engine/selectors/predicates.test.ts` changed (26 insertions, 7 deletions).
Not pushed.
