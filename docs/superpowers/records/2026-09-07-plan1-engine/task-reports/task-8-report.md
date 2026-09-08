# Task 8 Report: The remaining information resolvers

## What I implemented

Created `src/editions/troubleBrewing/resolvers.ts` transcribed exactly from the brief:
- `chefAnswers`, `empathAnswers` — the §4.3 alignment cross-product over ambiguous (Recluse/Spy) players, canonical (empty rulings) combination first.
- `washerwomanAnswers`, `librarianAnswers`, `investigatorAnswers` — built on a shared `oneOfTwo` helper; canonical answers sorted before registration ones.
- `fortuneTellerAnswers(view, actorId, targets)` — yes/no with red-herring and Recluse/Spy Demon-registration branches, and a soft off-constraint-target branch (§4.8).
- `undertakerAnswers` — one answer per entry in `view.todaysExecutions` (a Storyteller choice when there are two).
- `ravenkeeperAnswers(view, actorId, targets)` — true character first, then a registration alternative per ambiguous option.
- `RESOLVERS: Readonly<Record<string, Resolver>>` keyed by `chef, empath, washerwoman, librarian, investigator, fortune_teller, undertaker, ravenkeeper`.

Created `src/editions/troubleBrewing/resolvers.test.ts` transcribed exactly from the brief (30 tests).

## One defect found and fixed

The brief's `fortuneTellerAnswers: Resolver = (view, actorId, targets = []) => {...}` never reads `actorId` in the body. With `noUnusedParameters: true` this fails `tsc --noEmit`:

```
src/editions/troubleBrewing/resolvers.ts(267,54): error TS6133: 'actorId' is declared but its value is never read.
```

Fixed by renaming the parameter to `_actorId`, the same convention the brief itself uses for `ravenkeeperAnswers`'s unused actor parameter. No other change to behavior. Reporting rather than silently leaving it — this is a genuine plan-authored defect, not something I introduced.

## Tests run — results

### TDD Evidence

RED — before `resolvers.ts` existed:

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts
 FAIL  |app| src/editions/troubleBrewing/resolvers.test.ts [ src/editions/troubleBrewing/resolvers.test.ts ]
Error: Cannot find module './resolvers' imported from '.../resolvers.test.ts'
 Test Files  1 failed (1)
      Tests  no tests
```

GREEN — after writing `resolvers.ts` (before the `noUnusedParameters` fix, the file already type-erred at build but vitest's esbuild transform doesn't enforce `noUnusedParameters`, so tests ran and passed identically before and after the rename):

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (30 tests) 11ms
 Test Files  1 passed (1)
      Tests  30 passed (30)
```

### Full suite

```
$ npm test
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests)
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests)
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests)
 ✓ |app| src/engine/setup/deal.test.ts (34 tests)
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests)
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests)
 ✓ |app| src/engine/selectors/predicates.test.ts (13 tests)
 ✓ |app| src/engine/selectors/seating.test.ts (21 tests)
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (30 tests)
 ✓ |app| test/property/positional.property.test.ts (4 tests)
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests)
 ✓ |app| test/helpers/game.test.ts (5 tests)
 ✓ |app| src/engine/purity-scope.test.ts (1 test)
 ✓ |app| src/engine/phase.test.ts (11 tests)
 ✓ |app| src/engine/selectors/players.test.ts (7 tests)
 ✓ |app| test/eslint-perceived-character.test.ts (5 tests)
   ✓ §4.1 enforcement — where perceivedCharacterId may be imported > rejects the import from a rules module

 Test Files  16 passed (16)
      Tests  196 passed (196)
```

### Typecheck (after the `_actorId` fix)

```
$ npm run typecheck
> tsc --noEmit
(no output — clean)
```

### Lint

```
$ npm run lint
> eslint .
(no output — clean)
```

## Findings on the six checks

