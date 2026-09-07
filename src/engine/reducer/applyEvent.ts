import { alignmentOf, characterById } from '@/editions/troubleBrewing/characters';
import type { EventOfType, GameEvent } from '../events';
import { comparePhases } from '../phase';
import type { GameState, Nomination, Phase, Player, PlayerId, StatusEntry } from '../types';

const EMPTY_PLAYER_DEFAULTS = {
  statusLedger: [] as StatusEntry[],
  claims: [],
  infoHistory: [],
  deadVoteSpent: false,
  virginTriggered: false,
  slayerUsed: false,
  demonSince: null,
  demonNotified: false,
} as const;

export function initialState(): GameState {
  return {
    edition: { id: 'troubleBrewing', version: '0' },
    players: [],
    phase: { kind: 'night', number: 0 },
    distribution: { townsfolk: 0, outsider: 0, minion: 0, demon: 0 },
    demonBluffs: null,
    drunkBelief: null,
    redHerringPlayerId: null,
    settledStepIds: new Set<string>(),
    todaysExecutions: [],
    nominations: [],
    ruleFlags: [],
    deaths: [],
    notes: [],
    victory: { status: 'ongoing', reason: null },
    stPrivate: { plannerNote: '' },
  };
}

/**
 * Replaces one player, preserving referential identity of every other player and
 * of every untouched top-level slice (§3.5). Returns the SAME state object when
 * the mapper reports no change.
 */
function mapPlayer(
  state: GameState,
  playerId: PlayerId,
  fn: (player: Player) => Player,
): GameState {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) return state;
  const prior = state.players[index]!;
  const next = fn(prior);
  if (next === prior) return state;
  const players = state.players.slice();
  players[index] = next;
  return { ...state, players };
}

function stepKeyFromEvent(
  phase: Phase,
  stepId: string,
  actorIds: readonly PlayerId[],
): string[] {
  // One key per night for the steps in SINGLE_KEY_STEP_IDS, one per actor
  // otherwise. A step that drifts between the two settles under the wrong key and
  // either loops forever or skips silently, so Task 9 tests that this set agrees
  // with the night order's settleScope.
  if (SINGLE_KEY_STEP_IDS.has(stepId)) return [`${phase.number}:${stepId}:GROUP`];
  return actorIds.map((actorId) => `${phase.number}:${stepId}:${actorId}`);
}

/**
 * Steps that settle under ONE key per night rather than one per actor: the group
 * and pseudo steps, plus the Imp, whose settleScope is per-night because the
 * Demon gets one kill a night whoever holds the token (see nightOrder.ts).
 *
 * Duplicated here because the reducer cannot import the night order without
 * pulling in the whole edition barrel. Task 9 tests that the two agree.
 */
export const SINGLE_KEY_STEP_IDS: ReadonlySet<string> = new Set([
  'dusk_confirm_eyes_closed',
  'minion_info',
  'demon_info',
  'imp',
  'dawn_wait',
  'dawn_announce_deaths',
]);

function withSettled(state: GameState, keys: readonly string[]): GameState {
  const next = new Set(state.settledStepIds);
  let changed = false;
  for (const key of keys) {
    if (!next.has(key)) {
      next.add(key);
      changed = true;
    }
  }
  return changed ? { ...state, settledStepIds: next } : state;
}

function applyDeath(state: GameState, event: EventOfType<'DEATH'>): GameState {
  const { playerId, characterIdAtDeath, cause, executionKind } = event.payload;
  const player = state.players.find((p) => p.id === playerId);
  // §4.8 integrity class: recorded and flagged, but no derived state change.
  if (!player || !player.alive) return state;

  const withDead = mapPlayer(state, playerId, (p) => ({ ...p, alive: false }));
  const deaths = [
    ...state.deaths,
    {
      playerId,
      characterIdAtDeath,
      cause,
      ...(executionKind ? { executionKind } : {}),
      phase: state.phase,
      seq: event.seq,
    },
  ];
  const next: GameState = { ...withDead, deaths };
  if (cause !== 'execution') return next;
  return {
    ...next,
    todaysExecutions: [
      ...next.todaysExecutions,
      { playerId, characterIdAtDeath, kind: executionKind ?? 'vote' },
    ],
  };
}

