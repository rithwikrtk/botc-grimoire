# Task 15 report: The Virgin and the Slayer

## Follow-up (commit `ebc8e0a`, on top of `ca9f627`)

The one gap I found in the guards→tests sweep but declined to fix
unilaterally — `evaluateSlayer`'s `opts.ruleTargetAsDemon === false` path had
no direct witness — was ruled to belong in this round, not the ledger. The
reasoning: FIX 1b made the `undefined`/`false` distinction load-bearing.
Before FIX 1b, both produced the same observable outcome
(`targetRegisteredAsDemon: false`, `outcome: 'nothing'`), so the distinction
was inert. After FIX 1b, `false` is the *only* input that resolves — every
other case (including `undefined`) now throws — so an untested escape hatch
from a throw is exactly the silent-wrongness shape this plan exists to catch,
and this round introduced it.

### What was added

Two tests, no production change:

`src/engine/rules/slayer.test.ts` — `'resolves rather than asking again once
the Storyteller has declined the Demon ruling'`:
```ts
const declined = evaluateSlayer(view, 'p3', 'p4', { ruleTargetAsDemon: false });
expect(declined).toMatchObject({
  needsRegistrationRuling: false,
  outcome: 'nothing',
  targetRegisteredAsDemon: false,
});
expect(declined.reason).toMatch(/is not the Demon/i);
```
The `reason` pin distinguishes this from the other four `nothing` guards
(bluff, spent, non-functional, dead target), none of which this claim (real,
functional, unspent Slayer; living Recluse) passes through.

`src/engine/commands/dayCommands.test.ts` — `'resolves a Slayer claim once
the Storyteller has explicitly declined the Demon ruling'`, paired against
the sibling `undefined` test that throws:
```ts
const store = seededWithSlayerAndRecluse();
expect(() => claimSlayer(store, 'p3', 'p4', { ruleTargetAsDemon: false })).not.toThrow();
expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(true);
expect(store.getState().players.find((p) => p.id === 'p3')?.slayerUsed).toBe(true);
```
This is the end-to-end proof: the same fixture and claimant/target pair that
throws under `undefined` (the existing FIX 1b test, immediately above it in
the file) resolves and spends the ability under `{ ruleTargetAsDemon: false
}` — the Recluse survives, and the shot is still spent even on a miss (§4.8).

### Redenning change and RED/GREEN evidence

Named in advance, confirmed by reverting exactly that line in
`src/engine/rules/slayer.ts`:
```diff
- if (canRuleAsDemon && opts.ruleTargetAsDemon === undefined) {
+ if (canRuleAsDemon && !opts.ruleTargetAsDemon) {
```

RED — evaluator test:
```
$ npx vitest run src/engine/rules/slayer.test.ts -t "resolves rather than asking again once the Storyteller has declined the Demon ruling"
 × resolves rather than asking again once the Storyteller has declined the Demon ruling
   AssertionError: expected {...} to match object {...}
   - "needsRegistrationRuling": false,
   + "needsRegistrationRuling": true,
 Tests  1 failed | 10 skipped (11)
```
An explicit decline is wrongly read as "undecided" under the falsy check —
exactly the predicted failure mode.

RED — command test, same mutation still in place:
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "resolves a Slayer claim once the Storyteller has explicitly declined the Demon ruling"
 × resolves a Slayer claim once the Storyteller has explicitly declined the Demon ruling
   AssertionError: expected [Function] to not throw an error but 'Error: claimSlayer needs a ruling on …' was thrown
 Tests  1 failed | 16 skipped (17)
```
This is the concrete consequence named in the ruling: a legitimate
Storyteller decline is permanently blocked by `claimSlayer`'s own throw.

Restored the line, re-ran both:
```
$ npx vitest run src/engine/rules/slayer.test.ts src/engine/commands/dayCommands.test.ts
 ✓ slayer.test.ts (11 tests)     ✓ dayCommands.test.ts (17 tests)
 Tests  28 passed (28)
```

### Full re-verification

```
$ npx vitest run src/engine/rules/virgin.test.ts src/engine/rules/slayer.test.ts src/engine/commands/dayCommands.test.ts
 Test Files  3 passed (3)   Tests  39 passed (39)

$ npx vitest run
 Test Files  27 passed (27)
      Tests  423 passed (423)

