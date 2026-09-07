import { describe, expect, it } from 'vitest';
import { comparePhases, isStatusActive, nextPhase, phaseOrdinal } from './phase';
import type { Phase, StatusEntry } from './types';

const night = (n: number): Phase => ({ kind: 'night', number: n });
const day = (n: number): Phase => ({ kind: 'day', number: n });

function status(
  name: StatusEntry['status'],
  appliedAt: Phase,
  expiresAt: Phase | null,
  sourcePlayerId: string | null = 'p1',
): StatusEntry {
  return { status: name, sourcePlayerId, effective: true, appliedAt, expiresAt };
}

describe('phaseOrdinal', () => {
  // Day N follows night N. Stated explicitly in §4.4 because every lifetime depends on it.
  it('orders night 1, day 1, night 2, day 2', () => {
    expect(phaseOrdinal(night(1))).toBe(2);
    expect(phaseOrdinal(day(1))).toBe(3);
    expect(phaseOrdinal(night(2))).toBe(4);
    expect(phaseOrdinal(day(2))).toBe(5);
  });

  it('is strictly increasing across the alternation', () => {
    const sequence = [night(1), day(1), night(2), day(2), night(3), day(3)];
    const ordinals = sequence.map(phaseOrdinal);
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
    expect(new Set(ordinals).size).toBe(ordinals.length);
  });

  it('compares phases by ordinal', () => {
    expect(comparePhases(night(2), day(1))).toBeGreaterThan(0);
    expect(comparePhases(day(1), night(2))).toBeLessThan(0);
    expect(comparePhases(day(3), day(3))).toBe(0);
  });
});

describe('nextPhase', () => {
  it('advances night N to day N and day N to night N+1', () => {
    expect(nextPhase(night(1))).toEqual(day(1));
    expect(nextPhase(day(1))).toEqual(night(2));
    expect(nextPhase(night(7))).toEqual(day(7));
  });
});

describe('isStatusActive — the inclusive comparison of §4.4', () => {
  // The Monk's protection must survive until the Imp step LATER THE SAME NIGHT.
  // A `<` comparison here silently breaks the Monk.
  it('keeps Monk protection active for the whole of the night it was applied', () => {
    const protection = status('protected', night(3), night(3));
    expect(isStatusActive(protection, night(3))).toBe(true);
  });

  it('drops Monk protection by the following day', () => {
    const protection = status('protected', night(3), night(3));
    expect(isStatusActive(protection, day(3))).toBe(false);
    expect(isStatusActive(protection, night(4))).toBe(false);
  });

  // Poison applied night N is active for night N AND day N, gone at the start of night N+1.
  it('keeps poison active for night N and day N and no longer', () => {
    const poison = status('poisoned', night(2), day(2));
    expect(isStatusActive(poison, night(2))).toBe(true);
    expect(isStatusActive(poison, day(2))).toBe(true);
    expect(isStatusActive(poison, night(3))).toBe(false);
    expect(isStatusActive(poison, day(3))).toBe(false);
  });

  it('keeps the Butler master mark active for night N and day N', () => {
    const master = status('master', night(4), day(4));
    expect(isStatusActive(master, night(4))).toBe(true);
    expect(isStatusActive(master, day(4))).toBe(true);
    expect(isStatusActive(master, night(5))).toBe(false);
  });

  it('treats a null expiry as permanent', () => {
    const herring = status('redHerring', night(1), null, null);
    expect(isStatusActive(herring, night(1))).toBe(true);
    expect(isStatusActive(herring, day(9))).toBe(true);
  });

  it('is not active before it was applied', () => {
    const poison = status('poisoned', night(5), day(5));
    expect(isStatusActive(poison, night(4))).toBe(false);
    expect(isStatusActive(poison, day(4))).toBe(false);
  });

  // §4.4 — declarative and time-driven, never actor-driven. A Poisoner executed on
  // day 3 must not leave their victim poisoned for the rest of the game, and equally
  // must not have their live poison cancelled early.
  it('ignores whether the source player is alive', () => {
    const poison = status('poisoned', night(3), day(3), 'the-dead-poisoner');
    expect(isStatusActive(poison, day(3))).toBe(true);
    expect(isStatusActive(poison, night(4))).toBe(false);
  });
});
