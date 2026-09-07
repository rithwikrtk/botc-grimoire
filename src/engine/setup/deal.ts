import {
  CHARACTERS,
  characterById,
  charactersByTeam,
  type Character,
  type Team,
  type TeamCounts,
} from '@/editions/troubleBrewing/characters';
import {
  INFO_THRESHOLD_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  distributionFor,
} from '@/editions/troubleBrewing/distribution';
import type { CharacterId, DerivationLine, DrunkBelief, PlayerId } from '@/engine/types';

/**
 * Injected randomness. Every draw happens here, in the command layer, and the
 * outcome is frozen onto ROLES_ASSIGNED as literal data — the reducer never draws
 * (§3.3). Tests pass a deterministic picker.
 */
export type Picker = <T>(items: readonly T[], count: number) => T[];

export function randomPicker(): Picker {
  return <T,>(items: readonly T[], count: number): T[] => {
    const pool = items.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, count);
  };
}

export interface DealResult {
  assignments: Record<PlayerId, CharacterId>;
  /** Post-modifier counts. Public and displayed persistently (§5.4). */
  distribution: TeamCounts;
  setupModifiers: Array<{ characterId: CharacterId; teamDeltas: Partial<TeamCounts> }>;
  demonBluffs: CharacterId[] | null;
  drunkBelief: DrunkBelief | null;
  redHerring: PlayerId | null;
}

function applyModifiers(
  base: TeamCounts,
  drawn: readonly Character[],
): { distribution: TeamCounts; setupModifiers: DealResult['setupModifiers'] } {
  const setupModifiers: DealResult['setupModifiers'] = [];
  // Mutable working copy: TeamCounts' fields are readonly (Task 2), so the
  // running total is built here and only handed back as TeamCounts once done.
  const distribution: { -readonly [K in keyof TeamCounts]: TeamCounts[K] } = { ...base };
  for (const character of drawn) {
    if (!character.setupModifiers) continue;
    setupModifiers.push({ characterId: character.id, teamDeltas: character.setupModifiers });
    for (const [team, delta] of Object.entries(character.setupModifiers)) {
      distribution[team as Team] += delta ?? 0;
    }
  }
  for (const team of ['townsfolk', 'outsider', 'minion', 'demon'] as const) {
    const available = charactersByTeam(team).length;
    if (distribution[team] < 0) {
      throw new Error(`Setup modifiers drove ${team} below zero`);
    }
    if (distribution[team] > available) {
      throw new Error(
        `Setup modifiers need ${distribution[team]} ${team} but the edition has ${available}`,
      );
    }
  }
  return { distribution, setupModifiers };
}

/** §5.2 draw order: Demon, Minions, apply modifiers, Outsiders, Townsfolk. */
export function deal(playerIds: readonly PlayerId[], pick: Picker): DealResult {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }
  const base = distributionFor(playerIds.length);

  const demons = pick(charactersByTeam('demon'), base.demon);
  const minions = pick(charactersByTeam('minion'), base.minion);

  const { distribution, setupModifiers } = applyModifiers(base, [...demons, ...minions]);

  const outsiders = pick(charactersByTeam('outsider'), distribution.outsider);
  const townsfolk = pick(charactersByTeam('townsfolk'), distribution.townsfolk);

  const drawn = [...demons, ...minions, ...outsiders, ...townsfolk];
  if (drawn.length !== playerIds.length) {
    throw new Error(
      `Drew ${drawn.length} characters for ${playerIds.length} players — the picker returned short`,
    );
  }

  // Characters are placed onto seats by the picker's own order over the seats, so
  // the ordering of the draw does not leak into the seating.
  const seatOrder = pick(playerIds, playerIds.length);
  const assignments: Record<PlayerId, CharacterId> = {};
  seatOrder.forEach((playerId, index) => {
    assignments[playerId] = drawn[index]!.id;
  });

  const inPlay = new Set(drawn.map((c) => c.id));

  // Bluffs: 3 good characters not in play, 7+ players only (§5.2, guide §2).
  const demonBluffs =
    playerIds.length >= INFO_THRESHOLD_PLAYERS
      ? pick(
          [...charactersByTeam('townsfolk'), ...charactersByTeam('outsider')].filter(
            (c) => !inPlay.has(c.id),
          ),
          3,
        ).map((c) => c.id)
      : null;

  // The Drunk's believed Townsfolk: not otherwise in play. It may legally collide
  // with a demon bluff — a bluff is not in play either (§5.2).
  const drunkPlayerId = Object.entries(assignments).find(([, c]) => c === 'drunk')?.[0] ?? null;
  const drunkBelief: DrunkBelief | null = drunkPlayerId
    ? {
        playerId: drunkPlayerId,
        believesCharacterId: pick(
          charactersByTeam('townsfolk').filter((c) => !inPlay.has(c.id)),
          1,
        )[0]!.id,
      }
    : null;

  // The red herring: any good player, possibly the Fortune Teller themselves (§5.2).
  const goodPlayerIds = Object.entries(assignments)
    .filter(([, characterId]) => {
      const { team } = characterById(characterId);
      return team === 'townsfolk' || team === 'outsider';
    })
    .map(([playerId]) => playerId);
  const redHerring = goodPlayerIds.length > 0 ? pick(goodPlayerIds, 1)[0]! : null;

  return { assignments, distribution, setupModifiers, demonBluffs, drunkBelief, redHerring };
}

