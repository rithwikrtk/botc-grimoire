import { characterById } from './characters';
import type { Character, RegistrationOption, Team } from './characters';

/**
 * The ways this character may register. The true option is always first, so a
 * caller taking element 0 gets the canonical answer (§4.3).
 *
 * NOT gated by abilityFunctional: a poisoned Recluse still registers ambiguously,
 * because registration is a passive property rather than an ability (§4.2).
 */
export function registrationOptions(character: Character): readonly RegistrationOption[] {
  return character.registration;
}

export function registrationOptionsForCharacterId(characterId: string): readonly RegistrationOption[] {
  return registrationOptions(characterById(characterId));
}

export function isAmbiguous(characterId: string): boolean {
  return registrationOptionsForCharacterId(characterId).length > 1;
}

/**
 * Whether this character may register as the given team. Every caller wants
 * exactly this question, so there are no `asDemon` / `asMinion` / `asTeam`
 * combinator exports — they had no callers and no test.
 */
export function canRegisterAsTeam(characterId: string, team: Team): boolean {
  return registrationOptionsForCharacterId(characterId).some((o) => o.team === team);
}
