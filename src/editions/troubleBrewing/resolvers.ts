import type {
  DerivationLine,
  LegalAnswer,
  PlayerId,
  RegistrationRuling,
  RulesView,
  RulesViewPlayer,
} from '@/engine/types';
import { playerById } from '@/engine/selectors/players';
import {
  aliveNeighbours,
  chefDerivation,
  chefPairs,
  empathCount,
  empathDerivation,
  type AlignmentOverrides,
} from '@/engine/selectors/seating';
import {
  alignmentOf,
  characterById,
  type Alignment,
  type RegistrationOption,
  type Team,
} from './characters';
import { isAmbiguous, registrationOptionsForCharacterId } from './registration';

export type Resolver = (
  view: RulesView,
  actorId: PlayerId,
  targets?: readonly PlayerId[],
) => LegalAnswer[];

function answer(
  key: string,
  value: LegalAnswer['value'],
  display: string,
  derivation: DerivationLine[],
  rulings: RegistrationRuling[] = [],
): LegalAnswer {
  return {
    key,
    value,
    display,
    answerClass: rulings.length > 0 ? 'registration' : 'canonical',
    registrationRulings: rulings,
    derivation,
  };
}

// ---- numeric answers ----

/**
 * §4.3 — the cross-product over each ambiguous player's registration options,
 * reduced to the distinct ALIGNMENTS, because alignment is all the Chef and the
 * Empath can see. Trouble Brewing has at most one Recluse and one Spy, so this is
 * at most four combinations.
 *
 * The empty combination comes first, so element 0 is always the canonical answer.
 */
function alignmentCombinations(
  candidates: readonly RulesViewPlayer[],
): RegistrationRuling[][] {
  let combos: RegistrationRuling[][] = [[]];
  for (const player of candidates) {
    const byAlignment = new Map<Alignment, RegistrationOption>();
    for (const option of registrationOptionsForCharacterId(player.characterId)) {
      if (!byAlignment.has(option.alignment)) byAlignment.set(option.alignment, option);
    }
    const trueAlignment = alignmentOf(player.characterId);
    const next: RegistrationRuling[][] = [];
    for (const combo of combos) {
      for (const [alignment, option] of byAlignment) {
        next.push(
          alignment === trueAlignment
            ? combo
            : [...combo, { playerId: player.id, registersAs: option }],
        );
      }
    }
    combos = next;
  }
  return combos;
}

function overridesFrom(rulings: readonly RegistrationRuling[]): AlignmentOverrides {
  return new Map(rulings.map((r) => [r.playerId, r.registersAs.alignment]));
}

function ambiguousAmong(players: readonly RulesViewPlayer[]): RulesViewPlayer[] {
  return players.filter((p) => p.characterId !== '' && isAmbiguous(p.characterId));
}

function rulingKey(prefix: string, rulings: readonly RegistrationRuling[]): string {
  if (rulings.length === 0) return prefix;
  return `${prefix}:${rulings
    .map((r) => `${r.playerId}=${r.registersAs.alignment}`)
    .sort()
    .join(',')}`;
}

/** "a" before a consonant sound, "an" before a vowel sound (only `outsider` needs it). */
function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * The Chef counts ALL evil players, alive or dead, so every ambiguous seat in the
 * ring can change the answer — a Recluse adjacent to a Minion is the single most
 * common Storyteller ruling in the edition.
 */
export const chefAnswers: Resolver = (view) =>
  alignmentCombinations(ambiguousAmong(view.players)).map((rulings) => {
    const overrides = overridesFrom(rulings);
    const value = chefPairs(view, overrides);
    return answer(
      rulingKey('chef', rulings),
      value,
      String(value),
      chefDerivation(view, overrides),
      rulings,
    );
  });

/** Only the two ALIVE neighbours can register to the Empath (§6.4). */
export const empathAnswers: Resolver = (view, actorId) =>
  alignmentCombinations(ambiguousAmong(aliveNeighbours(view, actorId))).map((rulings) => {
    const overrides = overridesFrom(rulings);
    const value = empathCount(view, actorId, overrides);
    return answer(
      rulingKey('empath', rulings),
      value,
      String(value),
      empathDerivation(view, actorId, overrides),
      rulings,
    );
  });

// ---- "1 of these 2 players is X" answers ----

/**
 * The players who could be presented as holding `team`, each with the ruling that
 * makes it true. A player whose true team matches needs no ruling; an ambiguous
 * player (Recluse, Spy) needs one (§4.3).
 */
