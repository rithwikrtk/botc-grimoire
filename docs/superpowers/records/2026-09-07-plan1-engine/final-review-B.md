# Final whole-branch review — Plan 1 (engine), `3482dc8..d6bafe9`

Reviewed at HEAD `d6bafe9`, 38 commits, 79 files, ~30k insertions (12.8k of which is the
plan document itself). Read: the full spec (991 lines), the plan's Global Constraints,
the guide's night order / §10 voting / §11 Virgin / §15 rationale, every production file
under `src/`, `test/helpers`, all three property tests, the scripted game, and the answer-class
and barrel tests. Verified `npx vitest run` (501/34 green), `npm run typecheck`, `npm run lint`
— all clean, working tree untouched.

**Note on scope.** While I was writing this, four files changed in the working tree
(`resolvers.ts`, `resolvers.test.ts`, `deal.ts`, `deal.test.ts` — uncommitted, on top of
`d6bafe9`). I reviewed those too; see "Changes that landed during this review" at the end. The
findings below are against `d6bafe9` unless annotated. Suite is still green with them: 507/34,
typecheck and lint clean.

Beyond reading, I ran **five mutations** against a scratch copy of the tree (never this
checkout) to test whether guards and tests can actually fail. Results are cited inline; they
are the basis for two of the findings below and for accepting R5.

---

### Strengths

These are specific, and each one is a thing a task-scoped reviewer could have skipped.

1. **R5 is not just argued, it is proved.** I made `closeDay` emit `PHASE_ADVANCED` at the end
   of its own body — the faithful reading of §7's prose — and **8 tests reddened**, including
   both of the consequences the ruling names: `awards evil the game when a Saint is executed by
   vote` and `does not award the Mayor win when the Mayor is poisoned`. The single largest
   deviation from the spec's literal text is the best-witnessed decision in the branch.

2. **§4.4's inclusive expiry is heavily pinned.** Flipping `phaseOrdinal(now) <= …` to `<` in
   `src/engine/phase.ts:43` reddens **23 tests across 11 files**. This is the coin-flip the spec
   called out as silent-breakage-prone, and it is nailed down from the unit level up to the
   scripted game.

3. **The tests are honest about their own vacuity, in writing, at the assertion.**
   `test/property/advisory.property.test.ts:170-200` labels its two `aliveCount` clauses "PURE
   TAUTOLOGIES", explains *why* §4.8's literal wording is unwitnessable, and says which clauses
   are real. `test/scripted/fullGame.test.ts:230-243` says outright that the Monk arc does not
   witness protection and names the file that does. `answerClass.test.ts:210-216` says its
   `perceivedCharacterId` assertion is a positive case only and names the real witness. I have
   not seen a test suite that does this before; it is the single highest-leverage thing in the
   branch for whoever maintains it.

4. **`answerClass.test.ts:186-208` is the model for how to keep a guard fireable.** Rather than
   `if (!ruled) return;`, it *throws* with an explanation when the fixture stops producing a
   registration-class candidate. That converts a future silently-vacuous test into a loud one.

5. **The barrel is pinned in both directions.** `nightCommands.test.ts:519-563` asserts the exact
   set of 99 runtime keys (`Object.keys(api).sort()`), so a deletion *and* an addition both
   redden — a strictly stronger contract than the `in api` list it replaced. The paired test
   asserting `perceivedCharacterId` is *absent* turns §4.1's barrel-laundering route into a
   compile error rather than a lint question. That is the right call (see the R-audit below).

6. **The §4.1 ESLint rule is tested against the real linter at real file paths**
   (`test/eslint-perceived-character.test.ts`), including the same-directory `./players` case
   the glob patterns originally missed — found empirically, not by reading. Six cases, three
   positive and three negative. **Zero `eslint-disable`, zero `@ts-ignore`, zero `as any`**
   anywhere in `src/` or `test/`.

7. **The positional property tests use a genuinely independent reference.** `referenceEmpathCount`
   drops the dead *first* and takes ring-neighbours; `aliveNeighbours` walks outward one seat at a
   time. Two different methods, so a shared off-by-one cannot hide — exactly what §14 asked for
   on the ability it ranks highest-risk.

8. **`toRulesView` is built field-by-field with no spreads**, as §10.2 requires, and there is a
   test (`omits every private field the edition layer must not see`) that fails when a field
   leaks. `grimoireTokens` returns a projection *without* `effective`, so §10.1's "tokens, never
   effectiveness" is enforced by the type rather than by discipline.

9. **The store's transaction lifecycle is unusually careful for a first pass**: re-entrancy
   throws, `Tx` is sealed after the body returns, an `async` body is rejected rather than
   committing truncated, `undo` replays into a local before touching any field, and a
   staged-nothing transaction hands its `txId` back. `highestTxNumber` correctly derives from the
   max rather than the count, with the undo-gap reasoning written down.

10. **Every derived number ships its derivation** (§8.2) — `chefDerivation`, `empathDerivation`,
    `thresholdDerivation`, `distributionDerivation`, `killDerivation`, `demonDeathDerivation`,
    `victoryDerivation`, and per-answer `derivation` lines on every `LegalAnswer`. The Empath
    window even de-dupes at small ring sizes rather than printing one corpse twice.

