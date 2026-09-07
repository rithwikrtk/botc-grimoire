import type {
  AnswerClass,
  CharacterId,
  DeathCause,
  ExecutionKind,
  NoteScope,
  Phase,
  PlayerId,
  RegistrationRuling,
  RuleFlagClass,
  StatusName,
  TxId,
} from './types';
import type { Team, TeamCounts } from '@/editions/troubleBrewing/characters';

export interface ResolutionLink {
  targetId: PlayerId;
  result:
    | 'no_effect'
    | 'monk_protected'
    | 'soldier'
    | 'starpass'
    | 'mayor_bounce'
    | 'already_dead'
    | 'died';
}

export interface GameEventPayloads {
  GAME_CREATED: {
    players: Array<{ id: PlayerId; name: string; seat: number }>;
    edition: { id: string; version: string };
  };
  /** Typos only. Seating and the roster are immutable (§18). */
  PLAYER_RENAMED: { playerId: PlayerId; name: string };

  ROLES_ASSIGNED: {
    assignments: Record<PlayerId, CharacterId>;
    /** Post-modifier counts. Public thereafter (§5.4). */
    distribution: TeamCounts;
    setupModifiers: Array<{ characterId: CharacterId; teamDeltas: Partial<TeamCounts> }>;
    /** null below 7 players (§5.2). */
    demonBluffs: CharacterId[] | null;
    drunkBelief: { playerId: PlayerId; believesCharacterId: CharacterId } | null;
    redHerring: PlayerId | null;
  };
  ROLE_CHANGED: {
    playerId: PlayerId;
    from: CharacterId;
    to: CharacterId;
    reason: 'starpass' | 'scarlet_woman' | 'st_correction' | 'st_balance';
  };

  PHASE_ADVANCED: { phase: 'night' | 'day'; number: number };
  /** Executions are derived from the day's nominations, never stored here (§3.6). */
  DAY_CLOSED: Record<string, never>;

  NIGHT_STEP_RESOLVED: {
    stepId: string;
    actorIds: PlayerId[];
    /** Per-actor steps only. Group steps have no single perceived character (§3.6). */
    perceivedCharacterId?: CharacterId;
    targets: PlayerId[];
    chosenAnswer: string;
    answerClass: AnswerClass;
    answerReason?: string;
    registrationRulings: RegistrationRuling[];
    abilityFunctional: boolean;
    effectSuppressed: boolean;
    stChoice?: string;
  };
  NIGHT_STEP_SKIPPED: {
    stepId: string;
    actorIds: PlayerId[];
    reason: 'condition_unmet' | 'st_skip';
  };
  NIGHT_KILL_RESOLVED: {
    stepId: string;
    actorIds: PlayerId[];
    attackerId: PlayerId;
    chosenTargetId: PlayerId;
    resolutionChain: ResolutionLink[];
    finalVictimId: PlayerId | null;
    successorId: PlayerId | null;
  };

  STATUS_APPLIED: {
    playerId: PlayerId;
    status: StatusName;
    sourcePlayerId: PlayerId | null;
    /** Whether the source's ability worked at application time (§3.6). */
    effective: boolean;
    expiresAt: Phase | null;
  };
  /** Manual Storyteller override only. Normal expiry is declarative (§4.4). */
  STATUS_CLEARED: { playerId: PlayerId; status: StatusName; sourcePlayerId: PlayerId | null };

  DEATH: {
    playerId: PlayerId;
    characterIdAtDeath: CharacterId;
    cause: DeathCause;
    executionKind?: ExecutionKind;
  };
  DEMON_DIED: {
    deadDemonId: PlayerId;
    /** Counts the dying Demon (§16.1). */
    aliveCountAtDeath: number;
    successorId: PlayerId | null;
    successorReason: 'scarlet_woman' | 'starpass' | null;
  };

  NOMINATION_OPENED: { id: string; nominatorId: PlayerId; nomineeId: PlayerId };
  VOTE_CAST: { nominationId: string; voterId: PlayerId };
  NOMINATION_CLOSED: {
    id: string;
    /** Write-only forensic record. No selector reads these three (§3.6). */
    auditTally: number;
    auditThreshold: number;
    butlerVotesFlagged: PlayerId[];
  };
  EXECUTION: { playerId: PlayerId | null; kind: ExecutionKind };
  VIRGIN_TRIGGERED: {
    nominatorId: PlayerId;
    /**
     * Added to §3.6's shape. The reducer previously inferred the Virgin from "the
     * last nomination today", which is deterministic on replay but does not
     * record what the event means, and breaks silently under any reordering.
     */
    nomineeId: PlayerId;
    fired: boolean;
    reason?: string;
    /**
     * Added to §3.6's shape. A Spy ruled a Townsfolk here is a registration
     * ruling like any other, and §9's registration ledger has to see it — the
     * evaluation computed these and the earlier draft dropped them on the floor,
     * leaving the fact as English prose inside `reason`.
     */
    registrationRulings: RegistrationRuling[];
  };
  SLAYER_CLAIMED: {
    claimantId: PlayerId;
    targetId: PlayerId;
    claimantIsRealSlayer: boolean;
    /** The only field that routes into onDemonDeath (§4.6, §16.12). */
    targetIsTrueDemon: boolean;
    targetRegisteredAsDemon: boolean;
    abilityFunctional: boolean;
    outcome: 'died' | 'nothing';
    /** Added to §3.6's shape, for the same reason as VIRGIN_TRIGGERED's. */
    registrationRulings: RegistrationRuling[];
  };

  RULE_FLAGGED: { rule: string; relatedTxId: TxId; class: RuleFlagClass; detail: string };
  NOTE_ADDED: { id: string; scope: NoteScope; playerId?: PlayerId; text: string };

  /** Audit trail. Non-undoable (§3.4). */
  SPY_VIEWED: Record<string, never>;
  SPY_VIEW_ENDED: Record<string, never>;

  GAME_ENDED: {
    winner: 'good' | 'evil';
    reason: 'demon_dead' | 'two_alive' | 'saint_executed' | 'mayor_no_execution' | 'abandoned';
  };
}

export type EventType = keyof GameEventPayloads;

/** The envelope of §3.2, exactly: seq, txId, ts, type, payload. No id, no phase. */
export type GameEvent = {
  [T in EventType]: {
    seq: number;
    txId: TxId;
    /** Stamped by the command layer, never inside applyEvent (§3.2, §3.3). */
    ts: number;
    type: T;
    payload: GameEventPayloads[T];
  };
}[EventType];

export type EventOfType<T extends EventType> = Extract<GameEvent, { type: T }>;

/** §3.4 — the Spy audit trail survives undo. */
export const NON_UNDOABLE_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'SPY_VIEWED',
  'SPY_VIEW_ENDED',
]);

/** The team a character belongs to, re-exported so events.ts is the single import for the log. */
export type { Team };
