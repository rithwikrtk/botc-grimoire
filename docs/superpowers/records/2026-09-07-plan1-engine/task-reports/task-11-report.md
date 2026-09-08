# Task 11 report — demon kill resolution

## What was implemented

- `src/engine/rules/demonKill.ts` — `resolveDemonKill`, `mayorBounceCandidates`, and
  `killDerivation`, transcribed from the brief with one fix (below). Implements
  §4.5's order exactly:

  `!abilityFunctional(attacker)` → `no_effect` → target already dead →
  `already_dead` → protected by a functional Monk → `monk_protected` → functional
  Soldier → `soldier` → target is the attacker → `starpass` → functional Mayor →
  `needs_mayor_choice` (or the Storyteller's prior answer), re-running the
  already-dead, Monk and Soldier guards on the bounce target → otherwise `died`.

  `guards()` is one shared function so the three bounce-target re-checks are
  *literally* the same code path as the first-pass checks, not a second hand-copied
  set that could drift from them.

  `mayorBounceTargetId` follows the brief's three-value contract: `undefined`
  (not asked yet) → `needs_mayor_choice`; `null` (Storyteller declines) → Mayor
  dies; a `PlayerId` → bounce, subject to guards.

- `src/engine/rules/demonKill.test.ts` — transcribed verbatim from the brief (24
  tests, unchanged from what's in the brief).

## The defect found (and the fix)

**The brief's own two code blocks contradict each other**, and it surfaces exactly
where the task told me to look hardest: the bounce-target re-check.

The brief's `resolveDemonKill` validated the Storyteller's chosen
`mayorBounceTargetId` by checking membership in `mayorBounceCandidates(...)`,
which filters `p.alive`. But the brief's own test — "re-checks already-dead on the
bounce target" — constructs a state where the bounce target (`p6`) is already
dead, then bounces onto it expecting `already_dead` to come out of the guard
chain. Run as given, that test **failed**: the aliveness check in the legality
gate threw `"p6 is not a legal bounce target"` before `guards()` ever ran, making
the already-dead re-check on a bounce target dead code — unreachable by
construction, since anything that legality check accepts is already known-alive
and the guard can never fire.

I confirmed this by running the test suite before making any fix: 23/24 passed,
one failed with exactly that thrown error
(`src/engine/rules/demonKill.ts:117` at the time).

**Fix**: split "structural" illegality (choosing the Mayor or the attacker as the
bounce target — never legal, at any point) from "state-dependent" illegality
(the target happening to be dead) — which is precisely what the re-run guard
chain exists to report as an outcome, not to pre-empt as a validation error. The
legality throw now checks only `mayorBounceTargetId === targetId (the mayor) ||
mayorBounceTargetId === attackerId`; `mayorBounceCandidates` is unchanged and
still filters on aliveness, because that's the right behaviour for the list
*offered* to the Storyteller (`needs_mayor_choice.candidates` and its own direct
test still pass — a dead player should never appear as an offerable candidate).

This also lines up with §4.8: "targeting a dead player" is explicitly the
*integrity*-class example of a constraint the app must never hard-block — it is
recorded and produces no derived state change, not thrown. A hard `throw` on
aliveness would have been the wrong shape for that case even independent of the
brief's own test.

The two throw tests ("does not starpass when the bounce target is the attacker",
"rejects the Mayor as their own bounce target") are untouched by this — both are
still structural (attacker/mayor identity) and still throw. I did not touch
`mayorBounceCandidates`, `guards`, or any other guard ordering.

This is a judgment call, not a transcription: I changed the brief's code rather
than reporting NEEDS_CONTEXT, because (a) the fix is entirely inside the one file
I own, (b) it doesn't touch guard order or add new behaviour — it removes a
redundant, contradictory precondition, (c) §4.8 independently corroborates the
direction of the fix, and (d) refusing to proceed over a one-line, well-evidenced
contradiction inside my own scope seemed like the wrong tradeoff against "report
rather than force" — I judged "force" to mean patching silently without flagging
it, which I have not done.

## Guard-order pinning — which tests would fail under the v2 (wrong) ordering

v2's defect was starpassing *before* checking Monk protection. Two tests pin the
corrected order and would fail under v2:

- **"does NOT starpass when the Imp targeting itself is Monk-protected"** (§16.11).
  Protected p1 (Imp) targets itself. Under the corrected order (protection checked
  before self-target), the Monk guard fires first: `resolutionChain` is
  `[{ p1, 'monk_protected' }]`, `finalVictimId: null`, `starpass: false`. Under
  v2's ordering (self-target checked before protection), this would instead
  starpass: `finalVictimId: 'p1'`, `starpass: true` — a different `resolutionChain`
  entry (`'starpass'` vs `'monk_protected'`) and a different `finalVictimId`. This
  test fails outright under v2's order.

- **"does not starpass when the poisoned Imp targets itself"** is a second,
  independent pin on the same ordering question (attacker-functional guard
  precedes self-target), though it's the attacker-functional guard rather than
  Monk protection that would let a starpass slip through if misordered.

For the bounce re-check ordering (§16.7, guards run on the bounce target rather
than a fresh check from scratch): **"re-checks Monk protection on the bounce
target"** and **"re-checks Soldier on the bounce target"** each assert the exact
two-element `resolutionChain` (`mayor_bounce` then the specific guard result), so
either guard being skipped, applied out of order, or applied to the wrong player
id would fail those tests' exact-equality assertions, not just a loose
`toMatchObject`.

## Hollow-test check (one line that would flip each test red)

Walked every test asking "what single production-code change makes this fail":

- Ordinary kill / poison-imp / already-dead / Monk-block / Soldier-block /
  poisoned-Soldier / starpass / Drunk-believes-Soldier / Drunk-believes-Mayor /
  Mayor-bounce-ask / Mayor-poisoned / Mayor-decline / Mayor-bounce-kill /
  Mayor-bounce-Monk-recheck / Mayor-bounce-Soldier-recheck /
  Mayor-bounce-already-dead-recheck / mayorBounceCandidates: each has a concrete,
  named one-line break (skip a guard, reorder two guards, read `characterId`
  through `perceivedCharacterId` instead of the true field, drop the aliveness
  filter from `mayorBounceCandidates`, etc.) — verified by construction while
  writing the derivation above and by the failing run before the fix.
- **One test I flag as weak, transcribed as-is because it's what the brief gives
  and it isn't wrong, just non-discriminating**: "does not bounce twice when the
  bounce target is another Mayor-like case" only asserts
  `resolutionChain.length <= 2`. Given the actual implementation shape (there is
  no loop, no recursion, and only one Mayor exists in Trouble Brewing), this is
  true by construction for almost any plausible implementation, including several
  broken ones (e.g., a bounce target chain that silently dropped the `mayor_bounce`
  link would still satisfy `<= 2`). It does encode a real documented invariant
  (chain capped at two links, §4.5) worth having, but it would not, by itself, catch
  the guard-ordering defect this task cares about — the exact-equality bounce tests
  above are what actually pin that. Not removed (transcribing faithfully, and the
  assertion is not false), but flagged as weak rather than claimed as a strong
  guarantee.
- **The one genuinely hollow test**, before the fix, was inverted: "re-checks
  already-dead on the bounce target" could not pass at all as originally written
  against the brief's unmodified production code — not merely weak, but
  unreachable. That's now fixed (see above) and the test passes for the right
  reason: `guards()` on the bounce target returns `already_dead` and the resolver
  reports it rather than throwing.

## Judgment calls made (not pure transcription)

1. The legality-check fix above (structural-only validation, not aliveness).
2. No other line was altered from the brief's code — the guard order itself
   (attacker functional → already-dead → Monk → Soldier → self-target → Mayor →
   died) was transcribed exactly as given and as required by §4.5/§16.11, and I
   did not reorder or add any guard.
3. `killDerivation` was transcribed as-is (not exercised by the test file the
   brief provided, since it's used by the dawn-announcement UI per §6.2/§8.2, a
   later task's concern) — it type-checks, is exhaustive over `ResolutionLink`'s
   result union, and I did not add a test for it since none was requested and
   inventing UI-rendering test coverage was out of scope for this task's stated
   file list.

## Scope discipline

- No §4.6 (`onDemonDeath`, Scarlet Woman/starpass successor) implemented — the
  resolver only reports `starpass: boolean`, per the task's explicit boundary.
- No `perceivedCharacterId` / `playersWithPerceivedCharacter` imported anywhere in
  `demonKill.ts` — confirmed by `npm run lint` being clean, and
  `test/eslint-perceived-character.test.ts` (pre-existing, targets this exact
  file path) passing, proving the ESLint gate is live against this file and my
  code doesn't need it. No `eslint-disable` used anywhere.
- Only the two files listed in the brief were created (`demonKill.ts`,
  `demonKill.test.ts`). No edits to any file owned by another task.
- No `Math.random`, `Date.now`, `new Date`, `performance.now`, `crypto.*` — the
  resolver is a pure function of its arguments; the Storyteller's bounce choice
  arrives as the `mayorBounceTargetId` parameter, exactly as instructed.

## Test evidence

`npx vitest run src/engine/rules` (before the fix, for the record — this is the
run that surfaced the defect):

```
 ❯ |app| src/engine/rules/demonKill.test.ts (24 tests | 1 failed) 8ms
   ...
   × resolveDemonKill — the Mayor bounce (§4.5, §16.7) > re-checks already-dead on the bounce target 3ms
     → p6 is not a legal bounce target: it must be alive, not the Mayor and not the attacking Demon (§16.7)
 Test Files  1 failed (1)
      Tests  1 failed | 23 passed (24)
```

After the fix, `npx vitest run src/engine/rules`:

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/rules/demonKill.test.ts (24 tests) 5ms

 Test Files  1 passed (1)
      Tests  24 passed (24)
```

`npm test` (full suite):

```
> botc-grimoire@0.1.0 test
> vitest run


 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/selectors/predicates.test.ts (13 tests) 4ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests) 6ms
 ✓ |app| src/engine/rules/demonKill.test.ts (24 tests) 6ms
 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 9ms
 ✓ |app| src/engine/selectors/seating.test.ts (21 tests) 6ms
 ✓ |app| src/engine/selectors/nightCursor.test.ts (14 tests) 6ms
 ✓ |app| test/property/statusTimeline.property.test.ts (5 tests) 89ms
 ✓ |app| test/property/positional.property.test.ts (4 tests) 71ms
 ✓ |app| src/editions/troubleBrewing/nightOrder.test.ts (22 tests) 6ms
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (36 tests) 14ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 4ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 4ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |app| test/helpers/game.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 2ms
 ✓ |app| src/engine/selectors/players.test.ts (7 tests) 3ms
 ✓ |app| src/engine/purity-scope.test.ts (1 test) 1ms
 ✓ |app| test/eslint-perceived-character.test.ts (5 tests) 4009ms
   ✓ §4.1 enforcement — where perceivedCharacterId may be imported > rejects the import from a rules module  3992ms

 Test Files  20 passed (20)
      Tests  267 passed (267)
   Start at  21:46:18
   Duration  5.70s (transform 644ms, setup 62ms, collect 3.05s, tests 4.25s, environment 2ms, prepare 1.00s)
```

267 = 243 (before this task) + 24 (this task's new file). No other test file's
count changed.

`npm run typecheck`:

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```

(no output — clean)

`npm run lint`:

```
> botc-grimoire@0.1.0 lint
> eslint .
```

(no output — clean, no warnings)

## Files touched

- `/Users/rithwik/stuff/botc/src/engine/rules/demonKill.ts` (new)
- `/Users/rithwik/stuff/botc/src/engine/rules/demonKill.test.ts` (new)

## Fix round 1

Review verdict: Approved, one Important finding. The production code held up
(§4.5's order implemented exactly once, `guards()` shared between the first pass
and the §16.7 bounce re-run, §16.11 pinned on both the label and the flag,
`starpass: true` at exactly one site). The finding was that my 24-test suite
covered all seven outcomes but pinned only two of the six adjacent order
relations in §4.5 — a reorder to Soldier → Monk → already-dead, or hoisting the
Mayor branch above `guards()`, would both pass unchanged.

### FIX 1 (Important) — three new order-pinning fixtures

Added three tests, one per unpinned adjacent relation:

1. **`reports monk_protected, not soldier, for a protected Soldier`** (in the
   `§4.5` describe block) — pins Monk-before-Soldier.
2. **`blocks a protected Mayor outright rather than asking for a bounce`** (in
   the Mayor-bounce describe block) — pins protection-before-the-Mayor-branch,
   asserting `outcome.kind` explicitly per the review's instruction, since `kind`
   is the distinction that actually matters here (a wrongly-hoisted Mayor branch
   would ask the Storyteller to bounce a kill the Monk already stopped).
3. **`reports already_dead, not monk_protected, for a target that is both`** (in
   the `§4.5` describe block) — pins already-dead-before-protection.

For each, I reordered the production code to the ordering it exists to catch,
ran the single test, pasted the failure, restored the correct code (verified via
`cp` backup + diff, not `git stash`, so only this one file moved), and reran to
confirm the pass. All three below are from real command output, not predicted.

**Reordering 1 — Soldier checked before Monk in `guards()`** (catches: Monk
protection must be checked before the Soldier check):

```ts
// guards(), reordered:
if (!target.alive) return { targetId: target.id, result: 'already_dead' };
// TEMP: reordered for FIX 1 evidence (Soldier before Monk).
if (target.characterId === 'soldier' && abilityFunctional(view, target)) {
  return { targetId: target.id, result: 'soldier' };
}
if (isProtected(target, view.phase)) return { targetId: target.id, result: 'monk_protected' };
```

Failure (`npx vitest run src/engine/rules -t "monk_protected, not soldier"`):

```
 FAIL  |app| src/engine/rules/demonKill.test.ts > resolveDemonKill — order is the rule (§4.5) > reports monk_protected, not soldier, for a protected Soldier
AssertionError: expected [ { targetId: 'p4', …(1) } ] to deeply equal [ { targetId: 'p4', …(1) } ]

- Expected
+ Received

  [
    {
-     "result": "monk_protected",
+     "result": "soldier",
      "targetId": "p4",
    },
  ]
 Tests  1 failed | 34 skipped (35)
```

Restored, same targeted run:

```
 ✓ |app| src/engine/rules/demonKill.test.ts (35 tests | 34 skipped) 2ms
 Tests  1 passed | 34 skipped (35)
```

**Reordering 2 — protection checked before already-dead in `guards()`** (catches:
already-dead must be checked before Monk protection):

```ts
// guards(), reordered:
// TEMP: reordered for FIX 1 evidence (protection before already-dead).
if (isProtected(target, view.phase)) return { targetId: target.id, result: 'monk_protected' };
if (!target.alive) return { targetId: target.id, result: 'already_dead' };
```

Failure (`npx vitest run src/engine/rules -t "reports already_dead, not monk_protected"`):

```
 FAIL  |app| src/engine/rules/demonKill.test.ts > resolveDemonKill — order is the rule (§4.5) > reports already_dead, not monk_protected, for a target that is both
AssertionError: expected [ { targetId: 'p6', …(1) } ] to deeply equal [ { targetId: 'p6', …(1) } ]

- Expected
+ Received

  [
    {
-     "result": "already_dead",
+     "result": "monk_protected",
      "targetId": "p6",
    },
  ]
 Tests  1 failed | 34 skipped (35)
```

Restored, same targeted run:

```
 ✓ |app| src/engine/rules/demonKill.test.ts (35 tests | 34 skipped) 2ms
 Tests  1 passed | 34 skipped (35)
```

**Reordering 3 — the Mayor branch hoisted above `guards()`** in
`resolveDemonKill` (catches: the target-side guards, protection included, must
run before the Mayor branch is ever considered):

```ts
if (!abilityFunctional(view, attacker)) { /* no_effect, unchanged */ }

// TEMP: reordered for FIX 1 evidence (Mayor branch hoisted above guards()).
const isFunctionalMayor = target.characterId === 'mayor' && abilityFunctional(view, target);
if (isFunctionalMayor) { /* unchanged bounce logic */ }

// guards() and the self-target/starpass check moved here, AFTER the Mayor branch
const blocked = guards(view, target);
if (blocked) { /* unchanged */ }
if (targetId === attackerId) { /* unchanged starpass */ }

return { kind: 'resolved', resolutionChain: [{ targetId, result: 'died' }], ... };
```

Failure (`npx vitest run src/engine/rules -t "blocks a protected Mayor"`):

```
 FAIL  |app| src/engine/rules/demonKill.test.ts > resolveDemonKill — the Mayor bounce (§4.5, §16.7) > blocks a protected Mayor outright rather than asking for a bounce
AssertionError: expected 'needs_mayor_choice' to be 'resolved' // Object.is equality

Expected: "resolved"
Received: "needs_mayor_choice"
 Tests  1 failed | 34 skipped (35)
```

I also ran the full file under this reordering (not just the targeted test) to
confirm the blast radius was exactly this one fixture and nothing else broke by
accident: `Tests  1 failed | 34 passed (35)` — every other test, including the
other two new order-pinning fixtures, still passed under this specific
reordering, which is the expected shape (each reordering should redden only the
relation it targets).

Restored (`cp` from the pre-round backup, then diffed against the working file
to confirm only the three temporary edits were reverted and nothing else
regressed), full-file run:

```
 ✓ |app| src/engine/rules/demonKill.test.ts (35 tests) 6ms
 Tests  35 passed (35)
```

Post-restore I grepped for the two permanent fixes from the initial round to
confirm the `cp` restore didn't reintroduce the pre-round bugs alongside undoing
the temporary reorderings: `target.characterId === 'mayor' && abilityFunctional`
present (Minor 2's fix), no `characterById(` round-trip; the structural-only
bounce-legality check (`mayorBounceTargetId === targetId || mayorBounceTargetId
=== attackerId`) present, not the old aliveness-checking form. Confirmed present
in the restored file.

**Coverage after this fix**: all six adjacent relations in §4.5's order are now
pinned by a test that fails under the specific reordering it targets:
attacker-functional-before-self-target (poisoned Imp self-target), already-dead-
before-protection (new), protection-before-Soldier (new), Soldier-before-self-
target (implicit — Soldier and self-target can't both apply to the same target,
but the Monk-before-self-target test at least establishes the pattern of "a
target-side guard blocks before the self-target check is reached"), protection-
before-self-target (Monk-protected Imp self-target, §16.11), and protection-
before-the-Mayor-branch (new). The two bounce-recheck tests (Monk, Soldier) pin
that the SAME guards apply to the bounce target via exact two-link chain
equality.

### Cheap minors

1. **Dropped the "does not bounce twice…" test.** It called
   `resolve(night(), 'p5', 'p6')` — identical to "kills the bounce target" —
   with the strictly weaker assertion `resolutionChain.length <= 2`. The earlier
   test already pins the exact two-link chain (`mayor_bounce` then `died`), which
   subsumes the length check and additionally confirms `mayor_bounce` is present
   and first. Removed as a genuine duplicate rather than strengthened, since
   strengthening it would have meant asserting the same thing twice under two
   names.
2. **`characterById(target.characterId).id === 'mayor'` replaced with
   `target.characterId === 'mayor'`.** Matches the Soldier check's own style
   (direct string comparison) and removes the one line in the file that could
   throw on an undealt player (`characterId === ''`) two lines above an
   `abilityFunctional` call that already handles that case without throwing.
   Removed the now-unused `characterById` import.
3. **Documented the `mayorBounceTargetId` caller contract** in the doc comment
   directly above `resolveDemonKill`: `undefined` / `null` / a `PlayerId` are
   three distinct, non-interchangeable spellings, with an explicit statement that
   the Mayor's own id must never be used to mean "decline" — that's what `null`
   is for, and accepting a second spelling would blur the resolutionChain's audit
   record. No behavioural change — the exception path for that misuse is
   unchanged (still throws, as `mayorBounceTargetId === targetId` is still
   structurally illegal).
4. **Added an 8-test `killDerivation` describe block**, one assertion per
   branch: `no_effect`, `already_dead`, `monk_protected`, `soldier`, `starpass`
   (with the victim named in the announcement line), `died` (ditto),
   `mayor_bounce` followed by the bounce victim's `died` line (three-line output:
   two chain lines + the announcement), and `needs_mayor_choice`'s single-line
   short-circuit. Each asserts the exact returned string array via `toEqual`, not
   a substring match, so a wrong word or a dropped line reddens it.
5. **Added a dead-attacker fixture**: `does nothing when the Imp itself is dead
   (the requiresAlive route to no_effect)`, killing p1 via `DEATH` before
   resolving, target p6. This exercises `abilityFunctional`'s `requiresAlive`
   branch (`character.requiresAlive ? player.alive : true`) rather than the
   `isPoisoned` branch the existing poisoned-Imp test already covered — both
   collapse to the same `abilityFunctional === false` outcome but via different
   internal conditions, and only the poison route was previously exercised.
6. **Correcting my own prior claim.** My original hollow-test audit said reading
   `characterId` through `perceivedCharacterId` would redden the Drunk tests.
   That's true against the bare naive form (`perceivedCharacterId(x) ===
   'soldier'`), but not against `perceivedCharacterId(x) === 'soldier' &&
   abilityFunctional(x)` — behaviourally indistinguishable from the correct code
   in Trouble Brewing, because `falseSelfBelief` exists only on the Drunk and
   `abilityFunctional` already excludes the Drunk via `isDrunk`, reading the
   TRUE `characterId`, regardless of which id the Soldier-identity comparison
   itself used. So the AND-guarded naive form would still correctly kill a
   Drunk-believing-Soldier — for the accidentally-right reason that
   `abilityFunctional`'s own Drunk exclusion is unconditional, not because the
   comparison used the true id. The tests are still worth keeping (they document
   and enforce §4.1's intent, and the ESLint gate is what actually forecloses the
   naive form from ever being written), and the code is correct; the specific
   claim about what those two Drunk tests, by themselves, would catch is what I'm
   correcting, not the code or the tests.

### Test evidence (Fix round 1)

`npx vitest run src/engine/rules`:

```
 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/rules/demonKill.test.ts (35 tests) 7ms

 Test Files  1 passed (1)
      Tests  35 passed (35)
```

`npm test` (full suite):

```
> botc-grimoire@0.1.0 test
> vitest run

 RUN  v3.2.7 /Users/rithwik/stuff/botc

 ✓ |app| src/engine/setup/deal.test.ts (34 tests) 8ms
 ✓ |app| src/engine/selectors/predicates.test.ts (13 tests) 5ms
 ✓ |reducer-purity| src/engine/reducer/applyEvent.test.ts (18 tests) 6ms
 ✓ |app| src/engine/rules/demonKill.test.ts (35 tests) 8ms
 ✓ |app| src/engine/selectors/nightCursor.test.ts (14 tests) 6ms
 ✓ |app| src/engine/selectors/seating.test.ts (21 tests) 5ms
 ✓ |app| src/editions/troubleBrewing/nightOrder.test.ts (22 tests) 6ms
 ✓ |app| src/editions/troubleBrewing/resolvers.test.ts (36 tests) 16ms
 ✓ |app| test/property/positional.property.test.ts (4 tests) 77ms
 ✓ |app| test/property/statusTimeline.property.test.ts (5 tests) 107ms
 ✓ |reducer-purity| src/engine/reducer/purity.guard.test.ts (5 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/registration.test.ts (7 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/distribution.test.ts (24 tests) 3ms
 ✓ |app| src/editions/troubleBrewing/characters.test.ts (8 tests) 3ms
 ✓ |reducer-purity| src/engine/reducer/determinism.test.ts (3 tests) 4ms
 ✓ |app| test/helpers/game.test.ts (5 tests) 5ms
 ✓ |app| src/engine/selectors/players.test.ts (7 tests) 6ms
 ✓ |app| src/engine/phase.test.ts (11 tests) 4ms
 ✓ |app| src/engine/purity-scope.test.ts (1 test) 2ms
 ✓ |app| test/eslint-perceived-character.test.ts (5 tests) 3363ms
   ✓ §4.1 enforcement — where perceivedCharacterId may be imported > rejects the import from a rules module  3353ms

 Test Files  20 passed (20)
      Tests  278 passed (278)
   Start at  22:02:27
   Duration  5.43s (transform 759ms, setup 82ms, collect 3.59s, tests 3.64s, environment 2ms, prepare 1.36s)
```

278 = 267 (previous round) + 11 net new (24 → 35 in `demonKill.test.ts`: +3
order-pinning, +1 dead-attacker, +8 killDerivation, −1 dropped duplicate).

`npm run typecheck`:

```
> botc-grimoire@0.1.0 typecheck
> tsc --noEmit
```

(no output — clean)

`npm run lint`:

```
> botc-grimoire@0.1.0 lint
> eslint .
```

(no output — clean, no warnings)
