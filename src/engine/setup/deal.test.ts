import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById } from '@/editions/troubleBrewing/characters';
import { distributionFor } from '@/editions/troubleBrewing/distribution';
import { deal, rerollOne, validateDeal, type Picker } from './deal';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Deterministic picker: always takes from the front of the list. */
const front: Picker = (items, count) => items.slice(0, count);

/**
 * Deterministic picker that prefers named characters, then falls back to the front.
 *
 * The read goes through `{ id?: unknown }` and `String(...)`, not
 * `{ id: string }`: narrowing an unconstrained `T` to `T & object` makes it
 * unassignable to a type with a *required* property, and tsc rejects the
 * assertion with TS2352.
 */
function preferring(...preferred: string[]): Picker {
  return <T,>(items: readonly T[], count: number): T[] => {
    const wanted = items.filter(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        preferred.includes(String((item as { id?: unknown }).id)),
    );
    const rest = items.filter((item) => !wanted.includes(item));
    return [...wanted, ...rest].slice(0, count);
  };
}

function teamCounts(assignments: Record<string, string>) {
  const counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const characterId of Object.values(assignments)) {
    counts[characterById(characterId).team] += 1;
  }
  return counts;
}

describe('deal — legality', () => {
  it.each([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
    'produces a legal set for %i players',
    (count) => {
      const result = deal(ids(count), front);
      expect(validateDeal(ids(count), result)).toEqual([]);
      expect(Object.keys(result.assignments)).toHaveLength(count);
      expect(teamCounts(result.assignments)).toEqual(result.distribution);
    },
  );

  it('assigns every character at most once', () => {
    const result = deal(ids(15), front);
    const assigned = Object.values(result.assignments);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('always includes exactly one Demon', () => {
    const result = deal(ids(9), front);
    expect(Object.values(result.assignments).filter((c) => characterById(c).team === 'demon')).toEqual(['imp']);
  });
});

describe('deal — Baron draw order (§5.2)', () => {
  it('records the post-modifier distribution when the Baron is drawn', () => {
    const result = deal(ids(9), preferring('baron'));
    expect(Object.values(result.assignments)).toContain('baron');
    // 9 players is 5/2/1/1; the Baron makes it 3/4/1/1.
    expect(result.distribution).toEqual({ townsfolk: 3, outsider: 4, minion: 1, demon: 1 });
    expect(teamCounts(result.assignments)).toEqual(result.distribution);
    expect(result.setupModifiers).toEqual([
      { characterId: 'baron', teamDeltas: { townsfolk: -2, outsider: 2 } },
    ]);
  });

  it('leaves the distribution at the chart value when the Baron is not drawn', () => {
    const result = deal(ids(9), (items, count) =>
      items.filter((i) => (i as { id?: string }).id !== 'baron').slice(0, count),
    );
    expect(result.distribution).toEqual(distributionFor(9));
    expect(result.setupModifiers).toEqual([]);
  });

  it('never draws more Outsiders than the edition has', () => {
    // 15 players is 9/2/3/1; the Baron makes it 7/4/3/1 and there are exactly 4.
    const result = deal(ids(15), preferring('baron'));
    expect(result.distribution.outsider).toBe(4);
    expect(teamCounts(result.assignments).outsider).toBe(4);
  });
});

describe('deal — demon bluffs (§5.2)', () => {
  it('withholds bluffs below 7 players', () => {
    expect(deal(ids(5), front).demonBluffs).toBeNull();
    expect(deal(ids(6), front).demonBluffs).toBeNull();
  });

  it('gives exactly 3 bluffs at 7 players and above', () => {
    for (const count of [7, 10, 15]) {
      expect(deal(ids(count), front).demonBluffs).toHaveLength(3);
    }
  });

  it('draws bluffs only from good characters not in play', () => {
    const result = deal(ids(10), front);
    const inPlay = new Set(Object.values(result.assignments));
    for (const bluff of result.demonBluffs ?? []) {
      expect(inPlay.has(bluff)).toBe(false);
      expect(['townsfolk', 'outsider']).toContain(characterById(bluff).team);
    }
  });
});

describe('deal — the Drunk (§5.2, guide §13)', () => {
  it('assigns a believed Townsfolk not otherwise in play when the Drunk is drawn', () => {
    const result = deal(ids(9), preferring('drunk'));
    expect(Object.values(result.assignments)).toContain('drunk');
    const belief = result.drunkBelief;
    expect(belief).not.toBeNull();
    expect(characterById(belief!.believesCharacterId).team).toBe('townsfolk');
    expect(Object.values(result.assignments)).not.toContain(belief!.believesCharacterId);
    expect(result.assignments[belief!.playerId]).toBe('drunk');
  });

  it('leaves drunkBelief null when the Drunk is not in play', () => {
    const result = deal(ids(9), (items, count) =>
      items.filter((i) => (i as { id?: string }).id !== 'drunk').slice(0, count),
    );
    expect(result.drunkBelief).toBeNull();
  });

  // The Drunk occupies an Outsider slot, so the public Townsfolk count is unchanged.
  it('does not alter the distribution', () => {
    const result = deal(ids(9), preferring('drunk'));
    expect(result.distribution.outsider).toBeGreaterThanOrEqual(1);
    expect(teamCounts(result.assignments)).toEqual(result.distribution);
  });
});

describe('deal — the red herring (§5.2)', () => {
  it('picks a good player', () => {
    const result = deal(ids(10), front);
    expect(result.redHerring).not.toBeNull();
    const characterId = result.assignments[result.redHerring!]!;
    expect(characterById(characterId).team === 'minion' || characterById(characterId).team === 'demon').toBe(false);
  });

  // §5.2 — "any good player, possibly the Fortune Teller themselves". Asserted
  // against the legality rule rather than by contriving a picker that lands on
  // them, which would only test the picker.
  it('accepts the Fortune Teller as the red herring', () => {
    const result = deal(ids(10), front);
    const ftId = Object.entries(result.assignments).find(([, c]) => c === 'fortune_teller')?.[0];
    expect(ftId).toBeDefined();
    expect(validateDeal(ids(10), { ...result, redHerring: ftId! })).toEqual([]);
  });
});

describe('validateDeal', () => {
  it('rejects a hand-edited set with two Demons', () => {
    const result = deal(ids(7), front);
    const [firstId] = Object.keys(result.assignments);
    const broken = { ...result, assignments: { ...result.assignments, [firstId!]: 'imp' } };
    expect(validateDeal(ids(7), broken).join(' ')).toMatch(/demon/i);
  });

  it('rejects a set that omits a player', () => {
    const result = deal(ids(7), front);
    const assignments = { ...result.assignments };
    delete assignments.p7;
    expect(validateDeal(ids(7), { ...result, assignments }).join(' ')).toMatch(/p7/);
  });

  it('rejects a duplicate character', () => {
    const result = deal(ids(7), front);
    const [a, b] = Object.keys(result.assignments);
    const assignments = { ...result.assignments, [b!]: result.assignments[a!]! };
    expect(validateDeal(ids(7), { ...result, assignments }).join(' ')).toMatch(/twice|duplicate/i);
  });

  it('rejects a Drunk in play with no belief recorded', () => {
    const result = deal(ids(9), preferring('drunk'));
    expect(validateDeal(ids(9), { ...result, drunkBelief: null }).join(' ')).toMatch(/drunk/i);
  });

  it('rejects a swap that changes the team counts with no Baron in play', () => {
    const result = deal(ids(9), front);
    const townsfolkId = Object.entries(result.assignments).find(
      ([, c]) => characterById(c).team === 'townsfolk',
    )![0];
    // Hand-edit a Townsfolk into an Outsider without touching the distribution.
    const broken = {
      ...result,
      assignments: { ...result.assignments, [townsfolkId]: 'saint' },
    };
    expect(validateDeal(ids(9), broken).join(' ')).toMatch(/the chart for 9 players/);
  });

  it('accepts a Baron set at every player count from 7 to 15', () => {
    for (const count of [7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      const result = deal(ids(count), preferring('baron'));
      expect(validateDeal(ids(count), result)).toEqual([]);
    }
  });

  it('rejects setupModifiers that name a character not in the set', () => {
    const result = deal(ids(9), front);
    const broken = {
      ...result,
      setupModifiers: [{ characterId: 'baron', teamDeltas: { townsfolk: -2, outsider: 2 } }],
    };
    expect(validateDeal(ids(9), broken).join(' ')).toMatch(/not in the set/);
  });

  it('refuses to reroll the Baron on its own, because the extra Outsiders are already dealt', () => {
    const result = deal(ids(9), preferring('baron'));
    const baronPlayerId = Object.entries(result.assignments).find(([, c]) => c === 'baron')![0];
    expect(() => rerollOne(result, baronPlayerId, front)).toThrow(/reroll the whole set/i);
  });

  it('keeps a one-player reroll legal', () => {
    const result = deal(ids(9), front);
    const [firstId] = Object.keys(result.assignments);
    const rerolled = rerollOne(result, firstId!, (items, count) => items.slice(-count));
    expect(validateDeal(ids(9), rerolled)).toEqual([]);
  });

  it('accepts every character in the edition as a legal member of its own team', () => {
    // Guards against a typo in CHARACTERS that would make a character undealable.
    for (const character of Object.values(CHARACTERS)) {
      expect(['townsfolk', 'outsider', 'minion', 'demon']).toContain(character.team);
    }
  });
});
