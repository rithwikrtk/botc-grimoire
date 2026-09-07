import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { nextStep, nightOverview, stepKey } from './nightCursor';
import { FIRST_NIGHT, OTHER_NIGHTS } from '@/editions/troubleBrewing/nightOrder';

function nine(upTo: { kind: 'night' | 'day'; number: number }) {
  return buildGame({
    roles: [
      ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'scarlet_woman'], ['p4', 'undertaker'],
      ['p5', 'ravenkeeper'], ['p6', 'chef'], ['p7', 'empath'], ['p8', 'butler'], ['p9', 'saint'],
    ],
    upTo,
  });
}

/** Settles the current step, whatever it is, without caring what it does. */
function settleCurrent(builder: ReturnType<typeof nine>): string | null {
  const position = nextStep(builder.state);
  if (!position) return null;
  const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
  builder.push('NIGHT_STEP_SKIPPED', {
    stepId: position.step.id,
    actorIds,
    reason: 'st_skip',
  });
  return position.step.id;
}

describe('stepKey (§3.7, §6.1)', () => {
  it('is night-scoped and per-actor for a per-actor step', () => {
    const monk = OTHER_NIGHTS.find((s) => s.id === 'monk')!;
    expect(stepKey(monk, { kind: 'night', number: 3 }, 'p4')).toBe('3:monk:p4');
  });

  it('is one key for the whole set on a group step', () => {
    // minion_info is grouping 'group' (unlike dusk, which is 'pseudo' and takes
    // the same GROUP-key branch for a different reason) — it only runs on the
    // first night (guide §2, §5.2), hence FIRST_NIGHT here.
    const minionInfo = FIRST_NIGHT.find((s) => s.id === 'minion_info')!;
    expect(minionInfo.grouping).toBe('group');
    expect(stepKey(minionInfo, { kind: 'night', number: 3 }, null)).toBe('3:minion_info:GROUP');
  });
});

