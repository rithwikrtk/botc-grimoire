/**
 * Part of the replay contract (§3.8). Every NIGHT_STEP_RESOLVED and
 * NIGHT_STEP_SKIPPED in every persisted game references one of these, and
 * settledStepIds keys are built from them — so renaming one silently un-settles
 * every step of that name in every saved game. Add to the end; never rename.
 */
export const STEP_IDS = [
  'dusk_confirm_eyes_closed',
  'minion_info',
  'demon_info',
  'poisoner',
  'monk',
  'spy',
  'scarlet_woman_notify',
  'imp',
  'ravenkeeper',
  'undertaker',
  'washerwoman',
  'librarian',
  'investigator',
  'chef',
  'empath',
  'fortune_teller',
  'butler',
  'dawn_wait',
  'dawn_announce_deaths',
] as const;

export type StepId = (typeof STEP_IDS)[number];
