# Task 9 report: night order data and the lazy cursor

## What was implemented

Six files, exactly as scoped by the brief's `Files:` block:

- **Created** `src/editions/troubleBrewing/stepIds.ts` — the frozen `STEP_IDS` list (19 ids) and `StepId` type, transcribed verbatim from the brief.
- **Created** `src/editions/troubleBrewing/nightOrder.ts` — `NightStep`, `StepScript`, `StepTargets`, `StepEffect` types; the 19 step definitions (3 pseudo, 2 group, 14 per-actor); `FIRST_NIGHT` (14 steps) and `OTHER_NIGHTS` (13 steps); `nightOrderFor(nightNumber)`. This is the second file (with `nightCursor.ts`) the §4.1 ESLint boundary sanctions to import `playersWithPerceivedCharacter`/`alive` for `wakes()`.
- **Created** `src/editions/troubleBrewing/index.ts` — the edition barrel, re-exporting `characters`, `distribution`, `registration`, `resolvers`, `stepIds`, `nightOrder`, plus `EDITION`.
- **Created** `src/engine/selectors/nightCursor.ts` — `stepKey`, `nextStep`, `nightOverview`, and the `CursorPosition`/`OverviewRow` interfaces. The sanctioned second reader of `perceivedCharacterId`.
- **Test** `src/editions/troubleBrewing/nightOrder.test.ts` (21 tests) and `src/engine/selectors/nightCursor.test.ts` (14 tests).
- **Modified**: nothing. `src/engine/reducer/applyEvent.ts` was **not** touched — see verification below.

All step ids, ordering, script text, groupings, `settleScope`, `targets`, `effect` and `resolverId` values were transcribed verbatim from the brief's code blocks. Both night orders were checked line-by-line against the domain guide's §3 "Night Order & Exact Storyteller Script" (First Night and Every Other Night lists) — they agree exactly, including the guide's §15 ordering rule (status modifiers → info-leakers → kill → reactive abilities). No discrepancy between the brief and the guide was found.

## R8 verification: the Task 4 `demonNotified` fix

Per your instructions, I verified rather than edited. Both lines read exactly as you described:

```
src/engine/reducer/applyEvent.ts:162:      demonNotified: character.team === 'demon',
src/engine/reducer/applyEvent.ts:290:          demonNotified: stepId === SCARLET_WOMAN_NOTIFY_STEP_ID ? true : p.demonNotified,
```

`git status --porcelain` after all my edits shows `applyEvent.ts` absent from the changed-files list — confirmed untouched. The brief's own narration (which describes this as a defect I need to fix) is stale; the fix already exists at origin. My commit does not touch this file.

## The step-id agreement test: both constants

The brief's own `nightOrder.test.ts` code block only tests agreement between `FIRST_NIGHT`/`OTHER_NIGHTS` and `SINGLE_KEY_STEP_IDS` — it does **not** test `SCARLET_WOMAN_NOTIFY_STEP_ID`, despite `applyEvent.ts`'s own comment on that constant explicitly saying "Task 9 must add this constant to its agreement-test coverage." Per your explicit instruction (item 2), I added a test the brief omitted:

```ts
it('agrees with the reducer about which step notifies the Scarlet Woman', () => {
  const ids = new Set([...FIRST_NIGHT, ...OTHER_NIGHTS].map((s) => s.id));
  expect(ids.has(SCARLET_WOMAN_NOTIFY_STEP_ID)).toBe(true);
  expect(OTHER_NIGHTS.some((s) => s.id === SCARLET_WOMAN_NOTIFY_STEP_ID)).toBe(true);
});
```

To support this I imported `SINGLE_KEY_STEP_IDS` and `SCARLET_WOMAN_NOTIFY_STEP_ID` both from `@/engine/reducer/applyEvent` (the brief only imported `SINGLE_KEY_STEP_IDS`, from `@/engine/reducer/fold`; `fold.ts` re-exports `SINGLE_KEY_STEP_IDS` but not `SCARLET_WOMAN_NOTIFY_STEP_ID`, so importing both from `applyEvent.ts` directly avoided touching `fold.ts` to add a second re-export).

## Defects found in the brief (transcribed faithfully elsewhere, reported here)