function couldRegisterAs(
  view: RulesView,
  team: Team,
): Array<{ player: RulesViewPlayer; rulings: RegistrationRuling[] }> {
  const results: Array<{ player: RulesViewPlayer; rulings: RegistrationRuling[] }> = [];
  for (const player of view.players) {
    if (player.characterId === '') continue;
    for (const option of registrationOptionsForCharacterId(player.characterId)) {
      if (option.team !== team) continue;
      const isTrue = characterById(player.characterId).team === team;
      results.push({
        player,
        rulings: isTrue ? [] : [{ playerId: player.id, registersAs: option }],
      });
    }
  }
  return results;
}

/**
 * Builds the "1 of these 2 is a particular X" answer set: each candidate holder,
 * paired with every other player as the decoy.
 *
 * `excludePlayerIds` drops players who may not be presented in this slot at all
 * — the Washerwoman's exclusion of the Drunk (§6.4) and of the actor themselves.
 * The character shown is always the candidate's character as it registers, and
 * NEVER a believed character: §4.1 confines perceivedCharacterId to wakes() and
 * rendering, and this is a rules answer.
 */
function oneOfTwo(
  view: RulesView,
  actorId: PlayerId,
  team: Team,
  excludePlayerIds: ReadonlySet<PlayerId>,
): LegalAnswer[] {
  const answers: LegalAnswer[] = [];
  const candidates = couldRegisterAs(view, team).filter(
    ({ player }) => player.id !== actorId && !excludePlayerIds.has(player.id),
  );

  for (const { player, rulings } of candidates) {
    // A ruled registration shows SOME character of the ruled team that is not in
    // play, and which one is the Storyteller's choice, recorded on the step's
    // stChoice (§3.6). The resolver cannot pick it — enumerating every not-in-play
    // Minion × every decoy is the kilobyte cross-product §3.6 refuses to store.
    //
    // So the shown character is deliberately NULL for a ruled answer. It must not
    // fall back to the ambiguous player's own character: that renders as
    // "Recluse: P6 or P3" for an Investigator, which is the one thing that must
    // never be shown or written into infoHistory.
    const ruled = rulings.length > 0;
    const shownCharacterId = ruled ? null : player.characterId;

    for (const decoy of view.players) {
      if (decoy.id === player.id || decoy.id === actorId) continue;
      answers.push(
        answer(
          `${team}:${player.id}:${decoy.id}`,
          [shownCharacterId, player.id, decoy.id],
          ruled
            ? `${articleFor(team)} ${team} of your choosing: ${player.name} or ${decoy.name}`
            : `${characterById(player.characterId).name}: ${player.name} or ${decoy.name}`,
          [
            {
              label: `${team} in play`,
              detail: ruled
                ? `${player.name}, ruled to register as ${team} — choose which ${team} token to show`
                : `${characterById(player.characterId).name} (${player.name})`,
            },
            { label: 'decoy', detail: decoy.name },
            ...(ruled
              ? [
                  {
                    label: 'registration ruling',
                    detail: `${player.name} (${characterById(player.characterId).name}) ruled to register as ${team}`,
                  },
                ]
              : []),
          ],
          rulings,
        ),
      );
    }
  }

  // Canonical answers first (§4.3), then registration ones.
  return answers.sort(
    (a, b) => Number(a.answerClass === 'registration') - Number(b.answerClass === 'registration'),
  );
}

export const washerwomanAnswers: Resolver = (view, actorId) => {
  // §6.4 — the Washerwoman may NOT be shown the Drunk under their believed
  // Townsfolk. The Drunk's TRUE team is outsider, so couldRegisterAs('townsfolk')
  // already excludes them; the explicit exclusion documents the rule and survives
  // any future change to how the Drunk registers.
  const excluded = new Set<PlayerId>();
  if (view.drunkBelief) excluded.add(view.drunkBelief.playerId);
  return oneOfTwo(view, actorId, 'townsfolk', excluded);
};

