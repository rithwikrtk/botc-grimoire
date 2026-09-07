import { NON_UNDOABLE_EVENT_TYPES, type EventType, type GameEvent, type GameEventPayloads } from '../events';
import { applyMany, reduce } from '../reducer/fold';
import { toRulesView } from '../selectors/rulesView';
import { checkVictory } from '../selectors/victory';
import type { GameState, RuleFlagClass, RulesView, TxId, Victory } from '../types';

/**
 * Events that record an outcome §4.7 decides victory on. None of them may share
 * a transaction with a PHASE_ADVANCED — see the check in `transaction`.
 */
const PHASE_INCOMPATIBLE_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'DEATH',
  'EXECUTION',
  'DEMON_DIED',
  'ROLE_CHANGED',
]);

export interface Tx {
  emit<T extends EventType>(type: T, payload: GameEventPayloads[T]): void;
  /** The state including everything emitted so far in this transaction. */
  state(): GameState;
  view(): RulesView;
  /** §4.8 — records a rule break in the same transaction as the action itself. */
  flag(rule: string, ruleClass: RuleFlagClass, detail: string): void;
}

export interface TransactionOptions {
  /** §4.7 row 4 is only reachable in the transaction that closes the day. */
  dayClosed?: boolean;
}

export interface TransactionResult {
  txId: TxId;
  events: GameEvent[];
  victory: Victory;
}

