import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from './rulesView';
import { perceivedCharacterId, playersWithPerceivedCharacter } from './players';

function game() {
  return buildGame({
    roles: [
      ['p1', 'imp'],
      ['p2', 'poisoner'],
      ['p3', 'empath'],
      ['p4', 'drunk'],
      ['p5', 'monk'],
      ['p6', 'soldier'],
      ['p7', 'chef'],
    ],
    // The Drunk believes they are the Empath — and a real Empath is also in play.
    drunkBelief: { playerId: 'p4', believesCharacterId: 'empath' },
  });
}

describe('perceivedCharacterId (§4.1)', () => {
  it('returns the believed character for the Drunk', () => {
    const v = toRulesView(game().state);
    expect(perceivedCharacterId(v, 'p4')).toBe('empath');
  });

  it('returns the true character for everyone else', () => {
    const v = toRulesView(game().state);
    expect(perceivedCharacterId(v, 'p3')).toBe('empath');
    expect(perceivedCharacterId(v, 'p1')).toBe('imp');
    expect(perceivedCharacterId(v, 'p6')).toBe('soldier');
  });

  it('returns the true character when a Drunk belief is recorded for someone else', () => {
    const v = toRulesView(game().state);
    // p6 is the Soldier and no belief names them, so no false self-belief applies.
    expect(perceivedCharacterId(v, 'p6')).toBe('soldier');
  });
});

describe('playersWithPerceivedCharacter (§4.1)', () => {
  it('wakes the real Empath and the Drunk-believing-Empath as two separate actors', () => {
    const v = toRulesView(game().state);
    const actors = playersWithPerceivedCharacter(v, 'empath').map((p) => p.id);
    expect(actors.sort()).toEqual(['p3', 'p4']);
  });

  it('does not wake the Drunk at the Drunk step', () => {
    const v = toRulesView(game().state);
    expect(playersWithPerceivedCharacter(v, 'drunk')).toEqual([]);
  });

  it('returns an array even for a character not in play', () => {
    const v = toRulesView(game().state);
    expect(playersWithPerceivedCharacter(v, 'ravenkeeper')).toEqual([]);
  });

  it('orders actors by seat so the night runs round the circle', () => {
    const v = toRulesView(game().state);
    const seats = playersWithPerceivedCharacter(v, 'empath').map((p) => p.seat);
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
  });
});
