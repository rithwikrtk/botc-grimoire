# Blood on the Clocktower — Storyteller App
## Design Document

Date: 2026-09-07
Status: draft v3.1 — five-lens review folded in, then self-reviewed
Edition scope: **Trouble Brewing only**

> v1 and v2 are kept as `.v1.md.bak` / `.v2.md.bak`. Change log: §17.

---

## 1. Problem

Running Trouble Brewing as Storyteller means holding a large amount of hidden,
mutable state in your head while performing for a table: who is which character,
who is poisoned or protected *right now*, what you told whom and whether it was
true, who nominated, who voted, who spent a dead vote, and which lies you are
maintaining. A physical Grimoire and a printed night sheet cover part of this and
leave you doing arithmetic live, under social pressure, with no record of what was
said.

This app is a **single-user private tool for the Storyteller**, used on a phone or
laptop during an in-person game. It is not a game client for players. The one
exception is Spy Mode (§10).

**It assists; it is not an oracle.** Every computed number shows its derivation
(§8.2) and every answer can be overridden without the log calling you a liar
(§4.3). A printed night-order sheet on the table remains recommended — the guide
says so twice, and it is the one fallback that survives a dead battery.

## 2. Confirmed requirements

| Decision | Choice |
|---|---|
| Spy grimoire delivery | Same device. Hand it over, take it back (§10.3). |
| Information | App enumerates *legal* answers and shows its working; you choose; fabrication and override are separate labelled classes (§4.3). |
| Platform | Static client-side app (React + Vite), `localStorage`, **installable and offline-capable** (§12). No backend, no accounts. |
| Role assignment | Randomize a legal set, then edit before locking in. |
| Day phase | Full nomination and vote tracking, including threshold math. In Slice 1. |
| Rule enforcement | **Advisory.** The app warns and records; it never blocks and never silently alters a tally (§4.8). |
| Event log | Automatic, timestamped, interleaved with typed notes. |
| Editions | Trouble Brewing is built. Edition *data* is isolated; the engine is not claimed to be edition-agnostic (§3.8). |
| Responsive | Phone-first, one column. Desktop is the same layout with a max-width. |

---

## 3. Architecture

`state = events.reduce(applyEvent, initialState)`

### 3.1 Why

1. **The log is a hard product requirement** and must never drift from state. The
   guarantee actually comes from having exactly *one write path*; event sourcing is
   the cheapest way to make that structural.
2. Transactional undo (§3.4).

v2 also claimed edit-and-replay as a justification. **That was wrong and it has been
deleted** — see §3.4.

### 3.2 Event envelope

`{ seq, txId, ts, type, payload }`

- `txId` — **one Storyteller action = one transaction**, however many events it
  emits. Resolving the Monk step emits `NIGHT_STEP_RESOLVED` + `STATUS_APPLIED`; an
  execution emits four or more. Undo drops every event sharing the last `txId`.
- `ts` — stamped by the command layer, never inside `applyEvent`. Every event.
- `seq` is the array index. There is no separate `id`, and no `night`/`day` on the
  envelope — both are derivable from the last `PHASE_ADVANCED`.
- `schemaVersion` **and `appVersion`/`buildHash`** are stored once on the persisted
  blob (§12.4).

### 3.3 Purity rule

**The reducer is pure.** No `Math.random()`, no `Date.now()`, no `new Date()`, no
`performance.now()`, no `crypto.*` inside `applyEvent`. All randomness and every
Storyteller choice is resolved before the event is created and stored as literal
data on it.

Choices that must be event data: role deal, demon bluffs, Drunk's believed
character, red herring, information candidate selection, Mayor bounce target,
starpass successor, registration rulings, the Undertaker's pick when two players
were executed.

Two enforcement mechanisms, both cheap:

1. **A Vitest project scoped to `src/reducer/**`** whose setup file stubs
   `Math.random`, `Date`, `performance` and `crypto` to throw. Scoped, not global —
   a global stub breaks fake timers, `waitFor`, and any library that formats a date.
2. **Property test:** `reduce(events)` twice, and after a JSON round-trip,
   deep-equal (not byte-equal — `undefined` fields and `Set`s do not survive JSON).

v2 also specified a seeded PRNG "so that replay stays deterministic even if purity
breaks". **Deleted.** Under this design the reducer never draws, so the seed is
never consumed during replay and defends against nothing.

### 3.4 Correction model

| Situation | Mechanic | Log shows |
|---|---|---|
| Mistap, never happened at the table | **Undo** — drop every event sharing the last `txId` | nothing |
| Wrong, and it already happened | **Compensating event** — `ROLE_CHANGED { reason:'st_correction' }`, `STATUS_CLEARED`, a corrective `DEATH`, or a `NOTE_ADDED` | both the original and the correction |

**Edit-and-replay and `EVENT_CORRECTED` are deleted.** They were unsound: §3.3
freezes derived outcomes onto events, so re-reducing after an edit leaves a stale
`chosenAnswer` labelled `canonical`, and a `NIGHT_KILL_RESOLVED { outcome:
'monk_protected' }` that the new state contradicts. Making it sound requires a
downstream revalidation pass costing more than the whole rest of the model. The
narrow case it served — "wrong value several steps back, nothing said aloud yet" —
is covered by undo plus a note.

`SPY_VIEWED` / `SPY_VIEW_ENDED` are non-undoable: they are an audit trail.

### 3.5 Performance

Corrected from v2, which under-counted by ignoring votes. A 10-player 5-day game is
**700–1,000 events** (voting dominates: one `VOTE_CAST` per voter per nomination);
a pathological 15-player game approaches **3,000**. Still trivial — but the reduce
runs once per tap, not per frame, and on a mid-range Android 3,000 events through
status-expiry and victory checks is single-digit milliseconds, not "well under a
millisecond".

- **Fold incrementally.** Cache `(lastState, lastSeq)` and apply only newly-appended
  events. Full replay only on undo and on boot.
- **`applyEvent` must return referentially-identical sub-objects when unchanged** —
  this is a stated requirement with a test, not something `useMemo` provides.
- Debounce persistence to `requestIdleCallback`, force-flush on `pagehide` and
  `visibilitychange` (not `beforeunload` — unreliable on mobile Safari).

### 3.6 Event catalogue

