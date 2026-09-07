import { characterById } from '@/editions/troubleBrewing/characters';
import { abilityFunctional } from '../selectors/predicates';
import { aliveCount, playerById } from '../selectors/players';
import type { DerivationLine, PlayerId, RulesView } from '../types';

export type DemonDeathOutcome =
  | {
      kind: 'resolved';
      /** Counts the dying Demon (§16.1). */
      aliveCountAtDeath: number;
      successorId: PlayerId | null;
      successorReason: 'scarlet_woman' | 'starpass' | null;
    }
  | {
      kind: 'needs_successor_choice';
      aliveCountAtDeath: number;
      candidates: PlayerId[];
    };

export const SCARLET_WOMAN_THRESHOLD = 5;

/**
 * §16.9, genuinely contested. `true` (the recorded default) means her ability
 * reads as an unconditional trigger, so when its condition is met she becomes the
 * Demon even on a starpass. `false` means the starpass lets the Storyteller hand
 * the Imp to any living Minion, her included.
 *
 * A constant rather than an inline branch because Rithwik said either is fine:
 * flipping this is a one-line change at the table, and BOTH branches are tested,
 * so the flip cannot silently break the other case.
 */
export const SCARLET_WOMAN_BEATS_STARPASS = true;

/**
 * §4.6 — one shared, phase-agnostic handler, invoked from the night kill, an
 * execution, and the Slayer, but ONLY when the dead player's TRUE character is
 * the Demon. Routing any successful Slayer shot here promotes the Scarlet Woman
 * off a Recluse ruled as the Demon, and you get two living Imps (§16.12).
 *
 * CONTRACT: `view` must be the state from BEFORE the DEATH event is applied, so
 * aliveCountAtDeath counts the dying Demon. Passing the post-death view turns the
 * Scarlet Woman's threshold from 5 into 6.
 */
export function onDemonDeath(
  view: RulesView,
  deadDemonId: PlayerId,
  opts: {
    starpass: boolean;
    chosenSuccessorId?: PlayerId | null;
    /** §16.9. Defaults to SCARLET_WOMAN_BEATS_STARPASS; only tests pass it. */
    scarletWomanBeatsStarpass?: boolean;
  },
): DemonDeathOutcome {
  const dead = playerById(view, deadDemonId);
  if (characterById(dead.characterId).team !== 'demon') {
    throw new Error(
      `onDemonDeath called for ${deadDemonId}, whose true character is ${dead.characterId}, not the Demon (§4.6)`,
    );
  }
  const count = aliveCount(view);

  // §4.6, §16.9 — checked FIRST, including on a starpass: her ability is worded as
  // an unconditional trigger, not a Storyteller option. Contested; the alternative
  // is a two-line change here plus its test.
  const scarletWoman = view.players.find(
    (p) =>
      p.characterId === 'scarlet_woman' &&
      p.alive &&
      p.id !== deadDemonId &&
      abilityFunctional(view, p),
  );
  const beatsStarpass = opts.scarletWomanBeatsStarpass ?? SCARLET_WOMAN_BEATS_STARPASS;
  const scarletWomanTriggers = scarletWoman !== undefined && count >= SCARLET_WOMAN_THRESHOLD;
  if (scarletWomanTriggers && (beatsStarpass || !opts.starpass)) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: scarletWoman!.id,
      successorReason: 'scarlet_woman',
    };
  }

  if (!opts.starpass) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: null,
      successorReason: null,
    };
  }

  const candidates = view.players
    .filter((p) => p.alive && p.id !== deadDemonId && characterById(p.characterId).team === 'minion')
    .map((p) => p.id);

  if (candidates.length === 0) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: null,
      successorReason: null,
    };
  }

  if (opts.chosenSuccessorId === undefined) {
    return { kind: 'needs_successor_choice', aliveCountAtDeath: count, candidates };
  }
  if (opts.chosenSuccessorId === null) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: null,
      successorReason: null,
    };
  }
  if (!candidates.includes(opts.chosenSuccessorId)) {
    throw new Error(
      `${opts.chosenSuccessorId} cannot take the starpass: the successor must be a living Minion (§4.6)`,
    );
  }
  return {
    kind: 'resolved',
    aliveCountAtDeath: count,
    successorId: opts.chosenSuccessorId,
    successorReason: 'starpass',
  };
}

/**
 * §8.2 applied to the most contested number in the engine. `aliveCountAtDeath`
 * decides whether the game continues, it counts the dying Demon (§16.1), and
 * without a derivation the Storyteller has no way to check it at the table.
 */
export function demonDeathDerivation(
  view: RulesView,
  deadDemonId: PlayerId,
  outcome: DemonDeathOutcome,
): DerivationLine[] {
  const living = view.players.filter((p) => p.alive);
  const scarletWoman = view.players.find((p) => p.characterId === 'scarlet_woman');
  const lines: DerivationLine[] = [
    {
      label: 'alive at death',
      detail:
        `${living
          .map((p) => `${p.name}${p.id === deadDemonId ? ' (the dying Demon)' : ''}`)
          .join(' ')} -> ${outcome.aliveCountAtDeath}` +
        `   (the dying Demon counts, §16.1)`,
    },
    {
      label: 'Scarlet Woman',
      detail: scarletWoman
        ? `${scarletWoman.name}: ${scarletWoman.alive ? 'alive' : 'dead'}, ` +
          `ability ${abilityFunctional(view, scarletWoman) ? 'functional' : 'not functional'}`
        : 'not in play',
    },
  ];

  if (outcome.kind === 'needs_successor_choice') {
    lines.push({
      label: 'result',
      detail: `starpass with no Scarlet Woman — choose a successor from ${outcome.candidates.length} living Minion(s)`,
    });
    return lines;
  }

  const successor = outcome.successorId
    ? view.players.find((p) => p.id === outcome.successorId)
    : null;
  lines.push({
    label: 'result',
    detail: successor
      ? outcome.successorReason === 'scarlet_woman'
        ? `${outcome.aliveCountAtDeath} >= ${SCARLET_WOMAN_THRESHOLD} -> ${successor.name} becomes the Demon`
        : `starpass -> ${successor.name} becomes the Demon`
      : 'no successor — nobody holds the Demon',
  });
  return lines;
}
