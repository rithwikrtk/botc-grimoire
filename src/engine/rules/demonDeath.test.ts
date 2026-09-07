import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { onDemonDeath } from './demonDeath';

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
});