```
GAME_CREATED        { players: [{id, name, seat}], edition: {id, version} }
PLAYER_CHANGED      { playerId, op: 'rename'|'reseat', ...fields }

ROLES_ASSIGNED      { assignments: {playerId: characterId},
                      distribution: {townsfolk, outsiders, minions, demons},
                      setupModifiers: [{characterId, teamDeltas}],
                      demonBluffs: [charId × 3] | null,      // 7+ players only
                      drunkBelief: {playerId, believesCharacterId} | null,
                      redHerring: playerId | null }
ROLE_CHANGED        { playerId, from, to,
                      reason: 'starpass'|'scarlet_woman'|'st_correction'|'st_balance' }

PHASE_ADVANCED      { phase: 'night'|'day', number }
DAY_CLOSED          { }                       // executions derived, never stored

NIGHT_STEP_RESOLVED { stepId, actorIds: [playerId], perceivedCharacterId?,
                      targets: [playerId], chosenAnswer, answerClass,
                      answerReason?, registrationRulings: [{playerId, registersAs}],
                      abilityFunctional, effectSuppressed, stChoice? }
NIGHT_STEP_SKIPPED  { stepId, actorIds, reason: 'condition_unmet'|'st_skip' }
NIGHT_KILL_RESOLVED { stepId, actorIds, attackerId, chosenTargetId,
                      resolutionChain: [{targetId, result}],
                      finalVictimId: playerId | null,
                      successorId: playerId | null }

STATUS_APPLIED      { playerId, status, sourcePlayerId, effective: boolean,
                      expiresAt: {kind:'night'|'day', number} }
STATUS_CLEARED      { playerId, status, sourcePlayerId }   // manual override only

DEATH               { playerId, characterIdAtDeath,
                      cause: 'demon'|'execution'|'slayer'|'other',
                      executionKind?: 'vote'|'virgin' }
DEMON_DIED          { deadDemonId, aliveCountAtDeath,
                      successorId, successorReason: 'scarlet_woman'|'starpass'|null }

NOMINATION_OPENED   { id, nominatorId, nomineeId }
VOTE_CAST           { nominationId, voterId }
NOMINATION_CLOSED   { id, auditTally, auditThreshold, butlerVotesFlagged }
EXECUTION           { playerId | null, kind: 'vote'|'virgin' }
VIRGIN_TRIGGERED    { nominatorId, fired, reason? }
SLAYER_CLAIMED      { claimantId, targetId, claimantIsRealSlayer,
                      targetIsTrueDemon, targetRegisteredAsDemon,
                      abilityFunctional, outcome: 'died'|'nothing' }

RULE_FLAGGED        { rule, relatedTxId, class: 'social'|'integrity', detail }
CLAIM_RECORDED      { playerId, claimedCharacterId, day, confidence, note? }
CLAIM_RETRACTED     { claimId }
NOTE_ADDED          { scope: 'player'|'game', playerId?, text }
SPY_VIEWED          { }
SPY_VIEW_ENDED      { }
GAME_ENDED          { winner, reason: 'demon_dead'|'two_alive'|'saint_executed'
                                     |'mayor_no_execution'|'abandoned' }
```

Notes on shapes that were wrong in v2:

- **Every step event carries `stepId`.** v2's `NIGHT_KILL_RESOLVED` did not, so the
  night cursor could never mark the Imp step settled and looped forever.
- **`actorIds` is always an array.** v2 mixed singular `actorId` with group steps
  declared as `actorIds: []`, which the cursor could never select.
- `NOMINATION_CLOSED`'s tally fields are **write-only forensic record**, never read
  by a selector. v2 named one `butlerVotesDisregarded`, which encoded the opposite
  of the ruling in §16.3.
- `DAY_CLOSED` carries no `executedId`. A Virgin trigger plus a vote execution means
  two executions in one day; a singular field made the Mayor's win condition fire on
  a day where someone *was* executed.
- `legalAnswers` is **not** stored — it is a pure function of state at that `seq` and
  is recomputed when a log entry is expanded. Storing the cross-product could be
  kilobytes per event.
- `STATUS_APPLIED.effective` freezes whether the source's ability worked *at
  application time*, so a Grimoire token is placed even when suppressed (the
  physical Storyteller does place it) without lying about its effect.
- `perceivedCharacterId` is present only on **per-actor** steps. Group steps (Minion
  info, Demon info) have no single perceived character and omit it.

### 3.7 Derived state

```
players[]  { id, name, seat, characterId, perceivedCharacterId, alignment, alive,
             statusLedger[], claims[], infoHistory[], deadVoteSpent,
             virginTriggered, slayerUsed, demonSince, demonNotified }
phase          { kind, number }
settledStepIds Set<string>          // `${night}:${stepId}:${actorKey}` — resolved ∪ skipped
todaysExecutions [{playerId, characterIdAtDeath, kind}]
nominations[]  ruleFlags[]  notes[]  distribution  edition
victory        { status: 'ongoing'|'good'|'evil', reason }
```

`poisoned` and friends are **selectors over `statusLedger`** comparing `expiresAt`
to the current phase — not stored flags, and not a per-phase filtering pass.
`settledStepIds` is a `Set<string>`: v2 typed it `Set<(stepId, actorId)>`, and a JS
`Set` compares tuples by reference, so every lookup would have missed. **The key is
night-scoped.** Without the night prefix the set is derived from the whole event log,
so on night 2 every step is already settled, `nextStep()` returns null immediately,
and the night ends before it starts.

### 3.8 Edition boundary — honest version

Edition **data** lives in one folder, because Trouble Brewing needs it anyway:

```
src/editions/troubleBrewing/
  characters.ts     // id, team, ability text, capability flags, setup modifiers
  nightOrder.ts     // ordered step definitions, first night and other nights
  distribution.ts   // the player-count chart
  registration.ts   // who may register as what
  victory.ts        // win predicates in precedence order
  resolvers.ts      // bespoke handlers
  stepIds.ts        // frozen id list — part of the replay contract
```

`GAME_CREATED` records `edition: {id, version}`, so an archived game knows which
module to replay against.

**v2 claimed "engine code never names a character", enforced by a CI grep. Both are
deleted.** The claim was false on day one — §4.1's own definition tests
`characterId === 'drunk'` — and the grep was broken three ways: `grep` exits 1 on no
match, so under `set -e` it failed the build when it passed; it false-positived on
`'spy'` because Spy Mode lives in the engine; and it covered 8 of 22 characters.

**Known edition debt.** Adding a second edition will require engine edits, not just
a folder. Recorded now so it is a decision rather than a surprise:

