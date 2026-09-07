# Blood on the Clocktower — Storyteller App
## Design Document

Date: 2026-09-07
Status: draft v2 — revised after three-lens adversarial review
Edition scope: **Trouble Brewing only**

> v1 of this document is kept at `2026-09-07-botc-storyteller-app-design.v1.md.bak`.
> A change log is at §16.

---

## 1. Problem

Running Trouble Brewing as Storyteller means holding a large amount of hidden,
mutable state in your head while performing for a table: who is which character,
who is poisoned or protected *right now*, what you told whom and whether it was
true, who has nominated, who has voted, who has spent a dead vote, and which lies
you are currently maintaining. A physical Grimoire and a printed night sheet cover
part of this and leave the Storyteller doing arithmetic live, under social
pressure, with no record of what was said.

This app is a **single-user private tool for the Storyteller**, used on a phone or
laptop during an in-person game. It is not a game client for players. The one
exception is Spy Mode (§10).

## 2. Confirmed requirements

| Decision | Choice |
|---|---|
| Spy grimoire delivery | Same device. Hand it over, take it back. |
| Information | App enumerates *legal* answers; Storyteller chooses; fabrications are a separate labelled category (§4.3). |
| Platform | Static client-side app (React + Vite), `localStorage`. No backend, no accounts. |
| Role assignment | Randomize a legal set, then edit before locking in. |
| Day phase | Full nomination and vote tracking, including threshold math. |
| Event log | Automatic, timestamped, interleaved with typed notes. Never visible in Spy Mode. |
| Responsive | Phone-first; desktop is the same layout with more room (§13). |
| Rule enforcement | **Advisory.** The app warns and records; it never blocks a rule break (§7). |
| Editions | Trouble Brewing is built. The engine is edition-agnostic so others can be added (§3.8). |

---

## 3. Architecture: event-sourced core

`state = events.reduce(applyEvent, initialState)`

### 3.1 Why (corrected rationale)

v1 justified this primarily on "undo is `events.slice(0, -1)`". That justification
was **wrong** — see §3.4. The real ranking is:

1. **The log is a hard product requirement** and must never drift from state. Any
   mutable-state design needs a parallel log that *can* drift.
2. **Edit-and-replay.** Because all randomness is pre-resolved into event data
   (§3.3), editing an event and re-reducing is deterministic and free. This is the
   correction operation a Storyteller actually needs.
3. Undo — a distant third, and only when transactional.

### 3.2 Event envelope

Every event is `{ id, seq, txId, ts, night?, day?, type, payload }`.

- `txId` — **one Storyteller action = one transaction**, however many events it
  emits. Non-negotiable: resolving the Monk step emits `NIGHT_STEP_RESOLVED` +
  `STATUS_APPLIED`; an Imp kill on the Mayor can emit `NIGHT_KILL_RESOLVED` +
  `DEATH` + `ROLE_CHANGED` + `GAME_ENDED`.
- `ts` — stamped by the **command layer**, never inside `applyEvent`. All events
  are timestamped, not just notes.
- `schemaVersion` is stored once on the persisted envelope (§12).

### 3.3 Purity rule, and how it is enforced

**The reducer is pure.** No `Math.random()`, no `Date.now()` inside `applyEvent`.
All randomness *and every Storyteller choice* is resolved before the event is
created and stored as literal data on it — otherwise replay produces a different
game than the one that was played.

Choices that must be event data (v1 missed most of these): role deal, demon
bluffs, Drunk's believed character, Fortune Teller red herring, information
candidate-pair selection, **Mayor bounce target**, **Imp starpass successor**,
**Recluse/Spy registration rulings**, **Undertaker's pick when two players were
executed**, **Librarian's "zero Outsiders" signal**.

Prose is not enforcement. Four mechanisms:

1. **Seeded PRNG.** `GAME_CREATED` carries a seed; all randomness routes through
   it. Even if purity is accidentally broken, replay stays deterministic.
2. **Layer split.** `commands/` (impure: reads state, uses the RNG, returns a
   transaction of events) vs `reducer/` (pure, may import only `rules/`). A step's
   `apply()` is a *command handler*, not a reducer, and is **never called during
   replay**.
3. **Test setup file** for reducer tests stubs `Math.random`, `Date.now` and
   `crypto.getRandomValues` to throw.
4. **Property test:** `reduce(events)` twice, and after a JSON round-trip, deep-equal.

### 3.4 Correction model

Three distinct operations. v1 had only the first, and had it wrong.

| Situation | Mechanic | Log shows |
|---|---|---|
| Mistap, never happened at the table | **Undo** — drop every event sharing the last `txId` | nothing |
| Wrong value several steps back, info not yet spoken | **Edit-and-replay** — tap the log entry, change the payload, re-reduce | the corrected value |
| Wrong, but already announced to a player | **Correction event** — `EVENT_CORRECTED { targetEventId, patch, reason }` | both the original and the correction |