/**
 * Swaps one player onto a fresh character of the same team, keeping the set legal.
 *
 * REFUSES a swap that would change the setup-modifier set, because it cannot: the
 * Baron's +2 Outsiders were already dealt into other seats, and rerolling the
 * Baron away would leave four Outsiders where the chart wants two. §5.3 offers
 * "reroll all" for that, and the UI should route there.
 */
export function rerollOne(
  result: DealResult,
  playerId: PlayerId,
  pick: Picker,
): DealResult {
  const current = result.assignments[playerId];
  if (!current) throw new Error(`${playerId} has no assignment to reroll`);
  const { team } = characterById(current);
  const inPlay = new Set(Object.values(result.assignments));
  const options = charactersByTeam(team).filter(
    (c) => !inPlay.has(c.id) && sameModifiers(c.setupModifiers, characterById(current).setupModifiers),
  );
  if (options.length === 0) {
    if (characterById(current).setupModifiers !== null) {
      throw new Error(
        `${characterById(current).name} changes the Outsider count, so it cannot be rerolled on its own — reroll the whole set (§5.3)`,
      );
    }
    return result;
  }

  const replacement = pick(options, 1)[0]!;
  const assignments = { ...result.assignments, [playerId]: replacement.id };

  // A reroll can invalidate the Baron's modifiers, the Drunk's belief, the bluffs
  // and the red herring, so recompute the three derived fields rather than patch them.
  const drawn = Object.values(assignments).map(characterById);
  const base = distributionFor(Object.keys(assignments).length);
  const { distribution, setupModifiers } = applyModifiers(base, drawn);
  const nextInPlay = new Set(assignments ? Object.values(assignments) : []);

  const drunkPlayerId = Object.entries(assignments).find(([, c]) => c === 'drunk')?.[0] ?? null;
  const beliefStillLegal =
    result.drunkBelief !== null &&
    drunkPlayerId === result.drunkBelief.playerId &&
    !nextInPlay.has(result.drunkBelief.believesCharacterId);

  const drunkBelief: DrunkBelief | null = drunkPlayerId
    ? beliefStillLegal
      ? result.drunkBelief
      : {
          playerId: drunkPlayerId,
          believesCharacterId: pick(
            charactersByTeam('townsfolk').filter((c) => !nextInPlay.has(c.id)),
            1,
          )[0]!.id,
        }
    : null;

  const demonBluffs =
    result.demonBluffs === null
      ? null
      : result.demonBluffs.some((id) => nextInPlay.has(id))
        ? pick(
            [...charactersByTeam('townsfolk'), ...charactersByTeam('outsider')].filter(
              (c) => !nextInPlay.has(c.id),
            ),
            3,
          ).map((c) => c.id)
        : result.demonBluffs;

  const goodPlayerIds = Object.entries(assignments)
    .filter(([, characterId]) => {
      const { team: t } = characterById(characterId);
      return t === 'townsfolk' || t === 'outsider';
    })
    .map(([id]) => id);
  const redHerring =
    result.redHerring !== null && goodPlayerIds.includes(result.redHerring)
      ? result.redHerring
      : (goodPlayerIds[0] ?? null);

  return { assignments, distribution, setupModifiers, demonBluffs, drunkBelief, redHerring };
}

function sameModifiers(a: Partial<TeamCounts> | null, b: Partial<TeamCounts> | null): boolean {
  if (a === null || b === null) return a === b;
  return (['townsfolk', 'outsider', 'minion', 'demon'] as const).every(
    (team) => (a[team] ?? 0) === (b[team] ?? 0),
  );
}

/**
 * §8.2 applied to the public counts. Guide §2 calls the Baron "the character most
 * likely to confuse newcomers because it silently changes the Outsider count", and
 * §5.4 displays this distribution persistently — so the one number the whole table
 * reasons from shows its working.
 */
export function distributionDerivation(
  playerCount: number,
  result: DealResult,
): DerivationLine[] {
  const base = distributionFor(playerCount);
  const fmt = (c: TeamCounts): string => `${c.townsfolk}/${c.outsider}/${c.minion}/${c.demon}`;
  const lines: DerivationLine[] = [
    { label: 'chart', detail: `${playerCount} players -> ${fmt(base)} (T/O/M/D)` },
  ];
  for (const modifier of result.setupModifiers) {
    const deltas = Object.entries(modifier.teamDeltas)
      .map(([team, delta]) => `${(delta ?? 0) > 0 ? '+' : ''}${delta} ${team}`)
      .join(', ');
    lines.push({
      label: characterById(modifier.characterId).name,
      detail: `${deltas}`,
    });
  }
  lines.push({ label: 'result', detail: `-> ${fmt(result.distribution)}` });
  return lines;
}