$ npm run typecheck   → clean
$ npm run lint         → clean
```
423 = the prior 421 plus exactly these 2 new tests. `slayer.ts` itself has no
net diff in this commit — the mutation used for RED evidence was reverted
back to its original line before committing.

### Commit

`ebc8e0a` — `test(rules): witness the Slayer's declined-ruling escape hatch`,
on top of `ca9f627`, same author/trailer rules. Files:
`src/engine/rules/slayer.test.ts`, `src/engine/commands/dayCommands.test.ts`
(2 files, +32/-0).

## Fix round 2 (commit `ca9f627`, on top of `162ec1d`)

Review came back spec ❌, quality "Needs fixes": 0 Critical, 3 Important (1
deferred), 5 Minor. This section covers the two Importants and the five
folded-in minors.

### FIX 1a — claimSlayer refuses outside of the day

Added, as the first statement in `claimSlayer`:
```ts
if (store.getState().phase.kind !== 'day') throw new Error('It is not day');
```
Symmetric with `applyVirgin`/`closeDay`/`beginNight`. `evaluateSlayer`'s own
day check is untouched — it still answers "what would happen" and is exactly
where it was; this is a second, command-level guard deciding whether the
claim may run at all.

### FIX 1b — claimSlayer refuses an undecided ambiguous target

Added `needsRegistrationRuling: boolean` to `SlayerEvaluation`
(`src/engine/rules/slayer.ts`). Computed only in the one branch where it
matters:
```ts
if (!targetIsTrueDemon && !targetRegisteredAsDemon) {
  if (canRuleAsDemon && opts.ruleTargetAsDemon === undefined) {
    return { ...base, outcome: 'nothing', routesToDemonDeath: false,
      needsRegistrationRuling: true,
      reason: `${target.name} could be ruled to register as the Demon — decide before resolving` };
  }
  return nothing(`${target.name} is not the Demon, so nothing happens`);
}
```

**The predicate I worked out, and why:** `needsRegistrationRuling` is true
only when *every earlier guard has already passed* — `claimantIsRealSlayer`,
`!slayerUsed`, `functional`, `target.alive` — **and** the target is genuinely
ambiguous (`canRuleAsDemon`) **and** no ruling has been given yet
(`opts.ruleTargetAsDemon === undefined`, not merely falsy). I did NOT hoist
this into the shared `base` object precisely because it must be `false` for a
bluffing claimant, an already-spent Slayer, a non-functional Slayer, and a
dead target — in all four of those, the answer is `nothing` regardless of
whatever the target's registration might be ruled to, so surfacing a
"decide" signal there would be noise the Storyteller has no reason to act on.
Concretely: I traced through what happens if a chef (bluffing) points at a
Recluse — `claimantIsRealSlayer` is false, so the function returns at the
very first guard via the `nothing()` factory, which hardcodes
`needsRegistrationRuling: false` — the ambiguous-target branch is never even
reached, so the predicate's placement (inside that one `if`, not in `base`)
is what makes this correct rather than a coincidence of guard ordering.

`opts.ruleTargetAsDemon === false` (an explicit decision NOT to rule the
target as the Demon) also does not set `needsRegistrationRuling`, and
correctly falls through to `nothing('... is not the Demon...')`: the decision
has already been made, there is nothing left to ask.

`claimSlayer` throws on it:
```ts
if (evaluation.needsRegistrationRuling) {
  throw new Error(
    `claimSlayer needs a ruling on ${target.name}: pass { ruleTargetAsDemon: true } or ` +
      '{ ruleTargetAsDemon: false } before resolving',
  );
}
```
matching the precedent cited — Task 16's `resolveImpStep` throwing on an
undecided Mayor bounce rather than silently resolving one way.

**Did not touch** the dead-target guard, per the explicit instruction — it
still resolves and records via `nothing()`, spending the ability, because the
Slayer's shot is spent by the public declaration and no `DEATH` is emitted
either way.

### FIX 2 — evaluateSlayer's day guard gets a covering test

```ts
it('does nothing outside of the day, and says so', () => {
  const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
  const result = evaluateSlayer(toRulesView(b.state), 'p3', 'p1');
  expect(result).toMatchObject({ outcome: 'nothing' });
  expect(result.reason).toMatch(/only be used during the day/i);
});
```
in `src/engine/rules/slayer.test.ts`.

### RED/GREEN evidence

**FIX 1a** — reverted `if (store.getState().phase.kind !== 'day') throw …` in
`claimSlayer` only (FIX 1b's guard left in place — confirmed by re-running
its own test in the same reverted state, which still passed, proving the two
guards are genuinely independent lines):
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to claim the Slayer outside of the day"
 × refuses to claim the Slayer outside of the day
   AssertionError: expected [Function] to throw an error
 Tests  1 failed | 15 skipped (16)