1. **`nightCursor.test.ts`'s `nine()` fixture is missing the Undertaker — the "reports conditionMet false" test cannot pass as written.** The brief's fixture assigned `p4` the character `'monk'`:
   ```
   ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'scarlet_woman'], ['p4', 'monk'],
   ['p5', 'ravenkeeper'], ['p6', 'chef'], ['p7', 'empath'], ['p8', 'butler'], ['p9', 'saint'],
   ```
   but the test walks the cursor `while (position.step.id !== 'undertaker')`, expecting to land on the Undertaker step with `conditionMet === false`. With no Undertaker character in the roster, `undertaker.wakes(view)` is always empty, so `nextStep` silently skips over that step (the `for` loop's `continue` on empty `wakes()`) and the walk runs off the end of the night order — `nextStep` returns `null`, and the test throws `'never reached the Undertaker'` before any assertion runs. I confirmed this by running the brief's code verbatim first: 34/35 tests passed, this one failed exactly that way.

   The sibling fixture in `nightOrder.test.ts`'s "step conditions" describe block — same 9-player shape, same seat order, written for the same purpose — correctly uses `['p4', 'undertaker']`. This is a copy/paste divergence between the two test files. I fixed it by changing `nightCursor.test.ts`'s fixture to match: `['p4', 'undertaker']`. This is the minimal fix that makes the test's own premise (reach the Undertaker, observe an unmet condition) possible, and it does not weaken any assertion — the test still requires the cursor to visit every earlier step and terminate on the Undertaker without looping. No other test in the file depends on `p4` being a Monk. Full suite re-run clean after the fix (see below).

2. **`nightCursor.test.ts`'s import list includes an unused import.** The brief's code block imports `import type { GameEvent } from '@/engine/events';` but never references `GameEvent` anywhere in the file. Since `@typescript-eslint/no-unused-vars` is active (via `tseslint.configs.recommended`), transcribing this verbatim would fail lint. I omitted the unused import; nothing else in the file needed it.

Both defects are exactly the kind flagged in your brief as "verified type surface, never executed the domain logic": the fixture bug only surfaces when the test actually runs (not from reading it), and the unused import only surfaces under lint. Everything else in both test files — including the tests I was warned to scrutinize for "cannot fail" shapes (the frozen `STEP_IDS` snapshot test, the `SINGLE_KEY_STEP_IDS` agreement test, the resolver-coverage test, the Scarlet Woman notify tests, the non-monotonic re-open test) — genuinely exercises real behavior and would fail under a plausible mutation (renamed step id, missing settleScope override, dropped `demonNotified` guard, monotonic-only cursor, etc.). None looked structurally unfalsifiable.

## Judgment calls (not transcription)

- Combined the brief's two separate `import … from '@/engine/selectors/players'` statements in `nightOrder.ts` into one (`import { alive, playersWithPerceivedCharacter } from …`). Purely syntactic; same runtime behavior, same file exempted from the §4.1 restriction either way.
- Chose `@/engine/reducer/applyEvent` (not `@/engine/reducer/fold`) as the import source for both `SINGLE_KEY_STEP_IDS` and `SCARLET_WOMAN_NOTIFY_STEP_ID` in the new agreement test, to avoid modifying `fold.ts`'s re-export list for a test-only need.

## Test evidence

```
$ npx vitest run
...
 Test Files  18 passed (18)
      Tests  237 passed (237)
   Start at  21:07:38
   Duration  931ms

$ npm run typecheck
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
(no output, exit 0)

$ npm run lint
> botc-grimoire@0.1.0 lint
> eslint .
(no output, exit 0)
```

Before this task: 202 passing across 16 files. After: **237 passing across 18 files** (+35 tests, +2 files — matches the 21 + 14 tests written).

Also spot-checked the two new files directly against the §4.1 boundary:
```
$ npx eslint src/editions/troubleBrewing/nightOrder.ts src/engine/selectors/nightCursor.ts
(no output, exit 0)
```
confirming both are correctly exempted (they import `playersWithPerceivedCharacter`/`perceivedCharacterId`) and nothing else changed triggers the restriction (`npm run lint` across the whole repo is clean, and no other new file imports those two functions).

## §4.1 boundary

No file other than `nightOrder.ts` and `nightCursor.ts` imports `perceivedCharacterId` or `playersWithPerceivedCharacter`. No `eslint-disable` was added anywhere.

## Standing constraints check

- Reducer purity: `applyEvent.ts` untouched; the `reducer-purity` Vitest project (`purity.guard.test.ts`, `determinism.test.ts`) still passes.
- Event envelope: no new event types added; existing envelope shape used as-is in tests via `buildGame`/`LogBuilder`.
- Edition scope: Trouble Brewing only, no abstraction layer introduced.
- No secrets, no real names — all fixtures use `p1`..`p9`.

## Fix round 1

Review came back Approved with one Important finding and seven cheap minors. All addressed in the same two files (`nightOrder.ts`, `nightCursor.ts`) plus their paired tests — no new scope.

### FIX 1 (Important) — `requiresAlive` duplicated onto the step

Removed the `requireAlive` parameter from `perceivedActors` and its one call site (`RAVENKEEPER`'s `perceivedActors('ravenkeeper', false)` → `perceivedActors('ravenkeeper')`). `perceivedActors` now reads `characterById(characterId).requiresAlive` directly — the single source of truth §6.2/§4.2 names — instead of restating the flag as an implicit `true` thirteen times and an explicit `false` once, with no agreement test tying the two together.

Confirmed the read is of the **perceived** character (the `characterId` parameter passed to `perceivedActors`, e.g. `'ravenkeeper'`), not the true character — this is correct and deliberate, not a §4.1 regression: a dead Drunk who believes they are the Ravenkeeper must still be woken to receive false information, which is the entire point of the Drunk.

**Call-site audit** — every call to `perceivedActors(characterId)` passes a literal that exists in `CHARACTERS` (`characterById` throws otherwise):
```
poisoner, monk, spy, imp, ravenkeeper, undertaker, washerwoman, librarian,
investigator, chef, empath, fortune_teller, butler
```
All 13 confirmed present via `grep -n "character('" src/editions/troubleBrewing/characters.ts` — every id nightOrder.ts calls with matches a `character('<id>', ...)` entry. No call site can throw.

**Behavioural witness** — the dead-Monk / dead-Ravenkeeper test (`does not wake a dead Monk but does wake a dead Ravenkeeper (§6.2)`) still passes unchanged after the refactor:
```
$ npx vitest run src/editions/troubleBrewing/nightOrder.test.ts -t "does not wake a dead Monk"
 ✓ |app| src/editions/troubleBrewing/nightOrder.test.ts (22 tests | 21 skipped) 2ms
 Tests  1 passed | 21 skipped (22)
```
This is the genuine behavioural check that the refactor (reading `requiresAlive` off the character) preserves the exact same semantics as the removed step-local flag (Monk `requiresAlive: true` filters the dead Monk out; Ravenkeeper `requiresAlive: false`, set on the character at `characters.ts:101`, keeps the dead Ravenkeeper in).

### Minors

1. **Skip-stall test strengthened.** `treats a skipped step as settled and advances` now asserts `first === 'dusk_confirm_eyes_closed'` and `nextStep(...)?.step.id === 'poisoner'` (the real next step in this 9-player OTHER_NIGHTS fixture), instead of the weaker `not.toBe(first)`, which a null-returning (stalled) cursor would also satisfy via `undefined !== 'dusk_confirm_eyes_closed'`.
2. **Group-step key test now exercises a genuine `grouping: 'group'` step.** Swapped the fixture from `dusk_confirm_eyes_closed` (`grouping: 'pseudo'`, same GROUP-key branch but for a different reason) to `minion_info`. Note `minion_info` exists only in `FIRST_NIGHT` (not `OTHER_NIGHTS` — Minion/Demon info is first-night only per §6.3/guide §2), so the test now reads from `FIRST_NIGHT` and asserts `grouping === 'group'` before checking the key, so the test fails loudly if that ever drifts.
3. **`StatusLifetimeName` now derives from the engine's `StatusLifetime`** (`@/engine/phase`) via `Exclude<StatusLifetime, 'permanent'>`, instead of a hand-cloned literal union — a new lifetime added to the engine type is now a compile error here instead of silently unrepresentable.
4. **`SCARLET_WOMAN_NOTIFY.wakes` now reads `p.team` instead of `characterById(p.characterId).team`**, matching its `MINION_INFO`/`DEMON_INFO` siblings and no longer throwing on an undealt player (`characterById('')` throws).
5. **Added a 6-vs-7 boundary test** (`pins the Minion/Demon info threshold at exactly 7, not 6 or 8`) alongside the existing 5-vs-9 tests, since §6.3's "7+ players only" qualifier is recorded in the spec as a named v2 regression.
6. **`nightOverview`'s per-night-per-actor case (the Imp) now carries its actor.** `entries` is now `step.settleScope === 'per-actor' ? actors : step.grouping === 'per-actor' ? [actors[0] ?? null] : [null]` — preserving one row per actor for ordinary per-actor steps, one row with the acting actor for the Imp (grouping `per-actor`, settleScope `per-night` — the only step that is both), and `[null]` for every other per-night step (dusk, minion/demon info, dawn).
7. **Added a comment on `DEMON_INFO`** recording that the step shows two physical cards while `showCard` is a single value, so the second card (the bluffs, `'not_in_play'`) lives only in the instruction prose. No interface change, as instructed.

Left alone, as instructed: the §15 ordering-rationale test (redundant but not vacuous — kept), and `export type { PlayerId }` / the barrel's zero current importers (brief-mandated, Plan 2 is the stated consumer).

### Test evidence

```
$ npx vitest run src/editions/troubleBrewing/nightOrder.test.ts src/engine/selectors/nightCursor.test.ts
 ✓ |app| src/engine/selectors/nightCursor.test.ts (14 tests) 6ms
 ✓ |app| src/editions/troubleBrewing/nightOrder.test.ts (22 tests) 6ms
 Test Files  2 passed (2)
      Tests  36 passed (36)

$ npx vitest run
 Test Files  18 passed (18)
      Tests  238 passed (238)

$ npm run typecheck
> tsc --noEmit
(no output, exit 0)

$ npm run lint
> eslint .
(no output, exit 0)
```

Before this round: 237/18. After: **238/18** (+1 test — the new 6-vs-7 threshold boundary test; the other six minor fixes amended existing tests rather than adding new ones).
