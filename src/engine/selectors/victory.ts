import { ONGOING, VICTORY_PREDICATES, type VictoryContext } from '@/editions/troubleBrewing/victory';
import { abilityFunctional } from './predicates';
import type { DerivationLine, RulesView, Victory } from '../types';

export type { VictoryContext };

/**
 * §4.7 — pure, and called EXACTLY ONCE PER TRANSACTION AT COMMIT by the command
 * store (Task 13). Never per event, and never inside applyEvent: the per-event
 * reading declares good the winner the instant the Imp dies, before the Scarlet
 * Woman's ROLE_CHANGED lands, which undoes §4.6 entirely.
 */
export function checkVictory(view: RulesView, context: VictoryContext): Victory {
  // Before the deal there are seated players with no characters. Nothing can be
  // won yet, and every predicate that reads a character would be meaningless.
  if (view.players.length === 0 || view.players.some((p) => p.characterId === '')) {
    return ONGOING;
  }
  for (const predicate of VICTORY_PREDICATES) {
    if (predicate.test(view, context)) {
      return { status: predicate.winner, reason: predicate.reason };
    }
  }
  return ONGOING;
}

/**
 * §8.2, and §4.7's "blocking modal" — the Storyteller must be able to audit the
 * claim before announcing the game is over. Row 4 in particular is a three-clause
 * conjunction that is easy to mis-read at the table.
 */
export function victoryDerivation(view: RulesView, context: VictoryContext): DerivationLine[] {
  const living = view.players.filter((p) => p.alive);
  const demon = living.find((p) => p.team === 'demon');
  const mayor = view.players.find((p) => p.characterId === 'mayor');
  return [
    { label: 'alive', detail: `${living.map((p) => p.name).join(' ')} -> ${living.length}` },
    { label: 'holds the Demon', detail: demon ? demon.name : 'nobody' },
    {
      label: 'executed today',
      detail:
        view.todaysExecutions.length === 0
          ? 'nobody'
          : view.todaysExecutions
              .map((e) => `${view.players.find((p) => p.id === e.playerId)?.name} (${e.kind})`)
              .join(', '),
    },
    {
      label: 'Mayor',
      detail: mayor
        ? `${mayor.name}: ${mayor.alive ? 'alive' : 'dead'}, ability ${
            abilityFunctional(view, mayor) ? 'functional' : 'not functional'
          }`
        : 'not in play',
    },
    { label: 'day closed', detail: context.dayClosed ? 'yes' : 'no' },
    {
      label: 'result',
      detail: (() => {
        const victory = checkVictory(view, context);
        return victory.status === 'ongoing' ? 'the game continues' : `${victory.status} wins — ${victory.reason}`;
      })(),
    },
  ];
}
