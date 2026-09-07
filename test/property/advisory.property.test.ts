import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { characterById } from '@/editions/troubleBrewing/characters';
import { createStore, type Store } from '@/engine/commands/store';
import type { GameState } from '@/engine/types';

/**
 * R21 — this seven-player roster is deliberately NOT chart-legal: it is 3
 * townsfolk / 1 outsider / 2 minions / 1 demon, while DISTRIBUTION[7] is
 * 5/0/1/1. It never reaches `validateDeal` — the seed below emits
 * `ROLES_ASSIGNED` directly via `tx.emit`, not through `assignRoles` — precisely
 * so it can fuzz arbitrary and illegal states, which is the whole point of an
 * advisory-invariant fuzzer (§4.8: a flagged, illegal INPUT must not corrupt
 * derived state). Making it legal would cost either the Saint (§4.7 row 2 needs
 * it), the second Minion, or a move to eight players, each of which changes
 * what the fuzz explores. Left alone on purpose.
 */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'saint'],
];
const IDS = ROLES.map(([id]) => id);

/**
 * Arbitrary raw event streams, including illegal ones — the point of §4.8 is that
 * a flagged, illegal input is recorded and cannot corrupt derived state.
 */
type Action =
  | { kind: 'death'; playerId: string }
  | { kind: 'execution'; playerId: string }
  | { kind: 'nominate'; nominatorId: string; nomineeId: string }
  | { kind: 'vote'; voterId: string }
  | { kind: 'advance' }
  | { kind: 'promote'; playerId: string };

const actionArb = fc.oneof(
  fc.record({ kind: fc.constant('death' as const), playerId: fc.constantFrom(...IDS) }),
  fc.record({ kind: fc.constant('execution' as const), playerId: fc.constantFrom(...IDS) }),
  fc.record({
    kind: fc.constant('nominate' as const),
    nominatorId: fc.constantFrom(...IDS),
    nomineeId: fc.constantFrom(...IDS),
  }),
  fc.record({ kind: fc.constant('vote' as const), voterId: fc.constantFrom(...IDS) }),
  fc.record({ kind: fc.constant('advance' as const) }),
  fc.record({ kind: fc.constant('promote' as const), playerId: fc.constantFrom(...IDS) }),
);

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('seed', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 3, outsider: 1, minion: 2, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: 'p4',
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
  return store;
}

function play(store: Store, actions: readonly Action[]): void {
  let nominationCount = 0;
  let lastNominationId: string | null = null;

  for (const action of actions) {
    // Every action is attempted, however illegal. Nothing is filtered out: that
    // is the whole point.
    try {
      store.transaction('fuzz', (tx) => {
        const state = tx.state();
        switch (action.kind) {
          case 'death':
          case 'execution': {
            const player = state.players.find((p) => p.id === action.playerId)!;
            tx.emit('DEATH', {
              playerId: action.playerId,
              characterIdAtDeath: player.characterId,
              cause: action.kind === 'execution' ? 'execution' : 'demon',
              ...(action.kind === 'execution' ? { executionKind: 'vote' as const } : {}),
            });
            tx.flag('fuzz', 'integrity', 'generated');
            break;
          }
          case 'nominate': {
            lastNominationId = `n${++nominationCount}`;
            tx.emit('NOMINATION_OPENED', {
              id: lastNominationId,
              nominatorId: action.nominatorId,
              nomineeId: action.nomineeId,
            });
            tx.flag('fuzz', 'social', 'generated');
            break;
          }
          case 'vote': {
            if (lastNominationId) {
              tx.emit('VOTE_CAST', { nominationId: lastNominationId, voterId: action.voterId });
            }
            break;
          }
          case 'advance': {
            const next =
              state.phase.kind === 'night'
                ? { phase: 'day' as const, number: state.phase.number }
                : { phase: 'night' as const, number: state.phase.number + 1 };
            tx.emit('PHASE_ADVANCED', next);
            break;
          }
          case 'promote': {
            const player = state.players.find((p) => p.id === action.playerId)!;
            tx.emit('ROLE_CHANGED', {
              playerId: action.playerId,
              from: player.characterId,
              to: 'imp',
              reason: 'st_correction',
            });
            break;
          }
        }
      });
    } catch {
      // A command may legitimately refuse (a backwards PHASE_ADVANCED throws).
      // A refusal is fine; corruption is not.
    }
  }
}

function invariants(state: GameState): void {
  const aliveCount = state.players.filter((p) => p.alive).length;
  // §4.8 — no sequence of flagged events can make aliveCount negative...
  expect(aliveCount).toBeGreaterThanOrEqual(0);
  expect(aliveCount).toBeLessThanOrEqual(state.players.length);

  // ...or emit a DEATH for a player already dead: one death record per player.
  const deathCounts = new Map<string, number>();
  for (const death of state.deaths) {
    deathCounts.set(death.playerId, (deathCounts.get(death.playerId) ?? 0) + 1);
  }
  for (const count of deathCounts.values()) expect(count).toBe(1);

  // Every dead player has exactly one death record, and vice versa.
  const dead = state.players.filter((p) => !p.alive).map((p) => p.id).sort();
  expect([...deathCounts.keys()].sort()).toEqual(dead);

  // A vote is recorded at most once per voter per nomination.
  for (const nomination of state.nominations) {
    const voters = nomination.votes.map((v) => v.voterId);
    expect(new Set(voters).size).toBe(voters.length);
  }

  // Seating is immutable: the seats are always 0..n-1, each once (§18).
  expect(state.players.map((p) => p.seat).sort((a, b) => a - b)).toEqual(
    state.players.map((_, index) => index),
  );
}

describe('advisory enforcement invariants (§4.8, §14 Tier 1)', () => {
  it('cannot be driven into a corrupt state by any sequence of flagged events', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 25 }), (actions) => {
        const store = seeded();
        play(store, actions as Action[]);
        invariants(store.getState());
      }),
      { numRuns: 400 },
    );
  });

  it('never produces two living Demons', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 25 }), (actions) => {
        const store = seeded();
        play(store, actions as Action[]);
        const livingDemons = store
          .getState()
          .players.filter((p) => p.alive && characterById(p.characterId).team === 'demon');
        expect(livingDemons.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 400 },
    );
  });

  it('survives undoing every transaction back to the seed', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 15 }), (actions) => {
        const store = seeded();
        play(store, actions as Action[]);
        let guard = 0;
        while (store.canUndo()) {
          store.undo();
          invariants(store.getState());
          if (++guard > 100) throw new Error('undo did not converge');
        }
        expect(store.getEvents()).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });
});