1. **The poisoned-Recluse test.** It threads real state through the resolver: `nine()` builds a real game, `STATUS_APPLIED` poisons p6 (the Recluse) through the actual reducer, `toRulesView` narrows it, and the test independently confirms `abilityFunctional(view, recluse)` is `false` before calling `investigatorAnswers(view, 'p5')`. `investigatorAnswers` → `oneOfTwo` → `couldRegisterAs` reads only `registrationOptionsForCharacterId(player.characterId)`, a static property of the character, with no reference anywhere to `alive`, `statusLedger`, or `abilityFunctional`. So the poisoned Recluse's registration options are unaffected by poison, and the test passes for the right reason. If someone later added a gate such as `if (!abilityFunctional(view, player)) continue` inside `couldRegisterAs`, the poisoned Recluse's minion-registration branch would disappear and `viaRecluse.length` would be 0 — the test would fail. This is a genuine, threaded guard against exactly the regression class §4.2 warns about, not a hollow assertion on a frozen array literal.

2. **Washerwoman/Librarian Drunk asymmetry.** The Washerwoman can never be offered the Drunk's believed Townsfolk, enforced two ways: `washerwomanAnswers` explicitly adds `view.drunkBelief.playerId` to `excludePlayerIds`, and independently `couldRegisterAs(view, 'townsfolk')` never includes the Drunk anyway because the Drunk's `registrationOptionsForCharacterId('drunk')` is the single-element default outsider option (no townsfolk option exists in its registration list) — the Drunk has no custom `registration` override in `characters.ts`, only Recluse and Spy do. The Librarian CAN be offered the Drunk as a real Outsider: `librarianAnswers` calls `oneOfTwo(view, actorId, 'outsider', ...)` with no exclusion set, and the Drunk's true team is `outsider`, so it appears as a canonical (unruled) candidate. Both are exercised and pass: `'never shows the Drunk as their believed Townsfolk'` and `'may show the Drunk, who is a real Outsider'`.

3. **Librarian's zero-Outsiders branch.** When `oneOfTwo(..., 'outsider', ...)` returns an empty array (no Outsider in play), `librarianAnswers` falls through to a single explicit answer: `value: null`, `display: 'Zero Outsiders are in play'`, `answerClass: 'canonical'`. This is distinguishable from an error (no throw occurs) and from an empty set (the returned array has length 1, not 0) — confirmed by the `'has an explicit zero-Outsiders branch'` test.

4. **Fortune Teller and the red herring.** `fortuneTellerAnswers` computes `herring = chosen.find((p) => p.id === view.redHerringPlayerId)` locally inside the resolver and folds it into `canonicalYes` and the derivation text only there. No other resolver reads `redHerringPlayerId` or treats any player as a Demon based on it — `chefAnswers`/`empathAnswers` use only true/ruled alignment, and `investigatorAnswers`/`librarianAnswers`/`washerwomanAnswers` never consult team `demon` at all. So yes, and only for this resolver.

5. **Undertaker with two executions.** `undertakerAnswers` maps `view.todaysExecutions` to one `LegalAnswer` per execution record with no truncation, `find`, or `[0]` — so two same-day executions (a Virgin trigger plus a vote) genuinely produce two candidate answers rather than silently picking one. Confirmed by `'becomes a Storyteller choice when two players were executed in one day'`, asserting `answers` has length 2 with both true characters present.

6. **Canonical first in every list.** Verified by construction and by test for every resolver:
   - `chefAnswers`/`empathAnswers`: `alignmentCombinations` starts from `[[]]` and, because each character's registration list puts the true option first (§4.3, enforced in `registration.ts`), the true-alignment branch is always processed first in the `Map` iteration and reuses the same (unmutated) combo array — inductively keeping the all-canonical (`registrationRulings: []`) combination at index 0 through any number of ambiguous players. Confirmed by `'offers four Chef answers...'` (`answers[0].answerClass === 'canonical'`, `registrationRulings: []`) and by the general `nobody ambiguous` case.
   - `washerwomanAnswers`/`librarianAnswers`/`investigatorAnswers` (`oneOfTwo`): an explicit final `.sort()` with a stable comparator moves every `'registration'` answer after every `'canonical'` one, preserving order within each group (JS array sort is stable per spec since ES2019). Confirmed by `'puts the canonical answers before the registration ones'`.
   - `fortuneTellerAnswers`: the canonical yes/no answer is constructed and pushed to `answers` before the loop that appends registration alternatives.
   - `ravenkeeperAnswers`: the true-character canonical answer is pushed before the loop appending registration alternatives.
   - `undertakerAnswers` has no registration class at all (every entry is canonical, since none carries rulings) — ordering there is about "which execution", not canonical-vs-registration, which matches §16.5's Storyteller-choice framing rather than the §4.3 cross-product.

