# Task 3 Report: Core types, phase ordering and status lifetimes

## What I implemented

Exactly per brief, verbatim transcription of the three code blocks:

- `src/engine/types.ts` — all types/interfaces listed in the brief's "Produces" list:
  `PlayerId`, `CharacterId`, `TxId`, `PhaseKind`, `Phase`, `StatusName`, `StatusEntry`,
  `DeathCause`, `ExecutionKind`, `DeathRecord`, `ExecutionRecord`, `Claim`, `InfoRecord`,
  `Player`, `VictoryStatus`, `VictoryReason`, `Victory`, `Vote`, `Nomination`, `RuleFlagClass`,
  `RuleFlag`, `NoteScope`, `Note`, `DrunkBelief`, `GameState`, `AnswerClass`,
  `RegistrationRuling`, `DerivationLine`, `LegalAnswer`, `RulesViewPlayer`, `RulesView`.
  Imports `Alignment`, `Team`, `TeamCounts` from `@/editions/troubleBrewing/characters`.
- `src/engine/phase.ts` — `phaseOrdinal`, `comparePhases`, `nextPhase`, `isStatusActive`,
  `StatusLifetime`, `expiryFor`.
- `src/engine/phase.test.ts` — the brief's test file, transcribed verbatim (11 tests across
  4 describe blocks: `phaseOrdinal`, `nextPhase`, `isStatusActive`).

No deviation from the brief's code. Both deliberate spec deviations (perceivedCharacterId as
a function only, never a Player field; stPrivate seeded now) carried through as specified —
neither required any decision on my part, both are just "don't add the field" / "do add the
field."

## What I tested and results

### `npm run typecheck`
```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```
(no output — clean, strict mode including noUncheckedIndexedAccess and
exactOptionalPropertyTypes satisfied)

### `npm test` (full suite)
```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 4ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms

 Test Files  6 passed (6)
      Tests  56 passed (56)
   Start at  17:56:14
   Duration  290ms (transform 127ms, setup 30ms, collect 216ms, tests 17ms, environment 0ms, prepare 413ms)
```

`phase.test.ts` ran in the `app` project (not `reducer-purity`), confirming it lives outside
`src/engine/reducer/` as required.

### `npm run lint`
```
> botc-grimoire@0.1.0 lint
> eslint .
```
(no output — clean, no `no-explicit-any` or `consistent-type-imports` violations)

## TDD Evidence

**RED** — before creating `types.ts` / `phase.ts`, ran:
```
npx vitest run src/engine/phase.test.ts
```
Output:
```
 FAIL  |app| src/engine/phase.test.ts [ src/engine/phase.test.ts ]
Error: Cannot find module './phase' imported from '/Users/rithwik/stuff/botc/src/engine/phase.test.ts'
...
Caused by: Error: Failed to load url ./phase (resolved id: ./phase) in
/Users/rithwik/stuff/botc/src/engine/phase.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```
Expected per brief exactly: "FAIL — Cannot find module './phase'". Confirmed.

**GREEN** — after writing `types.ts` and `phase.ts`, ran:
```
npx vitest run src/engine/phase.test.ts
```
Output:
```
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
```
Then `npm run typecheck` — clean, as pasted above.

## Hand-derivation of phase ordinals and status-lifetime checks

`phaseOrdinal(phase) = phase.number * 2 + (kind === 'night' ? 0 : 1)`

- night 1: 1*2 + 0 = **2**
- day 1:   1*2 + 1 = **3**
- night 2: 2*2 + 0 = **4**
- day 2:   2*2 + 1 = **5**

Strictly increasing in play order: 2, 3, 4, 5 — confirmed.

**Monk protection applied night 2** — `expiryFor('until_dawn', night(2))` → `night(2)`,
ordinal 4.
- Active at night 2: ordinal(now)=4 <= ordinal(expiresAt)=4 → **true** ✓
- Active at day 2: ordinal(now)=5 <= 4 → **false** ✓ (protection gone by day)

**Poisoner poison applied night 2** — `expiryFor('tonight_and_tomorrow', night(2))` →
`day(2)`, ordinal 5.
- Active at night 2: ordinal(now)=4 <= ordinal(expiresAt)=5 → **true** ✓
- Active at day 2: ordinal(now)=5 <= 5 → **true** ✓
- Active at night 3: ordinal(now)=6 <= 5 → **false** ✓ (gone by night 3)

All match the brief's required behavior and the test assertions in `phase.test.ts` verify
these exact cases (using night 3/day 3 and night 4/day 4 instances, same arithmetic).

## Files changed

- `/Users/rithwik/stuff/botc/src/engine/types.ts` (new)
- `/Users/rithwik/stuff/botc/src/engine/phase.ts` (new)
- `/Users/rithwik/stuff/botc/src/engine/phase.test.ts` (new)

Commit: `520cd91` — "feat(engine): add core types, phase ordering and status lifetimes"

## Self-review findings

- Completeness: every type/function in the brief's "Produces" list is present, transcribed
  verbatim from the brief's code blocks. No additions, no omissions.
- Phase math: re-derived by hand above; matches brief and passes tests.
- Discipline checks:
  - `grep -rn "perceivedCharacterId" src/` finds only a comment reference in `types.ts`
    (inside `RulesView`'s `drunkBelief` doc comment) — no field on `Player`. Confirmed correct.
  - No file created under `src/engine/reducer/`, no `events.ts`, no `selectors/`, no
    `index.ts`, no `rules/`/`commands/`/`setup/`. Confirmed via `ls src/engine`.
  - No `any` usage anywhere in the three new files.
  - `git status` shows working tree clean after commit, only the three intended files added.
- Testing: all 11 test cases from the brief run and pass; `phase.test.ts` runs under the
  `app` Vitest project (visible in the `|app|` tag in test output), confirming globals/project
  placement is correct. Test output is pristine — no warnings, no console noise.
- Quality: names and doc comments are exactly as specified in the brief, which already
  reflects careful spec cross-referencing (§4.4, §18, §3.8, §6.2, etc.).

No issues found. No deviations from the brief.

## Concerns

None. This task had no design decisions to make — it was a verbatim transcription task, and
both "deliberate deviations from spec" were already pre-decided in the brief (don't add
`perceivedCharacterId` as a field; do seed `stPrivate`). All verification (RED, GREEN,
typecheck, lint, full suite) passed cleanly.
