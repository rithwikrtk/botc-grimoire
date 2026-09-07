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
  /**
   * True only when the claim is otherwise resolvable — the claimant is the
   * real Slayer, functional, unspent, and the target is alive — and the
   * target's ambiguous registration has not yet been decided (§16.12).
   * `claimSlayer` refuses to resolve while this is true, rather than spending
   * the once-per-game ability on a claim nobody has ruled on yet (review
   * round 2, FIX 1b).
   */
  needsRegistrationRuling: boolean;
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

  // A "nothing" outcome never routes to the demon-death handler and never
  // needs a registration ruling of its own — both are fixed regardless of
  // WHICH guard below produced it, so one factory pins them once instead of
  // five separate returns that could drift, one of them on §16.12's own field
  // (folded-in minor 7, review round 2).
  const nothing = (reason: string): SlayerEvaluation => ({
    ...base,
    outcome: 'nothing',
    routesToDemonDeath: false,
    needsRegistrationRuling: false,
    reason,
  });

  // "Once per game, DURING THE DAY" (guide §1). A mistap at night would otherwise
  // resolve a real kill.
  if (view.phase.kind !== 'day') {
    return nothing('the Slayer may only be used during the day');
  }

  if (!claimantIsRealSlayer) {
    return nothing(`${claimant.name} is not the Slayer — the claim is a bluff and nothing happens`);
  }
  if (claimant.slayerUsed) {
    return nothing(`${claimant.name} has already used the Slayer ability — it is once per game`);
  }
  if (!functional) {
    return nothing(`${claimant.name}'s ability is not functional (poisoned, drunk or dead)`);
  }
  if (!target.alive) {
    return nothing(`${target.name} is already dead`);
  }
  if (!targetIsTrueDemon && !targetRegisteredAsDemon) {
    // The claim is otherwise resolvable (claimant real, functional and
    // unspent; target alive) and only the target's ambiguous registration is
    // undecided. This is the ONE case where a ruling is needed before
    // resolving — review round 2 found that resolving anyway here silently
    // burns a real Slayer's once-per-game shot on a claim nobody has actually
    // decided (§16.12).
    if (canRuleAsDemon && opts.ruleTargetAsDemon === undefined) {
      return {
        ...base,
        outcome: 'nothing',
        routesToDemonDeath: false,
        needsRegistrationRuling: true,
        reason: `${target.name} could be ruled to register as the Demon — decide before resolving`,
      };
    }
    return nothing(`${target.name} is not the Demon, so nothing happens`);
  }

  return {
    ...base,
    outcome: 'died',
    // §16.12 — a Recluse ruled as the Demon dies and promotes NOBODY.
    routesToDemonDeath: targetIsTrueDemon,
    needsRegistrationRuling: false,
    reason: targetIsTrueDemon
      ? `${target.name} is the Demon and dies`
      : `${target.name} was ruled to register as the Demon and dies, but no successor is promoted (§16.12)`,
  };
}
