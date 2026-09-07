import type { ResolutionLink } from '../events';
import { abilityFunctional } from '../selectors/predicates';
import { playerById } from '../selectors/players';
import { isProtected } from '../selectors/statuses';
import type { PlayerId, RulesView, RulesViewPlayer } from '../types';

export type KillOutcome =
  | {
      kind: 'resolved';
      resolutionChain: ResolutionLink[];
      finalVictimId: PlayerId | null;
      /** True when the chain ended in a starpass — the caller routes to §4.6. */
      starpass: boolean;
    }
  | {
      kind: 'needs_mayor_choice';
      mayorId: PlayerId;
      candidates: PlayerId[];
      resolutionChain: ResolutionLink[];
    };

/** §16.7 — alive, not the Mayor, not the attacking Demon. */
export function mayorBounceCandidates(
  view: RulesView,
  attackerId: PlayerId,
  mayorId: PlayerId,
): PlayerId[] {
  return view.players
    .filter((p) => p.alive && p.id !== mayorId && p.id !== attackerId)
    .map((p) => p.id);
}

/**
 * The three guards that apply to any target, bounce targets included (§4.5).
 * Returns the blocking link, or null when the target dies.
 */
function guards(view: RulesView, target: RulesViewPlayer): ResolutionLink | null {
  if (!target.alive) return { targetId: target.id, result: 'already_dead' };
  // "protected by a functional Monk" — effectiveness was frozen at application.
  if (isProtected(target, view.phase)) return { targetId: target.id, result: 'monk_protected' };
  if (target.characterId === 'soldier' && abilityFunctional(view, target)) {
    return { targetId: target.id, result: 'soldier' };
  }
  return null;
}

/**
 * §4.5, in exactly this order:
 *
 *   attacker not functional      -> no_effect
 *   target already dead          -> already_dead
 *   protected by functional Monk -> monk_protected
 *   functional Soldier           -> soldier
 *   target is the attacker       -> starpass (§4.6)
 *   functional Mayor             -> ST picks a bounce target, then re-run the
 *                                   already-dead, Monk and Soldier guards on it
 *   otherwise                    -> died
 *
 * `mayorBounceTargetId` caller contract — three distinct values, one spelling
 * each, deliberately not interchangeable:
 *   - `undefined` — the Storyteller has not been asked yet. Returns
 *     `needs_mayor_choice` with the legal `candidates`.
 *   - `null` — the Storyteller was asked and chose to decline: no bounce, the
 *     Mayor dies after all (their ability says another player *might* die
 *     instead, so declining is legal, not an error).
 *   - a `PlayerId` — bounce onto that player. It must not be the Mayor's own id
 *     and must not be the attacker's id, or this throws (§16.7); it does NOT
 *     also need to be alive at call time — the already-dead guard re-runs on it
 *     below and reports that outcome rather than pre-empting it.
 *
 * A caller must never pass the Mayor's own id to mean "decline the bounce" —
 * that is what `null` means, and only `null` means it. Two spellings for one
 * intent would blur the resolutionChain's audit record.
 */
export function resolveDemonKill(
  view: RulesView,
  attackerId: PlayerId,
  targetId: PlayerId,
  mayorBounceTargetId?: PlayerId | null,
): KillOutcome {
  const attacker = playerById(view, attackerId);
  const target = playerById(view, targetId);

  if (!abilityFunctional(view, attacker)) {
    return {
      kind: 'resolved',
      resolutionChain: [{ targetId, result: 'no_effect' }],
      finalVictimId: null,
      starpass: false,
    };
  }

  const blocked = guards(view, target);
  if (blocked) {
    return { kind: 'resolved', resolutionChain: [blocked], finalVictimId: null, starpass: false };
  }

  if (targetId === attackerId) {
    return {
      kind: 'resolved',
      resolutionChain: [{ targetId, result: 'starpass' }],
      finalVictimId: targetId,
      starpass: true,
    };
  }

  const isFunctionalMayor = target.characterId === 'mayor' && abilityFunctional(view, target);

  if (isFunctionalMayor) {
    if (mayorBounceTargetId === undefined) {
      return {
        kind: 'needs_mayor_choice',
        mayorId: targetId,
        candidates: mayorBounceCandidates(view, attackerId, targetId),
        resolutionChain: [],
      };
    }
    if (mayorBounceTargetId === null) {
      return {
        kind: 'resolved',
        resolutionChain: [{ targetId, result: 'died' }],
        finalVictimId: targetId,
        starpass: false,
      };
    }
    // Structural only (not the Mayor, not the attacker) — NOT aliveness. Aliveness
    // is what candidates are filtered on when the choice is OFFERED, but it is not
    // a precondition on the choice once made: §4.5 explicitly re-runs the
    // already-dead guard on the bounce target below, which would be unreachable
    // dead code if this check also rejected a dead bounce target first.
    if (mayorBounceTargetId === targetId || mayorBounceTargetId === attackerId) {
      throw new Error(
        `${mayorBounceTargetId} is not a legal bounce target: it must not be the Mayor and not the attacking Demon (§16.7)`,
      );
    }
    const bounceTarget = playerById(view, mayorBounceTargetId);
    const bounceBlocked = guards(view, bounceTarget);
    const chain: ResolutionLink[] = [{ targetId, result: 'mayor_bounce' }];
    if (bounceBlocked) {
      return {
        kind: 'resolved',
        resolutionChain: [...chain, bounceBlocked],
        finalVictimId: null,
        starpass: false,
      };
    }
    return {
      kind: 'resolved',
      // A second Mayor bounce is unreachable in Trouble Brewing (one Mayor), and
      // the chain is deliberately capped at two links so it stays renderable.
      resolutionChain: [...chain, { targetId: mayorBounceTargetId, result: 'died' }],
      finalVictimId: mayorBounceTargetId,
      starpass: false,
    };
  }

  return {
    kind: 'resolved',
    resolutionChain: [{ targetId, result: 'died' }],
    finalVictimId: targetId,
    starpass: false,
  };
}

/** §6.2's dawn announcement renders this (§8.2 applied to the kill). */
export function killDerivation(view: RulesView, outcome: KillOutcome): string[] {
  const name = (id: PlayerId): string => playerById(view, id).name;
  if (outcome.kind === 'needs_mayor_choice') {
    return [`${name(outcome.mayorId)} is the Mayor — choose who dies instead, or nobody`];
  }
  const lines = outcome.resolutionChain.map((link) => {
    switch (link.result) {
      case 'no_effect':
        return `${name(link.targetId)} chosen, but the Demon's ability is not working -> nothing happens`;
      case 'already_dead':
        return `${name(link.targetId)} is already dead -> nothing happens`;
      case 'monk_protected':
        return `${name(link.targetId)} is protected by the Monk -> safe`;
      case 'soldier':
        return `${name(link.targetId)} is the Soldier -> safe from the Demon`;
      case 'starpass':
        return `${name(link.targetId)} killed themselves -> starpass`;
      case 'mayor_bounce':
        return `${name(link.targetId)} is the Mayor -> the kill bounces`;
      case 'died':
        return `${name(link.targetId)} dies`;
    }
  });
  return [
    ...lines,
    outcome.finalVictimId
      ? `announce at dawn: ${name(outcome.finalVictimId)} died`
      : 'announce at dawn: no one died tonight',
  ];
}