`SPY_VIEWED` / `SPY_VIEW_ENDED` are a non-undoable event class — they are an audit
trail and must not be popped by the undo stack.

### 3.5 Performance — an explicit non-decision

A 10-player, 5-day game is roughly 400 events; a pathological 15-player game is
under 1,500. Reducing 1,500 small objects is well under a millisecond against a
16ms frame. **No snapshotting.** The two things that would actually bite:

- calling `reduce` inside a per-player component (15× per render) → one
  `useMemo` at the provider, with structural sharing so unchanged players keep identity;
- `JSON.stringify(events)` synchronously on every tap → fine at this size, but this
  is the O(n)-per-tap to watch, not the reduce.

### 3.6 Event catalogue

```
GAME_CREATED        { players: [{id, name, seat}], seed }
PLAYER_ADDED        { id, name, seat }
PLAYER_REMOVED      { playerId, reason }
PLAYER_RENAMED      { playerId, name }
SEAT_CHANGED        { playerId, seat }

ROLES_ASSIGNED      { assignments: {playerId: characterId},
                      distribution: {townsfolk, outsiders, minions, demons},
                      baronApplied: boolean,
                      demonBluffs: [charId × 3] | null,
                      drunkBelief: {playerId, believesCharacterId} | null,
                      redHerring: playerId | null }
ROLE_CHANGED        { playerId, from, to,
                      reason: 'starpass'|'scarlet_woman'|'st_correction'|'st_balance' }

PHASE_ADVANCED      { phase: 'night'|'day', number }
DAY_CLOSED          { executedId: playerId | null }

NIGHT_STEP_RESOLVED { stepId, actorId, perceivedCharacterId, targets: [playerId],
                      legalAnswers: Answer[], chosenAnswer: Answer,
                      answerClass: 'canonical'|'registration'|'fabricated',
                      registrationRulings: [{playerId, registeredAs}],
                      abilityFunctional: boolean, effectSuppressed: boolean,
                      stChoice?: any }
NIGHT_STEP_SKIPPED  { stepId, actorId, reason }
NIGHT_KILL_RESOLVED { attackerId, chosenTargetId,
                      outcome: 'died'|'monk_protected'|'soldier'|'mayor_bounced'
                              |'starpass'|'no_effect',
                      actualVictimId: playerId | null,
                      successorId: playerId | null }

STATUS_APPLIED      { playerId, status, sourcePlayerId,
                      expiresAt: {kind:'night'|'day', number} }
STATUS_CLEARED      { playerId, status, sourcePlayerId }   // manual override only

DEATH               { playerId, characterIdAtDeath,
                      cause: 'demon'|'execution'|'slayer'|'other',
                      executionKind?: 'vote'|'virgin',
                      phase: {kind, number} }
DEMON_DIED          { deadDemonId, aliveCountAtDeath,
                      successorId: playerId | null,
                      successorReason: 'scarlet_woman'|'starpass'|null }

NOMINATION_OPENED   { id, nominatorId, nomineeId }
VOTE_CAST           { nominationId, voterId }
NOMINATION_CLOSED   { id, tallySnapshot, thresholdSnapshot,
                      butlerVotesDisregarded: [voterId] }
EXECUTION           { playerId | null, kind: 'vote'|'virgin' }
VIRGIN_TRIGGERED    { nominatorId, fired: boolean,
                      reason?: 'poisoned'|'not_townsfolk'|'already_used' }
SLAYER_CLAIMED      { claimantId, targetId, claimantIsRealSlayer: boolean,
                      abilityFunctional: boolean, targetRegisteredAsDemon: boolean,
                      outcome: 'died'|'nothing' }

CLAIM_RECORDED      { playerId, claimedCharacterId, day,
                      confidence: 'hard'|'soft', note? }
CLAIM_RETRACTED     { claimId }
RULE_FLAGGED        { rule, relatedEventId, detail }
NOTE_ADDED          { scope: 'player'|'game', playerId?, text }
EVENT_CORRECTED     { targetEventId, patch, reason }
SPY_VIEWED          { }
SPY_VIEW_ENDED      { }
GAME_ENDED          { winner: 'good'|'evil',
                      reason: 'demon_dead'|'two_alive'|'saint_executed'
                             |'mayor_no_execution' }
```

Note `characterIdAtDeath` on `DEATH`: without it the Undertaker cannot correctly
report a Minion who was executed *after* being promoted to Imp, because
`ROLE_CHANGED` has already overwritten `characterId`.

Note `VOTE_CAST` has no `usedDeadVote` field — whether a vote consumes the dead vote
is a function of state, not a caller assertion, and must be derived.

### 3.7 Derived state

