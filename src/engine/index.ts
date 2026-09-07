// ---- the edition's public surface (§3.8 isolates the DATA, not access to it) ----
export {
  CHARACTERS,
  DISTRIBUTION,
  EDITION,
  FIRST_NIGHT,
  INFO_THRESHOLD_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  OTHER_NIGHTS,
  RESOLVERS,
  STEP_IDS,
  alignmentOf,
  canRegisterAsTeam,
  characterById,
  charactersByTeam,
  distributionFor,
  isAmbiguous,
  nightOrderFor,
  registrationOptionsForCharacterId,
  type Alignment,
  type Character,
  type NightStep,
  type RegistrationOption,
  type Resolver,
  type StepEffect,
  type StepId,
  type StepScript,
  type StepTargets,
  type Team,
  type TeamCounts,
} from '@/editions/troubleBrewing';
export { SCARLET_WOMAN_BEATS_STARPASS, SCARLET_WOMAN_THRESHOLD } from './rules/demonDeath';

export type {
  AnswerClass,
  CharacterId,
  Claim,
  DeathRecord,
  DerivationLine,
  ExecutionRecord,
  GameState,
  InfoRecord,
  LegalAnswer,
  Nomination,
  Note,
  Phase,
  Player,
  PlayerId,
  RegistrationRuling,
  RuleFlag,
  RuleFlagClass,
  RulesView,
  RulesViewPlayer,
  StatusEntry,
  StatusName,
  Victory,
  VictoryReason,
  Vote,
} from './types';
export type { EventType, GameEvent, ResolutionLink } from './events';

export { comparePhases, expiryFor, isStatusActive, nextPhase, phaseOrdinal } from './phase';
export { reduce, initialState } from './reducer/fold';

export { createStore, type Store, type Tx, type TransactionResult } from './commands/store';
export { assignRoles, beginFirstNight, createGame, renamePlayer } from './commands/setupCommands';
export {
  advanceToDay,
  autoSkipUnmetSteps,
  candidatesForCurrentStep,
  resolveImpStep,
  resolveStep,
  skipStep,
  type ImpStepOptions,
  type StepResolution,
} from './commands/nightCommands';
export {
  applyVirgin,
  beginNight,
  castVote,
  claimSlayer,
  closeDay,
  closeNomination,
  endGame,
  nominate,
} from './commands/dayCommands';

export {
  deal,
  distributionDerivation,
  randomPicker,
  rerollOne,
  validateDeal,
  type DealResult,
  type Picker,
} from './setup/deal';

export {
  nextStep,
  nightOverview,
  stepKey,
  type CursorPosition,
  type OverviewRow,
} from './selectors/nightCursor';
export { priorRulings, registrationInconsistency } from './selectors/registrationLedger';
export { toRulesView } from './selectors/rulesView';
export { abilityFunctional, isDrunk } from './selectors/predicates';
export {
  alive,
  aliveCount,
  bySeat,
  livingPlayers,
  perceivedCharacterId,
  playerById,
  playersWithPerceivedCharacter,
} from './selectors/players';
export {
  activeStatuses,
  grimoireTokens,
  isPoisoned,
  isProtected,
  isRedHerring,
  masterOf,
  type GrimoireToken,
} from './selectors/statuses';
export {
  aliveNeighbours,
  chefDerivation,
  chefPairs,
  empathCount,
  empathDerivation,
  ringOrder,
  type AlignmentOverrides,
} from './selectors/seating';
export {
  butlerViolations,
  nominationIssues,
  nominationsOnDay,
  resolveDayExecution,
  tallyFor,
  threshold,
  thresholdDerivation,
  todaysNominations,
  voteIssues,
  voteOrder,
  type FlagDraft,
} from './selectors/nominations';
export { checkVictory, victoryDerivation, type VictoryContext } from './selectors/victory';
export { killDerivation, mayorBounceCandidates, resolveDemonKill, type KillOutcome } from './rules/demonKill';
export { demonDeathDerivation, onDemonDeath, type DemonDeathOutcome } from './rules/demonDeath';
export { evaluateVirgin, type VirginEvaluation } from './rules/virgin';
export { evaluateSlayer, type SlayerEvaluation } from './rules/slayer';
