import { characterById } from '@/editions/troubleBrewing/characters';
import { onDemonDeath } from '../rules/demonDeath';
import { evaluateSlayer } from '../rules/slayer';
import { evaluateVirgin } from '../rules/virgin';
import {
  butlerViolations,
  type FlagDraft,
  nominationIssues,
  resolveDayExecution,
  tallyFor,
  threshold,
  voteIssues,
} from '../selectors/nominations';
import { registrationInconsistency } from '../selectors/registrationLedger';
import { toRulesView } from '../selectors/rulesView';
import type { GameState, PlayerId, VictoryReason } from '../types';
import type { Store, Tx, TransactionResult } from './store';
import { emitDemonDeath } from './emitDemonDeath';

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
function emitFlags(tx: Tx, issues: FlagDraft[]): void {
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
  const state = store.getState();
  // Matches closeNomination's guard (review round 1, Minor 6): without this, a
  // mistyped id makes the reducer's VOTE_CAST case no-op silently, and voteIssues
  // returns [] for the same unknown id — a vote that is "recorded" and invisible,
  // with no flag raised at all.
  if (!state.nominations.some((n) => n.id === nominationId)) {
    throw new Error(`Unknown nomination: ${nominationId}`);
  }
  const issues = voteIssues(state, nominationId, voterId);
  const name = toRulesView(state).players.find((p) => p.id === voterId)?.name;
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
 *
 * Requires the phase to be day (review round 1, FIX 1): `beginNight` throws the
 * symmetric check twelve lines below, and without this one, calling `closeDay`
 * during a night is reachable, not theoretical — a no-execution day at 4 alive
 * (row 4 wants exactly 3, so no win yet), `beginNight`, the Imp kills someone,
 * down to 3 alive, and a mistimed second `closeDay` would commit
 * `{ dayClosed: true }` against a NIGHT state. Row 4 does not itself check phase
 * (§4.7), so that alone hands good the game silently, at night, in a game evil
 * was winning. This is malformed input from the app layer, not a table rule
 * break — nothing that happened at the table needs un-happening — so it throws,
 * the same line already drawn by `assignRoles` and by the Mayor-bounce structural
 * throws in `demonKill.ts`.
 */
export function closeDay(store: Store): TransactionResult {
  const state = store.getState();
  if (state.phase.kind !== 'day') throw new Error('It is not day');
  if (state.victory.status !== 'ongoing') {
    throw new Error('The game is over — there is no day left to close');
  }
  // CRITICAL. `closeDay` is NOT idempotent, and cannot be: it recomputes the
  // execution from the day's nominations every time. After the first close the
  // top nominee is dead, so `resolveDayExecution`'s `nomineeAlive` filter drops
  // them and the RUNNER-UP becomes the unique highest — a second EXECUTION and
  // DEATH out of one day's votes, a phantom `todaysExecutions` entry the
  // Undertaker reads that night, §4.7 row 4 suppressed, and on a Saint
  // runner-up row 2 hands evil the game. Verified before this guard existed:
  // two nominations at 7 alive (5 votes and 4, threshold 4) killed p2 on the
  // first close and p5 on the second.
  //
  // Note that the victory guard above does NOT cover this — in that scenario
  // the game is still ongoing. The two guards refuse different things.
  //
  // Like the phase check, this is malformed input from the app layer, not a
  // table rule break: nothing has happened to anyone, so §4.8's "never block"
  // does not apply and it throws (the same line already drawn by `beginNight`,
  // `assignRoles` and the Mayor-bounce throws in demonKill.ts).
  if (state.dayClosed) {
    throw new Error('This day has already been closed — call beginNight to open the next night (§7)');
  }
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

        // The onDemonDeath call above stays here: it owns the pre-death view
        // (§16.1). Only the emit is shared (emitDemonDeath.ts).
        if (demonDeath) emitDemonDeath(tx, victim.id, victim.characterId, demonDeath);
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

/**
 * Records the Virgin trigger and, when it fired, executes the nominator. Called
 * right after `nominate`, in its own transaction, so undoing the execution does
 * not undo the nomination — they are two things that happened at the table.
 *
 * Requires the phase to be day, matching `closeDay` and `beginNight` in this
 * same file. `nominationIssues` has no phase check of any kind — not even an
 * advisory flag — so `nominate` + `applyVirgin` at night is fully reachable
 * with no friction. That is not merely a stray DEATH: `applyDeath` appends
 * every execution-caused death to `todaysExecutions`, which is cleared only on
 * entry into a day, never a night (deliberately, so the Undertaker can read it
 * at night) — so a night trigger injects a phantom execution into the very
 * Undertaker answer set that same night, and the Undertaker is told the
 * character of a player nobody executed. The nomination itself stays logged
 * (§7's four nomination checks are unchanged); only the derived death is
 * refused.
 */
export function applyVirgin(
  store: Store,
  nominatorId: PlayerId,
  nomineeId: PlayerId,
  opts: { ruleNominatorAsTownsfolk?: boolean } = {},
): TransactionResult {
  if (store.getState().phase.kind !== 'day') throw new Error('It is not day');
  const view = toRulesView(store.getState());
  const evaluation = evaluateVirgin(view, nominatorId, nomineeId, opts);
  if (!evaluation.isVirginNomination || !evaluation.consumed) {
    throw new Error('applyVirgin called for a nomination that does not trigger the Virgin');
  }
  const nominator = view.players.find((p) => p.id === nominatorId)!;

  return store.transaction('the Virgin is nominated', (tx) => {
    tx.emit('VIRGIN_TRIGGERED', {
      nominatorId,
      nomineeId,
      fired: evaluation.fired,
      reason: evaluation.reason,
      registrationRulings: evaluation.registrationRulings,
    });
    // §16.6 — one of three producers (Task 16 fix round 1, FIX 6: this ledger
    // was wired into resolveStep only, so a Virgin/Slayer ruling was recorded
    // but never checked against a prior one). Reads pre-transaction state —
    // see the note on the matching call in nightCommands.ts's resolveStep for
    // why that, and not tx.view(), is the right read here.
    for (const issue of registrationInconsistency(store.getState(), evaluation.registrationRulings)) {
      tx.flag(issue.rule, issue.class, issue.detail);
    }
    if (!evaluation.fired) return;
    // §16.5 — this is an execution, and it is possible for a vote execution to
    // follow it the same day, which is why todaysExecutions is a list.
    tx.emit('EXECUTION', { playerId: nominatorId, kind: 'virgin' });
    tx.emit('DEATH', {
      playerId: nominatorId,
      characterIdAtDeath: nominator.characterId,
      cause: 'execution',
      executionKind: 'virgin',
    });
  });
}

/**
 * §7, §16.12. Requires the phase to be day (review round 2, FIX 1a) — matching
 * `applyVirgin`/`closeDay`/`beginNight` in this file. `evaluateSlayer`'s own
 * day check answers "what would happen"; this one decides whether the claim
 * may run at all. That distinction matters because the reducer's
 * `slayerUsed` is set purely from `claimantIsRealSlayer`, with no reference to
 * `outcome` or the phase — so without this guard, a night claim from a real,
 * functional Slayer would silently burn the once-per-game shot on a claim
 * that was never actually made at the table.
 *
 * Also refuses when the target's registration is ambiguous and undecided
 * (review round 2, FIX 1b): resolving anyway would likewise spend a real,
 * functional, unspent Slayer's shot on a claim nobody has ruled on yet. This
 * is the ONE guard that refuses rather than records — a bluffing claimant, an
 * already-spent or non-functional Slayer, and an already-dead target all
 * still resolve to `outcome: 'nothing'` and get recorded, per §4.8, because
 * nothing about THEIR resolution depends on a ruling the Storyteller has not
 * made yet.
 */
export function claimSlayer(
  store: Store,
  claimantId: PlayerId,
  targetId: PlayerId,
  opts: { ruleTargetAsDemon?: boolean } = {},
): TransactionResult {
  if (store.getState().phase.kind !== 'day') throw new Error('It is not day');

  const view = toRulesView(store.getState());
  const evaluation = evaluateSlayer(view, claimantId, targetId, opts);
  const target = view.players.find((p) => p.id === targetId)!;

  if (evaluation.needsRegistrationRuling) {
    throw new Error(
      `claimSlayer needs a ruling on ${target.name}: pass { ruleTargetAsDemon: true } or ` +
        '{ ruleTargetAsDemon: false } before resolving',
    );
  }

  const registrationRulings = evaluation.targetRegisteredAsDemon
    ? [{ playerId: targetId, registersAs: { alignment: 'evil' as const, team: 'demon' as const } }]
    : [];

  return store.transaction('a Slayer claim', (tx) => {
    tx.emit('SLAYER_CLAIMED', {
      claimantId,
      targetId,
      claimantIsRealSlayer: evaluation.claimantIsRealSlayer,
      targetIsTrueDemon: evaluation.targetIsTrueDemon,
      targetRegisteredAsDemon: evaluation.targetRegisteredAsDemon,
      abilityFunctional: evaluation.abilityFunctional,
      outcome: evaluation.outcome,
      registrationRulings,
    });
    // §16.6 — the same producer as applyVirgin above (FIX 6). The canonical
    // case: ruling the Recluse a Demon here, after ruling them good on an
    // earlier night, is exactly the contradiction this ledger exists to catch.
    for (const issue of registrationInconsistency(store.getState(), registrationRulings)) {
      tx.flag(issue.rule, issue.class, issue.detail);
    }
    if (evaluation.outcome !== 'died') return;

    // Read the demon-death outcome BEFORE the DEATH lands (§16.1).
    const demonDeath = evaluation.routesToDemonDeath
      ? onDemonDeath(tx.view(), targetId, { starpass: false, chosenSuccessorId: null })
      : null;

    tx.emit('DEATH', {
      playerId: targetId,
      characterIdAtDeath: target.characterId,
      cause: 'slayer',
    });

    // The onDemonDeath call above stays here: it owns the pre-death view (§16.1).
    // Only the emit is shared (emitDemonDeath.ts).
    if (demonDeath) emitDemonDeath(tx, targetId, target.characterId, demonDeath);
  });
}