```
players[]  { id, name, seat, characterId, perceivedCharacterId, alignment, alive,
             statusLedger: [{status, sourcePlayerId, appliedAt, expiresAt}],
             claims: [{characterId, day, confidence, retracted}],
             infoHistory: [{night, stepId, chosenAnswer, answerClass}],
             deadVoteSpent, virginTriggered, slayerUsed }
phase        { kind: 'setup'|'night'|'day'|'ended', number }
resolvedStepIds  Set<(stepId, actorId)>   // per night — replaces v1's nightQueue
todaysExecutions [{playerId, characterIdAtDeath, kind}]
nominations[]    // today
victory      { status: 'ongoing'|'good'|'evil', reason }
distribution { townsfolk, outsiders, minions, demons }   // public, §8 of the guide
```

Booleans like `poisoned` are **selectors over `statusLedger`**, not stored flags —
that is what makes §4.4 expressible.

### 3.8 Edition boundary

Trouble Brewing is the only edition built. It must not be the only edition
*possible*. Everything edition-specific lives in one module, and engine code never
names a character:

```
src/editions/troubleBrewing/
  characters.ts    // id, team, ability text, setup modifiers (Baron ±2), capability flags
  nightOrder.ts    // ordered step definitions, first night and other nights
  distribution.ts  // the player-count chart
  registration.ts  // who may register as what (Recluse, Spy)
  victory.ts       // win conditions and their precedence
  resolvers.ts     // the handful of bespoke handlers (Mayor bounce, starpass…)
```

The engine (reducer, night cursor, status ledger, vote math, persistence, Spy Mode)
imports the active edition through one interface and branches on **capabilities**,
never on `characterId === 'monk'`. The check is mechanical and belongs in CI:

```
grep -rE "'(imp|monk|poisoner|butler|recluse|spy|mayor|soldier)'" src/engine/   # must be empty
```

**What this deliberately is not: a general rules DSL.** Trying to express every
character declaratively is how side projects like this die. Bespoke logic is fine —
it lives in the edition module, keyed by character id, behind a stable interface.
The goal is that adding Bad Moon Rising means writing a new folder, not editing the
engine.

| Edition-agnostic by construction | Edition-specific |
|---|---|
| Event envelope, reducer, corrections (§3) | Character list and ability text |
| Perceived-character indirection (§4.1) | Night orders, first and other |
| Ability gating (§4.2) | Distribution chart and setup modifiers |
| Status ledger and expiry (§4.4) | Registration rules |
| Night cursor (§6.1) | Win conditions and precedence |
| Nominations, vote math, thresholds (§7) | Bespoke resolvers |
| Persistence, Spy Mode, Grimoire | |

Note that §4.4's status lifetimes and §4.7's win conditions are written as Trouble
Brewing *instances* of an edition-agnostic mechanism — a lifetime is data on
`STATUS_APPLIED`, and victory is an ordered list of predicates supplied by the
edition. Neither is hardcoded in the engine.

---

## 4. Rules engine — the core predicates

Everything in §§6–7 is built from these five. v1 had none of them, which is the root
cause of most review findings.

### 4.1 Perceived character (the Drunk)

```
perceivedCharacterId(state, playerId) =
  characterId === 'drunk' && drunkBelief.playerId === playerId
    ? drunkBelief.believesCharacterId
    : characterId          // post-ROLE_CHANGED value
```

