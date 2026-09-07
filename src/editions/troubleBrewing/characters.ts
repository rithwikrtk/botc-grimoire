export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export type Alignment = 'good' | 'evil';

export interface TeamCounts {
  readonly townsfolk: number;
  readonly outsider: number;
  readonly minion: number;
  readonly demon: number;
}

export interface RegistrationOption {
  readonly alignment: Alignment;
  readonly team: Team;
}

export interface Character {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly abilityText: string;
  /**
   * Whether the ability needs the holder alive. §4.2 — false for the Ravenkeeper
   * (their ability fires because they died) and the Saint (their win check happens
   * after their death). Never duplicated onto a night step (§6.2).
   */
  readonly requiresAlive: boolean;
  /** The holder believes they are a different character (§4.1). Drunk only. */
  readonly falseSelfBelief: boolean;
  /**
   * How this character may register to detection abilities, true option first.
   * A one-element array is the character's own team and alignment; more than one
   * element means the character has ambiguous registration (Recluse, Spy).
   * Registration is a passive property and is NOT gated by abilityFunctional (§4.2).
   */
  readonly registration: readonly RegistrationOption[];
  /** Team deltas applied after Minions are drawn (§5.2). Baron only. */
  readonly setupModifiers: Partial<TeamCounts> | null;
}

const GOOD_TOWNSFOLK: readonly RegistrationOption[] = Object.freeze([
  { alignment: 'good', team: 'townsfolk' },
]);
const GOOD_OUTSIDER: readonly RegistrationOption[] = Object.freeze([
  { alignment: 'good', team: 'outsider' },
]);
const EVIL_MINION: readonly RegistrationOption[] = Object.freeze([
  { alignment: 'evil', team: 'minion' },
]);
const EVIL_DEMON: readonly RegistrationOption[] = Object.freeze([
  { alignment: 'evil', team: 'demon' },
]);

function character(
  id: string,
  name: string,
  team: Team,
  abilityText: string,
  overrides: Partial<Pick<Character, 'requiresAlive' | 'falseSelfBelief' | 'registration' | 'setupModifiers'>> = {},
): Character {
  const base: Record<Team, readonly RegistrationOption[]> = {
    townsfolk: GOOD_TOWNSFOLK,
    outsider: GOOD_OUTSIDER,
    minion: EVIL_MINION,
    demon: EVIL_DEMON,
  };
  const setupModifiers = overrides.setupModifiers ?? null;
  return Object.freeze({
    id,
    name,
    team,
    abilityText,
    requiresAlive: overrides.requiresAlive ?? true,
    falseSelfBelief: overrides.falseSelfBelief ?? false,
    // Freezing here (rather than only at each override's call site) deep-freezes the
    // whole set by construction: shared constants are already frozen at declaration,
    // and this also catches any per-character override array (Recluse, Spy) that
    // was not pre-frozen at its call site.
    registration: Object.freeze(overrides.registration ?? base[team]),
    setupModifiers: setupModifiers ? Object.freeze(setupModifiers) : null,
  });
}

const LIST: readonly Character[] = [
  // ---- Townsfolk (13) ----
  character('washerwoman', 'Washerwoman', 'townsfolk',
    'You start knowing that 1 of 2 players is a particular Townsfolk.'),
  character('librarian', 'Librarian', 'townsfolk',
    'You start knowing that 1 of 2 players is a particular Outsider (or that zero are in play).'),
  character('investigator', 'Investigator', 'townsfolk',
    'You start knowing that 1 of 2 players is a particular Minion.'),
  character('chef', 'Chef', 'townsfolk',
    'You start knowing how many pairs of evil players there are.'),
  character('empath', 'Empath', 'townsfolk',
    'Each night, you learn how many of your 2 alive neighbours are evil.'),
  character('fortune_teller', 'Fortune Teller', 'townsfolk',
    'Each night, choose 2 players: you learn if either is a Demon. There is a good player who registers as a Demon to you.'),
  character('undertaker', 'Undertaker', 'townsfolk',
    'Each night*, you learn which character died by execution today.'),
  character('monk', 'Monk', 'townsfolk',
    'Each night*, choose a player (not yourself): they are safe from the Demon tonight.'),
  character('ravenkeeper', 'Ravenkeeper', 'townsfolk',
    'If you die at night, you are woken to choose a player: you learn their character.',
    { requiresAlive: false }),
  character('virgin', 'Virgin', 'townsfolk',
    'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.'),
  character('slayer', 'Slayer', 'townsfolk',
    'Once per game, during the day, publicly choose a player: if they are the Demon, they die.'),
  character('soldier', 'Soldier', 'townsfolk',
    'You are safe from the Demon.'),
  character('mayor', 'Mayor', 'townsfolk',
    'If only 3 players live and no execution occurs, your team wins. If you die at night, another player might die instead.'),

  // ---- Outsiders (4) ----
  character('butler', 'Butler', 'outsider',
    'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.'),
  character('drunk', 'Drunk', 'outsider',
    "You do not know you are the Drunk. You think you are a Townsfolk character, but you are not — your ability doesn't work and any info is arbitrary.",
    { falseSelfBelief: true }),
  character('recluse', 'Recluse', 'outsider',
    'You might register as evil, and as a Minion or Demon, even if dead.',
    {
      registration: [
        { alignment: 'good', team: 'outsider' },
        { alignment: 'evil', team: 'minion' },
        { alignment: 'evil', team: 'demon' },
      ],
    }),
  character('saint', 'Saint', 'outsider',
    'If you die by execution, your team loses immediately.',
    { requiresAlive: false }),

  // ---- Minions (4) ----
  character('poisoner', 'Poisoner', 'minion',
    'Each night, choose a player: they are poisoned tonight and tomorrow day (their ability malfunctions / gives false info).'),
  character('spy', 'Spy', 'minion',
    'Each night, you see the Grimoire. You might register as good, and as a Townsfolk or Outsider, even if dead.',
    {
      registration: [
        { alignment: 'evil', team: 'minion' },
        { alignment: 'good', team: 'townsfolk' },
        { alignment: 'good', team: 'outsider' },
      ],
    }),
  character('scarlet_woman', 'Scarlet Woman', 'minion',
    'If 5+ players are alive and the Demon dies, you become the Demon.'),
  character('baron', 'Baron', 'minion',
    'There are 2 extra Outsiders in play (replacing 2 Townsfolk).',
    { setupModifiers: { townsfolk: -2, outsider: 2 } }),

  // ---- Demon (1) ----
  character('imp', 'Imp', 'demon',
    'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the new Imp instead.'),
];

export const CHARACTERS: Readonly<Record<string, Character>> = Object.freeze(
  Object.fromEntries(LIST.map((c) => [c.id, c])),
);

export function characterById(id: string): Character {
  const character = CHARACTERS[id];
  if (!character) throw new Error(`Unknown character id: ${id}`);
  return character;
}

export function charactersByTeam(team: Team): Character[] {
  return LIST.filter((c) => c.team === team);
}

export function alignmentOf(characterId: string): Alignment {
  const { team } = characterById(characterId);
  return team === 'minion' || team === 'demon' ? 'evil' : 'good';
}
