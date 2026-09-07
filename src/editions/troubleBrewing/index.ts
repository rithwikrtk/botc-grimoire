export {
  CHARACTERS,
  alignmentOf,
  characterById,
  charactersByTeam,
  type Alignment,
  type Character,
  type RegistrationOption,
  type Team,
  type TeamCounts,
} from './characters';
export {
  DISTRIBUTION,
  INFO_THRESHOLD_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  distributionFor,
} from './distribution';
export {
  canRegisterAsTeam,
  isAmbiguous,
  registrationOptions,
  registrationOptionsForCharacterId,
} from './registration';
export { RESOLVERS, type Resolver } from './resolvers';
export { STEP_IDS, type StepId } from './stepIds';
export {
  FIRST_NIGHT,
  OTHER_NIGHTS,
  nightOrderFor,
  type NightStep,
  type StepEffect,
  type StepScript,
  type StepTargets,
} from './nightOrder';

export const EDITION = { id: 'troubleBrewing', version: '1' } as const;