/** Empty array means legal. Re-run after every manual edit (§5.3). */
export function validateDeal(playerIds: readonly PlayerId[], result: DealResult): string[] {
  const issues: string[] = [];
  const assigned = Object.keys(result.assignments);

  for (const playerId of playerIds) {
    if (!result.assignments[playerId]) issues.push(`${playerId} has no character assigned.`);
  }
  for (const playerId of assigned) {
    if (!playerIds.includes(playerId)) issues.push(`${playerId} is not in the game.`);
  }

  const seen = new Map<CharacterId, number>();
  for (const characterId of Object.values(result.assignments)) {
    if (!CHARACTERS[characterId]) {
      issues.push(`${characterId} is not a Trouble Brewing character.`);
      continue;
    }
    seen.set(characterId, (seen.get(characterId) ?? 0) + 1);
  }
  for (const [characterId, count] of seen) {
    if (count > 1) issues.push(`${characterById(characterId).name} is assigned twice.`);
  }

  const counts: { -readonly [K in keyof TeamCounts]: TeamCounts[K] } = {
    townsfolk: 0,
    outsider: 0,
    minion: 0,
    demon: 0,
  };
  for (const characterId of Object.values(result.assignments)) {
    if (CHARACTERS[characterId]) counts[characterById(characterId).team] += 1;
  }
  for (const team of ['townsfolk', 'outsider', 'minion', 'demon'] as const) {
    if (counts[team] !== result.distribution[team]) {
      issues.push(
        `${team}: the set has ${counts[team]} but the recorded distribution says ${result.distribution[team]}.`,
      );
    }
  }
  if (counts.demon !== 1) issues.push(`There must be exactly one Demon, found ${counts.demon}.`);

  // §5.3 — "Legality re-validated". Without this the recorded distribution is only
  // checked against itself, so a hand edit that swaps a Townsfolk for an Outsider
  // with no Baron in play passes, and Lock In accepts a set no legal deal could
  // produce.
  if (playerIds.length >= MIN_PLAYERS && playerIds.length <= MAX_PLAYERS) {
    const drawn = Object.values(result.assignments).filter((id) => CHARACTERS[id]).map(characterById);
    const expected: { -readonly [K in keyof TeamCounts]: TeamCounts[K] } = {
      ...distributionFor(playerIds.length),
    };
    for (const character of drawn) {
      for (const [team, delta] of Object.entries(character.setupModifiers ?? {})) {
        expected[team as Team] += delta ?? 0;
      }
    }
    // Compared against the actual assigned counts, not the recorded `distribution`
    // field: a hand edit that only touches `assignments` (leaving `distribution`
    // untouched) would otherwise sail past this check even though the set it
    // produced could never come out of a legal deal.
    for (const team of ['townsfolk', 'outsider', 'minion', 'demon'] as const) {
      if (counts[team] !== expected[team]) {
        issues.push(
          `${team}: the chart for ${playerIds.length} players plus setup modifiers wants ${expected[team]}, but the set records ${counts[team]}.`,
        );
      }
    }
    const modifierIds = new Set(result.setupModifiers.map((m) => m.characterId));
    for (const character of drawn) {
      if (character.setupModifiers && !modifierIds.has(character.id)) {
        issues.push(`${character.name} changes the team counts but is not recorded in setupModifiers.`);
      }
    }
    for (const id of modifierIds) {
      if (!Object.values(result.assignments).includes(id)) {
        issues.push(`setupModifiers names ${id}, which is not in the set.`);
      }
    }
  }

  const drunkInPlay = Object.values(result.assignments).includes('drunk');
  if (drunkInPlay && result.drunkBelief === null) {
    issues.push('The Drunk is in play but no believed character is recorded.');
  }
  if (result.drunkBelief) {
    if (result.assignments[result.drunkBelief.playerId] !== 'drunk') {
      issues.push('The recorded Drunk belief is attached to a player who is not the Drunk.');
    }
    if (Object.values(result.assignments).includes(result.drunkBelief.believesCharacterId)) {
      issues.push('The Drunk believes they are a character that is in play.');
    }
  }

  if (result.demonBluffs) {
    if (result.demonBluffs.length !== 3) {
      issues.push(`Demon bluffs must number 3, found ${result.demonBluffs.length}.`);
    }
    const inPlay = new Set(Object.values(result.assignments));
    for (const bluff of result.demonBluffs) {
      if (inPlay.has(bluff)) issues.push(`${characterById(bluff).name} is a bluff but is in play.`);
    }
  }
  if (playerIds.length < INFO_THRESHOLD_PLAYERS && result.demonBluffs !== null) {
    issues.push(`Bluffs apply only at ${INFO_THRESHOLD_PLAYERS}+ players.`);
  }

  if (result.redHerring) {
    const characterId = result.assignments[result.redHerring];
    if (!characterId) issues.push('The red herring is not a player in this game.');
    else if (['minion', 'demon'].includes(characterById(characterId).team)) {
      issues.push('The red herring must be a good player.');
    }
  }

  return issues;
}
