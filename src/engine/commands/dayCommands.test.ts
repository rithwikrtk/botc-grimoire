import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { beginNight, castVote, closeDay, closeNomination, endGame, nominate } from './dayCommands';
import { expiryFor } from '@/engine/phase';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'butler'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

/** Same seven seats, with the Saint in p3 so a vote execution can reach §4.7 row 2. */
const SAINT_ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'saint'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

function seededWithSaint(opts: { poison?: string } = {}): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: SAINT_ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(SAINT_ROLES),
      distribution: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: ['virgin', 'slayer', 'mayor'],
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    if (opts.poison) {
      tx.emit('STATUS_APPLIED', {
        playerId: opts.poison,
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: expiryFor('tonight_and_tomorrow', { kind: 'night', number: 1 }),
      });
    }
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

describe('day commands (§4.8, §7)', () => {
  it('opens a nomination and flags an illegal one in the same transaction', () => {
    const store = seeded();
    const result = nominate(store, 'p4', 'p4');
    expect(result.events.map((e) => e.type)).toEqual(['NOMINATION_OPENED', 'RULE_FLAGGED']);
    // Never blocked: the nomination exists (§4.8).
    expect(store.getState().nominations).toHaveLength(1);
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'self_nomination',
      class: 'integrity',
      relatedTxId: result.txId,
    });
  });

  it('undoes the nomination and its flag together', () => {
    const store = seeded();
    nominate(store, 'p4', 'p4');
    store.undo();
    expect(store.getState().nominations).toEqual([]);
    expect(store.getState().ruleFlags).toEqual([]);
  });

  it('records a vote and closes the nomination with write-only forensics (§3.6)', () => {
    const store = seeded();
    const { nominationId } = nominate(store, 'p4', 'p1');
    castVote(store, nominationId, 'p4');
    castVote(store, nominationId, 'p5');
    const result = closeNomination(store, nominationId);
    const closed = result.events.find((e) => e.type === 'NOMINATION_CLOSED');
    expect(closed?.payload).toMatchObject({ auditTally: 2, auditThreshold: 4, butlerVotesFlagged: [] });
    expect(store.getState().nominations[0]?.closed).toBe(true);
  });

  it('closes a day with zero nominations, which is what makes the Mayor win reachable (§7)', () => {
    const store = seeded();
    const result = closeDay(store);
    const types = result.events.map((e) => e.type);
    expect(types).toEqual(['DAY_CLOSED', 'EXECUTION']);
    expect(result.events.find((e) => e.type === 'EXECUTION')?.payload).toEqual({
      playerId: null,
      kind: 'vote',
    });
    // closeDay does NOT advance the phase — victory is decided on the day.
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
    expect(store.getState().todaysExecutions).toEqual([]);
    beginNight(store);
    expect(store.getState().phase).toEqual({ kind: 'night', number: 2 });
  });

  it('executes at day close in one undoable transaction, leaving the phase on the day', () => {
    const store = seeded();
    const { nominationId } = nominate(store, 'p4', 'p1');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    const result = closeDay(store);
    expect(result.events.map((e) => e.type)).toEqual([
      'DAY_CLOSED',
      'EXECUTION',
      'DEATH',
      'DEMON_DIED',
      'GAME_ENDED',
    ]);
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'demon_dead' });
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
    // The whole day-close, including the win, undoes as one action.
    store.undo();
    expect(store.getState().victory.status).toBe('ongoing');
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
  });

  // §4.7 row 2, §14 Tier 2. This is the case the earlier draft made unreachable:
  // the predicate was tested directly and the PATH was not.
  it('awards evil the game when a Saint is executed by vote (§4.7 row 2)', () => {
    const store = seededWithSaint();
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'saint_executed' });
  });

  it('does not award it for a POISONED Saint, whose poison is still live on the day', () => {
    const store = seededWithSaint({ poison: 'p3' });
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  it('refuses to begin the night once the game is decided', () => {
    const store = seededWithSaint();
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(() => beginNight(store)).toThrow(/game is over/i);
  });

  it('ends an abandoned game so the reason has a producer (§7)', () => {
    const store = seeded();
    endGame(store, 'evil', 'abandoned');
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'abandoned' });
  });
});
