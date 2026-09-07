import { NON_UNDOABLE_EVENT_TYPES, type EventType, type GameEvent, type GameEventPayloads } from '../events';
import { applyMany, initialState, reduce } from '../reducer/fold';
import { toRulesView } from '../selectors/rulesView';
import { checkVictory } from '../selectors/victory';
import type { GameState, RuleFlagClass, RulesView, TxId, Victory } from '../types';

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
  /** Test seam: called once, when victory is checked at commit. */
  onVictoryCheck?: (victory: Victory) => void;
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
  let state: GameState = events.length > 0 ? reduce(events) : initialState();
  let txCounter = highestTxNumber(events);
  const labels = new Map<TxId, string>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function transaction(
    label: string,
    body: (tx: Tx) => void,
    options: TransactionOptions = {},
  ): TransactionResult {
    const txId = `tx${++txCounter}`;
    const staged: GameEvent[] = [];
    let stagedState = state;

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

    const tx: Tx = {
      emit: append,
      state: () => stagedState,
      view: () => toRulesView(stagedState),
      flag: (rule, ruleClass, detail) =>
        append('RULE_FLAGGED', { rule, relatedTxId: txId, class: ruleClass, detail }),
    };

    try {
      body(tx);
    } catch (error) {
      // Nothing was committed: `events` and `state` were never reassigned.
      txCounter -= 1;
      throw error;
    }

    // §4.7 — EXACTLY ONCE, at commit, after every event of the action has landed.
    let victory = stagedState.victory;
    if (victory.status === 'ongoing') {
      victory = checkVictory(toRulesView(stagedState), { dayClosed: options.dayClosed ?? false });
      options.onVictoryCheck?.(victory);
      if (victory.status !== 'ongoing' && victory.reason !== null) {
        append('GAME_ENDED', { winner: victory.status, reason: victory.reason });
      }
    } else {
      options.onVictoryCheck?.(victory);
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
    const kept = events.filter((e) => e.txId !== txId);
    // seq is the array index (§3.2), so it must be renumbered after a removal.
    events = kept.map((event, index) => ({ ...event, seq: index }) as GameEvent);
    state = reduce(events);
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
      if (label) return label;
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
 */
function highestTxNumber(events: readonly GameEvent[]): number {
  let highest = 0;
  for (const event of events) {
    const parsed = Number.parseInt(event.txId.replace(/^tx/, ''), 10);
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
  }
  return highest;
}
