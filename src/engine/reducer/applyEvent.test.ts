import { beforeEach, describe, expect, it } from 'vitest';
import { applyEvent, initialState, reduce } from './fold';
import type { EventType, GameEvent } from '../events';

// Reset before every test, not just inside fivePlayerLog: relying on a reset
// buried in one helper made every later evt(...) call depend on that helper
// having just run, which breaks silently under any test reorder.
let nextSeq = 0;
beforeEach(() => {
  nextSeq = 0;
});

function evt<T extends GameEvent['type']>(
  type: T,
  payload: Extract<GameEvent, { type: T }>['payload'],
  txId = `tx${nextSeq}`,
): GameEvent {
  return { seq: nextSeq++, txId, ts: 1_700_000_000_000 + nextSeq, type, payload } as GameEvent;
}

function fivePlayerLog(): GameEvent[] {
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

/**
 * FIX I6 — the frozen event catalogue, in the style of `STEP_IDS`'
 * snapshot in nightOrder.test.ts.
 *
 * This is what stands behind §18. Seat and roster immutability are enforced by
 * the ABSENCE of a write path — `seat` is assigned in exactly one place
 * (`GAME_CREATED` below) and there is no reseat/add/remove event — which is a
 * stronger guarantee than any test. But "there is no such event" was itself
 * unwitnessed: adding `PLAYER_RESEATED` to the catalogue tomorrow reddened
 * nothing anywhere in the tree. It reddens here.
 *
 * The `Record<EventType, true>` annotation makes it fail TWICE for the price of
 * one: adding or removing a payload key in events.ts is a compile error here
 * (missing / excess property), and the assertion below pins the names and count
 * so a rename is a reviewed edit to a test rather than a silent break of the
 * replay contract.
 */
const EVENT_TYPES: Record<EventType, true> = {
  GAME_CREATED: true,
  PLAYER_RENAMED: true,
  ROLES_ASSIGNED: true,
  ROLE_CHANGED: true,
  PHASE_ADVANCED: true,
  DAY_CLOSED: true,
  NIGHT_STEP_RESOLVED: true,
  NIGHT_STEP_SKIPPED: true,
  NIGHT_KILL_RESOLVED: true,
  STATUS_APPLIED: true,
  STATUS_CLEARED: true,
  DEATH: true,
  DEMON_DIED: true,
  NOMINATION_OPENED: true,
  VOTE_CAST: true,
  NOMINATION_CLOSED: true,
  EXECUTION: true,
  VIRGIN_TRIGGERED: true,
  SLAYER_CLAIMED: true,
  RULE_FLAGGED: true,
  NOTE_ADDED: true,
  SPY_VIEWED: true,
  SPY_VIEW_ENDED: true,
  GAME_ENDED: true,
};

describe('the frozen event catalogue (§3.6, §18)', () => {
  it('is exactly these event types', () => {
    expect(Object.keys(EVENT_TYPES).sort()).toEqual([
      'DAY_CLOSED',
      'DEATH',
      'DEMON_DIED',
      'EXECUTION',
      'GAME_CREATED',
      'GAME_ENDED',
      'NIGHT_KILL_RESOLVED',
      'NIGHT_STEP_RESOLVED',
      'NIGHT_STEP_SKIPPED',
      'NOMINATION_CLOSED',
      'NOMINATION_OPENED',
      'NOTE_ADDED',
      'PLAYER_RENAMED',
      'PHASE_ADVANCED',
      'ROLES_ASSIGNED',
      'ROLE_CHANGED',
      'RULE_FLAGGED',
      'SLAYER_CLAIMED',
      'SPY_VIEWED',
      'SPY_VIEW_ENDED',
      'STATUS_APPLIED',
      'STATUS_CLEARED',
      'VIRGIN_TRIGGERED',
      'VOTE_CAST',
    ].sort());
  });

  // §18 stated as the property it actually is, so the reason this list is frozen
  // survives in the file rather than only in a review.
  it('contains no event that moves a player between seats, or adds or removes one', () => {
    const rosterMutating = Object.keys(EVENT_TYPES).filter((type) =>
      /RESEAT|SEAT|PLAYER_ADDED|PLAYER_REMOVED|PLAYER_SEATED|ROSTER/.test(type),
    );
    expect(rosterMutating).toEqual([]);
    // PLAYER_RENAMED is the one roster-touching event, and it is typos only
    // (§18) — it carries a name and nothing else.
    expect(Object.keys(EVENT_TYPES).filter((t) => t.startsWith('PLAYER_'))).toEqual([
      'PLAYER_RENAMED',
    ]);
  });
});

describe('applyEvent — envelope and roster', () => {
  it('seats players in the order given and derives nothing else from GAME_CREATED', () => {
    const state = reduce(fivePlayerLog().slice(0, 1));
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
    const state = reduce(fivePlayerLog());
    const byId = new Map(state.players.map((p) => [p.id, p]));
    expect(byId.get('p1')).toMatchObject({ alignment: 'evil', team: 'demon' });
    expect(byId.get('p2')).toMatchObject({ alignment: 'evil', team: 'minion' });
    expect(byId.get('p3')).toMatchObject({ alignment: 'good', team: 'townsfolk' });
  });

  it('sets demonSince on the initial deal so §6.3 has a baseline', () => {
    const state = reduce(fivePlayerLog());
    expect(state.players.find((p) => p.id === 'p1')?.demonSince).toEqual({
      kind: 'night',
      number: 0,
    });
  });

  it('renames without touching seating', () => {
    const log = [...fivePlayerLog(), evt('PLAYER_RENAMED', { playerId: 'p2', name: 'Twoo' })];
    const state = reduce(log);
    const p2 = state.players.find((p) => p.id === 'p2');
    expect(p2?.name).toBe('Twoo');
    expect(p2?.seat).toBe(1);
  });

  it('derives the phase from the last PHASE_ADVANCED', () => {
    const log = [
      ...fivePlayerLog(),
      evt('PHASE_ADVANCED', { phase: 'day', number: 1 }),
      evt('PHASE_ADVANCED', { phase: 'night', number: 2 }),
    ];
    expect(reduce(log).phase).toEqual({ kind: 'night', number: 2 });
  });

  // FIX 4c — the reducer's ONLY phase-monotonicity guarantee, and it had no
  // test: replacing the condition with `false` left the whole suite green. Every
  // status lifetime is expressed as a phase window (§4.4) and `comparePhases`
  // decides expiry, so a log that goes backwards would silently resurrect
  // expired poison, protection and Master marks for the rest of the game.
  //
  // The advisory fuzzer cannot reach this — its generator only ever advances —
  // which is now said in its own `play()` docstring.
  it('refuses a PHASE_ADVANCED that goes backwards, or repeats the current phase', () => {
    const log = [...fivePlayerLog(), evt('PHASE_ADVANCED', { phase: 'day', number: 2 })];
    const state = reduce(log);
    expect(state.phase).toEqual({ kind: 'day', number: 2 });

    // Backwards by number.
    expect(() => applyEvent(state, evt('PHASE_ADVANCED', { phase: 'night', number: 1 }))).toThrow(
      /went backwards/i,
    );
    // Backwards within the same number: night 2 precedes day 2.
    expect(() => applyEvent(state, evt('PHASE_ADVANCED', { phase: 'night', number: 2 }))).toThrow(
      /went backwards/i,
    );
    // Not strictly forward: the same phase again. `<= 0` is the comparison, not
    // `< 0`, so this is the boundary the guard is written to catch.
    expect(() => applyEvent(state, evt('PHASE_ADVANCED', { phase: 'day', number: 2 }))).toThrow(
      /went backwards/i,
    );
    // ...and the legitimate next phase still applies.
    expect(applyEvent(state, evt('PHASE_ADVANCED', { phase: 'night', number: 3 })).phase).toEqual({
      kind: 'night',
      number: 3,
    });
  });

  it('clears todaysExecutions when a new day opens, not when a night opens', () => {
    const log = [
      ...fivePlayerLog(),
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
      ...fivePlayerLog(),
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
      ...fivePlayerLog(),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'demon' }),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'other' }),
    ];
    const state = reduce(log);
    expect(state.deaths).toHaveLength(1);
    expect(state.players.filter((p) => p.alive)).toHaveLength(4);
  });

  it('applies and clears statuses through the ledger', () => {
    const log = [
      ...fivePlayerLog(),
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
      ...fivePlayerLog(),
      evt('NIGHT_STEP_SKIPPED', { stepId: 'monk', actorIds: ['p4'], reason: 'condition_unmet' }),
    ];
    expect([...reduce(log).settledStepIds]).toEqual(['1:monk:p4']);
  });

  it('keys a group step once for the whole set', () => {
    const log = [
      ...fivePlayerLog(),
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

  // §3.6's v2 correction: actorIds is always an array. A per-actor step
  // resolving with none would settle no key and stall the night forever, so
  // this is a malformed event and must throw rather than being silently ignored.
  it('throws when a per-actor step resolves with no actorIds', () => {
    const before = reduce(fivePlayerLog());
    expect(() =>
      applyEvent(
        before,
        evt('NIGHT_STEP_SKIPPED', { stepId: 'empath', actorIds: [], reason: 'condition_unmet' }),
      ),
    ).toThrow(/no actorIds/i);
  });
});

// §4.8: "no sequence of flagged events can make aliveCount negative, produce two
// living Demons, or emit a DEATH for a player already dead." The DEATH case is
// covered above; these two cover the two-living-Demons half, in both directions.
describe('applyEvent — ROLE_CHANGED integrity guard (§4.8)', () => {
  it('refuses a ROLE_CHANGED that would create a second living Demon', () => {
    const log = [
      ...fivePlayerLog(),
      evt('ROLE_CHANGED', { playerId: 'p2', from: 'poisoner', to: 'imp', reason: 'st_correction' }),
    ];
    const state = reduce(log);
    const p1 = state.players.find((p) => p.id === 'p1');
    const p2 = state.players.find((p) => p.id === 'p2');
    expect(p1).toMatchObject({ alive: true, team: 'demon' });
    // Unchanged: the guard rejected the correction outright.
    expect(p2).toMatchObject({ characterId: 'poisoner', team: 'minion' });
    expect(state.players.filter((p) => p.alive && p.team === 'demon')).toHaveLength(1);
  });

  it('promotes the Scarlet Woman when her ROLE_CHANGED lands after the Imp DEATH in the same tx', () => {
    const sharedTx = 'tx-scarlet-woman';
    const log = [
      ...fivePlayerLog(),
      evt('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'other' }, sharedTx),
      evt(
        'ROLE_CHANGED',
        { playerId: 'p2', from: 'poisoner', to: 'imp', reason: 'scarlet_woman' },
        sharedTx,
      ),
    ];
    const state = reduce(log);
    const p1 = state.players.find((p) => p.id === 'p1');
    const p2 = state.players.find((p) => p.id === 'p2');
    expect(p1?.alive).toBe(false);
    expect(p2).toMatchObject({ characterId: 'imp', team: 'demon', alignment: 'evil' });
    expect(p2?.demonSince).toEqual({ kind: 'night', number: 1 });
    expect(state.players.filter((p) => p.alive && p.team === 'demon')).toHaveLength(1);
  });
});

describe('applyEvent — referential stability (§3.5)', () => {
  it('returns identical sub-objects for everything the event did not touch', () => {
    const log = fivePlayerLog();
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
    const before = reduce(fivePlayerLog());
    const after = applyEvent(before, evt('PLAYER_RENAMED', { playerId: 'p2', name: 'Two' }));
    expect(after).toBe(before);
  });

  // Task 16 fix round 1, FIX 1 — the registrationHistory append must not break
  // this for the other two producers. A bluffed Slayer claim changes nothing
  // (claimantIsRealSlayer: false skips the slayerUsed write) and carries no
  // registrationRulings, so this must be the SAME object, not merely an
  // equal one — `{ ...next, registrationHistory }` spread unconditionally
  // would allocate a fresh top-level object here even though nothing changed.
  it('returns the identical state object for a bluffed Slayer claim (§3.5, §16.6 ledger)', () => {
    const before = reduce(fivePlayerLog());
    const after = applyEvent(
      before,
      evt('SLAYER_CLAIMED', {
        claimantId: 'p3',
        targetId: 'p1',
        claimantIsRealSlayer: false,
        targetIsTrueDemon: true,
        targetRegisteredAsDemon: false,
        abilityFunctional: false,
        outcome: 'nothing',
        registrationRulings: [],
      }),
    );
    expect(after).toBe(before);
  });

  // Same defect, the VIRGIN_TRIGGERED producer: the Virgin has already been
  // triggered once, so this event changes nothing.
  it('returns the identical state object for a repeat VIRGIN_TRIGGERED (§3.5, §16.6 ledger)', () => {
    const log = [
      ...fivePlayerLog(),
      evt('VIRGIN_TRIGGERED', {
        nominatorId: 'p2',
        nomineeId: 'p4',
        fired: false,
        registrationRulings: [],
      }),
    ];
    const before = reduce(log);
    const after = applyEvent(
      before,
      evt('VIRGIN_TRIGGERED', {
        nominatorId: 'p5',
        nomineeId: 'p4',
        fired: false,
        registrationRulings: [],
      }),
    );
    expect(after).toBe(before);
  });

  // The common night -> day transition after a no-execution day must not
  // allocate a fresh empty array: an already-empty todaysExecutions is an
  // unchanged sub-object.
  it('preserves todaysExecutions identity across a night -> day transition with no executions', () => {
    const before = reduce(fivePlayerLog());
    const after = applyEvent(before, evt('PHASE_ADVANCED', { phase: 'day', number: 1 }));
    expect(after.todaysExecutions).toBe(before.todaysExecutions);
  });
});
