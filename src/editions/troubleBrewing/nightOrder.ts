import { alive, playersWithPerceivedCharacter } from '@/engine/selectors/players';
import type { StatusLifetime } from '@/engine/phase';
import type { PlayerId, RulesView, RulesViewPlayer, StatusName } from '@/engine/types';
import { characterById } from './characters';
import { INFO_THRESHOLD_PLAYERS } from './distribution';
import type { StepId } from './stepIds';

export type StepGrouping = 'per-actor' | 'group' | 'pseudo';
/** Reminder-token lifetimes a step can set; the third `StatusLifetime` value, `'permanent'`, is never step-driven. */
export type StatusLifetimeName = Exclude<StatusLifetime, 'permanent'>;

export interface StepScript {
  instruction: string;
  wakeConfirm: string;
  sleepConfirm: string;
  showCard?: 'this_is_the_demon' | 'these_are_your_minions' | 'not_in_play' | 'you_are';
  showToken?: boolean;
  output: 'point' | 'fingers' | 'nod' | 'token' | 'handover' | 'none';
}

/** All constraints are SOFT (§4.8). Off-constraint picks are selectable and flag. */
export interface StepTargets {
  min: number;
  max: number;
  distinct?: boolean;
  warnSelf?: boolean;
  warnDead?: boolean;
  warnRepeat?: boolean;
}

export interface StepEffect {
  status: StatusName;
  lifetime: StatusLifetimeName;
}

export interface NightStep {
  id: StepId;
  grouping: StepGrouping;
  /**
   * Whether the step settles once per actor or once for the whole night.
   *
   * Per-actor is the default and is what lets a real Empath and a
   * Drunk-believing-Empath both resolve separately. The **Imp overrides it to
   * `per-night`**: the Demon gets one kill a night regardless of who holds the
   * token, and without this a mid-night Scarlet Woman promotion leaves
   * `${night}:imp:${newDemonId}` unsettled, so the cursor offers the Imp step a
   * second time and `advanceToDay` will not let you leave the night until you
   * resolve or skip it.
   */
  settleScope: 'per-actor' | 'per-night';
  /** Who is roused. NOT the same question as whether their ability works (§6.2). */
  wakes: (view: RulesView) => RulesViewPlayer[];
  /** Whether the step fires at all tonight. False means auto-skip with a log entry (§6.1). */
  condition: (view: RulesView, actors: readonly RulesViewPlayer[]) => boolean;
  script: StepScript;
  /** Physical table instructions, not the expiry mechanism (§4.4). */
  reminderTokens: { add: StatusName[]; remove: StatusName[] };
  targets: StepTargets | null;
  effect: StepEffect | null;
  /** Key into RESOLVERS (Task 8), or null for a step with no computed answer. */
  resolverId: string | null;
}

const always = (): boolean => true;
const noTokens = { add: [] as StatusName[], remove: [] as StatusName[] };

/**
 * §4.1 — the sanctioned reader of perceived character. §6.2/§4.2:
 * `requiresAlive` lives on the character, never restated on the step, so this
 * reads it from the PERCEIVED character rather than taking a parameter — a
 * dead Drunk who believes they are the Ravenkeeper must still be woken to be
 * given false information, which is the whole point of the Drunk.
 */
const perceivedActors = (characterId: string) => (view: RulesView): RulesViewPlayer[] => {
  const actors = playersWithPerceivedCharacter(view, characterId);
  return characterById(characterId).requiresAlive ? actors.filter(alive) : actors;
};

/** `settleScope` defaults from `grouping`; only the Imp overrides it. */
function step(config: Omit<NightStep, 'settleScope'> & { settleScope?: NightStep['settleScope'] }): NightStep {
  return {
    ...config,
    settleScope: config.settleScope ?? (config.grouping === 'per-actor' ? 'per-actor' : 'per-night'),
  };
}

// ---- pseudo-steps ----

