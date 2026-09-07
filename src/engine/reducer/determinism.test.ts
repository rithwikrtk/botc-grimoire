import { describe, expect, it } from 'vitest';
import { reduce } from './fold';
import type { GameEvent } from '../events';

function log(): GameEvent[] {
  let seq = 0;
  const e = <T extends GameEvent['type']>(
    type: T,
    payload: Extract<GameEvent, { type: T }>['payload'],
    txId: string,
  ): GameEvent => ({ seq: seq++, txId, ts: 1_700_000_000_000 + seq, type, payload }) as GameEvent;

  return [
    e('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: [
        { id: 'p1', name: 'A', seat: 0 },
        { id: 'p2', name: 'B', seat: 1 },
        { id: 'p3', name: 'C', seat: 2 },
        { id: 'p4', name: 'D', seat: 3 },
        { id: 'p5', name: 'E', seat: 4 },
      ],
    }, 't1'),
    e('ROLES_ASSIGNED', {
      assignments: { p1: 'imp', p2: 'poisoner', p3: 'empath', p4: 'monk', p5: 'chef' },
      distribution: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: 'p3',
    }, 't2'),
    e('PHASE_ADVANCED', { phase: 'night', number: 1 }, 't3'),
    e('STATUS_APPLIED', {
      playerId: 'p4',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    }, 't4'),
    e('NIGHT_STEP_RESOLVED', {
      stepId: 'empath',
      actorIds: ['p3'],
      perceivedCharacterId: 'empath',
      targets: [],
      chosenAnswer: '1',
      answerClass: 'canonical',
      registrationRulings: [],
      abilityFunctional: true,
      effectSuppressed: false,
    }, 't5'),
    e('PHASE_ADVANCED', { phase: 'day', number: 1 }, 't6'),
    e('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p3', nomineeId: 'p1' }, 't7'),
    e('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' }, 't8'),
    e('VOTE_CAST', { nominationId: 'n1', voterId: 'p4' }, 't9'),
    e('NOMINATION_CLOSED', { id: 'n1', auditTally: 2, auditThreshold: 3, butlerVotesFlagged: [] }, 't10'),
    e('NOTE_ADDED', { id: 'note1', scope: 'game', text: 'p4 claimed Monk loudly' }, 't11'),
  ];
}

describe('reducer determinism (§3.3)', () => {
  it('produces a deep-equal state when reduced twice', () => {
    expect(reduce(log())).toEqual(reduce(log()));
  });

  // Events are what get persisted (§12), so the round trip that matters is over
  // events. State holds a Set, which JSON does not preserve — see the plan's note.
  it('produces a deep-equal state after a JSON round trip of the events', () => {
    const events = log();
    const roundTripped = JSON.parse(JSON.stringify(events)) as typeof events;
    expect(reduce(roundTripped)).toEqual(reduce(events));
  });

  it('survives being reduced with the impurity guards armed', () => {
    // This test file lives under src/engine/reducer/, so purity.setup.ts has
    // stubbed Math.random, Date, performance.now and crypto to throw. If any of
    // them is reached from applyEvent this test fails with a purity violation.
    expect(() => reduce(log())).not.toThrow();
  });
});
