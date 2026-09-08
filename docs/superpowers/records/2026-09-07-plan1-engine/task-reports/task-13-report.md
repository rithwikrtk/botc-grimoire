# Task 13 report — the command layer (store, transactions, commit-time victory, undo)

## What was implemented

Two new files, exactly as scoped:

- `src/engine/commands/store.ts` — `createStore`, `Store`, `Tx`, `TransactionOptions`, `TransactionResult`.
- `src/engine/commands/store.test.ts` — the transcribed test suite (with two fixture fixes, see Defects below).

Transcribed the brief's `store.ts` verbatim (no production-code changes). It:

- Wraps one Storyteller action in one `txId`. `Tx.emit` stamps `{ seq, txId, ts, type, payload }` and folds the event incrementally onto a `stagedState` via `applyMany`; nothing touches the committed `events`/`state` until the transaction body returns normally.
- On throw, the `catch` block only decrements `txCounter` (so the next mint doesn't skip a number) and rethrows — `events` and `state` are never reassigned, so nothing was appended and nothing was folded into the live state.
- Runs `checkVictory` exactly once, after the body returns, against `toRulesView(stagedState)` — never per event, never inside `applyEvent`. If victory flips, `GAME_ENDED` is appended in the **same** transaction (same `txId`) before commit, so undoing the transaction that ends the game undoes the win with it.
- `notify()` fires once per transaction (after commit), not once per `emit`.
- `undo()` finds the last txId whose events are *all* outside `NON_UNDOABLE_EVENT_TYPES` (walking backwards a transaction at a time so `SPY_VIEWED`/`SPY_VIEW_ENDED` transactions are skipped rather than blocking undo entirely), filters out every event sharing that txId, renumbers `seq` as the new array index, and does a **full replay** (`reduce`) to rebuild state — the one place outside boot where a full replay is correct per §3.5.
- `lastTransactionLabel()` returns the in-memory label when present, and falls back to the first event's `type` in that txId after a reload, since labels are explicitly not persisted (Plan 3 replays from events alone).
- `highestTxNumber` scans the log for the highest numeric suffix already used (not a distinct-count), so a reload after an undo (which leaves a gap, e.g. tx1, tx2, tx4 with tx3 gone) can't remint a txId that's already retired.

The clock is injected (`clock: () => number = () => Date.now()`) and called only from `append`, inside the command layer — never inside `applyEvent` or anything it calls. `store.ts` lives outside `src/engine/reducer/**`, so it is not covered by the `reducer-purity` Vitest project that stubs `Date`/`Math.random`/`performance`/`crypto` to throw, and the file makes no `perceivedCharacterId` import (that boundary is untouched — the store never reads it).

## Defects found in the brief (test fixture, not production code)

Two of the twenty transcribed tests in `store.test.ts` **could not pass as written**, independent of the store implementation. Both are fixture bugs in the brief's own code block, caught by actually running the domain logic rather than just reading it. (Correction: the original version of this report miscounted the transcribed suite as fourteen tests; it is twenty.)

**1. `'passes dayClosed so the Mayor row is only reachable at day close'`** (originally: kills `p3`, `p5`, `p6` out of 7 seated players). The test's own comment claims "Three alive (p1 Imp, p2 Scarlet Woman, p7 Mayor)", but killing 3 of 7 leaves **4** alive (p1, p2, p4-Chef, p7) — I confirmed this by instrumenting the store and printing `getState().players.filter(p => p.alive)`. `mayor_no_execution` (`src/editions/troubleBrewing/victory.ts`) requires `aliveCount(view) === 3` exactly, so this transaction could never reach the win the test asserts, regardless of whether `dayClosed` plumbing is correct — the test was hollow in the "always red without the fix, or right for the wrong reason" sense until fixed. **Fix**: added `p4` to the death list so the fixture actually reaches 3 alive as its own comment describes. Verified: with the fix, the test passes for the right reason (see mutation-testing note below).

**2. `'drops every event sharing the last txId'`**, final assertion: `expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toEqual([])`. `p4` is the fixture's red herring (`redHerring: 'p4'` in the seeded `ROLES_ASSIGNED`), so `p4.statusLedger` always contains a `redHerring` entry from the very first transaction, untouched by undoing the later Monk transaction — the ledger can never be `[]` for this player under any correct implementation. **Fix**: changed the assertion to check that the `protected` status specifically is gone (`statusLedger.map(s => s.status)` equals `['redHerring']`), which is what the test is actually trying to pin — that `STATUS_APPLIED`'s effect was undone.

Both fixes preserve the property each test is meant to pin; neither weakens what the test checks. No production code (`store.ts`) was touched to work around either defect — both were pure fixture errors in the test file I own.

I did not find further defects in the eleven other transcribed tests, the interfaces, or the store's control flow; typecheck and lint were clean with zero warnings on the first pass after the two fixture fixes.

## How the three load-bearing properties are pinned (with mutation evidence)

For each, I made the single-line production change the brief warns about, confirmed the named test (and only that test, or that test among others) reddens, then restored the original file (`diff` confirmed byte-identical afterward).

**Atomicity** — `'discards the whole transaction when the body throws'` (`store.test.ts`). Mutated the `catch` block in `transaction()` to commit staged events before rethrowing:
```ts
catch (error) {
  events = [...events, ...staged];   // <- injected
  state = stagedState;               // <- injected
  throw error;
}
```
Result: this test alone reddened — `expected [ Array(7) ] to have a length of 6 but got 7` (asserts event count, not just "an error was thrown"). Reverted; suite green again.

**Commit-time victory, exactly once** — `'checks victory exactly once per transaction'` (`store.test.ts`), which uses `onVictoryCheck` as a call-counting spy rather than asserting the final `Victory` value (the brief's own stated reason: both orderings often agree on the *final* value). Mutated `transaction()` to call `options.onVictoryCheck?.(victory)` a second time after appending `GAME_ENDED`. Result: this test alone reddened — `expected 2 to be 1`. Reverted.

**Multi-event undo** — `'drops every event sharing the last txId'` (`store.test.ts`), a two-event transaction (`NIGHT_STEP_RESOLVED` + `STATUS_APPLIED`) whose assertions check *both* `settledStepIds.size === 0` (set by the first event) and the status ledger (set by the second/last event) — a single-event transaction could not distinguish "dropped the whole txId" from "dropped only the last event." Mutated `undo()`'s `kept` computation from `events.filter(e => e.txId !== txId)` to `events.slice(0, -1)` (drop only the physically-last event). Result: three tests reddened, including this one (plus two others that depend on full-transaction undo: `'undoes the win along with the death that caused it'` and `'never drops the Spy audit trail'`), confirming the property is pinned from multiple angles, not just coincidentally. Reverted.

All three mutations were reverted and `diff` against the pre-mutation file showed no drift; the final committed `store.ts` is the brief's code verbatim.

## Test evidence

Baseline before this task: 323 passing across 22 files (confirmed by running `npm test` before writing any new files).

```
$ npx vitest run src/engine/commands
 ✓ |app| src/engine/commands/store.test.ts (20 tests)
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

```
$ npm test
...
 Test Files  23 passed (23)
      Tests  343 passed (343)
```

```
$ npm run typecheck
> tsc --noEmit
(clean, no output)
```

```
$ npm run lint
> eslint .
(clean, no output)
```

New total: **343 passing across 23 files** (323 + 20 new, one new file). All three commands' output is clean with no warnings.

## What I judged rather than transcribed

- The two test-fixture fixes above (dead-list for the Mayor test; the `p4` red-herring status-ledger assertion). Both are scoped to `store.test.ts`, which is one of my two owned files, and both preserve rather than weaken the property under test.
- No changes were made to `store.ts` beyond the brief's code as written — it typechecked, linted clean, and passed every test (once the two fixture bugs above were fixed) with no defects found in the implementation itself.
- I did not touch any file outside `src/engine/commands/`.

## Commit

One commit, `src/engine/commands/store.ts` and `src/engine/commands/store.test.ts` only, message per the brief's template plus the required co-author trailer, authored with `user.email=rithwik@trypencil.com`. Not pushed.

## Fix round 1

Review came back with five Important findings — four unguarded seams on the single write path, plus a hollow "counts once" test — and a batch of cheap minors. All addressed in the same two files. Suite grew from 343/23 to **349/23** (six new tests: re-entrancy, retained-`Tx` emit, async body, `flag()`, `view()`, and a fault-injection test for FIX 3).

### FIX 1 — re-entrant `transaction()` guard

Added `inTransaction`/`inTransactionLabel` closure state, checked and thrown on at the top of `transaction()`, set for the duration of `body(tx)`, and reset in a `finally`. A nested `store.transaction(...)` call — from a command body or a triggered subscriber — now throws immediately instead of growing `events` out from under the outer transaction's `seq` math and getting silently discarded when the outer commits over it.

New test: `'throws on a re-entrant transaction call rather than corrupting the log (§3.2)'`. Also asserts the store still works normally afterward (the guard doesn't wedge open) and that nothing committed from either transaction.

**Mutation evidence.** Removed the `if (inTransaction) throw` block entirely, leaving `const txId = ...` as the first statement.
```
FAIL transactions (§3.2) > throws on a re-entrant transaction call rather than corrupting the log (§3.2)
AssertionError: expected [Function] to throw an error
- Expected: null
+ Received: undefined
```
Restored; `diff` against the pre-mutation file confirmed byte-identical; full `src/engine/commands` suite green again (25/25 at that point, before FIX 3's extra test was added).

### FIX 2 — `Tx` lifetime: a `sealed` flag, and rejecting a thenable body return

Two independent mechanisms, both required:

- A `sealed` boolean, local to each `transaction()` call, set to `true` in the `finally` immediately after `body(tx)` returns or throws. `emit` and `flag` both route through a `guardedAppend` that throws `Tx used after transaction(...) already ended` when `sealed`. This catches a caller that retains `tx` and calls `tx.emit` after the transaction has committed.
- A synchronous check, `isThenable(result)` on `body`'s return value, run right after the try/catch/finally. `body`'s declared type is `(tx: Tx) => void`, but TypeScript's void-return special case also accepts an `async` function there, and this repo's ESLint (`tseslint.configs.recommended`, not type-checked) has no `no-misused-promises` to flag it. An async body returns a pending Promise the instant it reaches its first `await`, having already run everything before that point synchronously — so without this check, `transaction()` would silently commit a *truncated* action (everything staged before the first `await`, nothing after, no error). The check throws instead, discarding the whole thing (consistent with the throw-path: `txCounter` is rolled back too). Because `sealed` is already `true` by this point, if the async body's continuation resumes later and calls `tx.emit` again, that throws too rather than silently mutating an abandoned local array.

New tests: `'throws if a caller retains Tx and emits after the transaction has ended'` and `'rejects an async transaction body rather than silently committing a truncated action'`. The async test's second `tx.emit` (in the resumed continuation, after the awaited microtask) is wrapped in its own try/catch inside the async IIFE and asserted on after `await`ing the retained promise — this avoids leaking an unhandled promise rejection into the test run while still proving the seal catches the late emit.

**Mutation evidence, both halves.**

Half 1 (seal): removed the `if (sealed) throw` from `guardedAppend`, leaving only `append(type, payload)`.
```
FAIL transactions (§3.2) > throws if a caller retains Tx and emits after the transaction has ended
AssertionError: expected [Function] to throw an error
```
Also reddened the async test's second assertion (`secondEmitError` stayed `null` instead of becoming an `Error`), confirming both tests depend on the same guard. Restored; `diff` clean; suite green.

Half 2 (thenable rejection): removed the `if (isThenable(result))` block (replaced with a no-op `void isThenable;` to keep the import used), leaving `sealed` intact.
```
FAIL transactions (§3.2) > rejects an async transaction body rather than silently committing a truncated action
AssertionError: expected [Function] to throw an error
```
i.e., `transaction()` no longer throws synchronously for the async body — it would have gone on to silently commit the pre-`await` events. Restored; `diff` clean; suite green.

### FIX 3 — `undo()`: replay before assignment

Reordered `undo()` to compute `const nextState = reduce(kept)` **before** touching `events`/`state`, then assign both together only after the replay succeeds. If `reduce` ever throws mid-undo, `events` and `state` are now left exactly as they were — no window where `getEvents()` reflects the truncated log while `getState()` still reflects the old one.

**On reachability.** I verified the reviewer's own finding by tracing it structurally rather than taking it on faith: `NON_UNDOABLE_EVENT_TYPES` is exactly `{SPY_VIEWED, SPY_VIEW_ENDED}`, and both are literal no-ops in `applyEvent` (`return state;`, no branch that can throw). `undo()` only ever removes the most recent *undoable* txId, and anything retained **after** the removed txId in the log can, by construction, only be one of those two no-op-effect transactions (that's the only thing `lastUndoableTxId` walks past). So the truncated log `undo()` ever produces is always either (a) a strict prefix of a previously-valid sequence (when the removed txId was the literal tail — trivially still valid, since each earlier event was already validated against the state that existed when the full sequence was first built), or (b) that same prefix plus trailing no-ops. Neither can trigger any of `applyEvent`'s four throw sites. So today, this ordering bug is real but **provably unreachable** through the store's public API — matching what the review reported trying and failing to construct.

Rather than leave FIX 3 with zero regression coverage on the theory that "it can't happen," I added a fault-injection test using `vi.spyOn` on the `reduce` export of `@/engine/reducer/fold`, forcing a synthetic throw during `undo()`'s replay and asserting `getEvents()`/`getState()` are the exact same object references as before the failed undo (§3.5-style referential-identity assertion, not just a value comparison). This is honestly documented in the test as fault injection, not a naturally-occurring domain scenario, and gives the ordering property permanent coverage against a future change to `NON_UNDOABLE_EVENT_TYPES` or `applyEvent` that could make the scenario reachable.

**Mutation evidence.** Reverted the reorder to the original bug (`events = kept; state = reduce(events);`).
```
FAIL undo (§3.4) > leaves getEvents()/getState() in agreement if the post-undo replay throws
AssertionError: expected [ Array(6) ] to be [ Array(7) ] // Object.is equality
```
i.e., `getEvents()` had already advanced to the truncated (6-event) array by the time `reduce` threw, while `getState()` still held the old (7-event) state — the exact permanent disagreement FIX 3 prevents. Restored; `diff` clean; suite green.

### FIX 4 — coverage for `flag()` and `view()`

Added `'flags a rule break in the same transaction as the action, without aborting it (§4.8)'`: emits an action event plus `tx.flag(...)`, asserts both events share one `txId`, that `RULE_FLAGGED` carries the given `rule`/`class`/`detail`, and that the transaction still committed (`ruleFlags` has one entry) — proving `flag` cannot abort the action it describes, per §4.8.

Added `'view() narrows to a RulesView reflecting only what has been staged so far'`: reads `tx.view()` before and after a `DEATH` emitted mid-transaction, confirming it reflects the in-progress `stagedState`, and spot-checks that `stPrivate` (a `GameState`-only field) is absent from the returned `RulesView`, per §10.2's field-by-field narrowing.

### FIX 5 — seq-renumber pinning, and a defect in the suggested test location

The review asked for the index-equality assertion to be added "after the undo in `'drops every event sharing the last txId'`". I added it there, then verified it against the mutation (`kept = events.filter(...)` with no `.map` renumber) and found **it does not redden** — because that test's undo always removes the tail-most transaction (the Monk step is the last thing committed before the undo), and removing a tail never creates a gap: the surviving events already have `seq === index` from when they were originally appended, whether or not the renumber runs. This is exactly the "test that cannot fail" pattern the task asks to hunt for, so rather than leave it as the review specified, I moved the load-bearing assertion to `'never drops the Spy audit trail'`, whose undo removes a **non-tail** txId (the `NOTE_ADDED` transaction, with `SPY_VIEWED`/`SPY_VIEW_ENDED` surviving after it) — the one case where a gap is actually possible. I left the original assertion in place too (it's true, just not load-bearing there) with a comment explaining why, pointing at the test that does pin it.

**Mutation evidence**, confirming the corrected placement. Removed the `.map((event, index) => ({ ...event, seq: index }))`, leaving `const kept = events.filter((e) => e.txId !== txId);`.
```
FAIL undo (§3.4) > never drops the Spy audit trail
AssertionError: expected [ +0, 1, 2, 3, 4, 5, 7, 8 ] to deeply equal [ +0, 1, 2, 3, 4, 5, 6, 7 ]
```
i.e., the surviving `SPY_VIEWED`/`SPY_VIEW_ENDED` events kept their pre-undo `seq` values (7, 8) instead of being renumbered to their new positions (6, 7). Confirmed the *originally-suggested* location (`'drops every event sharing the last txId'`) stays green under this same mutation, for the reason above. Restored; `diff` clean; full suite green (26/26 in `src/engine/commands`).

### Cheap minors, all applied

- `checkVictory`'s "exactly once" test now spies on `victoryModule.checkVictory` directly (via `vi.spyOn`) instead of counting `onVictoryCheck` calls, which fire once by construction regardless of where `checkVictory` is invoked from. The `onVictoryCheck` seam itself is untouched (left per "leave alone" — Tasks 14–18 may thread options through it).
- Deleted the dead `victory.reason !== null` clause. In its place, a loud, documented invariant check: `if (victory.reason === null) throw ...` before appending `GAME_ENDED` when `victory.status !== 'ongoing'`. Since every `VICTORY_PREDICATE` in `troubleBrewing/victory.ts` carries a non-null reason, this can only fire on a broken predicate — and now it fails loudly instead of silently leaving `state.victory` stuck at `ongoing` forever while the local `victory` disagrees.
- `if (label)` → `if (label !== undefined)` in `lastTransactionLabel()`, so a transaction labeled `''` returns that label rather than falling through to a derived caption.
- A transaction that stages nothing (empty body, or victory check that didn't fire) no longer calls `notify()`, sets a `labels` entry, or holds onto its minted `txId` — `txCounter` is given back, matching the throw path.
- `notify()` now isolates listener errors: every listener runs regardless of an earlier one throwing, and only the first caught error (if any) is re-thrown after all listeners have had their turn — so a throwing subscriber can no longer stop the rest from being notified, and a caller catching that error can't mistake it for the commit having rolled back (it didn't; commit already happened before `notify()` was called).
- `highestTxNumber` now throws `Unparseable txId in event log: "..."` instead of silently treating an unparseable txId as `0`, which would have let the next mint collide with an id already in use in a foreign or corrupted log.
- Dropped the redundant `events.length > 0 ? reduce(events) : initialState()` ternary in favor of plain `reduce(events)` (`reduce([])` already equals `initialState()`), and removed the now-unused `initialState` import.

### Two things left alone, as instructed

- `onVictoryCheck` remains on the production `TransactionOptions` surface (brief-mandated test seam; flagged for the final review, not removed now).
- `undo()` still has no floor — it will undo `GAME_CREATED`, and the Spy skip-past can strip history from around a retained `SPY_VIEWED`. Left as-is per the brief; the alternative (one Spy view permanently disabling undo) is worse.

### Verification

```
$ npx vitest run src/engine/commands
 ✓ |app| src/engine/commands/store.test.ts (26 tests)
 Test Files  1 passed (1)
      Tests  26 passed (26)
```
```
$ npm test
 Test Files  23 passed (23)
      Tests  349 passed (349)
```
```
$ npm run typecheck
> tsc --noEmit
(clean)
```
```
$ npm run lint
> eslint .
(clean)
```

Grep-verified after the final restore that every fix is present in `store.ts` (re-entrancy guard, `sealed`/`isThenable`, `nextState` computed before assignment in `undo()`, the seq renumber, the dead-clause replacement, `label !== undefined`, the empty-transaction skip, `notify()`'s per-listener isolation, and the `highestTxNumber` throw) and that `store.test.ts` carries all six new tests plus the corrected FIX-5 assertion placement.
