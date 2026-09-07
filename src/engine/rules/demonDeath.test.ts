import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { demonDeathDerivation, onDemonDeath } from './demonDeath';

/** 7 seats. Fixtures record their own counts and never go through assignRoles,
 *  which is the gate that enforces chart legality (Task 5). */
const WITH_SW: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'scarlet_woman'],
  ['p3', 'poisoner'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

const NO_SW: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'baron'],
  ['p3', 'poisoner'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

function game(roles: Array<[string, string]>, dead: string[] = []): LogBuilder {
  const b = buildGame({ roles, upTo: { kind: 'night', number: 2 } });
  for (const id of dead) {
    const characterId = roles.find(([playerId]) => playerId === id)![1];
    b.push('DEATH', { playerId: id, characterIdAtDeath: characterId, cause: 'demon' });
  }
  return b;
}

describe('onDemonDeath — the Scarlet Woman (§4.6, §16.1)', () => {
  it('promotes her at 5 alive, counting the dying Demon', () => {
    // Kill two of seven: five alive, including the Imp who is about to die.
    const b = game(WITH_SW, ['p6', 'p7']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toEqual({
      kind: 'resolved',
      aliveCountAtDeath: 5,
      successorId: 'p2',
      successorReason: 'scarlet_woman',
    });
  });

  it('does NOT promote her at 4 alive', () => {
    const b = game(WITH_SW, ['p5', 'p6', 'p7']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toEqual({
      kind: 'resolved',
      aliveCountAtDeath: 4,
      successorId: null,
      successorReason: null,
    });
  });

  it('does not promote a dead Scarlet Woman', () => {
    const b = game(WITH_SW, ['p2']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: null, successorReason: null });
  });

  it('does not promote a poisoned Scarlet Woman', () => {
    const b = game(WITH_SW);
    b.push('STATUS_APPLIED', {
      playerId: 'p2',
      status: 'poisoned',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: null, successorReason: null });
  });

  it('promotes her on a daytime execution too — the handler is phase-agnostic', () => {
    const b = buildGame({ roles: WITH_SW, upTo: { kind: 'day', number: 3 } });
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: 'p2', successorReason: 'scarlet_woman' });
  });
});

describe('onDemonDeath — the starpass (§4.6, §16.9)', () => {
  // §16.9 — genuinely contested; the recorded default is that she wins.
  it('gives the Scarlet Woman precedence over the starpass', () => {
    const b = game(WITH_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: true });
    expect(outcome).toMatchObject({ successorId: 'p2', successorReason: 'scarlet_woman' });
  });

  // §16.9 is contested, so the constant's OTHER branch is tested too — flipping it
  // at the table must not silently break the case it was not flipped for.
  it('defers to the starpass when SCARLET_WOMAN_BEATS_STARPASS is false', () => {
    const b = game(WITH_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', {
      starpass: true,
      scarletWomanBeatsStarpass: false,
    });
    expect(outcome.kind).toBe('needs_successor_choice');
    if (outcome.kind !== 'needs_successor_choice') throw new Error('wrong shape');
    // She is a living Minion, so she remains a legal choice — just not automatic.
    expect(outcome.candidates).toContain('p2');
  });

  it('still promotes her on a NON-starpass death when the constant is false', () => {
    const b = game(WITH_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', {
      starpass: false,
      scarletWomanBeatsStarpass: false,
    });
    expect(outcome).toMatchObject({ successorId: 'p2', successorReason: 'scarlet_woman' });
  });

  it('asks the Storyteller to pick a successor on a starpass with no Scarlet Woman', () => {
    const b = game(NO_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: true });
    expect(outcome.kind).toBe('needs_successor_choice');
    if (outcome.kind !== 'needs_successor_choice') throw new Error('wrong shape');
    // Living Minions only, and never the dying Demon.
    expect(outcome.candidates.sort()).toEqual(['p2', 'p3']);
  });

  it('accepts the chosen successor', () => {
    const b = game(NO_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', {
      starpass: true,
      chosenSuccessorId: 'p3',
    });
    expect(outcome).toMatchObject({ successorId: 'p3', successorReason: 'starpass' });
  });

  it('rejects a successor who is not a living Minion', () => {
    const b = game(NO_SW);
    expect(() =>
      onDemonDeath(toRulesView(b.state), 'p1', { starpass: true, chosenSuccessorId: 'p4' }),
    ).toThrow(/living Minion/i);
  });

  it('has no successor on a starpass with no living Minion', () => {
    const b = game(NO_SW, ['p2', 'p3']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: true });
    expect(outcome).toEqual({
      kind: 'resolved',
      aliveCountAtDeath: 5,
      successorId: null,
      successorReason: null,
    });
  });

  it('has no successor on an ordinary death with no Scarlet Woman', () => {
    const b = game(NO_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: null, successorReason: null });
  });

  it('accepts a declined starpass (chosenSuccessorId: null) as no successor', () => {
    // Distinct from `undefined` (not asked yet): the Storyteller was asked and
    // declined. Legal — the Imp's ability only says another player "might"
    // become the Demon (§16.7's Mayor bounce uses the same undefined/null/id idiom).
    const b = game(NO_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', {
      starpass: true,
      chosenSuccessorId: null,
    });
    expect(outcome).toEqual({
      kind: 'resolved',
      aliveCountAtDeath: 7,
      successorId: null,
      successorReason: null,
    });
  });
});