## Files changed

- Created: `/Users/rithwik/stuff/botc/src/editions/troubleBrewing/resolvers.ts`
- Created: `/Users/rithwik/stuff/botc/src/editions/troubleBrewing/resolvers.test.ts`
- No existing file was modified.

## Self-review findings

- **Completeness:** every resolver in the brief's Produces list is present (`chefAnswers`, `empathAnswers`, `washerwomanAnswers`, `librarianAnswers`, `investigatorAnswers`, `fortuneTellerAnswers`, `undertakerAnswers`, `ravenkeeperAnswers`), plus `RESOLVERS` keyed by the eight step ids named in the brief. Canonical genuinely first everywhere — see check 6 above.
- **The one genuine defect** (unused `actorId` parameter on `fortuneTellerAnswers` failing `noUnusedParameters`) is documented above and fixed with the same convention the brief itself uses elsewhere in the same file.
- No `eslint-disable` was added anywhere. `npm run lint` is clean without one.
- No file outside the two permitted files was created or modified; confirmed with `git status --short` before committing (only the two new files staged).
- No import of `test/helpers/reference.ts`, no import of `GameState`, no import of `perceivedCharacterId` (the string appears only inside a comment, never as an import) — confirmed by grep.
- No test asserts something the type system already guarantees; each test threads a real `RulesView` built from a real event log through `toRulesView`, and the poisoned-Recluse test in particular is a genuine regression guard (see check 1).
- Output of `npm test`, `npm run typecheck`, `npm run lint` is pristine (no warnings, no stray console output).

## Issues or concerns

None beyond the one documented and fixed compile error (unused parameter), which was a plan-authored defect, not introduced by me.

---

## Fix round 1

Review of commit `3747e19` found one Critical and two Important defects, plus cheap minors. This round fixes all of them in `src/editions/troubleBrewing/resolvers.ts` and `resolvers.test.ts` only. Full suite is 202 passing (196 before + 6 net new tests), `npm run typecheck` clean, `npm run lint` clean.

### FIX 1 (Critical) — Librarian's zero-Outsiders branch discriminated by the WORLD, not the list

**Defect:** `librarianAnswers` returned the zero-Outsiders answer only when `oneOfTwo(...).length === 0`. A Spy's `{good, outsider}` registration option makes that list non-empty in any legal zero-Outsider game (7/10/13 players) containing a Spy, so the true "Zero Outsiders are in play" answer was entirely absent — every remaining answer was a `registration` ruling the Storyteller never made.

**Fix:** `librarianAnswers` (resolvers.ts:246–276) now computes `hasTrueOutsider` — whether any player's TRUE `characterId` (never a believed one, per §4.1) is on the outsider team — and prepends the canonical zero answer whenever it is false, regardless of what `oneOfTwo` returned.

**Correction mid-round:** the coordinator flagged that the first version of this predicate (no actor exclusion) opens a second hole: a Drunk who believes they are the Librarian wakes at this very step (§4.1 — `wakes()` reads the perceived character) and the Drunk's true team IS outsider, so in a legal one-Outsider game where the Drunk is that Outsider, `hasTrueOutsider` would read `true` (suppressing the zero answer) while `oneOfTwo` — which always excludes the actor from its own candidates — finds nobody else, yielding an **empty** answer set. Added `p.id !== actorId` to the predicate and a dedicated test for exactly this edge.

