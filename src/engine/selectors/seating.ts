import type { Alignment } from '@/editions/troubleBrewing/characters';
import type { DerivationLine, PlayerId, RulesView, RulesViewPlayer } from '../types';
import { bySeat, playerById } from './players';

const mod = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * How a Recluse or Spy has been ruled to register for this answer (§4.3). Empty
 * for the canonical answer. Only alignment matters to the Chef and the Empath.
 */
export type AlignmentOverrides = ReadonlyMap<PlayerId, Alignment>;
const EMPTY: AlignmentOverrides = new Map();

function alignmentOf(
  player: Pick<RulesViewPlayer, 'id' | 'alignment'>,
  overrides: AlignmentOverrides,
): Alignment {
  return overrides.get(player.id) ?? player.alignment;
}

/**
 * Seat order, ascending. The ring is immutable after GAME_CREATED (§18).
 *
 * ORIENTATION, pinned here because nothing else pins it: **ascending seat index
 * is clockwise**, so a player's left-hand neighbour is `seat + 1` and their
 * right-hand neighbour is `seat - 1`. Voting runs clockwise from the nominee's
 * left, i.e. from `nominee.seat + 1` upward (§7, guide §10). Reverse this and
 * every vote is taken in the wrong order for the whole game, which is §8.2's
 * class of failure one level up: the code is correct and the convention is not.
 */
export function ringOrder(view: RulesView): RulesViewPlayer[] {
  return bySeat(view);
}

/**
 * §6.4 — the Empath's ALIVE neighbours, skipping the dead around the circle.
 * Deduped: with only one other living player, they are both neighbours and are
 * counted once. Returns 0, 1 or 2 players, seat-ordered.
 *
 * Answers even when `playerId` itself is dead (the walk only excludes the
 * subject's own seat, not their life state) — unlike `referenceEmpathCount`,
 * which throws for a dead subject. Not a bug: the Empath ability only ever
 * wakes a living player, so this case never arises in play; the divergence is
 * simply undocumented on the reference side, which is deliberately left alone.
 */
export function aliveNeighbours(view: RulesView, playerId: PlayerId): RulesViewPlayer[] {
  const ring = ringOrder(view);
  const size = ring.length;
  const selfIndex = ring.findIndex((p) => p.id === playerId);
  if (selfIndex === -1) throw new Error(`Unknown player id: ${playerId}`);

  const outward = (direction: 1 | -1): RulesViewPlayer | null => {
    for (let step = 1; step < size; step += 1) {
      const candidate = ring[mod(selfIndex + direction * step, size)]!;
      if (candidate.id === playerId) continue;
      if (candidate.alive) return candidate;
    }
    return null;
  };

  const found = [outward(-1), outward(1)].filter((p): p is RulesViewPlayer => p !== null);
  const unique = new Map(found.map((p) => [p.id, p]));
  return [...unique.values()].sort((a, b) => a.seat - b.seat);
}

export function empathCount(
  view: RulesView,
  playerId: PlayerId,
  overrides: AlignmentOverrides = EMPTY,
): number {
  return aliveNeighbours(view, playerId).filter((p) => alignmentOf(p, overrides) === 'evil').length;
}

/**
 * §6.4, §8.2 — pairs of evil players sitting next to each other, counted by
 * maximal runs: a run of k adjacent evils contributes k-1 pairs, and the ring
 * wraps. Written this way, rather than as a direct pair walk, because it is the
 * shape the derivation explains; the direct walk is the independent reference the
 * property test compares against.
 *
 * Counts all evil players, alive or dead: "how many pairs of evil players there
 * are" has no life qualifier.
 */
export function chefPairs(view: RulesView, overrides: AlignmentOverrides = EMPTY): number {
  const ring = ringOrder(view);
  const size = ring.length;
  if (size < 2) return 0;

  const evil = ring.map((p) => alignmentOf(p, overrides) === 'evil');
  const evilCount = evil.filter(Boolean).length;
  if (evilCount === 0) return 0;
  // A fully evil ring is one closed run with no gap, so it has `size` pairs
  // rather than size-1. Unreachable in Trouble Brewing, handled so the property
  // test's arbitrary rings agree with the reference.
  if (evilCount === size) return size;

  // Start at a good seat so no run straddles the array boundary.
  const start = evil.findIndex((isEvil) => !isEvil);
  let pairs = 0;
  let run = 0;
  for (let step = 0; step < size; step += 1) {
    if (evil[mod(start + step, size)]) {
      run += 1;
    } else {
      if (run > 0) pairs += run - 1;
      run = 0;
    }
  }
  if (run > 0) pairs += run - 1;
  return pairs;
}