export const librarianAnswers: Resolver = (view, actorId) => {
  // The Librarian MAY be shown the Drunk — they are a real Outsider (§6.4).
  const answers = oneOfTwo(view, actorId, 'outsider', new Set());

  // §6.4 — the explicit zero-Outsiders branch. Discriminated by the WORLD (does
  // any player's TRUE character sit on the outsider team?), never by whether
  // `answers` happens to be empty: a Spy's {good, outsider} registration option
  // can make `answers` non-empty even in a legal zero-Outsider game (7/10/13
  // players), which must never suppress the true "zero Outsiders" answer — that
  // was the Critical defect this branch fixes.
  //
  // The actor is excluded from the check: a Drunk who believes they are the
  // Librarian wakes at this very step (§4.1 — wakes() reads the perceived
  // character), and the Drunk's true team IS outsider. Counting the actor's own
  // seat would suppress the zero answer while `oneOfTwo` (which always excludes
  // the actor from its own candidates) finds nobody else to offer, leaving an
  // empty answer set — the same failure one edge over.
  const hasTrueOutsider = view.players.some(
    (p) =>
      p.characterId !== '' &&
      p.id !== actorId &&
      characterById(p.characterId).team === 'outsider',
  );
  if (hasTrueOutsider) return answers;

  const zeroAnswer = answer('librarian:zero', null, 'Zero Outsiders are in play', [
    { label: 'outsiders in play', detail: 'none' },
    { label: 'result', detail: 'show the "zero" signal -> 0' },
  ]);
  return [zeroAnswer, ...answers];
};

export const investigatorAnswers: Resolver = (view, actorId) =>
  oneOfTwo(view, actorId, 'minion', new Set());

// ---- yes/no and character answers ----

/**
 * §4.8 — target constraints are SOFT. An earlier draft threw when the Fortune
 * Teller had not chosen exactly two players, which is the v2 bug §4.8 was written
 * to kill: the command layer records an off-constraint pick with a `social` flag,
 * and the resolver then refused to produce an answer for it. It degrades instead,
 * and puts the deviation in the derivation.
 */
export const fortuneTellerAnswers: Resolver = (view, _actorId, targets = []) => {
  const chosen = targets.map((id) => playerById(view, id));
  // The same player chosen twice is off-constraint too — the Fortune Teller must
  // choose 2 DISTINCT players. Deduped for answer construction so a repeated
  // target cannot mint two answers sharing one key (§6.2's stable-key contract).
  const distinctChosen = [...new Map(chosen.map((p) => [p.id, p] as const)).values()];
  const isOffConstraint = chosen.length !== 2 || distinctChosen.length !== chosen.length;
  const herring = chosen.find((p) => p.id === view.redHerringPlayerId) ?? null;
  const trueDemon = chosen.find((p) => characterById(p.characterId).team === 'demon') ?? null;

  const base: DerivationLine[] = [
    ...(isOffConstraint
      ? [
          {
            label: 'off-constraint',
            detail:
              chosen.length !== 2
                ? `${chosen.length} player${chosen.length === 1 ? '' : 's'} chosen, not 2 — recorded and flagged (§4.8)`
                : 'the same player chosen twice, not two distinct players — recorded and flagged (§4.8)',
          },
        ]
      : []),
    { label: 'chosen', detail: chosen.length > 0 ? chosen.map((p) => p.name).join(' · ') : 'nobody' },
    // §8.2 derivations are user-facing — omit this line rather than rendering it
    // with an empty detail when nobody was chosen.
    ...(chosen.length > 0
      ? [
          {
            label: 'true characters',
            detail: chosen
              .map((p) => `${p.name} = ${characterById(p.characterId).name}`)
              .join(' · '),
          },
        ]
      : []),
    {
      label: 'red herring',
      detail: herring ? `${herring.name} registers as a Demon to the Fortune Teller` : 'not among the chosen',
    },
  ];

  const canonicalYes = trueDemon !== null || herring !== null;
  const answers: LegalAnswer[] = [
    answer(
      `ft:${canonicalYes ? 'yes' : 'no'}`,
      canonicalYes,
      canonicalYes ? 'Yes — nod' : 'No — shake head',
      [
        ...base,
        {
          label: 'result',
          detail: `${
            trueDemon ? `${trueDemon.name} is the Demon` : herring ? `${herring.name} is the red herring` : 'neither is a Demon'
          } -> ${canonicalYes ? 'YES' : 'NO'}`,
        },
      ],
    ),
  ];

  // §4.3 — an ambiguous chosen player may be ruled to register as the Demon,
  // which flips a No into a Yes.
  if (!canonicalYes) {
    for (const player of distinctChosen) {
      const demonOption = registrationOptionsForCharacterId(player.characterId).find(
        (o) => o.team === 'demon' && characterById(player.characterId).team !== 'demon',
      );
      if (!demonOption) continue;
      answers.push(
        answer(
          `ft:yes:${player.id}`,
          true,
          'Yes — nod',
          [
            ...base,
            {
              label: 'registration ruling',
              detail: `${player.name} (${characterById(player.characterId).name}) ruled to register as the Demon`,
            },
            { label: 'result', detail: '-> YES' },
          ],
          [{ playerId: player.id, registersAs: demonOption }],
        ),
      );
    }
  }
  return answers;
};

