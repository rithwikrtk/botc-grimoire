import type { GameState, RulesView, RulesViewPlayer } from '../types';

/**
 * §6.2 narrows the view; §10.2 item 2 is the rule this obeys — built field by
 * field, with NO SPREADS. TypeScript is erased and
 * excess-property checking does not fire through a variable, so a spread would
 * hand the edition layer notes, rule flags and stPrivate while type-checking
 * clean. Adding a field to GameState must not silently widen this.
 *
 * Plan 3's SpyView follows the same rule for the same reason (§10.2).
 */
export function toRulesView(state: GameState): RulesView {
  return {
    edition: state.edition,
    players: state.players.map(toRulesViewPlayer),
    phase: state.phase,
    distribution: state.distribution,
    demonBluffs: state.demonBluffs,
    drunkBelief: state.drunkBelief,
    redHerringPlayerId: state.redHerringPlayerId,
    deaths: state.deaths,
    todaysExecutions: state.todaysExecutions,
  };
}

function toRulesViewPlayer(player: GameState['players'][number]): RulesViewPlayer {
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    characterId: player.characterId,
    alignment: player.alignment,
    team: player.team,
    alive: player.alive,
    statusLedger: player.statusLedger,
    virginTriggered: player.virginTriggered,
    slayerUsed: player.slayerUsed,
    demonSince: player.demonSince,
    demonNotified: player.demonNotified,
  };
}
