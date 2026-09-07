import type { RulesView } from '@/engine/types';

/**
 * Deliberately naive Chef reference (§14): walk every adjacent pair around the
 * ring and count the ones where both players are evil. Written independently of
 * src/engine/selectors/seating.ts, which sums maximal runs instead.
 *
 * Chef counts ALL evil players, alive or dead — the ability says "how many pairs
 * of evil players there are", with no life qualifier, and it fires on night 1
 * when nobody is dead anyway.
 */
export function referenceChefPairs(view: RulesView): number {
  const ring = [...view.players].sort((a, b) => a.seat - b.seat);
  const n = ring.length;
  if (n < 2) return 0;
  let pairs = 0;
  for (let i = 0; i < n; i += 1) {
    const here = ring[i]!;
    const next = ring[(i + 1) % n]!;
    if (here.alignment === 'evil' && next.alignment === 'evil') pairs += 1;
  }
  return pairs;
}

/**
 * Deliberately naive Empath reference (§14): **drop the dead first**, then take
 * the immediate neighbours in the surviving ring.
 *
 * This is a genuinely different method from `src/`, which walks outward from the
 * actor's seat one step at a time. That matters: §14 asks for a "separately
 * written, deliberately naive reference implementation", and two copies of the
 * same outward walk would agree on a shared off-by-one and the 500-run property
 * test would buy nothing — on the ability §14 puts at the TOP of the risk list.
 *
 * The two methods disagree under exactly the conditions where a bug would live:
 * two players alive (the sole survivor is both neighbours), one alive (no
 * neighbours), and long runs of dead on one side.
 */
export function referenceEmpathCount(view: RulesView, playerId: string): number {
  const aliveRing = [...view.players].sort((a, b) => a.seat - b.seat).filter((p) => p.alive);
  const size = aliveRing.length;
  const index = aliveRing.findIndex((p) => p.id === playerId);
  if (index === -1) throw new Error(`${playerId} is not alive`);
  if (size === 1) return 0;

  const left = aliveRing[(index - 1 + size) % size]!;
  const right = aliveRing[(index + 1) % size]!;
  const neighbours = new Map([left, right].map((p) => [p.id, p]));
  neighbours.delete(playerId);
  return [...neighbours.values()].filter((p) => p.alignment === 'evil').length;
}