export const undertakerAnswers: Resolver = (view) =>
  // §16.5 — a Virgin trigger plus a vote execution means two, and the Storyteller
  // chooses which one the Undertaker learns.
  view.todaysExecutions.flatMap((execution) => {
    const player = view.players.find((p) => p.id === execution.playerId);
    const name = player?.name ?? execution.playerId;
    const trueCharacter = characterById(execution.characterIdAtDeath);
    const executedLine: DerivationLine = {
      label: 'executed today',
      detail: `${name} (${execution.kind})`,
    };
    const answers: LegalAnswer[] = [
      answer(
        `undertaker:${execution.playerId}`,
        execution.characterIdAtDeath,
        trueCharacter.name,
        [
          executedLine,
          {
            label: 'result',
            detail: `true character at death -> ${trueCharacter.name}`,
          },
        ],
      ),
    ];

    // §4.3 — the Recluse "might register as evil, and as a Minion or Demon, EVEN
    // IF DEAD"; the Spy's line says the same. That clause exists for exactly this
    // ability, so the ruled answers must be enumerated here rather than left to
    // `st_override`, which §4.3/§9 deliberately keep out of the registration
    // ledger and so out of §16.6's contradiction check. Shaped exactly like
    // `ravenkeeperAnswers` below, including the null-headed 2-tuple value.
    for (const option of registrationOptionsForCharacterId(execution.characterIdAtDeath)) {
      if (option.team === trueCharacter.team) continue;
      answers.push(
        answer(
          `undertaker:${execution.playerId}:${option.team}`,
          [null, execution.playerId],
          `a ${option.team} of the Storyteller's choosing`,
          [
            executedLine,
            {
              label: 'registration ruling',
              detail: `${name} ruled to register as ${option.team}; show a ${option.team} token not in play`,
            },
          ],
          [{ playerId: execution.playerId, registersAs: option }],
        ),
      );
    }
    return answers;
  });

/** §4.8 — soft constraints, same as the Fortune Teller. No target, no answers. */
export const ravenkeeperAnswers: Resolver = (view, _actorId, targets = []) => {
  if (targets.length === 0) return [];
  const target = playerById(view, targets[0]!);
  // Guide §13 — a detection ability shows the TRUE character, never the believed
  // one. The Drunk is shown as the Drunk.
  const answers: LegalAnswer[] = [
    answer(
      `ravenkeeper:${target.id}`,
      target.characterId,
      characterById(target.characterId).name,
      [
        { label: 'chosen', detail: target.name },
        {
          label: 'result',
          detail: `true character -> ${characterById(target.characterId).name}`,
        },
      ],
    ),
  ];

  for (const option of registrationOptionsForCharacterId(target.characterId)) {
    if (option.team === characterById(target.characterId).team) continue;
    answers.push(
      answer(
        `ravenkeeper:${target.id}:${option.team}`,
        // A ruled answer never carries the TRUE character as its value — the
        // display says "a minion of the Storyteller's choosing", so the value
        // must show that no token is named yet. `[null, target.id]` matches the
        // documented tuple contract (types.ts) so the downstream command-layer
        // guard `Array.isArray(value) && value[0] === null` (which demands an
        // `stChoice`) actually fires; a bare `null` would type-check but leave
        // that guard permanently dead, since `Array.isArray(null)` is false.
        [null, target.id],
        `a ${option.team} of the Storyteller's choosing`,
        [
          { label: 'chosen', detail: target.name },
          {
            label: 'registration ruling',
            detail: `${target.name} ruled to register as ${option.team}; show a ${option.team} token not in play`,
          },
        ],
        [{ playerId: target.id, registersAs: option }],
      ),
    );
  }
  return answers;
};

/** Keyed by night-order step id (Task 9). */
export const RESOLVERS: Readonly<Record<string, Resolver>> = Object.freeze({
  chef: chefAnswers,
  empath: empathAnswers,
  washerwoman: washerwomanAnswers,
  librarian: librarianAnswers,
  investigator: investigatorAnswers,
  fortune_teller: fortuneTellerAnswers,
  undertaker: undertakerAnswers,
  ravenkeeper: ravenkeeperAnswers,
});