**Covering tests** (`resolvers.test.ts`, `librarianAnswers` describe block):
- `'keeps the true zero-Outsiders answer present and first even with a Spy in play'` — 7-player game (imp/spy/librarian/chef/empath/monk/soldier), asserts the zero answer is present, at index 0, canonical, and everything after it is `registration`.
- `'still offers the zero-Outsiders answer when the only true Outsider is the actor themselves (a Drunk believing they are the Librarian)'` — 6-player game where p6 is the Drunk (the sole Outsider) with `drunkBelief: { playerId: 'p6', believesCharacterId: 'librarian' }`, calling `librarianAnswers(view, 'p6')`. Asserts the set is non-empty and index 0 is the canonical zero answer.

**Evidence — reverted `librarianAnswers` to the pre-fix `answers.length > 0` gate, kept the new tests:**

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts -t "librarianAnswers"
 × librarianAnswers (§6.4) > keeps the true zero-Outsiders answer present and first even with a Spy in play
   → expected [ null, 'p2', 'p1' ] to be null
 AssertionError: expected [ null, 'p2', 'p1' ] to be null
  ❯ src/editions/troubleBrewing/resolvers.test.ts:338:31
     338|     expect(answers[0]?.value).toBeNull();
 Tests  1 failed | 4 passed | 31 skipped (36)
```

**Evidence — with the fix restored but the actor-exclusion correction reverted** (`p.id !== actorId` removed from the predicate):

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts -t "Drunk believing they are the Librarian"
 × librarianAnswers (§6.4) > still offers the zero-Outsiders answer when the only true Outsider is the actor themselves (a Drunk believing they are the Librarian)
   → expected [] to not have a length of +0
 AssertionError: expected [] to not have a length of +0
  ❯ src/editions/troubleBrewing/resolvers.test.ts:362:25
     362|     expect(answers).not.toHaveLength(0);
 Tests  1 failed | 35 skipped (36)
```

**Evidence — fix restored, full green:**

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (36 tests) 11ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

### FIX 2 (Important) — Ravenkeeper's ruled answers carry `[null, target.id]`, not the true character

**Defect:** All three Ravenkeeper answers carried `value: target.characterId`. For the two *ruled* answers this was wrong — the display says "a minion of the Storyteller's choosing" while the value silently recorded the true character (e.g. "recluse"). Setting it to a bare `null` (what the reviewer, and independently a second reviewer, both proposed) would type-check and read like the fix, but `Array.isArray(null) === false`, so the downstream command-layer guard `if (Array.isArray(value) && value[0] === null && !resolution.stChoice) throw …` would stay permanently dead.

**Fix:** `ravenkeeperAnswers` (resolvers.ts:401–447) — the canonical answer keeps `value: target.characterId` (a bare string; the Ravenkeeper genuinely learns that character, no `stChoice` owed). Each ruled answer now carries `value: [null, target.id]`, matching the documented tuple contract at `src/engine/types.ts:201–216`.

**Covering test** (`resolvers.test.ts`, `ravenkeeperAnswers` describe block): `'carries the true character as a bare value for the canonical answer, and a nulled tuple for each ruled answer'` — asserts the canonical answer's value is the true characterId and `Array.isArray(value) && value[0] === null` is `false` for it; for every ruled answer, `Array.isArray(value)` is `true`, element 0 is `null`, element 1 is the target's id, and `Array.isArray(value) && value[0] === null` is `true` — the exact boolean the downstream guard tests.

**Evidence — reverted the ruled-answer value back to `target.characterId`, kept the new test:**

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts -t "carries the true character as a bare value"
 × ravenkeeperAnswers (§6.4, guide §13) > carries the true character as a bare value for the canonical answer, and a nulled tuple for each ruled answer
   → expected false to be true // Object.is equality
 AssertionError: expected false to be true // Object.is equality
  ❯ src/editions/troubleBrewing/resolvers.test.ts:570:43
     570|       expect(Array.isArray(answer.value)).toBe(true);
 Tests  1 failed | 35 skipped (36)
