# Task 2 Report: Trouble Brewing character and distribution data

## What I implemented

Created exactly the five files named in the brief, nothing else:
- `src/editions/troubleBrewing/characters.ts` — `Team`, `Alignment`, `TeamCounts`,
  `RegistrationOption`, `Character` types; the 22-character `CHARACTERS` map,
  `characterById`, `charactersByTeam`, `alignmentOf`.
- `src/editions/troubleBrewing/distribution.ts` — `DISTRIBUTION` chart (5-15 players),
  `MIN_PLAYERS`, `MAX_PLAYERS`, `INFO_THRESHOLD_PLAYERS`, `distributionFor` (guarded,
  throws outside 5-15 per `noUncheckedIndexedAccess`).
- `src/editions/troubleBrewing/registration.ts` — `registrationOptions`,
  `registrationOptionsForCharacterId`, `isAmbiguous`, `canRegisterAsTeam`.
- `src/editions/troubleBrewing/characters.test.ts`, `distribution.test.ts` — brief's
  tests transcribed verbatim.

Transcribed the brief's code blocks exactly, with the two controller-ruled corrections:
- **Drunk** ability text uses the guide's contraction: "your ability doesn't work"
  (not the brief's "does not work").
- **Poisoner** ability text restores the guide's parenthetical: "...tonight and
  tomorrow day (their ability malfunctions / gives false info)." (brief had dropped it).

No `index.ts`, `nightOrder.ts`, `stepIds.ts`, `resolvers.ts`, or `victory.ts` created —
those are later tasks' files.

## What I tested and test results

### `npx vitest run src/editions/troubleBrewing`

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (23 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (7 tests) 3ms

 Test Files  2 passed (2)
      Tests  30 passed (30)
```

### `npm run typecheck`

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```
(clean exit, no output — no type errors)

### `npm run lint`

```
> botc-grimoire@0.1.0 lint
> eslint .
```
(clean exit, no output — no lint errors, including
`@typescript-eslint/consistent-type-imports` and `@typescript-eslint/no-explicit-any`)

### `npm test` (full suite)

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (23 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (7 tests) 4ms

 Test Files  4 passed (4)
      Tests  36 passed (36)
```

Pristine output throughout — no stray warnings, no console noise.

## TDD Evidence

**RED** — command: `npx vitest run src/editions/troubleBrewing` (run before writing
`characters.ts`, `distribution.ts`, `registration.ts`):

```
 FAIL  |app| src/editions/troubleBrewing/characters.test.ts [ src/editions/troubleBrewing/characters.test.ts ]
Error: Cannot find module './characters' imported from
'/Users/rithwik/stuff/botc/src/editions/troubleBrewing/characters.test.ts'

 FAIL  |app| src/editions/troubleBrewing/distribution.test.ts [ src/editions/troubleBrewing/distribution.test.ts ]
Error: Cannot find module './distribution' imported from
'/Users/rithwik/stuff/botc/src/editions/troubleBrewing/distribution.test.ts'

 Test Files  2 failed (2)
      Tests  no tests
```

Expected failure — exactly the brief's Step 2 expectation (`Cannot find module
'./characters'`), because the test files were written first and the implementation
files did not yet exist.

**GREEN** — command: `npx vitest run src/editions/troubleBrewing` (run after writing
all three implementation files):

```
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (23 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (7 tests) 4ms

 Test Files  2 passed (2)
      Tests  30 passed (30)
```

## Data-fidelity check against the guide

Guide used: `/Users/rithwik/Downloads/botc-trouble-brewing-storyteller-guide.md`.

**Ability text (all 22, guide §1)** — I extracted every `character(...)` call's ability
string from the committed `characters.ts` via `grep` and compared each one word-for-word
against the guide's §1 table, in file order (13 townsfolk, 4 outsiders, 4 minions, 1
demon). All 22 match verbatim, including the two controller-specified corrections
(Drunk's "doesn't work" contraction, Poisoner's restored parenthetical). No other drift
found — the other 20 strings were left exactly as the brief had them, per the ruling.

**Distribution chart (11 rows, guide §2)** — the test file's `OFFICIAL` array is a
direct, row-by-row transcription of the brief's table (itself matching guide §2), and
`distribution.test.ts`'s parameterized tests assert equality against `distributionFor`
for every row plus the player-count-sum invariant; all 23 assertions (11 rows × exact
match, 11 rows × sum-to-playercount, 1 boundary test) passed. I did not find any
discrepancy between the brief's chart and the guide's chart — both list identical
townsfolk/outsider/minion/demon counts for all 11 player counts (5-15).

**Capability flags:**
- `requiresAlive: false` appears exactly twice: `ravenkeeper` (line ~89) and `saint`
  (line ~116). Every other character defaults to `true` via the `character()` helper.
  Confirmed by grep and by the passing "requires life for every other character" test.
- `falseSelfBelief: true` appears exactly once: `drunk` (line ~104). Confirmed by the
  passing "gives falseSelfBelief to the Drunk alone" test.
- `setupModifiers` is non-null exactly once: `baron`, value `{ townsfolk: -2, outsider: 2 }`
  (line ~134), matching guide §2's note ("+2 Outsiders... removes 2 Townsfolk"). Confirmed
  by the passing Baron-specific test.
- `registration` overrides are present only for `recluse` and `spy`, each with the true
  option listed first (Recluse: good/outsider first, then evil/minion, evil/demon; Spy:
  evil/minion first, then good/townsfolk, good/outsider) — matching the brief and the
  guide's "you might register as..." wording for both.

I found no discrepancies in the brief's 22-character roster or its 11-row distribution
chart against the guide — matching the controller's pre-verification. The only
corrections needed were the two ability strings the controller had already flagged.

## Files changed

- `src/editions/troubleBrewing/characters.ts` (new)
- `src/editions/troubleBrewing/characters.test.ts` (new)
- `src/editions/troubleBrewing/distribution.ts` (new)
- `src/editions/troubleBrewing/distribution.test.ts` (new)
- `src/editions/troubleBrewing/registration.ts` (new)

Commit: `3dfc874` — "feat(edition): add Trouble Brewing characters, distribution and
registration"

## Self-review findings

- **Completeness:** all interfaces, types, and functions named in the brief's
  "Produces" list are present and exported with matching signatures.
- **Data fidelity:** re-checked as described above; no issues beyond the two
  controller-ruled corrections, which were applied.
- **Quality:** names match the brief exactly; no renaming or restructuring introduced.
- **Discipline:** no files created beyond the five named in the brief; no edition
  abstraction layer; no barrel file; no premature nightOrder/resolvers/victory code.
- **Testing:** both test files transcribed verbatim from the brief, run in the
  brief's TDD order (RED before implementation, GREEN after). Output is clean.

No issues found. Nothing to fix.

## Issues or concerns

None. Work is complete and matches the brief and the controller's rulings.

---

## Fix report — round 1 (post-review)

The review found two Important findings (plus one Minor folded in). The
coordinator ruled on both; I implemented the rulings as given.

### What I changed

**Finding 1 — `registration.ts` had zero test coverage.**
Added `src/editions/troubleBrewing/registration.test.ts` with:
- Exact ordered array assertion (`toEqual`, not just length) for the Recluse:
  `{good, outsider}` first, then `{evil, minion}`, then `{evil, demon}`.
- Exact ordered array assertion for the Spy: `{evil, minion}` first, then
  `{good, townsfolk}`, then `{good, outsider}`.
- An exhaustive-exclusion test: every character other than Recluse/Spy has
  exactly one registration option, equal to its own `{alignment, team}` —
  mirroring the shape `characters.test.ts` already uses for the other flags.
- `isAmbiguous`: true for `recluse` and `spy`, false for `imp`.
- `canRegisterAsTeam('recluse', 'demon')` is true (spec §16.12 — Recluse may
  die to the Slayer registering as Demon) and `canRegisterAsTeam('spy',
  'townsfolk')` is true (spec §16.6 — the Virgin ruling).
- A structural "not gated" test asserting `.length` (declared-parameter count)
  on `registrationOptions`, `registrationOptionsForCharacterId`, `isAmbiguous`,
  and `canRegisterAsTeam` — none of them has a state/phase/aliveness
  parameter, so none could be gated on poison even by accident. Commented in
  the test to say that's what it's for.
- One `Object.isFrozen` assertion on a shared registration array
  (`characterById('washerwoman').registration`), per the ruling's "one line
  of coverage" suggestion.

I did not change `registration.ts` itself — its functions already took only
a character id (or `Character`) with no extra parameters, so no production
code change was needed to satisfy the "not gated" requirement; only the test
was missing.

**Finding 2 — freeze depth: shared edition data was mutable.**
In `characters.ts`:
- Marked every field on `TeamCounts`, `RegistrationOption`, and `Character`
  `readonly`.
- The four shared registration constants (`GOOD_TOWNSFOLK`, `GOOD_OUTSIDER`,
  `EVIL_MINION`, `EVIL_DEMON`) are now each built with `Object.freeze(...)`
  at declaration.
- The `character()` factory now does `Object.freeze(overrides.registration ??
  base[team])` for the `registration` field and `Object.freeze(setupModifiers)`
  when non-null, then wraps the whole returned character object in
  `Object.freeze(...)`. Freezing the registration array generically inside
  the factory (rather than only at the shared constants) also covers the
  Recluse's and Spy's inline override arrays, satisfying "freeze ... the
  registration array on the Recluse and the Spy" without duplicating the
  freeze call at each override site.
- I additionally froze the Baron's `setupModifiers` object inside the
  factory. This wasn't separately enumerated in the ruling's bullet list, but
  it's the same class of per-instance override object as the Recluse/Spy
  registration arrays, and leaving it unfrozen would have reopened the exact
  "shared singleton silently corrupted" hazard the finding was about — for
  the one character that has a non-null `setupModifiers`. I judged this
  inside the spirit of "deep-frozen by construction" rather than scope creep;
  flagging it here in case the controller disagrees.
- Kept the four shared constants shared (did not fork them into per-character
  array literals) — per the ruling's explicit "Do NOT do this."

In `distribution.ts`:
- Each `TeamCounts` value inside `DISTRIBUTION` is now wrapped in
  `Object.freeze(...)`, in addition to the outer `Object.freeze` on the
  record (unchanged).
- `distributionFor`'s existing throw-guard is untouched, as instructed.

Added `Object.isFrozen` coverage (per the ruling's "one line" suggestion):
- `characters.test.ts`: `Object.isFrozen(characterById('imp'))` is true.
- `distribution.test.ts`: `Object.isFrozen(distributionFor(10))` is true.

No test asserts that mutation throws — `readonly` typing makes that a
compile-time error, the stronger guarantee, and a runtime test would need an
`as any` cast, which the ruling said not to add.

**Finding 3 (Minor) — stale docstring.**
Rewrote the `Character.registration` docstring: it no longer claims an empty
array is possible (no character ever has one). It now says a one-element
array is the character's own team/alignment, and more than one element means
ambiguous registration (Recluse, Spy).

Left out of scope, as instructed: no snapshot test for the 22 `abilityText`
strings (deferred to final review).

### Covering tests run

`npx vitest run src/editions`:

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms

 Test Files  3 passed (3)
      Tests  39 passed (39)
```

`npm run typecheck` (load-bearing for the `readonly` change — prints nothing
on success):

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```

`npm run lint`:

```
> botc-grimoire@0.1.0 lint
> eslint .
```

`npm test` (full suite, run once before committing):

```
> botc-grimoire@0.1.0 test
> vitest run

 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms

 Test Files  5 passed (5)
      Tests  45 passed (45)
```

All green, pristine output.

### Files changed (this round)

- `src/editions/troubleBrewing/characters.ts` (readonly fields, frozen
  constants, frozen-by-construction factory, docstring fix)
- `src/editions/troubleBrewing/characters.test.ts` (added frozen-character test)
- `src/editions/troubleBrewing/distribution.ts` (frozen `TeamCounts` values)
- `src/editions/troubleBrewing/distribution.test.ts` (added frozen-TeamCounts test)
- `src/editions/troubleBrewing/registration.test.ts` (new)

Commit: `f509fce` — "test(edition): cover registration ordering, deep-freeze
character and distribution data", on top of `3dfc874`.

### Issues or concerns

One judgment call beyond the literal ruling text: freezing the Baron's
`setupModifiers` object inside the `character()` factory (noted above). I
believe it's squarely inside the finding's intent, but calling it out since
it wasn't explicitly listed.
