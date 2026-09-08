# SDD ledger — plan: docs/superpowers/plans/2026-09-07-botc-slice1-plan1-engine.md

Spec: docs/superpowers/specs/2026-09-07-botc-storyteller-app-design.md (v3.1, reachable).
Spec is the binding authority; the plan is its argument.

Workspace decision: Rithwik chose **work in place on `main`** (no worktree), asked
2026-09-07. Plan doc committed to main first (b204156). `.superpowers/` git-ignored (6cc51ae).
Baseline: repo had no package.json / src / tests before Task 1 — there was no baseline
suite to run. Task 1 establishes it.

## Pre-flight scan

### Cross-task rows — every pair sharing a file or an interface

| Pair | Producer → consumer | Found |
|---|---|---|
| T1 → T6 | `eslint.config.js` created / modified (adds perceived-character rule) | clean, sequential |
| T1 → T6 | `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` created / modified (`paths`) | clean; T6's Files list omits them (row S3) |
| T2 → T3 | `Team`/`Alignment`/`TeamCounts` | clean |
| T2 → T5 | `INFO_THRESHOLD_PLAYERS` — T2's Interfaces list omits it | body defines it in T2. clean |
| T3 → T5 | `DrunkBelief` — T3's Interfaces list omits it | body defines it in T3. clean |
| T3 → T6,7,8,9,11,12,14,16 | `RulesView`, `RulesViewPlayer` — T3's Interfaces list names neither | body defines both in T3 `types.ts`. clean |
| T4 → T11,T16 | `ResolutionLink` — T4's Interfaces list omits it | body defines it in T4 `events.ts`. clean |
| T4 → T9 | `applyEvent.ts` created / modified (`demonNotified` on the dealt Demon) | clean, sequential; T9's header calls it out |
| T4 → T6,7,10,13.. | `test/helpers/game.ts` `LogBuilder`/`buildGame`/`advanceTo` | clean |
| T6 → T7 | `bySeat`, `alive` — T6's Interfaces list omits `bySeat` | body defines it in T6 `players.ts`. clean |
| T6 → T16 | `grimoireTokens` — T6's Interfaces list omits it; T16's barrel test asserts it | body defines it in T6 `statuses.ts`. clean |
| T7 → T8 | `chefPairs`/`empathCount` + derivations feed `chefAnswers`/`empathAnswers` | clean |
| T12 → T13 | `checkVictory`, `VictoryContext { dayClosed }` — commit-time victory | clean. `VictoryContext` stays one field on purpose: the closeDay/beginNight split makes victory phase-sensitive with no plumbing (deviation 9) |
| T13 → T14,15,16,17 | `Store`/`Tx`/`TransactionResult` | clean |
| T14 → T15 | `dayCommands.ts` created / appended (`applyVirgin`, `claimSlayer`) | clean, sequential |
| T14 → T16 | `beginNight`, `butlerViolations` — T14's Interfaces list omits both; T16's barrel test asserts `beginNight` | bodies define both in T14. clean |
| **T16 → T15** | T15's `dayAbilities.test.ts` imports `createGame`/`assignRoles`/`beginFirstNight` from `./setupCommands`, created in **T16** | **DEFECT — backwards dependency. Ruling R1** |
| **T17 → T16** | T16's barrel `src/engine/index.ts` exports from `./commands/correctionCommands`, created in **T17** | **DEFECT — forward reference. Ruling R2** |
| **T18 → T16** | T16's barrel exports `answersAtSeq` from `./selectors/replay`, created in **T18**; T16's barrel-completeness test asserts the name | **DEFECT — forward reference. Ruling R2** |
| T16 → T18 | `resolveAnswer` / `answerKey` validation, tested by T18's `answerClass.test.ts` | clean. T18 Step 1 states T16 owns the enforcement; T18's Files line claiming it modifies `nightCommands.ts` is stale (row S4) |
| T16 → T17,T18 | `src/engine/index.ts` is the single import surface | see R2 |
| T9 ↔ T16 | frozen `STEP_IDS` replay contract vs `resolveStep` step keys | clean |

Automated forward-reference sweep (every `from '...'` in every code block, resolved to
the task that creates the file) found exactly the three defects above and nothing else.
No import cycles introduced by the rulings.

### Self-consistency rows — each task's own text against itself

| Row | Task | Found |
|---|---|---|
| S1 | T1 | Step 1 appends `node_modules/`, `dist/`, `coverage/` to `.gitignore`; **all three are already there**. Ruling R3 |
| S2 | T15 | writes `src/engine/commands/dayAbilities.test.ts`, absent from its Files list. Ruling R1 moves it anyway |
| S3 | T6, T16, T18 | Files lists omit files the bodies write: T6 `tsconfig.json`/`vite.config.ts`/`vitest.config.ts`, T16 `src/engine/selectors/registrationLedger.ts`, T18 `src/engine/selectors/replay.test.ts`. Ruling R4 |
| S4 | T18 | Files claims `Modify: nightCommands.ts — validate answerClass`, but Step 1 says T16 already owns that enforcement and T18 only tests it. Ruling R4 |
| S5 | Coverage table | rows for §14 Tier 1 and Tier 3 credit "Task 17" for the advisory property test and the scripted game; both are **Task 18**. v1 numbering, stale since the review inserted Task 17. Documentation only. Ruling R4 |
| S6 | T2–T18 | tests specified vs code specified: each task's test file imports only symbols its own body or an earlier task defines (verified by the sweep above). clean |
| S7 | T1 | no `dev`/`build`/`preview` scripts, deliberately — no `index.html` in this plan. Consistent with Plan 2 owning the entry. clean |
| S8 | Global Constraints vs tasks | no task contradicts a Global Constraint: purity confined to `applyEvent` and callees (T1, T4), envelope shape fixed in T4, one-tx-per-action in T13, advisory-never-blocks in T4/T14/T16/T17, no roster or seating mutation anywhere. clean |
| S9 | Review rubric vs plan mandates | no task mandates an assertion-free test or a verbatim-duplicated logic block. T7's `test/helpers/reference.ts` is a *deliberately independent* second implementation, not duplication — the review already checked it walks the ring differently from `empathCount`. clean |

### Rulings

**R1 — Task 15's `dayAbilities.test.ts` moves to Task 16.**
It exercises `applyVirgin`/`claimSlayer` against a real dealt game, which needs
`createGame`/`assignRoles`/`beginFirstNight` from Task 16's `setupCommands.ts`. Task 15
keeps `virgin.ts`, `slayer.ts`, `virgin.test.ts`, `slayer.test.ts`, and the append to
`dayCommands.ts`; Task 16 gains `dayAbilities.test.ts` verbatim.
Why: the alternative — rewriting the fixture over Task 4's `LogBuilder` — changes a test
the review specifically added to cover §16.5 and §16.12 at the command level, and a
hand-built log is a weaker witness than a real deal. Moving it one task later costs
nothing and preserves the test as written.
Cost if wrong: §16.5 and §16.12 command-level coverage lands one task later than the plan
says. Nothing between T15 and T16 depends on it.

**R2 — Task 16's barrel omits the exports whose modules do not exist yet; Tasks 17 and 18
add their own.**
Task 16 drops `export { addNote, changeRole, clearStatus, recordDeath } from
'./commands/correctionCommands'` and `export { answersAtSeq } from './selectors/replay'`,
and drops `addNote`/`changeRole`/`clearStatus`/`recordDeath`/`answersAtSeq` from the
barrel-completeness test's name list. Task 17 adds its export line and its four names back;
Task 18 adds its export line and `answersAtSeq` back. Both tasks' Files lists gain
`Modify: src/engine/index.ts` and `Modify: src/engine/commands/nightCommands.test.ts`.
Why: as written, Task 16 cannot typecheck — `tsc` cannot resolve either module — so the
task's own "all green" step is unreachable. Of the two fixes, stubbing the modules in
Task 16 ships untested placeholder code (a review defect in its own right) and reordering
the tasks drags Task 17's and 18's whole bodies before the barrel. Deferring two export
lines keeps every task green at its own commit and keeps the barrel test honest at every
point: it asserts exactly what exists.
Cost if wrong: the barrel is briefly incomplete between T16 and T18. Nothing imports it
until Plan 2, and T18 is the last task, so the plan still ends with the full surface the
Definition of done requires.

**R3 — Task 1 skips the `.gitignore` append.**
`node_modules/`, `dist/` and `coverage/` are already in `.gitignore` (committed before
this plan). Appending them again produces duplicate lines. The requirement is satisfied;
the edit is not.
Cost if wrong: none — the ignore set is unchanged either way.

**R4 — Stale Files-list and coverage-table entries are documentation drift; task bodies
are authoritative.**
Specifically: T6 also modifies `tsconfig.json`/`vite.config.ts`/`vitest.config.ts`; T16
also creates `src/engine/selectors/registrationLedger.ts`; T18 also creates
`src/engine/selectors/replay.test.ts` and does **not** modify `nightCommands.ts`; the
coverage table's two "Task 17" credits mean Task 18. Each affected task's brief carries
the correction, and reviewers are told the body wins so a task is not marked
out-of-scope for a file its own steps tell it to write.
Cost if wrong: a reviewer waves through a genuinely out-of-scope file. Mitigated by
naming the exact file list per task in the dispatch.

**R5 — `closeDay` does not advance the phase, even though spec §7 says it does.**
Spec §7's Closing-the-day bullet reads: "emits `DAY_CLOSED`, resolves any execution from
the day's nominations, runs `checkVictory`, and advances to night." The plan splits that
into `closeDay` (no advance) plus a separate `beginNight` (deviation 9). Read against the
plan's own "where this plan and the spec disagree, the spec wins" rule, the split looks
like a plan bug. It is not.
Why: the spec contradicts itself here, and §4.7 is the half that governs. §4.7's
Transaction column scopes row 2 to the "execution tx" and row 4 to the "day-close tx" —
victory is phase-sensitive by the spec's own design. If `closeDay` advances to night
inside the transaction whose commit runs `checkVictory`, the Saint's execution is recorded
in day N while the check runs in night N+1, so **evil can never win by Saint execution**
(one of only two evil win rows), and a Mayor poisoned on night N — poison expiring at the
end of day N — is functional again at the check and **wins for good**. Both are
unreachable-win bugs, not cosmetic. §4.7 is the more specific and more load-bearing text;
§7's clause is a summary written before the transaction column existed. Rithwik was asked
about this in the prior session and chose the split over plumbing extra fields into
`VictoryContext`, so it is also a settled decision, not an open question.
Cost if wrong: Plan 2 must call two commands where the spec's prose implies one. The plan
states that seam explicitly ("Plan 2 calls `closeDay`, shows any win, then `beginNight`"),
and §4.7's blocking modal lands on the day screen where it belongs. No engine rework.

**R6 — the spec's §14 Tier 3 "scripted game" and Tier 1 "advisory invariants" are Task 18,
not Task 17.** See row S5. Task 17 is correction commands, added by the review. Reviewers
of Task 17 must not expect the scripted game, and reviewers of Task 18 must expect it.
Cost if wrong: none; naming only.

**R7 — Task 2's ability text: restore the guide's exact wording in two places.**
Task 2 claims "Ability text is verbatim from guide §1 so the Reference screen in Plan 2 can
render it without a second source." I diffed all 22 strings against
`/Users/rithwik/Downloads/botc-trouble-brewing-storyteller-guide.md` §1. Twenty match
exactly. Two do not:
- **Drunk** — guide: "your ability doesn't work"; plan: "your ability does not work".
- **Poisoner** — guide: "they are poisoned tonight and tomorrow day (their ability
  malfunctions / gives false info)."; plan drops the parenthetical entirely.
Ruling: use the guide's text verbatim for both, parenthetical included. The claim in the
task is the requirement, and the Poisoner's parenthetical is the part a first-time
Storyteller actually needs on the Reference screen.
Cost if wrong: two strings differ from a hypothetical house style. Trivially reversible.

Also verified against the guide while Task 1 ran, and clean: the 22-character roster
(13 townsfolk / 4 outsiders / 4 minions / 1 demon, all 22 ids matching guide §1 names)
and the full 5–15 `DISTRIBUTION` chart, value for value, against guide §2.
The guide is the **domain source of truth** and its path goes to every implementer and
reviewer touching edition data.

## Progress

Note: this harness exposes no TodoWrite tool. This ledger is the only progress tracker.

Task 1: implementer DONE (sonnet) — commit f5311a9, 6/6 passing across both Vitest
projects, typecheck and lint clean. Resolved: typescript 5.9.3, vitest 3.2.7, vite 7.3.6,
eslint 9.39.5, typescript-eslint 8.69.0, fast-check 4.9.0 — all inside the plan's ranges,
no config loosened. R3 honoured (`.gitignore` zero diff). Task reviewer dispatched
(sonnet) against review-6cc51ae..f5311a9.diff.
Task 1: review clean — spec ✅, quality Approved. Reviewer verified the glob partition
against the real engine (tinyglobby, the one vitest 3.2.7 uses), not just the report:
`src/engine/reducer/**/*.test.ts` and `src/**/*.test.ts` minus `src/engine/reducer/**`
match exactly one file each, no overlap, no gap. That was the one risk that mattered.
Task 1: minor (deferred): purity.setup.ts:63-66 — afterEach's three direct re-assignments
are redundant once the `restores` descriptor-restore array has run. Harmless; touch only
if the file is edited again.
Task 1: minor (deferred): the `^9.15.0` eslint range now resolves to 9.39.5, which npm
install reports as already deprecated ("no longer supported"). Not test-output noise and
not in Task 1's scope; a signal for whoever revisits dependency ranges.
Task 1: complete (commits 6cc51ae..f5311a9, review clean)

Task 2: implementer dispatched (sonnet), BASE f5311a9, carrying ruling R7 (two ability
strings) and the guide path as domain source of truth. Briefs for Tasks 4-18 pre-generated.

Verified while waiting (no action needed): Task 3's phase math against spec §4.4, which the
spec itself calls a coin-flip an implementer will get wrong. All four exact:
`phaseOrdinal = number*2 + (night?0:1)`; `nextPhase` night N→day N, day N→night N+1;
`isStatusActive` uses **`<=`** (inclusive) and additionally refuses a status before its
`appliedAt`; `expiryFor` gives until_dawn→night N (Monk survives to the Imp step),
tonight_and_tomorrow→day N (poison gone at the start of night N+1), permanent→null.
Task 2: implementer DONE (sonnet) — commit 3dfc874, 30 new tests, full suite 36/36,
typecheck and lint clean. Exactly the five files the brief names; no barrel, no later-task
files. R7 applied. Task reviewer dispatched (sonnet) against review-f5311a9..3dfc874.diff,
told to redo the guide diff independently rather than accept the implementer's claim.