11. **Do the 18 pieces compose into a game a storyteller can run?** Yes. The scripted game plays
    nine players from the deal through four nights and four days to a good win, including a
    daytime Scarlet Woman promotion notified the following night, and the log replays to the same
    state and undoes to nothing. That is the strongest single piece of evidence in the branch.

---

### Issues

#### Critical (Must Fix)

**C1. A second `closeDay` on the same day executes the runner-up nomination.**
`src/engine/commands/dayCommands.ts:118-176`, with `resolveDayExecution` at
`src/engine/selectors/nominations.ts:249-330`.

`closeDay` has a phase guard but no "already closed today" guard, and `DAY_CLOSED` is a reducer
no-op (`applyEvent.ts` case `'DAY_CLOSED': return state`) — so **no field of `GameState` records
that the day closed**. Calling it twice re-runs `resolveDayExecution`, which excludes the
already-dead top nominee via its `row.nomineeAlive` filter and then **promotes the runner-up to
unique-highest and executes them**.

Verified empirically (7 players, threshold 4; nomination A on 5 votes, nomination B on 4):

```
after 1st close, dead: [ 'p2' ]
2nd close events:      [ 'DAY_CLOSED', 'EXECUTION', 'DEATH' ]
after 2nd close, dead: [ 'p2', 'p5' ]
todaysExecutions:      [ {p2, poisoner, vote}, {p5, monk, vote} ]
```

Why it matters: a second player dies from one day's votes, `todaysExecutions` gains a phantom
entry the **Undertaker reads that night**, §4.7 row 4 is suppressed, and if the runner-up is the
Saint, **row 2 hands evil the game**. This is precisely the harm shape the Task 17 ruling closed
for `recordDeath('execution')` and the Task 15 ruling closed for a night-time `applyVirgin` — the
same defect, left open at the third door. It is reachable by one extra tap in the window between
`closeDay` and `beginNight`, which is the exact window Plan 2's win modal occupies, and Plan 2 has
no way to detect it because nothing in state or in the exported selectors says the day is closed.

