import { describe, expect, it } from 'vitest';
import { applyEvent, initialState, reduce } from './fold';
import type { GameEvent } from '../events';

let nextSeq = 0;
function evt<T extends GameEvent['type']>(
  type: T,
  payload: Extract<GameEvent, { type: T }>['payload'],
  txId = `tx${nextSeq}`,
): GameEvent {
  return { seq: nextSeq++, txId, ts: 1_700_000_000_000 + nextSeq, type, payload } as GameEvent;
}

function fourPlayerLog(): GameEvent[] {
  nextSeq = 0;
  return [
    evt('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: [
        { id: 'p1', name: 'One', seat: 0 },
        { id: 'p2', name: 'Two', seat: 1 },
        { id: 'p3', name: 'Three', seat: 2 },
        { id: 'p4', name: 'Four', seat: 3 },
        { id: 'p5', name: 'Five', seat: 4 },
      ],
    }),
    evt('ROLES_ASSIGNED', {
      assignments: {
        p1: 'imp',
        p2: 'poisoner',
        p3: 'empath',
        p4: 'monk',
        p5: 'chef',
      },
      distribution: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    }),
    evt('PHASE_ADVANCED', { phase: 'night', number: 1 }),
  ];
}

describe('applyEvent — envelope and roster', () => {
  it('seats players in the order given and derives nothing else from GAME_CREATED', () => {
    const state = reduce(fourPlayerLog().slice(0, 1));
    expect(state.players.map((p) => [p.seat, p.name])).toEqual([
      [0, 'One'],
      [1, 'Two'],
      [2, 'Three'],
      [3, 'Four'],
      [4, 'Five'],
    ]);
    expect(state.players.every((p) => p.alive)).toBe(true);
    expect(state.phase).toEqual({ kind: 'night', number: 0 });
    expect(state.victory).toEqual({ status: 'ongoing', reason: null });
  });

  it('derives alignment and team from the assigned character', () => {
    const state = reduce(fourPlayerLog());
    const byId = new Map(state.players.map((p) => [p.id, p]));
    expect(byId.get('p1')).toMatchObject({ alignment: 'evil', team: 'demon' });
    expect(byId.get('p2')).toMatchObject({ alignment: 'evil', team: 'minion' });
    expect(byId.get('p3')).toMatchObject({ alignment: 'good', team: 'townsfolk' });
  });

  it('sets demonSince on the initial deal so §6.3 has a baseline', () => {
    const state = reduce(fourPlayerLog());
    expect(state.players.find((p) => p.id === 'p1')?.demonSince).toEqual({
      kind: 'night',
      number: 0,
    });
  });

  it('renames without touching seating', () => {
    const log = [...fourPlayerLog(), evt('PLAYER_RENAMED', { playerId: 'p2', name: 'Twoo' })];
    const state = reduce(log);
    const p2 = state.players.find((p) => p.id === 'p2');
    expect(p2?.name).toBe('Twoo');
    expect(p2?.seat).toBe(1);
  });

  it('derives the phase from the last PHASE_ADVANCED', () => {
    const log = [
      ...fourPlayerLog(),
      evt('PHASE_ADVANCED', { phase: 'day', number: 1 }),
      evt('PHASE_ADVANCED', { phase: 'night', number: 2 }),
    ];
    expect(reduce(log).phase).toEqual({ kind: 'night', number: 2 });
  });

  it('clears todaysExecutions when a new day opens, not when a night opens', () => {
    const log = [
      ...fourPlayerLog(),
      evt('PHASE_ADVANCED', { phase: 'day', number: 1 }),
      evt('EXECUTION', { playerId: 'p5', kind: 'vote' }),
      evt('DEATH', { playerId: 'p5', characterIdAtDeath: 'chef', cause: 'execution', executionKind: 'vote' }),
    ];
    expect(reduce(log).todaysExecutions).toHaveLength(1);

    const afterNight = reduce([...log, evt('DAY_CLOSED', {}), evt('PHASE_ADVANCED', { phase: 'night', number: 2 })]);
    // Still visible at night — the Undertaker wakes at night and needs it (§6.3).
    expect(afterNight.todaysExecutions).toHaveLength(1);

    const afterNextDay = reduce([
      ...log,
      evt('DAY_CLOSED', {}),
      evt('PHASE_ADVANCED', { phase: 'night', number: 2 }),
      evt('PHASE_ADVANCED', { phase: 'day', number: 2 }),
    ]);
    expect(afterNextDay.todaysExecutions).toEqual([]);
  });

  it('records deaths as monotonic and never resurrects', () => {
    const log = [
      ...fourPlayerLog(),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'demon' }),
    ];
    const state = reduce(log);
    expect(state.players.find((p) => p.id === 'p3')?.alive).toBe(false);
    expect(state.deaths).toHaveLength(1);
    expect(state.deaths[0]).toMatchObject({ playerId: 'p3', cause: 'demon', phase: { kind: 'night', number: 1 } });
  });

  // §4.8 integrity class: a flagged event must produce no derived state change.
  it('ignores a DEATH for a player who is already dead', () => {
    const log = [
      ...fourPlayerLog(),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'demon' }),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'other' }),
    ];
    const state = reduce(log);
    expect(state.deaths).toHaveLength(1);
    expect(state.players.filter((p) => p.alive)).toHaveLength(4);
  });

  it('applies and clears statuses through the ledger', () => {
    const log = [
      ...fourPlayerLog(),
      evt('STATUS_APPLIED', {
        playerId: 'p3',
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: { kind: 'day', number: 1 },
      }),
    ];
    const applied = reduce(log);
    expect(applied.players.find((p) => p.id === 'p3')?.statusLedger).toEqual([
      {
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        appliedAt: { kind: 'night', number: 1 },
        expiresAt: { kind: 'day', number: 1 },
      },
    ]);

    const cleared = reduce([
      ...log,
      evt('STATUS_CLEARED', { playerId: 'p3', status: 'poisoned', sourcePlayerId: 'p2' }),
    ]);
    expect(cleared.players.find((p) => p.id === 'p3')?.statusLedger).toEqual([]);
  });

  // §3.7, §6.1 — the key must carry the night, or night 2 ends before it starts.
  it('night-scopes settled step keys', () => {
    const log = [
      ...fourPlayerLog(),
      evt('NIGHT_STEP_SKIPPED', { stepId: 'monk', actorIds: ['p4'], reason: 'condition_unmet' }),
    ];
    expect([...reduce(log).settledStepIds]).toEqual(['1:monk:p4']);
  });

  it('keys a group step once for the whole set', () => {
    const log = [
      ...fourPlayerLog(),
      evt('NIGHT_STEP_RESOLVED', {
        stepId: 'minion_info',
        actorIds: ['p2'],
        targets: [],
        chosenAnswer: 'shown the Demon',
        answerClass: 'canonical',
        registrationRulings: [],
        abilityFunctional: true,
        effectSuppressed: false,
      }),
    ];
    expect([...reduce(log).settledStepIds]).toEqual(['1:minion_info:GROUP']);
  });

  it('throws on an unrecognised event type rather than silently ignoring it', () => {
    const bogus = { seq: 0, txId: 'tx', ts: 0, type: 'NOT_AN_EVENT', payload: {} } as unknown as GameEvent;
    expect(() => applyEvent(initialState(), bogus)).toThrow(/unhandled event type/i);
  });
});

describe('applyEvent — referential stability (§3.5)', () => {
  it('returns identical sub-objects for everything the event did not touch', () => {
    const log = fourPlayerLog();
    const before = reduce(log);
    const after = applyEvent(
      before,
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'demon' }),
    );

    const index = (s: typeof before, id: string) => s.players.findIndex((p) => p.id === id);
    expect(after.players[index(after, 'p3')]).not.toBe(before.players[index(before, 'p3')]);
    for (const id of ['p1', 'p2', 'p4', 'p5']) {
      expect(after.players[index(after, id)]).toBe(before.players[index(before, id)]);
    }
    expect(after.nominations).toBe(before.nominations);
    expect(after.ruleFlags).toBe(before.ruleFlags);
    expect(after.notes).toBe(before.notes);
    expect(after.settledStepIds).toBe(before.settledStepIds);
    expect(after.distribution).toBe(before.distribution);
  });

  it('returns the identical state object when an event changes nothing', () => {
    const before = reduce(fourPlayerLog());
    const after = applyEvent(before, evt('PLAYER_RENAMED', { playerId: 'p2', name: 'Two' }));
    expect(after).toBe(before);
  });
});
