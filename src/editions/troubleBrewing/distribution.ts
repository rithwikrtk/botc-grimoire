import type { TeamCounts } from './characters';

/** Guide §2. Travellers (16+) are out of scope (§18). */
export const DISTRIBUTION: Readonly<Record<number, TeamCounts>> = Object.freeze({
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
});

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;
/** Below this, Minion info, Demon info and the 3 bluffs do not happen (guide §2, §5.2). */
export const INFO_THRESHOLD_PLAYERS = 7;

export function distributionFor(playerCount: number): TeamCounts {
  const counts = DISTRIBUTION[playerCount];
  if (!counts) {
    throw new Error(`Player count must be between 5 and 15, got ${playerCount}`);
  }
  return counts;
}
