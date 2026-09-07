import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { chefPairs, empathCount } from '@/engine/selectors/seating';
import { referenceChefPairs, referenceEmpathCount } from '@test/helpers/reference';
import type { RulesView } from '@/engine/types';

/**
 * Builds an arbitrary ring. Evil placement is arbitrary rather than legal: the
 * positional maths must not depend on the distribution chart, and generating
 * illegal-but-well-formed rings covers adjacent runs of every length and
 * wrap-around adjacency that no legal set reaches.
 *
 * NOTE: `makeView` below always excludes the Empath's own seat from the evil
 * set (their seat must be good and alive to ask the question at all), so this
 * generator can never produce a fully-evil ring — `evilCount` is capped at
 * `size - 1`. The fully-evil special case (`chefPairs`'s `evilCount === size`
 * branch) is covered separately by a direct unit test in seating.test.ts that
 * does not go through this generator.
 */
const ringArb = fc
  .integer({ min: 7, max: 15 })
  .chain((size) =>
    fc.record({
      size: fc.constant(size),
      evilSeats: fc.uniqueArray(fc.integer({ min: 0, max: size - 1 }), {
        minLength: 0,
        maxLength: size,
      }),
      deadSeats: fc.uniqueArray(fc.integer({ min: 0, max: size - 1 }), {
        minLength: 0,
        maxLength: size,
      }),
      empathSeat: fc.integer({ min: 0, max: size - 1 }),
    }),
  );

function makeView(spec: {
  size: number;
  evilSeats: number[];
  deadSeats: number[];
  empathSeat: number;
}): { view: RulesView; empathId: string } {
  const evil = new Set(spec.evilSeats);
  // The Empath's own seat must be good and alive for the ability to be asked at all.
  evil.delete(spec.empathSeat);
  const dead = new Set(spec.deadSeats);
  dead.delete(spec.empathSeat);

  // One character per seat, drawn so alignment matches the spec. The characters
  // themselves are irrelevant to positional maths; only alignment and life are.
  const evilPool = ['imp', 'poisoner', 'baron', 'scarlet_woman', 'spy'];
  const goodPool = [
    'washerwoman', 'librarian', 'investigator', 'chef', 'fortune_teller',
    'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier',
    'mayor', 'butler', 'recluse', 'saint',
  ];
  let evilTaken = 0;
  let goodTaken = 0;
  const roles: Array<[string, string]> = [];
  for (let seat = 0; seat < spec.size; seat += 1) {
    if (seat === spec.empathSeat) {
      roles.push([`p${seat}`, 'empath']);
      continue;
    }
    if (evil.has(seat)) {
      roles.push([`p${seat}`, evilPool[evilTaken++ % evilPool.length]!]);
    } else {
      roles.push([`p${seat}`, goodPool[goodTaken++ % goodPool.length]!]);
    }
  }

  const builder = buildGame({ roles });
  for (const seat of dead) {
    builder.push('DEATH', {
      playerId: `p${seat}`,
      characterIdAtDeath: roles[seat]![1],
      cause: 'demon',
    });
  }
  return { view: toRulesView(builder.state), empathId: `p${spec.empathSeat}` };
}

describe('positional information — property tests against a naive reference (§14 Tier 1)', () => {
  it('chefPairs agrees with the naive adjacent-pair walk on every ring', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const { view } = makeView(spec);
        expect(chefPairs(view)).toBe(referenceChefPairs(view));
      }),
      { numRuns: 500 },
    );
  });

  it('empathCount agrees with the naive outward walk on every ring and dead set', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const { view, empathId } = makeView(spec);
        expect(empathCount(view, empathId)).toBe(referenceEmpathCount(view, empathId));
      }),
      { numRuns: 500 },
    );
  });

  it('never reports more than 2 for the Empath or more than the evil count for the Chef', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const { view, empathId } = makeView(spec);
        const evils = view.players.filter((p) => p.alignment === 'evil').length;
        expect(empathCount(view, empathId)).toBeLessThanOrEqual(2);
        expect(chefPairs(view)).toBeLessThanOrEqual(evils);
      }),
      { numRuns: 300 },
    );
  });

  it('is invariant under rotating the whole ring', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const rotated = {
          ...spec,
          evilSeats: spec.evilSeats.map((s) => (s + 3) % spec.size),
          deadSeats: spec.deadSeats.map((s) => (s + 3) % spec.size),
          empathSeat: (spec.empathSeat + 3) % spec.size,
        };
        const a = makeView(spec);
        const b = makeView(rotated);
        expect(chefPairs(b.view)).toBe(chefPairs(a.view));
        expect(empathCount(b.view, b.empathId)).toBe(empathCount(a.view, a.empathId));
      }),
      { numRuns: 300 },
    );
  });
});
