import { EDITION } from '@/editions/troubleBrewing';
import { MAX_PLAYERS, MIN_PLAYERS } from '@/editions/troubleBrewing/distribution';
import type { DealResult } from '../setup/deal';
import { validateDeal } from '../setup/deal';
import type { PlayerId } from '../types';
import type { Store, TransactionResult } from './store';

export function createGame(
  store: Store,
  players: Array<{ id: PlayerId; name: string }>,
): TransactionResult {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error('Player ids must be unique');

  return store.transaction('create the game', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: EDITION.id, version: EDITION.version },
      // Seat order is the array order and is immutable thereafter (§18).
      players: players.map((player, seat) => ({ id: player.id, name: player.name, seat })),
    });
  });
}

/** Typos only. There is no reseat and no roster change (§18). */
export function renamePlayer(store: Store, playerId: PlayerId, name: string): TransactionResult {
  return store.transaction('rename a player', (tx) => {
    tx.emit('PLAYER_RENAMED', { playerId, name });
  });
}

/** §5.4 — Lock In. Refuses an illegal set rather than recording one. */
export function assignRoles(store: Store, result: DealResult): TransactionResult {
  const playerIds = store.getState().players.map((p) => p.id);
  const issues = validateDeal(playerIds, result);
  if (issues.length > 0) {
    throw new Error(`Cannot lock in an illegal set:\n- ${issues.join('\n- ')}`);
  }
  return store.transaction('lock in the roles', (tx) => {
    tx.emit('ROLES_ASSIGNED', {
      assignments: result.assignments,
      distribution: result.distribution,
      setupModifiers: result.setupModifiers,
      demonBluffs: result.demonBluffs,
      drunkBelief: result.drunkBelief,
      redHerring: result.redHerring,
    });
  });
}

/** §5.5 — called after the seating confirmation screen (Plan 2). */
export function beginFirstNight(store: Store): TransactionResult {
  if (store.getState().players.some((p) => p.characterId === '')) {
    throw new Error('Roles must be locked in before the first night');
  }
  return store.transaction('begin the first night', (tx) => {
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
}
