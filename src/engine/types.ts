import type { Alignment, Team, TeamCounts } from '@/editions/troubleBrewing/characters';

export type PlayerId = string;
export type CharacterId = string;
export type TxId = string;

export type PhaseKind = 'night' | 'day';
export interface Phase {
  kind: PhaseKind;
  number: number;
}

export type StatusName = 'poisoned' | 'protected' | 'master' | 'redHerring';

export interface StatusEntry {
  status: StatusName;
  /** Who applied it. Retained for the Grimoire and the log; never used for expiry (§4.4). */
  sourcePlayerId: PlayerId | null;
  /**
   * Whether the source's ability actually worked at application time (§3.6). A
   * suppressed effect still places the reminder token, because the physical
   * Storyteller does. Spy Mode must never expose this field (§10.1).
   */
  effective: boolean;
  appliedAt: Phase;
  /** null = never expires (the red herring). */
  expiresAt: Phase | null;
}

export type DeathCause = 'demon' | 'execution' | 'slayer' | 'other';
export type ExecutionKind = 'vote' | 'virgin';

export interface DeathRecord {
  playerId: PlayerId;
  characterIdAtDeath: CharacterId;
  cause: DeathCause;
  executionKind?: ExecutionKind;
  phase: Phase;
  seq: number;
}

export interface ExecutionRecord {
  playerId: PlayerId;
  characterIdAtDeath: CharacterId;
  kind: ExecutionKind;
}

export interface Claim {
  id: string;
  claimedCharacterId: CharacterId;
  day: number;
  confidence: 'hard' | 'soft';
  note?: string;
}

export interface InfoRecord {
  seq: number;
  phase: Phase;
  stepId: string;
  display: string;
  answerClass: AnswerClass;
}

export interface Player {
  id: PlayerId;
  name: string;
  /** Position in the ring, 0-based, immutable after GAME_CREATED (§18). */
  seat: number;
  characterId: CharacterId;
  /** Derived from characterId (§3.8 debt: the Goon would break this). */
  alignment: Alignment;
  team: Team;
  /** Monotonic: derived from DEATH events, never un-set (§3.8 debt). */
  alive: boolean;
  statusLedger: StatusEntry[];
  claims: Claim[];
  infoHistory: InfoRecord[];
  deadVoteSpent: boolean;
  /** The Virgin has been nominated once and has lost the ability, poisoned or not (§16.10). */
  virginTriggered: boolean;
  slayerUsed: boolean;
  /** When this player became the Demon. Persistent, so §6.3's notification survives a day. */
  demonSince: Phase | null;
  demonNotified: boolean;
}

export type VictoryStatus = 'ongoing' | 'good' | 'evil';
export type VictoryReason =
  | 'demon_dead'
  | 'two_alive'
  | 'saint_executed'
  | 'mayor_no_execution'
  | 'abandoned';

export interface Victory {
  status: VictoryStatus;
  reason: VictoryReason | null;
}

export interface Vote {
  voterId: PlayerId;
  /** Whether the voter was dead when the vote was cast — derived at that seq (§7). */
  wasDead: boolean;
}

/**
 * There is deliberately NO butlerViolation field. Guide §10: the Master's vote
 * counts "in either order — the Storyteller can tally the Butler's hand before or
 * after the Master's, and retroactively validate/invalidate it". A flag frozen
 * when the vote lands is wrong for every Butler who raises their hand first, so
 * the violation is a selector over the nomination's FINAL vote set (Task 14).
 */

export interface Nomination {
  id: string;
  nominatorId: PlayerId;
  nomineeId: PlayerId;
  day: number;
  votes: Vote[];
  closed: boolean;
  /**
   * The threshold as it stood when this nomination closed, taken from
   * NOMINATION_CLOSED. Null while open.
   *
   * Guide §10's threshold is per tally, and a Virgin trigger or a Slayer shot can
   * kill someone mid-day — so the alive count at day close is not the count this
   * nomination was voted under. Reading it here is a deliberate departure from
   * §3.6's "write-only forensic record" (see the deviations list).
   */
  closedThreshold: number | null;
}

export type RuleFlagClass = 'social' | 'integrity';

export interface RuleFlag {
  rule: string;
  relatedTxId: TxId;
  class: RuleFlagClass;
  detail: string;
  phase: Phase;
  seq: number;
}

export type NoteScope = 'player' | 'game';
export interface Note {
  id: string;
  scope: NoteScope;
  playerId?: PlayerId;
  text: string;
  seq: number;
  phase: Phase;
}

export interface DrunkBelief {
  playerId: PlayerId;
  believesCharacterId: CharacterId;
}