**v1 bug:** the night queue filtered steps by "character in play". The Drunk's
believed Townsfolk is *by construction not in play*, so the Drunk would never have
been woken for any ability — instantly outing them at the table on night 1, and
directly contradicting guide §13 ("wake the Drunk too and go through the same
motions").

Steps therefore resolve **actors**, not a character:
`wakes: (s) => playersWithPerceivedCharacter(s, 'monk')` — always an array; a real
Empath and a Drunk-believing-Empath both wake, separately, at the same step.

All "learn a character" computations (Undertaker, Ravenkeeper, Investigator,
Librarian) read the **true** `characterId`, never the perceived one — guide §13.

### 4.2 Ability functionality

```
abilityFunctional(state, playerId) = alive && !poisoned(playerId) && !isDrunk(playerId)
```

**v1 bug:** drunk/poison was handled only on the *information* side. Effects were
never gated, so a poisoned Monk really protected, a poisoned Poisoner really
poisoned, and — flatly contrary to guide §11 — a **poisoned Virgin still executed
the nominator**.

Gated: Monk, Poisoner, Soldier, Mayor (both the bounce and the 3-alive win),
Virgin, Slayer, Scarlet Woman, Butler, and every information ability.

**Not gated: registration.** A poisoned Recluse still registers ambiguously —
registration is a passive property, not an ability. This is a classic bug; it gets
its own test.

When an effect is suppressed the step still runs and still emits
`NIGHT_STEP_RESOLVED { effectSuppressed: true }` — the Storyteller must go through
the identical motions at the table.

### 4.3 Registration (Recluse and Spy)

**v1 bug:** the spec promised "the app computes the true answer". With a Recluse or
Spy alive *or dead* there is often no single true answer — it is a Storyteller
ruling, and guide §6 says that ambiguity is load-bearing.

```
legalAnswers  = cross-product over each ambiguous player's registration options
canonicalAnswer = the answer with no registration shenanigans
answerClass   = 'canonical' | 'registration' | 'fabricated'
```

`fabricated` is **only valid when the actor is drunk or poisoned** — the app warns
otherwise. `registration` requires a non-empty `registrationRulings` naming only
Recluses and Spies. This matters because v1's `wasTruthful: false` would have
labelled legal, truthful play as a lie and corrupted the whole log.

Affected: Chef, Empath, Fortune Teller, Washerwoman, Librarian, Investigator,
Undertaker, Ravenkeeper, Virgin (guide §11 — a Spy nominator may register as
Townsfolk), Slayer (a Recluse may register as the Demon and *die*).

A **registration ledger** view shows every ruling made, so the Storyteller can stay
consistent — or knowingly not be.

### 4.4 Status lifetimes

**v1 bug:** clearing was embedded in the actor's own step ("Monk: remove previous
protection…"), and dead actors' steps were filtered out. So a Poisoner executed on
Day 3 left their victim **poisoned for the rest of the game**.

Expiry is declarative and time-driven, never actor-driven:

| Status | Applied | Expires | Source |
|---|---|---|---|
| `poisoned` | night N | end of day N (guide §1: "tonight and tomorrow day") | Poisoner |
| `protected` | night N | dawn of night N | Monk |
| `master` | night N | end of day N | Butler |
| `redHerring` | setup | never | setup |

`STATUS_APPLIED` carries `expiresAt`; the derived selector filters expired statuses
on every `PHASE_ADVANCED`. Independent of whether the source still lives.
`STATUS_CLEARED` survives only as a manual Storyteller override.

### 4.5 Demon kill resolution

v1 specified nothing between "Imp points" and a death. **The Soldier and the Mayor
did not appear anywhere in v1 at all.**

```
resolveDemonKill(state, targetId):
  target is the attacker themself  -> starpass (§4.6)
  protected by a functional Monk   -> outcome 'monk_protected', no death
  target is a functional Soldier   -> outcome 'soldier', no death
  target is a functional Mayor     -> ST prompt: bounce? to whom?
                                      -> 'mayor_bounced', actualVictimId
  otherwise                        -> 'died'
```

Emitted as one `NIGHT_KILL_RESOLVED` transaction. The step UI shows the outcome
("Protected — no death tonight") before advancing, because it determines the dawn
announcement. A Monk-protected Imp that targets itself does **not** starpass.

### 4.6 Demon death — one shared, phase-agnostic handler

**v1 bug:** Scarlet Woman promotion was handled only as a night *notification*.
Its most common trigger is a **daytime execution**, and v1's day phase had no path
that could emit `ROLE_CHANGED` at all. Combined with the missing win check, good
would have been declared the winner the instant the Imp was executed at 5 alive.

Invoked identically from night kill, execution, and Slayer:

```
onDemonDeath(deadDemonId):
  if starpass and a living Minion exists -> ST picks successor
  else if Scarlet Woman alive && abilityFunctional && aliveCountAtDeath >= 5
                                         -> Scarlet Woman becomes Imp
  else                                    -> no successor
  emit DEMON_DIED, then ROLE_CHANGED, then checkVictory()
```

`aliveCountAtDeath` **counts the dying Demon** — confirmed ruling, following TPI:
5 alive including the executed Imp → the Scarlet Woman takes over, leaving 4. Named
test: `scarlet_woman_promotes_at_exactly_five_including_dying_demon`.

### 4.7 Win conditions

**v1 bug:** `GAME_ENDED` existed in the catalogue and *nothing produced it*. Guide
§7: check immediately after every death.

`checkVictory(state)` is pure, invoked after every death-producing transaction, every
`ROLE_CHANGED`, and at day close. **Ordered precedence:**

| # | Winner | Condition | Checked at |
|---|---|---|---|
| 1 | Good | No living player holds the Demon character, *after* successor resolution | every DEATH / ROLE_CHANGED |
| 2 | Evil | Saint died by execution (vote or Virgin) and the Saint's ability was functional | EXECUTION |
| 3 | Evil | `aliveCount === 2` | every DEATH |
| 4 | Good | `aliveCount === 3`, Mayor alive and functional, day closed with no execution | DAY_CLOSED |

Precedence matters: if the Demon's death brings the count to 2, **good wins** (1
before 3). Surfaced as a **blocking modal**, not a toast — the Storyteller must be
told mid-tally, at the table.

---

## 5. Setup

1. **Players.** Names and seating order (load-bearing for Chef and Empath).
   5–15 players. Warn below 7 that Minion/Demon info and bluffs do not apply
   (guide §2).
