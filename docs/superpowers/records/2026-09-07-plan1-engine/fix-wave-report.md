# Plan 1 fix wave — report

Branch `main`, in place, no worktree, nothing pushed. Base `d6bafe9` (501 passed / 34 files).

**Final: `npx vitest run` = 538 passed / 34 files. `npm run typecheck` clean. `npm run lint` clean.**

Commits (all `rithwikrtk <rithwik@trypencil.com>`, all with the required trailer):

| sha | scope |
|---|---|
| `d01bc9f` | items 1, 2, 3, 4a, 4b, 4c + I6 |
| `3e7de1b` | items 5, 6 + C1 + I3 |
| `573cb33` | I5, I7, deferred-minor 4, F1/M3, the `onVictoryCheck` deletion |
| `HEAD` | ESLint test bootstrap flake |

Two whole-branch reviews landed on this branch. The first produced my original seven items; the
second overwrote `final-review.md` mid-wave and added C1 / I3 / I5 / I6 / I7 / F1 and two
deferred minors. Everything from both lists that was assigned to me is below.

**Three prescriptions were wrong when checked against the code.** They are items 4a, the
`onVictoryCheck` rename, and F1's stated reason. Each is written up where it belongs, and each
is a case where implementing the prescription would have shipped a test or a comment that
cannot fail — the defect shape this plan has 25 instances of.

Every mutation below was run against the working tree and then reverted; the tree is clean and
the suite is green at HEAD.

---

## 1 — `validateDeal` never constrained the Drunk's believed character to a Townsfolk

**Changed.** `src/engine/setup/deal.ts:358-366` — added, inside the existing `if (result.drunkBelief)` block:

```ts
if (characterById(result.drunkBelief.believesCharacterId).team !== 'townsfolk') {
  issues.push('The Drunk must believe they are a Townsfolk.');
}
```

with a comment naming the consequence (a believed `'imp'` makes `perceivedActors('imp')` return
the Drunk alongside the real Imp; the per-night `settleScope` means the real Imp is never offered
the step and the kill vanishes in silence).

**Covering tests.** `src/engine/setup/deal.test.ts` — two, deliberately split so neither clause can
stand in for the other:

- `rejects a Drunk who believes they are an evil character` — picks a Minion that is **not** in
  play, so only the team clause can produce a message, and asserts the in-play message is absent.
- `rejects a Drunk who believes they are a Townsfolk already in play` — picks a Townsfolk that
  **is** in play, so only the in-play clause can fire, and asserts the team message is absent.
  This is the "also pin the existing in-play check" half; the review found deleting it was
  SURVIVED.

**Red/green.**

Mutation A — delete the new team clause:

```
   × validateDeal > rejects a Drunk who believes they are an evil character 3ms
AssertionError: expected [] to include 'The Drunk must believe they are a Tow…'
      Tests  1 failed | 35 passed (36)
```

Mutation B — delete the pre-existing in-play clause:

```
   × validateDeal > rejects a Drunk who believes they are a Townsfolk already in play 3ms
AssertionError: expected [] to include 'The Drunk believes they are a charact…'
      Tests  1 failed | 35 passed (36)
```

Restored: `Tests  36 passed (36)`.

---

## 2 — the Undertaker offered no `registration` answer

**Changed.** `src/editions/troubleBrewing/resolvers.ts:378-427` — `undertakerAnswers` is now a
`flatMap`, and for each execution walks `registrationOptionsForCharacterId(execution.characterIdAtDeath)`,
emitting one `registration`-class answer per off-team option:

- key `` `undertaker:${execution.playerId}:${option.team}` ``
- value `[null, execution.playerId]` — the null-headed 2-tuple, so the command-layer guard
  `Array.isArray(value) && value[0] === null && !resolution.stChoice` fires and the Storyteller
  must record which token they showed
- `registrationRulings: [{ playerId, registersAs: option }]`, which is what makes `answer()`
  class it `registration`

