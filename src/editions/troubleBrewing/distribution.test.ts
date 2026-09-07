import { describe, expect, it } from 'vitest';
import { DISTRIBUTION, distributionFor } from './distribution';

const OFFICIAL: Array<[number, number, number, number, number]> = [
  // players, townsfolk, outsiders, minions, demons
  [5, 3, 0, 1, 1],
  [6, 3, 1, 1, 1],
  [7, 5, 0, 1, 1],
  [8, 5, 1, 1, 1],
  [9, 5, 2, 1, 1],
  [10, 7, 0, 2, 1],
  [11, 7, 1, 2, 1],
  [12, 7, 2, 2, 1],
  [13, 9, 0, 3, 1],
  [14, 9, 1, 3, 1],
  [15, 9, 2, 3, 1],
];

describe('player-count distribution chart', () => {
  it.each(OFFICIAL)(
    '%i players -> %i townsfolk, %i outsiders, %i minions, %i demons',
    (players, townsfolk, outsider, minion, demon) => {
      expect(distributionFor(players)).toEqual({ townsfolk, outsider, minion, demon });
    },
  );

  it.each(OFFICIAL)('%i players sums to the player count', (players) => {
    const d = distributionFor(players);
    expect(d.townsfolk + d.outsider + d.minion + d.demon).toBe(players);
  });

  it('covers exactly 5 to 15 and nothing else', () => {
    expect(Object.keys(DISTRIBUTION).map(Number).sort((a, b) => a - b)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(() => distributionFor(4)).toThrow(/between 5 and 15/);
    expect(() => distributionFor(16)).toThrow(/between 5 and 15/);
  });

  // Freeze depth — the map is frozen, but so must each TeamCounts value it hands out.
  it('freezes each TeamCounts value', () => {
    expect(Object.isFrozen(distributionFor(10))).toBe(true);
  });
});