2. **Deal.** Explicit order, since the Baron is drawn *during* the deal:
   draw Demon → draw Minions → **if Baron drawn, apply +2 Outsiders / −2 Townsfolk**
   → draw Outsiders → draw Townsfolk. Then resolve the 3 demon bluffs (good
   characters not in play), the Drunk's believed Townsfolk (a Townsfolk **not
   otherwise in play**), and the Fortune Teller's red herring (any good player,
   which may legally be the Fortune Teller themselves).
3. **Edit.** Swap any assignment, reroll all, or reroll one slot. Legality
   re-validated on every edit.
4. **Lock in.** Emits `ROLES_ASSIGNED`, including the post-Baron `distribution` —
   which is **public information** (guide §8) and is displayed persistently
   thereafter, because the Storyteller has to read it out to the table.

---

## 6. Night engine

### 6.1 A lazy cursor, not a queue

**v1 bug:** the queue was "rebuilt at the start of each night". Three things make
that impossible: the Ravenkeeper's condition ("died *tonight*") is decided by the
Imp step *later the same night*, so the Ravenkeeper would never have woken; a player
killed at the Imp step would still have been woken for Empath, Fortune Teller and
Butler afterwards; and starpass/Scarlet Woman change `characterId` mid-night.

```
nextStep(state) = first step in NIGHT_ORDER[first|other] where
    step.wakes(state) is non-empty
    && (stepId, actorId) not in resolvedStepIds
```

Re-evaluated after **every** `NIGHT_STEP_RESOLVED`. There is no materialised queue.

### 6.2 Step shape

Declarative wherever possible, so §14 can test conditions independently of UI:

```js
{ id: 'monk',
  wakes: (s) => playersWithPerceivedCharacter(s, 'monk').filter(alive),
  firstNight: false,
  script: { instruction, showCard?: 'this_is_the_demon'|'not_in_play'|'you_are',
            showToken?: 'computed'|characterId,
            output: 'point'|'fingers'|'nod'|'token'|'none' },
  reminderTokens: { add: ['protected'], remove: [] },
  targets: { min:1, max:1, excludeSelf:true, excludeDead:true },
  computeCandidates: (s, targets) => LegalAnswer[],   // pure, render-safe
  effect: { status:'protected', lifetime:'until_dawn' },
  gatedByAbility: true }
```

`stepId` values are **part of the replay contract** — frozen in a versioned constant
list. Rename one and every archived game breaks. `computeCandidates` is pure and
memoisable; default selection among candidates happens **once on step entry**, not
during render (otherwise the Washerwoman decoy reshuffles every frame).

Pseudo-steps in both orders: `dusk_confirm_eyes_closed` (with a skippable ~10s
countdown), `dawn_wait`, `dawn_announce_deaths` (renders the resolved outcome, or
"no one died tonight" — the app is what knows whether the Monk blocked the kill).

### 6.3 First night vs other nights — the explicit diff

| | First night | Other nights |
|---|---|---|
| Minion info / Demon info + 3 bluffs | yes, **7+ players only** | no |
| Washerwoman, Librarian, Investigator, Chef | yes | no (guide §9: one-time) |
| Poisoner | yes, no "remove previous" | yes, remove previous first |
| Monk, Undertaker, Imp, Ravenkeeper, Scarlet Woman | no | conditionally |
| Deaths | none | possible |
| Spy, Empath, Fortune Teller, Butler | yes | yes |

### 6.4 Information

Per §4.3 each info step shows: the canonical answer, the full legal answer set when
a Recluse or Spy is involved, a loud banner if the actor is drunk or poisoned, and
what this player has been told before. Librarian has an explicit **"zero Outsiders
in play"** branch (guide §3 step 7), which is also a legal choice when a Recluse is
in play.

Chef: adjacency is **circular**, and a run of *k* adjacent evil players contributes
*k−1* pairs, not 1. Empath: **alive** neighbours, skipping the dead around the circle.

Minion-info and Demon-info are **group steps** — `actorIds: []`, not a single actor.

---

## 7. Day phase

**Advisory enforcement — the app never blocks a rule break.** Every validation below
warns, records, and lets play continue. At a real table a broken rule that everyone
already acted on *has happened*; an app that refuses the input doesn't undo it, it
just loses the game state and leaves the Storyteller fighting the tool. So an invalid
Butler vote **counts**, a second nomination by the same player **goes through**, a
dead player voting twice **goes through** — each flagged. Every such case emits
`RULE_FLAGGED` alongside the normal event, raises a dismissible banner, and appears
in the log and the post-game summary.

- **Dawn** happens in the night engine (§6.2), not here.
- **Nominations.** Checked: nominator alive, nominee alive, nominator ≠ nominee
  (guide §10: "one *other* living player"), neither has already nominated / been
  nominated today. Derived from today's events — not stored flags. (v1 had two
  fields, `nominatedToday` and `hasNominatedToday`, which is a bug factory.) A failed
  check flags, it does not block.