export function chefDerivation(
  view: RulesView,
  overrides: AlignmentOverrides = EMPTY,
): DerivationLine[] {
  const ring = ringOrder(view);
  const size = ring.length;
  const isEvil = (p: RulesViewPlayer): boolean => alignmentOf(p, overrides) === 'evil';
  const evilCount = ring.filter(isEvil).length;

  const pairs: string[] = [];
  for (let i = 0; i < size; i += 1) {
    const here = ring[i]!;
    const next = ring[mod(i + 1, size)]!;
    if (isEvil(here) && isEvil(next)) {
      pairs.push(`(${here.name}, ${next.name})`);
    }
  }

  const total = chefPairs(view, overrides);
  return [
    ...(overrides.size > 0
      ? [
          {
            label: 'registration ruling',
            detail: [...overrides]
              .map(([id, alignment]) => `${playerById(view, id).name} ruled ${alignment.toUpperCase()}`)
              .join(' · '),
          },
        ]
      : []),
    {
      label: 'ring',
      detail: `${ring
        .map((p) => `${p.name}${isEvil(p) ? '*' : ''}${overrides.has(p.id) ? '(ruled)' : ''}`)
        .join(' ')}   (* = evil)`,
    },
    {
      label: 'adjacent evil pairs',
      detail: pairs.length > 0 ? pairs.join(' ') : 'none',
    },
    {
      label: 'result',
      detail: `${size} players, ${evilCount} evil; a run of k adjacent evils gives k-1 pairs; the ring wraps -> ${total}`,
    },
  ];
}

export function empathDerivation(
  view: RulesView,
  playerId: PlayerId,
  overrides: AlignmentOverrides = EMPTY,
): DerivationLine[] {
  const ring = ringOrder(view);
  const size = ring.length;
  const selfIndex = ring.findIndex((p) => p.id === playerId);
  const self = playerById(view, playerId);
  const neighbours = aliveNeighbours(view, playerId);
  const count = empathCount(view, playerId, overrides);

  // A window of the ring wide enough to show what was skipped in each
  // direction. Deduped by seat index: at fewer than 8 seats, a fixed ±3 span
  // wraps back over seats it already visited, which would otherwise print the
  // same player twice (and, if they are dead, print "(dead)" twice for one
  // corpse). Deduping collapses that to the true ring, in order.
  const seenIndices = new Set<number>();
  const windowIndices: number[] = [];
  for (let offset = -3; offset <= 3; offset += 1) {
    const index = mod(selfIndex + offset, size);
    if (seenIndices.has(index)) continue;
    seenIndices.add(index);
    windowIndices.push(index);
  }
  const windowLabels = windowIndices.map((index) => {
    const player = ring[index]!;
    return player.id === self.id ? `[${player.name}]` : player.alive ? player.name : `${player.name} (dead)`;
  });
  // If the deduped window already contains every seat, there is nothing beyond
  // it left to elide — the bracketing "..." would otherwise claim seats that
  // do not exist (§14: a false ring in the audit trail is worse than no audit
  // trail).
  const spansWholeRing = windowIndices.length === size;
  const seatsDetail = spansWholeRing ? windowLabels.join(' | ') : `... ${windowLabels.join(' | ')} ...`;

  return [
    { label: 'seats', detail: seatsDetail },
    {
      label: 'nearest alive either side, skipping the dead',
      detail: neighbours.length > 0 ? neighbours.map((p) => p.name).join(' · ') : 'nobody alive',
    },
    ...(overrides.size > 0
      ? [
          {
            label: 'registration ruling',
            detail: [...overrides]
              .map(([id, alignment]) => `${playerById(view, id).name} ruled ${alignment.toUpperCase()}`)
              .join(' · '),
          },
        ]
      : []),
    {
      label: 'result',
      detail: `${
        neighbours.length > 0
          ? neighbours
              .map(
                (p) =>
                  `${p.name} ${alignmentOf(p, overrides).toUpperCase()}` +
                  `${overrides.has(p.id) ? ' (ruled)' : ''}`,
              )
              .join(' · ')
          : 'no living neighbours'
      } -> ${count}`,
    },
  ];
}