export interface GameState {
  edition: { id: string; version: string };
  players: Player[];
  phase: Phase;
  /** The post-modifier counts. Public, displayed persistently (§5.4). */
  distribution: TeamCounts;
  /** Three good characters not in play. null below 7 players (§5.2). */
  demonBluffs: CharacterId[] | null;
  drunkBelief: DrunkBelief | null;
  redHerringPlayerId: PlayerId | null;
  /** Night-scoped keys: `${night}:${stepId}:${actorKey}` (§3.7, §6.1). */
  settledStepIds: ReadonlySet<string>;
  /** A list, not a singular field — a Virgin trigger plus a vote is two (§3.6, §16.5). */
  todaysExecutions: ExecutionRecord[];
  /**
   * §7 — whether DAY_CLOSED has landed for the current day. Reset when the next
   * day opens, on the same line as `todaysExecutions`, so during night N+1 it
   * still answers "did day N close?".
   *
   * Exists because `closeDay` is not idempotent and cannot be made so: it
   * recomputes the execution from the day's nominations, and after the first
   * close the top nominee is dead, so `resolveDayExecution`'s `nomineeAlive`
   * filter promotes the RUNNER-UP and executes them too. Nothing in GameState
   * used to record that the day had closed, so neither `closeDay` nor Plan 2
   * could tell. This is the field both of them read.
   */
  dayClosed: boolean;
  nominations: Nomination[];
  ruleFlags: RuleFlag[];
  deaths: DeathRecord[];
  notes: Note[];
  /**
   * Every registration ruling made, in order, as flat arrays per event. Feeds
   * §16.6's consistency flag and Slice 2's registration ledger (§9), which is why
   * VIRGIN_TRIGGERED and SLAYER_CLAIMED also carry their rulings (Task 15).
   */
  registrationHistory: RegistrationRuling[][];
  victory: Victory;
  /**
   * Private Storyteller scratch. Seeded in Slice 1 for one reason: Plan 3's Spy
   * Mode canary test must have a secret field to fail on from day one, rather than
   * passing vacuously until Slice 2 adds notes and ledgers (§15).
   */
  stPrivate: { plannerNote: string };
}

// ---- Information answers (§4.3, §8.2) ----

export type AnswerClass = 'canonical' | 'registration' | 'fabricated' | 'st_override';

export interface RegistrationRuling {
  playerId: PlayerId;
  registersAs: { alignment: Alignment; team: Team };
}

/** One line of "show your working" (§8.2). Rendered by Plan 2, produced here. */
export interface DerivationLine {
  label: string;
  detail: string;
}

export interface LegalAnswer {
  /** Stable across recomputation at the same seq, so a selection can be restored. */
  key: string;
  /**
   * The answer payload: a number, a boolean, a characterId, or a tuple. For the
   * "1 of these 2 players is X" answers the tuple is `[characterId, a, b]`, and
   * `characterId` is **null** when the Storyteller must pick which token to show
   * because the named player was ruled into a team they are not (see `oneOfTwo`).
   */
  value: number | boolean | string | readonly (string | null)[] | null;
  /** What the Storyteller says or shows. */
  display: string;
  answerClass: Extract<AnswerClass, 'canonical' | 'registration'>;
  registrationRulings: RegistrationRuling[];
  derivation: DerivationLine[];
}

/**
 * The narrowed state a resolver may see (§6.2). Built field by field with no
 * spreads so the edition layer structurally cannot reach notes, rule flags or
 * stPrivate.
 */
export interface RulesViewPlayer {
  id: PlayerId;
  name: string;
  seat: number;
  characterId: CharacterId;
  alignment: Alignment;
  team: Team;
  alive: boolean;
  statusLedger: readonly StatusEntry[];
  virginTriggered: boolean;
  slayerUsed: boolean;
  demonSince: Phase | null;
  demonNotified: boolean;
}

export interface RulesView {
  edition: { id: string; version: string };
  players: readonly RulesViewPlayer[];
  phase: Phase;
  distribution: TeamCounts;
  demonBluffs: readonly CharacterId[] | null;
  /**
   * Present because two rules need it directly: wakes() for the Drunk's believed
   * step, and the Washerwoman's exclusion of the Drunk's believed Townsfolk (§6.4).
   * Reading this is not reading perceivedCharacterId, so §4.1's invariant holds.
   */
  drunkBelief: DrunkBelief | null;
  redHerringPlayerId: PlayerId | null;
  deaths: readonly DeathRecord[];
  todaysExecutions: readonly ExecutionRecord[];
}