- **Voting.** Voters presented in **clockwise order from the nominee's left** (the
  app knows the seating). Threshold `ceil(alive / 2)` — verified against guide §10's
  worked examples (8→4, 7→4, 5→3, 4→2).
- **Butler.** Tally is *derived*, not stored, so it survives corrections and
  retroactive validation in either order (guide §10). A drunk or poisoned Butler's
  vote always counts. A dead Butler's dead vote still requires the Master to vote.
  **An invalid Butler vote still counts toward the tally** — the app tells you a rule
  was broken and logs it, and you decide what to do about it at the table. Guide §10
  puts enforcement on the Butler, not the Storyteller, so the app must never silently
  strike a hand that was raised.
- **Dead votes.** Derived from `VOTE_CAST` where the voter was dead at that `seq`.
  A dead player voting with their dead vote already spent is **flagged and allowed**,
  per the advisory rule above — the vote counts and you are told.
- **Execution.** Highest tally that also meets threshold; tie at the top → no
  execution. Once a nomination is the unique highest and meets threshold, that
  player **is** executed — there is no legal "skip" at that point.
- **Virgin.** Fires on the first nomination *ever* against the Virgin, if the
  nominator is a true Townsfolk (a Spy may be ruled Townsfolk — guide §11) and the
  Virgin is functional. The **nominator** dies; the Virgin survives and loses the
  ability either way. Poisoned Virgin: silently nothing. Emits an `EXECUTION` with
  `kind:'virgin'` that bypasses voting, and the day **continues**.
- **Two executions in one day** (Virgin + vote) is therefore possible;
  `todaysExecutions` is a list, and the Undertaker step becomes a Storyteller choice
  when it has more than one entry.
- **Slayer.** *Anyone* may publicly claim Slayer and shoot. `SLAYER_CLAIMED` records
  the claimant, whether they are the real Slayer, whether their ability is
  functional, and whether a Recluse target was ruled to register as the Demon. A
  successful shot routes through §4.6.

---

## 8. Grimoire screen

The screen that is open 80% of the game, and which v1 never specified.

Per player: seat, name, true character, alignment glyph, alive/dead, dead-vote
spent, active status chips (poisoned / protected / Master / red herring /
`Drunk — believes Empath`), latest claim, note count.

Persistent header: night or day number, alive count, current execution threshold,
and the **public T/O/M/D counts** (guide §8).

Tap a player → sheet with notes, claim history, and their full `infoHistory`.

---

## 9. Notes, claims, and the lies ledger

- **Notes.** Per-player and general, free text — where you lied, what a player
  misunderstood, overall read. Never rendered in Spy Mode.
- **Claims.** Structured, not free text, because guide §5 makes claim-tracking an
  explicit Storyteller duty and free text cannot answer *who else claimed Empath?*
  or *is anyone claiming a character that isn't in play?* The Grimoire flags: two
  hard claims on one character, a claim on a character not in play (a bluff — or the
  Drunk), and a claim matching a demon bluff.
- **Info history.** Per player: what you told them, on which night, and its
  `answerClass`. Answers "what did I tell the Empath on night 2?" in two taps.
- **Lies ledger.** Every `answerClass: 'fabricated'` across the game on one screen —
  the Storyteller's most fragile mental state, currently only recoverable by reading
  the raw log.
- **Registration ledger** (§4.3).

---

## 10. Spy Mode

Shows only objective game facts (guide §14), at the fidelity of a **physical
Grimoire**: seating, true characters, current status markers, and the reminder
tokens that physically sit in a Grimoire — the Fortune Teller's **red herring**, the
three **demon bluffs**, and the **Drunk's believed-character** marker. Showing less
than this would be a nerf to the Spy relative to an in-person game.

What Spy Mode never contains: notes, claims, the info history, the lies ledger, the
registration ledger, `answerClass` on any answer, and the event log. That boundary is
the point of the four mechanisms below.

**Structural separation — four mechanisms, because a projection function alone is a
convention, not a structure:**

1. `SpyView` is a **hand-written interface**, not `Omit<GameState, ...>` — `Omit`
   silently admits every field added later; a hand-written type fails to compile
   until you consciously map it.
2. **Canary test:** every note and flag in the fixture contains `"CANARY"`; assert
   `JSON.stringify(toSpyView(state))` does not contain it. Catches transitive leaks
   that a top-level key check would pass.
3. **Module boundary:** `src/spy/**` may not import `src/game/state`, enforced by an
   eslint `no-restricted-imports` rule — a convention becomes a build error.
4. Spy Mode renders in its own route and component tree; no shared player-token
   component with the Grimoire.

**Physical hardening.** v1 offered "a deliberate confirm", which addresses a stray
tap and nothing else — while an adversarial player holds an unlocked browser:

- `mode: 'spy'` is **persisted**. A reload, an iOS tab discard, or a low-memory
  reload must land back *in* Spy Mode, not in the Grimoire. Without this the feature
  is unsound.