```

**Evidence — fix restored, full green:**

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (36 tests) 12ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

### FIX 3 (Important) — the ordering test is now unconditional, and has a genuine witness

**Defect:** `'puts the canonical answers before the registration ones'` computed `firstRegistration = classes.indexOf('registration')` and only asserted `classes.slice(0, firstRegistration).every(c => c === 'canonical')`. When the first answer is already `registration`, `indexOf` returns `0`, `slice(0, 0)` is `[]`, and `[].every(...)` is vacuously `true` — unfalsifiable for exactly the shape FIX 1 produced (a Librarian set with no canonical answer at all).

**Fix:** (resolvers.test.ts, `investigatorAnswers` describe block)
1. Rewrote the existing test to assert `classes[0] === 'canonical'` unconditionally, plus a real partition check (`classes.slice(firstRegistration).every(c => c === 'registration')` — no canonical after any registration).
2. Added a dedicated witness test, `'puts the canonical zero-Outsiders answer first even in the Spy-in-play set that FIX 1 repairs'`, running the identical unconditional assertion over `librarianAnswers` on the 7-player Spy zero-Outsider fixture from FIX 1 — the exact shape that was broken.

**Evidence — with `librarianAnswers` reverted to the pre-FIX-1 buggy gate (`answers.length > 0`), the witness test fails:**

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts -t "puts the canonical zero-Outsiders answer first"
 × investigatorAnswers (§4.3, §6.4) > puts the canonical zero-Outsiders answer first even in the Spy-in-play set that FIX 1 repairs
   → expected 'registration' to be 'canonical' // Object.is equality
 AssertionError: expected 'registration' to be 'canonical'
  ❯ src/editions/troubleBrewing/resolvers.test.ts:425:24
     425|     expect(classes[0]).toBe('canonical');
 Tests  1 failed | 35 skipped (36)
```

This is the pre-fix (Librarian) behaviour specifically, as required — not a synthetic revert of the test's own logic. (Separately, by inspection: the OLD assertion form — `slice(0, indexOf('registration')).every(...)` — against this same `classes = ['registration', ...]` array computes `slice(0, 0).every(...)` = `true`, i.e. it would have passed on exactly this broken data, which is why it never caught FIX 1's defect.)

**Evidence — fix restored, full green:**