function applyRolesAssigned(state: GameState, event: EventOfType<'ROLES_ASSIGNED'>): GameState {
  const { assignments, distribution, demonBluffs, drunkBelief, redHerring } = event.payload;
  const players = state.players.map((player) => {
    const characterId = assignments[player.id];
    if (!characterId) throw new Error(`ROLES_ASSIGNED omitted player ${player.id}`);
    const character = characterById(characterId);
    return {
      ...player,
      characterId,
      alignment: alignmentOf(characterId),
      team: character.team,
      demonSince: character.team === 'demon' ? state.phase : null,
      // The dealt Demon was handed their token at setup, so they are already
      // notified. Without this, §6.3's condition wakes the original Imp on night 2
      // and shows them a "You are the Imp" card.
      demonNotified: character.team === 'demon',
    };
  });

  const withHerring = redHerring
    ? players.map((p) =>
        p.id === redHerring
          ? {
              ...p,
              statusLedger: [
                ...p.statusLedger,
                {
                  status: 'redHerring' as const,
                  sourcePlayerId: null,
                  effective: true,
                  appliedAt: state.phase,
                  expiresAt: null,
                },
              ],
            }
          : p,
      )
    : players;

  return {
    ...state,
    players: withHerring,
    distribution,
    demonBluffs,
    drunkBelief,
    redHerringPlayerId: redHerring,
  };
}