- `history.pushState` trap so Back re-pushes the Spy route.
- Return to Spy Mode on `visibilitychange` / `blur`, so an app switch or a
  notification tap doesn't expose the Grimoire.
- **Hold-to-exit:** press and hold for 2 seconds to leave Spy Mode. Chosen over a
  PIN deliberately — a PIN would be typed every night, in the dark, while people
  watch, and the friction would cost more than it buys.
- `SPY_VIEWED` / `SPY_VIEW_ENDED` bracket the session so the log shows duration.
- A web app cannot fully close this — a determined player holding an unlocked
  browser has options no page can revoke. The four mechanisms above cover the
  realistic cases (stray tap, reload, Back, app switch); OS-level screen pinning
  remains available to the Storyteller if a given table warrants it.

---

## 11. Live-conditions safety (outside Spy Mode)

Three hours at a table where everyone wants to see the screen, and a phone is
readable at two metres in a way a face-down Grimoire is not.

- **Panic blank:** two-finger tap, or a volume-key `keydown`, instantly renders a
  neutral "Night 3 — in progress" card. Tap-and-hold 300ms to restore.
- **Auto-blank** after 45s of inactivity in any private view.
- **Optional redacted Grimoire:** characters as first-letter chips, expanded on hold.
- Alignment is **never** colour-only — a red-tinted row reads across a table. Use a
  glyph.
- Role text at a deliberately small size; one row expanded at a time.

---

## 12. Persistence

`localStorage`, single active game. Every event appends and autosaves.
~400 events × ~200 bytes ≈ 80KB per game, so capacity is not the risk — **failure
handling is**, and v1 had none.

1. `try/catch` every write, with a persistent red **"NOT SAVING"** banner on
   failure. Without this, quota-exceeded or private-browsing failure is silent, and
   the Storyteller finds out 90 minutes later.
2. **Ring buffer of 3 saves** under rotating keys; on boot, if the primary won't
   parse, offer recovery from the previous.
3. **Second-tab guard** via `BroadcastChannel`; a stale tab goes read-only with a
   banner rather than clobbering.
4. **`schemaVersion`** on the stored blob and every export, with a load-time
   migration-or-refuse path.
5. **Mid-night resume:** the cursor is derived from events (§6.1), so a reload lands
   on the exact unresolved step. In-progress target selection is held in a small
   scratch object persisted on every tap. On boot: *"Game in progress — Night 3, step
   4/9 (Imp). Resume / Export / Discard."*
6. **Auto-export prompt at each dawn** — a dead battery is the realistic total-loss
   scenario, and manual export is never remembered mid-game.
7. Post-game summary screen (final roles, deaths, every lie, claims vs truth) —
   generated from the event log. **No multi-game archive**: it drives the quota risk
   and a Storyteller does not reread old games. Export covers it.

---

## 13. Responsive & accessibility

Dark theme only (a white screen in a dim room lights up the Storyteller's face and
is readable across the table). Touch targets ≥44×44px with ≥8px separation.
Destructive or irreversible actions (lock in roles, execute, end game, exit Spy
Mode) never adjacent to frequent ones (next step, select target). Primary night
controls in the bottom third for one-handed thumb reach. Body ≥16px, step
instruction ≥20px. `navigator.wakeLock` held for the night phase, with a documented
fallback. Breakpoints 480 / 768 / 1024; desktop shows Grimoire and current step side
by side. Portrait-primary on mobile.

---

## 14. Testing

**Coverage goal: every character, every state.** Each character in the edition gets
its own test file asserting behaviour across the full matrix — in play / not in play,
alive / dead, ability functional / poisoned / drunk, and every registration
interaction it participates in. A character with no test file fails CI. This is the
part of the suite that grows when a new edition is added, and it is the reason the
edition boundary (§3.8) exists.

**Tier 1 — reducer and rules (Vitest).** Distribution legality per player count;
Baron adjustment and draw order; **win conditions ×4 plus precedence**; Drunk wakes
on their believed character's step; a real Empath and a Drunk-believing-Empath both
wake at the same step; ability gating (poisoned Monk does not protect, poisoned
Virgin does not fire, **poisoned Recluse still registers ambiguously**); status
expiry after the source dies; Ravenkeeper wakes only if killed *this* night and not
if the Monk blocked it; a player killed at the Imp step is not woken for Empath;
starpass with and without a living Minion; Scarlet Woman promotion via daytime
execution; Chef circular adjacency and *k−1* runs; Empath dead-neighbour skipping;
threshold at every alive count; Butler retroactive validation; two executions in one
day; determinism (double-reduce and JSON round-trip); `Math.random`/`Date.now`
stubbed to throw; advisory enforcement (an invalid Butler vote counts and emits
`RULE_FLAGGED`; a spent dead vote counts and flags; a double nomination flags);
engine purity (the `grep` gate in §3.8 returns nothing).