```
$ npx vitest run src/editions/troubleBrewing/resolvers.test.ts
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (36 tests) 14ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

### Cheap minors folded in

- **Article + redundant parameter (resolvers.ts).** Added `articleFor(word)` (`"an"` before a vowel, else `"a"`) and used it in `oneOfTwo`'s ruled display text, fixing `a outsider of your choosing` → `an outsider of your choosing`. Dropped `oneOfTwo`'s redundant `label` parameter (always equal to `team` at all three call sites) and updated the three call sites (`washerwomanAnswers`, `librarianAnswers`, `investigatorAnswers`). The existing `/^a minion of your choosing:/` assertion needed no change (minion doesn't take "an"); added a new assertion in the Spy/Librarian test that the display matches `/^an outsider of your choosing:/`.
- **Fortune Teller duplicate keys.** `chosen.length !== 2` let the same player be chosen twice pass as "on-constraint," producing two answers sharing the key `ft:yes:<id>` (breaking the §6.2 "stable key → restorable selection" contract). Added `distinctChosen` (deduped by player id) for answer construction and extended the off-constraint check to `isOffConstraint = chosen.length !== 2 || distinctChosen.length !== chosen.length`, with a distinct derivation message for the "same player twice" case. Covered by the new test `'dedupes a target chosen twice, keeps answer keys unique, and flags the deviation (§4.8, §6.2)'`.
- **Three test-honesty fixes:**
  - `:158` (now `'changes the Chef count when the Spy is ruled good, removing an adjacency'`) — retitled to match what the test and its own comment actually assert (the `0` comes from ruling the Spy good, not the Recluse evil).
  - `:287-290` — the "only under its true registration" librarian/Recluse test now filters every answer whose value shows `'recluse'` and asserts each is `answerClass: 'canonical'` with `registrationRulings: []`, rather than only checking `'recluse'` appears somewhere.
  - `:243` — deleted `expect([a, b]).not.toContain(undefined)` (guaranteed by the type and the 3-tuple destructure); also dropped the now-unused `a`, `b` bindings from that destructure to keep lint clean.
- **Coordinator-flagged additions during this round:**
  - Key-stability test (`'keeps answer keys stable across independently-reduced views, and unique within one set (§6.2)'`) — the equality half previously called the resolver twice on the SAME in-memory `view` object, which can never disagree for a pure function; now each side builds its own `toRulesView(nineWithSpy().state)` (independently re-folding the same event log), so the equality check is real. Added `fortuneTellerAnswers` (with `targets: ['p6', 'p3']`) to the resolvers under test — it was previously the one resolver excluded from this test, which is exactly why it never caught the duplicate-key bug fixed above.
  - Fortune Teller's `'true characters'` derivation line rendered with an empty `detail` (`''`) on a zero-target call. Now omitted entirely when `chosen.length === 0`, covered by `'omits the "true characters" derivation line rather than rendering it empty when nobody is chosen'`.
  - Confirmed (no code change) that `empathAnswers` genuinely reads `actorId` (for `aliveNeighbours`/`empathCount`), so the Fortune Teller's `_actorId` really is the odd one out, not a symptom of a broader pattern — left as is.
  - Left alone, as instructed: the Washerwoman's redundant Drunk-exclusion `Set` (deliberate belt-and-braces on the §6.4 asymmetry), and `oneOfTwo`'s `${team}:${player.id}:${decoy.id}` key shape (no Trouble Brewing character has two registration options on the same team, so no collision is possible).

### Report correction

The original "What I implemented" section claimed `resolvers.ts` was "transcribed exactly from the brief" and disclosed only the `_actorId` rename on `fortuneTellerAnswers`. That claim was incomplete: the brief's type-only import list also includes `CharacterId`, which is never referenced in the body and would fail `tsc --noEmit` under `noUnusedLocals` exactly as the `_actorId` parameter failed under `noUnusedParameters`. It was silently dropped from the import list in the file as committed (confirmed by diffing the brief's import block against `resolvers.ts:1-8`, which has no `CharacterId`). Dropping it was the right call — the same call as the `_actorId` rename — but the report should have disclosed it as a second plan-authored compile defect rather than describing the file as an exact transcription. Corrected here for the record; no further code change was needed since the file already omits the unused import.

### Full verification (after all fixes, final state)

```
$ npm test
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests)
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests)
 ✓ |app| src/engine/setup/deal.test.ts (34 tests)
 ✓ |app| test/helpers/game.test.ts (5 tests)
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests)
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests)
 ✓ |app| src/engine/selectors/predicates.test.ts (13 tests)
 ✓ |app| src/engine/selectors/seating.test.ts (21 tests)
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (36 tests)
 ✓ |app| test/property/positional.property.test.ts (4 tests)
 ✓ |app| src/engine/purity-scope.test.ts (1 test)
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests)
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests)
 ✓ |app| src/engine/phase.test.ts (11 tests)
 ✓ |app| src/engine/selectors/players.test.ts (7 tests)
 ✓ |app| test/eslint-perceived-character.test.ts (5 tests)
   ✓ §4.1 enforcement — where perceivedCharacterId may be imported > rejects the import from a rules module

 Test Files  16 passed (16)
      Tests  202 passed (202)
```

```
$ npm run typecheck
> tsc --noEmit
(no output — clean)
```

```
$ npm run lint
> eslint .
(no output — clean)
```

### Files changed

- Modified: `/Users/rithwik/stuff/botc/src/editions/troubleBrewing/resolvers.ts`
- Modified: `/Users/rithwik/stuff/botc/src/editions/troubleBrewing/resolvers.test.ts`
- Modified: `/Users/rithwik/stuff/botc/.superpowers/sdd/2026-09-07-botc-slice1-plan1-engine/task-8-report.md` (this report)
- No `eslint-disable` added anywhere; no import of `perceivedCharacterId` anywhere in `resolvers.ts` (§4.1 boundary untouched).

### Issues or concerns

None. All three findings are fixed with genuine failing-then-passing evidence, the FIX 1 correction (actor exclusion) is covered by its own dedicated test, and all folded-in minors are covered by tests or are documented no-ops.
