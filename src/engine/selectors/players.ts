import type { CharacterId, PlayerId, RulesView, RulesViewPlayer } from '../types';

export function alive(player: Pick<RulesViewPlayer, 'alive'>): boolean {
  return player.alive;
}

export function livingPlayers(view: RulesView): RulesViewPlayer[] {
  return view.players.filter(alive);
}

export function aliveCount(view: RulesView): number {
  return livingPlayers(view).length;
}

export function playerById(view: RulesView, playerId: PlayerId): RulesViewPlayer {
  const player = view.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player id: ${playerId}`);
  return player;
}

export function bySeat(view: RulesView): RulesViewPlayer[] {
  return [...view.players].sort((a, b) => a.seat - b.seat);
}

/**
 * §4.1 — RESTRICTED. May be consulted ONLY by a step's wakes() and by step/UI
 * rendering. Every rules predicate — kill resolution, victory, Virgin, Slayer,
 * registration, alignment, distribution, and every "learn a character" answer —
 * must read the TRUE characterId.
 *
 * Enforced by no-restricted-imports in eslint.config.js. Do not widen the
 * allow-list without reading §4.1: the failure mode is a Drunk-believing-Soldier
 * surviving the Demon, and no test outside the kill resolver would catch it.
 */
export function perceivedCharacterId(view: RulesView, playerId: PlayerId): CharacterId {
  const player = playerById(view, playerId);
  const belief = view.drunkBelief;
  if (belief && belief.playerId === playerId) {
    // Only a character flagged falseSelfBelief can carry one, and the deal
    // validator guarantees the belief is attached to that character (§5).
    return belief.believesCharacterId;
  }
  return player.characterId;
}

/**
 * §4.1 — RESTRICTED, same rule as perceivedCharacterId. Always returns an array,
 * ordered by seat, so a real Empath and a Drunk-believing-Empath both wake at the
 * Empath step, separately.
 */
export function playersWithPerceivedCharacter(
  view: RulesView,
  characterId: CharacterId,
): RulesViewPlayer[] {
  return bySeat(view).filter((p) => perceivedCharacterId(view, p.id) === characterId);
}