Options are read off `characterIdAtDeath`, not off the player's current character.

**Covering tests.**

`src/editions/troubleBrewing/resolvers.test.ts`:
- `offers a registration answer per off-team option for an executed Recluse` — asserts the exact
  keys `['undertaker:p6:minion', 'undertaker:p6:demon']`, the class, the ruling, the display, and
  **the exact boolean the downstream guard evaluates**.
- `offers the Spy's good registrations to the Undertaker` — the other half of guide §1's "even if
  dead", and the case that proves the options come from `characterIdAtDeath` rather than a
  good/evil assumption.
- `offers no registration answer for an unambiguous executed character` — one canonical answer,
  nothing gained.

`src/engine/commands/answerClass.test.ts` — `records an executed Recluse ruled as a Minion in the
registration ledger`. This is the end of the route, not just the resolver's shape: a new
`seededForUndertaker()` fixture (the Investigator roster with p12 virgin → undertaker, still
7/2/2/1), executes the Recluse on day 1, walks to the Undertaker on night 2, resolves the
`undertaker:p10:minion` answer with an `stChoice`, and asserts

```ts
expect(store.getState().registrationHistory).toEqual([
  [{ playerId: 'p10', registersAs: { alignment: 'evil', team: 'minion' } }],
]);
```

which is the thing §16.6's contradiction check actually reads, and the thing `st_override` could
never have reached.

**Red/green.** Mutation — delete the whole options loop from `undertakerAnswers`:

```
   × undertakerAnswers (§16.5) > offers a registration answer per off-team option for an executed Recluse 8ms
   × undertakerAnswers (§16.5) > offers the Spy's good registrations to the Undertaker 1ms
   × answer classes (§4.3) > records an executed Recluse ruled as a Minion in the registration ledger 4ms
 Test Files  2 failed | 32 passed (34)
      Tests  3 failed | 535 passed (538)
```

Restored: `Test Files  34 passed (34) / Tests  538 passed (538)`.

---

## 3 — `eslint.config.js`'s barrel exemption (also deferred minor 38)

**Changed.** `eslint.config.js` — deleted the four-line entry, **the entry itself, not just its
comment**:

```js
      // The barrel re-exports perceivedCharacterId for its two sanctioned
      // consumers (wakes() and rendering); it must be able to do so itself.
      'src/engine/index.ts',
```

`npm run lint` is clean with it gone; the barrel imports neither restricted name.

**Covering test.** `test/eslint-perceived-character.test.ts` — `rejects a re-export of the
restricted names from the engine barrel`, following the file's existing probe pattern: lints
`export { perceivedCharacterId } from './selectors/players';` at file path `src/engine/index.ts`
and asserts `no-restricted-imports` and `§4.1` both appear.

**Red/green.** Mutation — restore the `'src/engine/index.ts'` entry to `ignores`:

```
   × §4.1 enforcement — ... > rejects a re-export of the restricted names from the engine barrel 6ms
AssertionError: expected '' to match /no-restricted-imports/
      Tests  1 failed | 6 passed (7)
```

Restored: `Tests  7 passed (7)`, `eslint .` exit 0.

---

## 4a — the dead-Butler exemption. **The prescription was wrong.**

The review said `if (!player.alive) return null;` at `nominations.ts:87` is "not dead code" — a
correct guard with no witness — and asked for a test.

It is dead code. `restrictedButlerMaster`'s very next line is
`if (!abilityFunctional(view, player)) return null;`, and `abilityFunctional` computes
`character.requiresAlive ? player.alive : true`. `butler.requiresAlive` is `true` (and
`characters.test.ts:28` sweeps every non-exempt character for it). So for a dead Butler the two
lines return null for identical inputs, and **no test can ever redden deleting the alive line.**

I verified this before writing anything: probing `voteIssues` with the alive line deleted, a dead
Butler with a live Master mark and an unvoted Master, returned `[]`. The prescribed test would
have gone green for a reason other than the one it names — which is what the evidence contract
exists to catch.