| Debt | Why |
|---|---|
| `NIGHT_KILL_RESOLVED` is single-target | Po kills 3, Shabaloth eats 2 |
| `alive` is monotonic, derived from `DEATH` | Zombuul appears alive; Shabaloth resurrects |
| No delayed/conditional death | Pukka poisons night N, kills night N+1 |
| `alignment` derived from character | The Goon changes alignment |
| `drunkBelief` is a singleton | The Lunatic is a second false-belief layer |
| Engine enums name TB concepts | `'starpass'`, `'saint_executed'`, `VIRGIN_TRIGGERED` |
| `fabricated` requires a droisoned actor | Vortox inverts this |

What genuinely transfers: the status ledger with declarative lifetimes, the lazy
night cursor, nominations and vote math, persistence, Spy Mode, the event envelope.

---

## 4. Rules engine — the core predicates

### 4.1 Perceived character (the Drunk)

```
perceivedCharacterId(state, playerId) =
  character.falseSelfBelief && drunkBelief.playerId === playerId
    ? drunkBelief.believesCharacterId
    : characterId
```

Steps resolve **actors**, not a character:
`wakes: (s) => playersWithPerceivedCharacter(s, 'monk')` — always an array, so a
real Empath and a Drunk-believing-Empath both wake, separately, at the same step.

**The invariant, which v2 left unstated and which is load-bearing:**

> `perceivedCharacterId` may be consulted **only** by `wakes()` and by step/UI
> rendering. Every rules predicate — kill resolution, victory, Virgin, Slayer,
> registration, alignment, distribution, and every "learn a character" answer —
> reads the **true** `characterId`.

Without it, an implementer writes `perceivedCharacterId(x) === 'soldier'` in the
kill resolver and a Drunk-believing-Soldier survives the Demon. Enforced by an
eslint rule restricting where the function may be imported.

### 4.2 Ability functionality

```
abilityFunctional(state, p) =
  (character.requiresAlive ?? true ? alive(p) : true) && !poisoned(p) && !isDrunk(p)
```

**v2 bug:** the predicate hardcoded `alive &&`, which disabled the **Ravenkeeper**
permanently — their ability fires *because* they died — and made §4.7 read as *evil
never wins on a Saint execution*, one of only two evil win conditions. Both now
carry `requiresAlive: false`.