The deferred-minors ledger records this as harmless ("Harmless today **only** because
`resolveDayExecution`'s `row.nomineeAlive` filter excludes the now-dead nominee"). **That
reasoning is wrong**: the filter excludes the nominee who already died; it does nothing about
the next one down.

Fix (no `GameState` change needed, so Plan 3's `SpyView` key partition is untouched):

```ts
// in closeDay, before opening the transaction
const events = store.getEvents();
const lastPhaseAdvance = events.map(e => e.type).lastIndexOf('PHASE_ADVANCED');
if (events.slice(lastPhaseAdvance).some(e => e.type === 'DAY_CLOSED')) {
  throw new Error('This day has already been closed — call beginNight (§7).');
}
```

This is malformed input from the app layer, not a table rule break: nothing has happened to
anyone, so it throws, on the same line the plan already drew six times. Add a test that closes
twice and asserts the second throws with the tree state unchanged.

#### Important (Should Fix)

**I2. `ROLE_CHANGED.reason` has no witness anywhere — inverting it at all four §4.6 call sites
leaves 501/501 green.**
`src/engine/commands/dayCommands.ts:169`, `:361`, `src/engine/commands/nightCommands.ts:413`,
`src/engine/commands/correctionCommands.ts:176`.

I replaced `successorReason === 'starpass' ? 'starpass' : 'scarlet_woman'` with the inverted
ternary at all four sites and the full suite stayed green (`Test Files 34 passed | Tests 501
passed`). No test in the branch asserts the `reason` field on a `ROLE_CHANGED` *produced by a
command* — the only `reason:` assertions are on hand-written fixture events.

Why it matters: `reason` is the permanent audit record of *how* the Demon changed hands. Plan 2's
log renders it. A game where the Imp starpassed to the Baron would read "scarlet_woman" forever,
and the branch has no way to notice. Three of the four sites carry long comments calling this "a
type narrowing, not a reachable branch" — which is true at those three sites, and precisely why
nobody looked at the fourth, `resolveImpStep`, where it *is* reachable and *is* wrong under
mutation.

Fix: one assertion in `nightCommands.test.ts` on the starpass path (see I3, which produces it for
free) plus one on the Scarlet Woman path already tested at `nightCommands.test.ts:453`.

**I3. The command-level starpass-with-a-chosen-successor path is entirely untested.**
`src/engine/commands/nightCommands.ts:328-333, 355-367`.

`ImpStepOptions.chosenSuccessorId` is never passed by any test in the tree (verified by grep:
every hit is inside `demonDeath.test.ts` calling `onDemonDeath` directly, or the four
`{ starpass: false, chosenSuccessorId: null }` call sites). Neither is the
`needs_successor_choice` throw at line 363. So the ordinary Imp starpass — self-kill, no Scarlet
Woman, hand the token to a living Minion — has **no end-to-end witness**, even though §14 Tier 2
lists starpass cases and `demonDeath.test.ts` covers the *rule* thoroughly.

I confirmed the path works (`resolveImpStep(store, { targetId: 'p1', chosenSuccessorId: 'p2' })`
→ `NIGHT_KILL_RESOLVED, DEATH, DEMON_DIED, ROLE_CHANGED{reason:'starpass'}`, p2 becomes the imp).
The code is right; there is simply nothing standing between it and a regression. Two `it` blocks
close I2 and I3 together: one asserting the throw when `chosenSuccessorId` is omitted, one
asserting the emitted `ROLE_CHANGED` payload including `reason: 'starpass'`.

**I4. The Undertaker is the only information resolver that offers no registration variants.**
`src/editions/troubleBrewing/resolvers.ts:378-397`.
**— ADDRESSED in the working tree during this review; I reviewed the fix and accept it. Kept
here for the record and because it is not yet committed.**

`undertakerAnswers` maps `todaysExecutions` to exactly one answer per execution, always
`characterIdAtDeath`. Every other resolver in the file offers the §4.3 cross-product: `chef`,
`empath` (via `alignmentCombinations`), `washerwoman`/`librarian`/`investigator` (via
`couldRegisterAs`), `fortune_teller`, and — deliberately, as of a Task 8 ruling — `ravenkeeper`.

The Recluse's own ability text, quoted verbatim in `characters.ts`, reads "You might register as
evil, and as a Minion or Demon, **even if dead**." An executed Recluse may legitimately be shown
to the Undertaker as a Minion. Today the Storyteller's only route is `st_override`, which (a)
mis-classes the answer — §4.3 reserves `st_override` for "you disagreed with the app", and §9
lists overrides separately as a *defect signal* — and (b) **never reaches
`registrationHistory`**, so §16.6's consistency check and Slice 2's registration ledger silently
lose the ruling. That is the exact failure the Task 16 fix (`FIX 6`, wiring the ledger into all
three producers) existed to close.

Fix: give `undertakerAnswers` the same treatment `ravenkeeperAnswers` already has — for each
execution, append one `registration`-class answer per non-true registration option, with
`value: [null, playerId]` so the existing `stChoice` guard fires and the token actually shown is
recorded.

**I5. `victory.ts`'s load-bearing in-code invariant is enforced by nothing structural.**
`src/editions/troubleBrewing/victory.ts:58-62`.

> "That scoping is safe ONLY because no command advances the phase in the same transaction as an
> execution — see the closeDay/beginNight split."

That is true today and, per my mutation, well witnessed *for `closeDay` specifically* (8 tests).
But it is stated as a global invariant over the command layer, and nothing checks it globally.
The barrel exports `createStore` and `Store.transaction`, so Plan 2 can compose a transaction
that emits both a `DEATH { cause: 'execution' }` and a `PHASE_ADVANCED`; row 2 would then silently
never fire and nothing in this branch would go red.

Fix (cheap, and it belongs in the store where the invariant lives): in `transaction`, before the
victory check, assert that `staged` does not contain both a `PHASE_ADVANCED` and any of
`DEATH`/`EXECUTION`/`DEMON_DIED`/`ROLE_CHANGED`, and throw naming §4.7. One test, and the comment
in `victory.ts` becomes a reference to an enforced rule rather than a promise.

**I6. The event catalogue has no frozen-list test — which is the real answer to the §18 question.**
`src/engine/events.ts`.

`STEP_IDS` gets a snapshot test (`is exactly this list, in this order`) precisely because renaming
one silently un-settles every saved game. `EventType` / `GameEventPayloads` gets nothing: grep for
`EventType` or `GameEventPayloads` in any `*.test.ts` returns zero hits.

This matters for the named §18 question. Seat immutability *is* enforced by the absence of a write
path — `seat` is assigned in exactly one place (`applyEvent.ts` `GAME_CREATED`) and there is no
reseat/add/remove event — and that is genuinely stronger than any test. But "there is no such
event" is itself an unwitnessed claim: adding `PLAYER_RESEATED` to the catalogue tomorrow reddens
nothing. A frozen list of the 24 event type names, tested as an exact set, is the honest witness
for §18 — it fails the moment a roster- or seating-mutating event is added, which is the actual
thing §18 forbids. It also pins §3.6's catalogue against the replay contract for free.

Do **not** add a seat-mutation test; there is nothing to mutate. Add the catalogue snapshot.

**I7. `nominate` gives Plan 2 no signal that a nomination triggers the Virgin.**
`src/engine/commands/dayCommands.ts:38-56`.

The Virgin fires only if Plan 2 independently calls `evaluateVirgin` after every single
nomination and then calls `applyVirgin`. Nothing in `nominate`'s return value, in the emitted
events, or in a selector says "this one is the Virgin". Forgetting the call is silent: no error,
no flag, and `virginTriggered` is never set, so the Virgin's ability survives to fire on the
*next* nomination against her — a wrong game state that reads as correct.

This is a cross-plan seam a task-scoped reviewer could not see. `applyVirgin` also does not check
that a matching `NOMINATION_OPENED` exists, so the two are unconnected in both directions.

Fix: have `nominate` return `{ ...result, nominationId, virgin: VirginEvaluation }` (it already
returns an extended object) so the trigger is impossible to miss at the call site.

#### Minor (Nice to Have)

**M1.** `advanceToDay` (`nightCommands.ts:421-433`) advances the phase after the game is decided,
while `beginNight` refuses. Verified: after a night-time `demon_dead` win, `advanceToDay` commits
`PHASE_ADVANCED` and the phase becomes day 2. §4.7's stated intent ("the night cannot continue
past the end of the game") is satisfied by `nextStep` returning null, but the asymmetry with
`beginNight` will read as a bug to Plan 2. Add the same `victory.status !== 'ongoing'` guard.

**M2.** `eslint.config.js:30-32` — the stale comment is the smaller half. The `ignores` entry for
`src/engine/index.ts` is now **actively harmful**: it means re-adding the two restricted names to
the barrel would not lint-fail. I verified that deleting the entry leaves `npx eslint .` clean
(exit 0). Delete both the comment and the entry; the boundary then has two independent guards
(lint + the barrel-key test).

**M3.** `types.ts:198-205` documents `LegalAnswer.value`'s tuple form as `[characterId, a, b]`.
The Ravenkeeper's ruled answers use a two-element `[null, target.id]`. The behaviour is right (see
the R-audit); the contract comment should mention the second shape, since it is the one the
`stChoice` guard keys off.

**M4.** `resolveStep` sets `effectSuppressed: step.effect !== null && !functional`
(`nightCommands.ts:146`) while `STATUS_APPLIED.effective` is `functional && targetAlive`
(`:161`). A functional Monk pointed at a corpse emits `effective: false, effectSuppressed: false`.
Both are defensible individually; together they will confuse whoever renders them. One line of
comment, or align them.

**M5.** The `reducer-purity` project's protection is bounded by the branch coverage of
`applyEvent.test.ts` + `determinism.test.ts`. Several reducer cases (`EXECUTION`, `DEMON_DIED`,
`VIRGIN_TRIGGERED`, `SLAYER_CLAIMED`, `NIGHT_KILL_RESOLVED`, `GAME_ENDED`, `SPY_*`) are exercised
only by the `app` project, where the stubs are not armed. Cheapest closure: extend
`determinism.test.ts`'s fixture log to cover the remaining types (it already covers ten).

**M6.** §7's "Execution is optional — the town can choose not to execute anyone" (guide §10) is
deliberately overridden by §16.8, and the engine follows §16.8. Confirming this is intentional
rather than a transcription slip; if a group plays the guide's way, `resolveDayExecution` has no
"skip" affordance at all.

**M7.** There is no "end the night early" command; `advanceToDay` throws while any step remains,
so a Storyteller who is done must tap `skipStep` once per remaining actor. Fine for the engine;
worth a note for Plan 2's night-overview screen.

---

### Deferred-minors triage

All 45, in file order. **must fix** = before merge · **should fix** = soon, Plan 2 window is fine
· **leave** = the deferred reasoning holds.

| # | Task | Item | Verdict | Why |
|---|---|---|---|---|
| 1 | 1 | `purity.setup.ts` redundant `afterEach` re-assignments | leave | Belt-and-braces on a harness; costs nothing. |
| 2 | 1 | `eslint ^9.15.0` resolves to a deprecated 9.39.5 | should fix | Dependency hygiene, but do it in one pass with Plan 2's React deps, not now. |
| 3 | 2 | `characters.ts` docstring described an empty `registration` array | leave | Already corrected in Task 2's fix round. |
| 4 | 2 | No assertion locks the 22 `abilityText` strings | **must fix** | Plan 2's Reference screen renders these verbatim with no second source, and two drift instances were already found *in the plan*. This is the same replay-contract argument that earned `STEP_IDS` a snapshot. A 22-line snapshot test, ~10 minutes. |
| 5 | 2 | `registration.test.ts:254` re-derives alignment inline | leave | Cosmetic; arguably better as an independent derivation. |
| 6 | 2 | `Object.isFrozen` test covers `washerwoman`, not `recluse`/`spy` | should fix | The uncovered case is the one that witnesses the factory's freeze. Two lines. |
| 7 | 3 | `phase.ts` future-application guard undocumented | leave | One comment; fold in if the file is touched. |
| 8 | 4 | Three reducer cases lack a no-change short-circuit | leave | All three are duplicate-event paths no command produces; §3.5 holds where it is observable. |
| 9 | 4 | Double `characterById` lookup at three sites | leave | Micro-optimisation on a path that runs once per tap. |
| 10 | 4 | `initialState()` claims `edition: troubleBrewing/0` pre-`GAME_CREATED` | should fix | `{ id: '', version: '' }` is honest and Plan 3's version-skew check (§12.4) reads this field. Cheap now, awkward later. |
| 11 | 4 | No idempotency guard on duplicate `NOMINATION_OPENED`/`NOTE_ADDED` ids | leave | Commands own id generation and both derive from the log. |
| 12 | 4 | `determinism.test.ts` purity assertion duplicates the double-reduce | leave | Redundant, not false — and see M5, which argues for *more* here, not less. |
| 13 | 7 | Dead defensive code mirrored in `seating.ts` and `reference.ts` | leave | The deferral reasoning is right: editing `reference.ts` for cosmetics risks the independence that is the whole point. |
| 14 | 7 | `ringOrder` left-neighbour assertion largely tautological | leave | The real guard is `voteOrder`'s test, which exists (`starts clockwise from the nominee's left and wraps`). The convention→table mapping is undecidable in code; §5.5's seating screen is the control. |
| 15 | 8 | `characterId === ''` guards dead while FT/RK/UT call `characterById` unguarded | leave | Confirmed unreachable: `beginFirstNight` throws before the deal, so no resolver ever sees an undealt seat. Asymmetry, not a defect. |
| 16 | 8 | Ravenkeeper drops extra targets | leave | Target *count* is bounded at the picker; §4.8's soft constraints govern *who*, not how many. |
| 17 | 8 | Stable-key test never exercises the Fortune Teller | leave | Already repaired in Task 8's fix round (the uniqueness half now covers it — that is how the duplicate-key bug was found). |
| 18 | 8 | Key-stability equality half cannot fail | leave | Same; folded. |
| 19 | 8 | `oneOfTwo` key collision if a character had two options on one team | leave | No TB character does, and the uniqueness test would catch a data change. |
| 20 | 8 | `washerwomanAnswers` Drunk exclusion redundant with `couldRegisterAs` | leave | Correctly kept: §6.4's Washerwoman/Librarian asymmetry is a rule, and the redundant set documents it at the point of use. |
| 21 | 9 | §15 night-order-rationale test cannot fail independently | leave | Redundant, not false. It carries the guide's rationale readably. Keep. |
| 22 | 9 | `export type { PlayerId }` re-export; edition barrel has zero importers | should fix | Delete the `PlayerId` re-export (dead). Keep the barrel — Plan 2 is its consumer. |
| 23 | 9 | **§6.2 `showCard` is singular; the Demon info step shows two cards; `'not_in_play'` is a declared variant no step uses** | **must fix — but in the spec, not the code** | See "Spec findings" below. The code's choice (carry the second card in prose + a comment at the point of use) was correct for mid-plan. Before Plan 2 starts, §6.2 must be amended to `showCards?: Array<…>` (or an explicit second field), because a UI driven off `showCard` will silently never render the bluffs card — and the Demon's three bluffs are the single most load-bearing piece of information evil receives all game. `'not_in_play'` existing-but-unused is the spec telling you what it meant. |
| 24 | 10 | Property 4 replays `playTrace` per `cut`, O(n²) | leave | 200 runs × maxLength 5. Immeasurable. |
| 25 | 10 | "poison active through day N" only exercises `actions[0]` | leave | It is the property that witnesses §4.4's `<=` boundary and it does so on every run. Budget spent well. |
| 26 | 10 | Two-trace comparisons lack a custom failure message | leave | fast-check's counterexample dump is adequate. |
| 27 | 11 | `killDerivation` is extra surface | leave | §8.2 mandates it; it is the dawn announcement's renderer. |
| 28 | 12 | `demonDeathDerivation`'s three `why` sub-cases, one asserted | should fix | Two more `expect`s. The three cases are three different game states and flattening them is wrong at the table. |
| 29 | 13 | **`onVictoryCheck` is a test-only hook on production `TransactionOptions`** | should fix | Keep it — deleting it costs the "checks victory exactly once per transaction" test, which is the only witness for §4.7's headline constraint, and there is no cheaper way to observe a call count. But **rename it `__onVictoryCheck` and mark it `@internal`**, so it cannot be mistaken for a subscription API by Plan 2. It is one field, it is inert in production, and the invariant it proves is the most important one in §4.7. |
| 30 | 13 | Repeated `undo()` has no floor; can strip history around a retained `SPY_VIEWED` | leave | The alternative (one Spy view disabling undo forever) is worse, as recorded. Plan 3 owns the audit-trail semantics. |
| 31 | 13 | Broken-predicate throw does not decrement `txCounter` | leave | Unreachable, and gaps are tolerated by design. |
| 32 | 14 | `butler_without_master` flag is never retracted once the Master votes | should fix — **in Plan 2, and write it down** | The engine is right (`butlerVotesFlagged` at close is authoritative). But the flag list will permanently disagree with the forensic record, and §16.3 says the whole point is not leaking the Butler. Plan 2 must render `RuleFlag`s of this rule with the caveat, or filter them once the nomination closes. Do not change `RuleFlag`'s shape now; add this to the Plan 2 handoff as a named requirement. |
| 33 | 14 | **`closeDay` is re-entrant across transactions** | **must fix** | This is C1. The recorded reasoning ("harmless because `nomineeAlive` excludes the now-dead nominee") is wrong; I reproduced a second execution of the runner-up. |
| 34 | 16 | `registrationLedger` compares only `registersAs.team`, ignores alignment | leave | §3.8 known-debt class; team determines alignment in TB. |
| 35 | 16 | Two contradictory rulings within one event never flagged | leave | No producer emits two rulings about one player in one event. |
| 36 | 16 | The §16.6 test is synthetic | leave | Correctly kept alongside the two realistic routes added in the same round. |
| 37 | 16 | `nightCommands.ts` is 386 lines / five responsibilities | leave | Cohesive. Extract `resolveAnswer` and `flagTargetIssues` only when §4.3 or §4.8 grow. |
| 38 | 16 | **`eslint.config.js` stale `ignores` comment for `src/engine/index.ts`** | **must fix** | See M2 — it is not just a stale comment. The `ignores` entry itself must go: with it, re-adding the restricted names to the barrel lints clean. I verified removing it keeps `eslint .` at exit 0. |
| 39 | 17 | `expect(player.seat).toBe(5)` cannot be reddened; §18's real witness | leave the assertion, **but see I6** | The self-correction in the ledger is right: Task 18's property test is the same strength, not stronger, and §18 is enforced by the absence of a write path. Keep the seat assertion as local documentation. The *missing* witness is not a seat test — it is the event-catalogue snapshot (I6), which fails when someone adds the reseat event that would create the write path. |
| 40 | 17 | `changeRole`'s `wouldDoubleDemon` duplicates the reducer guard | leave | Both directions are pinned by tests that fail if the copies disagree — the deferral reasoning is correct and is exactly the distinction that made Task 9's duplication acceptable too. |
| 41 | 17 | `addNote` with `scope: 'game'` and a `playerId` attaches it anyway | should fix | Throw, matching the symmetric `scope: 'player'` with no `playerId` check three lines above. Silently dropping the argument is the worse of the two alternatives named; refusing malformed input is the line this plan already draws. |
| 42 | 18 | `answersAtSeq` returns `[]` for a typo'd `stepId` and for an answer-less step alike | leave | Plan 2 passes a `stepId` off a real event; the coupling cost exceeds the benefit. |
| 43 | 18 | `expect(ruleFlags).toEqual([])` in the st_override test cannot be reddened | leave | Correctly kept as a forward guard for §4.3's "never warned", which has no other expression. |
| 44 | 18 | `expect(night2).not.toContain('poisoner')` near-tautological | leave | Harmless; the misleading comment was already fixed. |
| 45 | 18 | `play()` docstring still cites "a backwards `PHASE_ADVANCED` throws", unreachable here | should fix | One sentence, and this is the exact misleading-comment class the plan cut four times elsewhere. Fold in with anything else touching that file. |

**Named item not in the 45 — the demon-death emit block duplicated across four call sites**
(`closeDay`, `claimSlayer`, `resolveImpStep`, `recordDeath`): **the deferral reasoning is right,
and it is now the wrong reason.**

Right: `onDemonDeath`'s two throwing preconditions (true character is the Demon; the Demon is
still alive in the passed view) do guard §16.1 at every copy, so the *fact* is not duplicated —
only the shape. All four sites are correctly ordered `DEATH → DEMON_DIED → ROLE_CHANGED`, which
is what keeps the reducer's two-living-Demons guard from blocking the Scarlet Woman.

Now the wrong reason: I2 shows the duplication *did* cost something. The `reason:` ternary is
copied four times, three copies carry a comment explaining it is unreachable dead narrowing, and
the fourth — where it is live — inherited the comment's framing and never got a test. Duplication
of shape is how a live branch acquires a dead branch's reputation. Verdict: **leave the
duplication** (extracting it would force `commands/` to import a reducer-internal predicate or
vice versa, as recorded), but **close I2 and I3**, which is what the duplication actually cost.

---

### Rulings audit

70 rulings read. I accept all of them except the four below; silence on the rest is agreement.
Notably, I checked the load-bearing ones by mutation rather than by reading:

- **R5 (`closeDay` does not advance the phase) — accepted, and it is the best-evidenced decision
  in the branch.** The faithful mutation reddens 8 tests including both named consequences. §4.7's
  Transaction column is the more specific text and it governs; §7's clause is a summary. The one
  thing missing is structural enforcement of the invariant the ruling creates — that is I5, and it
  is a gap in the *implementation of* the ruling, not in the ruling.
- **"Malformed input throws; table breaks are recorded", all six sites — accepted, coherent at
  every one.** I checked each against §4.8's actual scope ("a broken rule everyone already acted
  on *has happened*"). `assignRoles` refuses a set nobody has been dealt yet, and the deliberate-
  imbalance escape hatch exists post-lock-in as `changeRole(..., 'st_balance')`. The Mayor-bounce
  throws refuse a Storyteller *choice* the app is making right now, not a table event, and §16.7
  names those two exclusions explicitly. `closeDay`/`applyVirgin`/`claimSlayer`'s phase guards
  each refuse a command whose only effect would be to inject state the table never produced (a
  phantom execution, a burned once-per-game shot). `clearStatus`/`addNote` refuse unknown ids.
  **None of the six refuses something real.** The distinction holds.
- **Task 16 (removing `perceivedCharacterId` from the barrel) — accepted, and it is stronger than
  the alternative.** Enumerating more lint patterns is an arms race against import-specifier
  spellings; removing the name means there is no specifier left to spell. The paired absence test
  plus the exact-key barrel test give it two witnesses. See M2 for the one loose end.
- **Task 17 (`recordDeath`'s `cause` narrowed to `'other' | 'demon' | 'slayer'`) — accepted.** The
  harm analysis is exactly right and is the same shape as C1. Ironically it is the ruling that
  best demonstrates why C1 must be fixed: the branch closed the phantom-execution door at
  `recordDeath` and at night-time `applyVirgin`, and left it open at `closeDay`.
- **R23/R24 (repair the fixture, not the script) — accepted, and the right instinct.** A fixture
  that cannot reach the state its name claims is worse than no test; repairing the roster
  preserves every downstream assertion that was traced against it. R24's diagnosis in particular
  (both branches of the Empath divergence yielding 1) is exactly the defect shape the brief warned
  about, caught before it shipped.
- **The self-correction about §18's witness — accepted, and it is the honest position.** Task 18's
  property test is the same strength, not stronger. See item 39 / I6 for what the real witness
  would be.

#### Flagged

**F1 — Task 8, the Ravenkeeper's `value: [null, target.id]`. Right answer, wrong stated reason,
and the reason matters.**

The recorded justification is: "a bare `value: null` would type-check but leave that guard
permanently dead, since `Array.isArray(null)` is false." **That is factually wrong.** The guard at
`nightCommands.ts:279` is exercised regardless of what the Ravenkeeper does, because `oneOfTwo`
already emits ruled answers with `value: [null, player.id, decoy.id]`
(`resolvers.ts:178-180`) — and the *only* test that fires the guard,
`answerClass.test.ts:186-208`, reaches it through the **Investigator**, not the Ravenkeeper.

The decision itself is correct on different grounds: the display says "a minion of the
Storyteller's choosing", so the record is incomplete without `stChoice`, and the two prior reviews
that prescribed a bare `null` would have left the Ravenkeeper as the one ruled answer that does
not demand it. Cost of the wrong reason: it is written into a code comment at
`resolvers.ts:411-417` that a future maintainer will trust, and it will lead someone to believe
that removing the Ravenkeeper's tuple breaks the guard — it does not, and they will be surprised
when the suite stays green. Fix the comment; keep the behaviour. (Also see M3: `types.ts` documents
only the three-element tuple form.)

**F2 — Task 14's deferral of `closeDay` re-entrancy. Wrong, and it is C1.**

Recorded as: "Harmless today **only** because `resolveDayExecution`'s `row.nomineeAlive` filter
excludes the now-dead nominee, which means that clause is load-bearing for more than its
documented purpose." The filter excludes the nominee who already died. It does not stop the
runner-up from becoming the unique highest and being executed on the second call, which I
reproduced. Cost: a second player dies, `todaysExecutions` gains an entry the Undertaker reads,
and a Saint runner-up hands evil the game — all silently.

**F3 — Task 9's `showCard` deferral. The engineering call was right; the *disposition* is
incomplete.**

Not changing the shape mid-plan was correct — nothing consumes `showCard` yet and a unilateral
interface change ripples into Plan 2 and §6.2. But routing it to "the final review" and to a
comment at the step is not a resolution, and Plan 2 will be written against §6.2 as it stands.
This needs a spec amendment *before* Plan 2 starts, not a comment. See "Spec findings".

**F4 — Task 13's `onVictoryCheck`, and Task 15's demon-death-duplication deferral, are both
"defer to the final review" items whose deferral note contains the answer.** Not wrong, but worth
naming as a pattern: three of the items the ledger routed to me
(`onVictoryCheck`, the four-site duplication, `showCard`) arrived with the analysis already
complete and only the verdict missing. That is a good failure mode — but it means the deferral
queue was partly a decision queue, and a decision queue with no owner grows. My verdicts on all
three are in the triage table above.

---

### Recommendations

1. **Fix C1 before merge.** Three lines plus a test. It is the only finding that produces a wrong
   game result at the table.
2. **Close I2 and I3 together** with two `it` blocks in `nightCommands.test.ts`. They cost ten
   minutes and they cover the branch's one genuinely untested command path.
3. **Add the two snapshot tests** that this branch's own precedent calls for: the 22 `abilityText`
   strings (deferred #4) and the event-type catalogue (I6). `STEP_IDS` already has exactly this
   treatment for exactly this reason.
4. **Delete `src/engine/index.ts` from `eslint.config.js`'s `ignores`** (verified clean). It costs
   nothing and restores the boundary.
5. **Amend §6.2 of the spec for `showCard` before Plan 2 is written** — see below.
6. **Carry three named requirements into the Plan 2 handoff**, not just into this file: the
   `butler_without_master` retraction (deferred #32), the `closeDay` → win-modal → `beginNight`
   two-call sequence, and the `nominate` → `evaluateVirgin` → `applyVirgin` sequence (I7, ideally
   fixed in the engine instead).
7. **Consider the store-level phase/death invariant (I5)** as the durable form of R5. It converts
   the branch's biggest deviation from "correct and well-tested today" into "structurally
   unbreakable".

#### Spec findings (defects in the spec or plan, not the implementation)

- **§6.2's `showCard` is singular and cannot express the Demon info step**, which shows two cards
  (guide §3, first night, step 3: "These are your minions" *and* "These characters are not in
  play" with the three bluffs). `'not_in_play'` is a declared variant that no step sets, which is
  strong evidence §6.2 intended it here and lost the plurality. The implementation's handling is
  right for mid-plan; **the spec is what needs the fix**, before Plan 2 renders a Demon info step
  that never shows the bluffs.
- **§7 vs §4.7 on `closeDay` advancing to night** — a genuine spec self-contradiction, correctly
  resolved in favour of §4.7 (R5). §7's sentence should be amended to say "…runs `checkVictory`,
  and offers *Begin night*", so the next reader does not re-litigate it.
- **§7/§16.8 vs guide §10 on execution finality** — the spec deliberately overrides the guide
  ("Execution is optional"). Intentional, but worth an explicit note in §16.8 that it diverges
  from the guide, since the guide is the domain source of truth everywhere else.
- **§4.8's "no sequence of flagged events can make `aliveCount` negative"** is unwitnessable by
  construction: `aliveCount` is derived by the same filter any test would use, and `GameState`
  holds no counter to corrupt. The advisory property test says so at the assertion. The spec
  clause should be reworded to the two clauses that *are* witnessable (no two living Demons; no
  `DEATH` for a dead player), or dropped.

---

### Changes that landed during this review

Four files changed in the working tree after I began (uncommitted, on top of `d6bafe9`). I read
both diffs in full and re-ran the suite, typecheck and lint: **507 tests / 34 files, all clean**.

**1. `undertakerAnswers` now enumerates registration answers — this is exactly I4, and the fix is
right.** `resolvers.ts:378-428` switches to `flatMap` and appends one `registration`-class answer
per off-team option, keyed `undertaker:<playerId>:<team>`, valued `[null, execution.playerId]` so
the `stChoice` guard at `nightCommands.ts:279` fires, with the ruling attached so it reaches
`registrationHistory` and §16.6's contradiction check. Shape matches `ravenkeeperAnswers` exactly,
which is what I would have asked for. Three tests: the Recluse's two evil options, the Spy's two
good options, and — the one that matters most — `offers no registration answer for an unambiguous
executed character`, which is the assertion that fails if someone later widens the loop. The
canonical answer stays first, so `answers[0]` is still the plain true answer. Accepted; I have no
further comment. **I4 can be struck once this is committed.**

**2. `validateDeal` now rejects a Drunk who believes an off-Townsfolk character** (`deal.ts:358-365`).
This closes a real gap I did **not** find, and it is a good one. `deal()` itself only ever picks
from `charactersByTeam('townsfolk')`, so the hole was reachable only through a hand-edited or
imported deal (§5.3's "Edit / legality re-validated", and Plan 3's import) — but the consequence
is severe and silent: a Drunk who believes `'imp'` joins `perceivedActors('imp')`, the Imp step's
`settleScope: 'per-night'` means `nextStep` takes `actors[0]`, and if the Drunk sits at a lower
seat **the real Demon is never offered the kill for the rest of the game**, with
`abilityFunctional` false on the Drunk so every night resolves to `no_effect`. The two paired
tests are well constructed: each fixture isolates one clause (a not-in-play Minion for the team
clause, an in-play Townsfolk for the in-play clause) and asserts the *other* message is absent, so
neither line can stand in for the other.

One nit on the new comment at `deal.ts:358-362`: "because **every** night step is `per-night`
scoped" is wrong — `settleScope` defaults to `per-actor` and the Imp is the sole override
(`nightOrder.ts:79-84`). The reasoning is right *for the Imp*, which is the case that matters;
the sentence overstates. One word: "because the **Imp** step is `per-night` scoped".

**3. `answerClass.test.ts` gained a `seededForUndertaker` fixture** (p12 virgin -> undertaker,
still 7/2/2/1) driving the executed-Recluse ruling through `resolveStep` — the command-layer end
of the same route. Right instinct: the resolver test alone would not prove the `stChoice` guard
fires on this new answer shape.

**Caveat on tree state.** Editing was still in progress when I finished: at my last run the suite
was **1 failed / 507 passed (508)**, inside that new `answerClass.test.ts` block. That is
work-in-progress, not a finding — but it means my "501/34 green" verification applies to
`d6bafe9`, and whoever merges must re-verify the tree.

Neither change affects any other finding in this review. C1 is untouched and still blocks.

### Assessment

**Ready to merge?** With fixes

**Reasoning:** The engine is genuinely well built — the hard invariants (§4.1's boundary, §4.4's
inclusive expiry, §4.7's once-per-transaction victory check, R5's phase split) are not merely
implemented but proved under mutation, and the 18 tasks compose into a nine-player game that plays
to a good win and replays and undoes cleanly. One Critical defect blocks merge: a second
`closeDay` executes the runner-up nomination, which is silent, reachable by one extra tap, and can
hand evil the game off a Saint. Fix C1, close the two starpass coverage gaps (I2/I3) and the
`eslint` `ignores` entry (M2), commit the two fixes already sitting in the working tree, and this
is ready.
