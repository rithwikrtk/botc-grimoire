import type { DemonDeathOutcome } from '../rules/demonDeath';
import type { CharacterId, PlayerId } from '../types';
import type { Tx } from './store';

/**
 * §4.6 — the DEMON_DIED / ROLE_CHANGED emit pair, in one place.
 *
 * Four commands can kill the Demon — `closeDay` and `claimSlayer` in
 * dayCommands.ts, `resolveImpStep` in nightCommands.ts, and `recordDeath` in
 * correctionCommands.ts — and every one of them wrote this block out by hand.
 * The duplication was left in place deliberately for a long time on the grounds
 * that §16.1's real hazard (handing `onDemonDeath` a POST-death view, which
 * turns the Scarlet Woman's threshold from 5 into 6) is guarded structurally at
 * every copy, which is true and remains true.
 *
 * What finally justified the extraction is different and stronger: the `reason`
 * ternary below is the ONLY thing in the permanent log that distinguishes a
 * Scarlet Woman promotion from a starpass, and it existed in four copies that
 * NO test observed at any site — inverting it at all four left the whole suite
 * green. Four unobserved copies of one untested expression is duplication of an
 * untested fact, not of shape. One copy can have one witness.
 *
 * CRITICAL: the `onDemonDeath` CALL stays at each call site and does not move
 * here. That call is where §16.1's pre-death-view contract lives — the view it
 * is handed must be from before the DEATH event is applied — and it belongs
 * with the code that owns that view. Only the emit moves.
 *
 * @param deadDemonId the dying Demon.
 * @param deadDemonCharacterId their character at death; the successor inherits
 *   it, so this must be read before anything reassigns it.
 * @param outcome the result of the call site's own `onDemonDeath`.
 */
export function emitDemonDeath(
  tx: Tx,
  deadDemonId: PlayerId,
  deadDemonCharacterId: CharacterId,
  outcome: DemonDeathOutcome,
): void {
  if (outcome.kind !== 'resolved') return;

  tx.emit('DEMON_DIED', {
    deadDemonId,
    aliveCountAtDeath: outcome.aliveCountAtDeath,
    successorId: outcome.successorId,
    successorReason: outcome.successorReason,
  });

  if (!outcome.successorId) return;

  const successor = tx.view().players.find((p) => p.id === outcome.successorId);
  if (!successor) {
    throw new Error(
      `onDemonDeath named ${outcome.successorId} as the successor, but no such player exists`,
    );
  }

  tx.emit('ROLE_CHANGED', {
    playerId: successor.id,
    from: successor.characterId,
    to: deadDemonCharacterId,
    // Not a narrowing convenience: 'starpass' and 'scarlet_woman' are the two
    // ways the token changes hands, and this field is the only record of which
    // happened. `resolveImpStep` is the one caller that can produce 'starpass'
    // (the other three hardcode `starpass: false`), and nightCommands.test.ts
    // asserts it there; the Scarlet Woman arm is asserted alongside it.
    reason: outcome.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman',
  });
}
