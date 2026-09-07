import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { referenceChefPairs } from '@test/helpers/reference';
import { toRulesView } from './rulesView';
import {
  aliveNeighbours,
  chefDerivation,
  chefPairs,
  empathCount,
  empathDerivation,
  ringOrder,
} from './seating';
import type { AlignmentOverrides } from './seating';

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

  it('gives n pairs for a fully-evil ring — the run wraps with no gap (k gives k, not k-1)', () => {
    // Built directly, bypassing the property test's makeView, which always
    // excludes the Empath's own seat from the evil set and so can never reach
    // this branch (its evilCount is capped at size - 1). Unreachable in a
    // legal Trouble Brewing distribution, but chefPairs handles it anyway so
    // arbitrary rings agree with the naive reference — this is exactly that
    // agreement, asserted directly.
    const view = ring(['imp', 'poisoner', 'baron', 'scarlet_woman', 'spy']);
    expect(chefPairs(view)).toBe(5);
    expect(chefPairs(view)).toBe(referenceChefPairs(view));
  });

  it("cross-checks chefDerivation's pair-list length against chefPairs, including the fully-evil case", () => {
    const cases = [
      ring(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor']),
      ring(['imp', 'poisoner', 'baron', 'scarlet_woman', 'spy']),
    ];
    for (const view of cases) {
      const lines = chefDerivation(view);
      const pairsDetail = lines.find((l) => l.label === 'adjacent evil pairs')?.detail ?? '';
      const pairCount = pairsDetail === 'none' ? 0 : (pairsDetail.match(/\(/g) ?? []).length;
      expect(pairCount).toBe(chefPairs(view));
    }
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

describe('empathDerivation window at small table sizes (§8.2, §14)', () => {
  // The window is a fixed ±3 span. At fewer than 8 seats that span wraps back
  // over seats it has already visited; before the fix, that printed a
  // duplicate player (and, for a corpse, a duplicate "(dead)") and still
  // bracketed the line in "..." even though the window already showed every
  // seat there is. §14: a false ring in the §8.2 audit trail is worse than no
  // audit trail, because nobody at the table recounts it.
  it.each([5, 6, 7])(
    'shows every seat exactly once in a %i-seat game, with no ellipses since the window is complete',
    (size) => {
      const pool = ['empath', 'imp', 'poisoner', 'chef', 'monk', 'soldier', 'mayor'];
      const characters = pool.slice(0, size);
      // Kill the player two seats from the Empath: a duplicated window would
      // print "(dead)" for this one corpse more than once.
      const view = ring(characters, [2]);
      const lines = empathDerivation(view, 'p1');
      const seatsDetail = lines[0]?.detail ?? '';

      expect(seatsDetail.startsWith('...')).toBe(false);
      expect(seatsDetail.endsWith('...')).toBe(false);

      const entries = seatsDetail.split(' | ');
      expect(entries).toHaveLength(size);
      expect(new Set(entries).size).toBe(size);
      expect(entries.filter((e) => e.includes('(dead)'))).toHaveLength(1);
    },
  );
});

describe('AlignmentOverrides — registration rulings for Chef and Empath (§4.3)', () => {
  it('flips a Recluse from good to evil for chefPairs, chefDerivation and the (ruled) marker', () => {
    // p1 = Recluse (true good), p2 = Imp (true evil): p1 ruled to register as
    // evil for this answer. Canonical (p1 counted good, 0 pairs) and ruled
    // (p1 counted evil, 1 pair) disagree — the two-shape cross-product Task 8
    // needs so a routine registration ruling need not be recorded as an
    // st_override (§4.3).
    const view = ring(['recluse', 'imp', 'chef', 'empath', 'monk', 'soldier', 'mayor']);
    const overrides: AlignmentOverrides = new Map([['p1', 'evil']]);

    expect(chefPairs(view)).toBe(0);
    expect(chefPairs(view, overrides)).toBe(1);

    const lines = chefDerivation(view, overrides);
    expect(lines[0]?.label).toBe('registration ruling');
    expect(lines[0]?.detail).toBe('Player 1 ruled EVIL');
    expect(lines.find((l) => l.label === 'ring')?.detail).toMatch(/Player 1\*\(ruled\)/);
    expect(lines.at(-1)?.detail).toMatch(/-> 1$/);
  });

  it('flips a Spy from evil to good for empathCount, empathDerivation and the (ruled) marker', () => {
    // p1 = Empath, p2 = Spy (true evil) is p1's immediate left-hand neighbour,
    // ruled to register as good for this Empath.
    const view = ring(['empath', 'spy', 'chef', 'monk', 'soldier', 'butler', 'mayor']);
    const overrides: AlignmentOverrides = new Map([['p2', 'good']]);

    expect(empathCount(view, 'p1')).toBe(1);
    expect(empathCount(view, 'p1', overrides)).toBe(0);

    const lines = empathDerivation(view, 'p1', overrides);
    expect(lines.find((l) => l.label === 'registration ruling')?.detail).toBe('Player 2 ruled GOOD');
    expect(lines.at(-1)?.detail).toMatch(/Player 2 GOOD \(ruled\)/);
    expect(lines.at(-1)?.detail).toMatch(/-> 0$/);
  });
});

describe('ringOrder orientation is pinned (§5.5, §7)', () => {
  const view = ring(['imp', 'chef', 'empath', 'poisoner', 'monk', 'soldier', 'mayor']);

  it('is seat-ascending with no gaps, seat 0 through n-1', () => {
    expect(ringOrder(view).map((p) => p.seat)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('pins seat + 1 as the left-hand neighbour, wrapping past the last seat', () => {
    // §7/guide §10: voting runs clockwise from the nominee's left, i.e. from
    // nominee.seat + 1 upward. This convention is documented only in
    // ringOrder's own comment; nothing else asserts it. If a future refactor
    // ever reversed seat ordering, this is the only test that would catch it
    // — §5.5's "a backwards circle is a failure no unit test can reach"
    // otherwise, because the code stays correct while the convention flips.
    const order = ringOrder(view);
    for (const player of order) {
      const leftHandSeat = (player.seat + 1) % order.length;
      const leftHandNeighbour = order.find((p) => p.seat === leftHandSeat);
      expect(leftHandNeighbour).toBeDefined();
      expect(order.indexOf(leftHandNeighbour!)).toBe((order.indexOf(player) + 1) % order.length);
    }
  });
});
