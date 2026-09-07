import { characterById } from '@/editions/troubleBrewing/characters';
import { canRegisterAsTeam } from '@/editions/troubleBrewing/registration';
import { abilityFunctional } from '../selectors/predicates';
import { playerById } from '../selectors/players';
import type { PlayerId, RulesView } from '../types';

export interface SlayerEvaluation {
  claimantIsRealSlayer: boolean;
  abilityFunctional: boolean;
  /** The ONLY field that routes into §4.6. */
  targetIsTrueDemon: boolean;
  targetRegisteredAsDemon: boolean;
  canRuleAsDemon: boolean;
  outcome: 'died' | 'nothing';
  /** §16.12 — true only when the target's TRUE character is the Demon. */
  routesToDemonDeath: boolean;
  reason: string;
}

/**
 * §7, §16.12. Anyone may claim the Slayer. A shot kills when the claimant is the
 * real Slayer with a functional, unspent ability and the target registers as the
 * Demon — but it only routes into onDemonDeath when the target's TRUE character
 * is the Demon. v2 routed any successful shot, so a Recluse ruled as the Demon
 * promoted the Scarlet Woman while the real Imp was alive: two living Imps.
 */
export function evaluateSlayer(
  view: RulesView,
  claimantId: PlayerId,
  targetId: PlayerId,
  opts: { ruleTargetAsDemon?: boolean } = {},
): SlayerEvaluation {
  const claimant = playerById(view, claimantId);
  const target = playerById(view, targetId);

  const claimantIsRealSlayer = claimant.characterId === 'slayer';
  const functional = claimantIsRealSlayer && abilityFunctional(view, claimant);
  const targetIsTrueDemon = characterById(target.characterId).team === 'demon';
  const canRuleAsDemon = !targetIsTrueDemon && canRegisterAsTeam(target.characterId, 'demon');
  const targetRegisteredAsDemon = canRuleAsDemon && opts.ruleTargetAsDemon === true;

  const base = {
    claimantIsRealSlayer,
    abilityFunctional: functional,
    targetIsTrueDemon,
    targetRegisteredAsDemon,
    canRuleAsDemon,
  };

  // "Once per game, DURING THE DAY" (guide §1). A mistap at night would otherwise
  // resolve a real kill.
  if (view.phase.kind !== 'day') {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: 'the Slayer may only be used during the day',
    };
  }

  if (!claimantIsRealSlayer) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${claimant.name} is not the Slayer — the claim is a bluff and nothing happens`,
    };
  }
  if (claimant.slayerUsed) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${claimant.name} has already used the Slayer ability — it is once per game`,
    };
  }
  if (!functional) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${claimant.name}'s ability is not functional (poisoned, drunk or dead)`,
    };
  }
  if (!target.alive) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${target.name} is already dead`,
    };
  }
  if (!targetIsTrueDemon && !targetRegisteredAsDemon) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: canRuleAsDemon
        ? `${target.name} could be ruled to register as the Demon — decide before resolving`
        : `${target.name} is not the Demon, so nothing happens`,
    };
  }

  return {
    ...base,
    outcome: 'died',
    // §16.12 — a Recluse ruled as the Demon dies and promotes NOBODY.
    routesToDemonDeath: targetIsTrueDemon,
    reason: targetIsTrueDemon
      ? `${target.name} is the Demon and dies`
      : `${target.name} was ruled to register as the Demon and dies, but no successor is promoted (§16.12)`,
  };
}