**Tier 2 — persistence.** Serialize → reload → replay is byte-identical; unknown
future event type does not crash; schema mismatch handled; transactional undo drops
a whole `txId`; edit-and-replay recomputes downstream correctly.

**Tier 3 — E2E (Playwright).** Full 8-player game happy path. Spy Mode → refresh →
still in Spy Mode. Spy Mode → back button → still in Spy Mode. Kill the tab
mid-night-step → resume lands on the same step. Undo a mistapped Poisoner target and
confirm the log shows the correction. The canary test for `toSpyView`.

The reducer is the part *least* likely to fail — it is pure and easy. The UI is
where a tired Storyteller loses a game, which is why Tier 3 exists.

---

## 15. Delivery slices

**Slice 1 — usable alone at a real table.** Players → deal → Grimoire → night engine
(both orders, all info, statuses, deaths, §4 predicates) → transactional undo →
persistence with failure banner → **minimal Spy Mode**.

Spy Mode belongs in Slice 1 counterintuitively: at that point there are no notes and
no lies ledger, so the Spy view is *approximately* the Grimoire view and is nearly
free — and building it now forces the module boundary and the `SpyView` type into
existence **before** the private data it must exclude exists. Retrofitting a security
boundary onto a component tree that wasn't designed for one is how this feature
ships broken.

The day phase is *not* in Slice 1: nominations and votes are the part a Storyteller
can genuinely do on paper (guide §5 suggests exactly that), it carries the fiddliest
rule surface, and it is the least cognitively loaded part of running the game. The
night is where the hidden arithmetic happens under pressure.

The edition boundary (§3.8) is established in Slice 1, not retrofitted — it costs
almost nothing while the first edition is being written and is expensive to impose
afterwards, which is exactly the shape of the Spy Mode argument above.

**Slice 2 —** day phase (nominations, votes, thresholds, execution, Virgin, Slayer)
plus win-condition checking.

**Slice 3 —** notes, claims, timeline, lies and registration ledgers, export,
post-game summary.

---

## 16. Rulings the engine hardcodes

Every one of these is a judgment call with a defensible alternative. They are
recorded here so the implementation has a single source of truth and the tests have
something to assert against.

1. **Scarlet Woman alive count** — the dying Demon **counts** toward the 5 (§4.6).
2. **Spy Mode fidelity** — physical-Grimoire fidelity: red herring, demon bluffs and
   the Drunk's believed character are **shown**; notes and analysis never are (§10).
3. **Butler enforcement** — an invalid Butler vote **counts**; the app notifies you
   that a rule was broken and logs it. It never auto-strikes a raised hand. This is
   an instance of the general advisory-enforcement rule (§7).
4. **Spy Mode exit** — hold-to-exit for 2 seconds, no PIN (§10).
5. **Two executions in one day** — the day continues after a Virgin trigger, and the
   Storyteller **chooses** which execution the Undertaker learns (§7).
6. **Registration consistency** — the app **flags** an inconsistency
   ("you registered the Recluse as evil to the Empath on night 2") but never blocks
   it. You are allowed to be inconsistent; you should just know that you are (§4.3).
7. **Mayor bounce** — the bounce victim must be alive and must not be the Mayor or
   the attacking Demon. Protection and Soldier are **re-checked on the bounce
   target**, so a bounce onto a protected player kills no one (§4.5).

## 17. Change log from v1

Fixed: Drunk never waking (§4.1); no win-condition engine (§4.7); night queue built
too early (§6.1); "the app computes the true answer" (§4.3); non-transactional undo
(§3.2, §3.4); status expiry tied to a living source (§4.4); Soldier and Mayor absent
entirely (§4.5); Scarlet Woman with no daytime path (§4.6); ability effects not gated
by poison/drunk (§4.2); no event envelope or timestamps (§3.2); `DEATH.cause:'virgin'`
breaking the Saint check (§3.6); no `characterIdAtDeath` for the Undertaker (§3.6);
claims as free text (§9); Grimoire screen unspecified (§8); no mid-game corrections or
player add/remove (§3.4, §3.6); localStorage failure modes (§12); Spy Mode defeated by
refresh and Back (§10); no shoulder-surfing defence (§11); responsive requirement
unspecified (§13); testing limited to the reducer (§14); single undifferentiated
delivery (§15).

## 18. Out of scope

Custom scripts, Travellers, Fabled, multiplayer or networked play, accounts,
multi-game archive. **No** live Spy link on a second device — same-device only.
Consequence of no backend: a dead battery can lose the game, mitigated by §12's dawn
auto-export prompt, not eliminated.

**Other editions are out of scope to *build*, not to *accommodate*.** No Bad Moon
Rising or Sects & Violets content ships in this version, and no engine work is done
speculatively on their behalf. What is in scope is the boundary in §3.8 that keeps
them cheap to add later.
