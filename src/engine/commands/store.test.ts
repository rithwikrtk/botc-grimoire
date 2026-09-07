import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';
import { reduce } from '@/engine/reducer/fold';
import type { GameEvent } from '@/engine/events';

/** 7 players: 5/0/1/1 is the chart, so one Minion — but the fixtures below
 *  deliberately record their own counts and never go through assignRoles, which
 *  is the gate that enforces chart legality (Task 5). */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'scarlet_woman'],
  ['p3', 'poisoner'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'mayor'],
];

/** A store seeded with a dealt 7-player game sitting on night 2. */
function seeded() {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create the game', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 4, outsider: 0, minion: 2, demon: 1 },
      setupModifiers: [],
      demonBluffs: ['virgin', 'slayer', 'mayor'],
      drunkBelief: null,
      redHerring: 'p4',
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
  store.transaction('advance to night 2', (tx) => {
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
    tx.emit('DAY_CLOSED', {});
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 2 });
  });
  return store;
}

describe('transactions (§3.2)', () => {
  it('stamps one txId across every event in the action', () => {
    const store = seeded();
    const result = store.transaction('resolve the Monk step', (tx) => {
      tx.emit('NIGHT_STEP_RESOLVED', {
        stepId: 'monk',
        actorIds: ['p6'],
        perceivedCharacterId: 'monk',
        targets: ['p4'],
        chosenAnswer: 'protected P4',
        answerClass: 'canonical',
        registrationRulings: [],
        abilityFunctional: true,
        effectSuppressed: false,
      });
      tx.emit('STATUS_APPLIED', {
        playerId: 'p4',
        status: 'protected',
        sourcePlayerId: 'p6',
        effective: true,
        expiresAt: { kind: 'night', number: 2 },
      });
    });
    expect(result.events).toHaveLength(2);
    expect(new Set(result.events.map((e) => e.txId)).size).toBe(1);
  });

  it('numbers seq as the array index with no gaps', () => {
    const store = seeded();
    expect(store.getEvents().map((e) => e.seq)).toEqual(
      store.getEvents().map((_, index) => index),
    );
  });

  it('stamps ts from the clock, never inside the reducer (§3.2, §3.3)', () => {
    const store = seeded();
    const timestamps = store.getEvents().map((e) => e.ts);
    expect(timestamps.every((t) => t > 1_700_000_000_000)).toBe(true);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });

  it('lets a transaction read the state it has built so far', () => {
    const store = seeded();
    store.transaction('kill the Chef', (tx) => {
      expect(tx.state().players.find((p) => p.id === 'p4')?.alive).toBe(true);
      tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
      expect(tx.state().players.find((p) => p.id === 'p4')?.alive).toBe(false);
    });
  });

  it('discards the whole transaction when the body throws', () => {
    const store = seeded();
    const before = store.getEvents().length;
    expect(() =>
      store.transaction('half an action', (tx) => {
        tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
        throw new Error('changed my mind');
      }),
    ).toThrow(/changed my mind/);
    expect(store.getEvents()).toHaveLength(before);
    expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(true);
  });

  it('notifies subscribers once per transaction, not once per event', () => {
    const store = seeded();
    const listener = vi.fn();
    store.subscribe(listener);
    store.transaction('two events', (tx) => {
      tx.emit('NOTE_ADDED', { id: 'n1', scope: 'game', text: 'one' });
      tx.emit('NOTE_ADDED', { id: 'n2', scope: 'game', text: 'two' });
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('folds incrementally and agrees with a full replay', () => {
    const store = seeded();
    store.transaction('a death', (tx) => {
      tx.emit('DEATH', { playerId: 'p5', characterIdAtDeath: 'empath', cause: 'demon' });
    });
    expect(store.getState()).toEqual(reduce(store.getEvents()));
  });
});

describe('commit-time victory (§4.7)', () => {
  // The bug the per-event reading causes: good wins the instant the Imp dies and
  // the Scarlet Woman never promotes.
  it('does not end the game mid-transaction when a successor promotes', () => {
    const store = seeded();
    store.transaction('the Imp is slain and the Scarlet Woman takes over', (tx) => {
      tx.emit('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'slayer' });
      tx.emit('DEMON_DIED', {
        deadDemonId: 'p1',
        aliveCountAtDeath: 7,
        successorId: 'p2',
        successorReason: 'scarlet_woman',
      });
      tx.emit('ROLE_CHANGED', { playerId: 'p2', from: 'scarlet_woman', to: 'imp', reason: 'scarlet_woman' });
    });
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    expect(store.getState().players.find((p) => p.id === 'p2')?.characterId).toBe('imp');
  });

  it('ends the game at commit when nobody holds the Demon', () => {
    const store = seeded();
    const result = store.transaction('the Imp is slain with no successor', (tx) => {
      tx.emit('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'slayer' });
      tx.emit('DEMON_DIED', {
        deadDemonId: 'p1',
        aliveCountAtDeath: 7,
        successorId: null,
        successorReason: null,
      });
    });
    expect(result.victory).toEqual({ status: 'good', reason: 'demon_dead' });
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'demon_dead' });
    // GAME_ENDED joins the SAME transaction, so undoing the death undoes the win.
    const ended = store.getEvents().filter((e) => e.type === 'GAME_ENDED');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.txId).toBe(result.txId);
  });

  it('checks victory exactly once per transaction', () => {
    const store = seeded();
    let checks = 0;
    store.transaction(
      'three events',
      (tx) => {
        tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
        tx.emit('NOTE_ADDED', { id: 'n', scope: 'game', text: 'x' });
        tx.emit('RULE_FLAGGED', { rule: 'x', relatedTxId: 'tx0', class: 'social', detail: 'y' });
      },
      { onVictoryCheck: () => (checks += 1) },
    );
    expect(checks).toBe(1);
  });

  it('passes dayClosed so the Mayor row is only reachable at day close', () => {
    // ROLES has the Mayor at p7 — without one in the fixture this test would pass
    // even if dayClosed were ignored entirely, which is how an earlier draft of it
    // asserted nothing at all.
    const store = seeded();
    store.transaction('open day 2 and thin the herd', (tx) => {
      tx.emit('PHASE_ADVANCED', { phase: 'day', number: 2 });
      for (const id of ['p3', 'p4', 'p5', 'p6']) {
        const characterId = ROLES.find(([playerId]) => playerId === id)![1];
        tx.emit('DEATH', { playerId: id, characterIdAtDeath: characterId, cause: 'demon' });
      }
    });
    // Three alive (p1 Imp, p2 Scarlet Woman, p7 Mayor), no execution — but this
    // transaction did not close a day, so nothing fires.
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });

    // The same state, with dayClosed, is the Mayor's win.
    const result = store.transaction('close the day', () => undefined, { dayClosed: true });
    expect(result.victory).toEqual({ status: 'good', reason: 'mayor_no_execution' });
  });
});

describe('undo (§3.4)', () => {
  it('drops every event sharing the last txId', () => {
    const store = seeded();
    const before = store.getEvents().length;
    store.transaction('resolve the Monk step', (tx) => {
      tx.emit('NIGHT_STEP_RESOLVED', {
        stepId: 'monk',
        actorIds: ['p6'],
        targets: ['p4'],
        chosenAnswer: 'protected P4',
        answerClass: 'canonical',
        registrationRulings: [],
        abilityFunctional: true,
        effectSuppressed: false,
      });
      tx.emit('STATUS_APPLIED', {
        playerId: 'p4',
        status: 'protected',
        sourcePlayerId: 'p6',
        effective: true,
        expiresAt: { kind: 'night', number: 2 },
      });
    });
    expect(store.getEvents()).toHaveLength(before + 2);
    expect(store.undo()).toBe(true);
    expect(store.getEvents()).toHaveLength(before);
    expect(store.getState().settledStepIds.size).toBe(0);
    // p4 is the fixture's red herring (ROLES_ASSIGNED), so the ledger is never
    // empty — it must still hold that entry. What undo must remove is the
    // 'protected' entry the Monk's STATUS_APPLIED added.
    expect(
      store.getState().players.find((p) => p.id === 'p4')?.statusLedger.map((s) => s.status),
    ).toEqual(['redHerring']);
  });

  it('undoes the win along with the death that caused it', () => {
    const store = seeded();
    store.transaction('slay the Imp', (tx) => {
      tx.emit('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'slayer' });
      tx.emit('DEMON_DIED', { deadDemonId: 'p1', aliveCountAtDeath: 7, successorId: null, successorReason: null });
    });
    expect(store.getState().victory.status).toBe('good');
    store.undo();
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
  });

  it('never drops the Spy audit trail', () => {
    const store = seeded();
    store.transaction('note something', (tx) => {
      tx.emit('NOTE_ADDED', { id: 'n1', scope: 'game', text: 'the Spy looked' });
    });
    store.transaction('spy views', (tx) => {
      tx.emit('SPY_VIEWED', {});
    });
    store.transaction('spy done', (tx) => {
      tx.emit('SPY_VIEW_ENDED', {});
    });

    // Undo skips past the two non-undoable transactions to the note.
    expect(store.undo()).toBe(true);
    const types = store.getEvents().map((e) => e.type);
    expect(types).toContain('SPY_VIEWED');
    expect(types).toContain('SPY_VIEW_ENDED');
    expect(types).not.toContain('NOTE_ADDED');
  });

  it('reports canUndo false when only non-undoable events remain', () => {
    let tick = 1_700_000_000_000;
    const store = createStore([], () => (tick += 1000));
    store.transaction('spy views', (tx) => tx.emit('SPY_VIEWED', {}));
    expect(store.canUndo()).toBe(false);
    expect(store.undo()).toBe(false);
  });

  it('reports canUndo false on an empty log', () => {
    expect(createStore().canUndo()).toBe(false);
  });

  it('captions the undo button with the transaction label', () => {
    const store = seeded();
    store.transaction('resolve the Monk step', (tx) => {
      tx.emit('NOTE_ADDED', { id: 'n', scope: 'game', text: 'x' });
    });
    expect(store.lastTransactionLabel()).toBe('resolve the Monk step');
    store.undo();
    expect(store.lastTransactionLabel()).toBe('advance to night 2');
  });

  it('derives a caption after a reload, where labels are gone', () => {
    const store = seeded();
    store.transaction('kill the Chef', (tx) => {
      tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
    });
    const reloaded = createStore(store.getEvents());
    expect(reloaded.lastTransactionLabel()).toBe('DEATH');
    expect(reloaded.canUndo()).toBe(true);
  });

  it('does not reissue a txId already in the log after an undo and a reload', () => {
    const store = seeded();
    store.transaction('a', (tx) => tx.emit('NOTE_ADDED', { id: 'n1', scope: 'game', text: 'a' }));
    store.transaction('b', (tx) => tx.emit('NOTE_ADDED', { id: 'n2', scope: 'game', text: 'b' }));
    // Undo the middle transaction, leaving a gap in the txId sequence.
    const beforeUndo = new Set(store.getEvents().map((e) => e.txId));
    store.undo();
    const surviving = new Set(store.getEvents().map((e) => e.txId));
    expect(surviving.size).toBe(beforeUndo.size - 1);

    const reloaded = createStore(store.getEvents());
    reloaded.transaction('c', (tx) => tx.emit('NOTE_ADDED', { id: 'n3', scope: 'game', text: 'c' }));
    const fresh = reloaded.getEvents().at(-1)!.txId;
    expect(surviving.has(fresh)).toBe(false);
  });

  it('rebuilds from a persisted log with the state intact', () => {
    const store = seeded();
    const events = JSON.parse(JSON.stringify(store.getEvents())) as GameEvent[];
    expect(createStore(events).getState()).toEqual(store.getState());
  });
});
