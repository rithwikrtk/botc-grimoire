import { characterById } from '@/editions/troubleBrewing/characters';
import { onDemonDeath } from '../rules/demonDeath';
import { playerById } from '../selectors/players';
import { toRulesView } from '../selectors/rulesView';
import type { CharacterId, GameState, NoteScope, PlayerId, StatusName } from '../types';
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

/**
 * §3.4 — the second half of "undo plus a note". A malformed note (a player
 * scope with no player, or a playerId naming nobody) is rejected rather than
 * recorded, same as an unknown player id everywhere else in this file
 * (review round 1, M2).
 */
export function addNote(
  store: Store,
  scope: NoteScope,
  text: string,
  playerId?: PlayerId,
): TransactionResult {
  if (scope === 'player' && playerId === undefined) {
    throw new Error("addNote: scope 'player' requires a playerId");
  }
  if (playerId !== undefined) {
    playerById(toRulesView(store.getState()), playerId); // throws on an unknown id
  }
  // Computed before the transaction opens, like nextNominationId — not inside
  // the transaction body (review round 1, M4).
  const id = nextNoteId(store.getState());
  return store.transaction('add a note', (tx) => {
    tx.emit('NOTE_ADDED', {
      id,
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
  // Unknown player id: malformed input, thrown just like changeRole and
  // recordDeath do via playerById (review round 1, M2).
  playerById(toRulesView(store.getState()), playerId);
  return store.transaction('clear a status', (tx) => {
    // Deliberately NOT guarding a status/sourcePlayerId pair that matches
    // nothing in the ledger: clearing a status that isn't there is a
    // legitimate no-op with nothing to corrupt, and §4.8 says don't block an
    // action just because it turns out to be a no-op. Leave this unguarded.
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
 *
 * `cause` excludes 'execution' on purpose (review round 1, I3): an execution's
 * DEATH always arrives with an EXECUTION event beside it and comes from exactly
 * one route — §7's nomination flow (the Virgin trigger included), resolved by
 * closeDay. Accepting 'execution' here would append to todaysExecutions with no
 * EXECUTION event: the Undertaker would read a phantom execution that same
 * night, §4.7 row 4's Mayor win would be suppressed, and row 2 could hand evil
 * the game off a Saint — a second, disagreeing way to execute someone, outside
 * the only route §7 recognises.
 */
export function recordDeath(
  store: Store,
  playerId: PlayerId,
  cause: 'other' | 'demon' | 'slayer' = 'other',
): TransactionResult {
  const view = toRulesView(store.getState());
  const player = playerById(view, playerId);
  const isDemon = characterById(player.characterId).team === 'demon';
  // §4.8/§16.1 (review round 1, I1) — a double-tap on an already-dead player
  // must neither throw nor silently no-op. onDemonDeath's precondition throw
  // exists to catch a caller passing the post-DEATH view (a real off-by-one
  // that turns the Scarlet Woman's threshold from 5 into 6, §16.1), not a
  // genuine repeat call — so it must never be reached for a player who is
  // already dead in `view`. Skip it entirely and flag the DEATH instead below.
  const demonDeath =
    isDemon && player.alive
      ? onDemonDeath(view, playerId, { starpass: false, chosenSuccessorId: null })
      : null;

  return store.transaction(`record ${player.name}'s death`, (tx) => {
    tx.emit('DEATH', {
      playerId,
      characterIdAtDeath: player.characterId,
      cause,
    });
    if (!player.alive) {
      // Recorded and flagged, but no derived state change (§4.8) — same rule
      // name, class and message shape as nightCommands.ts's target-dead flag,
      // so the two producers of this flag agree (review round 1, I1).
      tx.flag(
        'target_dead',
        'integrity',
        `${player.name} is already dead and was targeted by recordDeath. No derived state changes.`,
      );
      return;
    }
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
          // This is a type narrowing, not a reachable branch: successorReason's
          // type is 'scarlet_woman' | 'starpass' | null and TypeScript cannot
          // see that this call site hardcodes starpass: false above.
          // dayCommands.ts's closeDay and claimSlayer, and nightCommands.ts's
          // resolveImpStep, repeat the identical idiom at their own call sites
          // (review round 1, M1) — not restructured here, so all four agree.
          reason: demonDeath.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman',
        });
      }
    }
  });
}
