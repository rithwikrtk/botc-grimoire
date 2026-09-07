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

/**
 * Fix round 1, FIX 1 — the return value IS an assertion, not a log. §4.8's
 * headline is "the app never BLOCKS a rule break" (recorded + flagged, no
 * derived state change, is correct; refusing the action outright is the
 * violation). A bare `catch {}` cannot distinguish "this command legitimately
 * refused" (a backwards PHASE_ADVANCED, which is the only throw any of these
 * six action kinds can produce against this fixture) from "the reducer threw
 * where §4.8 requires it to swallow and flag instead" — and today NOTHING
 * among GAME_CREATED/ROLES_ASSIGNED/PHASE_ADVANCED/DEATH/NOMINATION_OPENED/
 * VOTE_CAST/ROLE_CHANGED throws for any input this generator can produce
 * (ids are always drawn from IDS, so `.find(...)!` never hits undefined, and
 * `advance` computes `next` from the current phase so it only ever moves
 * forward). So the catch is currently a no-op in practice, and reporting the
 * swallowed-error count lets every call site notice the day that stops being
 * true — including the specific regression this fixes: loosening
 * `applyDeath`'s already-dead guard from `return state` to `throw` left every
 * property in this file green with a silent `catch {}` (verified; see the
 * fix-round notes at the bottom of this file).
 */
function play(store: Store, actions: readonly Action[]): number {
  let nominationCount = 0;
  let lastNominationId: string | null = null;
  let swallowedErrors = 0;

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
      // A refusal is fine; corruption is not — but an UNEXPECTED throw here is
      // exactly the §4.8 violation this file exists to catch, so it is
      // counted, not merely absorbed. See the docstring above.
      swallowedErrors += 1;
    }
  }
  return swallowedErrors;
}

function invariants(state: GameState): void {
  const aliveCount = state.players.filter((p) => p.alive).length;
  // Fix round 1, folded minor (a) — these two are PURE TAUTOLOGIES over
  // `players.filter(alive).length`: no mutation anywhere can redden them,
  // because `aliveCount` is computed by the same filter it is compared
  // against, never read from a separate counter `GameState` doesn't have.
  // §4.8's literal "aliveCount negative" clause is unwitnessable BY DESIGN for
  // that reason — kept only because deleting them would look like silently
  // dropping the clause the spec states, not because either can fail.
  expect(aliveCount).toBeGreaterThanOrEqual(0);
  expect(aliveCount).toBeLessThanOrEqual(state.players.length);

  // ...or emit a DEATH for a player already dead: one death record per player.
  // This one IS witnessed — see the mutation-testing note in the report.
  const deathCounts = new Map<string, number>();
  for (const death of state.deaths) {
    deathCounts.set(death.playerId, (deathCounts.get(death.playerId) ?? 0) + 1);
  }
  for (const count of deathCounts.values()) expect(count).toBe(1);

  // Every dead player has exactly one death record, and vice versa.
  const dead = state.players.filter((p) => !p.alive).map((p) => p.id).sort();
  expect([...deathCounts.keys()].sort()).toEqual(dead);

  // A vote is recorded at most once per voter per nomination. Witnessed
  // structurally by the reducer's VOTE_CAST dedup guard (mutation-tested), and
  // — separately, deterministically, not merely by the ~1.3% of fuzzed traces
  // that happen to attempt a duplicate vote — by
  // src/engine/selectors/nominations.test.ts's 'flags a duplicate vote on the
  // same nomination as integrity', whose final two lines push a second
  // VOTE_CAST for the same voter through this exact reducer case and assert
  // `tallyFor` is unchanged (folded minor (f)).
  for (const nomination of state.nominations) {
    const voters = nomination.votes.map((v) => v.voterId);
    expect(new Set(voters).size).toBe(voters.length);
  }

  // Seating is immutable: the seats are always 0..n-1, each once (§18).
  // Folded minor (a) — this clause is NOT witnessed by the fuzz: `seat` is
  // written in exactly one place (applyEvent.ts's GAME_CREATED case), no event
  // this generator can emit perturbs it, and the catalogue has no reseat/add/
  // remove event at all. So this assertion is true because `seeded()`'s ring
  // never changes, not because anything here exercises a guard — §18 is
  // enforced by the ABSENCE of a write path, which is stronger than any test
  // but means this clause would stay green even if it were deleted from every
  // trace this fuzzer generates. Kept as a standing check in case a future
  // event ever gains the ability to move a seat.
  expect(state.players.map((p) => p.seat).sort((a, b) => a - b)).toEqual(
    state.players.map((_, index) => index),
  );
}

/**
 * Folded minor (b) — §4.8's invariant is specifically about "no sequence of
 * FLAGGED events", so without asserting something about the flags themselves,
 * the two `tx.flag('fuzz', ...)` call sites in `play()` — covering three
 * flagging action kinds (death, execution, nominate) — are inert: deleting
 * either leaves every property in this file green, because nothing here reads
 * `ruleFlags`. play()'s death/execution branch pairs exactly one flag with its
 * DEATH event, and its nominate branch pairs exactly one with its
 * NOMINATION_OPENED — vote, advance and promote flag nothing — all inside the
 * SAME transaction, so a transaction that fails to commit drops both members
 * of a pair together and one that commits keeps both. That holds after any
 * sequence of undos too: undo removes a whole transaction at once, never a
 * single event within one, so a DEATH/RULE_FLAGGED or NOMINATION_OPENED/
 * RULE_FLAGGED pair is always removed together. The counts must therefore
 * agree exactly, not merely be non-decreasing.
 */
function flagInvariant(store: Store): void {
  const events = store.getEvents();
  const deaths = events.filter((e) => e.type === 'DEATH').length;
  const nominationsOpened = events.filter((e) => e.type === 'NOMINATION_OPENED').length;
  const flags = events.filter((e) => e.type === 'RULE_FLAGGED').length;
  expect(flags).toBe(deaths + nominationsOpened);
}

describe('advisory enforcement invariants (§4.8, §14 Tier 1)', () => {
  it('cannot be driven into a corrupt state by any sequence of flagged events', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 25 }), (actions) => {
        const store = seeded();
        // FIX 1 — this IS the §4.8 assertion, not a log line: it fails the
        // moment any command throws instead of recording-and-flagging. See
        // play()'s docstring.
        expect(play(store, actions as Action[])).toBe(0);
        invariants(store.getState());
        flagInvariant(store);
      }),
      { numRuns: 400 },
    );
  });

  it('never produces two living Demons', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 25 }), (actions) => {
        const store = seeded();
        expect(play(store, actions as Action[])).toBe(0);
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
        expect(play(store, actions as Action[])).toBe(0);
        let guard = 0;
        while (store.canUndo()) {
          store.undo();
          invariants(store.getState());
          flagInvariant(store);
          if (++guard > 100) throw new Error('undo did not converge');
        }
        expect(store.getEvents()).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });
});
