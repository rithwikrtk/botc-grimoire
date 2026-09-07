import type { RulesView, RulesViewPlayer, Victory, VictoryReason } from '@/engine/types';
import { abilityFunctional } from '@/engine/selectors/predicates';
import { aliveCount } from '@/engine/selectors/players';

export interface VictoryContext {
  /** True only in the transaction that closes the day (§4.7 row 4). */
  dayClosed: boolean;
}

export interface VictoryPredicate {
  reason: VictoryReason;
  winner: 'good' | 'evil';
  test: (view: RulesView, context: VictoryContext) => boolean;
}

/**
 * Reads the already-derived `team`, NOT characterById(p.characterId). Before the
 * deal every player has characterId '', and characterById throws on it — which
 * made the very first createGame transaction crash at its own commit-time victory
 * check.
 */
function livingDemon(view: RulesView): RulesViewPlayer | undefined {
  return view.players.find((p) => p.alive && p.team === 'demon');
}

/**
 * §4.7, in precedence order. Row 1 precedes row 3 so a Demon death that brings
 * the count to 2 is a GOOD win.
 *
 * These predicates ASSUME a dealt game. `checkVictory` is the single gate that
 * makes that assumption safe — it returns `ongoing` before any player has a
 * character (`characterId === ''`), so none of the four ever runs against an
 * undealt seat. A `players.length > 0` clause on an individual predicate reads
 * like a second guard but cannot be one: seats exist from `GAME_CREATED`, before
 * `ROLES_ASSIGNED`, so that check is always true by the time any predicate here
 * is reachable. Two of these predicates carried that dead clause until a review
 * caught it (deleting it left 29/29 green) — it is deliberately not restored.
 * Row 1's `p.team === 'demon'` read stays safe pre-deal regardless (every seat
 * defaults to `team: 'townsfolk'`), it is simply not the thing preventing an
 * early win; `checkVictory`'s own guard is.
 */
export const VICTORY_PREDICATES: readonly VictoryPredicate[] = Object.freeze([
  {
    // Row 1 — evaluated after successor resolution, which is why checkVictory
    // runs once at commit and not per event (§4.7).
    reason: 'demon_dead',
    winner: 'good',
    test: (view) => livingDemon(view) === undefined,
  },
  {
    // Row 2 — a Saint executed by vote or by a Virgin trigger, ability functional.
    //
    // §4.7's table says "execution tx", and this is evaluated in that
    // transaction: `closeDay` and `applyVirgin` both check victory while the phase
    // is still day N, so a Saint poisoned on night N is correctly still poisoned
    // here and does not win. Because the check happens in the transaction, the
    // predicate never gets a chance to fire late.
    //
    // Scoped to the current phase so a re-check on a later day cannot resurrect
    // it. That scoping is safe ONLY because no command advances the phase in the
    // same transaction as an execution — see the closeDay/beginNight split, which
    // exists for exactly this reason.
    reason: 'saint_executed',
    winner: 'evil',
    test: (view) =>
      view.deaths.some((death) => {
        if (death.cause !== 'execution') return false;
        if (death.characterIdAtDeath !== 'saint') return false;
        if (death.phase.kind !== view.phase.kind || death.phase.number !== view.phase.number) {
          return false;
        }
        const saint = view.players.find((p) => p.id === death.playerId);
        return saint !== undefined && abilityFunctional(view, saint);
      }),
  },
  {
    // Row 3 — <= rather than == defensively. Deaths arrive one at a time so the
    // count should never skip 2, but an equality test that is wrong once ends the
    // game never, and the looser comparison costs nothing.
    reason: 'two_alive',
    winner: 'evil',
    test: (view) => aliveCount(view) <= 2,
  },
  {
    // Row 4 — only reachable through a day that closed with no execution, which is
    // why the day must be closeable with nobody nominated (§7).
    reason: 'mayor_no_execution',
    winner: 'good',
    test: (view, context) => {
      if (!context.dayClosed) return false;
      if (aliveCount(view) !== 3) return false;
      if (view.todaysExecutions.length !== 0) return false;
      const mayor = view.players.find((p) => p.characterId === 'mayor' && p.alive);
      return mayor !== undefined && abilityFunctional(view, mayor);
    },
  },
]);

// Frozen for the same reason VICTORY_PREDICATES is: this is returned BY REFERENCE
// from every ongoing checkVictory call, and a caller mutating one result would
// corrupt every subsequent "ongoing" answer.
export const ONGOING: Victory = Object.freeze({ status: 'ongoing', reason: null });