**Changed.** `src/engine/selectors/nominations.ts:81-95` — removed the redundant line and replaced
it with a comment stating both rules, naming `butler.requiresAlive` as the carrier, and recording
why the line went.

**Covering test.** `src/engine/selectors/nominations.test.ts` — `does not report a Butler who dies
during the day and then ghost-votes (§4.2, §7)`. The scenario the Master mark's lifetime makes
reachable and nothing covered: mark applied night 1 (expires end of day 1), Butler killed by a
Virgin execution during day 1, ghost-votes, Master never votes. It asserts the mark is still live
and the Butler is dead first, so it cannot pass vacuously, then asserts both `butlerViolations`
and `voteIssues` are clean. The existing sibling covers only `voteIssues` with a Butler who dies
before voting at all.

**Red/green.** With the redundant line gone, the `abilityFunctional` line is now the sole carrier
and is witnessed for the first time. Mutation — delete it:

```
   × ... > does not flag a poisoned Butler — their vote always counts 4ms
   × ... > does not restrict a dead Butler's ghost vote (§4.2, guide §12) 1ms
   × ... > does not report a poisoned Butler, whose vote always counts 0ms
   × ... > does not report a Butler who dies during the day and then ghost-votes (§4.2, §7) 1ms
AssertionError: expected [ { …(3) } ] to deeply equal []
AssertionError: expected [ 'p3' ] to deeply equal []
      Tests  4 failed | 32 passed (36)
```

Restored: `Tests  36 passed (36)`. Before this change, deleting **either** line alone left the
dead-Butler behaviour green. Now one line carries it and four tests stand behind it.

---

## 4b — `bySeat`'s sort, and with it the seating ring

**Changed (tests only).** `src/engine/selectors/seating.test.ts` — new describe block
`the ring is defined by seat, not by array position (§8.2, §18)`, built on a raw `LogBuilder` so
`GAME_CREATED.players` can be listed out of seat order (every `buildGame` fixture in the tree uses
`seat: index`, which is why the sort was a suite-green deletion).

The fixture is chosen so array order and seat order give a **different answer for every
assertion** — otherwise the test would be the same disease:

```
  array order:  empath  chef  imp   monk  poisoner soldier mayor
  seat:            2      3    0      4      1        5      6
  by seat:      imp  poisoner empath chef  monk  soldier mayor
```

By seat: the two evils are adjacent (1 Chef pair) and the Empath's neighbours are the Poisoner and
the Chef (Empath 1). By array position: evils two apart (0 pairs), neighbours the Mayor and the
Chef (Empath 0).

Four tests: the premise (`state.players` really is not seat-ordered), `bySeat` + `ringOrder`,
`aliveNeighbours` + `empathCount`, and `chefPairs`.

**Red/green.** Mutation — delete `.sort((a, b) => a.seat - b.seat)` from `players.ts:22`, full suite:

```
   × the ring is defined by seat, not by array position (§8.2, §18) > orders bySeat and ringOrder by seat 5ms
   × the ring is defined by seat, not by array position (§8.2, §18) > reads the Empath's neighbours off seats, not off array position 2ms
   × the ring is defined by seat, not by array position (§8.2, §18) > counts Chef pairs off seats, not off array position 1ms
 Test Files  1 failed | 33 passed (34)
      Tests  3 failed | 510 passed (513)
```

Nothing else in 513 tests reddens — confirming the review's SURVIVED result and that these three
are the only witnesses.

**Comment corrections.** Both existing assertions kept, both comments rewritten to say which claim
they stand for:

- `src/engine/commands/correctionCommands.test.ts:196-207` — states that `expect(player.seat).toBe(5)`
  stands for seat **immutability** only and cannot fail, that immutability is enforced by the
  absence of a write path, that the frozen event-catalogue test is what witnesses that absence,
  and that the ring-definition claim is covered by the new seating test.