export interface Store {
  getState(): GameState;
  getEvents(): readonly GameEvent[];
  subscribe(listener: () => void): () => void;
  transaction(label: string, body: (tx: Tx) => void, options?: TransactionOptions): TransactionResult;
  undo(): boolean;
  canUndo(): boolean;
  /** Caption for the undo control. Derived from event types after a reload. */
  lastTransactionLabel(): string | null;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * The command layer. Every draw and every Storyteller choice is resolved HERE and
 * frozen onto the event as literal data, so the reducer stays pure (§3.3).
 */
export function createStore(
  seedEvents: readonly GameEvent[] = [],
  clock: () => number = () => Date.now(),
): Store {
  let events: GameEvent[] = [...seedEvents];
  // §3.5 — fold incrementally, cached; full replay only on undo and on boot.
  // `reduce([])` already equals `initialState()` (an empty replay is just the
  // seed), so there is no separate empty-log branch to keep in sync with it.
  let state: GameState = reduce(events);
  let txCounter = highestTxNumber(events);
  const labels = new Map<TxId, string>();
  const listeners = new Set<() => void>();

  // §3.2 — one Storyteller action is one transaction. Guards against a command
  // body (or a subscriber it triggers) calling transaction() again while this
  // one is still open: an inner commit would grow `events` out from under the
  // outer transaction's `seq` math, `state = stagedState` at the outer's commit
  // would silently discard the inner transaction's state change entirely, and a
  // throw afterwards would hand the next mint the very txId the inner
  // transaction already committed — reintroducing the collision
  // `highestTxNumber`'s docstring exists to prevent. This is not a limitation
  // layered on top of §3.2; nesting is already semantically undefined by it, so
  // throwing is the correct behaviour, not a restriction.
  let inTransaction = false;
  let inTransactionLabel: string | null = null;

  function notify(): void {
    // Isolate each listener: one throwing subscriber must not stop the rest
    // from being notified. This always runs strictly after commit, so a caller
    // catching an error out of here must not be able to mistake it for the
    // transaction having rolled back — it didn't; only the first error seen (if
    // any), once every listener has had its turn, is re-thrown.
    let caught: unknown;
    let hasCaught = false;
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        if (!hasCaught) {
          hasCaught = true;
          caught = error;
        }
      }
    }
    if (hasCaught) throw caught;
  }

  function transaction(
    label: string,
    body: (tx: Tx) => void,
    options: TransactionOptions = {},
  ): TransactionResult {
    if (inTransaction) {
      throw new Error(
        `transaction('${label}') called while transaction('${inTransactionLabel}') is still open — ` +
          'nesting is unsupported: §3.2 defines one Storyteller action as one transaction.',
      );
    }

    const txId = `tx${++txCounter}`;
    const staged: GameEvent[] = [];
    let stagedState = state;
    // Sealed the instant the transaction body has returned or thrown (see the
    // `finally` below). Without this, a caller that retains `tx` past its
    // transaction — or an async body that keeps running past its first
    // `await` — can push events onto an abandoned local array with no error at
    // all, silently vanishing them.
    let sealed = false;

    const append = <T extends EventType>(type: T, payload: GameEventPayloads[T]): void => {
      const event = {
        seq: events.length + staged.length,
        txId,
        ts: clock(),
        type,
        payload,
      } as GameEvent;
      staged.push(event);
      stagedState = applyMany(stagedState, [event]);
    };

    const guardedAppend = <T extends EventType>(type: T, payload: GameEventPayloads[T]): void => {
      if (sealed) {
        throw new Error(
          `Tx used after transaction('${label}') already ended — a Tx is only valid for the ` +
            'synchronous lifetime of its transaction body (§3.2).',
        );
      }
      append(type, payload);
    };

    const tx: Tx = {
      emit: guardedAppend,
      state: () => stagedState,
      view: () => toRulesView(stagedState),
      flag: (rule, ruleClass, detail) =>
        guardedAppend('RULE_FLAGGED', { rule, relatedTxId: txId, class: ruleClass, detail }),
    };

    inTransaction = true;
    inTransactionLabel = label;
    let result: unknown;
    try {
      result = body(tx);
    } catch (error) {
      // Nothing was committed: `events` and `state` were never reassigned.
      txCounter -= 1;
      throw error;
    } finally {
      inTransaction = false;
      inTransactionLabel = null;
      sealed = true;
    }

    // `body`'s declared type is `(tx: Tx) => void`, but TypeScript's void-return
    // special case also accepts an async function there, and this repo's
    // (untyped) ESLint config has no `no-misused-promises` to catch it. An
    // async body returns a pending Promise the instant it reaches its first
    // `await`, having already run everything before that point synchronously —
    // so treating that return as an ordinary commit would silently commit a
    // TRUNCATED transaction: everything emitted before the first `await`, and
    // nothing after it, with no error at all. Reject it instead; `sealed` above
    // is already set, so if the async body resumes later and tries to emit
    // more, that throws too rather than mutating an abandoned local array.
    if (isThenable(result)) {
      txCounter -= 1;
      throw new Error(
        `transaction('${label}') body returned a Promise — an async transaction body silently ` +
          "commits only what it emitted before its first `await` (§3.2's transaction is one " +
          'synchronous action). Resolve any promises before calling transaction(), not inside it.',
      );
    }

    // §4.7 — the invariant victory.ts's row 2 is scoped against, enforced here
    // rather than promised in a comment.
    //
    // Row 2 (a Saint executed) only fires when the death's phase equals the
    // view's phase, and that scoping is safe ONLY because no command advances
    // the phase in the same transaction as an execution — the whole reason
    // closeDay and beginNight are separate commands. Nothing checked it: the
    // barrel exports `createStore` and `Store.transaction`, so Plan 2 could
    // compose a transaction emitting both a DEATH { cause: 'execution' } and a
    // PHASE_ADVANCED, row 2 would silently never fire, and no test in the tree
    // would go red. `closeDay` proved the cost — moving its PHASE_ADVANCED
    // inside its own transaction reddens 8 tests, but that is one command's
    // coverage, not a guarantee over the command layer.
    //
    // Legitimate flows are unaffected: `beginNight` and `advanceToDay` advance
    // the phase in their OWN transactions, which stage nothing else, and a
    // DAY_CLOSED alongside a PHASE_ADVANCED is fine — DAY_CLOSED is not a
    // victory-relevant outcome.
    if (staged.some((e) => e.type === 'PHASE_ADVANCED')) {
      const outcome = staged.find((e) => PHASE_INCOMPATIBLE_EVENT_TYPES.has(e.type));
      if (outcome) {
        txCounter -= 1;
        throw new Error(
          `transaction('${label}') staged both a PHASE_ADVANCED and a ${outcome.type}. ` +
            'Victory is decided in the transaction that produces the outcome, while the phase ' +
            'is still the one the outcome happened in (§4.7) — advance the phase in its own ' +
            'transaction, as closeDay/beginNight do.',
        );
      }
    }

    // §4.7 — EXACTLY ONCE, at commit, after every event of the action has landed.
    let victory = stagedState.victory;
    if (victory.status === 'ongoing') {
      victory = checkVictory(toRulesView(stagedState), { dayClosed: options.dayClosed ?? false });
      if (victory.status !== 'ongoing') {
        // Every VICTORY_PREDICATE carries a non-null reason, so this can only
        // fire on a broken predicate — and it must be loud, not a quiet skip.
        // A guard that silently declined to append GAME_ENDED here would leave
        // `state.victory` reporting ongoing forever while the local `victory`
        // disagrees, with no event and no error to explain why.
        if (victory.reason === null) {
          throw new Error(`checkVictory returned status "${victory.status}" with a null reason`);
        }
        append('GAME_ENDED', { winner: victory.status, reason: victory.reason });
      }
    }

    // A transaction that stages nothing — an empty body, or a body whose only
    // possible side effect (ending the game) didn't fire — is not an action:
    // it must not notify subscribers, must not leave a `labels` entry keyed to
    // a txId no event will ever carry (undo can never reach it, so it would sit
    // in the map forever), and must not make `lastTransactionLabel()` report a
    // stale caption over what looks like a successful no-op transaction. The
    // minted txId is likewise given back so the next mint doesn't skip a number
    // for a transaction that never happened.
    if (staged.length === 0) {
      txCounter -= 1;
      return { txId, events: [], victory: state.victory };
    }

    events = [...events, ...staged];
    state = stagedState;
    labels.set(txId, label);
    notify();
    return { txId, events: staged, victory: state.victory };
  }

  /**
   * The most recent txId whose events are all undoable (§3.4).
   *
   * Walks backwards a transaction at a time rather than filtering the whole log
   * per candidate: §3.5 budgets 3,000 events for a pathological game, and
   * `canUndo()` is called on every render.
   */
  function lastUndoableTxId(): TxId | null {
    let end = events.length - 1;
    while (end >= 0) {
      const txId = events[end]!.txId;
      let start = end;
      while (start > 0 && events[start - 1]!.txId === txId) start -= 1;
      let undoable = true;
      for (let i = start; i <= end; i += 1) {
        if (NON_UNDOABLE_EVENT_TYPES.has(events[i]!.type)) {
          undoable = false;
          break;
        }
      }
      if (undoable) return txId;
      end = start - 1;
    }
    return null;
  }

  function undo(): boolean {
    const txId = lastUndoableTxId();
    if (txId === null) return false;
    const kept = events
      .filter((e) => e.txId !== txId)
      // seq is the array index (§3.2), so it must be renumbered after a removal.
      .map((event, index) => ({ ...event, seq: index }) as GameEvent);
    // Replay the truncated log into a local BEFORE touching any store field.
    // applyEvent throws in several places, and if this ever throws, `events`
    // must not already have been advanced — otherwise getEvents() and
    // getState() would permanently disagree, with no way to detect it from
    // outside. Assign both together, only after the replay has succeeded.
    const nextState = reduce(kept);
    events = kept;
    state = nextState;
    labels.delete(txId);
    notify();
    return true;
  }

  return {
    getState: () => state,
    getEvents: () => events,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    transaction,
    undo,
    canUndo: () => lastUndoableTxId() !== null,
    lastTransactionLabel() {
      const txId = lastUndoableTxId();
      if (txId === null) return null;
      const label = labels.get(txId);
      if (label !== undefined) return label;
      // After a reload the labels are gone, so derive a caption from the events.
      const txEvents = events.filter((e) => e.txId === txId);
      return txEvents[0]?.type ?? null;
    },
  };
}

/**
 * The largest tx number already in the log, so the next mint cannot collide.
 *
 * Counting DISTINCT txIds was wrong: undo removes a transaction without
 * renumbering the survivors, so a log can hold tx1, tx2, tx4 with tx3 undone. On
 * reload the count is 3, the next mint is tx4 — and undo would then drop both
 * transactions sharing that id, silently reverting a table action from earlier in
 * the game.
 *
 * Throws on a txId it cannot parse rather than silently treating it as 0: a
 * foreign or corrupted log with an unparseable txId is exactly the case where
 * blindly reminting from 1 would collide with an id already in use.
 */
function highestTxNumber(events: readonly GameEvent[]): number {
  let highest = 0;
  for (const event of events) {
    const parsed = Number.parseInt(event.txId.replace(/^tx/, ''), 10);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Unparseable txId in event log: "${event.txId}"`);
    }
    if (parsed > highest) highest = parsed;
  }
  return highest;
}
