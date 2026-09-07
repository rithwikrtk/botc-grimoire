import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from './rulesView';
import { aliveNeighbours, chefDerivation, chefPairs, empathCount, empathDerivation } from './seating';

/** Seats a ring of the given characters in order and kills the named players. */
function ring(characters: string[], dead: number[] = []) {
  const roles = characters.map((c, i) => [`p${i + 1}`, c] as [string, string]);
  const builder = buildGame({ roles });
  for (const index of dead) {
    builder.push('DEATH', {
      playerId: `p${index + 1}`,
      characterIdAtDeath: characters[index]!,
      cause: 'demon',
    });
  }
  return toRulesView(builder.state);
}

describe('chefPairs (§6.4, §8.2)', () => {
  it('counts zero when no evils are adjacent', () => {
    // 7 players: 5 townsfolk, 0 outsiders, 1 minion, 1 demon.
    const view = ring(['imp', 'chef', 'empath', 'poisoner', 'monk', 'soldier', 'mayor']);
    expect(chefPairs(view)).toBe(0);
  });

  it('counts one adjacent pair', () => {
    const view = ring(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor']);
    expect(chefPairs(view)).toBe(1);
  });

  it('wraps around the ring', () => {
    const view = ring(['imp', 'chef', 'empath', 'monk', 'soldier', 'mayor', 'poisoner']);
    expect(chefPairs(view)).toBe(1);
  });

  it('gives k-1 pairs for a run of k adjacent evils', () => {
    // 12 players: 7/2/2/1 — three evils, all adjacent, gives 2 pairs.
    const view = ring([
      'imp', 'poisoner', 'baron', 'chef', 'empath', 'monk',
      'soldier', 'mayor', 'virgin', 'slayer', 'butler', 'recluse',
    ]);
    expect(chefPairs(view)).toBe(2);
  });

  it('counts dead evils too — the ability has no life qualifier', () => {
    const view = ring(
      ['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor'],
      [1],
    );
    expect(chefPairs(view)).toBe(1);
  });

  it('shows its working (§8.2)', () => {
    const view = ring(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor']);
    const lines = chefDerivation(view);
    expect(lines[0]?.label).toBe('ring');
    expect(lines[0]?.detail).toMatch(/\(\* = evil\)/);
    expect(lines[0]?.detail).toMatch(/Player 1\*/);
    expect(lines[1]?.label).toBe('adjacent evil pairs');
    expect(lines[1]?.detail).toBe('(Player 1, Player 2)');
    expect(lines.at(-1)?.detail).toMatch(/-> 1$/);
    expect(lines.at(-1)?.detail).toMatch(/a run of k adjacent evils gives k-1 pairs; the ring wraps/);
  });
});

describe('aliveNeighbours and empathCount (§6.4, §8.2)', () => {
  const SEVEN = ['imp', 'poisoner', 'empath', 'chef', 'monk', 'soldier', 'mayor'];

  it('takes the immediate neighbours when both are alive', () => {
    const view = ring(SEVEN);
    // p3 is the Empath, between p2 (Poisoner, evil) and p4 (Chef, good).
    expect(aliveNeighbours(view, 'p3').map((p) => p.id).sort()).toEqual(['p2', 'p4']);
    expect(empathCount(view, 'p3')).toBe(1);
  });

  it('skips the dead outward in each direction', () => {
    // Kill p2 (evil) and p4 (good): neighbours become p1 (evil) and p5 (good).
    const view = ring(SEVEN, [1, 3]);
    expect(aliveNeighbours(view, 'p3').map((p) => p.id).sort()).toEqual(['p1', 'p5']);
    expect(empathCount(view, 'p3')).toBe(1);
  });

  it('wraps past the end of the ring', () => {
    // Empath at seat 0: neighbours are the last seat and seat 1.
    const view = ring(['empath', 'poisoner', 'chef', 'monk', 'soldier', 'mayor', 'imp']);
    expect(aliveNeighbours(view, 'p1').map((p) => p.id).sort()).toEqual(['p2', 'p7']);
    expect(empathCount(view, 'p1')).toBe(2);
  });

  it('counts a single remaining neighbour once, not twice', () => {
    // Only p3 (Empath) and p1 (Imp) are alive: p1 is both neighbours.
    const view = ring(SEVEN, [1, 3, 4, 5, 6]);
    expect(aliveNeighbours(view, 'p3').map((p) => p.id)).toEqual(['p1']);
    expect(empathCount(view, 'p3')).toBe(1);
  });

  it('returns zero when the Empath is the last one alive', () => {
    const view = ring(SEVEN, [0, 1, 3, 4, 5, 6]);
    expect(aliveNeighbours(view, 'p3')).toEqual([]);
    expect(empathCount(view, 'p3')).toBe(0);
  });

  it('shows its working, marking the dead it skipped (§8.2)', () => {
    const view = ring(SEVEN, [1]);
    const lines = empathDerivation(view, 'p3');
    expect(lines[0]?.label).toBe('seats');
    expect(lines[0]?.detail).toMatch(/Player 2 \(dead\)/);
    expect(lines[1]?.label).toBe('nearest alive either side, skipping the dead');
    expect(lines[1]?.detail).toBe('Player 1 · Player 4');
    expect(lines.at(-1)?.detail).toMatch(/-> 1$/);
  });
});