describe('onDemonDeath — the true-character guard (§4.6, §16.12)', () => {
  const RECLUSE_ROLES: Array<[string, string]> = [
    ['p1', 'imp'],
    ['p2', 'recluse'],
    ['p3', 'poisoner'],
    ['p4', 'chef'],
    ['p5', 'empath'],
    ['p6', 'monk'],
    ['p7', 'soldier'],
  ];

  it('throws when the dead player\'s true character is not the Demon — a Recluse dying to the Slayer promotes nobody', () => {
    const b = buildGame({ roles: RECLUSE_ROLES, upTo: { kind: 'day', number: 2 } });
    expect(() => onDemonDeath(toRulesView(b.state), 'p2', { starpass: false })).toThrow(
      /whose true character is recluse, not the Demon/,
    );
  });
});

describe('onDemonDeath — the pre-death view contract (§16.1)', () => {
  it('throws if handed a view where the named Demon is already dead', () => {
    // §16.1's arithmetic contract requires the view from BEFORE the DEATH event —
    // that's what makes aliveCountAtDeath count the dying Demon. A view where the
    // Demon is already dead is exactly the mistake that turns the Scarlet Woman's
    // threshold of 5 into 6, so it's rejected rather than silently miscounted.
    const b = game(WITH_SW, ['p1']);
    expect(() => onDemonDeath(toRulesView(b.state), 'p1', { starpass: false })).toThrow(
      /already dead.*§16\.1|§16\.1.*already dead/is,
    );
  });
});

describe('demonDeathDerivation (§8.2 — show your working)', () => {
  it('renders the Scarlet Woman becoming the Demon', () => {
    const b = game(WITH_SW);
    const view = toRulesView(b.state);
    const opts = { starpass: false };
    const outcome = onDemonDeath(view, 'p1', opts);
    expect(demonDeathDerivation(view, 'p1', opts, outcome)).toEqual([
      {
        label: 'alive at death',
        detail:
          'Player 1 (the dying Demon) Player 2 Player 3 Player 4 Player 5 Player 6 Player 7 -> 7 (the dying Demon counts, §16.1)',
      },
      { label: 'Scarlet Woman', detail: 'Player 2: alive, ability functional' },
      { label: 'result', detail: '7 >= 5 -> Player 2 becomes the Demon' },
    ]);
  });

  it('renders a starpass successor', () => {
    const b = game(NO_SW);
    const view = toRulesView(b.state);
    const opts = { starpass: true, chosenSuccessorId: 'p3' as const };
    const outcome = onDemonDeath(view, 'p1', opts);
    expect(demonDeathDerivation(view, 'p1', opts, outcome)).toEqual([
      {
        label: 'alive at death',
        detail:
          'Player 1 (the dying Demon) Player 2 Player 3 Player 4 Player 5 Player 6 Player 7 -> 7 (the dying Demon counts, §16.1)',
      },
      { label: 'Scarlet Woman', detail: 'not in play' },
      { label: 'result', detail: 'starpass -> Player 3 becomes the Demon' },
    ]);
  });

  it('renders no successor', () => {
    const b = game(NO_SW);
    const view = toRulesView(b.state);
    const opts = { starpass: false };
    const outcome = onDemonDeath(view, 'p1', opts);
    expect(demonDeathDerivation(view, 'p1', opts, outcome)).toEqual([
      {
        label: 'alive at death',
        detail:
          'Player 1 (the dying Demon) Player 2 Player 3 Player 4 Player 5 Player 6 Player 7 -> 7 (the dying Demon counts, §16.1)',
      },
      { label: 'Scarlet Woman', detail: 'not in play' },
      { label: 'result', detail: 'no successor — nobody holds the Demon' },
    ]);
  });

  // The specific case the wrong-prose defect was found in: a Scarlet Woman IS in
  // play, alive and functional, but below the alive-count threshold — the old
  // text hardcoded "starpass with no Scarlet Woman", which would have been wrong
  // here.
  it('renders needs_successor_choice with the actual reason — Scarlet Woman below threshold, NOT "no Scarlet Woman"', () => {
    const b = game(WITH_SW, ['p5', 'p6', 'p7']);
    const view = toRulesView(b.state);
    const opts = { starpass: true };
    const outcome = onDemonDeath(view, 'p1', opts);
    expect(demonDeathDerivation(view, 'p1', opts, outcome)).toEqual([
      {
        label: 'alive at death',
        detail: 'Player 1 (the dying Demon) Player 2 Player 3 Player 4 -> 4 (the dying Demon counts, §16.1)',
      },
      { label: 'Scarlet Woman', detail: 'Player 2: alive, ability functional' },
      {
        label: 'result',
        detail:
          'starpass, Scarlet Woman alive, but only 4 alive (< 5) -> choose a successor from 2 living Minion(s)',
      },
    ]);
  });
});
