import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LogBuilder } from '@test/helpers/game';
import { expiryFor, isStatusActive } from '@/engine/phase';
import { isPoisoned, isProtected } from '@/engine/selectors/statuses';
import { toRulesView } from '@/engine/selectors/rulesView';
import type { GameState, Phase } from '@/engine/types';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'monk'],
  ['p4', 'butler'],
  ['p5', 'chef'],
  ['p6', 'empath'],
  ['p7', 'soldier'],
];

interface TraceAction {
  poisonTarget: number;
  protectTarget: number;
  masterTarget: number;
  killPoisoner: boolean;
}

const traceArb = fc.array(
  fc.record({
    poisonTarget: fc.integer({ min: 0, max: 6 }),
    protectTarget: fc.integer({ min: 0, max: 6 }),
    masterTarget: fc.integer({ min: 0, max: 6 }),
    killPoisoner: fc.boolean(),
  }),
  { minLength: 1, maxLength: 5 },
);

/** Plays out `actions`, one night each, applying statuses the way the engine will. */
function playTrace(actions: TraceAction[]): { builder: LogBuilder; nights: number } {
  const builder = new LogBuilder();
  builder.push('GAME_CREATED', {
    edition: { id: 'troubleBrewing', version: '1' },
    players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
  });
  builder.push('ROLES_ASSIGNED', {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
    setupModifiers: [],
    demonBluffs: null,
    drunkBelief: null,
    redHerring: null,
  });

  // `poisonerAlive` gates the DEATH event only (never fire it twice), NOT the
  // STATUS_APPLIED below. An earlier version of this helper also gated the
  // poison mark on it, which broke the "independent of whether the source is
  // alive" property below for an uninteresting reason: it made the two
  // branches under comparison apply a DIFFERENT NUMBER of poison marks (the
  // "early" branch silently stopped growing new marks once the Poisoner died),
  // so the two traces diverged in what happened, not merely in whether the
  // source survived. Applying the mark unconditionally, like `protected` and
  // `master` already do below, keeps the two branches identical in every
  // respect except the DEATH event, which is what the invariant is about.
  let poisonerAlive = true;
  actions.forEach((action, index) => {
    const night = index + 1;
    builder.push('PHASE_ADVANCED', { phase: 'night', number: night });
    const now: Phase = { kind: 'night', number: night };

    builder.push('STATUS_APPLIED', {
      playerId: ROLES[action.poisonTarget]![0],
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', now),
    });
    builder.push('STATUS_APPLIED', {
      playerId: ROLES[action.protectTarget]![0],
      status: 'protected',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('until_dawn', now),
    });
    builder.push('STATUS_APPLIED', {
      playerId: ROLES[action.masterTarget]![0],
      status: 'master',
      sourcePlayerId: 'p4',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', now),
    });

    builder.push('PHASE_ADVANCED', { phase: 'day', number: night });
    if (action.killPoisoner && poisonerAlive) {
      builder.push('DEATH', {
        playerId: 'p2',
        characterIdAtDeath: 'poisoner',
        cause: 'execution',
        executionKind: 'vote',
      });
      poisonerAlive = false;
    }
    builder.push('DAY_CLOSED', {});
  });

  return { builder, nights: actions.length };
}

function poisonedIds(state: GameState): string[] {
  const view = toRulesView(state);
  return view.players.filter((p) => isPoisoned(p, view.phase)).map((p) => p.id);
}

function protectedIds(state: GameState): string[] {
  const view = toRulesView(state);
  return view.players.filter((p) => isProtected(p, view.phase)).map((p) => p.id);
}

describe('status timeline invariants (§14 Tier 1, §4.4)', () => {
  it('never carries night-N poison into night N+1', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        for (let cut = 1; cut <= actions.length; cut += 1) {
          const { builder } = playTrace(actions.slice(0, cut));
          // Open the next night and check nothing from the previous one survives.
          builder.push('PHASE_ADVANCED', { phase: 'night', number: cut + 1 });
          const carried = poisonedIds(builder.state);
          expect(carried).toEqual([]);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps night-N poison active through day N', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        const first = actions[0]!;
        const { builder } = playTrace([first]);
        // playTrace ends at DAY_CLOSED on day 1, so the current phase is day 1.
        expect(builder.state.phase).toEqual({ kind: 'day', number: 1 });
        expect(poisonedIds(builder.state)).toEqual([ROLES[first.poisonTarget]![0]]);
      }),
      { numRuns: 200 },
    );
  });

  it('never lets protection survive dawn', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        for (let cut = 1; cut <= actions.length; cut += 1) {
          const { builder } = playTrace(actions.slice(0, cut));
          expect(protectedIds(builder.state)).toEqual([]);
        }
      }),
      { numRuns: 200 },
    );
  });

  // §4.4 — declarative and time-driven, never actor-driven. Executing the
  // Poisoner the day after they acted must neither cancel their poison early nor
  // extend it, so the two traces must agree at every phase.
  it('makes expiry independent of whether the source is alive', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        const never = actions.map((a) => ({ ...a, killPoisoner: false }));
        const early = actions.map((a, index) => ({ ...a, killPoisoner: index === 0 }));
        for (let cut = 1; cut <= actions.length; cut += 1) {
          const a = playTrace(never.slice(0, cut)).builder;
          const b = playTrace(early.slice(0, cut)).builder;
          // Compare at the end of every phase the traces reached.
          expect(poisonedIds(b.state)).toEqual(poisonedIds(a.state));
          expect(protectedIds(b.state)).toEqual(protectedIds(a.state));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never leaves a status active in a phase before it was applied', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        const { builder } = playTrace(actions);
        for (const player of builder.state.players) {
          for (const status of player.statusLedger) {
            const earlier: Phase = { kind: 'night', number: status.appliedAt.number - 1 };
            if (earlier.number >= 1) {
              expect(isStatusActive(status, earlier)).toBe(false);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