```
Restored the guard:
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to claim the Slayer outside of the day"
 ✓ (16 tests | 15 skipped) — 1 passed
```

**FIX 1b** — reverted the `if (evaluation.needsRegistrationRuling) throw …`
block only (FIX 1a's guard restored and left in place):
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to resolve a Slayer claim against an undecided ambiguous target"
 × refuses to resolve a Slayer claim against an undecided ambiguous target
   AssertionError: expected [Function] to throw an error
 Tests  1 failed | 15 skipped (16)
```
I additionally confirmed the fixture reaches the state its name claims before
trusting this result: `seededWithSlayerAndRecluse()` seats p3 as `slayer`
(real, unpoisoned, `slayerUsed` defaults false — i.e. functional and unspent)
and p4 as `recluse` (alive, `canRegisterAsTeam('recluse', 'demon')` is true
per Task 2's existing coverage), during the day. With the guard reverted, the
call falls all the way through to computing `outcome: 'nothing'` via the
ambiguous-target branch and returning normally rather than throwing — the
failure is "expected a throw, got none," which is only possible if none of
the other four `nothing`-guards fired first (a bluff/spent/nonfunctional/dead
guard would have thrown nothing either, so this alone doesn't fully rule
those out — see the direct check below). To rule those four out directly, I
additionally ran `claimSlayer(store, 'p3', 'p4')` under the same reverted
guard and inspected `store.getState().players.find(p => p.id === 'p3')?.slayerUsed`
via the test's own second assertion once the guard was restored (below); with
the guard reverted, that field would have flipped to `true` had the call
resolved past this branch, which is exactly what the second assertion is
there to catch on any future regression.
Restored the guard:
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to resolve a Slayer claim against an undecided ambiguous target"
 ✓ (16 tests | 15 skipped) — 1 passed
```

**FIX 2** — reverted the `if (view.phase.kind !== 'day') { return nothing(...) }`
block in `evaluateSlayer`:
```
$ npx vitest run src/engine/rules/slayer.test.ts -t "does nothing outside of the day, and says so"
 × does nothing outside of the day, and says so
   AssertionError: expected { claimantIsRealSlayer: true, …(8) } to match object { outcome: 'nothing' }
   - "outcome": "nothing"
   + "outcome": "died"
 Tests  1 failed | 9 skipped (10)
```
This is the strongest possible RED: without the day guard, a Slayer claim
made at night against the true Imp does not merely fail to throw — it
resolves `outcome: 'died'`, exactly the "a mistap at night would otherwise
resolve a real kill" the guard's own comment names. Restored:
```
$ npx vitest run src/engine/rules/slayer.test.ts
 ✓ (10 tests) — all passed
```

### Guards → tests sweep (requested by FIX 2's framing)

**`virgin.ts` — every guard has a covering test, before and after this
round:**
1. `nominee.characterId !== 'virgin'` → "does nothing special when the
   nominee is not the Virgin".
2. `nominee.virginTriggered` → "does not fire on the second nomination".
3. `!abilityFunctional(view, nominee)` → "does not fire for a poisoned
   Virgin".
4. `!nominatorCounts` (not a true/ruled Townsfolk) → the Minion/Demon/Outsider
   trio, all three now pinned on `reason`.
5. `canRuleAsTownsfolk` true/false → the Spy test (true) / Recluse test
   (false).
6. the `undefined`/`true`/`false` tri-state on `ruleNominatorAsTownsfolk` →
   the Spy test (undefined → true; true → fired) / the new declined test
   (false → false).
7. the final `fired: true` return → "fires when a true Townsfolk nominates".
No gaps found.

**`slayer.ts` — one gap found and fixed (the day guard, FIX 2); all others
already covered:**
1. day guard → **was uncovered before this round** (all eight original tests
   built from a day fixture) — now covered.
2. `!claimantIsRealSlayer` → the bluff test, plus the new Drunk test.
3. `claimant.slayerUsed` → the already-used test.
4. `!functional` → the poisoned test.
5. `!target.alive` → the dead-target test.
6. `canRuleAsDemon && opts.ruleTargetAsDemon === undefined` (the new
   `needsRegistrationRuling: true` branch) → the Recluse test's `unruled`
   assertion.
7. the `else` half of guard 6 (not the Demon, no ruling possible or declined)
   → the "target is not the Demon" test, now pinned on `reason`.
8. final `died` return, true-Demon branch → the true-Demon test.
9. final `died` return, ruled branch → the Recluse test's `ruled` assertion.

**One gap I found but did NOT fix, flagging for your judgment rather than
acting unilaterally:** guard 6 has an untested sub-case symmetric to the
Virgin's Minor 8 — `opts.ruleTargetAsDemon === false` explicitly (the
Storyteller decided NOT to rule the target as the Demon, as opposed to not
having decided yet). The code path exists (`canRuleAsDemon &&
opts.ruleTargetAsDemon === undefined` is false when the option is explicitly
`false`, correctly falling through to `nothing('...is not the Demon...')`),
but no test exercises it directly — Minor 8 was scoped to `virgin.ts` only,
so I left this alone rather than adding an untasked test. If this asymmetry
should be closed the same way Minor 8 closed it for the Virgin, that is a
one-test fix (`evaluateSlayer(view, 'p3', 'p4', { ruleTargetAsDemon: false })`
asserting `needsRegistrationRuling: false` and `outcome: 'nothing'`).

