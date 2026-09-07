import { characterById } from '@/editions/troubleBrewing/characters';
import { onDemonDeath } from '../rules/demonDeath';
import {
  butlerViolations,
  nominationIssues,
  resolveDayExecution,
  tallyFor,
  threshold,
  voteIssues,
} from '../selectors/nominations';
import { toRulesView } from '../selectors/rulesView';
import type { GameState, PlayerId, VictoryReason } from '../types';
import type { Store, Tx, TransactionResult } from './store';

/**
 * Derived from the log, never from module state. §12.8 reloads a game from its
 * events alone, so a module counter restarts at zero while the log already holds
 * nom1..nomN — and the reducer resolves VOTE_CAST by id, so every vote on the new
 * nomination would silently land on the old one.
 */
function nextNominationId(state: GameState): string {
  const taken = new Set(state.nominations.map((n) => n.id));
  for (let n = state.nominations.length + 1; ; n += 1) {
    const id = `nom${n}`;
    if (!taken.has(id)) return id;
  }
}

/** §4.8 — record the action, then flag it. Never the other way round, and never instead. */
function emitFlags(tx: Tx, issues: ReturnType<typeof nominationIssues>): void {
  for (const issue of issues) tx.flag(issue.rule, issue.class, issue.detail);
}

export function nominate(
  store: Store,
  nominatorId: PlayerId,
  nomineeId: PlayerId,
): TransactionResult & { nominationId: string } {
  const id = nextNominationId(store.getState());
  const issues = nominationIssues(store.getState(), nominatorId, nomineeId);
  const view = toRulesView(store.getState());
  const label = `${view.players.find((p) => p.id === nominatorId)?.name} nominates ${
    view.players.find((p) => p.id === nomineeId)?.name
  }`;
  const result = store.transaction(label, (tx) => {
    tx.emit('NOMINATION_OPENED', { id, nominatorId, nomineeId });
    emitFlags(tx, issues);
  });
  return { ...result, nominationId: id };
}

export function castVote(store: Store, nominationId: string, voterId: PlayerId): TransactionResult {
  const issues = voteIssues(store.getState(), nominationId, voterId);
  const name = toRulesView(store.getState()).players.find((p) => p.id === voterId)?.name;
  return store.transaction(`${name} votes`, (tx) => {
    tx.emit('VOTE_CAST', { nominationId, voterId });
    emitFlags(tx, issues);
  });
}

export function closeNomination(store: Store, nominationId: string): TransactionResult {
  const state = store.getState();
  const nomination = state.nominations.find((n) => n.id === nominationId);
  if (!nomination) throw new Error(`Unknown nomination: ${nominationId}`);
  const view = toRulesView(state);
  return store.transaction('close the nomination', (tx) => {
    tx.emit('NOMINATION_CLOSED', {
      id: nominationId,
      // Write-only forensic record. No selector reads these (§3.6).
      auditTally: tallyFor(nomination),
      auditThreshold: threshold(view),
      butlerVotesFlagged: butlerViolations(state, nominationId),
    });
  });
}

/**
 * §7 — always available, INCLUDING with zero nominations, because the Mayor's win
 * is only reachable through a day that closed with no execution. Resolves any
 * execution and routes a Demon death through §4.6, in one transaction, so undo
 * restores the whole day close.
 *
 * DELIBERATELY DOES NOT ADVANCE THE PHASE. Victory is checked at this
 * transaction's commit (§4.7), and three of the four rows are phase-sensitive:
 *
 *   - row 2 compares the Saint's DeathRecord.phase to the current phase, and
 *   - rows 2 and 4 both call abilityFunctional, which reads poison that expires
 *     at the end of day N.
 *
 * Advancing to night N+1 inside this transaction therefore made evil's Saint win
 * unreachable and handed good the game for a poisoned Mayor. Call `beginNight`
 * once the win modal has been dismissed.
 */
export function closeDay(store: Store): TransactionResult {
  const state = store.getState();
  const execution = resolveDayExecution(state);

  return store.transaction(
    'close the day',
    (tx) => {
      tx.emit('DAY_CLOSED', {});
      tx.emit('EXECUTION', { playerId: execution.playerId, kind: 'vote' });

      if (execution.playerId !== null) {
        const view = tx.view();
        const victim = view.players.find((p) => p.id === execution.playerId)!;
        const isDemon = characterById(victim.characterId).team === 'demon';

        // §4.6 — read the outcome BEFORE the death is applied, so
        // aliveCountAtDeath counts the dying Demon (§16.1).
        const demonDeath = isDemon
          ? onDemonDeath(view, victim.id, { starpass: false, chosenSuccessorId: null })
          : null;

        tx.emit('DEATH', {
          playerId: victim.id,
          characterIdAtDeath: victim.characterId,
          cause: 'execution',
          executionKind: 'vote',
        });

        if (demonDeath && demonDeath.kind === 'resolved') {
          tx.emit('DEMON_DIED', {
            deadDemonId: victim.id,
            aliveCountAtDeath: demonDeath.aliveCountAtDeath,
            successorId: demonDeath.successorId,
            successorReason: demonDeath.successorReason,
          });
          if (demonDeath.successorId) {
            const successor = tx.view().players.find((p) => p.id === demonDeath.successorId)!;
            tx.emit('ROLE_CHANGED', {
              playerId: successor.id,
              from: successor.characterId,
              to: victim.characterId,
              reason: demonDeath.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman',
            });
          }
        }
      }

    },
    { dayClosed: true },
  );
}

/**
 * §6 — opens the next night. Separate from `closeDay` so victory is decided while
 * the phase is still day N (see closeDay), and so §4.7's blocking modal appears on
 * the day screen rather than after the night has already started.
 *
 * Refuses once the game is over: `nextStep` returns null on a finished game
 * anyway, but advancing would put a decided game on a night screen.
 */
export function beginNight(store: Store): TransactionResult {
  const state = store.getState();
  if (state.phase.kind !== 'day') throw new Error('It is not day');
  if (state.victory.status !== 'ongoing') {
    throw new Error('The game is over — there is no next night');
  }
  return store.transaction('begin the night', (tx) => {
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: state.phase.number + 1 });
  });
}

/**
 * §7 — for the ordinary case where evil concedes or people go home. Without this,
 * reason 'abandoned' has no producer and an abandoned game cannot be summarised.
 */
export function endGame(
  store: Store,
  winner: 'good' | 'evil',
  reason: VictoryReason,
): TransactionResult {
  return store.transaction('end the game', (tx) => {
    tx.emit('GAME_ENDED', { winner, reason });
  });
}