Verified while waiting on the Task 2 review (no action needed):
- `stepKey`/`SINGLE_KEY_STEP_IDS` (critical #3's fix). Key format is spec §6.1's exactly:
  `${phase.number}:${stepId}:${GROUP|actorId}`. The set is group + pseudo + `imp`, which is
  right: the Imp's `settleScope` is per-night so a mid-night Scarlet Woman promotion cannot
  buy a second kill. The duplication between the reducer's set and the night order's
  `settleScope` is deliberate (the reducer must not import the edition barrel) and Task 9
  tests the two agree.
- `VICTORY_PREDICATES` against spec §4.7's four rows. All four exact, in precedence order
  with row 1 ahead of row 3 as §4.7 requires; row 3 uses `<=`; row 4 carries all three
  clauses; every row has the `players.length > 0` pre-deal guard (critical #2's fix). Row 2
  is phase-scoped with an in-code comment naming the closeDay/beginNight split as the
  reason it is safe — consistent with ruling R5.
Task 2: review — spec ✅ (data verified independently against the guide: all 22 ability
strings, all 11 distribution rows, every capability flag, both R7 corrections landed),
quality **Needs fixes** with two Important findings, both labeled plan-mandated. Both are
mine to rule on.

**Task 2 Ruling: finding 1 (registration.ts has zero test coverage) — FIX.** The reviewer
labeled it plan-mandated because the brief's Files list named only `characters.test.ts` and
`distribution.test.ts`. The brief is wrong and the spec settles it: **spec §4.2 line 315
ends "registration is a passive property, not an ability. *Its own test.*"** — the spec
explicitly mandates a registration test that the plan's Files list dropped. Independently,
I checked who consumes this data: `registrationOptionsForCharacterId` is imported by Tasks
6, 8, 9, 15 and 16, and `isAmbiguous` by Tasks 8 and 16. The **ordering** is load-bearing —
Task 2 promises "the character's own true option first" and Task 8 builds its
"canonical answer first" legal-answer sets on that promise. So an unasserted array order
under five consumers is exactly the silent-wrongness surface this project treats as the
risk that matters. Fix: assert the exact ordered arrays for `recluse` and `spy`, plus
`isAmbiguous`/`canRegisterAsTeam` on one ambiguous and one unambiguous character.
Cost if wrong: one small test file the plan didn't ask for. Trivially deletable.

**Task 2 Ruling: finding 2 (shallow freeze, non-readonly fields, shared arrays) — FIX, but
not the way the reviewer proposed.** The finding is real: `Object.freeze` on `CHARACTERS`
and `DISTRIBUTION` does not cascade, no `Character`/`TeamCounts` field is `readonly`, and
`distributionFor` hands back the live object, so `characterById('imp').team = 'townsfolk'`
both type-checks and persists process-wide for every one of the sixteen remaining tasks.
`readonly` fields plus a freeze inside the factory turn that whole class of cross-cutting
corruption into a compile error at near-zero cost, on data every later task trusts.
I reject one part: the reviewer wants each character given its own registration array
literal instead of sharing `GOOD_TOWNSFOLK` and friends. **Freezing the four shared
constants achieves identical safety with less code** — once frozen, sharing is not a
hazard, it is just less garbage. Shared-and-frozen beats duplicated-22-ways.
Cost if wrong: if a later task legitimately needs to build a mutable `Character`, it must
construct its own object rather than clone-and-edit a frozen one. No task in the plan does.

Task 2: minor (deferred): `characters.ts:105-106` docstring describes an empty
`registration` array, a case the data never produces — folded into fix round 1 since the
implementer is already in the file, and a Task 8 implementer would read it and be misled.
Task 2: minor (deferred): no automated assertion locks the 22 `abilityText` strings. Plan 2
renders them verbatim with no second source, and I already found two drift instances in the
plan itself, so a code snapshot (the treatment Task 9 gives `STEP_IDS`, for the same
replay-contract reason) has real value. Not expanding Task 2 for it — final review triages.
Task 2: fix round 1/5 dispatched — resumed the original implementer with both Important
findings verbatim plus the two rulings (add registration.test.ts per spec §4.2; deep-freeze
by construction and keep the shared registration constants rather than duplicating them
22 ways) and the minor docstring fix folded in. FIX_BASE 3dfc874.

**Pre-ruling for Task 15 (found while waiting on Task 2's fix round). `canRegisterAsTeam`
is dead code that Task 15 reimplements inline, twice.** The function is defined once in
Task 2 and re-exported by both barrels (Task 9's edition barrel, Task 16's engine barrel),
but the plan never calls it. Task 15 instead writes the same predicate by hand at both of
its sites: `registrationOptionsForCharacterId(nominator.characterId).some((o) => o.team ===
'townsfolk')` for the Virgin, and `...some((o) => o.team === 'demon')` for the Slayer.
Ruling: **Task 15 calls `canRegisterAsTeam` at both sites.** That kills the duplication,
makes an exported symbol live rather than dead, and reads closer to the rulings it encodes
(§16.12 "a Recluse may register as the Demon"; the Virgin's "nominator is a Townsfolk").
Cheaper than the alternative of cutting the export, because Plan 2's Reference and Grimoire
surfaces plausibly want it and it is already in both barrels.
Note the alignment: the two `canRegisterAsTeam` cases I just asked Task 2 to test —
`('recluse','demon')` and `('spy','townsfolk')` — are exactly Task 15's two call sites, so
the test written now covers the use added then.
Cost if wrong: two call sites read through a helper instead of inline. Reversible in a line.
Task 2: fix round 1/5 — implementer DONE, commit f509fce, 45/45 full suite, typecheck and
lint clean. Fix evidence complete (covering tests named, commands and output pasted).
Implementer also froze the Baron's `setupModifiers` on its own initiative — same hazard
class, self-flagged; the re-reviewer judges whether that is in-spirit or creep. Scoped
re-review dispatched over 3dfc874..f509fce.
Task 2: fix round 1/5 re-review — all 3 findings ADDRESSED, no new Critical/Important
breakage. Registration ordering now asserted with `toEqual` on full arrays for both Recluse
and Spy, plus the exhaustive one-option check for the other twenty; deep-freeze happens in
the `character()` factory so it is by construction; the shared constants stayed shared, as
ruled. Re-reviewer judged the implementer's extra Baron `setupModifiers` freeze in-spirit,
not creep — `Object.freeze` on the character is shallow and would have left the one
non-null `setupModifiers` in the edition exposed to the identical hazard. It also confirmed
`Partial<TeamCounts>` keeps `readonly` (homomorphic mapped type), so no interface change
was needed.
Task 2: minor (deferred): registration.test.ts:254 re-derives alignment inline instead of
calling the exported `alignmentOf`.
Task 2: minor (deferred): the `Object.isFrozen` test covers `washerwoman`, whose array is
pre-frozen at declaration — it does not cover `recluse`/`spy`, whose arrays depend on the
factory's freeze catching an un-pre-frozen override literal. That is the case that would
actually witness a factory-freeze regression. Production code verified correct on both
paths by direct read, so this is coverage, not a gap.
Task 2: complete (commits f5311a9..f509fce, review clean after 1 fix round)

Task 3: implementer dispatched (sonnet), BASE f509fce. Carried: the two settled deviations
(perceivedCharacterId is a function not a Player field, so Task 6's ESLint rule can exist;
JSON round-trip is over events not state), the spec §15 `stPrivate` seed and why it is not
dead weight, deviation 6 (`Vote` has no `butlerViolation`; `Nomination` gains
`closedThreshold`), and Task 2's now-`readonly` types. Told to hand-derive the phase
ordinals and both status-lifetime boundary checks and show the numbers, since the spec
itself names that as the coin-flip an implementer loses.
Task 3: implementer DONE (sonnet) — commit 520cd91, 11 new tests, 56/56 full suite,
typecheck and lint clean. Exactly the three files the brief names; no `perceivedCharacterId`
field on `Player` (verified directly — the only occurrence in types.ts is a comment).
Task reviewer dispatched (sonnet) with the five settled decisions listed as rulings so they
are not re-litigated, and told to re-derive the phase arithmetic from the code itself.
Task 3: review clean — spec ✅, quality Approved, zero Critical/Important. Reviewer
re-derived the arithmetic from the code by hand and got the same numbers I did (night1=2,
day1=3, night2=4, day2=5; Monk active night 2 / gone day 2; poison active night 2 and day 2
/ gone night 3; Butler `master` shares the poison lifetime not the Monk's; redHerring never
expires). It also adjudicated the extra "applied in the future" guard in `isStatusActive` as
a correct defensive addition that cannot suppress a legitimately active status, since
`expiryFor` never yields an `expiresAt` before `appliedAt` and phase progression is monotonic.
⚠️ item resolved by me, not a gap: the reviewer could not see commit bodies. I checked all
four task commits (f5311a9, 3dfc874, f509fce, 520cd91) — each carries the exact
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer and author
rithwik@trypencil.com. Six commits ahead of origin/main; nothing pushed.
Task 3: minor (deferred): phase.ts:152-156 — the future-application guard is correct but
undocumented as deliberate; one comment would spare the next reader the derivation this
review had to do.
Task 3: complete (commits f509fce..520cd91, review clean)

**R8 — Task 9's "defect in Task 4" no longer exists; Task 9 must not re-fix it.**
Task 9's prose says: "§6.3's Scarlet Woman condition is `isDemon && demonSince != null &&
!demonNotified`. Task 4 sets `demonSince` on the original Demon at the deal but leaves
`demonNotified` false, so the original Imp would be woken on night 2 and shown a 'You are
the Imp' card. The deal must set `demonNotified: true`." Its Files list carries a matching
`Modify: src/engine/reducer/applyEvent.ts`. But Task 4's own `ROLES_ASSIGNED` code block
already reads `demonNotified: character.team === 'demon'` — the v2 review folded the fix
into Task 4 and left Task 9's description of the bug behind.
Ruling: Task 4 implements its block as written, fix included. **Task 9's applyEvent.ts
modification is a no-op**: its implementer verifies the field is already correct and does
not touch it, and its reviewer must not treat the absent hunk as a Missing requirement.
Why: fixing at origin beats shipping a known defect and patching it five tasks later, and
the code is already right — the only thing wrong is the plan's narration. Left unruled, a
Task 9 implementer goes looking for a bug that isn't there, and a Task 9 reviewer flags a
missing diff hunk the plan promised.
Cost if wrong: if the field were somehow NOT set at the deal, the original Imp gets woken on
night 2 and shown a "You are the Imp" card. Task 9's own night-order test and Task 18's
scripted game both assert `demonNotified`, so a regression is caught, not silent.
Task 4: implementer DONE (sonnet) — commit 5beb296, 73/73 full suite, typecheck and lint
clean. Exactly the six files the brief names. Verified myself before review: the
`GameEventPayloads` keys and the `applyEvent` case labels are **identical 24-element sets**,
and that set is spec §3.6's 26 minus `CLAIM_RECORDED`/`CLAIM_RETRACTED` exactly;
`NON_UNDOABLE_EVENT_TYPES` holds the two Spy events and nothing else; R8's
`demonNotified: character.team === 'demon'` is present at applyEvent.ts:143.
Task reviewer dispatched on **opus** rather than sonnet — a capability bump justified because
this is the single write path fourteen later tasks build on and every failure mode here is
silent. Told that per-case correctness, not coverage, is the question (I already settled
coverage), and that a byte-for-byte diff against the brief cannot catch an error that is in
the brief.
Task 4: review (opus) — spec ✅ on catalogue/envelope/keys/purity with two ❌, zero Critical,
4 Important, 14 Minor. The reviewer independently re-walked all 24 cases and found no
payload-field or operator slip, confirmed the night-scoped key on all three axes
(prefix, GROUP collapse, resolved ∪ skipped), confirmed referential stability is structural
rather than test-fitted, and confirmed purity by grepping the whole reachable closure
including `phase.ts` and `characters.ts`. So the implementer's central claim held up.

**Both ⚠️ items resolved by me — neither is a gap:**
- The `ROLE_CHANGED` guard rests on `DEATH` landing before `ROLE_CHANGED` in the same
  transaction, which no test in this diff can show. Verified in the plan: Task 16's
  `resolveImpStep` emits `NIGHT_KILL_RESOLVED` → `DEATH` → `DEMON_DIED` → `ROLE_CHANGED`,
  in that order. The premise holds and a legitimate Scarlet Woman promotion passes the guard.
- `applyRolesAssigned` has no two-demon guard, so the reviewer asked whether a two-demon
  `assignments` map is reachable. It is not: Task 16's `assignRoles` calls
  `validateDeal(playerIds, result)` and **throws** on any issue before `ROLES_ASSIGNED` is
  ever emitted, and Task 5 has a test asserting a broken deal errors on /demon/i.
  **Task 4 Ruling: no reducer-level demon guard on `ROLES_ASSIGNED`.** Throwing in
  `assignRoles` does not violate §4.8's never-block rule: §4.8 governs rule breaks *at the
  table*, where something already happened that the app must not un-happen. A structurally
  illegal role assignment during setup has not happened to anyone yet — there is nothing to
  preserve — and §5.3's "legality re-validated" is the spec asking for exactly this.
  Cost if wrong: a hand-built illegal DealResult reaching the reducer directly would produce
  two living Demons. Only reachable by bypassing the command layer, which nothing does.

**Task 4 Ruling: finding 1 (two-living-Demons guard untested) — FIX.** Not discretionary:
spec §4.8 states the invariant *and* mandates its test — "Engine invariant, with a test: no
sequence of flagged events can make `aliveCount` negative, produce two living Demons, or
emit a `DEATH` for a player already dead." Only the third of the three is currently tested.
The guard is the highest-consequence branch in the file and is asserted only by reading.
Both directions are required, and the passing direction is the one that catches an
over-firing guard — it is also the only way this task can demonstrate the DEATH-first
ordering premise its own comment leans on.
Cost if wrong: none. This is the spec's own requirement.

**Task 4 Ruling: finding 2 (hardcoded edition step ids) — FIX the narrow part only.** The
duplication of `SINGLE_KEY_STEP_IDS` into the reducer is plan-mandated with a real reason:
the reducer must not import the edition barrel. I am not undoing that. But the reviewer is
right that `'scarlet_woman_notify'` is worse than the set — a bare inline literal, not
covered by the Task 9 agreement test the file's comment promises, and if the night order
names that step anything else then `demonNotified` is never set and §6.3 mis-notifies the
promoted Demon every night for the rest of the game, silently. Fix: hoist it to an exported
named constant beside `SINGLE_KEY_STEP_IDS`. **Carried into Task 9: its agreement test must
cover both constants, as an exit criterion, not a comment here.**
Cost if wrong: one extra exported constant. The alternative is a string that agrees with the
night order by luck.

**Task 4 Ruling: finding 3 (`test/helpers/game.ts` untested, `advanceTo` overshoot) — FIX.**
Two parts, and the second is a live defect rather than missing coverage: `advanceTo`'s guard
sits *after* the push and compares `current.number > target.number + 1`, so an unreachable
target pushes up to three spurious `PHASE_ADVANCED` events into the log before throwing.
Move the guard before the push. Then add the handful of assertions — fourteen later tasks
build fixtures on `LogBuilder`/`buildGame`/`advanceTo`, and a bug here surfaces as a
confusing failure in someone else's task, which is the most expensive kind.
Cost if wrong: a few assertions on a helper. Cheap either way.

**Task 4 Ruling: finding 4 (per-actor step with empty `actorIds` settles nothing) — FIX.**
This is the exact bug spec §3.6 records from v2: "`actorIds` is always an array. v2 mixed
singular `actorId` with group steps declared as `actorIds: []`, which the cursor could never
select." Today `stepKeyFromEvent` returns `[]`, `withSettled` no-ops, and the cursor offers
the same step forever — a hard stall, at night, live. Make it throw. Throwing does not
conflict with §4.8: an empty `actorIds` on a per-actor step is a malformed event, not a
Storyteller rule break, and `applyRolesAssigned` already throws on an omitted player, so it
is the established idiom in this file. It cannot fire in correct operation — the cursor only
offers per-actor steps whose `wakes()` is non-empty, and pseudo steps live in
`SINGLE_KEY_STEP_IDS`.
Cost if wrong: a malformed-event path throws instead of silently stalling. The throw is
strictly more debuggable than the stall.

**Task 4 Ruling: escalating the reviewer's Minor 5 into the fix round.** `PHASE_ADVANCED`
into a day allocates a fresh `todaysExecutions` even when the existing array is already
empty, so identity breaks across *every* night N → day N transition and after every
no-execution day — which is common in this game. The reviewer graded it Minor and said the
human may want to escalate. I am escalating it: spec §3.5 makes referential identity for
unchanged sub-objects a stated requirement with a test, and an already-empty array being
"reset" is precisely an unchanged sub-object. One-line fix.
Cost if wrong: a marginally more conditional line in the hottest reducer case.

Folded into the same round because the implementer is already in these files and each is a
line or two: Minor 7 (drop the three dead array fields from `EMPTY_PLAYER_DEFAULTS`, which
reads as supplying eight defaults when it supplies five), Minor 13 (`playerId !== undefined`
rather than truthiness, the precise test under `exactOptionalPropertyTypes`), Minor 10 (the
test file's module-level mutable `nextSeq`, which works today and breaks silently under any
test reorder).

**Task 4 Ruling: Minor 12 (`VOTE_CAST` does not check `nomination.closed`) — no change,
recorded as a decision.** §4.8's `social` class says a break is "Recorded, flagged, and
**honoured arithmetically**. The tally counts what was raised", and §4.8's headline is that
the app "never silently alters what happened". A hand that went up after the call is a thing
that happened. `closedThreshold` is frozen at close (deviation 6), so the forensic record
stays intact regardless of a late vote. This is the same reasoning that makes a second ghost
vote recorded-and-flagged rather than refused.
Cost if wrong: a post-close vote shifts a recomputed tally away from the frozen audit
figures. Visible in the log, not silent.

Task 4: minor (deferred): three cases (`ROLE_CHANGED` re-assert, `NOMINATION_CLOSED`
double-close, `GAME_ENDED` duplicate) lack a no-change short-circuit, so §3.5's
"identical state object" property holds only where a short-circuit happens to exist. All
three are duplicate-event paths the command layer does not produce.
Task 4: minor (deferred): double `characterById` lookup at three sites (alignment derivable
from the already-fetched `character.team`).
Task 4: minor (deferred): `initialState()` hardcodes `edition: { id: 'troubleBrewing',
version: '0' }`, so a state that never saw `GAME_CREATED` claims to be a Trouble Brewing
game. `{ id: '', version: '' }` would be honest.
Task 4: minor (deferred): no idempotency guard on `NOMINATION_OPENED`/`NOTE_ADDED` duplicate
ids; commands own id generation, so theoretical.
Task 4: minor (deferred): determinism.test.ts's purity assertion largely duplicates the
double-reduce test, since both run in the armed `reducer-purity` project.
Task 4: fix round 1/5 — implementer DONE, commit 0f4a464, 82/82 full suite (9 files),
typecheck and lint clean, output pristine. Fix evidence exceeds what I asked for: it verified
each of the four Important fixes by reverting it individually and confirming the new test
fails without it. It also disclosed a process near-miss — a `git stash` during spot-checking
stashed all four modified files rather than the one it meant to isolate; it popped, grep-
verified every fix still present, re-ran the full suite, and switched to file-level backups
for the rest. Scoped re-review dispatched over 5beb296..0f4a464 and told to confirm from the
committed diff that nothing was actually lost, since that is the concrete risk the
disclosure raises.
Task 4: fix round 1/5 re-review — all 8 fixes ADDRESSED, no new Critical/Important breakage.
Both risk areas I flagged came back clean: FIX 4's throw cannot over-fire (the
`SINGLE_KEY_STEP_IDS` check short-circuits first, so group and pseudo steps never reach it,
and all three step events funnel through the same `stepKeyFromEvent`), and FIX 5's guard
still clears a non-empty `todaysExecutions` on every night→day transition (confirmed against
the untouched adjacent test). The git-stash near-miss lost nothing — verified from the
committed diff's contents, not from the report's own grep claim.
Task 4: complete (commits 520cd91..0f4a464, review clean after 1 fix round)

Task 5: implementer dispatched (sonnet), BASE 0f4a464. Carried the purity-seam explanation —
`randomPicker()` legitimately calls `Math.random()` because this file is the boundary where
§3.3's "resolve every choice before the event exists" happens, and it lives in the `app`
project not the purity-scoped one — plus the no-seeded-PRNG prohibition, the load-bearing
deal order (Baron before the outsider count), the 7+ bluff qualifier §5.2 flags as a v2
regression, the Washerwoman/Librarian Drunk asymmetry from §6.4, and Task 4's constraint that
`applyEvent`'s ROLES_ASSIGNED case throws on a seated player missing from `assignments`.
Also told it not to edit any file another task owns — report NEEDS_CONTEXT instead, so a
cross-task change comes to me for a ruling.
Task 5: implementer DONE_WITH_CONCERNS — commit 223a07e, 116/116, typecheck and lint clean.
It reported three defects it found in the brief and fixed. I read all three before review
(per the DONE_WITH_CONCERNS rule that correctness concerns get addressed first) and ruled:

**Task 5 Ruling: defect 1 (three `TeamCounts` `+=` sites would not compile) — accepted.**
Direct and expected consequence of my own Task 2 ruling making those fields `readonly`. The
brief predates it. Local mutable mapped types are the right shape.
Cost if wrong: none; the alternative was not compiling.

**Task 5 Ruling: defect 3 (`validateDeal`'s chart-plus-modifiers check never fired) —
accepted, and it matters more than the implementer realised.** The brief compared the
*recorded* `result.distribution` against a freshly re-derived `expected`. Both derive from the
same un-edited chart, so for a hand edit that touches only `assignments` the two were equal
by construction and the check was dead code. Comparing the **actual assigned counts** against
`expected` is what the check's own stated purpose requires. Why it matters beyond this task:
my Task 4 ruling that a two-living-Demons state is unreachable rests on `assignRoles` calling
`validateDeal` and throwing. With the brief's version, a hand-edited two-Demon set would have
sailed through. This fix is what makes that earlier ruling true.
Cost if wrong: a false positive would block a legal lock-in. The implementer verified the
"setupModifiers names a character not in the set" case still reports only its own message.

**Task 5 Ruling: defect 2 (the reversed seat deck) — REJECTED, revert it and fix the test
instead.** The implementer's diagnosis is wrong and the "fix" is test-fitting.
The claim is that zipping `seatOrder` forward against `drawn` leaks the draw order into the
seating, because the Demon is drawn first. But `deal.ts:103` reads
`const seatOrder = pick(playerIds, playerIds.length)` — the entropy for *which player gets
which role* comes from shuffling the **players**, and under `randomPicker()` the Demon's seat
is genuinely random. The original comment ("the ordering of the draw does not leak into the
seating") was **true** in production; it was read as false.
Worse, `.reverse()` does not do what its new comment claims. It does not "break that
correlation" — it inverts it. Under an order-preserving picker `seatOrder[0]` now
deterministically receives the *last* drawn character instead of the first. Equally
deterministic, just differently, so the stated justification is false on its own terms.
The actual defect is in the test `validateDeal > rejects a hand-edited set with two Demons`,
which takes `Object.keys(result.assignments)[0]` and overwrites it with `'imp'` while assuming
that seat is not already the Demon's — an assumption that holds only by luck of picker order.
Ruling: revert the `.reverse()` and its three-line comment; change the test to select a seat
whose assigned character is demonstrably not a Demon, then overwrite that. That is a strictly
better test — it states its own intent, and it is robust under any picker.
Why this is not tidiness: production code is now shaped by a test's incidental assumption and
carries an explanatory comment that is false. A future reader either believes the false
comment or "fixes" the unexplained reversal. Silent wrongness is this project's stated risk.
Cost if wrong: if some future non-random picker is injected in production, seat assignment is
deterministic — but that is true with the reversal too, so reverting costs nothing.
Task 5: pre-review correction DONE — commit 84edcf0. Reversal reverted, original comment
restored, both tests fixed to assert on a non-Demon seat rather than key order. 34/34 setup,
116/116 full, typecheck and lint clean.
**The check I asked for found a second one, and it was worse than the first.** The test
`keeps a one-player reroll legal` shared the same `Object.keys(...)[0]` assumption and was
therefore rerolling the *Demon's* seat — and since the Imp has no same-team replacement in
this edition, it was silently exercising `rerollOne`'s no-op branch. A test claiming to
verify that a one-player reroll stays legal was verifying nothing at all. Fixed the same way.
Implementer grepped the file for all remaining `Object.keys`/array-destructure uses and found
no others.
Task 5: reviewer dispatched (sonnet) over the combined 0f4a464..84edcf0 range, since both
commits are this task's work and the net state is what ships. Given all three of my rulings
so the accepted deviations are not re-litigated, and pointed at the highest-value check this
file affords: **hunt for more vacuous tests.** One test here was already proven to pass while
exercising a no-op branch, and this file's tests are the only evidence the deal is legal, so
a vacuous test is worse than a missing one. Also asked it to probe ruling 2 in the opposite
direction from the implementer — confirm the new `validateDeal` comparison cannot false-
positive and block a legal lock-in, across player counts and with/without the Baron.
Task 5: reviewer FAILED — agent stalled with no progress for 600s (stream watchdog did not
recover). Infrastructure failure, not a finding: no verdict was produced. Re-dispatching a
fresh reviewer with the same package and the same named risks. Code state unchanged at
84edcf0.
Task 5: review clean on spec (✅) and Approved on quality, with 1 Important (plan-mandated)
and 3 Minor. The reviewer did the tracing I asked for rather than trusting the report: it
confirmed the 9-player Baron distribution {3,4,1,1} from the code and the edition data, the
15-player boundary where the Baron exhausts all four Outsiders, the bluff gate at exactly 7
with no off-by-one, and — the check that mattered — it hand-traced the corrected
`keeps a one-player reroll legal` end to end and confirmed it now performs a genuine
Poisoner→Scarlet Woman swap rather than the Demon no-op it silently exercised before. It also
probed my ruling 2 in the opposite direction and found **no** `validateDeal` false positive
across 7/9/15 players with and without the Baron, nor on the "setupModifiers names an absent
character" case. My earlier Task 4 ruling stands on firmer ground for it.

**Task 5 Ruling: the vacuous test at deal.test.ts:259-264 — DELETE it.** The test iterates
`CHARACTERS` and asserts each `character.team` is one of the four `Team` literals. `team` is
*typed* `Team` and every entry is built through the `character()` factory under that same
constraint, so the assertion cannot fail without a prior compile error. Its comment claims to
"guard against a typo in CHARACTERS" — which is precisely what it cannot do, because
TypeScript catches that first. It is transcribed verbatim from the brief, so it is
plan-mandated, not the implementer's judgment.
Ruling: delete rather than repair. Three reasons. It asserts what the type system already
guarantees, and a test that cannot fail is worse than no test because it inflates a coverage
count with false confidence. It is in the wrong file — it tests edition data, not the deal,
and Task 2's `characters.test.ts` already owns that surface with assertions that can actually
fail (keys match ids, the 13/4/4/1 roster, and exhaustive `requiresAlive`/`falseSelfBelief`/
`setupModifiers` checks). And leaving it would be incoherent: I told this reviewer that a
vacuous test is worse than a missing one here because this file's tests are the only evidence
the deal is legal. Finding one and keeping it would undercut the standard I set.
Cost if wrong: six lines of coverage removed from a file that never exercised them. Task 2's
tests cover the real invariants; nothing is left unguarded.

Folded into the same round, all in the same file and all cheap: extract the
`{ -readonly [K in keyof TeamCounts]: … }` mapped type written out three times into one local
alias (Minor, a DRY miss inside my own ruling-1 deviation); drop the dead `assignments ? … :
[]` ternary whose false branch is unreachable; and add the one genuinely missing test the
reviewer named — that `deal()` throws outside 5–15 players, which is currently unexercised.
Task 5: fix round 2/5 — implementer DONE, commit 3d1c286. 34/34 setup (net unchanged: one
test deleted, one added — not a regression), 116/116 full, typecheck and lint clean. Reports
no edition-data invariant left unguarded by the deletion. Scoped re-review dispatched over
84edcf0..3d1c286 with two named checks: that the extracted mapped-type alias is semantically
identical at all three former sites (a *widened* type compiles fine and silently loses a
guarantee, so `tsc` passing is necessary but not sufficient), and that the deletion caught
only the vacuous loop and no adjacent live assertion.
Task 5: fix round 2/5 re-review — all 4 fixes ADDRESSED, no new breakage. The mapped-type
alias is byte-identical to all three literals it replaced (no `Partial`, no differing key set,
no added `| undefined`), so the extraction is pure DRY with no widening; the deletion removed
only the vacuous loop plus its now-unused `CHARACTERS` import and left the adjacent
`keeps a one-player reroll legal` assertion untouched; the new bounds test covers 3, 4, 16 and
20 players.
Task 5: complete (commits 0f4a464..3d1c286, review clean after 2 fix rounds)

Note on Task 5 for the final review: its brief was the weakest so far — it did not compile as
written (readonly `+=`), one of its `validateDeal` checks was dead code, two of its tests
passed for the wrong reason, and one test could not fail at all. Four plan-authored defects in
one task. Worth weighing when judging later tasks' briefs.

Task 6: implementer dispatched (sonnet), BASE 3d1c286. Carried ruling R4 (its Files list omits
tsconfig/vite/vitest, its Steps are authoritative — reviewer told the same so it is not marked
out-of-scope), §4.1's invariant and why the ESLint rule is the only thing between the design
and a Drunk-believing-Soldier surviving the Demon, the `no-restricted-imports` transitive
limitation to record rather than close, and the §4.2 Ravenkeeper/Saint `requiresAlive` cases.
Also warned it about Task 5's four plan-authored defects so it transcribes faithfully but
reports rather than forces anything that genuinely does not compile or passes for a visibly
wrong reason. Demanded evidence the boundary rule *fires* — the failure output from crossing
it — not merely that lint is currently clean, since a rule that never fires is
indistinguishable from no rule.
Task 6: implementer DONE (sonnet) — commit 77514a7, 140/140 (13 files), typecheck and lint
clean. All 11 expected files including the R4-authorised config trio; tree clean, no scratch
file committed. It gave the evidence I demanded: verified the boundary with the **real eslint
CLI against a scratch file outside the commit** and saw the rule fire with the §4.1 message,
rather than resting on `lintText`. Spot-checked myself: `grimoireTokens` projects only
status/sourcePlayerId/expiresAt — no `effective` (§10.1).
Task reviewer dispatched (sonnet). Priority check is whether the five boundary tests can pass
**vacuously** — whether each asserts a specific rule message or merely a non-zero error count
(which a typo in the fixture would also satisfy), and whether the rule's `group` patterns and
`importNames` actually match the real definition path and export name in `players.ts`. A
pattern that misses the real path gives a rule that is present, passes lint, and enforces
nothing. Also told it not to create its own scratch file — judge from config, tests and the
report's evidence — since the review must stay read-only.
Task 6: review — spec ✅, quality **Approved**, zero Critical, 1 Important (plan-mandated),
1 Minor. The five named checks all landed: the ESLint rule fires for a verified real reason
(the "rejects" case asserts the message matches /§4\.1/, ruling out a coincidental
unrelated-rule match, and the three "allows" cases each map to a distinct exemption path
rather than one blanket assertion); `abilityFunctional` reads `requiresAlive` and was traced
against Task 2's actual data for both the Ravenkeeper and the Saint; `effective` gating is
real and its tests push `effective: false` and assert the token is still *placed* while the
predicate reads false; the `grimoireTokens` canary double-asserts via `Object.keys` and a
`JSON.stringify` regex so it genuinely fails if `effective` returns; `toRulesView` was checked
field-by-field against the real interfaces with no spread. It also confirmed no re-export of
`perceivedCharacterId` exists anywhere in the tree, which is what the recorded transitive-
import limitation's mitigation depends on.

**Task 6 Ruling: the weak "registration is not an ability" test — DELETE the registration half.**
The test poisons the Recluse, asserts `abilityFunctional` is false (real), then asserts
`registrationOptionsForCharacterId('recluse')` has length 3 — which passes identically whether
the player is poisoned, alive, dead, or absent from the game, because that function takes only
a character id. It cannot detect the regression its own describe block names.
I checked where the invariant is *actually* guarded before ruling, and it is guarded twice,
both more strongly:
- `src/editions/troubleBrewing/registration.test.ts:53-58` — the structural arity witness I
  ruled into existence during Task 2's fix round. It proves no state, phase or aliveness
  parameter *exists* to gate on. That is the strongest possible guarantee at the data layer.
- Task 8 has a dedicated `describe('a poisoned Recluse still registers ambiguously (§4.2,
  §14 Tier 2)')` operating on a real `RulesView` through the resolvers — the behavioural test
  at the one layer where poison could actually leak in.
So Task 6's version is redundant against both and actively misleading, since it reads as proof
of poison-independence it structurally cannot provide. Same reasoning as the Task 5 vacuous-test
ruling: a test that cannot fail is worse than no test, and this one is in the wrong file.
Keep the `abilityFunctional` assertion, drop the registration assertion, and leave a comment
naming the two places that do guard it so the next reader does not re-add a hollow version.
Cost if wrong: one redundant assertion removed. The invariant retains two real guards.

**Carried into Task 8:** its `poisoned Recluse still registers ambiguously` block is
load-bearing — spec §14 Tier 2 names it explicitly — and must genuinely thread the poisoned
player's state through the resolver. Task 6's attempt at the same invariant was hollow, so this
one gets checked rather than assumed.

Folded in: the Minor — no test covers `abilityFunctional`'s seated-but-undealt branch
(`characterId === ''`), which is the guard that stops `characterById('')` throwing. One test.
Task 6: fix round 1/5 — implementer DONE, commit 7d81a8b, one file touched as instructed.
141/141 full (net +1: one hollow assertion removed, one test added), 20/20 selectors,
typecheck and lint clean. Scoped re-review dispatched over 77514a7..7d81a8b with the check
that matters: does the new undealt-role test genuinely reach the `characterId === ''` branch,
or could the fixture make the player non-functional by some other path (dead, `alive` false)
so the assertion holds without the guard ever mattering? Getting that wrong would replace one
hollow test with another, which is the exact failure this round exists to correct.
Task 6: fix round 1/5 re-review — both fixes ADDRESSED, no new breakage. The new
undealt-role test genuinely isolates the guard: `GAME_CREATED` sets `characterId: ''` with
`alive: true` and no statuses, so `predicates.ts:23`'s empty-id guard returns first and is the
*only* path that can produce `false` — remove it and execution falls through to
`characterById('')`, which throws rather than returning true. Not another hollow test.
The re-reviewer also checked my replacement comment's two citations rather than trusting them:
`registration.test.ts:53-58` verified as an exact match, and Task 8's poisoned-Recluse describe
block correctly identified as a forward pointer to unexecuted work rather than a fabricated
citation.
Task 6: complete (commits 3d1c286..7d81a8b, review clean after 1 fix round)

Task 7: implementer dispatched (sonnet), BASE 7d81a8b. The plan calls this its highest-value
task — §14 allocates effort by damage × how unlikely you are to notice, and nobody at a table
recounts a Chef number the way ten people recount a vote.
Emphasised the one thing that decides whether this task is worth anything: **the reference
implementations must be genuinely independent.** A previous draft got this wrong and the omega
review caught it — the Empath reference was the same outward walk as the implementation, so the
property test proved only that the code agreed with itself while looking like thorough
coverage. Told it the corrected Empath reference must drop the dead first and then index the
surviving ring, to keep both references deliberately naive, never to import from `seating.ts`,
and that any duplication between reference and implementation **is the design** — leave it and
say so. Asked for an explicit written independence analysis naming the different route each
reference takes.
Also warned that the ESLint boundary is now live: importing `perceivedCharacterId` into
`seating.ts` will fail lint with a §4.1 message, that this is intended, and that adding an
eslint-disable to get around it is not an option — report NEEDS_CONTEXT instead.
Task 7: implementer DONE (sonnet) — commit 8065f08, 157/157 (16 new), typecheck and lint clean.
It proved non-vacuity the right way: a deliberate mutation of the implementation that produced
a shrunk fast-check counterexample, rather than asserting the property tests are meaningful.
I verified the structural half of independence myself — `test/helpers/reference.ts` imports only
the `RulesView` *type*, no functions or helpers from `seating.ts` — and confirmed no
eslint-disable anywhere in the new files, so the §4.1 boundary was respected rather than
silenced.
Task reviewer dispatched on **opus**. Told it plainly that structural separation is necessary
but nowhere near sufficient: two files can implement the identical algorithm with zero shared
imports, so it must read `reference.ts` and `seating.ts` side by side and judge the
*algorithms*, stating the route each takes for both Chef and Empath. A shared walk in different
clothing is a Critical finding. Also told it to weigh the implementer's "no plan-authored
defects found" as a claim to check rather than a reassurance — a clean bill of health is weaker
evidence than a found defect, and the last two briefs each carried real ones.
Task 7: review (opus) — spec ❌ with 3 Important, 7 Minor, **zero Critical**. The check that
decides the task passed: **reference independence is real on both abilities.** Chef —
implementation rotates the start to the first good seat so no run straddles the boundary and
sums k−1 per run; reference does a flat pair walk over `(i, (i+1) % n)`. Empath —
implementation starts in the full dead-included ring and steps outward until it finds someone
alive; reference filters the dead out *first*, then takes `(index±1) mod size`, so it has no
outward step in which a shared off-by-one could hide. That is exactly the fix the omega review
demanded, and it is a genuinely different method rather than the same walk relabelled.

**Task 7 Ruling: finding 1 (fully-evil `chefPairs` branch unreachable by the generator) —
KEEP the branch, ADD a direct unit test, FIX the false coverage claims.** The reviewer measured
this properly: 500 sampled draws produced zero fully-evil rings, because `makeView` does
`evil.delete(spec.empathSeat)` unconditionally, so `evilCount` can never exceed `size − 1`. Yet
the generator's own comment promises it "covers the all-adjacent and fully-wrapped edges that no
legal set reaches," and the report certifies the case as covered. Both false.
I am not deleting the branch, which was the reviewer's first suggested fix. `return size` is
mathematically *correct* and load-bearing: a fully-wrapped run has no boundary, so the k−1 rule
would give n−1 where the true circular answer is n. It is a genuine special case, not dead
weight. It is also reachable in principle — Task 17's `changeRole` corrections are guarded
against two living Demons but not against an all-minion table, and §4.8 requires that no
sequence of flagged events corrupt the game. Deleting a correct special case because today's
generator cannot reach it leaves a latent wrong answer for the day it can.
Contrast with `statusTimeline.ts`, which the plan rightly cut: that was a whole module with no
caller and no test. This is one line inside a function that has both, guarding a real
mathematical edge. The actual defect here is the false certificate, and a unit test fixes it.
Cost if wrong: one unit test for a branch unreachable in legal play. Cheap insurance.

**Task 7 Ruling: finding 2 (`empathDerivation` duplicates players at 5- and 6-seat games) —
FIX.** Real defect at legal inputs: the chart accepts 5 through 15, and the derivation's fixed
`offset = -3..3` seven-entry window indexed `mod(selfIndex + offset, size)` lists the same
player twice at size 5 and 6, rendering `Player 5 (dead)` twice if that seat is dead. At size 7
the window already spans the entire ring yet still prints bracketing ellipses, claiming seats
that do not exist. Nothing in the diff can see it because the property test caps size at ≥7 and
no unit test goes below 7.
This is the §8.2 audit trail, whose entire purpose is to let a Storyteller check a positional
number before announcing it — and §14 puts positional information top of the risk list
precisely because nobody at the table recounts it. A derivation showing a false ring is worse
than no derivation: it converts an audit into a confirmation of the wrong picture.
Cost if wrong: the window renders fewer seats at small tables. Strictly better than duplicates.

**Task 7 Ruling: finding 3 (`AlignmentOverrides` unused and untested) — REJECT the cut, ACCEPT
the untested half.** The reviewer's central premise is false: it states "There is no production
caller." **Task 8 is the caller.** I checked the plan before ruling — Task 8 imports
`AlignmentOverrides`, builds `overridesFrom(rulings)`, and calls all four functions with it:
`chefPairs(view, overrides)`, `chefDerivation(view, overrides)`,
`empathCount(view, actorId, overrides)`, `empathDerivation(view, actorId, overrides)`.
That is the settled decision Rithwik made explicitly — Chef and Empath get the full Recluse/Spy
cross-product rather than a single number, because without it a routine registration ruling has
to be recorded as an `st_override`, which poisons §4.3's defect signal. Cutting the parameter
would break the very next task and undo a decision already made.
The reviewer is right about the other half: ~30 lines of override and derivation formatting are
wholly untested in the file the spec calls the highest-damage, lowest-detectability code in the
app. Fix is tests, not deletion — the override branch, both registration-ruling derivation
lines, and the `(ruled)` markers, now rather than in Task 8.
Note the pattern: the brief's `Produces` list omits the third parameter that its own Step 4 body
adds — the same Files/Interfaces staleness as ruling R4. The bodies are authoritative.
Cost if wrong: tests written one task before their production caller lands. Trivial.

Task 7: minor (deferred): dead defensive code mirrored on both sides — `seating.ts:391`'s
self-skip and `reference.ts:74-75`'s delete are both unreachable. Left alone deliberately:
editing `reference.ts` for cosmetics risks the independence property that is this task's whole
value, and the cost of the dead lines is that they read as guarding a real case.
Task 7: fix round 1/5 — implementer DONE, commit 76efc4e. 166/166 full, 25/25 covering,
typecheck and lint clean. It honoured both overrules (kept the fully-evil branch and
`AlignmentOverrides`), corrected the false coverage claims in *both* the generator docstring and
its own report, and ran the requested second mutation so **both** `chefPairs` and
`aliveNeighbours` now have empirical non-vacuity evidence. I verified `test/helpers/reference.ts`
is untouched — the independence property survived the round intact.
Scoped re-review dispatched over 8065f08..76efc4e with four named checks, the first being the
one that could repeat this round's own mistake: does the new fully-evil unit test actually build
a fully-evil ring, or did it go through `makeView` (whose empath-seat deletion is what made the
branch unreachable) and become a *second* false coverage certificate for the same line?
Task 7: fix round 1/5 re-review — all 3 Importants, all 5 minors and the mutation request
ADDRESSED, no new breakage. The first check came back right: the new fully-evil test builds
`ring(['imp','poisoner','baron','scarlet_woman','spy'])` through the test file's own helper,
never through `makeView`, so `evilCount === size` genuinely fires the branch — not a second
false certificate. The Empath window fix was traced across every legal size 5–15, including the
exact boundary at 7 where the window stops needing to shrink; no off-by-one. Both override tests
assert the un-overridden value *and* the overridden one in the same test and show they differ
(Recluse-ruled-evil flips `chefPairs` 0→1; Spy-ruled-good flips `empathCount` 1→0), so neither
would pass with overrides ignored. The Chef mutation was confirmed reverted, not left in.
Task 7: minor (deferred): the `ringOrder` "seat+1 = left-hand neighbour" assertion I asked for
is largely tautological given its sibling test — once `ringOrder` is known seat-ascending with
no gaps, it follows. **My request, not the implementer's choice**: it protects less against a
reversed voting-order convention than I implied when I asked for it. The orientation convention
is still effectively pinned only by comment, and the real guard belongs wherever vote order is
consumed (Task 14's `voteOrder`).
Task 7: complete (commits 7d81a8b..76efc4e, review clean after 1 fix round)

Task 8: implementer dispatched (sonnet), BASE 76efc4e. Carried the Task 6 ruling forward
explicitly — this task is where the poisoned-Recluse invariant is *genuinely* guarded, since it
operates on a real `RulesView` through the resolvers rather than on a state-blind id lookup, and
I told it the Task 6 version was hollow and deleted so it knows the standard its test has to
meet. Also carried: the settled full-cross-product decision and that Task 7's
`AlignmentOverrides` exists specifically because this task is its caller; the §6.4
Washerwoman/Librarian Drunk asymmetry; the `oneOfTwo` `shownCharacterId` limitation to preserve
rather than fix; and the running tally of plan-authored defects in Tasks 5, 6 and 7 so it reports
rather than forces or silently patches.
Named six self-checks, including that `canonical` must be first in *every* list — a caller takes
the first entry as the default, so a `registration` answer sorting first anywhere would make a
shenanigan the default answer.
Task 8: implementer DONE_WITH_CONCERNS — commit 3747e19, 196/196 (30 new), typecheck and lint
clean. **Fifth plan-authored defect found and fixed:** `fortuneTellerAnswers`'s `actorId` was
declared but never read, failing `tsc` under `noUnusedParameters`; renamed to `_actorId`,
matching the convention the brief itself uses for `ravenkeeperAnswers`. I accepted that — the
uniform resolver signature requires the parameter to exist even where unused, since `RESOLVERS`
is keyed by step id and every entry shares one shape.
Verified myself before review: all 8 `RESOLVERS` keys are present in Task 9's frozen `STEP_IDS`
list, so the registry is correct and the reviewer does not need to spend effort on it or raise
it as a cross-task ⚠️. Also confirmed zero `eslint-disable` in the file, so the §4.1 boundary
was respected rather than silenced.
Task reviewer dispatched on **opus**. Priority check is the carried Task 6 ruling: would the
poisoned-Recluse test actually go red if someone wrapped the registration lookup in an
`abilityFunctional` check tomorrow? If not, it is the same hollow shape in a new costume. Also
asked it the question the implementer did not ask itself — whether `actorId` is genuinely
irrelevant to the Fortune Teller or whether a per-actor concern was silently dropped, given the
red herring is a single global value and a Drunk-believing-Fortune-Teller is a distinct actor at
the same step.
Task 8: the first reviewer was lost to a session reset (`/clear`) while in flight — no verdict
was ever produced. Re-dispatched a fresh task reviewer on **opus** over the same package
(review-76efc4e..3747e19.diff), carrying the same eight named risks the lost dispatch held:
the poisoned-Recluse hollowness check (would it go red if the registration lookup were wrapped
in an `abilityFunctional` check?), whether `actorId` is genuinely irrelevant to the Fortune
Teller or a per-actor concern was dropped, `canonical`-first in every cross-product list, the
§6.4 Washerwoman/Librarian Drunk asymmetry, the Librarian zero-Outsiders branch being
distinguishable from an empty set, the red herring registering as Demon only in the Fortune
Teller, the Undertaker's multiple candidates on a two-execution day (§16.5), and `fabricated`
only when droisoned (§4.3). Code state unchanged at 3747e19; no re-implementation was needed.
Handed it the cross-task facts it cannot see (the 8 RESOLVERS keys already verified against
Task 9's STEP_IDS, no eslint-disable present, why `AlignmentOverrides` is not dead code) as
facts rather than as instructions not to flag, so the review rubric's no-pre-judging rule holds.
Task 8: review (opus) — spec ❌, quality **Needs fixes**: 1 Critical, 2 Important, 7 Minor.
The two carried checks came back clean and they were the ones that decided the task. The
**poisoned-Recluse test is genuine, not the hollow shape**: it pushes a real `STATUS_APPLIED`
through the reducer, asserts `abilityFunctional` is false first (so a no-op event fails the
test rather than being papered over), and the reviewer traced the live path
`investigatorAnswers:255 → oneOfTwo:169 → couldRegisterAs:140-152` and confirmed that
inserting an `abilityFunctional` guard at resolvers.ts:146 makes `viaRecluse.length` 0 and the
test go red. Task 6's ruling is discharged. **`_actorId` is genuinely irrelevant**: the red
herring is one global chosen at setup, TB has exactly one Fortune Teller, the herring
comparison is by player id, and a Drunk-believing-Fortune-Teller differs only in the step
layer's §8.2 banner and its `fabricated`/`st_override` entry — neither producible in this
layer. No per-actor concern was dropped. Also confirmed by construction and not by discipline:
`fabricated` is unreachable here (`LegalAnswer.answerClass` is typed
`Extract<AnswerClass,'canonical'|'registration'>` and one `answer()` factory derives the class
from `rulings.length > 0`), §4.1 holds structurally (`RulesViewPlayer` has no
`perceivedCharacterId` field at all), the §6.4 Washerwoman/Drunk exclusion is enforced three
independent ways, and the red herring is read at exactly one site.

**All three ⚠️ items resolved by me — none is a gap, and the first one reframes the Critical:**
- **The engine never takes `legalAnswers[0]` as a default.** Plan lines 11134-11141: the
  command layer resolves a computed step's answer by `candidates.find(c => c.key ===
  resolution.answerKey)` and **throws** if no key is named. So "entry 0 is the default" is a
  Plan 2 UI concern, not an engine one. This does not rescue finding 1 — see the ruling.
- §8.2's droisoned banner, `infoHistory`, and the `fabricated`/`st_override` entry points are
  not producible in the edition layer by design. `fabricated`'s §4.3 droisoned gate lives in
  Task 16 (verified at plan lines 11095-11107, with the exact "use st_override instead" error),
  tested by Task 18's `answerClass.test.ts` per the pre-flight table. Correctly placed.
- `undertakerAnswers` trusting `view.todaysExecutions` is safe: the reviewer attributed the
  day-boundary clear to Task 7, but it is Task 4's, and it is exactly the escalated Minor 5 of
  Task 4's fix round — `PHASE_ADVANCED` into a day clears a non-empty `todaysExecutions`,
  confirmed against the untouched adjacent test in that round's re-review.

**Task 8 Ruling: finding 1 (the Librarian's zero-Outsiders branch vanishes when a Spy is in
play) — FIX. Critical, and the reviewer's stated blast radius understates it.** The branch is
gated on `answers.length > 0` — emptiness of the list — rather than on whether an Outsider is
actually in play. The Spy's `{good, outsider}` option makes the list non-empty, so in any legal
zero-Outsider game containing a Spy (7, 10 or 13 players) the zero branch never runs and
**the true answer is absent from the answer set entirely**. The reviewer framed the damage as
"a registration answer sorts first and becomes the default", which the ⚠️ above softens — but
the half it did not weigh is the half that matters: because Task 16 resolves by key and
enumerates the legal keys in its error, a Storyteller who wants to say the honest thing
**cannot name it**, and the app's own error message directs them to `st_override`. That is
precisely §4.3's trust trap — the honest answer reachable only by declaring you disagreed with
the app — and it poisons the override-as-defect-signal that §4.3 introduced `st_override` to
protect. Critical stands on that ground alone, independent of ordering.
Fix: discriminate on the world, not the list — `hasTrueOutsider` over `view.players` reading
the **true** `characterId` per §4.1 (guarding `characterId === ''`), and return
`[zeroAnswer, ...answers]` so the canonical answer is present and first. Note the brief's own
test at plan:4670-4674 asserts `answers[0]` is the canonical zero answer, so this restores the
brief's stated intent rather than overriding it; that test uses the Poisoner, which is why it
could not catch this, and it still passes unchanged.
Cost if wrong: a zero-Outsider game with a Spy offers one extra canonical answer. Strictly
more truthful than a set whose only answers are rulings nobody made.

**Task 8 Ruling: finding 2 (the Ravenkeeper's ruled answers record the TRUE character) — FIX,
but NOT the shape the reviewer prescribed. Its prescription would have shipped a dead guard.**
The finding is real and worse than graded. Task 16 detects "this ruled answer does not name a
token, so make the Storyteller record which one they showed" with
`Array.isArray(value) && value[0] === null && !resolution.stChoice` (plan:11149-11156).
`oneOfTwo` satisfies it because its value is the tuple `[shownCharacterId, player.id,
decoy.id]` with element 0 nulled when ruled (resolvers.ts:191). The Ravenkeeper's value is a
**bare string** `target.characterId` on all three answers, so that guard cannot fire: the log
records the Ravenkeeper as having learned "Recluse" while the display says "a minion of the
Storyteller's choosing", and `stChoice` is never demanded.
The reviewer said to set `value: null` "mirroring `oneOfTwo`". `oneOfTwo` does not return a
bare null — it returns an array with null *inside* it. `value: null` type-checks (the field is
`… | null`), reads like the right fix, and leaves `Array.isArray(null)` false, so the guard
stays dead and the defect survives the fix round wearing a correction's clothes.
Ruling: the ruled answers carry **`value: [null, target.id]`** — an array whose element 0 is
null, matching the documented tuple contract at types.ts:203-208 and firing Task 16's guard
with no change to Task 16. The canonical answer keeps its bare-string `target.characterId`,
which is correct: the Ravenkeeper genuinely learns that character and no `stChoice` is owed.
The two ruled answers sharing a `value` is not a defect — they differ in `key`, in `display`,
and in `registrationRulings`, which is what the ruling *is*.
Cost if wrong: the Ravenkeeper's ruled `value` is a two-element tuple where a longer one might
later be wanted. The alternative was a fix that looks right and enforces nothing.

**Task 8 Ruling: finding 3 (the only ordering test passes vacuously on the exact broken shape)
— FIX.** `classes.slice(0, classes.indexOf('registration')).every(...)` is `[].every(...)` —
`true` — whenever the first answer is already a registration, which is the one shape that
matters, and it is conditional on top of that. Same hollow pattern this plan has now deleted
twice (Tasks 5 and 6). Fix: assert `classes[0] === 'canonical'` and full partitioning
unconditionally, over a fixture set that includes the Spy zero-Outsider game — so the test
becomes the witness for finding 1 rather than a test that watched it happen.
Cost if wrong: none. This is the standard already set for this plan.

Folded into the same round, all in the same file and each a line or two: Minor 4 + Minor 8
together (the `a outsider of your choosing` article bug in text the Storyteller reads aloud,
and the five-argument `oneOfTwo` helper whose fourth argument is a copy of its third — the
same lines); Minor 5's duplicate-key half (a Fortune Teller who points at the same player
twice yields two answers sharing key `ft:yes:p6`, breaking the "stable across recomputation so
a selection can be restored" contract at types.ts:201, with the distinct-violation unflagged —
dedupe, and extend the existing off-constraint derivation to cover it); Minor 6 (the report
claims the file was transcribed exactly and discloses only `_actorId`, but a second brief
compile error — the unused `CharacterId` import — was fixed silently; the code is right, the
report is not); and all three parts of Minor 10 (a test titled "changes the Chef count when
the Recluse is ruled evil next to the Demon" that actually asserts the *Spy ruled good*, a
test titled "only under its true registration" that never asserts the class or exclusivity,
and `expect([a,b]).not.toContain(undefined)`, which construction and the type already
guarantee).
Task 8: minor (deferred): resolvers.ts:283-286/372/389 — `couldRegisterAs` and `ambiguousAmong`
guard `characterId === ''` while the Fortune Teller, Ravenkeeper and Undertaker call
`characterById` unguarded, so either the guards are dead or those three throw on a pre-deal
view. Unreachable in operation: information steps exist only after the deal, and §3.6's
recompute-on-log-expansion only ever replays a night step's own seq. Left for the final review
rather than papered over with an unverified comment claiming unreachability.
Task 8: minor (deferred): resolvers.ts:364-366 — the Ravenkeeper takes `targets[0]!` and
silently drops extras, unlike the Fortune Teller's §4.8 derivation treatment. Not escalated:
target *count* is bounded by the step's `targets` spec at the picker, whereas §4.8's soft
constraints govern *who* may be picked, not how many.
Task 8: minor (deferred): resolvers.test.ts:202-209's stable-key test never exercises the
Fortune Teller (which is why Minor 5 escaped it) and passes the Washerwoman as the
Investigator's actor.
Task 8: fix round 1/5 — the original implementer is unreachable (its session was cleared), so
per the skill a **fresh implementer** carries the brief, the report file and the findings.
Sonnet: the three fixes are now specified to the shape. FIX_BASE 3747e19.

**The Task 8 reviewer presumed lost to the `/clear` was not lost — it landed after the
re-dispatch, so Task 8 has TWO independent opus reviews of the same commit.** Recording the
provenance because it changes how much the findings are worth: the first result I acted on was
the pre-clear reviewer; the second was my re-dispatch. They ran with different prompts and
never saw each other's output.

They agree on everything load-bearing. Both found the Librarian zero-Outsiders/Spy defect
(graded Critical by one, Important by the other), both found the Ravenkeeper true-character
`value` defect, both flagged the conditional ordering assertion, both flagged the redundant
`label`/`team` parameter, and both caught the undisclosed `CharacterId` import deviation in
the report. Both independently cleared the two carried checks: the poisoned-Recluse test is
genuine (each traced the `couldRegisterAs` path and named the mutation that reddens it), and
`_actorId` drops no per-actor concern. Two independent confirmations of the same two defects
is a much stronger basis for the fix round than one, and the agreement on the *cleared* checks
is what discharges Task 6's carried ruling with confidence.

**Task 8 Ruling: the second review's `hasTrueOutsider` predicate is the correct one, and my
FIX 1 as first dispatched had a reachable hole.** The second reviewer's version carries an
extra clause I did not have: `&& p.id !== actorId`. It is load-bearing, not tidiness. A
**Drunk who believes they are the Librarian** wakes at the Librarian step (§4.1 — `wakes()`
reads the perceived character), and the Drunk's *true* team is `outsider`. So in a legal
one-Outsider game (6, 8, 11 or 14 players) where the single Outsider is the Drunk and that
Drunk believes they are the Librarian, my predicate sees a true Outsider and suppresses the
zero answer — while `oneOfTwo` excludes the actor from its own candidates and therefore
returns nothing. The resolver hands back an **empty answer set**: the same defect as finding 1,
one edge over, with the Storyteller again pushed into `st_override`. With the actor excluded,
the zero answer is present and canonical, which is also the answer a Storyteller would really
give — the only Outsider is the actor and cannot be shown to them, and a Drunk's information
is arbitrary regardless. Correction sent to the running implementer with a mandated test for
the case (a Drunk-believing-Librarian in a one-Outsider game), since nothing else guards it.
Cost if wrong: one extra canonical answer in a game whose only Outsider is a
Drunk-believing-Librarian. The alternative was an empty answer set at a live info step.

**Task 8 Ruling: both reviewers prescribed the Ravenkeeper fix shape that enforces nothing —
the `[null, target.id]` ruling stands.** The second review independently recommended a bare
`value: null`, exactly as the first did. Neither could see why that fails: Task 16's guard is
`Array.isArray(value) && value[0] === null`, and it lives in unwritten plan text
(plan:11149-11156) that a diff-scoped reviewer has no reason to read. Two independent expert
reviews converging on a fix that type-checks, reads correctly, and leaves the guard dead is
the strongest argument yet for checking a prescription against its downstream consumer rather
than adopting it because the diagnosis was right. The implementer has been told to hold the
shape against the second review's advice.
Task 8: minor (deferred): the key-stability test's equality half compares two calls of a
deterministic pure function, so it cannot fail — and a key that genuinely depended on
iteration order would still compare equal, so the invariant its comment claims is not the one
tested. Folded into fix round 1 (the uniqueness half is the real assertion; the Fortune Teller
was also absent from it, which is why it missed the duplicate-key bug).
Task 8: minor (deferred): `oneOfTwo`'s key would collide only if a character carried two
registration options on the same team; no Trouble Brewing character does. Left as-is
deliberately — an option index would buy nothing today and the uniqueness test would catch a
data change, though it would read as a test bug rather than a data bug.
Task 8: minor (deferred): the `washerwomanAnswers` Drunk exclusion set is redundant with
`couldRegisterAs` today and nothing keeps it honest. Kept deliberately as belt-and-braces on
the §6.4 asymmetry, on the same reasoning as Task 6's retained guards.
Task 8: fix round 1/5 — implementer DONE, commit cf32cc1. 202/202 full suite (16 files, +6 net
new tests), typecheck and lint clean, output pristine. Two files touched as instructed
(`resolvers.ts`, `resolvers.test.ts`) and nothing else. Fix evidence is what I asked for and
complete: each of the three fixes has the production change reverted, the covering test run,
and the **failure** pasted, then the fix restored and the pass pasted — including a separate
failure witness for the mid-round actor-exclusion correction, on its own dedicated
Drunk-believes-Librarian test. FIX 3's failure is against the genuine pre-fix Librarian
behaviour rather than a synthetic revert of the test's own logic, and the implementer
additionally showed by inspection that the old `slice(0, indexOf('registration'))` assertion
form computes `slice(0,0).every(...) === true` on exactly that broken data — i.e. it
demonstrated *why* the old test never caught FIX 1, which is the thing I most wanted
established. It also corrected the report's false "transcribed exactly" claim.
Verified myself: commit carries the exact `Co-Authored-By: Claude Opus 5 (1M context)` trailer
and author rithwik@trypencil.com; 17 commits ahead of origin/main, nothing pushed.
Scoped re-review dispatched (sonnet) over 3747e19..cf32cc1 with six named checks, the first
being the one that could repeat this round's own failure mode: does the Drunk-believes-Librarian
test genuinely reach the actor-exclusion branch, or does its fixture satisfy the assertion for
some other reason (a second Outsider present, `drunkBelief` unset, the wrong `actorId`) so that
deleting `p.id !== actorId` would leave it green? Also asked whether `[null, target.id]` really
satisfies `Array.isArray(value) && value[0] === null` while the canonical bare string does not,
whether any existing assertion was **loosened** to go green (specifically the display-string
regex the article fix touched), and to reconcile 196 → 202 as genuinely additive.
Task 8: fix round 1/5 re-review — **all findings ADDRESSED, no new Critical/Important
breakage.** The check that could have repeated this round's own mistake came back genuine: the
re-reviewer traced the Drunk-believes-Librarian test and confirmed that deleting
`p.id !== actorId` makes `hasTrueOutsider` true (it counts p6, the Drunk), so the function
falls through to `return answers`, and since `oneOfTwo` already excludes the actor and there is
no other Outsider, `answers` is `[]` and the test's `not.toHaveLength(0)` fails. The clause is
load-bearing, not decoration. It also confirmed the FIX 2 shape ruling holds where the
reviewers' prescription would not: the test computes the downstream predicate
`Array.isArray(value) && value[0] === null` **both ways** — false for the canonical bare
string, true for each ruled tuple — rather than a weaker assertion that a bare `null` would
also satisfy. And it confirmed the `p.characterId !== ''` guard is load-bearing by checking
that `characterById('')` throws. No assertion was loosened to reach green: the
`/^a minion of your choosing:/` regex is untouched (the article fix does not affect "minion"),
the single deleted assertion is the authorised vacuous one, and the two retitled tests were
strengthened. 196 → 202 reconciles as six new `it` blocks with no test block deleted.
Task 8: complete (commits 76efc4e..cf32cc1, review clean after 1 fix round)

Task 9: implementer dispatched (sonnet), BASE cf32cc1. Carried R8 with the line numbers I
verified myself (`demonNotified: character.team === 'demon'` at applyEvent.ts:162 and
`SCARLET_WOMAN_NOTIFY_STEP_ID` in use at :290) so the implementer verifies rather than hunts a
bug that no longer exists; the Task 4 ruling that the agreement test must cover **both**
`SINGLE_KEY_STEP_IDS` and `SCARLET_WOMAN_NOTIFY_STEP_ID` as an exit criterion; and the fact
that Task 6's ESLint config **already sanctions exactly this task's two files**
(`nightOrder.ts` and `nightCursor.ts`) as §4.1's permitted `perceivedCharacterId` readers —
checked directly in eslint.config.js:21-30 before dispatch, because Task 9 is the first task
with a legitimate consumer and an implementer hitting that rule unprepared is the one most
likely to reach for a disable.
Task 9: implementer DONE (sonnet) — commit 0692efc, 237/237 (18 files, +35 tests), typecheck
and lint clean. Exactly the six files the brief names; `applyEvent.ts` untouched, so R8 was
honoured rather than re-fixed. Verified myself before review: correct author and
`Co-Authored-By` trailer, zero `eslint-disable` in any new file (so the §4.1 boundary was
respected rather than silenced even though this is the first task that legitimately imports
`perceivedCharacterId`), and `stepKey` at nightCursor.ts:38-46 produces the Global
Constraint's exact format.

**Two more plan-authored defects found, taking the running count to nine.** The implementer
reports that the brief's own `nightCursor.test.ts` fixture had **no Undertaker** in its
9-player roster, so the "reports conditionMet false" test walked off the end of the night
order (`nextStep` → null) and could never reach the step it targeted — it **always failed as
transcribed**. It also dropped an unused `GameEvent` import from the same block that would
have failed lint. Both are the same class as Task 5's four: a brief whose code was never run.

Task reviewer dispatched on **opus** — a capability bump justified because this is the night
engine, every failure mode here is a live stall or a silent mis-notification at the table, and
fourteen later tasks walk this cursor. The priority check I named is one I found by reading
`stepKey` myself rather than from the review: **it keys on `step.settleScope`, not
`step.grouping`.** Those are deliberately different axes — the Imp step is per-actor in
`grouping` but per-**night** in `settleScope`, which is exactly what stops a mid-night Scarlet
Woman promotion buying a second Imp kill. So the reducer's `SINGLE_KEY_STEP_IDS` must equal
*exactly* the set of steps whose `settleScope` is not `'per-actor'`, and an agreement test that
only checks one direction (every id in the set exists in the night order) would pass while a
step that *should* be single-key is absent from the reducer's set — the Imp's case, and a
second kill. Asked for set **equality**, stated either way. Second named check is whether the
implementer's Undertaker fixture edit is a correct diagnosis or a test edited until it went
green, which is a failure mode this plan has already produced.
Task 9: review (opus) — spec ✅, quality **Approved**, zero Critical, 1 Important
(plan-mandated), 9 Minor. Both priority checks came back the right way and the reviewer did the
work rather than trusting the report. **The agreement test binds as genuine set equality**: it
computes the `settleScope === 'per-night'` set from the night order and asserts
`[...SINGLE_KEY_STEP_IDS].sort()` *equals* it, so a step that should be single-key but is
missing from the reducer's set fails — and it read the reducer's side directly to confirm both
sides are the same six ids (the two DUSK/DAWN pseudo pair, MINION/DEMON group, and the Imp's
override). The Imp is pinned twice more: one test asserts its `settleScope` is `per-night` and
another asserts every *other* step derives `settleScope` from `grouping`, so silently dropping
the override fails two tests. That was the risk I named and it is closed.
**The Undertaker fixture edit was a correct diagnosis, not a test edited until it went green**:
with no Undertaker dealt, `wakes()` is empty, the cursor hits its `actors.length === 0 →
continue`, and the walk runs off the end and throws before any assertion — it could never pass.
The fixed test can only exit its loop on the Undertaker, so the cursor demonstrably returned
that step with `conditionMet === false`, and the displaced Monk is referenced by no other test.
Also verified independently: both night orders match the domain guide item by item (the
reviewer re-read guide lines 79-107 rather than accepting the claim), the cursor re-scans from
index 0 with no high-water mark so non-monotonicity is structural, and the Scarlet Woman
day-boundary case is walked end to end (execution on day 3 → promotion → night 4 wake).
It found **no test in the diff that cannot fail** — one weak assertion and one redundant one.

**Task 9 Ruling: finding 1 (`requiresAlive` duplicated into every step as a hardcoded boolean)
— FIX.** Not discretionary, and not a style point: §6.2 states it in as many words —
"`requiresAlive` lives on the character (§4.2), **never on the step** … A step reads the flag
from the actor's character; it is never duplicated onto the step" — and Plan 1's own Global
Constraints repeat it. `perceivedActors(characterId, requireAlive = true)` restates the flag
thirteen times implicitly and once explicitly, with **no agreement test between the two sides**,
in a plan whose entire discipline is that a duplicated fact is safe only when something checks
the copies agree. That is the same hazard the file's own comments flag for
`SINGLE_KEY_STEP_IDS` and `resolverId`, minus the test.
Behaviour is correct today only by luck of the roster: the Ravenkeeper is the only
`requiresAlive: false` character with a night step (the Saint has the flag but no step). Fix:
read `characterById(characterId).requiresAlive` inside `perceivedActors` and delete the
parameter and its one call site. Reading the **perceived** character's flag is also the
semantically right lookup here — a dead Drunk who believes they are the Ravenkeeper must still
be woken to be given false information, which is the whole point of the Drunk, and `wakes()` is
§4.1's sanctioned perceived-character consumer.
Cost if wrong: one extra `characterById` lookup per step evaluation, on a cursor that runs once
per tap rather than per frame. The alternative is keeping a second source of truth that only
the current roster makes harmless.

Folded into the same round, all cheap and all in the two files: Minor 2 (the
skip-treated-as-settled test asserts `?.step.id` `.not.toBe(first)`, which `undefined`
satisfies — so a cursor that stalled to null after one skip passes the test named for catching
exactly that stall; assert the next real step id instead); Minor 3 (the test titled "one key for
the whole set on a group step" exercises a **pseudo** step, so no genuine `grouping: 'group'`
step has its key asserted directly — same title-vs-content class as Task 8's Minor 10); Minor 4
(`StatusLifetimeName` clones `phase.ts`'s `StatusLifetime`, so adding a lifetime leaves the
edition's copy silently unable to express it — the same second-source-of-truth defect as the
Important, one line to fix with `Exclude<StatusLifetime, 'permanent'>`); Minor 5 (one step
re-derives `characterById(p.characterId).team` where its two siblings in the same file read
`p.team`, and `characterById('')` throws, so an undealt night-phase state throws instead of
returning a position); Minor 7 (the 7+ gate is tested at 5 and 9, so `INFO_THRESHOLD_PLAYERS`
could be 6, 7, 8 or 9 and both pass — and §6.3's 7+ qualifier is a **named v2 regression** the
spec calls out as dropped once already, so it earns a local 6-vs-7 boundary pair); and Minor 8
(the Imp's `nightOverview` row reports `actor: null` while `nextStep` reports the acting actor,
because the overview keys `entries` off `settleScope` — the Imp is the only step that is
per-actor in grouping and per-night in settle scope, and Plan 2 reads this row).
Task 9: minor (deferred): the §15 night-order-rationale test cannot fail *independently* —
every relation it asserts is implied by the exact-order snapshot beside it. Kept rather than
deleted: unlike the vacuous tests cut in Tasks 5 and 6 it does not certify something it cannot
check, it is redundant rather than false, and it carries the guide's
status-modifiers→info-leakers→kill→reactive rationale in a readable form. Flagged for the final
review's trim pass.
Task 9: minor (deferred): dead surface — `export type { PlayerId }` is imported solely to be
re-exported and used nowhere, and the edition barrel has zero importers today (the cursor
imports `nightOrder` directly, which is also what keeps it cycle-free). Brief-mandated with
Plan 2 as the stated consumer, so left alone.
Task 9: minor (deferred) — **and carried forward to Plan 2 rather than fixed here.** §6.2's
`showCard` is a **single** value, but the guide's Demon info step shows **two** cards: "these
are your minions" and the three not-in-play bluffs. So `demon_info` declares
`these_are_your_minions` and the bluffs card survives only in the instruction prose — and
`'not_in_play'` is consequently a declared `showCard` variant no step uses, which strongly
suggests §6.2 intended it for exactly this step. A UI driven off `showCard` would never render
the bluffs card. I am **not** changing the shape: `showCard` is the spec's interface, nothing
consumes it yet, and a unilateral mid-execution interface change ripples into Plan 2 and §6.2.
This is a spec self-inconsistency of the same class as R5 (§7 vs §4.7). Folding in only a
comment at the step so Plan 2's implementer meets it at the point of use rather than in a
ledger, and surfacing it to the final review.
Task 9: fix round 1/5 — resumed the original implementer (context intact), FIX_BASE 0692efc.
Task 9: fix round 1/5 — implementer DONE, commit 025202a. 238/238 (18 files), typecheck and
lint clean and pristine. FIX 1 applied as ruled (the flag is read off the character via
`characterById`, parameter and its call site gone), all seven minors addressed, and it did the
audit I asked for: all 13 `perceivedActors` call sites checked against `CHARACTERS`, and the
dead-Monk / dead-Ravenkeeper behavioural witness re-verified passing after the refactor rather
than edited to fit it. Scoped re-review dispatched (sonnet) over 0692efc..025202a.
The check I named as deciding the round is the one silent-failure risk the refactor creates:
the old code took an explicit per-step boolean defaulting to `true`, the new code reads the
character's flag, and those agree **only** if every call site's character carries the value
that step used to pass. A character with `requiresAlive: false` at a site that previously
defaulted to `true` now wakes **dead** actors where it used to filter them — silent, and
invisible to a passing suite. Asked for the enumeration itself rather than a conclusion, plus
confirmation that the Saint (which carries `requiresAlive: false`) really has no night step.
Also asked whether the new 6-vs-7 boundary pair came at the price of the removed 5- and
9-player cases, since 237 → 238 is only +1 against several rewritten tests.
Task 9: fix round 1/5 re-review — **all 8 findings ADDRESSED, no new breakage.** The deciding
check came back clean with the enumeration I asked for rather than a bare conclusion: all 13
`perceivedActors` call sites were listed with each character's `requiresAlive` against the
value that step previously passed, and all 13 agree (twelve default-true characters that passed
an implicit `true`, plus the Ravenkeeper's explicit `false`). The Saint carries
`requiresAlive: false` but has no `perceivedActors` call site, so the one character that could
have made the refactor change who wakes does not reach it. **No behavioural change to who wakes
at any step** — which is the whole risk the refactor carried.
The dead-Monk/dead-Ravenkeeper witness was confirmed *absent from the diff* — not edited to
accommodate the refactor, which is what makes it evidence. The Imp overview fix preserves the
key match (`stepKey` returns `GROUP` for any non-per-actor `settleScope` regardless of the
`actorId` passed, so the row's key is identical to the cursor's), and the Imp is confirmed the
only step that is `grouping: 'per-actor'` with an explicit `settleScope: 'per-night'`. Minor
4's substitution is strictly safer than what it replaced: an undealt player's `team` defaults
to `'townsfolk'`, so the predicate is `false` where `characterById('')` used to throw. The
6-vs-7 pair pins the threshold at exactly 7 and the original 5- and 9-player tests were
**not** removed to make room — one new `it(` block, two strengthened in place, no removed test
blocks anywhere in the diff. 237 → 238 is honest.
Task 9: complete (commits cf32cc1..025202a, review clean after 1 fix round)

Task 10: implementer dispatched (sonnet), BASE 025202a. Property tests only — one file, no
production code. Carried §14 Tier 1's three named invariants, the §4.4 semantics as Task 3
actually implemented them (inclusive `<=` **and** the extra guard refusing a status before its
`appliedAt`; `until_dawn` → night N so the Monk survives to the Imp step;
`tonight_and_tomorrow` → day N so poison is gone at the start of night N+1; `permanent` →
null), and the instruction not to create `statusTimeline.ts`, which this plan deliberately cut
as a module with no caller and no test.
The warning I weighted most heavily is Task 7's defect repeated in a new place: **a generator
that cannot reach the states its property claims to cover.** Task 7's docstring certified the
fully-wrapped Chef edge while `evil.delete(spec.empathSeat)` made it structurally
unreachable. A status-lifetime property over generated traces fails the same way and more
quietly — if the traces rarely or never produce a status that actually crosses a phase
boundary, every invariant holds vacuously and the suite looks thorough. So I required
empirical non-vacuity (mutate the implementation, show a shrunk counterexample) plus a reported
distribution of the generated traces showing they genuinely reach the boundary-crossing
states, rather than a docstring asserting they do.
Task 10: implementer DONE (sonnet) — commit d438b3a, 243/243 (19 files), typecheck and lint
clean. One file added and **no production code touched**, which I verified from the diff
rather than the report; `statusTimeline.ts` correctly does not exist. It delivered both pieces
of evidence I demanded: three mutation counterexamples (each mutation reverted independently)
and a generated-trace distribution of **100% / 84% / 83.5%** across the three boundary-crossing
states — so none of the three invariants is vacuous, which was the whole risk on this task.
Verified the production tree myself for mutation residue before dispatching the review, since a
mutation left in would silently weaken the code the rest of the plan depends on:
`phase.ts:30-34` still carries **both** the `appliedAt` guard and the inclusive `<=`, and
`expiryFor` still returns night N for `until_dawn` and day N for `tonight_and_tomorrow`. Clean.

**Tenth plan-authored defect.** The implementer reports the brief's 4th property was broken:
its `poisonerAlive` gate made the two compared traces diverge in **event count**, not just in
whether the source was alive, so the property failed for a reason unrelated to the invariant it
claims to test. It applied poison unconditionally each night (matching how the brief already
handles `protected` and `master`) so the two traces differ only by the `DEATH` event.
Task reviewer dispatched (sonnet). Priority check is the one that would make this task worthless
while looking finished: **did that fix flatten the property into no longer testing its
invariant?** §14 requires "expiry is independent of whether the source is alive", so the
property must still genuinely vary the source's liveness between the two traces and assert the
expiry is unchanged — and an implementer editing a property until it passes is a failure mode
this plan has already produced. Told it the diagnosis being plausible is not enough; the
resulting assertion is what to judge. Also asked whether any property tautologically
re-implements the code under test by computing its expectation from `expiryFor`/`isStatusActive`
and asserting against the same function, which would prove only that the function equals
itself — the same independence bar Task 7's reference implementation had to clear.
Task 10: review — spec ✅, quality **Approved**, zero Critical, zero Important, 3 Minor. No fix
round needed, and the review earned that verdict rather than granting it: it verified every one
of the six named risks by independent recomputation instead of reading the report back to me.
- **The 4th-property fix does not flatten the invariant.** The reviewer checked `applyDeath` in
  the reducer and confirmed it only flips `alive` and appends to `deaths`/`todaysExecutions` —
  it never touches `statusLedger`. So with poison now applied unconditionally, the two traces
  are identical in every `STATUS_APPLIED` event and differ **only** in whether `DEATH` fires:
  the fix removed an incidental confound (differing event counts) while preserving the one
  variable §14's invariant is about. A real fix, not a test edited until it passed.
- **The mutation counterexamples survive independent algebra.** It re-derived each mutation's
  effect from `phaseOrdinal`/`isStatusActive` by hand and confirmed each reported counterexample
  is what that mutation must produce — including that mutation 3's `Expected ['p1'], Received
  []` is consistent with the argument order of the two-trace comparison. Claims that survive
  recomputation rather than merely reading plausibly.
- **The distribution claim reproduced.** It ran the committed generator standalone at
  `numRuns: 200` and got 100% / 80.5% / 83% against the reported 100% / 84% / 83.5% — different
  seed, same shape, no structurally unreachable case. It also confirmed no `fc.statistics` or
  console-log instrumentation was left in the committed file, which would have been test-output
  noise.
- **The `appliedAt` guard is load-bearing for this test, not incidentally satisfied.** It showed
  algebraically that for `now = night(N-1)` and `appliedAt = night(N)` the inclusive ordinal
  check alone evaluates *true*, so deleting the guard at phase.ts:31 flips this property's
  assertion and fails it.
- Five properties cover the three §14 invariants plus a positive-space persistence check and the
  `appliedAt` guard, each through a different selector or lifetime constant, so none is a
  restatement of another. Expected values are hand-written literals from the spec text rather
  than computed by calling the function under test — the independence bar Task 7 established.
Task 10: minor (deferred): property 4 replays `playTrace` from scratch per `cut` iteration,
O(n²) reduce calls. Harmless at numRuns 200 / maxLength 5.
Task 10: minor (deferred): the "keeps night-N poison active through day N" property only ever
exercises `actions[0]` and discards the rest of each generated array — correct and non-vacuous,
but most of its generation budget goes to a single-night scenario.
Task 10: minor (deferred): the two-trace comparisons lean on fast-check's counterexample dump
rather than a custom failure message naming which `cut`/branch diverged.
Task 10: complete (commits 025202a..d438b3a, review clean, no fix round)

Task 11: implementer dispatched (sonnet), BASE d438b3a. Carried the one thing that decides this
task: **§4.5's order IS the rule**, and it is exactly what the previous two drafts got wrong —
v2 stated the resolution twice, as pseudocode and as prose, and the two disagreed, with the
pseudocode starpassing *before* checking Monk protection. Told it not to reorder the guards for
readability and to report rather than change if it thinks the order is wrong, because two of the
spec's hardcoded rulings are **consequences** of the order rather than separate checks: §16.11
(a Monk-protected Imp targeting itself does not starpass) falls out of the protection check
preceding the self-target check, and §16.7's bounce re-runs exactly the already-dead, Monk and
Soldier guards — three, which is v3.1's correction of an earlier line that said "three" and
then named five.
Also carried, with the spec's own justification quoted, that **this is the task where §4.1
going wrong is worst**: the spec's stated reason for the invariant is literally "an implementer
writes `perceivedCharacterId(x) === 'soldier'` in the kill resolver and a Drunk-believing-Soldier
survives the Demon." `demonKill.ts` is **not** on the sanctioned-reader list, so the ESLint rule
will fire on that import — told it that is intended, that an `eslint-disable` is prohibited, and
that a Drunk-believing-Soldier must die and a Drunk-believing-Mayor must not bounce.
Carried the two labelling decisions so they are not read as drift (`already_dead` rather than a
second `no_effect`, because the dawn announcement renders the chain and the cases read
differently; and `mayorBounceTargetId: null` being a legal choice meaning the Mayor dies after
all), and the scope boundary that §4.6's `onDemonDeath` successor logic is a later task — this
one only reports `starpass: boolean`.
Named the test risk specific to this task: a suite can cover all seven outcomes and still never
pin their **relative order**, in which case it passes against the v2 ordering that starpassed
before checking protection. Required the §16.11 and §16.7 cases each be covered by a test that
would fail under the wrong order, and asked the report to name which test catches the v2
ordering. Also asked it, for every test it writes, to name the single-line production change
that would redden it — and to report the test as hollow if it cannot.
Task 11: implementer DONE_WITH_CONCERNS — commit e0dcff5, 267/267 (20 files, 24 new), typecheck
and lint clean. Exactly the two files the brief names. Verified myself before review: correct
trailer and author, **zero `eslint-disable`**, and no `perceivedCharacterId` import anywhere in
`src/engine/rules/` — the only occurrence of "perceived" is a test comment quoting the spec's
own rationale for the boundary, which is the right place for it. Also confirmed
`mayorBounceCandidates` is **not** dead code: it is called at demonKill.ts:104 to populate the
`needs_mayor_choice` outcome's candidate list, which is exactly its purpose.

**Eleventh plan-authored defect, and this one is a spec tension rather than a slip.**

**Task 11 Ruling: the brief's Mayor-bounce legality check made §4.5's own instruction dead code
and its own test impossible — ACCEPT the implementer's fix.** The brief validated the
Storyteller's chosen bounce target by reusing `mayorBounceCandidates`, which filters on `alive`,
and **threw** on anything not in that list. But §4.5 separately instructs re-running the
**already-dead** guard on the bounce target. Both cannot be true: if a dead bounce target throws
at the legality check, the already-dead guard below it can never fire. The brief's own test
("re-checks already-dead on the bounce target") consequently failed as written — it threw where
it expected `already_dead`. The fix makes the throw **structural only** (not the Mayor, not the
attacker) and lets aliveness fall through to the guard chain.
Why this reading rather than the other: (1) §4.5 explicitly names the already-dead guard on the
bounce target, and the alternative renders that instruction dead — this plan has already found
and deleted one dead check for exactly this reason (Task 5's `validateDeal` comparison).
(2) §4.8 lists "targeting a dead player" as an **`integrity`-class** break: "Recorded and
flagged, but produce **no derived state change**." An `already_dead` link with
`finalVictimId: null` *is* that behaviour; a throw is not, and §4.8 is a Global Constraint.
(3) Keeping the structural throws is consistent with the precedent I set in Task 4: §4.8
protects what already happened **at the table**, and the Storyteller's bounce choice has not
happened to anyone yet — it is being made in the app, like the illegal deal that `assignRoles`
throws on. The coherent principle the split encodes: where the guard chain has a defined
outcome for the deviation, let it fall through and record it; where it has none ("you picked
the Demon"), throw as malformed input.
Cost if wrong: a Storyteller who bounces onto a player who died earlier the same night gets a
recorded `already_dead` chain and nobody dies, instead of an exception. That is the strictly
more forgiving direction and the one §4.8 asks for.

Task reviewer dispatched on **opus** — kill resolution is the highest-consequence rules surface
in the plan and every failure here is silent at the table. Priority check: the guard **order**,
since a suite can cover all seven outcomes while pinning none of their relative positions and
would then pass against the v2 ordering that starpassed before checking protection. Asked for a
stated conclusion on which test catches that, on §16.11 (Monk-protected self-target must yield
`monk_protected` with `starpass: false`), and on §16.7's bounce re-running exactly the three
guards and not the two that cannot apply. Told it my ruling above and invited it to check the
*consequences* rather than accept it — if it disagrees, I adjudicate.
Task 11: review (opus) — spec ✅, quality **Approved**, zero Critical, 1 Important, 7 Minor.
The production code came back right where it matters: §4.5's order is implemented exactly once,
in one place, and **`guards()` is a single shared function used by both the first pass and the
§16.7 bounce re-run**, so the two passes cannot drift — the reviewer called that the best
decision in the diff and I agree. §16.11 is pinned on the **flag** as well as the label
(`starpass: false` plus the exact `[{p1,'monk_protected'}]` chain), which is precisely the
assertion that fails under v2's ordering. `starpass: true` occurs at exactly one site with
explicit `false` in all six other resolved branches. The two-link cap's unreachability claim
holds (the dealer draws distinct characters, so at most one Mayor exists). §4.1 reads the true
`characterId` everywhere, `src/engine/rules/` is correctly absent from the ESLint ignore list,
and the boundary test targets that exact path.
**The reviewer concurred with my Mayor-bounce ruling after checking its consequences** rather
than accepting it: `guards()` checks `!target.alive` first so a dead bounce target genuinely
yields `already_dead` (it ran the suite and confirmed the previously-impossible brief test is
now reachable and passing), the remaining structural throw cannot be tripped by a Storyteller
driving the offered candidate list, and `mayorBounceCandidates` still filters on `alive` so
"never offered" and "reported if it arrives anyway" are coherent rather than contradictory.
⚠️ item resolved by me: §4.8's `RULE_FLAGGED` for an off-constraint kill target is correctly
absent here — it is the command layer's job, and Task 16 does emit it (plan:10695 asserts
`RULE_FLAGGED` among a night step's resolved events). Not a gap.

**Task 11 Ruling: finding 1 (the guard order is only half pinned) — FIX.** This is not a
coverage nicety; it is the task's entire deliverable left unguarded. The order **is** the rule,
this is its third draft, and the suite covers all seven outcomes while pinning only two of the
six adjacent relations. The reviewer demonstrated the gap concretely: a `guards()` body
reordered to Soldier → Monk → already-dead passes all 24 tests unchanged, and so does hoisting
the Mayor branch above `guards()`. So the very reordering that broke v2 would ship green.
One of the three unpinned relations is worse than an ordering nicety at the table: if the Mayor
branch were hoisted above the protection check, a **protected** Mayor would trigger a bounce
choice, and the Storyteller would bounce a kill the Monk had already stopped — killing an
innocent player who should have survived the night. That is a live, silent, table-level harm
produced by a pure reordering the tests permit.
Fix: three fixtures, each a two-line addition to the existing helpers — a protected Soldier must
yield `monk_protected` and not `soldier`; a protected Mayor must resolve `monk_protected` and
**not** `needs_mayor_choice`; and a dead-and-protected player must yield `already_dead` and not
`monk_protected`.
Cost if wrong: three cheap tests on a file whose whole purpose is that ordering. There is no
credible downside.

Folded into the same round, all cheap and in the same two files: the non-discriminating "does
not bounce twice" test (it is the same call as an earlier test with a strictly weaker
`length <= 2` assertion that holds even for implementations that drop the `mayor_bounce` link
entirely — non-discriminating, not merely weak, which is the class this plan strengthens or
deletes); the `characterById(target.characterId).id === 'mayor'` round trip that returns its own
input and is the one line in the file that throws on an undealt player, where the Soldier check
two lines above already does the direct comparison; a doc-comment statement of the caller
contract for `mayorBounceTargetId` (`undefined` = not yet chosen, `null` = the Mayor dies after
all, an id = bounce) so a UI does not wire "or nobody" to the Mayor's own id and get an
exception at night — documenting rather than adding a second spelling for one intent, which
would muddy the audit record; a small set of `killDerivation` tests, since it is exported
production code with **zero** tests and six of its seven branches unexercised, and §8.2 makes
show-your-working the only defence against silent wrongness (consistent with the Task 7 ruling
that fixed the same class rather than deleting the code); a fixture for a **dead** attacker,
which reaches `no_effect` by the `requiresAlive` route rather than the poisoned route; and a
correction to the report's overstated verification claim that a `perceivedCharacterId`
substitution would redden the Drunk tests — it would not against the
`perceived === 'soldier' && abilityFunctional(...)` variant, because `falseSelfBelief` exists
only on the Drunk and `abilityFunctional` already excludes the Drunk on the true id. The tests
are worth keeping and the code is correct; the claim about what they witness is the wrong part.
Task 11: minor (deferred): `killDerivation` is extra surface relative to the two named
functions, but verbatim brief-mandated, so not drift.
Task 11: fix round 1/5 — resumed the original implementer (context intact), FIX_BASE e0dcff5.
Task 11: fix round 1/5 — implementer DONE, commit 389f3ef. 278/278 (20 files), typecheck and
lint clean. All six adjacent guard-order relations in §4.5 are now pinned, and the evidence is
the strongest of any round so far: for each of the three new fixtures it reordered the
production guards to the specific wrong ordering, pasted the **FAIL**, then restored and pasted
the pass. It also went beyond what I asked — it ran the **full file** under each reordering to
show the result is `1 failed | 34 passed`, i.e. each reordering reddens *only* the fixture that
targets it. That distinguishes a fixture that pins one specific relation from one that merely
breaks under many changes, which is the distinction this round existed to establish.
Verified myself before the re-review: **no `TEMP` residue anywhere** in `src/engine/rules/`, so
none of the three temporary reorderings survived into the commit, and the Mayor check is now the
direct `target.characterId === 'mayor'` comparison rather than the `characterById(...).id`
round trip. Scoped re-review dispatched (sonnet) over e0dcff5..389f3ef, asked to reason about
each new fixture independently rather than accept the pasted evidence, and to confirm the
committed `guards()` order is already-dead → Monk → Soldier with the Mayor branch below it.
Task 11: fix round 1/5 re-review — **all 7 findings ADDRESSED, no new breakage.** The
re-reviewer reasoned each new fixture independently instead of accepting the pasted failure
evidence, and its analysis surfaced the detail that makes the third fixture work:
`isProtected`/`hasEffectiveStatus` reads only the status ledger and **never** `player.alive`, so
a dead protected player genuinely still satisfies `isProtected` — which is precisely why
already-dead-before-protection is a real relation to pin rather than a vacuous one. It also
confirmed the protected-Soldier fixture discriminates because `abilityFunctional` does not look
at `protected` status at all, and that asserting `kind` on the protected-Mayor fixture targets
exactly the field that flips (`resolved` → `needs_mayor_choice`) under the hoisted ordering.
Minor 2's substitution was proven behaviour-preserving rather than merely non-throwing:
`CHARACTERS` is built as `Object.fromEntries(LIST.map(c => [c.id, c]))`, so
`characterById(id).id === id` holds tautologically for every registered id, while the undealt
case now evaluates `false` instead of throwing. The eight `killDerivation` tests assert
`toEqual` against exact string arrays checked against the switch's template literals — not
hollow. The dead-attacker fixture reaches `no_effect` through `aliveRequirementMet` with no
poison status in the fixture, so it is a genuinely distinct route from the poisoned-Imp test.
Count reconciles exactly: 24 + 3 + 1 + 8 − 1 = 35, and the only removed lines in the whole diff
are the one dropped non-discriminating test.
Task 11: complete (commits d438b3a..389f3ef, review clean after 1 fix round)

Task 12: implementer dispatched (sonnet), BASE 389f3ef. Five files — §4.6's shared demon-death
handler and §4.7's victory predicates, the two sections that only work together.
Carried, with the reasoning rather than just the instruction: **R5's `closeDay`/`beginNight`
split and the brief's row-2 phase scoping interlock**, and I said so explicitly, because an
implementer who "fixes" either one silently breaks the other. Row 2 works only because the
day-close transaction is still in day N; if `closeDay` advanced the phase, evil could never win
by Saint execution and a poisoned Mayor would be functional again at the check and win for good.
Told it both are settled and to report rather than adjust.
Also carried: `VictoryContext` stays exactly one field on purpose (deviation 9 — the split makes
victory phase-sensitive with no extra plumbing, and Task 13 consumes the interface as-is);
§16.9's Scarlet-Woman-beats-starpass as a **named constant with both branches tested**, since
the spec records the ruling as genuinely contested and names the alternative, so it must stay a
one-line flip rather than being inlined; §16.1's arithmetic contract (the view arrives from
*before* the `DEATH` event, so `aliveCountAtDeath` counts the dying Demon — calling it after
turns the Scarlet Woman's threshold from 5 into 6, i.e. she silently stops promoting at exactly
the table size where she should start); and §4.6/§16.12's true-character gate, whose v2 failure
was that any successful Slayer shot routed here, so a Recluse ruled as the Demon promoted the
Scarlet Woman while the real Imp lived — **two living Imps**.
Told it §4.1 binds these files (a Drunk-believing-Mayor must not win for good, a
Drunk-believing-Saint must not hand evil a win) and that neither `src/engine/rules/` nor
`selectors/victory.ts` is a sanctioned reader, so the lint failure is intended and a disable is
prohibited. Passed on that the plan's four victory rows were independently verified against
§4.7 in an earlier session, while noting that verification was of plan text and the plan has
since produced eleven executed defects, so transcription is still the implementer's to get right.
Named the test risk carried straight over from Task 11: **row precedence must be pinned, not
merely implemented.** A suite can cover all four rows independently and still pass with the rows
reordered — and putting row 3 ahead of row 1 turns a Demon death that brings the count to 2 into
an **evil** win instead of a good one, which is a wrong game result, silently. Required at least
one test that fails under reversed precedence, named in the report.
Task 12: implementer DONE_WITH_CONCERNS — commit c5d0909, 307/307 (22 files), typecheck and lint
clean. Exactly the five files the brief names, zero `eslint-disable`, and it correctly
**reported rather than edited** a file another task owns (eslint.config.js is not in the diff).
Twelfth plan-authored defect: the brief's `victory.ts` block carried an unused `characterById`
import that fails `tsc --noEmit` under `noUnusedLocals` — same class as Task 8's `CharacterId`.

**Task 12 Ruling: the §4.1 ESLint guard has a real hole. FIX it in Task 12's fix round rather
than deferring to the final review.** The implementer found it and I verified it myself
empirically rather than by reading the config: piping a file named
`src/engine/selectors/probe.ts` through the real eslint CLI, an import of
`perceivedCharacterId` from `@/engine/selectors/players` **errors** with the §4.1 message,
while the identical import written `from './players'` produces **no error at all**.
`no-restricted-imports` matches the literal import-specifier string, and the configured groups
are `['**/selectors/players', '@/engine/selectors/players']` — neither of which can match
`./players`. So **any file inside `src/engine/selectors/` can read perceived character with the
guard silent.**
Not currently exploited — I checked. The only non-test relative import of `./players` carrying
`perceivedCharacterId` is `nightCursor.ts`, which is a sanctioned reader anyway, and the three
other non-test files that mention the name are two comments plus §3.6's required
`perceivedCharacterId?` field on the `NIGHT_STEP_RESOLVED` payload. No violation exists today.
But `seating.ts` already imports `./players` for other symbols, so the relative-import idiom is
in live use in exactly that directory, and **Tasks 16 and 18 both add new files there**
(`registrationLedger.ts`, `replay.ts`). Building six more tasks on a guard with a known hole is
precisely the silent-wrongness this project treats as the risk that matters, and §4.1's rule is
the *single* enforcement mechanism for the invariant the plan calls the only thing standing
between the design and a Drunk-believing-Soldier surviving the Demon.
Fix: add the relative forms (`'./players'`, `'../players'`) to the pattern group, **and** extend
Task 6's boundary test with a case asserting the rule fires on the relative form — otherwise the
closed hole is itself unguarded, and a rule that never fires is indistinguishable from no rule.
Cost if wrong: two extra strings in a lint pattern and one more boundary test. The alternative is
an enforcement mechanism that six remaining tasks can bypass by accident.

Task reviewer dispatched on **opus** — victory and demon death are the highest-consequence rules
surface in the plan and every failure is a wrong game result rather than a visible crash.
Task 12: review (opus) — spec ❌, quality **Needs fixes**: zero Critical, 4 Important, 8 Minor.
The best-evidenced review of the plan so far: the reviewer **mutation-tested every
behaviourally distinguishing clause** rather than reading the code, and reported which single
test each mutation reddened. Both of the implementer's headline claims survived that treatment.
Row precedence is genuinely **pinned** — swapping rows 1 and 3 in `VICTORY_PREDICATES` reddens
exactly one well-named test — and the reviewer went further and proved the *absence* of the
Task 11 failure mode by showing no other adjacent relation can change a winner (rows 2↔3 differ
only in `reason`, 3↔4 and 2↔4 are mutually exclusive, and 1↔2 would need a Demon death and a
Saint execution in one transaction, which a single execution cannot produce). §16.1's threshold
is pinned in **both** directions (a `SCARLET_WOMAN_THRESHOLD` of 4 or 6 each reddens a distinct
test), §16.9's constant is a real one-line flip (flipping it reddens a test, and the `false`
branch is separately exercised), and row 2's retroactive test is load-bearing rather than
incidentally green — the reviewer checked the fixture's poison genuinely lapses by night 3
against `phase.ts`'s ordinals instead of trusting it. Also confirmed **none of the five files
imports `perceivedCharacterId` by any path**, so Task 12 does not walk through the ESLint hole.

**Task 12 Ruling: findings 1–4 — FIX all four. They are one defect wearing four hats: a
load-bearing guard with no witness.** In each case the reviewer *deleted the guard and the whole
suite stayed green*, which is the precise definition of untested behaviour, and three of the
four hand out a wrong game result rather than crashing:
- **Row 4's `aliveCount === 3`** — deleting it returns `{good, mayor_no_execution}` for a **day-1
  close with all 7 players alive**. Every existing `dayClosed` test happens to sit at exactly 3
  alive, so nothing distinguishes the clause. This is the *same* failure mode, in the *same
  row*, as the `todaysExecutions` clause the spec records as previously broken by a singular
  `executedId` field.
- **The pre-deal guard** — deleting it hands good the game before the deal. Worse, the guard the
  brief mandated **cannot work**: `view.players.length > 0` reads as a pre-deal guard but seats
  exist before roles do, so `VICTORY_PREDICATES[0].test` returns `true` on a `GAME_CREATED`-only
  view (all seats default to `team: 'townsfolk'`, so `livingDemon` is undefined). The clause that
  actually guards is `characterId === ''` in `checkVictory`, which the brief never asked for and
  no test covers.
- **§16.12's true-character gate** — deleting it leaves 29/29 green. It is the only thing
  preventing the two-living-Imps defect the ruling exists for.
- **§4.1** — holds only by absence: neither test file mentions the Drunk, so nothing would catch
  a future switch to a perceived read in the Mayor or Saint predicate. Two tests, both passing
  today (the reviewer probed them), and they are the only witness this invariant would have here.
Cost if wrong: four cheap tests plus one consolidation on the highest-consequence predicates in
the plan. There is no credible downside.

**Task 12 Ruling: consolidate the pre-deal guard to one place rather than making it
`characterId`-aware on all four rows.** The brief's per-row requirement is itself wrong, and
keeping a clause that reads as a guard but cannot fire is exactly the dead-code-that-lies class
I ordered deleted in Task 5 (`validateDeal`'s chart comparison) and Task 6 (the hollow
registration assertion). So: delete the two dead `players.length > 0` clauses, keep the single
effective guard in `checkVictory`, **test it**, and leave a comment at `VICTORY_PREDICATES`
saying the predicates assume a dealt game and `checkVictory` is the gate — because they are
exported, and a future direct caller deserves the warning at the point of use rather than in a
ledger. Note the predicates are already *safe* pre-deal by design (row 1 reads the pre-derived
`team` precisely to avoid a `characterById('')` throw); they are simply not *correct* pre-deal.
Cost if wrong: a direct caller of `VICTORY_PREDICATES` that bypasses `checkVictory` gets a
pre-deal answer, warned by a comment instead of a duplicated guard. Nothing in the plan does.

**Task 12 Ruling: turn §16.1's contract into an enforced precondition, which retires the ⚠️
item structurally instead of by carrying a convention into three future dispatches.** The
reviewer's one ⚠️ is that a caller passing the **post-DEATH** view is undetectable from inside
`onDemonDeath` — it computes `aliveCount(view)` itself and only documents the requirement in a
comment. That off-by-one turns the Scarlet Woman's threshold from 5 into 6, i.e. she silently
stops promoting at exactly the table size where she should start, and the callers (night kill,
execution, Slayer) are Tasks 14–16, still unwritten. A comment cannot survive three tasks.
But the precondition is checkable in one line: in the pre-DEATH view the dying Demon is still
`alive`, and in a post-DEATH view they are not. So `onDemonDeath` throws if the named player is
already dead. §4.6 is only ever invoked at the moment of death, so it cannot fire in correct
operation — and it converts the silent off-by-one into a loud, immediate failure at exactly the
call site that got it wrong.
Cost if wrong: a caller that legitimately wanted to resolve an already-dead Demon must pass the
earlier view. No caller in the plan does, and §4.6's three invocation points are all
death-moment.
Task 12: fix round 1/5 — implementer DONE, commit 18fee53. 323/323 (22 files, +16), typecheck
and lint clean. All four Important findings plus my two additions (the §16.1 precondition and
the ESLint hole) fixed, each with the mutation evidence I required: guard deleted → covering
test reddens with pasted output → restored → green. Six files, the two extra ones
(`eslint.config.js`, `test/eslint-perceived-character.test.ts`) being the authorised FIX 6.
**I verified the ESLint fix empirically myself rather than from the report**, because I had
verified the hole that way: both `'./players'` and `'../players'` now error with the §4.1
message, and — the check that matters more — `nightCursor.ts`, the sanctioned reader that
legitimately imports via `'./players'`, is **still exempt**. So the hole closed without
breaking the one file that genuinely needs the import, which an over-broad pattern would have
done silently.
Scoped re-review dispatched (sonnet) over c5d0909..18fee53. Told it to reason independently
about whether each of the four new guard tests genuinely *pins* rather than merely exercises,
since that distinction is the entire reason this round exists; to confirm FIX 2 deleted the dead
clauses rather than rewording them and did **not** make the guard `characterId`-aware on all
four rows (explicitly not wanted); and to check FIX 5's precondition cannot fire on a valid call
— a precondition that rejects legitimate input would be worse than the off-by-one it prevents.
Task 12: fix round 1/5 re-review — **all 6 findings ADDRESSED, no new Critical/Important
breakage.** Every one of the four guard tests was verified to *pin* rather than merely exercise:
the re-reviewer reasoned each mutation independently and confirmed it produces a
differently-shaped result the assertion catches, not an incidental pass. FIX 2's consolidation
is exactly as ruled — both dead clauses **deleted** rather than reworded, `checkVictory`'s
`characterId === ''` gate untouched and now tested, the comment added at `VICTORY_PREDICATES`,
no row made `characterId`-aware, still exactly four frozen predicates and no fifth row. FIX 5's
precondition reads `dead.alive` for the **named** player specifically (not any player, not the
successor), so it cannot reject a legitimate call. FIX 6's boundary test asserts both the rule
id and the `§4\.1` message text against a real non-ignored file in that directory, not a bare
error count. The `demonDeathDerivation` signature change was verified against the tree: the only
references in either commit are its own definition and its own test, so "no existing caller"
holds. 307 → 323 reconciles exactly (+7/+8/+1) with no existing assertion deleted or loosened —
the only production removals are the two intentionally-dead clauses and a non-null-assertion
cleanup. The Drunk tests were confirmed honest: they pass today for the right reason and are
correctly framed as regression pins against a future perceived-read, not as fixes to a live bug.
Task 12: minor (deferred): `demonDeathDerivation`'s `needs_successor_choice` branch has three
reachable `why` sub-cases (no Scarlet Woman / below threshold / the constant is false); only the
below-threshold case has a rendered-string assertion. The other two were verified correct by
reading, so this is an unpinned-prose gap rather than a defect — a future edit to that ternary
could change the wording without reddening a test.
Task 12: complete (commits 389f3ef..18fee53, review clean after 1 fix round)

Task 13: implementer dispatched (sonnet), BASE 18fee53. The store is the single write path every
remaining task is written against, so I carried the four properties that make or break it with
their consequences rather than as a checklist: **atomicity** (a throwing transaction must append
nothing and notify nobody — a half-applied transaction is the worst failure here because five
later tasks build on it and a partial write is silent); **once-per-commit victory**, quoting the
spec's own record that a per-event reading "declares good the winner the instant the Imp dies,
before the Scarlet Woman's `ROLE_CHANGED` lands, undoing §4.6 entirely", so commit-time is the
only ordering under which she ever promotes; **undo drops every event sharing the last `txId`**,
not just the last event; and the two Spy events being non-undoable audit trail.
Explained the **clock seam** so it is not mistaken for a purity violation: §3.2 stamps `ts` in
the command layer and never inside `applyEvent`, the store sits outside `src/engine/reducer/**`
where the purity project arms its stubs, and the injectable `clock` is what keeps tests
deterministic — so `Date.now()` here is correct and the parameter must not be removed. Also
warned that §3.5's referential-identity requirement is satisfied by Task 4 and can be silently
destroyed from *this* layer by cloning state on the way through, defeating a property fourteen
tasks were built on.
Named three specific hollow-test traps, because the last two tasks each shipped guards that
survived deletion with a green suite: an undo test cannot distinguish "drops the txId" from
"drops the last event" unless the transaction emits **more than one** event; an atomicity test
must assert the event count and state are unchanged rather than merely that an error was raised;
and a once-per-commit victory test must **count calls with a spy**, because asserting the final
victory value passes under both orderings.
Task 13: implementer DONE_WITH_CONCERNS — commit 605d053, 343/343 (23 files), typecheck and lint
clean, output pristine. Exactly the two files the brief names. Verified myself before review:
correct trailer and author, no `eslint-disable`, **no deep cloning in `store.ts`** (so §3.5's
referential identity is not obviously destroyed at this layer), and the clock seam is the right
shape — `clock: () => number = () => Date.now()` at store.ts:46 consumed as `ts: clock()` at :72.
The only `perceivedCharacterId` in the diff is a `NIGHT_STEP_RESOLVED` **payload field** in the
test file, which §3.6 requires, not an import of the restricted function.

**Defects thirteen and fourteen, both test fixtures in the brief that could not pass as
written** — the same class as Task 9's Undertaker roster:
- a `dayClosed` test killed only 3 of 7 players, leaving **4** alive, while
  `mayor_no_execution` needs exactly 3. The test's own comment said "three alive"; the fixture
  just did not kill enough people.
- the `drops every event sharing the last txId` test asserted an **empty status ledger** for p4,
  who is that fixture's **red herring** — a permanent status, so that ledger can never be empty.
  Fixed by asserting the `protected` entry specifically is gone.

Task reviewer dispatched on **opus** — the store is the single write path Tasks 14–18 are all
written against, so it earns the same treatment as Task 4's reducer. The priority risk I named
is one the tests are most likely to miss: **atomicity of the fold cache, not just the event
log.** The store caches `(lastState, lastSeq)` for §3.5's incremental fold, so a transaction
that appended to an internal buffer and *then* threw could roll back the log while leaving the
**cache** describing events that no longer exist — silent, permanent, and invisible to a test
that only checks the event count. Also asked whether once-per-commit victory is pinned by
**call counting** rather than by its result (the two orderings usually agree, so the result
proves nothing), whether the undo tests use multi-event transactions (a single-event tx cannot
distinguish "drops the txId" from "drops the last event"), whether the incremental fold is
tested against a from-scratch replay of the same log, and what `undo()` does when the last
transaction is a non-undoable Spy view — specifically that it cannot reach *behind* an
audit-trail event and rewrite history that the audit trail attests to.
Task 13: review (opus) — spec ✅, quality **Needs fixes**: zero Critical, 5 Important, 10 Minor.
The store itself is correct on every §-numbered property the brief names, and the reviewer
established that by reading rather than trusting. **My named atomicity risk came back clean and
for a better reason than I expected**: there is no separate `(lastState, lastSeq)` pair to
desync at all — `seq` derives from `events.length + staged.length`, `staged`/`stagedState` are
locals discarded on throw, `events`/`state` are never reassigned until commit, and `txCounter`
is explicitly restored. The commit path cannot desync. But the reviewer then found the *mirror
image* of the hazard on the **undo** path, which I had not asked about (Important 3).
Once-per-commit victory is genuinely pinned, though not by the seam I assumed: the spy counts
commits rather than `checkVictory` calls, and the real backstop is behavioural — the
"does not end the game mid-transaction when a successor promotes" test would fail under
per-event evaluation, because row 1 fires the instant the Imp's `DEATH` lands and before
`ROLE_CHANGED`. Multi-event undo is pinned three ways (length, plus one assertion keyed to the
first event and another to the second). §3.5's referential identity survives the store: no
spread, `Array.from` or `.map()` over state, and the one `.map()` clones **events** on the undo
path where §3.5 already mandates full replay. Both of the implementer's fixture diagnoses were
independently reproduced from the reducer and predicate source, and — the thing I asked about —
neither fix weakened the property under test; the `dayClosed` test still pins that flag in both
directions. It also caught that `lastUndoableTxId` is shared by `undo`, `canUndo` **and**
`lastTransactionLabel`, so the undo button's caption cannot drift from what undo will drop.

**Task 13 Ruling: findings 1–5 — FIX all five. Four of them are unguarded seams that produce
silent log corruption with no type error, no lint error and no test, on the one file five
remaining tasks are written against.**
- **Re-entrant `transaction()`** — a command body (or a subscriber) calling `store.transaction`
  makes the inner commit grow `events` while the outer's staged events keep stale `seq`, the
  outer's `state = stagedState` **discards the inner transaction's changes entirely**, and an
  outer throw then decrements `txCounter` into the txId the inner already committed — the exact
  collision `highestTxNumber` exists to prevent, where one undo drops two transactions. Fix is a
  boolean. Note this is not a restriction being imposed: §3.2's "one Storyteller action = one
  transaction" makes nesting **semantically wrong by definition**, so throwing is the correct
  semantics rather than a limitation.
- **Unbounded `Tx` lifetime** — and the async half is worse than the retained-`tx` half.
  `body: (tx: Tx) => void` accepts an `async` function under TypeScript's void-return special
  case, and this repo's ESLint is `tseslint.configs.recommended`, which is **not** type-checked,
  so `no-misused-promises` is unavailable to catch it. An async body typechecks, lints clean,
  commits early with a partial transaction, and drops everything emitted after the first
  `await`. A `closed` flag catches the post-commit emit — but if the async body awaits and then
  emits nothing further, the flag never fires and the transaction silently committed partial
  events with **no error at all**. So rejecting a thenable return from `body` is not optional
  polish; it is the only thing that catches that case. Both.
- **`undo()` assigns `events` before computing `state`** — `applyEvent` throws in four places,
  so a rejected post-undo log propagates out with the log already truncated and `state` still
  reflecting the pre-undo log: `getEvents()` and `getState()` disagree **forever**, silently.
  The reviewer tried and failed to construct a reachable log, so this is narrow — but it is the
  one rollback the commit path gets right and the undo path gets wrong, and it is two lines.
- **§4.8's `flag()` is asserted nowhere**, and neither is `view()`. Two of `Tx`'s four methods
  go to five downstream tasks unverified, and "off-constraint picks emit `RULE_FLAGGED` in the
  same transaction" is a binding requirement *of this task*.
- **The post-undo `seq` renumber has no test** — deleting the renumber leaves every existing
  test green, because `getState()` still equals `reduce(getEvents())` (both read the same stale
  `seq`) and no other test undoes. §3.2's `seq === array index` is part of Plan 3's replay
  contract, and `DeathRecord.seq`/`RuleFlag.seq`/`InfoRecord.seq` all derive from it.
Cost if wrong: two guards that throw on operations no correct caller performs, two lines of
reordering, and three tests. Against silent log corruption on the single write path.

Folded in: spy on the victory module so the "exactly once" test counts `checkVictory` calls
rather than commits (the current seam is one indirection off the property it names); delete the
dead `victory.reason !== null` clause (same dead-clause-that-lies shape I had removed from
`victory.ts` in Task 12, and here it would *mask* a divergence between the returned victory and
`state.victory`); `if (label)` → `label !== undefined`, so `transaction('', …)` returns `''`
rather than falling through to a derived caption; skip `notify()` and the `labels` write when a
transaction stages nothing, since today an empty transaction notifies subscribers, leaks an
unreachable `labels` entry, and makes `lastTransactionLabel()` report the *previous* action's
label after a successful new one; isolate listener errors per listener, because a throwing
subscriber currently aborts the remaining listeners and propagates **after** commit, so a caller
catching it sees the documented rollback contract violated when in fact the commit succeeded;
throw on an unparseable txId in `highestTxNumber` rather than yielding 0 and reminting `tx1`
over an existing id; drop the redundant `events.length > 0 ? reduce(events) : initialState()`;
and correct the report's test miscount (it says fourteen transcribed tests; there are twenty).
Task 13: minor (deferred): `onVictoryCheck` is a test-only hook on the production
`TransactionOptions` surface. Brief-mandated; flagged for the final review rather than removed
mid-plan, since Tasks 14-18 may pass options through.
Task 13: minor (deferred): repeated `undo()` has no floor and will undo the `GAME_CREATED`
transaction, and combined with the Spy skip-past it can strip history from *around* a retained
`SPY_VIEWED`, leaving the audit trail attesting to a grimoire state no longer in the log.
Brief-mandated, and the alternative — one Spy view permanently disabling undo — is worse.
Task 13: fix round 1/5 — resumed the original implementer (context intact), FIX_BASE 605d053.
Task 13: fix round 1/5 — implementer DONE, commit a2c6724. 349/349 (23 files), typecheck and
lint clean and pristine. All five Importants and all eight folded minors applied, with the
mutation transcript I required for FIXes 1, 2 (both halves), 3 and 5.

**Ruling correction: my FIX 5 instruction named the wrong test, and the implementer was right to
override it.** I told it to put the post-undo `seq` index-equality assertion in
`'drops every event sharing the last txId'`. That test's undo always removes the **tail-most**
transaction, where a `seq` gap can never appear — so the assertion would have passed whether or
not the renumber happened, i.e. I would have specified a hollow test while fixing a hollow-test
finding. It moved the assertion to `'never drops the Spy audit trail'`, whose undo removes a
**non-tail** transaction thanks to the Spy skip-past, which is the only place a gap actually
occurs, and verified by mutation that it reddens there and stays green at my location either
way. Accepted, and recorded because it is the second time this session a prescription of mine
was wrong in detail while the diagnosis was right (the first was the Librarian
`hasTrueOutsider` predicate, where a second review supplied the missing actor exclusion). The
lesson generalises: a finding names a defect, but the *location* of its witness needs the same
"would this go red?" test as the witness itself.
Cost if wrong: the assertion sits in a differently-named test than the one the finding cited.
Against having shipped an assertion that could not fail.
Also accepted: FIX 3 has **no naturally reachable failing scenario**, and the implementer
established that structurally rather than assuming it — both `NON_UNDOABLE_EVENT_TYPES` are
no-ops in `applyEvent`, so any log undo can produce is provably a valid prefix. It covered the
ordering with fault injection (`vi.spyOn` on `reduce`) and **labelled it as regression coverage
rather than a real-world case**, which is the honest treatment: the reordering is still correct
and still cheap, and now a future reducer that gains a throwing path cannot silently desync.
Scoped re-review dispatched (sonnet) over 605d053..a2c6724.
Task 13: fix round 1/5 re-review — **all 5 Importants and all 8 minors ADDRESSED, no new
Critical/Important breakage.** Both deviations adjudicated in the implementer's favour after
independent verification. The FIX 5 relocation holds: the re-reviewer traced both test bodies
and confirmed the original location undoes the **tail-most** transaction (so surviving events
satisfy `seq === index` regardless of renumbering) while the new location undoes a **non-tail**
one, producing the gap — it called the relocation "correct engineering, not a rationalization."
FIX 3's structural claim holds too, verified against source rather than the report:
`NON_UNDOABLE_EVENT_TYPES` is exactly the two Spy events and both are literal `return state`
no-ops in `applyEvent`, so any log undo produces is a valid prefix plus a no-op suffix and no
domain path can reach `reduce`'s four throw sites. The guard reset was the risk I named and it
is right: `inTransaction` clears in a `finally`, which runs even when `catch` rethrows, so one
failed transaction cannot brick the store — and a test proves it. FIX 2's two halves were
confirmed **independently necessary**: the sealed flag alone misses an async body that awaits
and never emits again, the thenable check alone misses a retained `tx` called from a separate
stack. `isThenable` short-circuits on `typeof value === 'object'`, so a sync body returning a
number or plain object is never rejected. 343 → 349 is exactly six new tests with none deleted,
and the one rewritten test is a strengthening (it now spies on `checkVictory` itself rather than
the `onVictoryCheck` seam).
Task 13: minor (deferred): store.ts:497-499 — the new broken-predicate throw does not decrement
`txCounter`, unlike the other two throw paths in `transaction()`, so if it ever fired it would
permanently skip a txId. Practically unreachable (every victory predicate carries a non-null
reason) and a skipped txId is not a correctness hazard — `highestTxNumber` and undo tolerate
gaps by design. Cosmetic asymmetry.
Task 13: complete (commits 18fee53..a2c6724, review clean after 1 fix round)

=== SESSION BOUNDARY: handoff written 2026-09-07 23:2x. Tasks 1-13 complete; 14-18 remain. ===

Task 14: pre-dispatch verification of the brief against the tree (BASE a2c6724). Confirmed
correct and needing no ruling: `TeamCounts` is `{townsfolk,outsider,minion,demon}` singular, so
the test fixtures' distribution literals type-check; `masterOf`, `abilityFunctional(view,player)`,
`ringOrder`, `aliveCount`, `playerById`, `toRulesView` all exist with the signatures the brief
calls; `Nomination` already carries `day`, `votes`, `closed` and `closedThreshold`, and the
reducer's `NOMINATION_CLOSED` freezes `closedThreshold` from `auditThreshold`; `VOTE_CAST`
already refuses a duplicate vote on the same nomination (so the integrity test's "counted once"
assertion is the reducer's behaviour, not a hole); `EXECUTION` is forensic and `DEATH` is what
appends to `todaysExecutions`, so `EXECUTION { playerId: null }` leaves the list empty as the
zero-nomination test asserts; `onDemonDeath(view, id, {starpass:false, chosenSuccessorId:null})`
returns `kind:'resolved'` with a null successor, which is the shape `closeDay` destructures; the
store's `TransactionOptions` really does carry `dayClosed` and `GAME_ENDED` is appended inside
the same transaction at commit, so the five-event assertion is reachable; and the §4.1 ESLint
group is `importNames`-scoped to `perceivedCharacterId`/`playersWithPerceivedCharacter`, so
`nominations.ts` importing `{aliveCount, playerById}` from './players' does not trip it.

**R9 — Task 14's `dayCommands.ts` block does not compile as written; two missing imports.**
`nextNominationId(state: GameState)` names `GameState`, and `closeNomination` calls
`butlerViolations(state, nominationId)` — neither is in the block's import list, which imports
only `{ PlayerId, VictoryReason }` from `../types` and `{ nominationIssues, resolveDayExecution,
tallyFor, threshold, voteIssues }` from `../selectors/nominations`. Both are `tsc` TS2304s.
Ruling: add `GameState` to the type import and `butlerViolations` to the selector import;
change nothing else. Same class as Task 8's `CharacterId` and Task 12's `characterById` —
defects fifteen and sixteen, and the first two of this session.
Cost if wrong: none — the alternative is not compiling.

**R10 — Task 14 does not touch `src/engine/reducer/applyEvent.ts`, and its commit message drops
two stale claims.** The Commit step's `git add` names `applyEvent.ts` and the message says the
task "Also fixes the reducer's Butler check from Task 4, which ignored status expiry and ability
functionality." **There is no Butler check in the reducer** — I grepped: zero occurrences of
`butler` in `applyEvent.ts`, and `types.ts:106-112` records that `Vote` deliberately has no
`butlerViolation` field precisely because guide §10's "in either order" clause makes a frozen
flag wrong, so the violation is a Task 14 *selector* over the final vote set. The message's other
claim — the day close "advances to night in one undoable transaction" — contradicts R5, which
this task's own Step 4 implements and whose own test asserts the phase stays on day 1. Both are
v1-draft residue, the same class as R8's phantom Task 4 defect.
Ruling: `applyEvent.ts` is untouched and drops out of the `git add`; the final paragraph of the
commit message is deleted; the day-close paragraph is corrected to say the close does **not**
advance the phase and that a separate `beginNight` does.
Cost if wrong: if the reducer genuinely needed a Butler fix it lands in Task 16 or the final
review instead. Verified by direct grep that it does not.

Task 14: implementer dispatched (sonnet), BASE a2c6724.

**Pre-rulings for Task 15, found while waiting on Task 14's implementer.** I verified its brief
against the tree the same way. Three findings, two of them compile errors.

**R11 — Task 15's two test fixtures push event payloads that are missing required fields.**
Task 4 added `nomineeId` and `registrationRulings` to `VIRGIN_TRIGGERED`, and `registrationRulings`
to `SLAYER_CLAIMED` (events.ts:121-150, both documented as deliberate additions to §3.6's shape).
Both fields are **required**, and `LogBuilder.push` is typed `Extract<GameEvent,{type:T}>['payload']`,
so an object literal missing them does not compile. Task 15's brief pushes:
- `VIRGIN_TRIGGERED { nominatorId: 'p5', fired: true }` — missing `nomineeId` **and**
  `registrationRulings`;
- `SLAYER_CLAIMED { …seven fields… }` — missing `registrationRulings`.
The `nomineeId` omission is worse than a compile error: the reducer's VIRGIN_TRIGGERED case is
`mapPlayer(state, event.payload.nomineeId, …)`, so even under a looser type the fixture would set
`virginTriggered` on nobody, and the test that depends on it ('does not fire on the second
nomination against the Virgin', which asserts `consumed: false`) would fail for a reason unrelated
to the rule it names. Ruling: add `nomineeId: 'p4'` and `registrationRulings: []` to the
`VIRGIN_TRIGGERED` push, and `registrationRulings: []` to the `SLAYER_CLAIMED` push. Defects
seventeen and eighteen.
Cost if wrong: none — the alternative is not compiling.

**R12 — Task 15 does not touch `src/engine/events.ts` or `src/engine/reducer/applyEvent.ts`.**
Its Commit step's `git add` names both. Neither needs a change: Task 4 already carries both payload
additions R11 relies on, and the reducer already has working `VIRGIN_TRIGGERED` and `SLAYER_CLAIMED`
cases (the former sets `virginTriggered` off `nomineeId`, the latter sets `slayerUsed` only when
`claimantIsRealSlayer`). Same stale-`git add` shape as R10 and the same class as R8's phantom
Task 4 defect. Ruling: drop both from the `git add`; the implementer verifies the fields are
already present rather than adding them, and its reviewer must not read the absent hunks as a
missing requirement.
Cost if wrong: if a payload field were genuinely absent, tsc fails loudly at Task 15's own step.

**R13 — the Virgin can never kill the Demon, and that is by construction rather than by luck, so
Task 15 needs no `onDemonDeath` route in `applyVirgin`.** I checked this before it could become a
reviewer finding, because `claimSlayer` right beside it *does* route and the asymmetry looks like
an omission. `fired` requires the nominator to be a true Townsfolk or a Spy ruled Townsfolk;
`canRegisterAsTeam('imp','townsfolk')` is false, and no other character with a Demon team has a
townsfolk registration option. The same argument covers §4.7 row 2's "or Virgin" clause for the
Saint: the Saint is an Outsider and cannot be ruled Townsfolk either, so a Virgin-executed Saint
is unreachable in Trouble Brewing and row 2's clause is defensive breadth, not a live path.
Cost if wrong: a Demon executed by a Virgin trigger would die without successor resolution. Not
reachable in this edition; a second edition would have to revisit it (§3.8's known debt).

**Pre-ruling for Task 16 (partial pre-read; the rest is verified at its dispatch, when the tree
will include Tasks 14 and 15).**

**R14 — Task 16's `git add` omits three files its own steps write, so the commit would not
compile.** Step 8 stages `src/engine/commands src/engine/index.ts eslint.config.js`. But Step 5
creates `src/engine/selectors/registrationLedger.ts` (already recorded as stale-Files row S3) and
**also** adds a `registrationHistory: RegistrationRuling[][]` field to `GameState` in
`src/engine/types.ts`, initialises it in `initialState()`, and appends to it in three
`applyEvent` cases. None of those three paths is staged. Ruling: the `git add` gains
`src/engine/selectors/registrationLedger.ts`, `src/engine/types.ts` and
`src/engine/reducer/applyEvent.ts`. Task 16's reviewer is told the same, so a reducer hunk it did
not expect is not read as out-of-scope. Note the `applyEvent` change lands inside
`src/engine/reducer/**` and is therefore covered by the purity project — it is a pure array
append and must stay one, and it must preserve §3.5 referential identity when the ruling list is
empty (the brief's snippet already does, via the `? [...] : state.registrationHistory` ternary).
Cost if wrong: staging three files that turn out to need no change is a no-op; omitting them
ships a commit that does not typecheck.

**Task 16 documentation drift to carry into its dispatch, not a defect:** the prose note after
Step 4 says "The draft above sets [`perceivedCharacterId`] to `position.step.id`, which is right
only because every per-actor step is named after its character." The code above it does **not** —
it uses `position.actorPerceivedCharacterId` and its own comment explains that `position.step.id`
was the earlier draft's bug, wrong for `scarlet_woman_notify`. The code is the better version and
wins (R4); the note is residue of the draft it replaced. Reviewers must not "restore" it.

**Pre-ruling for Task 17 (pre-read while Task 14's implementer ran).**

**R15 — Task 17's test `allows the change once the first Demon is dead` cannot pass as written.**
Nineteenth plan-authored defect, and the same shape as Task 13's two store fixtures: the fixture
cannot reach the state its name claims. The test does `recordDeath(store, 'p1', 'other')` and then
`changeRole(store, 'p5', 'imp', 'st_correction')`, asserting p5 becomes the Imp. But `seeded()`
puts a **Scarlet Woman at p3**, and `recordDeath` routes a true-Demon death through §4.6 — twelve
alive, she is functional, so she is promoted to Imp **in that same transaction**. So at the moment
`changeRole` runs there IS a living Demon, `applyEvent`'s ROLE_CHANGED guard
(`p.alive && p.id !== playerId && p.team === 'demon'`) fires, the change is dropped, and p5 stays
the Chef. The assertion fails. Worse, it fails for the *opposite* reason to the one the test is
named for — it looks like the guard is over-firing when in fact the fixture handed it a live Demon.
Ruling: the test must also kill the successor — add `recordDeath(store, 'p3', 'other')` after the
first — so the state genuinely holds two dead ex-Demons and no living one. Note the consequence and
comment it: with no living Demon, §4.7 row 1 fires at that commit and good wins, so this test
deliberately makes its correction **after** the game is decided. That is not a flaw in the test,
it is unavoidable — "the Demon is dead and nobody else holds it" *is* the good-win condition — and
it is exactly the situation `st_correction` exists for. The paired test above it already witnesses
the blocking direction, so the two together pin the guard as being about *living* Demons rather
than about Demons.
**Prescription to re-verify at Task 17's dispatch**, per this plan's own lesson that the location
of a witness needs the same "would this go red?" interrogation as the finding: confirm at that
point that `recordDeath(p3)` really produces no third successor (it should not — p3 was the only
Scarlet Woman and is now the Imp, and `starpass` is false), and that nothing in the store refuses
a transaction after `GAME_ENDED`.
Cost if wrong: a test asserts a correction made after the win rather than before it. The
alternative is a test that cannot pass at all.

**R16 — Task 17's `git add` gains `src/engine/commands/nightCommands.test.ts`.** R2 defers four
barrel exports (`addNote`, `changeRole`, `clearStatus`, `recordDeath`) from Task 16 to Task 17,
and the barrel-completeness test lives in `nightCommands.test.ts` — so Task 17 adds those four
names back to that test's list and must stage the file. Its `git add` already carries
`src/engine/index.ts`. Consistent with R2 as recorded; noted here so the dispatch does not lose it.
Cost if wrong: none — the barrel test would fail loudly at Task 17's own green step.

**Pre-rulings for Task 18 (pre-read while Task 14's implementer ran). Two defects in the scripted
game, and they are the same one twice: the fixture has no Poisoner.**

Verified clean and needing no ruling: `test/**/*.test.ts` **is** in the `app` project's include
list (vitest.config.ts), so `test/property/advisory.property.test.ts` and
`test/scripted/fullGame.test.ts` will actually run — I checked because two of Task 18's three new
files live outside `src/` and a project glob that missed them would have produced a suite that
silently never ran. The 9-player scripted roster is a legal 5/2/1/1 by the chart.

**R17 — Task 18's night-1 `fabricated` Empath answer throws, because nothing poisons the Empath.**
Twentieth plan-authored defect. The scripted game's `newGame()` roster is
imp / scarlet_woman / saint / washerwoman / empath / monk / undertaker / butler / mayor — **there
is no Poisoner**, the single Minion slot at 9 players being the Scarlet Woman, which the fixture's
own comment says out loud. So night 1's `runNight` handler map has a `poisoner:` entry that can
never fire (`wakes()` is empty, the cursor passes over the step), the Empath is therefore sober,
and the `empath:` handler's `resolveStep(…, { answerClass: 'fabricated' })` hits Task 16's §4.3
gate and **throws**: "A fabricated answer is only legal when the actor is drunk or poisoned."
The test cannot pass as written, and the handler comment asserting "The Empath is poisoned" is
false on its own fixture.
Ruling: keep the fabricated answer — it is the only place in the plan where a `fabricated` answer
is exercised through the command layer, which is §14 Tier 2 coverage worth having — and make the
premise true the way the fixture's own comment says to ("Poison is applied directly in the script
where the trace needs it"). The `empath` handler emits a `STATUS_APPLIED { poisoned, p5,
expiresAt: day 1 }` in its own top-level transaction first, then resolves fabricated. That is
legal: the handler is called from `runNight`, not from inside a transaction, so this is not the
re-entrant nesting the store throws on. Delete the dead `poisoner:` handler.
Cost if wrong: one extra scripted transaction. The alternative is a Tier 3 acceptance test that
throws on its first night.

**R18 — the day-1 poison-expiry assertion beside it passes for the wrong reason and must be
replaced.** It reads `expect(p5.statusLedger.length).toBeGreaterThan(0)` under the comment "Poison
applied on night 1 expired at the end of day 1 (§4.4)". Two things are wrong. It asserts a
*length*, which says nothing about expiry — §4.4's whole design is that entries persist and
`isStatusActive` compares phases, so the ledger is non-empty either way. And **p5 is the fixture's
`redHerring`**, whose status the reducer writes into the ledger at `ROLES_ASSIGNED`
(applyEvent.ts:166-174) as a permanent entry — so this assertion is green before a single night
step runs, with or without R17's poison, with or without expiry working at all. It is a
certificate for behaviour it cannot observe: the same shape as the vacuous tests cut in Tasks 5
and 6 and the hollow ordering assertion fixed in Task 8.
Ruling: assert the predicate, not the ledger — at night 2, `isPoisoned(p5, view.phase)` is
**false** while the `poisoned` entry is still present in `statusLedger`. That is the assertion the
comment describes, it can only be green if the inclusive-comparison boundary is right, and it
distinguishes the red herring's permanent entry from the expired poison.
**Both prescriptions to re-verify at Task 18's dispatch**, per this plan's rule that a witness's
location needs the same interrogation as the finding: confirm the poison genuinely reaches day 1
and lapses by night 2 against `phase.ts`'s ordinals, and that no other assertion in the scripted
game leans on p5's ledger length.
Cost if wrong: an assertion that names what it checks. There is no downside.

**R19 — Task 18's `git add` stages two files it does not change and omits three it does.** It
stages `src/engine/reducer/applyEvent.ts` and `src/engine/reducer/applyEvent.test.ts`, but Task 18
touches neither — the ROLE_CHANGED integrity guard its commit message credits already shipped in
Task 4's fix round, and the message's "so the reducer now treats that as an integrity case" is
narration of work already done (same class as R8, R10, R12). It omits
`src/engine/selectors/replay.test.ts`, which its own Step 2 creates (stale-Files row S3), and —
per R2 — `src/engine/index.ts` and `src/engine/commands/nightCommands.test.ts`, where Task 18 adds
its `answersAtSeq` export line and the name back to the barrel-completeness list. Also stale, and
already recorded as row S4: the Files list's `Modify: nightCommands.ts — validate answerClass` is
Task 16's work; Task 18 only tests it.
Cost if wrong: staging an unchanged file is a no-op; omitting three changed ones ships a commit
that does not typecheck and a barrel that never regains `answersAtSeq`.
Task 14: implementer DONE (sonnet) — commit d944291, 390/390 full suite (25 files, +41), 273/273
engine, typecheck and lint clean, output pristine. Exactly the four files the brief names; R10
honoured (`applyEvent.ts` read but never edited, and the commit message's two stale claims both
removed). Verified myself before review: correct author and `Co-Authored-By` trailer, **zero
`eslint-disable`**, R9's two imports landed and nothing else in the import block changed, no
`PHASE_ADVANCED` anywhere in `closeDay` (the only one in the file is inside `beginNight`), and
`tx.view()` is read **before** `tx.emit('DEATH')` so §16.1's precondition holds. It reported no
third brief defect — a claim, not a reassurance, and one the review was told to check.

The redden-mapping I demanded came back complete, and it is the most useful artifact of the round:
a named single-line production change for every test, including the two it could **not** name,
which it flagged rather than inventing. Both disclosures are worth recording:
- `closeNomination`'s `butlerVotesFlagged` wiring is only ever exercised with an **empty** array at
  the command layer, so hardcoding `[]` there would leave the suite green. The selector beneath it
  is well covered; it is the one-line wiring that has no witness.
- `ignores an expired Master mark from a previous night` cannot be reddened by deleting a line in
  this task's files, because the expiry logic lives in `masterOf`/`isStatusActive`. My read, for
  the adjudication: that does **not** make it hollow. It is reddenable from this task's files by an
  *insertion* rather than a deletion — reimplementing the Master lookup inline over the raw
  `statusLedger` instead of calling `masterOf` passes every other Butler test and fails this one.
  That is a real and plausible regression, and this is its only guard.

Task reviewer dispatched on **opus** over review-a2c6724..d944291.diff. The capability bump is for
`closeDay` rather than for the vote arithmetic — §14 puts vote math at the bottom of the risk list
because the table recounts it out loud, but `closeDay` is the victory-commit path, R5's split lives
there, and Tasks 15, 16 and 18 all build on these commands. Six named priority checks, the first
being the one this plan's history says pays: hunt tests that cannot fail, given that every negative
Butler test asserts `toEqual([])` and would pass with the whole Butler branch deleted. Handed it
the six cross-task facts it cannot see (the `onDemonDeath` precondition, the store's re-entrancy
and thenable guards, `dayClosed` and commit-time `GAME_ENDED`, the reducer's existing duplicate-vote
refusal and `closedThreshold` freeze, `masterOf`'s expiry and `effective` filtering, and the
ESLint rule's `importNames` scoping) as facts rather than as instructions not to flag, so the
no-pre-judging rule holds.
Task 14: review (opus) — spec ✅, quality **Needs fixes**: zero Critical, 3 Important, 13 Minor.
The three things this task exists for came back genuinely pinned, and the reviewer established
that by checking rather than by reading the report. The `closeDay`/`beginNight` split is better
guarded than I feared when I called it "one assertion": **four** tests redden if `PHASE_ADVANCED`
re-enters `closeDay` — the two explicit phase assertions plus both Saint tests, which travel the
full command path with no direct call to `checkVictory` or the predicate. Better, the reviewer
found that `victory.ts:59-61`'s own comment already states row 2's phase scoping "is safe ONLY
because no command advances the phase in the victory-checking transaction" — so the split is not a
convention this task honours, it is the invariant Task 12's module was already written against.
`voteOrder`'s orientation matches `seating.ts`'s documented seat+1-is-left convention (which
discharges Task 7's deferred minor — the real guard now exists where vote order is consumed); the
per-nomination threshold fixture genuinely drops the live threshold below the frozen one; the
§16.3 tally test is load-bearing (three clean votes plus the Butler's is *exactly* the threshold,
so striking the vote flips the execution to null); and the retroactive clearing is asserted both
ways on one fixture.

**Both ⚠️ items resolved by me. The first is a real gap and joins the fix list; the second is not.**
- Whether anything else pins the `DEMON_DIED` → `ROLE_CHANGED` sequence for a promoted successor:
  Task 13's `store.test.ts:252` emits that pair in a hand-built transaction, so the **store's**
  commit-time behaviour under a promotion is pinned — but nothing pins `closeDay`'s own emit. Task
  16's `resolveImpStep` is unwritten and Task 18's scripted game covers this exact path four tasks
  from now, as an acceptance test where a failure is expensive to diagnose. Confirmed gap; it is
  finding 3.
- `nominationsOnDay` having no caller: not a gap, per R4 — plan:11528 exports it from Task 16's
  engine barrel and its Undertaker step reads it. Folding in one test anyway, since it is exported
  production code with zero coverage and the implementer is already in the file (same treatment I
  gave Task 11's `killDerivation`).

**Task 14 Ruling: finding 1 (`closeDay` has no phase precondition) — FIX. The highest-consequence
finding of the round, and I verified all three of its premises directly rather than from the
report.** `victory.ts:87-94` row 4 tests **only** `context.dayClosed`, `aliveCount === 3`,
`todaysExecutions.length === 0` and a functional Mayor — there is no phase clause. And
`applyEvent.ts:270-271` clears `todaysExecutions` on entry into a **day**, never on entry into a
night, so after a no-execution day the list is empty all through the following night. So the path
is reachable, not theoretical: day N closes with no execution at four alive (no win, row 4 wants
exactly three), `beginNight`, the Imp kills one, three alive — and a single mistimed `closeDay`
now commits `dayClosed: true` against a night state and **hands good the game**. Silently, at
night, in a game evil was winning. `beginNight` guards its own phase precondition one function
below; the asymmetry is the tell rather than a style choice. Fix:
`if (state.phase.kind !== 'day') throw new Error('It is not day');` as `closeDay`'s first line,
plus the test. Throwing does not violate §4.8: a `closeDay` at night is a malformed command from
the app layer, not a rule break at the table — nothing has happened to anyone to preserve — which
is the same line I drew in Task 4 (`assignRoles` throws on an illegal deal) and Task 11 (the
Mayor-bounce structural throws). There is no legitimate night caller: §7's close-the-day action is
a day action and Plan 2 calls `closeDay` then `beginNight`.
Cost if wrong: a caller that wanted to close a day from the night phase gets an exception instead
of a win it did not earn.

**Task 14 Ruling: finding 2 (the command-layer `butlerVotesFlagged` assertion cannot fail) — FIX.**
Both the implementer and the reviewer found this independently, which is worth noting: the
implementer disclosed it as its own coverage gap rather than letting it pass, and the reviewer
reached the same place from the diff. The assertion votes a Chef and an Empath and expects
`butlerVotesFlagged: []`, so hardcoding `[]` in `closeNomination` — or dropping the field — leaves
it green. This is the only command-layer expression of the §16.3 ruling, and the field is its
permanent forensic record. The failure mode is the one this project treats as the risk that
matters: because §3.6 makes the field **write-only** and no selector reads it, a broken wiring
loses every Butler violation from the audit log for the whole game and *nothing else in the system
ever contradicts it*. Not "coverage could be broader" — a false certificate on the task's headline
ruling. `seeded()` already seats the Butler at p3; the fix is one variant fixture applying a
`master` status, asserting `butlerVotesFlagged: ['p3']` after `closeNomination`.
Cost if wrong: one extra command-layer test. There is no credible downside.

**Task 14 Ruling: finding 3 (the Scarlet Woman promotion branch inside `closeDay` is entirely
uncovered) — FIX.** No fixture in either file contains a Scarlet Woman, so `demonDeath.successorId`
is always null and the `DEMON_DIED` → `ROLE_CHANGED` emit never executes. The reviewer's blast
radius is right and I confirmed its load-bearing half: `DEMON_DIED` is a reducer **no-op**
(applyEvent.ts:334-336 — "The ROLE_CHANGED in the same transaction moves the role"), so if that
`ROLE_CHANGED` emit is wrong or missing, commit-time `checkVictory` sees no living Demon and
**ends the game for good on the spot** — in precisely the scenario the Scarlet Woman exists to
prevent, and by a wrong result rather than a crash. Executing the Demon by vote with a living
Scarlet Woman at 5+ alive is an ordinary table event, not an edge case. Deferring it to Task 18's
scripted game is the wrong trade: three tasks build on `closeDay` first, and an acceptance test
failing four tasks later is the most expensive place to learn this. Fix: one test — Scarlet Woman
in the roster, 5+ alive, Demon executed by vote, asserting the successor's `characterId` and that
`aliveCountAtDeath` counts the dying Demon.
Cost if wrong: one test on a branch Task 18 would also have covered. Cheap insurance on a wrong-
game-result path.

Folded into the same round, all cheap and all in the four files this task owns: Minor 4
(`thresholdDerivation` recomputes `Math.ceil(alive / 2)` instead of calling `threshold` — §8.2's
whole purpose is that the derivation explains the number the engine actually used, and a duplicated
formula is the one way it can drift from it); **Minor 5**, which is the substantial one — the
four-clause Butler eligibility test (butler ∧ alive ∧ abilityFunctional ∧ has an active Master) is
written out in both `butlerViolations` and `voteIssues`, so a fix applied to one and not the other
makes the live warning and the permanent audit record disagree with no test catching it; that is
the same second-source-of-truth hazard I ruled an Important in Task 9 (`requiresAlive` duplicated
onto every step), and the prospective/retrospective split is legitimate only in *which vote set*
is read, not in the eligibility half — extract it; Minor 6 (`voteIssues` returns `[]` for an
unknown nomination id while `closeNomination` throws, and the reducer's `VOTE_CAST` also no-ops on
one, so a mistyped id makes `castVote` append an event that changes nothing and raises no flag —
a vote that is "recorded" and invisible; make `castVote` throw, matching the Task 4/11 line that
malformed app input throws while table breaks are recorded); Minor 7 (`vote_after_close` is a whole
advisory rule with zero coverage, and `todaysNominations`'s night guard is load-bearing precisely
because night N and day N share a number — one test each); Minor 9 (`withButlerMaster` inlined
verbatim three more times, and each inlined copy carries a `toEqual([])` sibling that goes vacuous
in silence if the copy drifts — parameterise the helper); Minor 10 (`SAINT_ROLES` declares
`outsider: 0` while its roster contains the Saint, who is an Outsider — nothing reads
`distribution`, but a fixture that contradicts itself is what misleads the next reader); Minor 11
(the poisoned-Saint test asserts only `ongoing`, which also holds if the execution never happened —
add `expect(p3.alive).toBe(false)` so it witnesses the execution it is named for); Minor 12
(cosmetics: `emitFlags`'s `ReturnType<typeof nominationIssues>` should be `FlagDraft[]`, which is
also what `voteIssues` returns; a pointless single-`map` spread; a stray blank line); plus a
one-line comment on the `successorReason === 'starpass' ? …` ternary at dayCommands.ts:133 — the
reviewer correctly noticed its `'starpass'` arm is unreachable here because the call site two lines
above hardcodes `starpass: false`, but it is a **type narrowing** rather than a dead branch
(`successorReason` is `'scarlet_woman'|'starpass'|null` and TS cannot see that a successor always
has a reason), so it earns a comment saying so rather than a restructure — especially as Tasks 15
and 17 repeat the identical idiom and a unilateral change here would make three call sites disagree.

Task 14: minor (deferred): a `butler_without_master` flag emitted at `castVote` time is never
retracted once the Master votes, because `RuleFlag` has no resolved/superseded field — so the flag
list will disagree with the `butlerVotesFlagged` written at close, which correctly clears. Mitigated
by the detail text, which says in as many words that the restriction is satisfied if the Master
votes. Not fixed here: `RuleFlag` is Task 3/4's shape and adding a field ripples through the
reducer and Plan 2's flag rendering. Real, and the final review should decide whether Plan 2 renders
flags with that caveat or the shape changes.
Task 14: minor (deferred): `closeDay` is re-entrant across transactions — nothing records that the
day closed (`DAY_CLOSED` is a reducer no-op), so a second call re-resolves the same day. Harmless
today **only** because `resolveDayExecution`'s `row.nomineeAlive` filter excludes the now-dead
nominee, which means that clause is load-bearing for more than its documented purpose. Worth a
guard or at least a comment; not expanding this round for it, and finding 1's phase precondition
does not close it (both calls are in the day phase).
Task 14: fix round 1/5 — resuming the original implementer (context intact), FIX_BASE d944291.
Task 14: fix round 1/5 — implementer DONE, commit 353824e. 397/397 full suite (25 files, +7),
48/48 across the two owned test files, typecheck and lint clean, output pristine. Four files
touched and no others. All three Importants and all thirteen minors applied, the ternary given a
comment rather than a restructure as instructed, and the two explicitly-deferred findings left
alone.
The evidence is what I asked for and complete: for each Important it reverted the production
change, ran the covering test, pasted the **failure**, restored, and pasted the pass — and for
FIX 1 it additionally diffed the restored file byte-for-byte against a pre-experiment copy to prove
the revert left no residue. Worth recording that **FIXes 2 and 3 needed no production change at
all**: both were coverage gaps rather than bugs, so the implementer reddened them by temporarily
breaking correct production code (hardcoding `butlerVotesFlagged: []`, and `if (false && …)` on the
promotion branch) — which is the right way to witness a gap, and it establishes that the wiring
and the promotion emit were correct all along rather than fixed by accident.
Verified myself before the re-review: the phase guard is the first line of `closeDay`'s body, and
the fix commit touches only the four owned files.
Scoped re-review dispatched (sonnet) over d944291..353824e with five named checks, the first being
the one place this round could have broken something silently: **Minor 5's extraction.**
`butlerViolations` judges over the nomination's FINAL vote set while `voteIssues` gives a
prospective warning over the votes so far, and if the extracted helper swallowed the "has the
Master voted?" clause along with the eligibility clauses, both would consult the same vote set and
the retroactive-clearing property — the entire reason §16.3's violation is a selector rather than a
stored flag — would break silently, with tsc clean. Also asked it to confirm Minor 9's
de-duplication did not disturb the §16.3 load-bearing test's exact three-clean-votes-plus-the-
Butler's arithmetic (that fixture was one of the three inlined copies it collapsed), that the
substantial deletions in `nominations.test.ts` are inlined fixture bodies rather than assertions,
that FIX 2's Master mark is genuinely active on day 1, and that FIX 3's `aliveCountAtDeath: 6`
could only hold on the pre-DEATH view.
Task 14: fix round 1/5 re-review — **all 3 Importants and all 13 minors ADDRESSED, no new
Critical/Important breakage.** The check that could have broken something silently came back
clean and for the right reason: `restrictedButlerMaster` contains **only** the eligibility half,
and the re-reviewer confirmed both call sites still build their own vote set independently —
`butlerViolations` from the nomination's `.votes` at call time, `voteIssues` from its own live set —
so the retroactive-clearing property and the live warning remain separately computed. It also
hand-traced FIX 2's phase ordinals rather than trusting the fixture (appliedAt night 1 = 2 ≤ now
day 1 = 3 ≤ expiresAt day 1 = 3, so the Master mark is genuinely active) and confirmed FIX 3's
`aliveCountAtDeath: 6` can only hold on the pre-DEATH view, with victory staying `ongoing` because
row 1 now finds the promoted successor rather than because another predicate short-circuited.
The ~128 changed lines in `nominations.test.ts` are the three inlined fixture bodies collapsed into
helper calls; no assertion was deleted, weakened or loosened.
One slip in the re-review's own report, corrected by me and immaterial: it described the §16.3
load-bearing test as "4 votes against a 7-alive threshold of 4". The roster is **8** players. I
read the test directly — `vote(b, 'n1', ['p4','p6','p7','p3'])` against `ceil(8/2) = 4` — so four
votes exactly meets the threshold and striking the Butler's drops it to 3 and flips the execution
to null. The property holds either way (the threshold is 4 at both 7 and 8 alive), so the
conclusion stands; recording it because a number in a review report is not a number I checked.
Task 14: complete (commits a2c6724..353824e, review clean after 1 fix round)

Task 15: implementer dispatched (sonnet), BASE 353824e.
Task 15: implementer DONE_WITH_CONCERNS (sonnet) — commit 2820742, 414/414 full suite (27 files,
+17), typecheck and lint clean, output pristine. Exactly the five files in scope; Step 6 correctly
skipped per R1, and `events.ts`/`applyEvent.ts` untouched per R12. R11's two payload fixes applied,
and `canRegisterAsTeam` now called at both sites (verified: virgin.ts:59 and slayer.ts:39, with
`registrationOptionsForCharacterId` dropped from both imports). It verified R12 rather than trusting
it — checking that `ExecutionKind` already includes `'virgin'`, `DeathCause` already includes
`'slayer'`, and `ROLE_CHANGED`'s reason union already covers the emit — which is what I asked for.

**Task 15 Ruling: the `evaluateVirgin` phase-guard asymmetry the implementer raised is a real gap,
and it is worse than the asymmetry it looks like. FIX before review.** I asked for its independent
read rather than pre-ruling it, and it came back with the reachability argument I could not make
from the brief alone: `nominationIssues` has **no phase check of any kind**, not even an advisory
flag, so `nominate` + `applyVirgin` during a night is fully reachable through the command layer
with no throw, no flag, and no friction. Then I traced the consequence it did not, and it is not
merely a stray DEATH: `applyVirgin` emits `DEATH { cause: 'execution', executionKind: 'virgin' }`,
`applyDeath` appends every execution-caused death to `todaysExecutions` (applyEvent.ts:20-26), and
`todaysExecutions` is cleared **only on entry into a day** — deliberately, because the Undertaker
wakes at night and reads the list. `undertakerAnswers` reads `view.todaysExecutions` at
resolvers.ts:381. So a night Virgin trigger injects a **phantom execution into the Undertaker's
answer set on that very night**, and the Undertaker is told the character of a player nobody
executed. That is top-of-the-§14-risk-list wrongness: information the table cannot recount, in the
one subsystem §8.2 exists to make checkable.
Ruling: **`applyVirgin` throws when the phase is not day**, matching `closeDay`, `beginNight` and
`advanceToDay` — the codebase's established pattern that a command guards its own phase
precondition — plus one covering test. Three things this ruling deliberately does **not** do:
- **`evaluateVirgin` stays pure and unguarded.** The evaluator answers "what would happen"; the
  command decides whether it may run. Putting the guard in the evaluator would force it to invent
  a nonsense return shape for a nomination that should not exist.
- **`evaluateSlayer` keeps its in-evaluator day check, and the asymmetry with the Virgin is
  correct rather than an inconsistency to flatten.** A Slayer claim is a thing a player *says out
  loud at the table* — §4.8 says record it, which is exactly what `outcome: 'nothing'` plus a
  reason does. A Virgin trigger is not an utterance; it is a *consequence* of a nomination. If the
  nomination should not exist, there is no table event to preserve.
- **`nominationIssues` is not touched.** §7 enumerates exactly four nomination checks — alive
  nominator, alive nominee, no self-nomination, no repeat today — and it implements exactly those.
  Adding a fifth would be extra, and §7 is explicit that nomination failures *flag* rather than
  block. The coherent line the two halves draw together is §4.8's own: **record the social event,
  refuse the derived death.** The night nomination is still logged; only the killing is refused.
Cost if wrong: a caller that wanted to resolve a Virgin trigger outside a day gets an exception
instead of a phantom execution in the Undertaker's night information. No legitimate caller does —
§7's nomination and Virgin flow is a day flow, and Plan 2 offers it on the day screen.
Task 15: pre-review correction dispatched — resumed the original implementer, FIX_BASE 2820742.
Task 15: pre-review correction DONE — commit 162ec1d. `applyVirgin` throws `'It is not day'` as its
first statement, before `toRulesView` and before `evaluateVirgin`; `evaluateVirgin`,
`evaluateSlayer`'s day check and `nominationIssues` all left untouched as ruled. 415/415, typecheck
and lint clean. Two files touched.
The RED evidence has a wrinkle worth recording, and it is in the implementer's favour: with the
guard reverted, `applyVirgin` **still throws** — `seededAtNight()`'s roster has no Virgin, so
`evaluateVirgin` returns `isVirginNomination: false` and the pre-existing
"does not trigger the Virgin" throw fires instead. The test only reddens because its regex is
message-specific (`/it is not day/i`), which the other message does not satisfy. So the test does
discriminate, but the thing doing the discriminating is the regex rather than the presence of a
throw — I have named that to the reviewer as a check rather than resolving it myself, since
"adequate" and "adequate by luck" are different verdicts and the reviewer should reach its own.
Task reviewer dispatched on **opus** over review-353824e..162ec1d.diff (two commits). The bump is
for §16.12: its failure mode is **two living Imps**, which is a wrong game state that no one at the
table can see, and the v2 defect it corrects was exactly a `targetRegisteredAsDemon` read where
`targetIsTrueDemon` was meant. Six named checks, including the hazard specific to this task's
shape: `outcome: 'nothing'` is the right answer for five different guards (bluffing claimant,
poisoned Slayer, spent ability, dead target, non-Demon target), so a test asserting only `outcome`
cannot tell which guard fired and would pass with the wrong one doing the work.

**Pre-ruling for Task 16, completed while the Task 15 review ran.** I checked **every one of the
~80 names** in Task 16's `src/engine/index.ts` barrel against the tree, module by module, because
a single name that does not exist fails `tsc` and R2 already found two forward references in this
same block. Result: one real defect, and two false alarms that I resolved rather than reporting —
worth recording, because reporting either as a defect would have sent an implementer to "fix"
correct code.

**R20 — `ResolutionLink` is exported from `src/engine/events.ts`, not `src/engine/types.ts`, but
Task 16's barrel lists it in the `export type { … } from './types'` block.** `types.ts` does not
contain the string at all; the interface is at `events.ts:16`. As written this is a
"Module './types' has no exported member 'ResolutionLink'" error and Task 16's own green step is
unreachable. The pre-flight scan already recorded that Task 4 defines it in `events.ts` (the
T4 → T11,T16 row) — the barrel simply files it under the wrong module. Ruling: move
`ResolutionLink` out of the `./types` type block and into the `export type { GameEvent, EventType }
from './events'` line beside it. Defect twenty-one.
Cost if wrong: none — the alternative is not compiling.

**Two false alarms, checked and dismissed rather than passed on as findings.** Both would have
been real if I had trusted my first grep:
- `initialState` looked absent from `src/engine/reducer/fold.ts`, which the barrel imports it
  from. It is **defined** in `applyEvent.ts` but **re-exported** by `fold.ts:4`, so
  `export { reduce, initialState } from './reducer/fold'` is correct as written. My pattern
  matched only `export function|const`, not the `export { … } from` form.
- `DealResult` and `Picker` looked absent from `deal.ts` for the same reason — they are
  `export interface` / `export type`, which that pattern also missed.
Recording this because it is the controller-side instance of the lesson in
`plan1-briefs-have-real-defects.md`: a diagnosis and its prescription need separate checking, and
a grep that cannot see a form is indistinguishable from a symbol that does not exist.

Also verified for Task 16 and needing no ruling: `CursorPosition` carries exactly the five fields
its code reads (`step`, `actors`, `actor`, `actorPerceivedCharacterId`, `conditionMet`);
`KillOutcome`'s two arms carry `resolutionChain`/`finalVictimId`/`starpass` and
`mayorId`/`candidates`; `resolveDemonKill(view, attackerId, targetId, mayorBounceTargetId?)`
matches the call; `STATUS_APPLIED.sourcePlayerId` is `PlayerId | null`, so
`position.actor?.id ?? null` type-checks; `NIGHT_STEP_RESOLVED.registrationRulings` is required,
which is what Step 5's `registrationHistory` append reads; and the edition barrel already exports
all twenty-nine names Task 16 re-exports from it.
Task 15: review (opus) — spec ❌ with 3 Important, 5 Minor, zero Critical. The two defects the task
exists to prevent came back **structurally** prevented, and the reviewer proved it rather than read
it: `routesToDemonDeath` has exactly six assignment sites in `slayer.ts` — literal `false` in all
five guard returns and `targetIsTrueDemon` in the single `outcome: 'died'` return — and
`targetIsTrueDemon` is computed once from `characterById(target.characterId).team === 'demon'`,
never from `targetRegisteredAsDemon` and never `||`-joined, so v2's two-living-Imps bug is
unreachable by construction. §16.10 was traced to the far end of the wire: `applyVirgin` emits
`VIRGIN_TRIGGERED` **before** its `if (!evaluation.fired) return`, and applyEvent.ts:392 sets
`virginTriggered` off `nomineeId` unconditionally of `fired`, so consumption genuinely survives a
non-firing trigger. It also checked both hardcoded registration literals against `characters.ts`
rather than trusting them — the Spy really does carry `{good, townsfolk}` and the Recluse
`{evil, demon}`.

**Task 15 Ruling: finding 1 — FIX, and it corrects my own phase-guard ruling from three hours ago.**
When I ruled that the Virgin/Slayer asymmetry was correct, my reasoning was "a Slayer claim is an
utterance §4.8 says to record, so `outcome: 'nothing'` plus a reason is the right treatment."
**I did not know that recording it also spends the ability.** The reviewer traced the consuming
end: applyEvent.ts:404 sets `slayerUsed` on `claimantIsRealSlayer` **alone**, with no reference to
`outcome` or phase — I verified this directly. So a real Slayer's claim in a state where the shot
could not be taken records the utterance *and burns the once-per-game ability*, silently; the
Storyteller finds out when the real day shot does nothing. Spending a derived resource is exactly
the derived state change §4.8 forbids for an integrity break, so the earlier ruling was made on
incomplete information and this supersedes it.
Fix, in two parts, and note what each is modelled on:
- **`claimSlayer` throws when the phase is not day**, symmetric with `applyVirgin` and with
  `closeDay`/`beginNight`/`advanceToDay`. My "record the utterance" reasoning applies to a *day*
  claim — at night nobody is making a public declaration, so there is no table event to preserve.
  `evaluateSlayer` keeps its own day check: the evaluator says what would happen, the command
  decides whether it may run. The two are not in conflict.
- **`claimSlayer` throws when the target could be ruled the Demon and no ruling was given.** This is
  the worse half and it is reachable in ordinary daytime play: `evaluateSlayer`'s own reason string
  reads "could be ruled to register as the Demon — decide before resolving" while the command
  resolves anyway and spends the shot — so a Storyteller who follows that instruction, goes away to
  decide and comes back finds the ability gone and the Recluse alive. The established precedent is
  exact: Task 16's `resolveImpStep` **throws** when a Mayor hit arrives without a bounce decision.
  Shape: add `needsRegistrationRuling: boolean` to `SlayerEvaluation`, which makes it symmetric with
  `VirginEvaluation`, and have `claimSlayer` refuse on it. It must be true only when the claim is
  otherwise resolvable — a **bluffing** claimant pointing at a Recluse needs no ruling, because
  nothing resolves, and that claim must still be recorded per §4.8.
Verified before ruling that this cannot break Task 16: all five `claimSlayer` calls in the
`dayAbilities.test.ts` that R1 moves there target either the true Demon, a ruled Recluse, or an
unambiguous player, so none reaches the new throw.
**Rejected the reviewer's third sub-case: a claim on an already-dead target keeps spending the
ability.** The reviewer grouped it with the other two, and §4.8 does name "targeting a dead player"
as an integrity break — but the derived state changes §4.8 protects are enumerated in its own
invariant: `aliveCount` going negative, two living Demons, a `DEATH` for a player already dead.
None involves the actor's own ability. And the game agrees: the Slayer's ability is spent by the
**public declaration**, so a Slayer who shoots a corpse has genuinely wasted their shot. No `DEATH`
is emitted, so §4.8's invariant holds. Changing this would make the app kinder than the game.
Cost if wrong: two commands refuse in states where they currently record-and-spend. Both refusals
name what the caller must do first.

**Task 15 Ruling: finding 2 (`evaluateSlayer`'s day guard is deletable with the suite green) — FIX.**
All eight tests build from a day fixture, so lines 52-59 can be deleted with everything still
passing. That is the shape this plan has cut or repaired five times. The reviewer's observation
about *why* it escaped is the sharp part and I am recording it as a lesson: the redden-mapping I
have been demanding enumerates **tests → mutations**, not **guards → tests**, so it structurally
cannot find a guard that no test covers. A clean redden-mapping is therefore not evidence of no
dead guards. I will ask for the inverse direction on the remaining tasks.
Fix: one test from a night fixture asserting `outcome: 'nothing'` **and** `reason` matching
/only be used during the day/i — the reason pin is what discriminates, since `outcome: 'nothing'`
alone is also produced by four other guards.
Cost if wrong: one test on a guard that currently has none.

**Task 15 Ruling: finding 3 (the demon-death emit block is near-verbatim duplicated) — DEFER to the
final review, and record why, because the calibration does name verbatim duplication as blocking.**
There will be four copies, not three: `closeDay` (T14), `claimSlayer` (T15), `resolveImpStep` (T16)
and `recordDeath` (T17). The reviewer's concern is that §16.1's hazard — passing the post-`DEATH`
view silently turns the Scarlet Woman threshold from 5 into 6 — must be re-derived correctly at
every copy. **But that is the one thing already guarded structurally at every copy:** Task 12's
ruling made `onDemonDeath` **throw** when handed a view in which the named player is already dead.
So unlike Task 9's `requiresAlive` duplication — which I ruled an Important precisely because
nothing checked the copies agreed — this duplication has a loud runtime check at each site. It is
duplication of *shape*, not of an unguarded fact. Extracting it now would also mean Task 15
creating a shared module for consumers in Tasks 16 and 17 that do not exist yet, which is the
wrong task to do it in. The final whole-branch review sees all four sites at once and can rule on
extraction with complete information; it is on its list.
Cost if wrong: four call sites keep a repeated emit block until the final review triages it. The
§16.1 ordering they all depend on cannot drift silently.

Folded into the same round, all in this task's own files: Minor 4 (four tests assert only
`outcome`/`fired` and so cannot say *which* of five guards fired — add the distinguishing `reason`
pin to the not-the-Demon, Demon-nominator and Outsider-nominator cases; the poisoned-Slayer test
is already distinguishing via `abilityFunctional: false` and needs nothing); **Minor 5**, which is
the one I would have escalated had the reviewer not already made the ESLint rule's structural
defence explicit — neither roster contains a Drunk and neither fixture sets `drunkBelief`, so
substituting `perceivedCharacterId` at virgin.ts:44 or slayer.ts:36 leaves all seventeen tests
green, and this is the exact task where §4.1 going wrong means a Drunk-believing-Slayer kills the
Demon; two tests, a Drunk-believing-Virgin nominated and a Drunk-believing-Slayer shooting the Imp;
Minor 6 (the phase-guard test proves precedence but never the consequence the guard exists for —
seed a roster that actually contains a Virgin, at night, and assert `todaysExecutions` stays empty
after the throw, which is the phantom-Undertaker-execution the ruling was about); Minor 7 (five
near-identical six-line `nothing` returns differing only in `reason` — a local factory removes the
risk of one drifting on `routesToDemonDeath`, which is §16.12's field); and Minor 8 (nothing tests
the deliberate tri-state where `ruleNominatorAsTownsfolk: false` differs from `undefined`).
Task 15: fix round 1/5 — resuming the original implementer (context intact), FIX_BASE 162ec1d.
Task 15: fix round 1/5 — implementer DONE, commit ca9f627. 421/421 (27 files, +6), typecheck and
lint clean. Both Importants fixed with revert→red / restore→green evidence, all five folded minors
applied, and Important 3 correctly left alone as deferred.
**FIX 2's RED is the sharpest evidence of the round and it reframes the finding.** I asked for a
test of `evaluateSlayer`'s untested day guard expecting the revert to show `outcome: 'nothing'`
becoming some other harmless value. It does not: with the guard deleted, a **night** Slayer claim
against the true Imp resolves `outcome: 'died'`. So the dead guard was not a cosmetic gap — it was
the only thing preventing the Demon from being killed at night by a Slayer claim, in a plan whose
whole night engine assumes the Slayer is a day ability. A guard deletable with the suite green,
guarding a wrong game result. That is the strongest vindication yet of the "hunt tests that cannot
fail" priority, and of the reviewer's point that a tests→mutations redden-mapping structurally
cannot find a guard no test covers.
The guards→tests sweep I asked for came back with `virgin.ts` fully covered and the day guard as
`slayer.ts`'s single gap — now closed.

**Task 15 Ruling: the untasked gap the implementer flagged — ADD the test, in this round rather
than the ledger, because this round created it.** It reported that `evaluateSlayer`'s
`ruleTargetAsDemon: false` explicit-decline path has no direct test, noting my Minor 8 was scoped
to `virgin.ts`. I checked the code before deciding and it is more than a symmetry gap. **Before**
FIX 1b, `false` and `undefined` were indistinguishable — both gave `targetRegisteredAsDemon: false`
and both resolved to `nothing`, so the tri-state was inert and untestable in any meaningful sense.
FIX 1b made it load-bearing: slayer.ts:97 now branches on `opts.ruleTargetAsDemon === undefined`,
so `false` is the **only** way a Storyteller can decline the ruling and have the claim resolve at
all — everything else throws. It is an escape hatch from a throw, with no witness. A future
refactor to the more idiomatic-looking `!opts.ruleTargetAsDemon` would compile, keep every test
green, and **permanently block a legitimate action**: the app would demand a decision, be given
one, and demand it again. New behaviour introduced by a fix round with no test belongs to that fix
round, not to the minor pile.
Cost if wrong: one test on a branch that is one refactor away from deadlocking a real Storyteller
action.

**Fixture-legality sweep across Tasks 16–18, done while the Task 15 re-review ran.** Since Task 5's
fix round, `assignRoles` enforces chart legality and **throws** on an illegal set, so every fixture
that goes through it must match the guide §2 chart exactly. I extracted every character's true team
from `characters.ts` and checked all four remaining fixtures against `DISTRIBUTION`:
- **Task 16 `seeded()`** — 12 players, imp / poisoner / scarlet_woman / monk / ravenkeeper / chef /
  empath / butler / mayor / saint / soldier / virgin = **7 townsfolk, 2 outsiders, 2 minions,
  1 demon**. Declared 7/2/2/1; chart[12] is 7/2/2/1. **Legal** — and it does go through
  `assignRoles`, so this one mattered.
- **Task 17 `seeded()`** — 12 players, the same shape with slayer and virgin in place of
  ravenkeeper and one other = 7/2/2/1. Declared 7/2/2/1. **Legal**, and also goes through
  `assignRoles`.
- **Task 18 scripted `newGame()`** — 9 players, imp / scarlet_woman / saint / washerwoman / empath /
  monk / undertaker / butler / mayor = **5 townsfolk, 2 outsiders, 1 minion, 1 demon**. Declared
  5/2/1/1; chart[9] is 5/2/1/1. **Legal**, and goes through `assignRoles`.
- **Task 18 `advisory.property.test.ts` `seeded()`** — 7 players, imp / poisoner / scarlet_woman /
  chef / empath / monk / saint = **3 townsfolk, 1 outsider, 2 minions, 1 demon**. Declared 3/1/2/1,
  which matches the roster — but **chart[7] is 5/0/1/1**, so this is not a legal Trouble Brewing
  set at any player count. Two minions and an Outsider are impossible at 7.

**R21 — Task 18's advisory-property fixture is deliberately not chart-legal, and gets a comment
rather than a new roster.** It does **not** reach `validateDeal`: it seeds the store with raw
`tx.emit('ROLES_ASSIGNED', …)` rather than `assignRoles`, precisely because its job is to fuzz
arbitrary and illegal event streams and assert §4.8's invariants survive them. So it neither throws
today nor tests anything false — none of its invariants reads `distribution`. But a fixture that
silently contradicts the chart is the same misleading-the-next-reader problem I folded into Task 14
as a fix (`SAINT_ROLES` declaring `outsider: 0` with a Saint in the roster).
The difference, and why the ruling differs: Task 14's was a one-line correction to a declared
number. Here the *roster itself* is illegal, so honesty costs either the Saint (which §4.7 row 2
needs), the second Minion, or a move to 8 players — each of which changes what the fuzz test
explores. Ruling: keep the roster and add a comment saying it is deliberately not chart-legal
because the test bypasses `assignRoles` to construct arbitrary states. Honest, free, and it
preserves the coverage.
Cost if wrong: a comment where a reader might have preferred a legal roster. The alternative
trades real coverage for cosmetic consistency.

Also verified for Task 16 and needing no ruling: `NightStep` carries `condition`, `targets`,
`effect` and `resolverId: string | null` exactly as its code reads them; `RESOLVERS` is
`Readonly<Record<string, Resolver>>`, so the `if (!resolver) throw` guard is required under
`noUncheckedIndexedAccess` and is present; `expiryFor(lifetime, appliedAt)` takes the lifetime
first, matching the call; and `validateDeal(playerIds, result)` takes the ids first, also matching.
Task 15: fix round 1/5 re-review — **all findings ADDRESSED, no new Critical/Important breakage.**
The check I named as deciding the round came back with the tracing rather than a conclusion: the
re-reviewer walked `evaluateSlayer`'s guard order by hand and confirmed `needsRegistrationRuling`
is **false** for a bluffing claimant, a spent Slayer, a droisoned Slayer, a dead target and an
explicit `false` decline — all four early guards return through the `nothing()` factory, which
hardcodes it false, before the ambiguous branch is reachable — and true only when the claim is
otherwise resolvable. So the new throw cannot refuse a claim §4.8 requires be recorded, which was
the way this fix could have been worse than the bug.
The Drunk tests are genuinely non-hollow, which was the other trap: both fixtures really do pass
`drunkBelief` through `buildGame` naming the right player and the right believed character, so a
`perceivedCharacterId` substitution would flip each assertion. Without that the tests would have
passed either way, since a Drunk's true `characterId` is `'drunk'` regardless.
Minor 6's rewritten phase-guard test now seats a real Virgin and a true-Townsfolk nominator, so
without the guard the trigger genuinely fires and appends to `todaysExecutions` — the
`toEqual([])` assertion is live rather than tautological. Minor 7's factory was confirmed to leave
the two branches that must diverge as explicit literals rather than routing them through it. Test
counts reconcile exactly at every layer (397→414→415→421→423) with no deleted `it` block and no
weakened assertion; every change to a pre-existing test is strictly additive.
**Out-of-scope observation resolved by me:** the re-reviewer noted the implementer's report
re-raises the `evaluateVirgin` day-guard asymmetry as a concern. That is already adjudicated — the
evaluator stays pure and unguarded on purpose, and `applyVirgin`, its only caller, now carries the
guard. Its worry that "Task 16 multiplies the reachable paths" does not hold: Task 16 adds setup
and night commands and introduces no new caller of `evaluateVirgin`. No action.
Task 15: complete (commits 353824e..ebc8e0a, review clean after 1 fix round)

Task 16: implementer dispatched (sonnet), BASE ebc8e0a.
Task 16: implementer DONE (sonnet) — commit 5f815ab, 451/451 (29 files, +28), typecheck and lint
clean. Exactly the nine files in scope (six creates, three modifies). Verified myself before
review: R2 honoured (the barrel contains no `correctionCommands` or `replay` export and none of
their five names), R20 applied (`ResolutionLink` now sits on the `./events` line), the ESLint
barrel change is in place on both sides (`'@/engine'`/`'@/engine/index'` in the `group`,
`src/engine/index.ts` in the `ignores`), correct author and trailer, and **no scratch file
survived** — `git status` clean and nothing probe-shaped in either directory.
The ESLint proof is what I demanded and it came back on both sides: a non-exempt file importing
`perceivedCharacterId` from `'@/engine'` errors with the §4.1 message under the real CLI (exit 1),
and `src/engine/index.ts` itself lints clean while re-exporting the same name (exit 0). So the
boundary closed the laundering route without breaking the barrel — the failure mode in the other
direction, which an over-broad pattern would have caused silently.

**Defects eighteen and nineteen, both found by the implementer and both correctly diagnosed rather
than forced green.**
- `seeded()`'s `redHerring: 'p6'` collides with two of the brief's own tests, which assert `p6`'s
  `statusLedger` equals exactly one poison entry. `applyRolesAssigned` writes a **permanent
  `redHerring` entry into the red herring's ledger at deal time**, so both assertions saw two
  entries and failed as transcribed. It retargeted both tests to p7 rather than weakening the
  equality, which is the right repair — it keeps the exact-array assertion that makes them
  discriminating. Note this is the **second** time the red herring's ledger entry has produced a
  broken fixture in this plan; the first was R18, in Task 18's scripted game, where the same entry
  made a poison-expiry assertion green before any night step ran.
- The brief's §16.6 registration-ledger test is not a test: it asserts `toHaveLength(1)` on a
  freshly seeded store **on which no action has been taken**, so it fails unconditionally — and its
  own comment describes ruling a **Recluse**, who does not exist in the twelve-player roster the
  brief mandates. Unplayable premise on top of an impossible assertion. It rewrote the test to
  drive `registrationInconsistency` through a route the real roster supports: both the Poisoner and
  the Monk have `resolverId: null`, so `StepResolution.registrationRulings` can be supplied
  directly through `resolveAnswer`'s documented `!computes` branch. Rules p6 a Minion on night 1,
  good on night 2, asserts exactly one flag plus both rulings in `registrationHistory`. Accepted:
  it exercises the actual §16.6 selector rather than patching around a false premise.

**R22 — Task 18's `answerClass.test.ts` cannot run as written, and this is a blocking backwards
dependency of exactly R1's shape. Found now rather than at Task 18's dispatch.** Its code block
says it uses "Task 16's `seeded()` fixture and helpers". I checked what Task 16 actually produced:
- `seeded()` is **module-private** in `nightCommands.test.ts` (`function seeded()`, no `export`).
- **`walkTo` does not exist anywhere.** Task 16 wrote `toNightTwo`/`toImp` instead.
- The block has **no import statements at all** — not for `seeded`, `walkTo`, `resolveStep`,
  `candidatesForCurrentStep`, nor `describe`/`expect`/`it`.
- Worst: one test calls `walkTo(store, 'investigator')`, and the mandated roster **has no
  Investigator** — nor any Recluse or Spy, so no ambiguous player and therefore no
  `registration`-class answer exists in that game at all. The walk would run off the end of the
  night order and throw before reaching the assertion, the same way Task 9's Undertaker fixture
  could never pass.
Ruling: **`answerClass.test.ts` is self-contained.** It writes its own imports, its own `seeded()`
over the same twelve-player roster (which I verified is chart-legal at 7/2/2/1), and its own
`walkTo(store, stepId)` with a guard counter modelled on Task 16's `toImp`. Duplicating a fixture
across test files is normal here and every other test file already carries its own `ROLES`.
For the Investigator test specifically: give **that test** a roster containing an Investigator and
a Recluse, so a `registration`-class answer with a null-headed tuple genuinely exists. Do **not**
delete the test and do **not** keep its `if (!ruled) return;` early exit — that early exit is
itself a hollow-test smell, silently passing whenever its precondition is unmet, and this is the
**only** test in the entire plan that exercises `nightCommands.ts:246`'s
`Array.isArray(value) && value[0] === null && !resolution.stChoice` guard. That guard is the whole
reason my Task 8 ruling made the Ravenkeeper's ruled answers `[null, target.id]` instead of the
bare `value: null` that two independent opus reviews recommended. Deleting the test would retire
the only witness for a guard that a prior ruling exists to keep fireable.
Cost if wrong: one test file carries its own fixture instead of importing one, and one test uses a
different roster from its neighbours. The alternative is a test file that cannot run.
Task 16: review (opus) — spec ❌, quality **Needs fixes**: zero Critical, 6 Important, 9 Minor.
The strongest review of the plan so far, and the only one to have *probed* a rule read-only rather
than reasoning about it. The hard parts came back right: §16.1's pre-death view is correct **and
commented as such**; `resolveAnswer` turns §4.3's table into real enforcement (it gates
`fabricated` on `isDrunk || isPoisoned` rather than the weaker `functional`, and cross-checks
`chosen.answerClass` against the claimed class, which is the mechanism that stops `answerClass`
being self-reported); the reducer appends in **exactly** the three events that carry
`registrationRulings`, verified against events.ts line by line; and §4.1 holds — `nightCommands.ts`
uses `position.actorPerceivedCharacterId` and the brief's stale prose note was correctly ignored.
It also confirmed the walk helpers and `autoSkipUnmetSteps` against the real night order: the
Ravenkeeper's and Undertaker's conditions are genuinely unmet on night 2, so the `> 0` and
`conditionMet === true` assertions are both reachable and the earlier draft's defect is fixed.

**Both ⚠️ items resolved by me.** The `applyVirgin`/`claimSlayer` §16.6 question is finding 6 and I
am authorising the cross-task edit below. Whether Task 18's `answersAtSeq` is the intended home of
the `computes`-branch coverage: partly — Task 18's `answerClass.test.ts` is scheduled against
exactly that branch, **but R22 already records that it cannot run as written**, so it is not a
coverage guarantee I can lean on. Finding 3 stands on its own.

**Task 16 Ruling: finding 1 (the reducer append breaks §3.5's identical-state-object guarantee) —
FIX, and it is the most consequential finding of the round because it is in the reducer.** Verified
directly: all three cases end `return { ...next, registrationHistory };`, which allocates a fresh
top-level state object **unconditionally**. `SLAYER_CLAIMED` with `claimantIsRealSlayer: false`
previously returned `state` itself, and `VIRGIN_TRIGGERED` returned `state` when `virginTriggered`
was already set — so both now hand back a different object for an event that changed nothing.
`dayAbilities.test.ts`'s "records a bluffed claim with no death" drives exactly that path with p7
the Chef. Nothing reddens because the only §3.5 identity test covers `PLAYER_RENAMED`. I asked for
the ruling list not to allocate when empty and got that; the *state object* is the half that was
missed. Fix as the reviewer prescribed — one `withRulings(next, rulings)` helper that returns
`next` unchanged when the list is empty — which repairs the identity loss and the three-way
duplication in the same edit. Add the §3.5 identity assertion on one of these events, since the
existing test's single case is what let this through.
Cost if wrong: one helper in the reducer. Against a §3.5 property fourteen tasks were built on.

**Task 16 Ruling: finding 2 (the barrel laundering route is only half closed) — FIX, but NOT by
enumerating patterns. Remove the two names from the barrel instead.** The reviewer probed
read-only and found `'..'`, `'../index'`, `'./index'` and `'../../engine'` all **silent** while
only the two alias spellings fire. This is Task 12's minimatch hole again, one level up, and its
own config comment documents the identical failure for `'./players'`. The reviewer's own
observation about the evidence is the sharp part and I am recording it: the implementer's two CLI
transcripts tested the two spellings it *added*, so they prove the additions work — not that the
route is closed. Proving a rule fires is not proving a boundary holds.
Ruling: **drop `perceivedCharacterId` and `playersWithPerceivedCharacter` from
`src/engine/index.ts` entirely.** Reasons, in order of weight. (1) It converts a lint question into
a **compile error**: with the name absent, importing it from `'..'` or any other spelling fails
`tsc`, so there is no spelling left to enumerate and no future spelling to miss. (2) A barrel that
re-exports the one function §4.1 restricts is at odds with the restriction — the "single import
surface" promise and the §4.1 boundary cannot both cover the same name. (3) It costs nothing
today: I verified the barrel has **no importers at all** yet, and the barrel-completeness test does
not assert either name. Plan 2's UI is already exempt via the `src/ui/**` ignore, so it imports
from the sanctioned path directly, which is precisely what §4.1 sanctions it to do.
Keep the `'@/engine'` and `'@/engine/index'` group entries the implementer added, as a tripwire
that catches a future re-addition by lint as well as by review.
Cost if wrong: Plan 2 imports one function from `@/engine/selectors/players` rather than
`@/engine`. Against an enforcement boundary with four known holes and an unknown number of others.

**Task 16 Ruling: finding 3 (`candidatesForCurrentStep` and §4.3's whole resolver-backed branch
have zero execution anywhere in the repo) — FIX.** The reviewer grepped and found three hits: the
definition, the barrel re-export, and a string inside the barrel test's name list. Nothing calls
it, and nothing reaches it indirectly, because both steps the suite drives are `resolverId: null`.
So none of this ever runs: the resolver lookup and its `undefined` throw, the missing-`answerKey`
throw, the unknown-key throw, the `answerClass` cross-check, and the `stChoice` requirement. This
is the primary path Plan 2's night-step modal renders against, and the cross-check is the
mechanism §4.3 relies on to stop a class being self-reported. The implementer's "outside the
brief's scope" does not survive the reviewer's answer to it: the brief specified
`candidatesForCurrentStep` as production code. Fix: one test that walks to a resolver-backed step
(the Empath is in the roster), calls `candidatesForCurrentStep`, and resolves by key — which
exercises the lookup, the key requirement and the class cross-check in one pass. Task 18's
`answerClass.test.ts` then adds the fuller §4.3 matrix, and its own fixture problems are R22's.
Cost if wrong: one test on the branch Plan 2 is written against.

**Task 16 Ruling: finding 4 (an `integrity`-flagged pick produces a derived state change) — FIX,
and the shape matters.** `flagTargetIssues` flags `target_dead` as `integrity` with the message
"No derived state changes", and then the effect loop emits `STATUS_APPLIED { effective: functional }`
for every target regardless of aliveness — so a Monk protecting a dead player yields a `protected`
entry with `effective: true` and `isProtected(dead)` becomes true, contradicting §4.8 in the one
case §4.8 names first. The reviewer bounded the impact honestly: `demonKill.ts` short-circuits a
dead target to `already_dead` before any protection check, so no game result changes today.
Ruling: `effective: functional && targetAlive` rather than skipping the emission. §3.6 built
`effective` for exactly this — "a Grimoire token is placed even when suppressed (the physical
Storyteller does place it) without lying about its effect" — so the token stays in the record where
§4.8 wants it and the derived predicate reads false, which is what "no derived state change" means
in practice. Skipping the emission would lose the record instead.
Cost if wrong: a dead player carries an ineffective `protected` entry rather than none. Visible in
the log either way, and no predicate reads true.

**Task 16 Ruling: finding 5 (`resolveImpStep` never calls `flagTargetIssues`) — FIX.** The Imp step
declares `targets: { min: 1, max: 1, warnDead: true }`, and §4.8 applies "at night as well as by
day" with off-constraint picks emitting `RULE_FLAGGED` in the same transaction. An Imp pointed at a
dead player produces `already_dead` in the chain and **no flag at all**, while the identical
mistake at the Monk step does flag. The derived state is right; the advisory record — which is the
product feature, "the app's job is to notice out loud" — is missing, asymmetrically, in the one
command the brief singled out. Fix: call `flagTargetIssues` with the chosen target.
Scope it to the **chosen** target and not the bounce target: Task 11 already ruled that a dead
bounce target falls through to the `already_dead` guard and is recorded there, and
`mayorBounceCandidates` filters on `alive` so the offered list never contains one.
Cost if wrong: one flag on a night mis-tap. §4.8 asks for it by name.

**Task 16 Ruling: finding 6 (§16.6 is wired into one of three producers) — FIX, and I am
authorising the cross-task edit to `dayCommands.ts`.** `registrationInconsistency` has exactly one
caller. But `VIRGIN_TRIGGERED` and `SLAYER_CLAIMED` both append to `registrationHistory` — and
`types.ts` says that is deliberate — so the ledger *records* day rulings and *reads* them when
checking a later night ruling, while never checking a day ruling itself. The canonical case is
§16.12's own scenario: ruling the Recluse a Demon for the Slayer, after ruling them good on night
1, is exactly the contradiction §16.6 exists to surface, and it passes silently. §16.6 is one of
the twelve rulings the engine hardcodes and the brief itself notes nothing in the plan implemented
it; implementing it for one producer of three is implementing a third of it.
The reviewer correctly flagged that the fix lands in Task 15's file and routed it to me rather than
expecting it here. Authorised: Task 16 adds the same three-line flag loop to `applyVirgin` and
`claimSlayer`, plus a test for each. The file has tests, the change is additive, and the
alternative is shipping §16.6 two-thirds unimplemented into the final review.
Cost if wrong: two commands gain a flag loop identical to the one in `resolveStep`. Reversible in
six lines.

Folded into the same round: **Minor 6 upgraded**, because the reviewer is right that "for a file
whose entire purpose is a contract, iterating a declared name list is a thinner guarantee than it
looks" — the test names 34 of ~90 exports, so `renamePlayer`, `deal`, `validateDeal`, `stepKey`,
`reduce`, `toRulesView`, `checkVictory`, `onDemonDeath` and every seating/statuses/nominations
selector can be deleted from the barrel with it still green. Change it to assert the **exact set**
of runtime exports (`Object.keys(api).sort()`), which can then fail in both directions; Tasks 17
and 18 already have to touch this test under R2, so the maintenance is already budgeted.
Also folded: Minor 1 (`functional` is a parameter `resolveAnswer` never reads, kept alive only by
a `void functional;` — drop both; plan-mandated but dead weight); Minor 3 (the `computes` branch
does not re-assert non-empty rulings for a `registration` answer while the `!computes` branch does,
so a §4.3 constraint is enforced on one of two routes); Minor 5's comment half (document why
`registrationInconsistency` reads pre-transaction state while `flagTargetIssues` reads
`tx.view()` — the choice is right, the undocumented mixture is not); Minor 7 (the duplicate-id
guard has no test, and the reviewer's reason is the right one: two players sharing an id makes
every `players.find(p => p.id === x)` in the engine resolve to the first, which is the worst
failure shape this codebase has — plus the `MIN/MAX_PLAYERS` bound and `beginFirstNight`'s
roles-locked guard, three cheap tests); and Minor 8 (the one non-null assertion in the file becomes
a throw with a message).
Task 16: minor (deferred): `registrationLedger.ts` compares only `registersAs.team` and ignores
`registersAs.alignment`. Unreachable in Trouble Brewing, where team determines alignment, but the
field is on the type and a second edition breaks the check silently. §3.8's known-debt class.
Task 16: minor (deferred): two mutually contradictory rulings **within a single event's**
`registrationRulings` array are never flagged, because the check reads pre-transaction state. Real
but not reachable through any command in the plan — no producer emits two rulings about one player
in one event.
Task 16: minor (deferred): the §16.6 test is genuine but **synthetic** — it attaches rulings to
Poisoner and Monk steps, which no real Storyteller flow produces. Finding 3's resolver-backed test
and finding 6's day-site tests together give §16.6 a realistic route; the synthetic one stays
because it pins the command wiring.
Task 16: minor (deferred): `nightCommands.ts` is 386 lines with five responsibilities
(answer-class enforcement, target flagging, step resolution, the kill chain, phase advance).
Cohesive today; `resolveAnswer` and `flagTargetIssues` are the natural extraction if §4.3 or §4.8
grow. For the final review's trim pass.
Task 16: fix round 1/5 — resuming the original implementer (context intact), FIX_BASE 5f815ab.
Task 16: fix round 1/5 was **interrupted mid-round by a spend limit**, not by a failure. I
established the exact state from the working tree rather than from the agent's last message, since
a partially-applied fix round is the one place this process can silently redo or skip work:
FIX 1 and FIX 2 were **complete and correct but uncommitted** (three modified files, nothing
staged), FIXes 3–6 and the folded minors untouched. Verified FIX 1 by reading `withRulings` and
all three call sites, and its two new §3.5 tests, which assert **strict identity with `toBe`** on
the bluffed-`SLAYER_CLAIMED` and repeat-`VIRGIN_TRIGGERED` producers — a `toEqual` there would have
passed under the very spread the fix removes. Verified FIX 2 by confirming both names are gone from
the barrel and that the deletion carries a comment telling the next reader not to restore them.
Resumed the same agent with that state stated explicitly and an instruction not to redo either fix.
Also named one trap in FIX 6's own tests before it writes them: a registration inconsistency needs a
**prior** ruling about the same player with a different team already in `registrationHistory`, so
the fixture must make **two** rulings. A test making one and asserting a flag would pass only if
the check were wrong; a test making one and asserting no flag would pass whether or not the loop
exists. Both are the fixture-cannot-reach-the-state shape this plan keeps producing.
Task 16: fix round 1/5 — implementer DONE after the resume, commit 872eb09. 464/464 across both
Vitest projects (451 → 464), typecheck and lint clean, working tree clean. Seven files, including
the two authorised cross-task edits to `dayCommands.ts`.
Verified myself before the re-review: FIX 4's `effective: functional && targetAlive` is in place,
FIX 5's `flagTargetIssues(tx, position, [opts.targetId])` is in `resolveImpStep` and passes the
chosen target only, and FIX 6's flag loop appears at **both** day sites in `dayCommands.ts`.
It caught the trap I named on FIX 6 and reported the consequence rather than working around it
silently: the shared twelve-player roster **has no Spy**, so it can never produce the ruling
`applyVirgin` needs, and a fixture built on it would have asserted against a contradiction that
could not occur. It built a separate mini-roster for that case instead. That is precisely the
"fixture cannot reach the state its name claims" shape, caught before it shipped rather than after.
Scoped re-review dispatched (sonnet) over 5f815ab..872eb09 with six named checks. The first is the
one that could make this round's headline improvement worthless: **Minor 6's exact-set assertion is
tautological if the expected list is derived from the barrel itself.** A list computed from
`Object.keys(api)` — or built by any route that reads the module under test — proves only that the
module equals itself while looking like the strongest contract in the suite. It has to be a
hand-written literal. Same independence bar Task 7's reference implementations and Task 10's
properties had to clear, and the same failure mode: a test that cannot fail wearing the clothes of
a thorough one.
Task 16: fix round 1/5 re-review — **all 6 Importants and all 6 folded minors ADDRESSED, no new
Critical/Important breakage.** Every one of the six named checks was verified against source rather
than against the pasted transcripts.
The check that could have hollowed out the round came back right: `ENGINE_BARREL_RUNTIME_EXPORTS`
is a **hand-written 95-entry literal**, confirmed by direct inspection to be an array literal and
not derived from `Object.keys(api)` — so the barrel contract can fail in both directions instead of
proving the module equals itself. It also correctly omits the two restricted names.
FIX 2 removed exactly two names with no orphaned importer anywhere in the repo, and a permanent
regression test now asserts both are **absent** from the runtime API — so a future re-addition
fails a test, not just a review. FIX 6's two fixtures both reach genuine two-ruling contradictions,
and the purpose-built five-player roster (imp/spy/virgin/chef/soldier) was checked against
`DISTRIBUTION[5]` and is chart-legal, so `assignRoles` accepts it. FIX 4's `targetAlive` is read
from the correct snapshot and its test genuinely depends on it. FIX 5 flags only the chosen target,
with no Mayor-bounce double-flag path. 451 → 464 reconciles exactly, and both new §3.5 tests use
`toBe` rather than `toEqual` — the distinction that decides whether they can fail at all.
Task 16: minor (deferred): `eslint.config.js`'s `ignores` comment for `src/engine/index.ts` is now
stale — it says the barrel re-exports `perceivedCharacterId` for its sanctioned consumers, which is
no longer true after FIX 2. Harmless (the barrel imports neither name, so the rule has nothing to
fire on) but misleading. For the final review's trim pass.
Task 16: complete (commits ebc8e0a..872eb09, review clean after 1 fix round)

=== SESSION BOUNDARY: handoff-2026-09-08-0141 resumed. Tasks 1-16 complete; 17-18 remain. ===

Task 17: pre-dispatch re-verification of R15 and R16 against the tree (BASE 872eb09), done
because R15 itself demanded it — this plan's rule that a prescription needs the same
"would this actually work?" interrogation as the diagnosis.

**R15's two named re-verifications both come back clean, so the prescription stands as
written.**
- `recordDeath(store,'p3','other')` produces **no third successor.** After the first
  `recordDeath(p1)`, p3's `characterId` is `'imp'`, so `onDemonDeath`'s Scarlet Woman lookup
  (`p.characterId === 'scarlet_woman' && p.alive && p.id !== deadDemonId && abilityFunctional`)
  finds nobody — she is the demon now, not a Scarlet Woman — and with `starpass: false` the
  handler returns `{ successorId: null, successorReason: null }` at demonDeath.ts:99-106.
  p3 is also still **alive** at that point (promotion does not kill her), so §16.1's
  already-dead precondition throw cannot fire.
- **The store does not refuse a transaction after `GAME_ENDED`.** store.ts:185 gates the
  commit-time check on `victory.status === 'ongoing'`, so once good has won the store neither
  re-checks victory nor appends a second `GAME_ENDED` — and nothing anywhere rejects a later
  transaction. So `changeRole(store,'p5','imp')` after the win commits normally, and
  applyEvent.ts:254-258's guard passes it because no living player holds the Demon. R15's
  fixed test is reachable and its assertion is the one that can go green.

Also verified for Task 17 and needing no ruling: the twelve-player roster is chart-legal
(7 townsfolk / 2 outsiders / 2 minions / 1 demon against `DISTRIBUTION[12]` = 7/2/2/1) and
`validateDeal` does not check demon bluffs, so `assignRoles` accepts the set; seats are
**0-indexed** (setupCommands.ts:22 `players.map((player, seat) => …)`), so the drop-out test's
`seat === 5` for p6 is right; `tx.flag` appends `RULE_FLAGGED` inline in body order
(store.ts:143-145), so `['ROLE_CHANGED','RULE_FLAGGED']` is the real event order; setup emits
no flags, so the legal-change test's `ruleFlags).toEqual([])` is honest; `STATUS_CLEARED`
filters on `status` **and** `sourcePlayerId` (applyEvent.ts:336-344) and p4 is not the red
herring (p5 is), so the cleared-ledger assertion can reach `[]`; `NOTE_ADDED` carries the
required `id`, and `Note`/`NoteScope`/`StatusName`/`DeathCause`/`CharacterId` all exist in
`types.ts` where the brief imports them; and the barrel test's `ENGINE_BARREL_RUNTIME_EXPORTS`
is the 95-entry hand-written literal at nightCommands.test.ts:520-540, holding none of Task
17's four names.

R16 confirmed operative: Task 17 stages `src/engine/commands/nightCommands.test.ts` alongside
`src/engine/index.ts`, adds the four names to that literal (95 -> 99) and the export line to
the barrel. The exact-set assertion fails in both directions, so neither half can be skipped.
Task 17: implementer dispatched (sonnet), BASE 872eb09.

**Task 18 pre-dispatch verification, done while Task 17's implementer ran. R17, R18, R21 and
R22 all re-verified and all stand as written. One new defect, and it is the biggest one this
plan has produced: the scripted full game — the plan's own acceptance test — cannot pass.**

**Re-verifications (each was a prescription I made earlier from plan text; this is the tree.)**
- **R17 holds.** `nightCommands.ts:209-221` gates `fabricated` on
  `isDrunk(actor) || isPoisoned(actor, view.phase)` reading the cursor's own actor, and the
  nine-player roster has no Poisoner, so the Empath is sober and the night-1 handler throws as
  transcribed. The fix is legal: `runNight` calls each handler **outside** any transaction
  (the loop body calls `handler()` directly), so a handler opening its own `store.transaction`
  is not the re-entrant nesting store.ts:102 throws on. And `applyEvent.ts:331` stamps
  `appliedAt: state.phase`, so a `STATUS_APPLIED` emitted during night 1 is genuinely
  night-1-applied and active at the Empath step (2 <= 2 <= 3).
- **R18 holds, and the replacement assertion is reachable.** Poison applied night 1 expiring
  day 1 is ordinal 2..3; night 2 is ordinal 4, so `isPoisoned` is false there while the entry
  remains in `statusLedger`. `isPoisoned(player, phase)` is the real signature
  (statuses.ts:27) and `isPoisoned` is already in the engine barrel, so the test can import it.
  p5 is still the fixture's `redHerring`, so the ledger-length assertion is still green before
  any night step runs — it must become the predicate plus a `some(s => s.status ==='poisoned')`
  presence check, which is the pair that distinguishes an expired poison from a missing one.
- **R21 holds.** `advisory.property.test.ts` seeds with raw `tx.emit('ROLES_ASSIGNED', …)` and
  never calls `assignRoles`, so its chart-illegal 3/1/2/1 roster never reaches `validateDeal`.
  Comment, not a new roster. Its invariants are also sound against the reducer:
  `applyDeath` (applyEvent.ts:137) returns `state` unchanged for an already-dead or unknown
  player and appends **no** death record, so "one death record per player" and
  "dead set === death-record set" can both hold.
- **R22 holds.** `seeded()` is still module-private at nightCommands.test.ts:38; the helpers
  are `toNightTwo` (:60) and `toImp` (:392); there is still no `walkTo` anywhere.

**R23 — the scripted full game's roster drifted away from its own script, and the main test
cannot pass. Fix the ROSTER, not the script.** Defect twenty-two, and unlike the others it is
not a compile error or a hollow assertion — it is a wrong game.
The roster is p1 imp / p2 **scarlet_woman** / p3 **saint** / p4 washerwoman / p5 empath /
p6 monk / p7 undertaker / p8 butler / p9 mayor. But the script:
- executes **p2** on day 1 under the comment "the Poisoner is executed" — there is no Poisoner,
  and p2 is the **Scarlet Woman**, so the script kills on day 1 the exact character whose
  promotion the whole game exists to exercise;
- then on day 3 executes the Imp and asserts `p3.characterId === 'imp'` and
  `victory === ongoing` — but with the Scarlet Woman dead, `onDemonDeath` finds no successor,
  §4.7 row 1 fires, and **good wins on day 3**. Both assertions fail;
- then on day 4 nominates **p3**, who is the **Saint** — which under §4.7 row 2 would hand
  **evil** the game, where the test asserts good wins by `demon_dead`.
Corroborating evidence that the roster is the half that drifted, not the script: the night-2
comment "No Poisoner step: they are dead" describes a Poisoner the roster does not contain;
the Mayor-win test's comment names "p3 (Scarlet Woman)"; and the roster's own comment says
"The Scarlet Woman **replaces the Poisoner** as the single Minion" — i.e. the substitution was
made at p2 and every downstream reference to p3-as-Scarlet-Woman was left behind.
**Ruling: swap the roster to p1 imp / p2 washerwoman / p3 scarlet_woman / p4 saint / p5 empath
/ p6 monk / p7 undertaker / p8 butler / p9 mayor**, and leave the main test's body untouched.
Verified legal: 5 townsfolk (p2,p5,p6,p7,p9) / 2 outsiders (p4,p8) / 1 minion / 1 demon, and
`DISTRIBUTION[9]` is 5/2/1/1, so `assignRoles` accepts it.
I traced the whole main test against that roster before ruling, day by day: day 1 executes p2
the Washerwoman on 5 of 5 votes (so the Undertaker still wakes on night 2 with something to
learn); night 2 the Imp kills p4, whose being the Saint is harmless because row 2 requires
death **by execution**; day 2's single vote falls short of 4 so nobody dies; night 3 the Imp
kills the Monk; day 3 executes the Imp at 6 alive on 4 of 3 votes, `onDemonDeath` counts 6 >= 5
with p3 alive and functional and **promotes p3**, so `victory` stays ongoing and
`p3.characterId === 'imp'` — both **exactly as the test already asserts**; night 4
`scarlet_woman_notify` wakes p3 because its `wakes` filters on `!demonNotified` (nightOrder.ts:
259) and R8 set that flag only on the original Imp, so `demonNotified` becomes true on p3;
day 4 executes p3, whose true character is now `imp`, with no Scarlet Woman left, and good wins
`demon_dead` with `nextStep` null. **Zero edits to the main test.**
Why the roster and not the script: the alternative is redesigning the game's arc — moving day
1's execution, re-targeting night 2's kill, and re-pointing six assertions — in the plan's
single highest-value test, and every player except the Washerwoman is load-bearing later (p5
nominates on three days, p7/p8/p9 are the day-3 and day-4 vote blocks, p6 dies on night 3).
Repairing a drifted fixture to match the script its author wrote is strictly less invention
than rewriting the script to match the drift.
Two consequential edits the swap does require, both verified:
- the "no second kill" test asserts the promoted Demon is **p2**; it becomes **p3**.
- the "Saint executed by vote" test nominates `p4 -> p3`, which now nominates the Scarlet
  Woman. It becomes `nominate(store, 'p2', 'p4')` with voters `['p2','p5','p6','p7','p9']` —
  five votes against a threshold of 5 at nine alive, deliberately excluding the Butler so no
  incidental §16.3 flag rides along. The Saint carries `requiresAlive: false`, so
  `abilityFunctional` is true after death and row 2 fires.
And two comment-only corrections: the Mayor-poison test's "p2 (Scarlet Woman)" is now
"p2 (Washerwoman)", and day 1's "the Poisoner is executed" and night 2's "No Poisoner step:
they are dead" both name a character the roster never had.
Cost if wrong: the scripted game plays a slightly different nine-player game than the one the
plan's prose narrates. Against an acceptance test that fails on day 3 with two wrong-result
assertions and then asserts the opposite winner on day 4.

Task 18: minor to fold into the same dispatch: both the "replays to the same state" test and
the Mayor-win test pass an `imp:` handler to a **night-1** `runNight`, and §6.3 gives the first
night no Imp step — so both handlers are dead code that reads as covering a kill. Same shape as
R17's dead `poisoner:` handler; delete all three. Also `answersAtSeq` looks its resolver up as
`RESOLVERS[stepId]`, while `RESOLVERS` is keyed by `resolverId`; every resolver-backed step in
this edition happens to name its resolver after itself (verified: all eight), so it is correct
today and wrong the day one does not — one comment, or read `resolverId` from the night order.

**R22's prescription made concrete, now that the tree can be read rather than the plan.** All
six error-message regexes in `answerClass.test.ts` match the strings `resolveAnswer` actually
throws (verified one by one against nightCommands.ts:226-284), so only the fixture half of the
file is broken. Task 16's roster puts the **Empath at p7** and the Poisoner at p2, so the
brief's `'accepts a fabricated answer from a poisoned actor'` test poisoning `'p7'` is right as
written — it really does poison the Empath. For the Investigator test, the minimal chart-legal
roster is Task 16's twelve with **two same-team substitutions**: `p5 ravenkeeper -> investigator`
(townsfolk for townsfolk) and `p10 saint -> recluse` (outsider for outsider), leaving 7/2/2/1
intact. That gives the Investigator a real step on the first night, two true Minions for the
canonical answer, and a Recluse who can register as a Minion — so `oneOfTwo` returns a
`registration` answer whose `value` is the null-headed tuple `[null, player.id, decoy.id]`, which
is the only thing that makes nightCommands.ts:278's `Array.isArray(value) && value[0] === null
&& !resolution.stChoice` guard fire. `stChoice` is `string | undefined` on `StepResolution`, so
the brief's `stChoice: 'Baron'` type-checks.
`walkTo(store, stepId)` must be modelled on Task 16's `toImp`, i.e. `autoSkipUnmetSteps` plus
`skipStep` with a guard counter — a walk that only advances cannot get past the Chef.
Cost if wrong: one test file's roster differs from its neighbours' by two same-team characters.

**R24 — `replay.test.ts`'s "a later death changes the live answer" assertion cannot fail, and
in fact cannot pass. Defect twenty-three.** Its roster seats p1 imp(0) / p2 poisoner(1) /
p3 empath(2) / p4 chef(3) / p5 monk(4) / p6 soldier(5) / p7 mayor(6), and then kills **p2** to
show that the live Empath answer has moved away from the historical one. It has not.
`aliveNeighbours` skips the dead, so the Empath's left neighbour goes from p2 (poisoner, evil)
to **p1 (imp, evil)** — the two evils are adjacent at seats 0 and 1 — and `empathCount` is
**1 both before and after**. So `expect(live).not.toEqual(expected)` fails, and the test that
is the entire point of `answersAtSeq` (that history does not move when the present does) never
witnesses anything. Killing p4 instead is no better: the right neighbour would go from the Chef
to the Monk, good to good.
Ruling: **swap the two roles, `p2 -> 'chef'` and `p4 -> 'poisoner'`, and kill p4.** Then the
Empath's neighbours are good/evil before (count 1) and, once p4 is dead, p2 and p5, both good
(count 0) — so the live answer genuinely diverges from the historical one and each assertion
can fail independently. Verified chart-legal: imp / chef / empath / poisoner / monk / soldier /
mayor is 5 townsfolk / 0 outsiders / 1 minion / 1 demon, and `DISTRIBUTION[7]` is 5/0/1/1.
(`buildGame` does not go through `assignRoles`, so legality is not enforced here — but this
roster is legal anyway, unlike the advisory fixture's, and there is no reason to make it not
be.) Apply the same swap to the second test's roster so the two do not silently disagree; that
test asserts `answersAtSeq(events, 1, 'poisoner', 'p2')` is `[]`, which holds regardless because
`RESOLVERS` has no `poisoner` entry and returns before reading the actor.
Cost if wrong: the replay fixture seats the Poisoner three seats over. Against the plan's only
witness for §3.6's not-storing-legalAnswers decision proving nothing.
Task 17: implementer DONE (sonnet) — commit 54bc5cf, 473/473 across both Vitest projects
(464 -> 473, 30 files), typecheck and lint clean. Exactly the four files in scope (two creates,
two modifies). Verified myself before review: correct author (rithwikrtk / rithwik@trypencil.com)
and the exact `Co-Authored-By` trailer, working tree clean, **zero `eslint-disable`** and no
`perceivedCharacterId` reference in either new file, R16 applied on both sides (the barrel export
line plus the literal at 99 entries holding all four names), and the R15 test carrying both
`recordDeath` calls with a comment block stating the after-the-win consequence.
It confirmed R15's diagnosis empirically rather than taking it on trust — reverting to the
brief's single-`recordDeath` form reproduces `expected 'chef' to be 'imp'` — which is the right
treatment for a controller prescription.

**Three disclosures in its report, all of the "cannot fail" shape and all reported rather than
patched, which is what I asked for.** Recording them because they are the reviewer's first
priority check and two of them are honest about the *limits* of the mutation evidence:
- `nextNoteId`'s `taken.has` guard survives two alternate-implementation mutations (dropping the
  `+1` offset, dropping the guard) because under the sole producer's invariant
  `state.notes.length + 1` never collides. It named the one mutation that does redden
  (hardcoding `'note1'`) rather than claiming the guard is pinned.
- `demonDeath.kind === 'resolved'`'s false arm is unreachable from `recordDeath` (which
  hardcodes `starpass: false`, and `onDemonDeath` only returns `needs_successor_choice` when
  `starpass` is true), and deleting the clause keeps all 473 tests green but **fails `tsc`** — so
  the branch is type-enforced rather than test-enforced.
- the `successorReason === 'starpass' ? …` ternary's true arm is likewise dead at this call site,
  and **no test in the plan observes the `reason` field of a `ROLE_CHANGED` at all**; hardcoding
  `'starpass'` leaves the full suite green. This is the same idiom Task 14 ruled on at
  dayCommands.ts:133, where the ruling was a comment saying it is type narrowing rather than a
  restructure, precisely so the four call sites do not disagree. Task 17's copy has **no such
  comment** — a candidate fold-in.
Task reviewer dispatched on **opus** over review-872eb09..54bc5cf.diff. The bump is not for the
diff's size — it is small and largely transcription — but for what it routes: `recordDeath` is
the fourth §4.6 call site, so every failure here is a wrong game result rather than a crash, and
Task 18's scripted game thins its table with this command. Six named priority checks, including
two hazards I found myself and deliberately posed as questions rather than pre-judged: that
`recordDeath`'s `cause` is the **full** `DeathCause` and is now barrel-exported, so a caller
passing `'execution'` would inject a phantom execution into `todaysExecutions` — which the
Undertaker reads at night and §4.7 row 4 requires to be empty, the exact harm shape the Task 15
Virgin ruling closed; and that nothing in `recordDeath` guards an **already-dead** target, where
a non-Demon no-ops silently and a Demon trips §16.1's precondition throw, neither of which is
obviously §4.8's "recorded and flagged, no derived state change" treatment.
Task 17: review (opus) — spec ✅, quality **Needs fixes**: zero Critical, 3 Important, 6 Minor.
Both of the hazards I posed as questions came back as real findings, and the reviewer traced
each one further than I had. It also cleared the two checks that decide whether the task's
headline work is real, and did so by mutation rather than by reading: **the R15 test is a
genuine witness** — dropping `p.alive` from the reducer's guard at applyEvent.ts:255 reddens it,
so it pins the guard as being about *living* Demons rather than about Demons; and the paired
blocking test reddens from **both** directions (drop `tx.flag` → the event sequence fails;
remove the reducer guard → `.toBe('chef')` and the demon-count assertion fail). The barrel
contract is intact: still 99 hand-written literals `.sort()`ed against `Object.keys(api).sort()`,
nothing derived from the module under test, and the only `-` lines in `nightCommands.test.ts`
are reflowed quoted names — no `it` deleted, no assertion loosened. 464 -> 473 is exactly the
nine new `it` blocks. It also noticed something in the implementer's favour that I had not:
`characterById(to)` and `playerById` run **before** the transaction opens, so a bogus id throws
without staging anything into the log.

**Task 17 Ruling: finding I1 (an already-dead target gets neither of §4.8's two treatments) —
FIX.** The same Storyteller mistap — a double-tap on a player already dead — produces two
different wrong behaviours depending on the target, and neither is what §4.8 mandates:
- a **non-Demon**: the staged `DEATH` commits, `applyDeath` (applyEvent.ts:137) returns state
  unchanged, and **no `RULE_FLAGGED` is emitted**. That is the silent no-op this whole task
  exists to eliminate — and applyEvent.ts:136's own comment says "recorded **and flagged**",
  so the reducer has been documenting a flag that had no producer.
- a **Demon**: `onDemonDeath`'s §16.1 precondition throws *before* the transaction opens, with
  a message about passing "the state from BEFORE the DEATH event is applied" — a caller-contract
  diagnosis handed to a Storyteller who simply tapped twice. §4.8's headline is that the app
  never blocks a rule break.
Fix: skip `onDemonDeath` when the target is already dead, and pair the `DEATH` with
`tx.flag('target_dead', 'integrity', …)` — reusing the exact rule name and message shape
already in `nightCommands.ts:88-98`, so the two producers of this flag agree. Note what this
deliberately does **not** do: it does not weaken Task 12's throwing precondition. That throw
exists to catch a caller passing the **post-DEATH view**, which is a real off-by-one that turns
the Scarlet Woman's threshold from 5 into 6; not *calling* the handler for a player who is
already dead is the correct way to honour it, not a way around it. Requires two tests, because
the two branches fail differently today: an already-dead non-Demon must emit
`['DEATH','RULE_FLAGGED']` with exactly one death record, and an already-dead **Demon** must
**not throw** and must produce no second `DEMON_DIED` and no successor.
Cost if wrong: a double-tap records a flagged no-op instead of throwing or passing silently.
That is §4.8's stated behaviour for the integrity class.

**Task 17 Ruling: finding I2 (the note-id reload test cannot fail for the regression it names,
and `nextNoteId`'s guard has no covering test) — FIX, and the reviewer is right where the
implementer was wrong.** The implementer reported the `taken.has` guard as deletable-with-473-
green and read that as "two alternate-correct implementations". The reviewer supplied the case
that makes it load-bearing: a **non-dense** note log — one holding `note1` and `note3` — where
`state.notes.length + 1` alone reissues `note3`. And it diagnosed why the test is hollow:
`createStore(store.getEvents())` runs in the **same process**, so a module counter survives it
and still yields unique ids; the counter-reset collision §12 warns about is only observable
across a process restart, which no unit test in this suite performs.
Fix, in two parts. Keep the reload test — it is the only witness against a constant-id producer,
which is a real regression — but correct its name and comment so it stops certifying
reload-safety it structurally cannot show. Then add the test that actually pins the guard: seed
a store from a log whose `NOTE_ADDED` ids are non-contiguous and assert `addNote` collides with
neither. That is the one test that reddens when `taken.has` is deleted.
On reachability, which the ruling does not rest on: within this plan a gap is not reachable —
`addNote` is the only producer, emits one note per transaction, and undo truncates the tail — but
`createStore` accepts any seed log, §12.6's import is Plan 3, and the guard is three lines.
Cost if wrong: one test on a guard whose only current threat model is a foreign log.

**Task 17 Ruling: finding I3 (the widened `cause` makes `'execution'` a live hazard through the
barrel) — FIX by NARROWING the type, not by adding a guard.** I had flagged this to the reviewer
as a question; it confirmed the trace and added two consequences I had not followed: the death
is stamped `executionKind ?? 'vote'` with **no `EXECUTION` event** beside it, so the forensic
record is malformed; and on a Saint it does not merely suppress §4.7 row 4's Mayor win, it
**fires row 2 and hands evil the game**. One call through a barrel-exported command, and the
game ends with the wrong winner.
Of the reviewer's two remedies I take the type narrowing to `'other' | 'demon' | 'slayer'`,
with a comment saying where executions actually come from. Reasons in order of weight.
(1) It converts a reachable wrong-game-result into a **compile error**, which is the same move
Task 16's FIX 2 made for the barrel's two restricted names, and the only remedy with no spelling
left to miss. (2) The alternative — a day guard plus an `EXECUTION` emit — gives the app a
*second* way to execute someone, outside the nomination flow that §7 says is the only route, with
a different forensic record from `closeDay`'s. Task 15's ruling drew exactly this line: record
the social event, refuse the derived death. (3) It costs nothing: §18 asks for `cause: 'other'`,
§3.4's corrective `DEATH` plausibly wants `'demon'` (a mis-recorded night kill) or `'slayer'`,
and a mis-recorded *execution* is corrected by undoing the day-close transaction or by a note —
not by minting a second execution. It also moves the signature **toward** the brief's own
Interfaces block, which says `cause: 'other'`, rather than away from it. Verified no caller
breaks: Task 17 created the command and Task 18's scripted game passes `'other'` at both sites.
Cost if wrong: a future caller wanting to record a corrective execution must go through the
day-close flow or widen the type deliberately, in a commit that says so.

Folded into the same round, all cheap and all in this task's own files: **M1**, the two-line
comment on the `successorReason === 'starpass'` ternary — not tidiness, because Task 14's ruling
established the comment as the remedy for this idiom and `dayCommands.ts:163-168` **names Task
17** as a repeater of it, so leaving it bare makes four call sites disagree about whether the
branch is dead code or type narrowing (the reviewer independently confirmed the implementer's
facts: `reason` is forensic-only, applyEvent.ts:243 destructures only `{playerId, to}`, and no
selector reads it); **M2**, `clearStatus` taking no `playerById` call, so an unknown player id is
a silent no-op where its two siblings throw — add the guard for the unknown **id** only and
deliberately not for a `sourcePlayerId` that matches no status, since clearing a status that is
not there is a legitimate no-op with nothing to corrupt, and §4.8 says do not block it;
**M3**, `addNote` recording a `scope: 'player'` note attached to nobody, or to a player id that
names no player — same malformed-app-input line as Task 4's `assignRoles`, Task 11's Mayor bounce
and Task 14's `castVote`; **M4**, `addNote` reading `store.getState()` inside the transaction body
— compute the id before opening the transaction, which is what `nextNominationId` already does;
and the `clearStatus` half of **M5**, a `toHaveLength(1)` before the clear, because that test
would pass **vacuously** if its raw `STATUS_APPLIED` fixture ever stopped applying.
Task 17: minor (deferred): the other half of M5 — `expect(player.seat).toBe(5)` cannot be
reddened from this task's files, because no code path anywhere writes `seat`. Kept rather than
deleted, unlike Task 6's hollow assertion: it does weakly witness that `recordDeath` leaves the
player in the array at their index, and §18's seat invariant has a far stronger guard arriving in
Task 18's advisory property test, which asserts the whole seat array against `0..n-1` over
arbitrary generated event streams. Recording it so the final review knows Task 18's property
test is the real witness and this one is documentation at the point of use.
Task 17: minor (deferred): `changeRole`'s `wouldDoubleDemon` duplicates the reducer's guard at
applyEvent.ts:254-258. Byte-equivalent today, and **both directions are pinned** (the
double-Demon test asserts the flag *and* that the change was refused; the legal-change test
asserts no flag *and* that it applied), so unlike Task 9's `requiresAlive` duplication this one
has a test that fails if the copies disagree. Not extracted because the command would have to
import a reducer-internal predicate or the reducer would have to import from `commands/` —
neither is free. For the final review's triage, since a future divergence regresses straight back
to the silent no-op this task exists to remove.
Task 17: fix round 1/5 — resuming the original implementer (context intact), FIX_BASE 54bc5cf.
Task 17: fix round 1/5 — implementer DONE, commit b14052c. 480/480 across both Vitest projects
(473 -> 480), typecheck and lint clean, working tree clean. Two files touched — the same two it
created — and nothing else. All three Importants and all six folded minors applied, and the two
explicitly-deferred items left alone as instructed.
The evidence is complete and in the form I required: for each Important it reverted the
production change, ran the covering test, pasted the **failure**, restored, and pasted the pass.
Two details worth recording because they are stronger than what I asked for:
- FIX 1's two branches produced **two different** failures under one revert, which is the proof
  that they were genuinely two defects rather than one: the non-Demon case fails
  `expected [ 'DEATH' ] to deeply equal [ 'DEATH', 'RULE_FLAGGED' ]`, and the Demon case fails
  with §16.1's precondition text actually thrown.
- FIX 2's mutation shows the **contrast** the finding was about, not just a red test: deleting
  `taken.has` reddens the new gap test (`['note1','note3','note3']`) while the renamed reload
  test and the other four `addNote` tests **stay green**. That is the finding's whole claim —
  that the old test could not see this — demonstrated rather than asserted.
- FIX 3's witness is a compile error rather than a test failure, which is the right shape for a
  type narrowing: a scratch file passing `'execution'` produces
  `TS2345: Argument of type '"execution"' is not assignable to parameter of type
  '"demon" | "slayer" | "other" | undefined'`, and the scratch was deleted with `tsc` clean and
  `git status` showing only the two intended files.
Verified myself before the re-review: FIX 1 reads `player.alive` from the **pre-transaction**
`view` in both places (the `demonDeath` ternary and the flag branch), which is the one way this
fix could have silently misfired — a post-`DEATH` read would make `alive` false for every target
and flag every recorded death; the narrowed signature is
`cause: 'other' | 'demon' | 'slayer' = 'other'` with the full rationale in the docstring; and no
scratch file survived.
Scoped re-review dispatched (sonnet) over 54bc5cf..b14052c with six named checks. The first is
the one that could repeat this round's own failure mode: **does the new already-dead-Demon test
genuinely reach the guard?** After the first `recordDeath('p1')` promotes the successor, p1
**keeps** `characterId: 'imp'` while the successor also becomes `'imp'`, so on the repeat call
`isDemon` is still true and the new `player.alive` clause is the only thing standing between the
call and §16.1's throw — but a fixture that made `isDemon` come back false instead would witness
the wrong branch and stay green with the fix reverted. Also asked whether FIX 5's `addNote`
guard is genuinely scope-conditional (a game note with no `playerId` must still work), whether
FIX 2's rename kept the renamed test's discriminating assertion rather than only its new name,
and whether FIX 5's new "does not refuse clearing a status that was never applied" test can fail
at all — it pins an intentional no-op, which is precisely the shape that asserts nothing.
Task 17: fix round 1/5 re-review — **all 3 Importants and all 6 folded minors ADDRESSED, no new
Critical/Important breakage.** Every named check was verified against source rather than against
the pasted transcripts, and the two that could have hollowed out the round came back right.
The deciding check is genuine: the re-reviewer traced the already-dead-**Demon** fixture and
confirmed that p1 **keeps** `characterId: 'imp'` after the promotion (only the successor is
rewritten), so on the repeat call `isDemon` is still true and `recordDeath`'s own
`player.alive` clause — not an early return inside `onDemonDeath` — is what prevents the §16.1
throw. Reverting `&& player.alive` genuinely reddens the `.not.toThrow()`. It is the right
branch, not an adjacent one.
Both aliveness reads resolve to the same `player` bound from the **pre-transaction** view, never
`tx.view()`, and it named the test that would catch a regression there (the Demon drop-out test
asserts `['DEATH','DEMON_DIED','ROLE_CHANGED']` with no flag). FIX 2's rename kept its
discriminating assertion verbatim — only the name and comment changed — and the gap test's
`['note1','note3','note4']` was re-derived from `nextNoteId`'s loop rather than accepted as
given (n=3 collides, n=4 wins), with the fabricated `NOTE_ADDED` seed log confirmed acceptable
to the reducer and to `highestTxNumber`. FIX 5's `addNote` guard is genuinely scope-conditional:
a game note with no `playerId` passes both guards untouched. FIX 3's narrowing has no other
caller to break, and the barrel re-export is unaffected. 473 -> 480 reconciles as exactly seven
new `it` blocks plus one rename and one added assertion, with nothing deleted or loosened, and
no `__fix3_scratch__.ts` anywhere in the repo **or in git history**.
It also adjudicated the one test I suspected of being hollow and I accept its reasoning: the new
`does not refuse clearing a status that was never applied` pins a *policy* rather than a data
transformation, but it is not vacuous — reintroducing the status-pair guard the ruling forbade is
a single line that flips it red.
Task 17: minor (deferred): `addNote` with `scope: 'game'` **and** a `playerId` validates the id
and then attaches it to the event anyway, so a game-scoped note can carry a player reference.
Pre-existing in the brief's conditional spread and unchanged by the fix round; the coherent
alternative is to ignore `playerId` outside player scope, which would silently drop a caller's
argument. For the final review to decide which.
Task 17: complete (commits 872eb09..b14052c, review clean after 1 fix round)

Task 18: implementer dispatched (sonnet), BASE b14052c. The last task, and the one carrying the
most pre-rulings: R17, R18, R19, R21, R22, R23, R24 plus the dead-handler minor.
Task 18: implementer DONE (sonnet) — commit 7379b6d, 500/500 across both Vitest projects
(480 -> 500, 34 files), typecheck and lint clean. Exactly the seven files R19's corrected list
names, and it confirmed R19's read by leaving `nightCommands.ts` untouched after checking for a
defect rather than assuming one: Task 16 does own §4.3's enforcement and the brief's `Modify:`
line was stale. Verified myself before review: correct author and trailer, working tree clean,
**zero `eslint-disable`** and no `perceivedCharacterId` in any new file, R23's roster in place
(`p2 washerwoman / p3 scarlet_woman / p4 saint`), R18's assertion replaced by the
predicate-plus-persistence pair, and the barrel literal at **100** hand-written entries
including `answersAtSeq`.

All seven pre-rulings applied, and two were checked in the way this plan has learned to demand.
**It reproduced R24's failure empirically before fixing it** — built the brief's original roster,
killed p2, and watched the "later death changes the live answer" assertion fail exactly as
diagnosed, because `aliveNeighbours` skipped the dead Poisoner and landed on the Imp, leaving
`empathCount` at 1 on both sides. That is the strongest possible confirmation of a controller
prescription: not "applied as directed" but "reproduced the defect first".
**The property-test non-vacuity evidence is the empirical kind, not a docstring.** Three
mutations, each with a shrunk counterexample: deleting the reducer's `ROLE_CHANGED` two-demon
guard fails the two-living-Demons property in **one** action (`promote p4`); loosening
`applyDeath`'s already-dead guard fails the corruption property in three; deleting the
duplicate-vote guard fails it in three. Plus a **measured** trace distribution over 400 runs —
50.7% of sequences attempt a promotion while a Demon lives, 26.0% a repeat death, 1.3% a
duplicate vote — with the instrumented copy deleted before committing. That is exactly the
treatment Task 7's false fully-evil-ring certificate taught this plan to require.

Task reviewer dispatched on **opus** over review-b14052c..7379b6d.diff. The bump is because this
is the plan's **acceptance test**: a green scripted game that walks a different game than its
comments describe is worse than no acceptance test, since it certifies the whole engine.
Eight named checks. **The first is one I owe the ledger rather than the reviewer:** I deferred
Task 17's unreddenable `expect(player.seat).toBe(5)` explicitly on the grounds that *this* task's
advisory property test is §18's real witness, because it asserts the whole seat array against
`0..n-1` over generated event streams. So the reviewer is asked to test that claim — if no event
the fuzz can emit could ever perturb `seat`, then §18's seat immutability has **no witness
anywhere in the plan** and my deferral was wrong, not merely generous. I asked it to apply the
same interrogation to every other clause of `invariants()`: which could the generated actions
actually break, and which hold by construction. Also asked whether the 1.3% duplicate-vote rate
is enough for that invariant to mean anything, whether R22's stChoice test — the **only** test in
the plan touching that guard — genuinely finds a null-headed registration tuple and now *fails*
rather than silently passing when its precondition is unmet, and to adjudicate the implementer's
own honest disclosure that the scripted game covers **vote executions only** while the plan's
text for this task claims "two kinds of execution".
Task 18: review (opus) — spec ✅, quality **Needs fixes**: zero Critical, 2 Important, several
Minor. The strongest review of the plan, and the only one to correct a **controller** ruling.
Both Importants are **plan-mandated**, transcribed verbatim from the brief — so the implementer's
"no eighth defect was found" is wrong, and the two it missed are the two that matter most.
Cleared first, and earned rather than granted: it traced all nine seats through four nights and
four days and confirmed the scripted arc witnesses what its comments claim. Day 3 has 6 alive
(p2 day 1, p4 night 2, p6 night 3), threshold 3, four votes execute p1, `aliveCountAtDeath` = 6
>= 5, p3 is a functional Scarlet Woman, and she is promoted **inside `closeDay`'s transaction**
so §4.7 row 1 finds the successor — and the pair `p3.characterId === 'imp'` + `victory ===
ongoing` is a real witness because a failed promotion reddens **both** and additionally makes
`beginNight` throw. Row 3 is not masking at 5 alive. Night 4's notification fires off
`demonSince = {day,3}` and `!demonNotified` across a day boundary and would redden if `wakes`
were "promoted this night". Day 4 has row 1 beating row 4 with `todaysExecutions` non-empty.
R22's stChoice test genuinely reaches the guard (`couldRegisterAs(view,'minion')` returns the
Recluse with one ruling, `oneOfTwo` nulls `shownCharacterId` for a ruled answer, so
`value[0] === null` fires nightCommands.ts:279), the brief's `if (!ruled) return;` is gone and
replaced by a **loud throw**, and it is confirmed the only cover of that branch anywhere.
R17's Empath is genuinely poisoned when `resolveAnswer` evaluates its gate, and
`sourcePlayerId: null` was checked safe at all four downstream consumers. R24's swap gives
good/evil (1) -> good/good (0) as ruled. `reduce(events.slice(0, seq))` is the right boundary and
`seq` stays the array index because undo renumbers.

**And it found something better than a finding: R18's own assertion is insensitive to the
mutation its comment is about.** Flipping `isStatusActive`'s `<=` to `<` does **not** redden
R18's predicate pair — the Mayor-poison pair is what catches that. So my R18 prescription is
correct as an assertion but overclaimed as a witness for §4.4's inclusive boundary. Recording
the correction; no code change, because the boundary genuinely is witnessed, two tests over.

**Correction to my own Task 17 deferral, which was wrong on its stated grounds.** I deferred
Task 17's unreddenable `expect(player.seat).toBe(5)` saying §18's seat invariant "has a far
stronger guard arriving in Task 18's advisory property test". It does not. `seat` is written in
exactly **one** place — applyEvent.ts:221's `GAME_CREATED` — and no event the fuzz can emit
perturbs it; there is no `RESEAT`, add or remove event in the catalogue at all. So the property
test's seat clause is reddenable only by a reducer mutation that rewrites `seat` in one of the
`mapPlayer` paths, which is **exactly the same strength** as Task 17's assertion: the fuzz
contributes nothing and the seed's `GAME_CREATED` does all the work. The honest statement is that
**§18 is enforced by the absence of a write path — which is stronger than any test — but nothing
in the plan would redden if a reseat path were added.** That is a real gap in the plan's
defences, and it is the removal-over-enumeration shape: the guarantee lives in what the event
catalogue does not contain. I am not manufacturing a test for it (asserting the absence of an
event type is the barrel-absence pattern, but the seat write is a reducer line rather than an
export, so there is nothing clean to assert); I am folding in a comment at both sites so neither
assertion reads as proof of something it cannot provide, and surfacing it to the final review.
Cost if wrong: §18's immutability rests on nobody adding a reseat path without noticing. Against
two assertions that currently imply it is tested when it is not.

**Task 18 Ruling: Important 1 (`play()`'s blanket `catch {}` makes §4.8's headline claim
untestable) — FIX, and it is the most consequential finding of the round.** The brief's own
justification for the catch is false: the `advance` branch computes `next` from `state.phase` and
therefore always moves **forward**, so `PHASE_ADVANCED` can never go backwards there, and no
reducer case reachable from those six payloads throws. So the catch never fires today — its only
live effect is to convert a **future** throw into a green pass. And that is not hypothetical:
the reviewer showed that loosening `applyDeath`'s already-dead guard to **throw** instead of
`return state` leaves all three properties green. §4.8's headline is "the app never **blocks** a
rule break", and this is the plan's designated §4.8 test — a test that cannot distinguish
"recorded, no derived change" from "refused" is not testing §4.8's headline at all.
Fix: of the reviewer's two options I take the second — **count the swallowed errors and assert
the count is zero** — rather than removing the catch. Removing it makes an unexpected throw a
stack trace; counting it makes it a *named failure of the invariant §4.8 states*, and it keeps
working if some future action kind legitimately throws. The counter **is** the assertion, and it
must be commented as such, because a reader who sees a try/catch in a property test will
otherwise assume it is defensive.
Cost if wrong: one counter and one assertion. Against the plan's §4.8 test being unable to see
the app blocking a rule break, which is the one thing §4.8 forbids.

**Task 18 Ruling: Important 2 (the `perceivedCharacterId` assertion cannot fail for the reason it
names) — FIX.** The test asserts `perceivedCharacterId: 'empath'` on the **empath** step, where
the step id and the character id are the same string — so it is green under the exact mutation
its own comment forbids. And the bug it cites is specific: an earlier draft used
`position.step.id`, which is a valid character id for 13 of the 14 per-actor steps and **wrong
for `scarlet_woman_notify`**. That is the one step where the two differ, and this is the **only**
assertion anywhere in the tree on that emitted field — nothing asserts the cursor's
`actorPerceivedCharacterId` either. So §4.1's per-actor stamping has, in effect, no witness.
This is the same class as Task 16's recorded documentation drift, where the brief's prose
described the draft's `position.step.id` while the code correctly used
`actorPerceivedCharacterId`; the code was right and the guard was never tested.
Fix: assert `perceivedCharacterId: 'imp'` at a `scarlet_woman_notify` resolution — the promoted
Scarlet Woman's true and perceived character is `imp` while the step id is
`scarlet_woman_notify`, so the mutation reddens. The fixture already exists: the mid-night
promotion test in `fullGame.test.ts` resolves that step. Keep the Empath assertion as a positive
case but correct its comment so it stops claiming to guard the step-id bug.
Cost if wrong: one assertion in a fixture that already walks to the step. There is no downside.

Folded into the same round, all cheap and all in this task's own files: **(a)** comments at the
two tautological `invariants()` clauses and at the seat clause — `aliveCount >= 0` and
`<= players.length` are pure tautologies over `players.filter(alive).length`, and §4.8's literal
"aliveCount negative" clause is **unwitnessable by design** because `aliveCount` is a derived
filter and `GameState` has no such counter, which is worth saying out loud rather than leaving as
two assertions that read like coverage; **(b)** an assertion that the committed `RULE_FLAGGED`
count equals the committed `DEATH` + `NOMINATION_OPENED` count, because today all three
`tx.flag(...)` calls are **inert** — delete them and everything stays green — and §4.8's
invariant is about "no sequence of **flagged** events", so without this the fuzz is exercising
events that are not actually flagged, and it also pins that the reducer records flags at all;
**(c)** `expect(() => beginNight(store)).toThrow(/game is over/i)` beside the day-4
`expect(nextStep(...)).toBeNull()`, because at day 4 the phase is **day** and `nextStep` returns
null on the phase check alone, so the existing assertion cannot witness §4.7's "the night cannot
continue past the end of the game" — the `beginNight` guard is what actually does;
**(d)** a second `answersAtSeq` case taken at the **DEATH** event's seq, since mutating
`slice(0, seq)` to `slice(0, seq + 1)` does **not** redden the current test (a
`NIGHT_STEP_RESOLVED` does not move the Empath's answer) and §3.6's "before, not including"
boundary is therefore untested; **(e)** the protection claim — the Monk protects p9 on nights 2
and 3 while the Imp targets p4, p6 and p7, so **protection is never exercised**, deleting the
Monk's `STATUS_APPLIED` leaves the file green, and yet the brief's prose and the report both
claim "poison and protection lifetimes"; the implementer must first check whether a
**command-level** Monk-protected kill is already covered by Task 16 and, if it is, correct the
claim only, and if it is not, add one additive test rather than re-targeting a scripted kill (the
main arc's alive counts are load-bearing and must not move); **(f)** the vote-uniqueness clause
firing in only ~1.3% of traces, so roughly one CI run in two hundred generates none and the
clause is silently vacuous that run — verify the deterministic witness Task 14's pre-dispatch
scan recorded (`VOTE_CAST` already refuses a duplicate on the same nomination) and cite it in a
comment rather than perturbing the generator, which would change what the fuzz explores.
Task 18: minor (deferred): `answersAtSeq`'s `if (!resolver) return []` makes a typo'd `stepId`
indistinguishable from a legitimately answer-less step (the Poisoner, Monk, Butler and Spy all
correctly return `[]`). A `STEP_IDS` membership check would separate them and would match the
malformed-input line this plan has drawn four times. Not folded in: Plan 2's log-expansion UI is
the only caller and it passes a `stepId` off a real event, so the typo is not reachable through
the intended path, and the fix costs an import that couples the replay selector to the frozen
step list. For the final review, which sees Plan 2's seam.
Task 18: minor (deferred): `expect(ruleFlags).toEqual([])` in the st_override test cannot be
reddened by deletion, because nothing raises a flag on an `answerClass` today. Kept as a forward
guard for §4.3's "never warned", which is a real requirement with no other expression.
Task 18: minor (deferred): `expect(night2).not.toContain('poisoner')` is near-tautological — the
roster has no Poisoner and `nextStep` skips zero-actor steps. Harmless, and its misleading
comment ("they are dead") was already corrected under R23.
Task 18: fix round 1/5 — resuming the original implementer (context intact), FIX_BASE 7379b6d.
Task 18: fix round 1/5 — implementer DONE, commit d6bafe9. 501/501 (500 -> 501), typecheck and
lint clean, working tree clean. Four files touched, all its own.
Both Importants have the mutation transcript I required, and FIX 1's is the sharpest evidence of
the round because it shows the **contrast** rather than a red test: with `applyDeath`'s guard
loosened to throw, all three properties passed silently **before** the fix and all three fail
**after** it, each on the new `swallowedErrors` assertion — so the counter demonstrably closes
the exact hole the finding named. FIX 2's received value is `perceivedCharacterId:
'scarlet_woman_notify'`, which is the step-id bug caught in the act, and it confirmed the Empath
assertion **stays green** under the same mutation, proving it never could have caught it.
Two of the folded minors were handled better than instructed and are worth recording:
- **(e)** it checked Task 16 first as directed, found `'records a blocked kill with no death'`
  already covering a command-level Monk-blocked kill, and **corrected the claim rather than
  adding a duplicate test** — including correcting its own report's earlier "poison and
  protection lifetimes" overclaim, and explaining in the test file why no scripted kill was
  retargeted to manufacture the coverage (it would break the alive-count arithmetic every later
  execution threshold depends on).
- **(f)** it found the deterministic vote-uniqueness witness in `nominations.test.ts` rather than
  perturbing the generator, and cited it beside the clause.
It also **retracted its own "no eighth defect was found" claim in the report body**, in as many
words, and diagnosed why it missed both: it stress-tested the code it composed and not the code
it transcribed. That is the right lesson and it is now written where the final review will read
it.
Scoped re-review dispatched (sonnet) over 7379b6d..d6bafe9 with seven named checks. The first is
the one way this round could be **worse than the hole it closed**: `expect(play(...)).toBe(0)`
now turns any swallowed throw into a failure across roughly 950 generated traces per run, so if a
legitimate throw is reachable even rarely the suite becomes intermittently red — which is worse
than the silent hole it replaced. I asked for the enumeration rather than a conclusion: every
reducer throw site reachable from the six payloads, the store's re-entrancy and thenable guards,
`checkVictory`'s null-reason throw, `highestTxNumber`'s unparseable-txId throw, anything
reachable at **commit** time rather than in the body, and specifically whether the `advance`
action stays monotonic under every interleaving including after a `GAME_ENDED`. Also asked
whether `flagInvariant` can flake (a staged-nothing `vote` transaction, a `DEATH` for an
already-dead player that still appends its event, a commit-time `GAME_ENDED`, and the undo loop
where it runs after every undo), and — because this plan has had a controller citation that a
re-reviewer had to check — to **open both cited files and confirm the (e) and (f) citations are
real and assert what is claimed**, since a fabricated citation closes a finding while leaving it
open.
Task 18: fix round 1/5 re-review — **both Importants and all six folded minors ADDRESSED, no new
Critical/Important breakage.** Every check was verified against source rather than the pasted
transcripts, and the one that could have made this round worse than the hole it closed came back
clean with the enumeration I asked for rather than a conclusion.
**`expect(play(...)).toBe(0)` cannot flake.** The re-reviewer walked every reachable throw site
for the six action kinds and reported each: the `applyDeath`, `ROLE_CHANGED`, `NOMINATION_OPENED`
and `VOTE_CAST` reducer cases all **no-op rather than throw**; `PHASE_ADVANCED`'s backward guard
is unreachable because `play()`'s `advance` branch computes its target from the current phase and
`phaseOrdinal` makes that strictly monotonic in both directions; `checkVictory`'s null-reason
throw is unreachable because all four `VICTORY_PREDICATES` carry fixed non-null reasons;
`highestTxNumber` runs once at `createStore([])` and never mid-play; and the re-entrancy and
thenable guards cannot fire on a synchronous body that never opens a transaction of its own. So
the new assertion is a pure regression detector across ~950 traces per run, not an intermittently
red gate — which was the one way FIX 1 could have been a bad trade.
`flagInvariant` was cleared the same way: a `vote` with no prior nomination stages nothing and
appends nothing, a `DEATH` for an already-dead player still appends its event and its paired flag
in the same transaction, `GAME_ENDED` does not touch any of the three counts, and undo removes a
whole `txId` at once so a DEATH/flag pair can never split.
**Both citations I told it to distrust are real**, checked by opening the files: Task 16's
`'records a blocked kill with no death'` genuinely resolves a Monk protection and then
`resolveImpStep` against that same target, asserting `finalVictimId: null`, a `monk_protected`
chain and the target still alive; and `nominations.test.ts`'s duplicate-vote test genuinely
pushes a second `VOTE_CAST` for the same voter and asserts the tally is unchanged, exercising the
reducer's dedup guard deterministically. So (e) and (f) are closed by real coverage rather than
papered over.
FIX 2's helper signature change was confirmed behaviour-preserving at all five other call sites,
and `events[0]` confirmed to be the `NIGHT_STEP_RESOLVED` (it is the first `tx.emit` in
`resolveStep`'s body) sourced from `position.actorPerceivedCharacterId`, which is p3's
post-promotion identity. (d)'s direction was verified as the pre-death answer, and both
pre-existing `replay.test.ts` cases confirmed **insensitive** to the same off-by-one — which is
the contrast that makes the new case worth having. 500 -> 501 reconciles as exactly one net new
`it` plus a rename, with **zero removed `expect(...)` lines** anywhere in the four files.
Task 18: minor (deferred): the fix round's own `play()` docstring still illustrates the swallowed
-error case with "a backwards `PHASE_ADVANCED` throws", which this generator can never reach —
the same misleading-comment class this plan has cut four times. One sentence; not worth a second
round, and the assertion it accompanies is sound.
Task 18: complete (commits b14052c..d6bafe9, review clean after 1 fix round)

=== ALL 18 TASKS COMPLETE. 501 tests, 39 commits, nothing pushed. Final whole-branch review next. ===

=== FINAL WHOLE-BRANCH REVIEW (opus, re-dispatched after the session reset) ===
Verdict: **With fixes.** 0 Critical, 5 Important, 7 Minor. Deferred-minor triage: 0 must-fix,
17 should-fix, 28 leave — all 45 accounted for. Ruling audit: 2 it would change, 1 flagged as the
weakest instance of a sound line, 1 recorded reasoning corrected. It ran ~50 single-line mutations
against production guards on a `git archive` copy (repo untouched); **43 caught**, including every
guard in §4.5's kill chain, all four §4.7 rows clause by clause, §4.4's inclusive comparison, the
Scarlet Woman threshold, both `onDemonDeath` preconditions, `threshold` ceil, `voteOrder`
orientation both ways, and the Baron draw order. Every finding it could not have got from reading
came from the **guards → tests** direction — the exact sweep Task 15's ruling introduced.

**Final Ruling F1: the fix wave carries the five Importants, the demon-death extraction, and the
`closeDay`/`advanceToDay` decided-game guard. Nothing else.** The 17 should-fix minors do not enter
it. Reasons: the reviewer's own triage puts **zero** items in must-fix, so by the judgment of the
only agent that has seen the whole tree at once, none of them blocks merge; the skill's single-wave
rule exists because per-finding churn on a green branch is where regressions land; and every one of
the 17 is cheaper to do at the head of Plan 2, with the file already open, than in a wave whose
purpose is closing holes Plans 2 and 3 can walk into. The three I am pulling *in* are the ones that
fail that test — each is a hole a later plan reaches.
Cost if wrong: seventeen small improvements land at the start of Plan 2 instead of the end of
Plan 1. They are listed in the reviewer's own priority order in final-review.md and in the register.

**Final Ruling F2: deferred minor 33 + Minor 6 (the decided-game guard on `closeDay` and
`advanceToDay`) is R5's debt and is paid now, not deferred.** The reviewer's sharpest structural
observation: **R5's `closeDay`/`beginNight` split is what makes a stray second `closeDay` reachable
at all**, because nothing records that the day closed. I ruled the split; I own its dependent. Today
the only thing making a re-entrant `closeDay` harmless is `resolveDayExecution`'s `nomineeAlive`
filter — which is therefore load-bearing for more than its documented purpose, precisely the shape
that regresses silently. `beginNight` already sets the precedent one function below.
Cost if wrong: two commands refuse on a game that is already decided, where they previously ran and
did nothing observable. `beginNight` has thrown on this since Task 16 and nothing has wanted the
other behaviour.

**Final Ruling F3: Important 2 (the Undertaker's missing registration answers) is IN the wave,
against the reviewer's own sequencing.** It listed it under "then the remaining should-fixes"
rather than "before merge". I am pulling it forward because it is not a coverage gap, it is the
same defect class as Task 8's Librarian finding — **the honest answer is absent from the answer
set, so the Storyteller can only reach it through `st_override`**, which §4.3/§9 deliberately
exclude from the registration ledger. An executed Recluse shown as a Minion is one of the two most
common rulings in the edition. Shipping it means the app cannot stay consistent about the Recluse
across the one step where consistency is most visible, and §16.6's contradiction check — which I
spent a cross-task authorisation on in Task 16 — cannot see the ruling at all.
Cost if wrong: ~15 lines mirroring `ravenkeeperAnswers`, on the resolver file with the strongest
test coverage in the tree. The `stChoice` guard it needs already exists and is already witnessed.

**Final Ruling F4: `claimSlayer`'s night throw STANDS for now, and goes to Rithwik as an open
question rather than a fix.** The reviewer pushed back on it as the weakest of the six "malformed
input throws" sites and it is right that a Slayer claim **is** a public table event — the one
ability players announce out loud — and that the throw makes `evaluateSlayer`'s own night branch
dead code that reads as live. But its own verdict is "defensible, and I would not block on it", and
its proposed cleaner shape (record `SLAYER_CLAIMED { outcome: 'nothing' }` with a flag, and gate the
reducer's `slayerUsed` on the outcome) is a **reducer** change to the once-per-game accounting, in
the final wave, with no task-level review behind it. That is the wrong trade at this point in the
branch: the current behaviour refuses and says why, which is recoverable at the table; the
alternative risks the silent shot-burning the original ruling exists to prevent.
Cost if wrong: a Storyteller who forgets to advance the phase and then hears a Slayer claim must
advance the phase before recording it. Nothing is lost; the claim is recorded a moment later. If
Rithwik prefers the reviewer's shape, it is a small, well-specified change at the head of Plan 2.

**Final Ruling F5: §6.2's `showCard` is NOT fixed here — it goes to Rithwik as a spec amendment.**
The reviewer confirmed against the guide that the Demon's first-night step shows **two** cards
("These are your minions" and "These characters are not in play" with the three bluffs), while
§6.2's `showCard` is singular and `'not_in_play'` is a declared variant no step uses. This is a
**spec** self-inconsistency, and it is the item on the whole list with the largest blast radius,
because a Plan 2 UI generated off `showCard` renders one card and silently omits the bluffs — the
Demon's entire first-night information. It is Rithwik's call on his own spec, not mine to make
unilaterally in a fix wave, and the comment at the point of use holds until Plan 2 opens.
Cost if wrong: the amendment lands at the start of Plan 2 instead of now. The engine's night-order
data is a two-line change either way; the cost only multiplies once a UI reads the field.

**Final Ruling F6: the seat question is answered by testing the ring, not immutability.** The
reviewer separated two claims the two assertions had been conflating, and it is right. §18's
*immutability* is enforced by the absence of a write path, which is stronger than any test — that
half of my correction stands. But the second claim — **that `seat`, not array position, defines the
ring** — is live, testable, and currently untested anywhere, and §8.2 names exactly that as the
failure "no unit test can ever reach". `bySeat`'s sort is a suite-green deletion. So the wave adds
one out-of-order `GAME_CREATED` test, which closes Important 4b, deferred minors 14 and 39, and the
§18 question at once, and both assertions' comments are corrected to say which claim they stand for.
Cost if wrong: one test and two comments. It is the highest-value single test the reviewer found.

Fix wave dispatched (opus, fresh implementer — no prior implementer is live after the reset).
FIX_BASE d6bafe9. Seven items in one dispatch, per the single-wave rule.

=== SECOND FINAL WHOLE-BRANCH REVIEW ARRIVED — the pre-reset agent was not lost ===
Both reviews completed. The handoff warned one might be in flight; `final-review.md` did not exist
when I checked at session start, so I re-dispatched. Review **A** (pre-reset) then landed and wrote
its 225-line report; review **B** (mine) landed later and **overwrote the file**. `final-review.md`
now holds B. A's summary is preserved at `final-review-A-summary.md` — its full report is lost, and
that is my error: I should have copied the file the moment A's result arrived, before B could finish.
Cost: A's file:line detail for four findings survives only as its returned summary, which is enough
to act on because the wave was already dispatched from it.

**Final Ruling F7: C1 is real, it is Critical, and Final Ruling F2 does NOT close it.** Review B
found that a second `closeDay` **on the same day** executes the **runner-up nomination**. I verified
the mechanism myself at `dayCommands.ts:118-176` rather than taking it: `closeDay` guards only
`phase.kind !== 'day'`, and `resolveDayExecution(state)` recomputes from the day's nominations on
every call — so once the top nominee is dead, `nomineeAlive` filters them out and the runner-up wins
the recomputation. A second `EXECUTION` and `DEATH` from one day's votes; a phantom `todaysExecutions`
entry the Undertaker reads that night; §4.7 row 4 suppressed; and on a **Saint** runner-up, row 2
fires and hands evil the game. `DAY_CLOSED` is a reducer no-op, so Plan 2 cannot detect the state.
**Review A read this same re-entrancy as a should-fix minor**, on the stated reasoning that it is
"harmless because `nomineeAlive` filters the dead nominee". That reasoning is wrong — the filter
removes only the player who already died — and F2's `victory.status !== 'ongoing'` guard, which I
took from A, does not fire here because the game is still ongoing. F2 stays (it is right about
`advanceToDay` and about a decided game); C1 needs a same-day re-close guard on top of it, and the
fix wave was extended in flight rather than opening a second wave.
Cost if wrong: `closeDay` refuses a second call within one day, and Plan 2 gains the `DAY_CLOSED`
signal it currently has no way to read. Against two executions from one day's votes and a wrong
winner on a Saint.

**Final Ruling F8: I extended the running wave by message rather than opening a second one.** The
skill allows exactly one fix wave and one scoped re-review. The wave was mid-flight and its
implementer's context was intact, so B's six additional items (C1, I3, I5, I6, I7, must-fix minor
#4, plus the F1 comment correction and two housekeeping items) went to the same agent. One wave,
one re-review, one diff range — which also keeps `FIX_BASE..HEAD` coherent for the re-review.
Cost if wrong: a larger single fix diff than planned, reviewed in one pass instead of two.

**Final Ruling F9: review B's I5 is accepted, and it is the structural guard R5 always owed.**
`victory.ts` carries a comment saying row 2's phase scoping "is safe ONLY because no command
advances the phase in the victory-checking transaction". That is the load-bearing premise of the
single biggest ruling on this branch, and **only a comment holds it**. Making it a real assertion in
the store's commit path converts R5's premise from documentation into enforcement. Note the pattern:
this is the third time on this branch that the right fix was to turn a comment into a mechanism
(T12·4's precondition, T16·2's compile error, now this).
Cost if wrong: a store-level assertion that must be verified not to fire on `beginNight` or
`advanceToDay`, which advance the phase in their own transactions.

**Final Ruling F10: B's I6 supersedes the comment-only half of F6, and both halves now stand.** F6
said §18's immutability is enforced by the absence of a write path and needs no test. B agrees — and
then points out the gap that leaves: **"no reseat/add/remove event exists in the catalogue" is
itself unwitnessed**, so nothing reddens if someone adds one. A frozen-list snapshot of the event
catalogue is the witness, and it is the removal-over-enumeration shape done properly: assert what
the catalogue does *not* contain by pinning exactly what it does. F6's out-of-order seat test still
stands — it covers the *other* claim (that `seat`, not array position, defines the ring).
Cost if wrong: one snapshot test that must be updated deliberately whenever an event type is added,
which is the point.

**THE LESSON WORTH KEEPING, and it is about process rather than code.** Two opus whole-branch
reviews, same tree, same instructions, ran by accident. They produced **overlapping but
non-identical** finding sets, and **each found real defects the other missed — including the only
Critical on the branch**. A found the Drunk-belief hole, the Undertaker gap and two suite-green
guard deletions that B missed entirely; B found the runner-up execution that A explicitly reasoned
was harmless. Neither was careless: both mutation-tested, both traced consequences to the table.
**A single final review is a sample, not a verdict.** The duplication was worth more than either
review alone, and on a branch where the dominant defect shape is "a guard that cannot fail", the
second reader is not redundancy — it is the only thing that catches a *reviewer's* reasoning error.

=== FIX WAVE COMPLETE — commits d01bc9f, 3e7de1b, 573cb33, 9dc06ec (FIX_BASE d6bafe9, HEAD 9dc06ec) ===
DONE_WITH_CONCERNS. All seven original items plus all seven extended items done with red/green
mutation evidence. Report at `fix-wave-report.md`. Scoped re-review dispatched (opus) over
review-d6bafe9..9dc06ec.diff with the three overrides below named as explicit checks.

**Final Ruling F11: the implementer was RIGHT to reject prescription 4a, and review A misdiagnosed
it. I verified this myself rather than accepting either side.** Review A found `if (!player.alive)`
in `restrictedButlerMaster` deletable with 501 green and read it as a correct-but-unwitnessed guard
needing a test. It is neither correct-but-unwitnessed nor dead — it was **redundant**. The Butler is
declared `character('butler', 'Butler', 'outsider', …)` with **no overrides object**, and the factory
at characters.ts:72 reads `requiresAlive: overrides.requiresAlive ?? true` — so the Butler requires
being alive, and `abilityFunctional` already returns false for a dead one on the very next line. No
test could **ever** redden the deletion, which is precisely why the mutation survived. Deleting the
redundant line and adding the ghost-vote test is strictly better: it makes §4.2's dead-Butler
exemption **witnessable for the first time**, because deleting the surviving line now reddens.
This is worth recording as a category error the whole branch has been vulnerable to: **a surviving
mutation means "no test distinguishes this line", which is ambiguous between an unwitnessed guard
and a redundant one — and the two want opposite fixes.** Review A's guards→tests sweep, which is the
technique that found nearly everything of value on this branch, cannot tell them apart on its own.
Cost if wrong: a line is gone that was doing nothing, and the behaviour it appeared to provide is
now pinned by a test that can actually fail. If the redundancy analysis is wrong, a dead Butler's
ghost vote gets flagged — and the new test reddens, which is the point of adding it.

**Final Ruling F12: `onVictoryCheck` DELETED, against both whole-branch reviews. Verified myself.**
Both reviews said keep it (one proposed renaming it `__onVictoryCheck`) on the stated grounds that
it is §4.7's only "exactly once per transaction" witness. I grepped the tree: **zero references**
outside a comment. `store.test.ts:277` spies on the real `checkVictory` module function, which is
what actually counts invocations. And the implementer's argument is the decisive one: a hook sitting
at the **single commit call site** fires once **by construction**, so it would have counted the same
whether `checkVictory` ran once or moved into `append` and ran per event — it could not have
witnessed the property at all. Both reviews reasoned about the hook's *description* rather than
checking whether the test used it. Renaming would have preserved dead production surface under a
false justification.
Cost if wrong: three lines to restore, and the test that supposedly needed it does not reference it.

**Final Ruling F13: the ESLint-test timeout fix is accepted as a timing fix.** The first case in
`test/eslint-perceived-character.test.ts` paid ESLint's bootstrap inside a 5s per-test timeout and
took 11.7s. Reproducible at d6bafe9, unrelated to the wave. Moved to `beforeAll`. Named to the
re-reviewer as a check, because "moved the slow part out of the timeout" and "loosened an assertion
to go green" look identical in a summary and only the diff distinguishes them.
Cost if wrong: a flaky boundary test on the §4.1 rule, which is the one rule this project cannot
afford to have silently not running.

**Left undone and NOT in the wave** (none Critical, all recorded): the remaining should-fix deferred
minors, and review B's M4-M7. The implementer flags **M5** as the one it would prioritise — several
reducer cases run only under the unarmed `app` vitest project, so the purity guarantee is narrower
than it reads. That is a Plan 2 opening item, not a merge blocker, but it is the one on the leftover
list that weakens a **stated** guarantee rather than adding coverage. Surfaced to Rithwik.

=== SCOPED RE-REVIEW OF THE FIX WAVE (opus, d6bafe9..9dc06ec) — CLEAN ===
**All 14 findings ADDRESSED, no new Critical/Important breakage.** The re-reviewer verdicted every
finding against a mutation **it ran itself** in a throwaway copy rather than against the report's
pasted transcripts — which is the right treatment for an implementer's evidence and is what I asked
for. Highlights worth keeping:
- **C1's red evidence is the real thing**: deleting the guard reddens `dayCommands.test.ts:404` with
  `expected false to be true` on **p6.alive** — an actual runner-up execution, not merely a missing
  throw. §3.5 identity confirmed by `toBe` (not `toEqual`), and the reducer change confirmed to run
  under the **armed** `reducer-purity` project.
- **I5 cannot fire on a legitimate flow**: it enumerated all three production `PHASE_ADVANCED`
  emitters and confirmed each stages that event alone. Only ONE pre-existing fixture was affected and
  its split preserves every assertion verbatim.
- **I6 verified in both directions**: adding a `PLAYER_RESEATED` type is a compile error, and adding
  it to the snapshot too reddens both assertions. That is the §18 witness working as designed.
- **All three overrides upheld**, each checked independently. On `onVictoryCheck` it did the decisive
  experiment I could not: moving `checkVictory` into `append` (per-event) **reddens** the spy test,
  while the deleted hook would have counted 1 under that same mutation. Production surface removed,
  coverage strictly not.
- 501 -> 538 reconciled as **strictly additive**: the only removed lines in any test file are five
  imports and one renamed transaction label. No test deleted, no assertion loosened.
Verified by me independently at HEAD: 538 passed / 34 files, typecheck clean, lint clean, tree clean,
42 commits ahead of origin/main, nothing pushed.

**Final Ruling F14: the one residual Minor is PARKED, not fixed. There is no second fix wave.**
`store.ts:15` — `DEMON_DIED`'s membership in `PHASE_INCOMPATIBLE_EVENT_TYPES` is unwitnessed:
removing that one line leaves all 538 green, because the `it.each` at `store.test.ts:342`
parameterises only `DEATH`, `EXECUTION` and `ROLE_CHANGED`. The set member is **correct**; it is
merely untested. One more `it.each` row closes it.
Parked rather than fixed for two reasons. The process allows exactly one fix wave and one scoped
re-review, and a controller who fixes findings himself skips review — the rule exists precisely
because an unreviewed "one-line fix" is how regressions land, and I am not exempt from it at the end
of the branch. And the finding is Minor by its own reviewer's grading: the guarantee is present and
correct, only its witness is missing.
**But record what it is, because it is the branch's own lesson biting the branch one last time.**
The fix wave that closed five unwitnessed guards **introduced a sixth**, in the very assertion added
to enforce R5's premise (F9). Nobody was careless; the shape is simply that easy to produce. It goes
to the top of Plan 2's opening list, not into a wave.
Cost if wrong: one set member is correct but unpinned, so a future edit that drops `DEMON_DIED` from
the list would not redden. That would let a command compose a demon death with a phase advance in one
transaction — which no command does, and which the surrounding three members still pin the mechanism
for.

=== PLAN 1 COMPLETE. 18 tasks, 42 commits, 538 tests, 2 whole-branch reviews, 1 fix wave, 1 clean
    re-review. Nothing pushed. Rulings register is the last deliverable. ===