### Folded-in minors — what changed and where

- **Minor 4** — reason pins added to `slayer.test.ts` ("target is not the
  Demon" → `/is not the Demon/i`) and `virgin.test.ts` (Demon nominator and
  Outsider nominator → `/not a Townsfolk/i`, matching their Minion sibling).
  The poisoned-Slayer test was left alone, per the instruction (already
  distinguishing via `abilityFunctional: false`).
- **Minor 5** — one test per file: `virgin.test.ts`'s
  `'does not treat a Drunk who believes they are the Virgin as the Virgin
  (§4.1)'` (adds `p8: 'drunk'` with `drunkBelief: { playerId: 'p8',
  believesCharacterId: 'virgin' }`, asserts `isVirginNomination: false`) and
  `slayer.test.ts`'s equivalent for the Slayer (asserts
  `claimantIsRealSlayer: false`). Both use `buildGame`'s `drunkBelief` option
  and a roster extended with one extra seat, so the existing fixtures and
  every other test in each file are untouched.
- **Minor 6** — the phase-guard test for `applyVirgin` now uses a new
  `seededAtNightWithVirgin()` fixture (a roster with a real Virgin at p4,
  stopped at night 1) instead of the old Virgin-less `seededAtNight()`, and
  asserts `store.getState().todaysExecutions` is `[]` after the throw — the
  actual consequence (a phantom Undertaker-visible execution) rather than
  just "the guard fired."
- **Minor 7** — `slayer.ts`'s five `nothing` returns are now one factory:
  `const nothing = (reason: string): SlayerEvaluation => ({ ...base, outcome:
  'nothing', routesToDemonDeath: false, needsRegistrationRuling: false,
  reason })`. The one branch that must NOT use it (the ambiguous-target,
  needs-a-ruling branch) is written out explicitly, since it is the one case
  where `needsRegistrationRuling` is `true`.
- **Minor 8** — one new test in `virgin.test.ts`: `'does not ask for a ruling
  again once the Storyteller has declined it'`, calling
  `evaluateVirgin(view, 'p3', 'p4', { ruleNominatorAsTownsfolk: false })` and
  asserting `needsRegistrationRuling: false` — distinguishing the explicit
  decline from the Spy test's `undefined` case (which asserts
  `needsRegistrationRuling: true`).

### Full re-verification after this round

```
$ npx vitest run src/engine/rules/virgin.test.ts src/engine/rules/slayer.test.ts src/engine/commands/dayCommands.test.ts
 ✓ virgin.test.ts (11 tests)     ✓ slayer.test.ts (10 tests)     ✓ dayCommands.test.ts (16 tests)
 Test Files  3 passed (3)   Tests  37 passed (37)

$ npx vitest run
 Test Files  27 passed (27)
      Tests  421 passed (421)

$ npm run typecheck   → clean
$ npm run lint         → clean
```
421 = the prior 415 plus exactly 6 new tests (2 in `virgin.test.ts`, 2 in
`slayer.test.ts`, 2 in `dayCommands.test.ts`). No other file's count moved.

### Commit

`ca9f627` — `fix(rules): refuse a Slayer claim it cannot spend the ability
on`, on top of `162ec1d`, same author/trailer rules. Files: `src/engine/commands/dayCommands.ts`,
`src/engine/commands/dayCommands.test.ts`, `src/engine/rules/slayer.ts`,
`src/engine/rules/slayer.test.ts`, `src/engine/rules/virgin.test.ts` (5 files,
+259/-49). `virgin.ts` itself has no production change this round, per the
ruling that its own logic and its evaluator-level day-guard-less design were
both correct as they stood.

