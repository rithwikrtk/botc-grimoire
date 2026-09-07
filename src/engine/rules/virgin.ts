import { characterById } from '@/editions/troubleBrewing/characters';
import { canRegisterAsTeam } from '@/editions/troubleBrewing/registration';
import { abilityFunctional } from '../selectors/predicates';
import { playerById } from '../selectors/players';
import type { PlayerId, RegistrationRuling, RulesView } from '../types';

export interface VirginEvaluation {
  isVirginNomination: boolean;
  /** The Virgin loses the ability — true on the FIRST nomination, whatever happens. */
  consumed: boolean;
  /** The nominator is executed immediately. */
  fired: boolean;
  reason: string;
  /** The nominator is ambiguous and the Storyteller must decide (guide §11). */
  needsRegistrationRuling: boolean;
  registrationRulings: RegistrationRuling[];
}

/**
 * §7, guide §11. The NOMINATOR dies, not the Virgin. Triggers on the first
 * nomination against the Virgin ever, and she loses the ability either way —
 * including when poisoned (§16.10). The nomination then proceeds to a normal vote.
 */
export function evaluateVirgin(
  view: RulesView,
  nominatorId: PlayerId,
  nomineeId: PlayerId,
  opts: { ruleNominatorAsTownsfolk?: boolean } = {},
): VirginEvaluation {
  const nominee = playerById(view, nomineeId);
  const nominator = playerById(view, nominatorId);

  const none: VirginEvaluation = {
    isVirginNomination: false,
    consumed: false,
    fired: false,
    reason: 'the nominee is not the Virgin',
    needsRegistrationRuling: false,
    registrationRulings: [],
  };

  // §4.1 — the TRUE character. A Drunk who believes they are the Virgin has no
  // ability, and a real Virgin's step is decided by their true role.
  if (nominee.characterId !== 'virgin') return none;

  if (nominee.virginTriggered) {
    return {
      isVirginNomination: true,
      consumed: false,
      fired: false,
      reason: 'the Virgin has already been nominated once and has lost the ability',
      needsRegistrationRuling: false,
      registrationRulings: [],
    };
  }

  const nominatorIsTrueTownsfolk = characterById(nominator.characterId).team === 'townsfolk';
  const canRuleAsTownsfolk =
    !nominatorIsTrueTownsfolk && canRegisterAsTeam(nominator.characterId, 'townsfolk');

  const rulings: RegistrationRuling[] =
    canRuleAsTownsfolk && opts.ruleNominatorAsTownsfolk === true
      ? [{ playerId: nominatorId, registersAs: { alignment: 'good', team: 'townsfolk' } }]
      : [];

  const nominatorCounts = nominatorIsTrueTownsfolk || rulings.length > 0;

  if (!abilityFunctional(view, nominee)) {
    return {
      isVirginNomination: true,
      // The ability is spent even though nothing happens (§16.10).
      consumed: true,
      fired: false,
      reason: `${nominee.name} is the Virgin but their ability is not functional (poisoned, drunk or dead), so nothing happens`,
      needsRegistrationRuling: false,
      registrationRulings: [],
    };
  }

  if (!nominatorCounts) {
    return {
      isVirginNomination: true,
      consumed: true,
      fired: false,
      reason: `${nominator.name} is not a Townsfolk, so nothing happens and the nomination proceeds to a normal vote`,
      needsRegistrationRuling: canRuleAsTownsfolk && opts.ruleNominatorAsTownsfolk === undefined,
      registrationRulings: [],
    };
  }

  return {
    isVirginNomination: true,
    consumed: true,
    fired: true,
    reason: `${nominator.name} is a Townsfolk and is executed immediately; ${nominee.name} survives and loses the ability`,
    needsRegistrationRuling: false,
    registrationRulings: rulings,
  };
}
