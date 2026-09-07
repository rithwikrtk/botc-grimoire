import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import { autoSkipUnmetSteps, candidatesForCurrentStep, resolveStep, skipStep } from './nightCommands';
import { nextStep } from '../selectors/nightCursor';

/**
 * R22 — Task 16's `seeded()` and `walkTo()` (used by nightCommands.test.ts) are
 * module-private, and that file's `walkTo` name does not exist there at all (it
 * has `toNightTwo` and `toImp`, neither general enough for this file's needs).
 * This file writes its own imports, its own `seeded()` — reproducing Task 16's
 * twelve-player fixture verbatim so the two files do not silently disagree —
 * and its own `walkTo`.
 *
 * 12 players, 7/2/2/1 — the legal chart (guide §2). Twelve rather than nine
 * because these tests need the Poisoner, the Scarlet Woman AND the Mayor at
 * once, and nine players allows only one Minion.
 */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'monk'],
  ['p5', 'ravenkeeper'],
  ['p6', 'chef'],
  ['p7', 'empath'],
  ['p8', 'butler'],
  ['p9', 'mayor'],
  ['p10', 'saint'],
  ['p11', 'soldier'],
  ['p12', 'virgin'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(
    store,
    ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })),
  );
  assignRoles(store, {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['washerwoman', 'librarian', 'slayer'],
    drunkBelief: null,
    redHerring: 'p6',
  });
  beginFirstNight(store);
  return store;
}

/**
 * The same twelve players with two same-team substitutions (R22): p5
 * ravenkeeper -> investigator (townsfolk for townsfolk) and p10 saint ->
 * recluse (outsider for outsider). 7/2/2/1 stays intact. This gives the
 * Investigator a real first-night step, two true Minions to name (Poisoner,
 * Scarlet Woman) for the canonical answer, and a Recluse who can register as a
 * Minion — the only way to reach a `registration`-class answer in this
 * edition's first night.
 */
const INVESTIGATOR_ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'monk'],
  ['p5', 'investigator'],
  ['p6', 'chef'],
  ['p7', 'empath'],
  ['p8', 'butler'],
  ['p9', 'mayor'],
  ['p10', 'recluse'],
  ['p11', 'soldier'],
  ['p12', 'virgin'],
];

function seededForInvestigator(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(
    store,
    INVESTIGATOR_ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })),
  );
  assignRoles(store, {
    assignments: Object.fromEntries(INVESTIGATOR_ROLES),
    distribution: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['washerwoman', 'librarian', 'slayer'],
    drunkBelief: null,
    redHerring: 'p6',
  });
  beginFirstNight(store);
  return store;
}

/**
 * Walks the cursor forward to the named step, skipping unmet steps
 * (`autoSkipUnmetSteps`) and steps that fire but are not the target (a plain
 * `skipStep`) — modelled on nightCommands.test.ts's `toImp` (R22). A walk that
 * only advances via `autoSkipUnmetSteps` cannot get past the Chef, whose
 * condition is always met.
 */
function walkTo(store: Store, stepId: string): void {
  let guard = 0;
  for (;;) {
    autoSkipUnmetSteps(store);
    const position = nextStep(store.getState());
    if (!position) throw new Error(`walkTo('${stepId}'): the night ended before reaching it`);
    if (position.step.id === stepId) return;
    skipStep(store, 'st_skip');
    if (++guard > 80) throw new Error(`walkTo('${stepId}') did not converge`);
  }
}

describe('answer classes (§4.3)', () => {
  it('accepts a canonical answer named by key', () => {
    const store = seeded();
    walkTo(store, 'empath');
    const [first] = candidatesForCurrentStep(store);
    expect(() =>
      resolveStep(store, { answerKey: first!.key, answerClass: 'canonical' }),
    ).not.toThrow();
  });

  // The trust model of §4.3: a canonical answer must be one the app computed, or
  // answerClass is self-reported and §9's ledgers mean nothing.
  it('refuses a canonical answer the app never computed', () => {
    const store = seeded();
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { answerKey: 'empath:made-up', answerClass: 'canonical' })).toThrow(
      /not one of the legal answers/i,
    );
    expect(() => resolveStep(store, { chosenAnswer: '7', answerClass: 'canonical' })).toThrow(
      /must name one by key/i,
    );
  });

  it('refuses a registration class on a canonical answer and vice versa', () => {
    const store = seeded();
    walkTo(store, 'empath');
    const [canonical] = candidatesForCurrentStep(store);
    expect(() =>
      resolveStep(store, { answerKey: canonical!.key, answerClass: 'registration' }),
    ).toThrow(/is a canonical answer, not registration/i);
  });

  // §4.3 — fabricated is ONLY legal when the actor is drunk or poisoned.
  it('refuses a fabricated answer from a sober actor', () => {
    const store = seeded();
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { chosenAnswer: '2', answerClass: 'fabricated' })).toThrow(
      /drunk or poisoned/i,
    );
  });

  it('accepts a fabricated answer from a poisoned actor', () => {
    const store = seeded();
    walkTo(store, 'poisoner');
    resolveStep(store, { targets: ['p7'], chosenAnswer: 'P7 is poisoned', answerClass: 'canonical' });
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { chosenAnswer: '2', answerClass: 'fabricated' })).not.toThrow();
  });

  it('refuses an st_override with no reason, and raises no flag when given one', () => {
    const store = seeded();
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { chosenAnswer: '0', answerClass: 'st_override' })).toThrow(
      /answerReason/i,
    );
    const result = resolveStep(store, {
      chosenAnswer: '0',
      answerClass: 'st_override',
      answerReason: 'I think the seating was entered wrong',
    });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_STEP_RESOLVED']);
    expect(store.getState().ruleFlags).toEqual([]);
  });

  // R22 — this is the ONLY test in the entire plan that exercises the
  // nightCommands.ts:279 guard (`value[0] === null && !resolution.stChoice`),
  // the guard a Task 8 ruling exists to keep fireable. The brief's original
  // fixture (twelve players with no Investigator, no Recluse, no Spy) can never
  // produce a `registration`-class candidate, so `if (!ruled) return;` would
  // make this test silently vacuous forever. Fail loudly instead if the
  // precondition is ever unmet.
  it('requires stChoice when a ruled registration does not name the token', () => {
    const store = seededForInvestigator();
    walkTo(store, 'investigator');
    const ruled = candidatesForCurrentStep(store).find((c) => c.answerClass === 'registration');
    if (!ruled) {
      throw new Error(
        'Expected a registration-class candidate for the investigator step (the Recluse, ruled ' +
          'to register as a Minion) — the fixture is supposed to guarantee this so the ' +
          'nightCommands.ts:279 stChoice guard has a test that can actually fail.',
      );
    }
    expect(() => resolveStep(store, { answerKey: ruled.key, answerClass: 'registration' })).toThrow(
      /stChoice/i,
    );
    expect(() =>
      resolveStep(store, { answerKey: ruled.key, answerClass: 'registration', stChoice: 'Baron' }),
    ).not.toThrow();
  });

  // §4.1 — the field must carry a character id, not a step id.
  it("stamps the actor's perceived character, never the step id", () => {
    const store = seeded();
    walkTo(store, 'empath');
    const [first] = candidatesForCurrentStep(store);
    const result = resolveStep(store, { answerKey: first!.key, answerClass: 'canonical' });
    expect(result.events[0]?.payload).toMatchObject({ perceivedCharacterId: 'empath' });
  });
});