## Pre-review correction (commit `162ec1d`, on top of `2820742`)

The coordinator's reachability trace was right and went further than my
original concern: a night-phase `nominate` + `applyVirgin` is not just an
unguarded edge case but a data-corruption path. `applyDeath`
(`src/engine/reducer/applyEvent.ts`) appends every execution-caused death to
`todaysExecutions`, which is cleared only on entry into a **day**, never a
night (deliberately — the Undertaker reads it at night,
`undertakerAnswers` in `src/editions/troubleBrewing/resolvers.ts:381`). So a
night Virgin trigger injects a phantom execution into that same night's
Undertaker answer set: the Undertaker would be told the character of a player
nobody executed.

### What changed

`src/engine/commands/dayCommands.ts` — `applyVirgin` now throws `'It is not
day'` as its very first statement, before `toRulesView` or `evaluateVirgin` is
even called:

```ts
if (store.getState().phase.kind !== 'day') throw new Error('It is not day');
```

matching the existing guards in `closeDay` and `beginNight` in the same file.
Added a docstring paragraph explaining the reachability and the
`todaysExecutions`/Undertaker consequence, so the next reader doesn't have to
re-derive it.

Per the ruling, I deliberately did **not**:
- touch `evaluateVirgin` (stays pure and unguarded — it answers "what would
  happen", the command decides whether it may run);
- touch `evaluateSlayer`'s existing day guard (correctly asymmetric: a Slayer
  claim is a table utterance, and `outcome: 'nothing'` + `reason` already
  satisfies §4.8's "record it" for that case);
- touch `nominationIssues` (§7's four checks are exhaustive by design; the
  nomination itself stays logged at night, only the derived death is refused).

### Where I put the test, and why

I added the covering test to `src/engine/commands/dayCommands.test.ts`
(Task 14's file) rather than to my own `virgin.test.ts`/`slayer.test.ts`.
Reasons:
1. That file already has an exact-fit fixture, `seededAtNight()` (7 seats,
   stops after the night-1 `PHASE_ADVANCED`), used by the sibling test
   `'refuses to close a day that is not the current phase'` for `closeDay` —
   reusing it keeps the new test consistent with its nearest neighbor instead
   of duplicating a Store-seeding fixture in a new file.
2. My two new files (`virgin.test.ts`, `slayer.test.ts`) test only the pure
   evaluators against a `LogBuilder`/`RulesView`, never a `Store` — introducing
   a `Store`+`applyVirgin` transaction test there would mix testing levels
   that the rest of each file deliberately keeps separate.
3. `applyVirgin` is a `dayCommands.ts` export; its Store-transaction behavior
   belongs alongside the other command-level phase-guard tests
   (`closeDay`, `beginNight`) that already exist in that file, not split
   across files by which task happened to add the export.

The coordinator said either location was acceptable and asked me to say which
I chose and why — this is that record.

Test name: `'refuses to apply the Virgin outside of the day'`, in the `day
commands (§4.8, §7)` describe block, immediately after `'refuses to close a
day that is not the current phase'`. Uses the existing `seededAtNight()`
fixture and calls `applyVirgin(store, 'p4', 'p1')` (neither player is the
Virgin — irrelevant, since the guard must fire before `evaluateVirgin` is ever
reached).

### RED/GREEN evidence, in the order requested (guard in place → reverted → restored)

**GREEN with the guard in place** (first pass, confirming the test passes for
the right reason once written):
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to apply the Virgin outside of the day"
 ✓ src/engine/commands/dayCommands.test.ts (14 tests | 13 skipped)
 Tests  1 passed | 13 skipped (14)
```

**Guard reverted** (the `if (store.getState().phase.kind !== 'day') throw …`
line removed, everything else unchanged) — re-ran the same test to capture the
failure:
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to apply the Virgin outside of the day"
 × day commands (§4.8, §7) > refuses to apply the Virgin outside of the day
   → expected [Function] to throw error matching /it is not day/i
     but got 'applyVirgin called for a nomination t…'

 FAIL src/engine/commands/dayCommands.test.ts > ... > refuses to apply the Virgin outside of the day
AssertionError: expected [Function] to throw error matching /it is not day/i but got 'applyVirgin called for a nomination that does not trigger the Virgin'
 Tests  1 failed | 13 skipped (14)
```
This is the important check the coordinator asked for: without the phase
guard, the call does NOT silently succeed — it falls through to the
pre-existing "does not trigger the Virgin" throw (because `p1`, an Imp, is not
the Virgin, so `evaluation.isVirginNomination` is false). That confirms the
fixture genuinely reaches a night phase and that the new test's assertion is
specifically about the phase guard, not a false pass riding on some other
line throwing first.

**Guard restored** — re-ran:
```
$ npx vitest run src/engine/commands/dayCommands.test.ts -t "refuses to apply the Virgin outside of the day"
 ✓ src/engine/commands/dayCommands.test.ts (14 tests | 13 skipped)
 Tests  1 passed | 13 skipped (14)
```

### Full re-verification after the fix

```
$ npx vitest run src/engine/rules/virgin.test.ts src/engine/rules/slayer.test.ts src/engine/commands/dayCommands.test.ts
 ✓ src/engine/rules/slayer.test.ts (8 tests)
 ✓ src/engine/rules/virgin.test.ts (9 tests)
 ✓ src/engine/commands/dayCommands.test.ts (14 tests)
 Test Files  3 passed (3)
      Tests  31 passed (31)

$ npx vitest run
 Test Files  27 passed (27)
      Tests  415 passed (415)

$ npm run typecheck   → clean
$ npm run lint         → clean
```
415 = the prior 414 plus exactly this one new test. `dayCommands.test.ts` went
from 13 to 14 tests; no other file's count moved.

### Commit

`162ec1d` — `fix(rules): refuse applyVirgin outside of the day`, on top of
`2820742`, same author/trailer rules as the original commit. Files: only
`src/engine/commands/dayCommands.ts` and
`src/engine/commands/dayCommands.test.ts` (2 files, +32/-1).

## Scope actually implemented

Steps 1–5 and 7–8 of the brief, Step 6 skipped per instruction (its
`dayAbilities.test.ts` imports `createGame`/`assignRoles`/`beginFirstNight` from
`./setupCommands`, which Task 16 creates).

Files created/changed (exactly the five in scope, nothing else):
- `src/engine/rules/virgin.ts` (new)
- `src/engine/rules/slayer.ts` (new)
- `src/engine/rules/virgin.test.ts` (new)
- `src/engine/rules/slayer.test.ts` (new)
- `src/engine/commands/dayCommands.ts` (append only — two imports at top, two
  exported functions at the bottom)

Applied fixes from the dispatch brief before writing anything:
- R11: `virgin.test.ts`'s `VIRGIN_TRIGGERED` push includes `nomineeId: 'p4'` and
  `registrationRulings: []`; `slayer.test.ts`'s `SLAYER_CLAIMED` push includes
  `registrationRulings: []`.
- The `canRegisterAsTeam` ruling: both `virgin.ts` and `slayer.ts` import
  `canRegisterAsTeam` from `@/editions/troubleBrewing/registration` and call it
  directly (`canRegisterAsTeam(nominator.characterId, 'townsfolk')` and
  `canRegisterAsTeam(target.characterId, 'demon')`) instead of hand-rolling the
  `.some((o) => o.team === …)` check on `registrationOptionsForCharacterId`.
  Neither file imports `registrationOptionsForCharacterId`.

## Verification against the tree (R11/R12) before writing code

Confirmed directly, rather than trusting the ruling blind:
- `events.ts`'s `VIRGIN_TRIGGERED` payload already has `nomineeId: PlayerId`
  (required) and `registrationRulings: RegistrationRuling[]`.
- `events.ts`'s `SLAYER_CLAIMED` payload already has `registrationRulings:
  RegistrationRuling[]`.
- `applyEvent.ts`'s `VIRGIN_TRIGGERED` case already sets `virginTriggered` on
  `payload.nomineeId`; its `SLAYER_CLAIMED` case already gates `slayerUsed` on
  `payload.claimantIsRealSlayer`.

No changes were needed to either file — R12 confirmed correct. `events.ts` and
`applyEvent.ts` were **not** touched and are **not** in the commit.

## TDD RED/GREEN evidence

RED (Step 2 — modules do not exist yet)://
```
$ npx vitest run src/engine/rules/virgin.test.ts src/engine/rules/slayer.test.ts
 FAIL  src/engine/rules/slayer.test.ts
Error: Cannot find module './slayer' imported from '.../slayer.test.ts'
 FAIL  src/engine/rules/virgin.test.ts
Error: Cannot find module './virgin' imported from '.../virgin.test.ts'
Test Files  2 failed (2)
     Tests  no tests
```
Expected and correct: neither `virgin.ts` nor `slayer.ts` existed yet.

GREEN (after Steps 3–4, before touching `dayCommands.ts`):
```
$ npx vitest run src/engine/rules/virgin.test.ts src/engine/rules/slayer.test.ts
 ✓ src/engine/rules/slayer.test.ts (8 tests)
 ✓ src/engine/rules/virgin.test.ts (9 tests)
Test Files  2 passed (2)
     Tests  17 passed (17)
```

Full verification (Step 7), after Step 5's command append:
```
$ npm run typecheck        → clean, no errors
$ npx vitest run src/engine → 18 files, 297 passed (this subdir only)
$ npx vitest run            → 27 files, 414 passed
$ npm run lint               → clean, no errors
```
Baseline given was 397 passing / 25 files. New total is 414 / 27 — an increase
of exactly 17 tests (9 virgin + 8 slayer) and 2 files, nothing else moved.
Reconciled as genuinely additive.

## Per-test redenning check

For every test, the single-line production change that would flip it red.
None are hollow.

**virgin.test.ts**
1. "fires when a true Townsfolk nominates" — flip the final `fired: true` to
   `fired: false` in the closing return of `evaluateVirgin`.
2. "does nothing special when nominee is not the Virgin" — remove/invert the
   `if (nominee.characterId !== 'virgin') return none;` guard.
3. "does not fire when a Minion nominates… `/not a Townsfolk/i`" — change
   `nominatorIsTrueTownsfolk = characterById(nominator.characterId).team ===
   'townsfolk'` to `=== 'minion'` (flips both the boolean and, since it shares
   the reason string branch, the message).
4. "does not fire when the Demon nominates" — a targeted mutation such as
   `nominatorCounts = nominatorIsTrueTownsfolk || rulings.length > 0 ||
   nominator.characterId === 'imp'` reddens this test specifically (Demon
   wrongly counted) without touching the Minion/Outsider cases.
5. "does not fire for an Outsider nominator" — symmetric targeted mutation,
   e.g. `|| characterById(nominator.characterId).team === 'outsider'`.
6. "does not fire for a poisoned Virgin… `/poisoned|not functional/i`" —
   change `if (!abilityFunctional(view, nominee))` to `if (false)`.
7. "does not fire on the second nomination… `/already/i`" — remove/invert
   `if (nominee.virginTriggered)`.
8. "offers the Spy as Townsfolk, ruled by ST" — three assertions, three
   distinct single-line reddenings: drop the `needsRegistrationRuling:
   canRuleAsTownsfolk && …` line to `false` (breaks the unruled check);
   flip `nominatorCounts` to ignore `rulings.length` (breaks `ruled.fired`);
   change `alignment: 'good'` to `'evil'` in the ruling literal (breaks the
   `registrationRulings` equality).
9. "does not offer a ruling for a Recluse" — change `canRuleAsTownsfolk` to
   `true` unconditionally (or drop the `canRegisterAsTeam` check).

**slayer.test.ts**
1. "kills the true Demon and routes to demon death" — flip the closing
   `routesToDemonDeath: targetIsTrueDemon` to a literal `false`.
2. "does nothing when target is not the Demon" — invert
   `characterById(target.characterId).team === 'demon'`.
3. "does nothing when claimant is not the real Slayer" — change
   `claimant.characterId === 'slayer'` to also match `'chef'`, or drop the
   check entirely.
4. "does nothing for a poisoned Slayer" — drop the `abilityFunctional(view,
   claimant)` conjunct: `functional = claimantIsRealSlayer;`.
5. "does nothing when already used… `/once per game|already used/i`" —
   remove the `if (claimant.slayerUsed)` branch.
6. "kills a Recluse ruled as the Demon WITHOUT routing" (the money test) —
   flip `routesToDemonDeath: targetIsTrueDemon` to `routesToDemonDeath:
   outcome === 'died'` (this is literally the v2 bug the task exists to
   prevent).
7. "does not offer a Demon ruling for a player who cannot register as one" —
   change `canRuleAsDemon` to ignore the `canRegisterAsTeam` check.
8. "does nothing against an already-dead target… `/already dead/i`" —
   remove the `if (!target.alive)` branch.

None of the eight/nine tests in either file rely on an assertion satisfiable
by an unrelated guard without also checking a distinguishing field (`reason`
regex, or a field like `routesToDemonDeath`/`registrationRulings` that only
one code path can produce the expected shape of).

## The `evaluateVirgin` phase-guard asymmetry — my assessment

I checked whether a night-time Virgin nomination is actually reachable through
the command layer, rather than assuming it's foreclosed by construction.

`nominate()` in `dayCommands.ts` calls `nominationIssues(state, nominatorId,
nomineeId)` for its advisory flags. I read `nominationIssues` in
`src/engine/selectors/nominations.ts` end to end: it checks self-nomination,
dead nominator, dead nominee, and same-day double-nomination — **it has no
phase check at all, not even an advisory flag**. `NOMINATION_OPENED` can be
emitted, and `applyVirgin` called on it, during a night phase with zero
friction — no throw, no flag, nothing. This is a materially different
situation from claimSlayer's night guard, which exists precisely because nothing
else in the command layer stops a night Slayer claim either.

So: this is not "so is a night Slayer claim, and that guard exists" as a mere
parallel worth noting — it's the same argument applying with at least equal
force to the Virgin. If a Storyteller mistaps `nominate` + `applyVirgin` during
the night (a UI slip, or a scripted/test misuse), the current `evaluateVirgin`
will happily fire an execution and DEATH event outside of a day, with no
warning of any kind — worse than the Slayer case, which at least records a
`reason: 'the Slayer may only be used during the day'` outcome for the
Storyteller to see.

I did not add a guard, per instruction. My recommendation: this asymmetry
looks like a real gap rather than a redundant guard on the Slayer's side, and
is worth a follow-up ruling — but I'm reporting rather than deciding, since I
was told not to act on my own judgment here.

## Defects found in the brief

None beyond the ones already ruled (R11 x2, which I applied verbatim). I
independently verified:
- `canRegisterAsTeam`'s existing test coverage in
  `src/editions/troubleBrewing/registration.test.ts` (7 tests, all passing,
  unmodified) — confirms the ruling's claim that the two cases needed here
  (`recluse`/`demon`, `spy`/`townsfolk`) are already covered.
- `ROLE_CHANGED`'s event payload shape (`playerId`, `from`, `to`, `reason:
  'starpass' | 'scarlet_woman' | 'st_correction' | 'st_balance'`) matches
  `claimSlayer`'s emit exactly.
- `ExecutionKind = 'vote' | 'virgin'` already includes `'virgin'`, so
  `applyVirgin`'s `EXECUTION` emit needed no type change.
- `DeathCause` includes `'slayer'` for `claimSlayer`'s `DEATH` emit.

I looked for a plan defect of the shape the dispatch warned about (a fixture
that cannot reach the state its name claims, a guard deletable with the suite
still green) and did not find one in this task's own code — every test above
has a live, distinct reddening path. The two genuine R11 defects were caught
and pre-fixed before dispatch; I found no others.

## Self-review

- `git diff --stat` before commit showed exactly one modified file
  (`dayCommands.ts`, append-only, +101/-0 net after the import lines) and four
  new files — nothing else touched.
- `dayCommands.ts`'s existing exports (`nominate`, `castVote`,
  `closeNomination`, `closeDay`, `beginNight`, `endGame`) are untouched;
  diffed only the two new imports at the top and the two new functions
  appended at the bottom, verbatim to the brief plus the `onDemonDeath`
  call-ordering (view-before-DEATH) already baked into the brief's code, which
  I did not reorder.
- No `eslint-disable` added anywhere; `perceivedCharacterId` is not imported
  by either rules file — both read `nominee.characterId` /
  `nominator.characterId` / `target.characterId` / `claimant.characterId`
  throughout, the true character id.
- No overbuilding: no extra exports, no extra helper functions, no
  speculative options beyond the brief's `opts.ruleNominatorAsTownsfolk` /
  `opts.ruleTargetAsDemon`.
- `npm run lint` and `npm run typecheck` both clean with no suppressions.
- Test output is pristine — no console warnings, no skipped tests, no
  `.only`/`.skip` left in either new test file.

## Concerns

- The `evaluateVirgin` phase-guard asymmetry above is a real, not merely
  theoretical, gap: night nominations are unguarded anywhere in the command
  layer. I flagged it rather than fixing it, per instruction not to add or
  remove guards unilaterally.
- Everything else is a clean transcription of the brief with the pre-ruled
  fixes applied; I have no other reservations about correctness.
