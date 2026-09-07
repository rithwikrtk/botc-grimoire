import { characterById } from '@/editions/troubleBrewing/characters';
import type { RulesView, RulesViewPlayer } from '../types';
import { isPoisoned } from './statuses';

/** Engine code naming a Trouble Brewing character is expected and allowed (§3.8). */
export function isDrunk(player: Pick<RulesViewPlayer, 'characterId'>): boolean {
  return player.characterId === 'drunk';
}

/**
 * §4.2. Deliberately does NOT hardcode `alive` — requiresAlive lives on the
 * character, and is false for the Ravenkeeper (whose ability fires because they
 * died) and the Saint (whose win check happens after death).
 *
 * Registration is NOT gated here: a poisoned Recluse still registers ambiguously,
 * because registration is a passive property rather than an ability.
 */
export function abilityFunctional(
  view: RulesView,
  player: Pick<RulesViewPlayer, 'characterId' | 'alive' | 'statusLedger'>,
): boolean {
  // Seated but not yet dealt (§5.1): no character, so no ability.
  if (player.characterId === '') return false;
  const character = characterById(player.characterId);
  const aliveRequirementMet = character.requiresAlive ? player.alive : true;
  return aliveRequirementMet && !isPoisoned(player, view.phase) && !isDrunk(player);
}