export function applyEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_CREATED': {
      const { players, edition } = event.payload;
      return {
        ...state,
        edition,
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          seat: p.seat,
          characterId: '',
          alignment: 'good',
          team: 'townsfolk',
          alive: true,
          ...EMPTY_PLAYER_DEFAULTS,
          statusLedger: [],
          claims: [],
          infoHistory: [],
        })),
      };
    }

    case 'PLAYER_RENAMED':
      return mapPlayer(state, event.payload.playerId, (p) =>
        p.name === event.payload.name ? p : { ...p, name: event.payload.name },
      );

    case 'ROLES_ASSIGNED':
      return applyRolesAssigned(state, event);

    case 'ROLE_CHANGED': {
      const { playerId, to } = event.payload;
      const character = characterById(to);
      // §4.8 integrity invariant: two living Demons must be unreachable. A
      // correction that would create one is recorded in the log and produces no
      // derived state change, exactly like a DEATH for a dead player. The command
      // that emitted it pairs this with a RULE_FLAGGED so the banner can say so
      // (Task 17).
      //
      // This does NOT break the Scarlet Woman: her ROLE_CHANGED arrives in the
      // same transaction as the Imp's DEATH, which lands first, so at this moment
      // no living Demon exists.
      if (character.team === 'demon') {
        const existingDemon = state.players.find(
          (p) => p.alive && p.id !== playerId && p.team === 'demon',
        );
        if (existingDemon) return state;
      }
      return mapPlayer(state, playerId, (p) => ({
        ...p,
        characterId: to,
        alignment: alignmentOf(to),
        team: character.team,
        demonSince: character.team === 'demon' ? (p.demonSince ?? state.phase) : p.demonSince,
      }));
    }

    case 'PHASE_ADVANCED': {
      const phase: Phase = { kind: event.payload.phase, number: event.payload.number };
      if (comparePhases(phase, state.phase) <= 0) {
        throw new Error(
          `PHASE_ADVANCED went backwards: ${state.phase.kind} ${state.phase.number} -> ${phase.kind} ${phase.number}`,
        );
      }
      return {
        ...state,
        phase,
        // A fresh day starts with no executions. Cleared on day entry, not on
        // night entry, because the Undertaker wakes at night and reads the list (§6.3).
        todaysExecutions: phase.kind === 'day' ? [] : state.todaysExecutions,
      };
    }

    case 'DAY_CLOSED':
      return state;

    case 'NIGHT_STEP_RESOLVED': {
      const { stepId, actorIds, chosenAnswer, answerClass } = event.payload;
      const settled = withSettled(state, stepKeyFromEvent(state.phase, stepId, actorIds));
      let next = settled;
      for (const actorId of actorIds) {
        next = mapPlayer(next, actorId, (p) => ({
          ...p,
          infoHistory: [
            ...p.infoHistory,
            { seq: event.seq, phase: state.phase, stepId, display: chosenAnswer, answerClass },
          ],
          // §6.3 — persistent, so a daytime promotion notifies the following night.
          demonNotified: stepId === 'scarlet_woman_notify' ? true : p.demonNotified,
        }));
      }
      return next;
    }

    case 'NIGHT_STEP_SKIPPED':
      return withSettled(
        state,
        stepKeyFromEvent(state.phase, event.payload.stepId, event.payload.actorIds),
      );

    case 'NIGHT_KILL_RESOLVED':
      // Deaths, promotions and statuses are separate events in the same
      // transaction (§3.2). This event only settles the step and records forensics.
      return withSettled(
        state,
        stepKeyFromEvent(state.phase, event.payload.stepId, event.payload.actorIds),
      );

    case 'STATUS_APPLIED': {
      const { playerId, status, sourcePlayerId, effective, expiresAt } = event.payload;
      return mapPlayer(state, playerId, (p) => ({
        ...p,
        statusLedger: [
          ...p.statusLedger,
          { status, sourcePlayerId, effective, appliedAt: state.phase, expiresAt },
        ],
      }));
    }

    case 'STATUS_CLEARED': {
      const { playerId, status, sourcePlayerId } = event.payload;
      return mapPlayer(state, playerId, (p) => {
        const statusLedger = p.statusLedger.filter(
          (s) => !(s.status === status && s.sourcePlayerId === sourcePlayerId),
        );
        return statusLedger.length === p.statusLedger.length ? p : { ...p, statusLedger };
      });
    }

    case 'DEATH':
      return applyDeath(state, event);

    case 'DEMON_DIED':
      // Forensic record. The ROLE_CHANGED in the same transaction moves the role.
      return state;

    case 'NOMINATION_OPENED': {
      const { id, nominatorId, nomineeId } = event.payload;
      const nomination: Nomination = {
        id,
        nominatorId,
        nomineeId,
        day: state.phase.number,
        votes: [],
        closed: false,
        closedThreshold: null,
      };
      return { ...state, nominations: [...state.nominations, nomination] };
    }

    case 'VOTE_CAST': {
      const { nominationId, voterId } = event.payload;
      const index = state.nominations.findIndex((n) => n.id === nominationId);
      if (index === -1) return state;
      const nomination = state.nominations[index]!;
      const voter = state.players.find((p) => p.id === voterId);
      if (!voter) return state;
      if (nomination.votes.some((v) => v.voterId === voterId)) return state;

      const wasDead = !voter.alive;
      const nominations = state.nominations.slice();
      nominations[index] = {
        ...nomination,
        votes: [...nomination.votes, { voterId, wasDead }],
      };
      // A dead player's single ghost vote is spent the moment it is cast (guide §12).
      const withVote: GameState = { ...state, nominations };
      return wasDead && !voter.deadVoteSpent
        ? mapPlayer(withVote, voterId, (p) => ({ ...p, deadVoteSpent: true }))
        : withVote;
    }

    case 'NOMINATION_CLOSED': {
      const index = state.nominations.findIndex((n) => n.id === event.payload.id);
      if (index === -1) return state;
      const nominations = state.nominations.slice();
      nominations[index] = {
        ...nominations[index]!,
        closed: true,
        // Guide §10's threshold is per tally, so it is frozen per nomination.
        closedThreshold: event.payload.auditThreshold,
      };
      return { ...state, nominations };
    }

    case 'EXECUTION':
      // Forensic. The DEATH in the same transaction is what kills, and it is what
      // appends to todaysExecutions — so a no-execution day emits EXECUTION { null }
      // without touching the list (§4.7 row 4).
      return state;

    case 'VIRGIN_TRIGGERED':
      // The Virgin loses the ability either way, poisoned or not (§16.10). The
      // nominee is the Virgin; the nominator is who dies, in a separate DEATH
      // event in the same transaction.
      return mapPlayer(state, event.payload.nomineeId, (p) =>
        p.virginTriggered ? p : { ...p, virginTriggered: true },
      );

    case 'SLAYER_CLAIMED':
      // Only a real Slayer consumes the once-per-game ability. A bluffing claimant
      // has no ability to spend.
      return event.payload.claimantIsRealSlayer
        ? mapPlayer(state, event.payload.claimantId, (p) =>
            p.slayerUsed ? p : { ...p, slayerUsed: true },
          )
        : state;

    case 'RULE_FLAGGED':
      return {
        ...state,
        ruleFlags: [
          ...state.ruleFlags,
          { ...event.payload, phase: state.phase, seq: event.seq },
        ],
      };

    case 'NOTE_ADDED': {
      const { id, scope, playerId, text } = event.payload;
      return {
        ...state,
        notes: [
          ...state.notes,
          { id, scope, ...(playerId ? { playerId } : {}), text, seq: event.seq, phase: state.phase },
        ],
      };
    }

    case 'SPY_VIEWED':
    case 'SPY_VIEW_ENDED':
      // Audit trail only, and non-undoable (§3.4). No derived state.
      return state;

    case 'GAME_ENDED':
      return {
        ...state,
        victory: { status: event.payload.winner, reason: event.payload.reason },
      };

    default: {
      const exhaustive: never = event;
      throw new Error(
        `Unhandled event type: ${(exhaustive as { type?: string }).type ?? 'unknown'}`,
      );
    }
  }
}