v2 also asserted that a dead Butler's dead vote still requires their Master to vote.
**That was wrong** (guide §12: abilities are lost on death except the Ravenkeeper's)
and contradicted its own predicate. A dead Butler's ghost vote is unrestricted.

**Not gated: registration.** A poisoned Recluse still registers ambiguously —
registration is a passive property, not an ability. Its own test.

A suppressed effect still runs the step and still places the reminder token
(`STATUS_APPLIED { effective: false }`) — the physical Storyteller does.

### 4.3 Registration and answer classes

`legalAnswers` is the cross-product over each ambiguous player's registration
options; `canonicalAnswer` is the answer with no shenanigans.

| `answerClass` | Meaning | Constraint |
|---|---|---|
| `canonical` | The plain true answer | — |
| `registration` | A Recluse/Spy ruled to register differently | requires `registrationRulings` |
| `fabricated` | A lie | **only** when the actor is drunk or poisoned |
| `st_override` | You disagreed with the app | requires `answerReason`; never warned |

`st_override` is new in v3 and exists because of a trust trap: without it, a
Storyteller who believes a computed number is wrong must either say a number they
think is wrong, or record their own correct answer as `fabricated` against a sober
player — poisoning the lies ledger and libelling themselves in the permanent log.
Overrides are excluded from the lies ledger, listed separately, and are a useful
defect signal: three overrides on the Empath step is a bug report from the field.

### 4.4 Status lifetimes

| Status | Applied | Expires | Source |
|---|---|---|---|
| `poisoned` | night N | end of day N | Poisoner |
| `protected` | night N | end of night N | Monk |
| `master` | night N | end of day N | Butler |
| `redHerring` | setup | never | setup |

**Phase ordering, stated explicitly because every lifetime above depends on it:**
phases alternate `night 1 → day 1 → night 2 → day 2 → …`. Day N *follows* night N.

```
phaseOrdinal({kind, number}) = number * 2 + (kind === 'night' ? 0 : 1)
isActive(status, now)        = phaseOrdinal(now) <= phaseOrdinal(status.expiresAt)
```

The comparison is **inclusive**: a status expiring "end of night N" is active
throughout night N — the Monk's protection must survive until the Imp step later
that same night — and is gone by day N. Poison applied night N is active for night N
and day N, and gone at the start of night N+1. Left unstated, an implementer has a
coin-flip between `<` and `<=`, and the wrong choice silently breaks the Monk or
clears poison a day early.

Declarative and time-driven, never actor-driven — a Poisoner executed on Day 3 must
not leave their victim poisoned for the rest of the game. §6.3's "remove previous
mark" entries are **physical table instructions**, not the mechanism.

### 4.5 Demon kill resolution

Order is the rule. v2 stated it twice — pseudocode and prose — and the two
disagreed, with the pseudocode starpassing before checking Monk protection.

```
resolveDemonKill(state, targetId):
  !abilityFunctional(attacker)      -> 'no_effect'          // poisoned Imp
  target is already dead            -> 'no_effect'
  protected by a functional Monk    -> 'monk_protected'
  target is a functional Soldier    -> 'soldier'
  target is the attacker themself   -> starpass (§4.6)
  target is a functional Mayor      -> ST picks a bounce target (alive, not the
                                       Mayor, not the attacker); re-run the
                                       already-dead, Monk and Soldier guards on
                                       that bounce target (the attacker-functional
                                       and self-target guards cannot apply)
  otherwise                         -> 'died'
```

Recorded as a `resolutionChain` with a `finalVictimId`, so "bounced, then blocked"
is representable and the dawn announcement can render it.

### 4.6 Demon death — one shared, phase-agnostic handler

Invoked from night kill, execution, and Slayer — but **only when the dead player's
true character is the Demon**. v2 routed any successful Slayer shot here, so a
Recluse ruled to register as the Demon would have promoted the Scarlet Woman while
the real Imp was alive: two living Imps.

```
onDemonDeath(deadDemonId):
  if Scarlet Woman alive && abilityFunctional && aliveCountAtDeath >= 5
                                         -> Scarlet Woman becomes the Demon
  else if starpass and a living Minion exists -> ST picks successor
  else                                   -> no successor
  emit DEMON_DIED, ROLE_CHANGED; set demonSince; checkVictory at commit
```

The Scarlet Woman branch is checked **first**, including on a starpass: her ability
is worded as an unconditional trigger — "if the Demon dies, you become the Demon" —
not a Storyteller option, so when its condition is met it decides the successor
rather than deferring to the starpass choice. v3's first draft had this reversed.
§16.9 records it as contested and names the alternative.

`aliveCountAtDeath` counts the dying Demon (§16.1).

### 4.7 Win conditions

`checkVictory(state)` is pure and runs **exactly once per transaction, at commit** —
never per event, never inside `applyEvent`. v2 specified both, and the per-event
reading declares good the winner the instant the Imp dies, before the Scarlet
Woman's `ROLE_CHANGED` lands, undoing §4.6 entirely.

| # | Winner | Condition | Transaction |
|---|---|---|---|
| 1 | Good | No living player holds the Demon, after successor resolution | any death / role-change tx |
| 2 | Evil | Saint died by execution (vote or Virgin), ability functional | execution tx |
| 3 | Evil | `aliveCount <= 2` | any tx changing the living set |
| 4 | Good | `aliveCount === 3`, Mayor alive and functional, and `todaysExecutions.length === 0` | day-close tx |

Row 1 precedes row 3: a Demon death that brings the count to 2 is a **good** win.
Row 3 uses `<=` rather than `==` defensively — deaths arrive one at a time so the
count should never skip 2, but an equality test that is wrong once ends the game
never, and the looser comparison costs nothing.

Surfaced as a blocking modal. `nextStep()` returns null once `victory.status !==
'ongoing'`, so the night cannot continue past the end of the game.

### 4.8 Advisory enforcement (global)

**The app never blocks a rule break, and never silently alters what happened.** A
broken rule everyone already acted on *has happened*; an app that refuses the input
doesn't undo it, it just loses the game state and leaves you fighting the tool.

This applies at night as well as by day — v2 scoped it to the day phase while §6
still used hard `excludeSelf` / `excludeDead` target filters, so a Monk who pointed
at himself at the table could not be recorded. Target constraints are **soft**:
off-constraint picks are selectable, styled as warnings, and emit `RULE_FLAGGED` in
the same transaction.

Two classes, because they deserve different handling:

- **`social`** — extra vote, double nomination, spent dead vote, invalid Butler
  vote, Monk self-protect, Butler self-master. Recorded, flagged, and **honoured
  arithmetically**. The tally counts what was raised.
- **`integrity`** — targeting a dead player, self-nomination, executing someone
  already dead. Recorded and flagged, but produce **no derived state change**; the
  banner says so. Engine invariant, with a test: no sequence of flagged events can
  make `aliveCount` negative, produce two living Demons, or emit a `DEATH` for a
  player already dead.

---

## 5. Setup

1. **Players.** Names and seating order. 5–15. Warn below 7 that Minion/Demon info
   and bluffs do not apply.
2. **Deal.** Demon → Minions → **apply setup modifiers (Baron ±2)** → Outsiders →
   Townsfolk. Then: 3 demon bluffs (good characters not in play — **7+ players
   only**; v2 dropped this qualifier that v1 had right), the Drunk's believed
   Townsfolk (not otherwise in play, and excluded from the in-play set used by
   Washerwoman/Investigator), the red herring (any good player, possibly the Fortune
   Teller themselves).
3. **Edit.** Swap, reroll all, reroll one. Legality re-validated.
4. **Lock in.** Records the post-modifier `distribution`, which is **public** and
   displayed persistently thereafter.
5. **Confirm seating.** A seat-ring view and an explicit confirmation. Seating is
   load-bearing for Chef and Empath, and a circle entered backwards or off by one
   makes every positional answer wrong for the whole game — a failure no unit test
   can reach. Re-confirmed at each dusk with one tap: *Seating unchanged? [Yes] /
   [Someone moved]*.

### 5.6 Roster changes mid-game

The roster is **fixed once roles are locked in**. Nobody joins or leaves a game in
progress — see §18. Two edits remain, because both are typo-and-chair-shuffle
reality rather than roster changes:

| `op` | Effect |
|---|---|
| `rename` | Cosmetic. Nothing else changes. |
| `reseat` | The circle is rebuilt. Seat adjacency feeds Chef and Empath, so positional answers already given become stale — flagged via `RULE_FLAGGED { class: 'integrity' }`, and never rewritten. What was said at the table stands as spoken. |

`reseat` exists because people genuinely do swap chairs on the way back from the
kitchen, and a circle that no longer matches the room makes every subsequent Empath
answer wrong. §5.5's dusk seating check is what catches it.

---

## 6. Night engine

### 6.1 Lazy cursor

```
nextStep(state) =
  victory.status !== 'ongoing' ? null
  : first step in NIGHT_ORDER[first|other] where
      step.wakes(state) is non-empty
      && stepKey(step, actors) not in settledStepIds
```

Re-evaluated after **every** step event. No materialised queue.

- `settledStepIds` = resolved ∪ **skipped**. v2 counted only resolved, so tapping
  "skip" returned the same step forever — a hard stall, at night, live.
- `stepKey` is a string:
  `` `${phase.number}:${stepId}:${grouping === 'group' ? 'GROUP' : actorId}` ``.
  One key per actor for per-actor steps; one key for the whole set for group steps.
- Passing over a step whose condition is unmet emits `NIGHT_STEP_SKIPPED { reason:
  'condition_unmet' }`, so the log can answer "why didn't the Undertaker wake?"
- **The cursor is deliberately non-monotonic.** A mid-night Scarlet Woman promotion
  re-opens a step that sits earlier in the night order. This is intended, not a bug.
- The night ends when `nextStep()` returns null → `PHASE_ADVANCED { day }`.

### 6.2 Step shape

```js
{ id: 'monk',
  wakes: (s) => playersWithPerceivedCharacter(s, 'monk').filter(alive),
  grouping: 'per-actor' | 'group',
  firstNight: false,
  script: { instruction, wakeConfirm, sleepConfirm,
            showCard?: 'this_is_the_demon'|'these_are_your_minions'
                      |'not_in_play'|'you_are',
            showToken?, output: 'point'|'fingers'|'nod'|'token'|'handover'|'none' },
  reminderTokens: { add: ['protected'], remove: [] },   // table instructions
  targets: { min, max, distinct?, warnSelf?, warnDead?, warnRepeat? },  // soft
  computeCandidates: (s, targets) => LegalAnswer[],     // pure, render-safe
  effect: { status:'protected', lifetime:'until_dawn' } }
```

**`requiresAlive` lives on the character (§4.2), never on the step.** Waking and
ability-functionality are different questions: `wakes()` decides who is roused — the
Ravenkeeper's `wakes` deliberately does *not* filter on `alive` — while
`abilityFunctional` decides whether what they are told is real. A step reads the flag
from the actor's character; it is never duplicated onto the step.

`computeCandidates` receives a narrowed `RulesView` (players, characters, statuses,
phase, deaths) — **not** the full `GameState`, so the edition layer structurally
cannot see notes or the lies ledger. Default selection among candidates happens
**once on step entry**, never during render, or the Washerwoman decoy reshuffles
every frame.

Pseudo-steps in both orders: `dusk_confirm_eyes_closed` (skippable countdown, plus
the §5.5 seating check), `dawn_wait`, `dawn_announce_deaths` (renders the resolved
outcome, including "no one died tonight" when the Monk blocked it).

Group steps: Minion info (eye contact, conditional on ≥2 Minions) and Demon info
resolve once for the whole set.

### 6.3 First night vs other nights

| | First night | Other nights |
|---|---|---|
| Minion info / Demon info + 3 bluffs | yes, **7+ players only** | no |
| Washerwoman, Librarian, Investigator, Chef | yes | no |
| Poisoner | yes | yes |
| Monk, Undertaker, Imp, Ravenkeeper, Scarlet Woman | no | conditionally |
| Deaths | none | possible |
| Spy, Empath, Fortune Teller, Butler | yes | yes |

The **Scarlet Woman notification** condition is `isDemon && demonSince != null &&
!demonNotified` — a persistent flag, not "promoted this night". A promotion by
daytime execution on Day 3 must notify on Night 4, and `settledStepIds` is per-night
so a per-night predicate would silently never fire.

### 6.4 Information

Every info step shows the canonical answer, **its derivation** (§8.2), the legal
answer set when a Recluse or Spy is involved, a loud banner when the actor is drunk
or poisoned, what this player has been told before, and an always-available override.

Chef: circular adjacency; a run of *k* adjacent evils contributes *k−1* pairs.
Empath: **alive** neighbours, skipping the dead around the circle. Librarian has an
explicit zero-Outsiders branch. The Librarian may be shown the Drunk (a real
Outsider); the Washerwoman may **not** be shown the Drunk under their believed
Townsfolk.

---

## 7. Day phase

- **Nominations.** Checked: nominator alive, nominee alive, nominator ≠ nominee,
  neither has already nominated / been nominated today. Derived from today's events.
  Failures flag per §4.8; they do not block.
- **Voting.** Voters presented clockwise from the nominee's left. Threshold
  `ceil(alive / 2)` — verified against guide §10 (8→4, 7→4, 5→3, 4→2).
- **Butler.** An invalid Butler vote **counts toward the tally**. The app tells you a
  rule was broken and logs it; you decide. See §16.3 — the reason is an information
  leak, not just ergonomics. A drunk or poisoned Butler's vote always counts. A dead
  Butler's ghost vote is unrestricted.
- **Dead votes.** Derived from `VOTE_CAST` where the voter was dead at that `seq`. A
  second dead vote is flagged and counted.
- **Execution.** Highest tally meeting threshold at day close; a tie at the top means
  no execution. Once a nomination is the unique highest and meets threshold, that
  player is executed — there is no legal skip at that point (§16.8).
- **Virgin.** Fires on the first nomination ever against the Virgin, if the nominator
  is a true Townsfolk (a Spy may be ruled Townsfolk) and the Virgin is functional.
  The **nominator** dies. The Virgin survives and **loses the ability either way,
  including when poisoned**. The nomination then proceeds to a normal vote.
- **Two executions in one day** is therefore possible; `todaysExecutions` is a list,
  and the Undertaker step becomes a Storyteller choice when it has more than one.
- **Closing the day.** An explicit *Close day* action, always available, **including
  with zero nominations** — the Mayor's win (§4.7 row 4) is only reachable through a
  day that closed with no execution, so a day must be closeable with nobody
  nominated. It emits `DAY_CLOSED`, resolves any execution from the day's
  nominations, runs `checkVictory`, and advances to night.
- **Ending the game early.** An *End game* action emits
  `GAME_ENDED { reason: 'abandoned' }`, for the ordinary case where evil concedes or
  people go home. Without it that reason has no producer and an abandoned game cannot
  reach the post-game summary.
- **Slayer.** Anyone may claim it. `SLAYER_CLAIMED` records whether the claimant is
  the real Slayer, whether their ability is functional, whether a Recluse target was
  ruled to register as the Demon, and — separately — whether the target **is** the
  true Demon. Only the last routes into §4.6.

---

## 8. Screens

### 8.1 Inventory and navigation

One-column, phone-first. Bottom tab bar: **Grimoire · Night/Day · Log · Reference**.

| Screen | Notes |
|---|---|
| Setup → Deal → Seating confirm | Linear, once |
| **Grimoire** | Default screen. Seat ring or list, toggleable |
| Night step | Modal over the Grimoire — dismissible to consult the Grimoire without losing an in-progress target selection, which is held in a scratch object persisted on every tap |
| Night overview | Tonight's full ordered step list, settled/current/upcoming, tap to jump. Replaces the printed sheet rather than walking it one step at a time |
| Day: nominations & votes | |
| Log / timeline | Events and notes interleaved |
| Player sheet | Notes, claim history, `infoHistory` |
| Reference | Character abilities, voting rules, dead-player rules — readable aloud when someone asks |
| Spy Mode | Above the router (§10) |
| Post-game summary | Final roles, deaths, lies, claims vs truth |

Grimoire rows: seat, name, true character, alignment **glyph** (never colour alone),
alive/dead, dead-vote spent, status chips (`poisoned`, `protected`, `Master`,
`red herring`, `Drunk — believes Empath`), latest claim, note count. Persistent
header: phase and number, alive count, current threshold, and the public T/O/M/D
counts. At 15 players the list scrolls; the header does not.

### 8.2 Show your working

Every computed number renders its derivation beneath it:

```
Empath — Bea:  1
   seats:  … Zed | Ali (dead) | Bea | Cy …
   nearest alive either side, skipping the dead:  Zed · Cy
   Zed GOOD · Cy EVIL                                    -> 1

Chef:  2                                    (10 players, 3 evil)
   ring: Dan* Eve* Fin* Gus Hal Ivy Jo Kat Lee Moe       (* = evil)
   adjacent evil pairs: (Dan,Eve) (Eve,Fin)              -> 2
   a run of k adjacent evils gives k-1 pairs; the ring wraps

Threshold:  4        ceil(7 alive / 2)
```

This is the only defence against the app being *silently* wrong. A wrong integer is
unfalsifiable at the table — you are using the app precisely because you did not
want to do the arithmetic. A wrong derivation is obvious at a glance, and it catches
the likeliest cause of all: a seating order entered wrong on night zero, which no
unit test can ever reach.

---

## 9. Notes, claims, ledgers

Free-text notes (per-player and general); structured **claims** with conflict
flagging (two hard claims on one character, a claim on a character not in play, a
claim matching a demon bluff); per-player **info history**; a **lies ledger** of
every `fabricated` answer; an **overrides** list; a **registration ledger** so you
can stay consistent about the Recluse — or knowingly not be.

---

## 10. Spy Mode

### 10.1 What it shows

Seating, true characters, status markers, plus the red herring, the demon bluffs and
the Drunk's believed-character marker (§16.2). Never: notes, claims, info history,
lies, overrides, registration rulings, or the event log.

**Tokens, never effectiveness.** Spy Mode shows that a `protected` marker sits on a
player; it never exposes `STATUS_APPLIED.effective`. A physical reminder token does
not announce that the Monk who placed it was poisoned, and neither does this.

### 10.2 Structural separation

1. **Hand-written `SpyView`**, not `Omit<GameState, …>` — `Omit` silently admits
   every field added later. Paired with an exhaustive key partition so that adding
   *any* field to `GameState` is a compile error until it is classified as allowed
   or denied. (v2 claimed a hand-written interface alone would fail to compile. It
   would not — nothing references it in a way that notices.)
2. **`toSpyView` builds its result field by field. No spreads.** TypeScript is
   erased; excess-property checking does not fire through a variable, so a spread
   ships every secret field to `JSON.stringify` while type-checking clean.
3. **Canary test:** a generated fixture seeds `"CANARY"` into every string leaf;
   assert `JSON.stringify(toSpyView(state))` does not contain it.
4. **Spy components import nothing from game state** — they receive `SpyView` as
   props. Enforced by eslint, with the caveat recorded that `no-restricted-imports`
   does not catch transitive imports.

### 10.3 Physical hardening

- **Fail closed at first paint.** An inline script in `index.html`, before the
  bundle, reads the persisted mode and marks the document; the shell renders neutral
  until the mode resolves. An unknown or unparseable mode renders **blank, not the
  Grimoire**. v2 would have painted the Grimoire for at least a frame on every cold
  load, and defaulted to it on every failure.
- **The spy gate sits above the router:** `if (mode === 'spy') return <SpyRoot/>`
  before any route matching. Back then navigates harmlessly; the gate still renders
  Spy Mode. v2's `pushState` trap is unreliable — Chrome skips history entries
  created without user activation, and iOS's interactive back-swipe renders a live
  snapshot of the previous entry *before* `popstate` fires, handing the Spy a
  scrubbable screenshot of the Grimoire.
- On entering: `replaceState` the current entry to a neutral card **first**, then
  push the spy entry, so the back-swipe snapshot is not the Grimoire.
- Re-render Spy Mode on `visibilitychange` / `blur` when mode is already spy.
- Hold-to-exit for 2 seconds, on a **small corner-anchored control** — never a
  full-screen gesture, so it cannot collide with the panic-blank restore.
- Hold the wake lock during Spy Mode: a phone that auto-locks in the Spy's hands
  forces you to unlock it in front of them, past a lock screen with notification
  previews.
- **The handover is one guarded transition.** The Spy's night step has a single
  primary action, *Enter Spy Mode*, and the instruction "hand the phone over" is
  rendered **only inside** Spy Mode. There is no screen that says hand it over which
  is not already Spy Mode. This is a structural fix for the worst outcome in the
  document — forgetting to enter Spy Mode first exposes the Grimoire, the notes and
  the lies ledger, and the game is socially over.
- On exit, land on a neutral "take the phone back" card, not a live action.

A web app cannot fully close this. OS-level screen pinning (iOS Guided Access,
Android app pinning) is the only real control for a device physically handed to an
adversary, and belongs in the pre-game checklist.

---

## 11. Live-conditions safety

- **Panic blank:** a persistent full-width bar in the thumb zone (one tap, no gesture
  recognition), plus two-finger tap implemented on `pointerdown` with
  `isPrimary === false`. Hold 300ms to restore.
- **Blank on `visibilitychange` / `pagehide`,** synchronously, for all private views
  — the iOS app switcher screenshots whatever was last on screen.
- **Precedence, because §10.3 hooks the same event with the opposite intent:** if
  `mode === 'spy'`, Spy Mode wins and the page does **not** blank. The Spy is
  supposed to be looking, and a blank they cannot clear would strand them — the
  restore hold is 300ms while the Spy-exit hold is 2s on a different control. Spy
  Mode is never a "private view" for blanking purposes; every other view blanks.
- Alignment by glyph, never colour alone. Role text deliberately small; one row
  expanded at a time.

Cut from v2: the **volume-key** trigger (a web page cannot observe hardware volume
keys on either target platform — the claim was simply false), the **45-second
auto-blank** (a night step routinely goes >45s without a tap while you gesture at
the table; it would blank mid-performance and fight the wake lock), and the
**redacted first-letter Grimoire** (Monk/Mayor, and five characters starting with S).

---

## 12. Persistence and offline

1. **Installable and offline-first.** `vite-plugin-pwa` precaching the whole bundle,
   a manifest, and "Add to Home Screen" in the pre-game checklist. Without this, a
   reload with patchy signal is a white page while the game sits unreachable in
   `localStorage` — and the mid-night resume story depends on reload. Installation
   also exempts the origin from Safari's 7-day storage eviction and removes browser
   chrome, shrinking the Spy Mode back-button surface.
   `registerType: 'prompt'`, `skipWaiting: false`, and **never activate a waiting
   worker while a game is in progress**.
2. **Self-hosted fonts and a `connect-src 'none'` CSP**, so "no backend, no network"
   is machine-checked rather than promised. One stray Google Fonts link would defeat
   offline loading silently.
3. **Write-verify, not try/catch.** Modern Safari private browsing returns a working
   `localStorage` that does *not* throw — it discards at session end. So v2's
   try/catch caught nothing and the "NOT SAVING" banner had no trigger. Instead:
   write, read back, compare a checksum. Failure shows a persistent banner *with an
   action*:
   "NOT SAVING — export now and keep this tab open."
   **Do not try to detect private browsing with a cross-session sentinel** — a
   missing sentinel is indistinguishable from a first run. Instead request
   `navigator.storage.persist()` at setup; a `false` result means the browser may
   evict this data, which private mode reliably reports, and warrants a softer
   warning: this browser may not keep your game, so export at each dawn.
4. **Version skew.** Store `schemaVersion` + `appVersion`/`buildHash`; show the build
   id in the UI. On load, if the build changed and `phase !== 'setup'`, warn plainly.
   **A refused load must never overwrite or delete the blob, and must always offer a
   raw export.** Policy: no deploys on game day.
5. **Two rotating saves**, each self-identifying by a counter *inside* the blob, so
   boot picks the max with no separate pointer key to tear. (v2's three-slot buffer
   defended the least likely failure — `setItem` is atomic — while all three slots
   die together in every failure that actually matters.)
6. **Export and import, both in Slice 1.** v2 had export only, which makes it a
   souvenir: no way to reproduce a weird game, build a test from it, or move it to a
   laptop after the phone dies. Export runs from a user gesture (`navigator.share`
   requires one), with an `<a download>` fallback, and never navigates away;
   filenames are non-descriptive, since notes name real people. **Import refuses
   while a game is in progress**, offering to export or discard the current game
   first, so a mistapped import cannot destroy a live session.
7. **Second-tab guard** with a `localStorage` heartbeat and a lease, plus a prominent
   **"Take control on this tab"** button on the read-only banner — otherwise a tab
   discard plus a fresh open locks you out of your own game mid-night.
8. Mid-night resume derives from events; in-progress target selection is a scratch
   object persisted on every tap. On boot: *"Night 3, Imp step. Resume / Export /
   Discard."*

---

## 13. Responsive & accessibility

Dark theme only, with `<meta name="theme-color">`, `color-scheme: dark` and a
background set in `index.html` — otherwise iOS paints a white chrome bar and a white
flash on every cold load, in a dim room. Touch targets ≥48×48px (satisfies both
Apple's 44 and Material's 48) with ≥8px separation. Destructive actions never
adjacent to frequent ones. Primary night controls in the bottom third. Body ≥16px,
step instruction ≥20px.

`navigator.wakeLock` (Chrome Android 84+, iOS Safari 16.4+) **re-acquired on
`visibilitychange`** — it is auto-released whenever the document hides and does not
return on its own, so v2's "held for the night phase" was decorative after the first
app switch. Released when the panic blank is showing. Fallback where unsupported:
a one-time card saying "set auto-lock to Never". There is no good programmatic one.

Portrait is the designed layout; landscape degrades gracefully. It cannot be
enforced — `screen.orientation.lock()` does not exist on iOS Safari.

One column at every width, with a max-width on desktop. (v2's 480/768/1024
breakpoints and desktop split-pane are cut — a second layout to maintain for a tool
used on a phone.)

---

## 14. Testing

Effort is allocated by **damage × how unlikely you are to notice**, which inverts
v2's distribution. Vote math is the most self-correcting subsystem in the app — ten
people just watched the hands go up and will recount out loud — and v2 spent a large
share of its budget there. Positional information is the least: it corrupts every
deduction chain silently, for the whole game.

v2 also closed by asserting "the reducer is the part least likely to fail — it is
pure and easy." Its own change log is a ten-item list of rules bugs in the reducer.
Purity buys testability, not correctness. That sentence is deleted.

**Tier 1 — property tests (highest value).**
- Chef and Empath against a **separately written, deliberately naive reference
  implementation**, over generated circles (7–15 seats, random evil placements,
  random dead sets). Covers wrap-around and all-adjacent edges no example set will.
- **Status-timeline invariants** over generated traces: no player carries `poisoned`
  into day N+1 from a night-N Poisoner; protection never survives dawn; expiry is
  independent of whether the source is alive.
- Reducer determinism: double-reduce and JSON round-trip deep-equal;
  `applyEvent` returns referentially-identical untouched sub-objects; `Math.random`
  and `Date` stubbed to throw.
- Advisory invariants: no sequence of flagged events can make `aliveCount` negative,
  produce two living Demons, or kill a dead player.

**Tier 2 — the rules cases that bit v1 and v2.**
Distribution ×11 counts; Baron draw order; bluffs suppressed below 7; Drunk wakes at
their believed step and both Empaths wake separately; `requiresAlive` — Ravenkeeper
gets info while dead, Saint execution wins for evil, poisoned Saint does not;
poisoned Monk does not protect; poisoned Virgin does not fire but still consumes the
ability; **poisoned Recluse still registers ambiguously**; poisoned Imp's kill does
nothing; Monk-protected Imp self-target does not starpass; starpass with no living
Minion; Scarlet Woman at exactly 5 including the dying Demon, promoted by a *daytime*
execution, and notified the following night; Slayer on a Recluse ruled as Demon
promotes nobody; win precedence (Demon death to 2 alive → good); Mayor win requires
`todaysExecutions.length === 0`; threshold at three representative counts; invalid
Butler vote **counts** and flags; cursor terminates when every step is skipped; the
`stepIds` frozen-list snapshot.

**Tier 3 — three browser tests only** (nothing else can assert these): Spy Mode
survives refresh; Spy Mode survives Back; resume lands on the same step. Use
`page.clock` to fast-forward holds. The full-game Playwright walkthrough is cut in
favour of a fast headless scripted game driving the command layer — same rules
coverage, no flake.

**Tier 4 — a written manual device checklist**, run once on a real iPhone and a real
Android: back-swipe leak, tab discard resume, wake lock across an app switch,
private-browsing detection, panic blank, export via the share sheet. None of these
are reachable from Playwright's WebKit build.

No per-character-file CI gate: an empty file passes it, and it is the gate that gets
`--no-verify`'d in month two.

---

## 15. Delivery slices

**Slice 1 — a complete, playable tool.** Setup, deal, seating confirmation,
Grimoire with show-your-working, the full night engine, **the full day phase**
(nominations, votes, thresholds, execution, Virgin, Slayer), win conditions,
transactional undo, advisory enforcement, persistence with offline/PWA and
export/import, and Spy Mode with the §10.3 hardening.

Spy Mode is in Slice 1 for a structural reason: the boundary and the `SpyView` type
must exist *before* the private data they exclude does. Because Slice 2 adds that
data, seed one placeholder secret field in `GameState` in Slice 1 so the canary test
is live from day one rather than vacuously passing.

**Slice 2 — the memory layer.** Notes, structured claims, timeline UI, lies /
overrides / registration ledgers, post-game summary.

---

## 16. Rulings the engine hardcodes

1. **Scarlet Woman alive count** — the dying Demon **counts** toward the 5.
2. **Spy Mode fidelity** — red herring, demon bluffs and the Drunk's believed
   character are shown. Note the stated rationale is imperfect: a physical Grimoire
   holds the red herring and Drunk tokens, but the bluffs are shown to the Demon and
   set aside. Game impact is near zero (the Demon already knows their own bluffs).
3. **Butler enforcement** — an invalid Butler vote **counts**; the app notifies you
   and logs it. Two reasons, the second decisive: (a) once the hand is up the rule is
   already broken and the app cannot un-break it; (b) **striking the vote leaks the
   role** — the announced tally would not match the hands the table just watched go
   up, and they would deduce the Butler from the discrepancy. Enforcement stays with
   the Butler, and the Storyteller keeps override control.
4. **Spy Mode exit** — hold-to-exit 2s on a corner control, no PIN.
5. **Two executions in one day** — the day continues after a Virgin trigger; you
   choose which execution the Undertaker learns.
6. **Registration consistency** — flagged, never blocked.
7. **Mayor bounce** — victim must be alive, not the Mayor, not the attacking Demon;
   protection and Soldier are re-checked on the bounce target.
8. **Execution finality** — once a nomination is the unique highest and meets
   threshold, that player is executed; there is no legal skip at that point.
9. **Scarlet Woman beats starpass.** When the Imp self-kills at 5+ alive with a
   living, functional Scarlet Woman, both trigger and **she** becomes the Demon,
   because her ability reads as an unconditional trigger rather than a Storyteller
   option. Genuinely contested — the alternative is that the starpass lets you hand
   the Imp to any living Minion. If your group plays it the other way it is a
   two-line change in `onDemonDeath` (§4.6) plus its test.
10. **Poisoned Virgin** still consumes the ability on the first nomination.
11. **Monk-protected Imp targeting itself** does not starpass.
12. **A Recluse may register as the Demon and die to the Slayer** — without
    promoting anyone (§4.6).

## 17. Change log

**v3 fixes** (from a five-lens review): Ravenkeeper and Saint disabled by
`abilityFunctional` (§4.2); Slayer-on-Recluse promoting the Scarlet Woman (§4.6);
`checkVictory` specified per-event and per-transaction (§4.7); kill-resolution
pseudocode contradicting its own prose (§4.5); the Imp step never marked settled and
the cursor looping on skip (§6.1); group steps unselectable and `Set` of tuples
(§3.7, §6.1); `DAY_CLOSED` singular breaking the Mayor win (§3.6); `aliveCount == 2`
stepped over by player removal (§4.7); Scarlet Woman notification unreachable across
a day boundary (§6.3); the perceived-character invariant unstated (§4.1); advisory
enforcement not applied at night (§4.8); dead Butler contradiction (§4.2); demon
bluffs losing their 7+ qualifier (§5). **Deleted as unsound or inert:**
edit-and-replay, `EVENT_CORRECTED`, the seeded PRNG, the CI grep gate, the
per-character test gate, the full-game E2E, the volume-key panic blank, the 45s
auto-blank, the redacted Grimoire, desktop breakpoints. **Added:** show-your-working
(§8.2), `st_override` (§4.3), offline/PWA (§12), import (§12.6), the screen inventory
and Reference screen (§8.1), seating confirmation (§5.5), the guarded Spy handover
(§10.3), and the known-edition-debt table (§3.8).

**v3.1 fixes** (self-review of v3): `settledStepIds` had no night in its key, so
night 2 would have ended immediately (§3.7, §6.1); status-expiry comparison semantics
and the night-N-then-day-N phase ordering were never stated (§4.4); the Empath worked
example in §8.2 contradicted itself and the Chef example used an illegal
distribution; `PLAYER_CHANGED` had no semantics (§5.6); `requiresAlive` was defined
on both the character and the step (§4.2, §6.2); "re-run the three guards" named five
(§4.5); §10.3 and §11 hooked `visibilitychange` with opposite intents and no
precedence (§11); no action closed the day or ended a game, leaving the Mayor win and
`reason: 'abandoned'` unreachable (§7); private-mode detection by sentinel could not
distinguish a first run (§12.3); Scarlet Woman vs starpass precedence reversed
(§4.6, §16.9); plus import-during-game, Spy Mode effectiveness leakage, and the
per-actor scope of `perceivedCharacterId`. Mid-game player add/remove was then cut
from scope entirely; `PLAYER_CHANGED` keeps only `rename` and `reseat`.

**v2 fixed** (from a three-lens review): the Drunk never waking; no win-condition
engine; the night queue built before mid-night conditions were knowable; "compute the
true answer" with a Recluse or Spy in play; non-transactional undo; status expiry
tied to a living source; the Soldier and Mayor absent entirely; Scarlet Woman with no
daytime path; ability effects ungated by poison/drunk.

## 18. Out of scope

Custom scripts, Travellers, Fabled, multiplayer or networked play, accounts,
multi-game archive, a live Spy link on a second device, practice mode, a
paper-handoff snapshot screen, and **mid-game roster changes** — players do not join
or leave once roles are locked in, so there is no add or remove path (§5.6). A player
who must drop out is handled as a death like any other: `DEATH { cause: 'other' }`,
left seated, adjacency unchanged. **Never** put game state in a URL fragment or query
string — it would land in history, the address bar and autocomplete.

Other editions are out of scope to *build*, not to *accommodate*: no other-edition
content ships and no engine work is done speculatively, but edition data is isolated
and the known debt is written down (§3.8).