describe('nextStep (§6.1)', () => {
  it('starts at dusk on night 1', () => {
    expect(nextStep(nine({ kind: 'night', number: 1 }).state)?.step.id).toBe('dusk_confirm_eyes_closed');
  });

  // The v3.1 bug: without the night in the key, night 2 ends before it starts.
  it('offers a full night 2 even though the same step ids settled on night 1', () => {
    const b = nine({ kind: 'night', number: 1 });
    let guard = 0;
    while (settleCurrent(b) !== null) {
      if (++guard > 100) throw new Error('night 1 did not terminate');
    }
    expect(nextStep(b.state)).toBeNull();

    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DAY_CLOSED', {});
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    expect(nextStep(b.state)?.step.id).toBe('dusk_confirm_eyes_closed');
  });

  // v2 counted only resolved steps, so tapping skip returned the same step forever.
  it('treats a skipped step as settled and advances', () => {
    const b = nine({ kind: 'night', number: 2 });
    const first = settleCurrent(b);
    expect(first).toBe('dusk_confirm_eyes_closed');
    // Asserted against the real next step id, not just "not the same as
    // before" — that weaker assertion is satisfied by `undefined` too, so a
    // cursor that stalled to null after one skip would pass a test named for
    // catching exactly that stall.
    expect(nextStep(b.state)?.step.id).toBe('poisoner');
  });

  it('offers a per-actor step once per actor', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'empath'], ['p4', 'drunk'],
        ['p5', 'chef'], ['p6', 'monk'], ['p7', 'soldier'],
      ],
      drunkBelief: { playerId: 'p4', believesCharacterId: 'empath' },
      upTo: { kind: 'night', number: 2 },
    });
    const seen: Array<string | undefined> = [];
    for (let i = 0; i < 40; i += 1) {
      const position = nextStep(b.state);
      if (!position) break;
      if (position.step.id === 'empath') seen.push(position.actor?.id);
      const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
      b.push('NIGHT_STEP_SKIPPED', { stepId: position.step.id, actorIds, reason: 'st_skip' });
    }
    expect(seen).toEqual(['p3', 'p4']);
  });

  it('settles a group step once for the whole set', () => {
    const b = nine({ kind: 'night', number: 1 });
    // Settle dusk, then Minion info: one event covering the group.
    settleCurrent(b);
    const position = nextStep(b.state)!;
    expect(position.step.id).toBe('minion_info');
    expect(position.actor).toBeNull();
    b.push('NIGHT_STEP_RESOLVED', {
      stepId: 'minion_info',
      actorIds: position.actors.map((p) => p.id),
      targets: [],
      chosenAnswer: 'shown the Demon',
      answerClass: 'canonical',
      registrationRulings: [],
      abilityFunctional: true,
      effectSuppressed: false,
    });
    expect(nextStep(b.state)?.step.id).toBe('demon_info');
  });

  // §6.1 — deliberately non-monotonic. A mid-night promotion re-opens an earlier step.
  it('re-opens an earlier step after a mid-night Scarlet Woman promotion', () => {
    const b = nine({ kind: 'night', number: 2 });
    let position = nextStep(b.state)!;
    while (position.step.id !== 'imp') {
      const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
      b.push('NIGHT_STEP_SKIPPED', { stepId: position.step.id, actorIds, reason: 'st_skip' });
      position = nextStep(b.state)!;
    }
    // The Imp self-kills; the Scarlet Woman is promoted mid-night.
    b.push('NIGHT_STEP_RESOLVED', {
      stepId: 'imp',
      actorIds: ['p1'],
      perceivedCharacterId: 'imp',
      targets: ['p1'],
      chosenAnswer: 'starpass',
      answerClass: 'canonical',
      registrationRulings: [],
      abilityFunctional: true,
      effectSuppressed: false,
    });
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'demon' });
    b.push('ROLE_CHANGED', { playerId: 'p3', from: 'scarlet_woman', to: 'imp', reason: 'scarlet_woman' });

    // scarlet_woman_notify sits BEFORE imp in the order, and is now unsettled for p3.
    expect(nextStep(b.state)?.step.id).toBe('scarlet_woman_notify');
    expect(nextStep(b.state)?.actor?.id).toBe('p3');
  });

  it('returns null once the game is over (§4.7)', () => {
    const b = nine({ kind: 'night', number: 2 });
    b.push('GAME_ENDED', { winner: 'good', reason: 'demon_dead' });
    expect(nextStep(b.state)).toBeNull();
  });

  it('returns null during the day', () => {
    expect(nextStep(nine({ kind: 'day', number: 1 }).state)).toBeNull();
  });

  it('terminates when every step is skipped', () => {
    const b = nine({ kind: 'night', number: 2 });
    let steps = 0;
    while (settleCurrent(b) !== null) {
      if (++steps > 100) throw new Error('cursor did not terminate');
    }
    expect(nextStep(b.state)).toBeNull();
    expect(steps).toBeGreaterThan(5);
  });

  it('reports conditionMet false rather than hiding the step', () => {
    const b = nine({ kind: 'night', number: 2 });
    let position = nextStep(b.state)!;
    const guard = new Set<string>();
    while (position.step.id !== 'undertaker') {
      const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
      b.push('NIGHT_STEP_SKIPPED', { stepId: position.step.id, actorIds, reason: 'st_skip' });
      const next = nextStep(b.state);
      if (!next) throw new Error('never reached the Undertaker');
      if (guard.has(next.key)) throw new Error('cursor looped');
      guard.add(next.key);
      position = next;
    }
    // Nobody was executed, so the step is offered with conditionMet false and the
    // command layer will auto-skip it with reason 'condition_unmet' (§6.1).
    expect(position.conditionMet).toBe(false);
  });
});

describe('nightOverview (§8.1)', () => {
  it('labels settled, current and upcoming steps for tonight', () => {
    const b = nine({ kind: 'night', number: 2 });
    settleCurrent(b);
    const overview = nightOverview(b.state);
    expect(overview[0]?.state).toBe('settled');
    expect(overview.filter((row) => row.state === 'current')).toHaveLength(1);
    expect(overview.some((row) => row.state === 'upcoming')).toBe(true);
  });

  it('is empty during the day', () => {
    expect(nightOverview(nine({ kind: 'day', number: 1 }).state)).toEqual([]);
  });
});
