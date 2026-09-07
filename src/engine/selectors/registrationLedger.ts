import { characterById } from '@/editions/troubleBrewing/characters';
import type { GameState, PlayerId, RegistrationRuling } from '../types';
import type { FlagDraft } from './nominations';
import { toRulesView } from './rulesView';

/** Every registration ruling made about this player so far, oldest first. */
export function priorRulings(state: GameState, playerId: PlayerId): RegistrationRuling[] {
  const rulings: RegistrationRuling[] = [];
  for (const event of state.registrationHistory) {
    for (const ruling of event) {
      if (ruling.playerId === playerId) rulings.push(ruling);
    }
  }
  return rulings;
}

/**
 * §16.6 — "Registration consistency: flagged, never blocked." Returns a flag when
 * a ruling contradicts one already made about the same player.
 */
export function registrationInconsistency(
  state: GameState,
  rulings: readonly RegistrationRuling[],
): FlagDraft[] {
  const view = toRulesView(state);
  const flags: FlagDraft[] = [];
  for (const ruling of rulings) {
    const player = view.players.find((p) => p.id === ruling.playerId);
    if (!player) continue;
    for (const prior of priorRulings(state, ruling.playerId)) {
      if (prior.registersAs.team === ruling.registersAs.team) continue;
      flags.push({
        rule: 'registration_inconsistent',
        class: 'social',
        detail:
          `${player.name} (${characterById(player.characterId).name}) was previously ruled to ` +
          `register as ${prior.registersAs.team} and is now ruled ${ruling.registersAs.team}. ` +
          'Recorded, not blocked (§16.6).',
      });
      break;
    }
  }
  return flags;
}