- `test/property/advisory.property.test.ts:203-221` — same, plus an explicit correction: an earlier
  ledger note named this clause as the ring-definition witness; it is not.

---

## 4c — the backwards-`PHASE_ADVANCED` throw

**Changed (tests only).** `src/engine/reducer/applyEvent.test.ts` — `refuses a PHASE_ADVANCED that
goes backwards, or repeats the current phase`. Covers three inputs against `comparePhases(...) <= 0`:
backwards by number, backwards within a number (night 2 before day 2), and the `<= 0` boundary
(the same phase again) — plus the legitimate forward advance, so the guard is not merely
throwing at everything.

**Red/green.** Mutation — replace the condition with `false` (the review's exact mutation):

```
   × applyEvent — envelope and roster > refuses a PHASE_ADVANCED that goes backwards, or repeats the current phase 3ms
AssertionError: expected [Function] to throw an error
      Tests  1 failed | 22 passed (23)
```

Restored: `Tests  23 passed (23)`.

**Docstring fix.** `test/property/advisory.property.test.ts` — `play()`'s docstring no longer
illustrates the swallowed-error case with "a backwards `PHASE_ADVANCED`". It now says that was
wrong (`advance` computes `next` from the current phase, so the generator can never emit one) and
names `applyEvent.test.ts` as the real witness.

---

## 5 — `ROLE_CHANGED.reason`, folded into the demon-death extraction

**Changed.** New `src/engine/commands/emitDemonDeath.ts`:

```ts
export function emitDemonDeath(
  tx: Tx,
  deadDemonId: PlayerId,
  deadDemonCharacterId: CharacterId,
  outcome: DemonDeathOutcome,
): void
```

Four call sites now read `if (demonDeath) emitDemonDeath(tx, id, characterId, demonDeath);`:
`dayCommands.ts` (`closeDay`, `claimSlayer`), `nightCommands.ts` (`resolveImpStep`),
`correctionCommands.ts` (`recordDeath`). Net roughly −60/+70 lines including the new file's
docstring.

**The `onDemonDeath` call stayed at every call site**, as required — that is where §16.1's
pre-death-view contract lives, and the module docstring says so in as many words.

**Covering tests.** `src/engine/commands/nightCommands.test.ts`:
- the existing `promotes the Scarlet Woman on a starpass and does not end the game` now asserts
  the `ROLE_CHANGED` payload including `reason: 'scarlet_woman'` and `DEMON_DIED.successorReason`.
- the new `hands the Imp to the chosen Minion and records reason 'starpass'` (see I3) asserts the
  other arm.

**Red/green.** Mutation — invert the ternary in `emitDemonDeath.ts`, full suite:

```
   × resolveImpStep (§4.5, §4.6) > promotes the Scarlet Woman on a starpass and does not end the game 5ms
   × resolveImpStep (§4.5, §4.6) > hands the Imp to the chosen Minion and records reason 'starpass' 1ms
 Test Files  1 failed | 33 passed (34)
      Tests  2 failed | 517 passed (519)
```

Both arms of the expression are now witnessed. Before the wave, inverting it at all four sites
left 501/501 green.

---

## I3 — the starpass-with-a-chosen-successor path

**Changed (tests only).** `chosenSuccessorId` was passed by nothing in the tree. New helper
`toNightThreeImpWithNoScarletWoman` (kill the Scarlet Woman on night 2 so §16.9 cannot pre-empt
the starpass, leaving the Poisoner as the only living Minion) and three tests:

- `refuses a starpass with living Minions until a successor is named` — the `needs_successor_choice`
  throw, plus "nothing was committed by the refused call".
- `hands the Imp to the chosen Minion and records reason 'starpass'` — the only call site in the
  engine that can produce `reason: 'starpass'`.
- `accepts an explicitly declined starpass, which ends the game for good` — `chosenSuccessorId: null`
  (asked and declined) versus `undefined` (not asked).

**Red/green.** Mutation — delete the `needs_successor_choice` throw in `resolveImpStep`:

```
   × resolveImpStep (§4.5, §4.6) > refuses a starpass with living Minions until a successor is named 4ms
     → expected [Function] to throw an error
      Tests  1 failed | 31 passed (32)
```

---

## 6 + C1 — `closeDay` / `advanceToDay`

### C1 (Critical, from the second review) — a second `closeDay` executed the runner-up

Verified on this tree before touching anything. Seven players, threshold 4, two closed
nominations (p2 on 5 votes, p5 on 4):

```
after 1st close, dead: [ 'p2' ]
2nd close events:      [ 'DAY_CLOSED', 'EXECUTION', 'DEATH' ]
after 2nd close, dead: [ 'p2', 'p5' ]
todaysExecutions:      [ {p2, poisoner, vote}, {p5, monk, vote} ]
```

`closeDay` recomputes from the day's nominations; after the first close the top nominee is dead,
so `resolveDayExecution`'s `nomineeAlive` filter drops them and the runner-up becomes the unique
highest against its own frozen threshold. `DAY_CLOSED` was a reducer no-op, so no field of
`GameState` recorded that the day had closed and Plan 2 could not detect it either.

**Note that my brief's item 6 rationale was wrong about this.** It said the `nomineeAlive` filter
is "the only thing making a stray second `closeDay` harmless". The filter removes the player who
already died; it does nothing about the next one down. The `victory.status` guard does not close
this either — in the scenario above the game is still ongoing.

**Shape chosen: (a), a reducer-backed marker.** Reasons, since the coordinator asked:

1. The review's own framing is that half the defect is that *nothing in state says the day closed*,
   so Plan 2 cannot tell. Deriving it inside `closeDay` from `store.getEvents()` fixes the command
   and leaves that half open.
2. It is where the fact belongs. `todaysExecutions` is already a day-scoped derived field cleared
   on entry into a day; `dayClosed` sits on the same line, for the same reason, and reads the same way.
3. It is testable inside the `reducer-purity` project, where the stubs are armed.

Cost accepted: one new `GameState` field. It is not added to `RulesView`, so the edition layer and
§10.2's projection are untouched.

**Changed.**
- `src/engine/types.ts` — `dayClosed: boolean` on `GameState`, with the defect written into the doc comment.
- `src/engine/reducer/applyEvent.ts` — `initialState` seeds `false`; `DAY_CLOSED` returns
  `state.dayClosed ? state : { ...state, dayClosed: true }` (§3.5: a repeat hands back the identical
  object); `PHASE_ADVANCED` clears it on entry into a day. Pure — no clock, no randomness.
- `src/engine/commands/dayCommands.ts` — `closeDay` throws when `state.dayClosed`.

**Covering tests.**

`src/engine/commands/dayCommands.test.ts`, describe `closing the same day twice (§7)`:
- `does not execute the runner-up when the day is closed a second time` — **split from the throw
  assertion on purpose.** `.toThrow` short-circuits everything after it, so a single test would only
  ever report the missing throw, and the missing throw is not the defect. This one attempts the
  second close inside a `try {} catch {}` and then asserts p6 is alive, `todaysExecutions` is
  `['p2']`, `deaths` has length 1, and the log did not grow.
- `refuses the second close outright` — the throw.
- `closes the next day normally once the night has been begun` — the legitimate flow, and that
  `dayClosed` stays true through the night and clears on entry into day 2.
- `is undoable — undoing the close makes the day closable again`.

`src/engine/reducer/applyEvent.test.ts`:
- `records that the day closed, and clears it when the next day opens`.
- `returns the identical state for a repeated DAY_CLOSED (§3.5)` — `toBe`, not `toEqual`.

**Red/green.** Mutation — delete the `if (state.dayClosed) throw` guard:

```
 FAIL  src/engine/commands/dayCommands.test.ts > ... > does not execute the runner-up when the day is closed a second time
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/engine/commands/dayCommands.test.ts:419:74
    419|       expect(store.getState().players.find((p) => p.id === 'p6')?.aliv…
       |                                                                          ^

   × ... > refuses the second close outright 2ms
      Tests  2 failed | 20 passed (22)
```

`p6.alive === false` is the runner-up dying. That is the defect, reddened.

### Item 6 — the victory guards

**Changed.**
- `dayCommands.ts` — `closeDay` refuses `victory.status !== 'ongoing'` ("The game is over — there
  is no day left to close"), ordered before the already-closed check.
- `nightCommands.ts` — `advanceToDay` refuses the same ("The game is over — there is no next day"),
  with a comment noting it is not redundant with the step check below it, because `nextStep`
  returns null on a decided game and that check therefore *passes*.

Both match `beginNight`'s existing wording and error style.

**Covering tests.**
- `dayCommands.test.ts` — `refuses to close a day once the game is decided` (Saint executed, evil
  wins, second close).
- `nightCommands.test.ts` — `refuses to advance to day once the game is decided`, which first
  asserts `nextStep(...)` is null, so it proves the guard below would have let it through, and
  then asserts the phase did not move.

**Red/green.**

```
=== MUT: advanceToDay victory guard removed ===
   × resolveImpStep (§4.5, §4.6) > refuses to advance to day once the game is decided 4ms
     → expected [Function] to throw an error
      Tests  1 failed | 31 passed (32)

=== MUT: closeDay victory guard removed ===
   × day commands (§4.8, §7) > refuses to close a day once the game is decided 4ms
     → expected [Function] to throw error matching /game is over/i but got 'This day has already been closed — ca…'
      Tests  1 failed | 21 passed (22)
```

The second is worth reading: with the victory guard gone the *other* guard catches it, with a
different message — so the test distinguishes the two guards rather than passing on either.

---

## I5 — `victory.ts`'s invariant made structural

**Changed.** `src/engine/commands/store.ts` — a new `PHASE_INCOMPATIBLE_EVENT_TYPES` set
(`DEATH`, `EXECUTION`, `DEMON_DIED`, `ROLE_CHANGED`) and, before the victory check:

```ts
if (staged.some((e) => e.type === 'PHASE_ADVANCED')) {
  const outcome = staged.find((e) => PHASE_INCOMPATIBLE_EVENT_TYPES.has(e.type));
  if (outcome) { txCounter -= 1; throw new Error(...); }
}
```

Thrown before `events`/`state` are reassigned, so nothing commits, and the minted txId is handed
back the same way the async-body rejection does.

`src/editions/troubleBrewing/victory.ts:59-66` — row 2's comment no longer *promises* the
invariant; it points at the refusal that enforces it.

**Two existing fixtures were violating it** and are now split into two transactions each:
`store.test.ts`'s `passes dayClosed...` (a PHASE_ADVANCED plus four DEATHs) and my own
`answerClass.test.ts` Undertaker fixture (a DEATH plus a PHASE_ADVANCED). Both are now shaped like
the closeDay/beginNight split, which is the point.

**Covering tests.** `src/engine/commands/store.test.ts`, describe `the phase/outcome transaction
invariant (§4.7)`: a parameterised refusal over `DEATH` / `EXECUTION` / `ROLE_CHANGED` asserting
nothing committed and the phase did not move; the outcome-first ordering (the one that actually
causes the harm); and two negative cases proving the legitimate flows are untouched — a phase
advance alone, a phase advance alongside `DAY_CLOSED`, and an execution with no phase advance.

**Red/green.** Mutation — replace the outer condition with `false`:

```
   × ... > refuses a transaction staging a PHASE_ADVANCED and a DEATH 5ms
   × ... > refuses a transaction staging a PHASE_ADVANCED and a EXECUTION 0ms
   × ... > refuses a transaction staging a PHASE_ADVANCED and a ROLE_CHANGED 1ms
   × ... > catches the order that actually causes the harm, outcome first 0ms
      Tests  4 failed | 28 passed (32)
```

---

## I6 — the frozen event catalogue

**Changed (tests only).** `src/engine/reducer/applyEvent.test.ts` — describe
`the frozen event catalogue (§3.6, §18)`, with a `const EVENT_TYPES: Record<EventType, true>`
listing all 24 names, then:

- `is exactly these event types` — the snapshot, in `STEP_IDS`' style.
- `contains no event that moves a player between seats, or adds or removes one` — §18 stated as
  the property it actually is, plus a check that `PLAYER_RENAMED` is the only `PLAYER_*` event.

The `Record<EventType, true>` annotation makes it fail twice: adding or removing a payload key in
`events.ts` is a compile error here as well as a failing assertion.

**Red/green.** Mutation — add `PLAYER_RESEATED: { playerId: PlayerId; seat: number };` to
`GameEventPayloads`:

```
src/engine/reducer/applyEvent.test.ts(68,7): error TS2741: Property 'PLAYER_RESEATED' is missing in type
  '{ GAME_CREATED: true; ... }' but required in type 'Record<keyof GameEventPayloads, true>'.
src/engine/reducer/applyEvent.ts(476,13): error TS2322: Type '{ ... type: "PLAYER_RESEATED"; ... }'
  is not assignable to type 'never'.
```

And with the key added to the snapshot object too, so the compile error is satisfied:

```
   × the frozen event catalogue (§3.6, §18) > is exactly these event types 8ms
     → expected [ 'DAY_CLOSED', 'DEATH', …(23) ] to deeply equal [ 'DAY_CLOSED', 'DEATH', …(22) ]
   × the frozen event catalogue (§3.6, §18) > contains no event that moves a player between seats, or adds or removes one 1ms
     → expected [ 'PLAYER_RESEATED' ] to deeply equal []
      Tests  2 failed | 23 passed (25)
```

Both halves reddened. This is what stands behind §18's "there is no reseat/add/remove event".

---

## I7 — `nominate` surfaces the Virgin trigger

**Changed.** `src/engine/commands/dayCommands.ts` — `nominate` now returns
`TransactionResult & { nominationId: string; virgin: VirginEvaluation }`, evaluated against the
state before the nomination (the same answer, since `virginTriggered` is set by `VIRGIN_TRIGGERED`,
not by `NOMINATION_OPENED`). Signal only: `nominate` neither fires nor consumes the Virgin, and
emits nothing new.

**Covering tests.** `src/engine/commands/dayAbilities.test.ts`, describe `nominate surfaces the
Virgin trigger (§7, guide §11)`: a fired nomination (asserting the events are still just
`['NOMINATION_OPENED']` and `virginTriggered` is still false, so "signal only" is pinned); a
consuming-but-not-firing nomination; the ambiguous nominator (`needsRegistrationRuling`), which
required the Spy fixture — the Recluse's registration list never includes townsfolk, so the main
roster cannot reach that case at all; and the negative cases, an ordinary nomination and a spent
Virgin.

**Red/green.** Mutation — return a `virgin` with the three booleans forced false:

```
   × ... > reports a fired Virgin nomination without resolving it 6ms
   × ... > reports a trigger that consumes the ability without an execution 1ms
   × ... > reports the ambiguous nominator the Storyteller must rule on (guide §11) 1ms
   × ... > reports nothing for an ordinary nomination, and for a spent Virgin 1ms
      Tests  4 failed | 11 passed (15)
```

---

## Deferred minor 4 (must-fix) — the 22 ability texts

**Changed (tests only).** `src/editions/troubleBrewing/characters.test.ts` — describe
`the frozen ability texts (§3.8, guide §1)`: a code snapshot of all 22 strings, asserted per
character, plus a check that the catalogue's id set equals the snapshot's key set, so a character
added without a text is caught too.

**Red/green.** Mutation — change the Chef's text from "there are" to "there is":

```
   × the frozen ability texts (§3.8, guide §1) > are exactly these strings 3ms
     → expected 'You start knowing how many pairs of e…' to be 'You start knowing how many pairs of e…'
      Tests  1 failed | 8 passed (9)
```

---

## F1 / M3 — the `[null, id]` comment. **The stated reason was wrong; the shape is right.**

The value shape is unchanged, as instructed.

`resolvers.ts`' Ravenkeeper comment claimed a bare `null` "would leave that guard permanently
dead". That is false: `oneOfTwo` (Washerwoman / Librarian / Investigator) produces null-headed
tuples too and reaches the same guard, and `answerClass.test.ts`' `requires stChoice when a ruled
registration does not name the token` fires it **through the Investigator**, not through the
Ravenkeeper. Corrected to say what actually justifies the shape — the documented tuple contract
and consistency with `oneOfTwo`, so the command layer needs one rule rather than two — and to
record the correction.

`types.ts:223-236` — `LegalAnswer.value`'s contract now documents both tuple shapes
(`[characterId, a, b]` and `[characterId, playerId]`) and states that in both the head is null
when the Storyteller must pick the token, which is what the `stChoice` guard reads.

---

## `onVictoryCheck` — **deleted, not renamed. The prescription was wrong.**

Instruction was to rename `TransactionOptions.onVictoryCheck` to `__onVictoryCheck`, keeping it
because it is "§4.7's only once-per-transaction witness".

It is not a witness for anything. `grep -rn onVictoryCheck src/ test/` returns **only its
declaration, its two call sites, and one comment**. No test passes it. And `store.test.ts`'
`checks victory exactly once per transaction` explains, in a comment written by whoever built the
real witness, why it *could not* be one: the hook sits at the single commit call site, so it fires
once per transaction by construction and would count the same whether `checkVictory` ran once or
moved into `append` and ran per event. That test spies on the `checkVictory` module instead, which
is the only version that counts what §4.7 constrains.

So renaming it would have preserved dead production surface and stamped a false justification onto
it. Deleted: the field, both call sites, and the now-empty `else` branch. `store.test.ts`' comment
now records what was there and why it went. `typecheck`, `lint` and the suite are all clean without it.

If this is unwanted it is a three-line restore — but the evidence that it witnesses nothing is in
the repository, in writing, next to the test both reviews thought used it.

---

## Housekeeping — the ESLint test's bootstrap flake

Not on either list; found by running the suite. `test/eslint-perceived-character.test.ts`'s first
`it` pays ESLint's whole bootstrap (config resolution, plugin loading, the typescript-eslint
parser) inside the default 5s test timeout. On a loaded machine that is seconds: I saw it take
11.7s and time out, on a clean checkout as well as on mine. Which case pays it is just whichever
runs first, so the failure has nothing to do with what that test asserts.

Moved the cost into a `beforeAll` with a 120s timeout that lints a trivial warm-up file. Every
case is now a few milliseconds. Two consecutive full runs after the change: 538/538, 6.6s and 13.2s.

---

## Not done, and why

Only the assigned items were implemented. The second review's `final-review.md` also carries
**M4** (`effectSuppressed` and `STATUS_APPLIED.effective` disagree for a functional Monk pointed at
a corpse), **M5** (the `reducer-purity` project's coverage is bounded by two test files; several
reducer cases run only under the unarmed `app` project), **M6** (§16.8 overriding the guide's
optional execution — a confirmation question, not a defect), **M7** (no "end the night early"
command), and the remaining deferred-minor verdicts including the `eslint ^9.15.0` range bump
(item 2) and the `Object.isFrozen` coverage gap for `recluse`/`spy` (item 6). None were assigned
to me and none are Critical. M5 is the one I would put first in a Plan 2 window: it is the only
one that weakens an existing guarantee rather than adding a new one.
