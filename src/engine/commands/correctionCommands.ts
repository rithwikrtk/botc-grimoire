import { characterById } from '@/editions/troubleBrewing/characters';
import { onDemonDeath } from '../rules/demonDeath';
import { playerById } from '../selectors/players';
import { toRulesView } from '../selectors/rulesView';
import type { CharacterId, DeathCause, GameState, NoteScope, PlayerId, StatusName } from '../types';
import type { Store, TransactionResult } from './store';

/**
 * Ids are derived from the log, never from a module counter — §12.8 reloads a game
 * from its events alone, and a counter that restarts at zero reissues ids that are
 * already in use.
 */
function nextNoteId(state: GameState): string {
  const taken = new Set(state.notes.map((n) => n.id));
  for (let n = state.notes.length + 1; ; n += 1) {
    const id = `note${n}`;
    if (!taken.has(id)) return id;
  }
}

/** §3.4 — the second half of "undo plus a note". */
export function addNote(
  store: Store,
  scope: NoteScope,
  text: string,
  playerId?: PlayerId,
): TransactionResult {
  return store.transaction('add a note', (tx) => {
    tx.emit('NOTE_ADDED', {
      id: nextNoteId(store.getState()),
      scope,
      ...(playerId ? { playerId } : {}),
      text,
    });
  });
}

/**
 * §3.4, §4.4 — a manual override. Normal expiry is declarative and needs no
 * event; this is for a status applied by mistake.
 */
export function clearStatus(
  store: Store,
  playerId: PlayerId,
  status: StatusName,
  sourcePlayerId: PlayerId | null,
): TransactionResult {
  return store.transaction('clear a status', (tx) => {
    tx.emit('STATUS_CLEARED', { playerId, status, sourcePlayerId });
  });
}

/**
 * §3.4's primary compensating event. §4.8's integrity invariant means the reducer
 * drops a change that would put two living Demons on the board — so this pairs
 * the event with the flag that makes the banner say so, rather than leaving the
 * Storyteller with a silent no-op.
 */
export function changeRole(
  store: Store,
  playerId: PlayerId,
  to: CharacterId,
  reason: 'st_correction' | 'st_balance',
): TransactionResult {
  const view = toRulesView(store.getState());
  const player = playerById(view, playerId);
  const wouldDoubleDemon =
    characterById(to).team === 'demon' &&
    view.players.some((p) => p.alive && p.id !== playerId && p.team === 'demon');

  return store.transaction(`change ${player.name}'s role`, (tx) => {
    tx.emit('ROLE_CHANGED', { playerId, from: player.characterId, to, reason });
    if (wouldDoubleDemon) {
      tx.flag(
        'two_living_demons',
        'integrity',
        `${player.name} cannot become the Demon while one is alive. Recorded in the log, not applied (§4.8).`,
      );
    }
  });
}

/**
 * §18 — a player who must drop out is handled as a death like any other, left
 * seated so adjacency is unchanged. Also §3.4's corrective DEATH.
 *
 * Routes a true-Demon death through §4.6, exactly as the night kill, the execution
 * and the Slayer do — otherwise the Scarlet Woman never promotes and good wins by
 * default the moment the Demon's player goes home.
 */
export function recordDeath(
  store: Store,
  playerId: PlayerId,
  cause: DeathCause = 'other',
): TransactionResult {
  const view = toRulesView(store.getState());
  const player = playerById(view, playerId);
  const isDemon = characterById(player.characterId).team === 'demon';
  const demonDeath = isDemon
    ? onDemonDeath(view, playerId, { starpass: false, chosenSuccessorId: null })
    : null;

  return store.transaction(`record ${player.name}'s death`, (tx) => {
    tx.emit('DEATH', {
      playerId,
      characterIdAtDeath: player.characterId,
      cause,
    });
    if (demonDeath && demonDeath.kind === 'resolved') {
      tx.emit('DEMON_DIED', {
        deadDemonId: playerId,
        aliveCountAtDeath: demonDeath.aliveCountAtDeath,
        successorId: demonDeath.successorId,
        successorReason: demonDeath.successorReason,
      });
      if (demonDeath.successorId) {
        const successor = tx.view().players.find((p) => p.id === demonDeath.successorId)!;
        tx.emit('ROLE_CHANGED', {
          playerId: successor.id,
          from: successor.characterId,
          to: player.characterId,
          reason: demonDeath.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman',
        });
      }
    }
  });
}