const DUSK = step({
  id: 'dusk_confirm_eyes_closed',
  grouping: 'pseudo',
  wakes: () => [],
  condition: always,
  script: {
    instruction: 'Confirm every player has their eyes closed. Wait about ten seconds.',
    wakeConfirm: '',
    sleepConfirm: 'Eyes closed',
    output: 'none',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

const DAWN_WAIT = step({
  id: 'dawn_wait',
  grouping: 'pseudo',
  wakes: () => [],
  condition: always,
  script: {
    instruction: 'Wait about ten seconds, then call eyes open.',
    wakeConfirm: '',
    sleepConfirm: 'Eyes open',
    output: 'none',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

const DAWN_ANNOUNCE = step({
  id: 'dawn_announce_deaths',
  grouping: 'pseudo',
  wakes: () => [],
  condition: always,
  script: {
    instruction:
      'Announce who died tonight, or that no one died. Read the resolved outcome below.',
    wakeConfirm: '',
    sleepConfirm: 'Announced',
    output: 'none',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- evil info, 7+ players only ----

const MINION_INFO = step({
  id: 'minion_info',
  grouping: 'group',
  wakes: (view) => view.players.filter((p) => p.team === 'minion'),
  // Guide §2, §5.2 — 7+ players only. The eye contact itself needs two Minions,
  // but the step still runs at 7+ with one, to show them the Demon.
  condition: (view) => view.players.length >= INFO_THRESHOLD_PLAYERS,
  script: {
    instruction:
      'If there is more than one Minion, have them make eye contact. Then show the "This is the Demon" card and point to the Demon.',
    wakeConfirm: 'Minions awake',
    sleepConfirm: 'Minions asleep',
    showCard: 'this_is_the_demon',
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

const DEMON_INFO = step({
  id: 'demon_info',
  grouping: 'group',
  wakes: (view) => view.players.filter((p) => p.team === 'demon'),
  condition: (view) => view.players.length >= INFO_THRESHOLD_PLAYERS,
  script: {
    // §6.2's showCard is a single value, but this step shows TWO cards — "these
    // are your minions" and the three not-in-play bluffs (the latter is
    // `showCard: 'not_in_play'`, a declared variant no step currently sets). The
    // second card is carried in prose here rather than in the type; whoever
    // builds the UI for this step should read this at the point of use.
    instruction:
      'Show the "These are your Minions" card and point to each Minion. Then show the "These characters are not in play" card with the three bluffs.',
    wakeConfirm: 'Demon awake',
    sleepConfirm: 'Demon asleep',
    showCard: 'these_are_your_minions',
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- status modifiers ----

const POISONER = step({
  id: 'poisoner',
  grouping: 'per-actor',
  wakes: perceivedActors('poisoner'),
  condition: always,
  script: {
    instruction: 'The Poisoner points to a player. That player is poisoned tonight and tomorrow day.',
    wakeConfirm: 'Poisoner awake',
    sleepConfirm: 'Poisoner asleep',
    output: 'point',
  },
  reminderTokens: { add: ['poisoned'], remove: ['poisoned'] },
  targets: { min: 1, max: 1, warnDead: true },
  effect: { status: 'poisoned', lifetime: 'tonight_and_tomorrow' },
  resolverId: null,
});

const MONK = step({
  id: 'monk',
  grouping: 'per-actor',
  wakes: perceivedActors('monk'),
  condition: always,
  script: {
    instruction: 'The Monk points to a player other than themselves. That player is safe from the Demon tonight.',
    wakeConfirm: 'Monk awake',
    sleepConfirm: 'Monk asleep',
    output: 'point',
  },
  reminderTokens: { add: ['protected'], remove: ['protected'] },
  // Soft: a Monk who points at himself at the table must be recordable (§4.8).
  targets: { min: 1, max: 1, warnSelf: true, warnDead: true },
  effect: { status: 'protected', lifetime: 'until_dawn' },
  resolverId: null,
});

const SPY = step({
  id: 'spy',
  grouping: 'per-actor',
  wakes: perceivedActors('spy'),
  condition: always,
  script: {
    /**
     * §10.3 — "the instruction 'hand the phone over' is rendered ONLY inside Spy
     * Mode. There is no screen that says hand it over which is not already Spy
     * Mode." This string is rendered on the night-step modal, over the Grimoire,
     * so it must carry only the guarded action. The handover copy belongs to
     * Plan 3, inside SpyRoot.
     */
    instruction: 'Enter Spy Mode.',
    wakeConfirm: 'Spy awake',
    sleepConfirm: 'Spy asleep',
    output: 'handover',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- promotion notification ----

const SCARLET_WOMAN_NOTIFY = step({
  id: 'scarlet_woman_notify',
  grouping: 'per-actor',
  /**
   * §6.3 — a persistent flag, not "promoted this night". demonSince is set when
   * the role changes and demonNotified only once they have been told, so a
   * daytime promotion on day 3 is notified on night 4.
   */
  wakes: (view) =>
    view.players.filter(
      (p) => p.alive && p.team === 'demon' && p.demonSince !== null && !p.demonNotified,
    ),
  condition: (_view, actors) => actors.length > 0,
  script: {
    instruction: 'Show the "You are" card and the Demon token.',
    wakeConfirm: 'Awake',
    sleepConfirm: 'Asleep',
    showCard: 'you_are',
    showToken: true,
    output: 'token',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- the kill ----

const IMP = step({
  id: 'imp',
  grouping: 'per-actor',
  // One kill a night for whoever holds the token. See settleScope's doc comment:
  // per-actor keying here gives the promoted Scarlet Woman a second kill.
  settleScope: 'per-night',
  wakes: perceivedActors('imp'),
  condition: always,
  script: {
    instruction:
      'The Imp points to a player, who dies. If they point to themselves, a Minion becomes the new Imp.',
    wakeConfirm: 'Imp awake',
    sleepConfirm: 'Imp asleep',
    output: 'point',
  },
  reminderTokens: noTokens,
  // Self-target is legal here — it is the starpass (§4.5).
  targets: { min: 1, max: 1, warnDead: true },
  effect: null,
  resolverId: null,
});

// ---- reactive info ----

const RAVENKEEPER = step({
  id: 'ravenkeeper',
  grouping: 'per-actor',
  // §6.2 — deliberately does NOT filter on alive. Their ability fires because
  // they died; the Ravenkeeper character has requiresAlive: false, which
  // perceivedActors reads off the character rather than a step-local flag.
  wakes: perceivedActors('ravenkeeper'),
  condition: (view, actors) =>
    actors.some((actor) =>
      view.deaths.some(
        (death) =>
          death.playerId === actor.id &&
          death.phase.kind === view.phase.kind &&
          death.phase.number === view.phase.number,
      ),
    ),
  script: {
    instruction: 'The Ravenkeeper points to a player. Show them that player\'s character token.',
    wakeConfirm: 'Ravenkeeper awake',
    sleepConfirm: 'Ravenkeeper asleep',
    showToken: true,
    output: 'token',
  },
  reminderTokens: noTokens,
  targets: { min: 1, max: 1 },
  effect: null,
  resolverId: 'ravenkeeper',
});

const UNDERTAKER = step({
  id: 'undertaker',
  grouping: 'per-actor',
  wakes: perceivedActors('undertaker'),
  condition: (view) => view.todaysExecutions.length > 0,
  script: {
    instruction: 'Show the Undertaker the character token of the player executed today.',
    wakeConfirm: 'Undertaker awake',
    sleepConfirm: 'Undertaker asleep',
    showToken: true,
    output: 'token',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'undertaker',
});

// ---- first-night one-shot info ----

const WASHERWOMAN = step({
  id: 'washerwoman',
  grouping: 'per-actor',
  wakes: perceivedActors('washerwoman'),
  condition: always,
  script: {
    instruction: 'Show a Townsfolk token, then point to two players — one of them is that character.',
    wakeConfirm: 'Washerwoman awake',
    sleepConfirm: 'Washerwoman asleep',
    showToken: true,
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'washerwoman',
});

const LIBRARIAN = step({
  id: 'librarian',
  grouping: 'per-actor',
  wakes: perceivedActors('librarian'),
  condition: always,
  script: {
    instruction:
      'Show an Outsider token and point to two players, or give the "zero" signal if no Outsiders are in play.',
    wakeConfirm: 'Librarian awake',
    sleepConfirm: 'Librarian asleep',
    showToken: true,
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'librarian',
});

const INVESTIGATOR = step({
  id: 'investigator',
  grouping: 'per-actor',
  wakes: perceivedActors('investigator'),
  condition: always,
  script: {
    instruction: 'Show a Minion token, then point to two players — one of them is that character.',
    wakeConfirm: 'Investigator awake',
    sleepConfirm: 'Investigator asleep',
    showToken: true,
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'investigator',
});

const CHEF = step({
  id: 'chef',
  grouping: 'per-actor',
  wakes: perceivedActors('chef'),
  condition: always,
  script: {
    instruction: 'Hold up fingers for the number of pairs of adjacent evil players.',
    wakeConfirm: 'Chef awake',
    sleepConfirm: 'Chef asleep',
    output: 'fingers',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'chef',
});

// ---- nightly passive info ----

const EMPATH = step({
  id: 'empath',
  grouping: 'per-actor',
  wakes: perceivedActors('empath'),
  condition: always,
  script: {
    instruction: 'Hold up fingers for how many of their two alive neighbours are evil.',
    wakeConfirm: 'Empath awake',
    sleepConfirm: 'Empath asleep',
    output: 'fingers',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'empath',
});

const FORTUNE_TELLER = step({
  id: 'fortune_teller',
  grouping: 'per-actor',
  wakes: perceivedActors('fortune_teller'),
  condition: always,
  script: {
    instruction: 'The Fortune Teller points to two players. Nod or shake your head.',
    wakeConfirm: 'Fortune Teller awake',
    sleepConfirm: 'Fortune Teller asleep',
    output: 'nod',
  },
  reminderTokens: noTokens,
  targets: { min: 2, max: 2, distinct: true },
  effect: null,
  resolverId: 'fortune_teller',
});

const BUTLER = step({
  id: 'butler',
  grouping: 'per-actor',
  wakes: perceivedActors('butler'),
  condition: always,
  script: {
    instruction: 'The Butler points to a player other than themselves, who becomes their Master.',
    wakeConfirm: 'Butler awake',
    sleepConfirm: 'Butler asleep',
    output: 'point',
  },
  reminderTokens: { add: ['master'], remove: ['master'] },
  targets: { min: 1, max: 1, warnSelf: true },
  effect: { status: 'master', lifetime: 'tonight_and_tomorrow' },
  resolverId: null,
});

/** Guide §3, first night. */
export const FIRST_NIGHT: readonly NightStep[] = Object.freeze([
  DUSK,
  MINION_INFO,
  DEMON_INFO,
  POISONER,
  SPY,
  WASHERWOMAN,
  LIBRARIAN,
  INVESTIGATOR,
  CHEF,
  EMPATH,
  FORTUNE_TELLER,
  BUTLER,
  DAWN_WAIT,
  DAWN_ANNOUNCE,
]);

/** Guide §3, every other night. */
export const OTHER_NIGHTS: readonly NightStep[] = Object.freeze([
  DUSK,
  POISONER,
  MONK,
  SPY,
  SCARLET_WOMAN_NOTIFY,
  IMP,
  RAVENKEEPER,
  UNDERTAKER,
  EMPATH,
  FORTUNE_TELLER,
  BUTLER,
  DAWN_WAIT,
  DAWN_ANNOUNCE,
]);

export function nightOrderFor(nightNumber: number): readonly NightStep[] {
  return nightNumber === 1 ? FIRST_NIGHT : OTHER_NIGHTS;
}

/** Re-exported so callers need one import for a target check. */
export type { PlayerId };
