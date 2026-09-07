import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import {
  advanceToDay,
  autoSkipUnmetSteps,
  resolveImpStep,
  resolveStep,
  skipStep,
} from './nightCommands';
import { nextStep } from '../selectors/nightCursor';

/**
 * 12 players, 7/2/2/1 — the legal chart (guide §2).
 *
 * Twelve rather than nine because these tests need the Poisoner, the Scarlet
 * Woman AND the Mayor at once, and nine players allows only one Minion. Nine was
 * illegal, which went unnoticed only because assignRoles did not check the chart
 * until Task 5 was fixed.
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
  // assignRoles is the Lock In gate and now enforces chart legality (Task 5), so
  // the fixture must be a set a legal deal could actually produce.
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

/** Walks to night 2 by skipping the whole first night. */
function toNightTwo(store: Store): void {
  let guard = 0;
  while (nextStep(store.getState()) !== null) {
    skipStep(store, 'st_skip');
    if (++guard > 60) throw new Error('night 1 did not terminate');
  }
  advanceToDay(store);
  store.transaction('close day 1', (tx) => {
    tx.emit('DAY_CLOSED', {});
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 2 });
  });
}

describe('setup commands (§5)', () => {
  it('seats players in the order given and starts on night 1', () => {
    const store = seeded();
    expect(store.getState().players.map((p) => p.seat)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(store.getState().phase).toEqual({ kind: 'night', number: 1 });
    expect(store.getState().distribution).toEqual({
      townsfolk: 7,
      outsider: 2,
      minion: 2,
      demon: 1,
    });
  });

  // C1 from the review: checkVictory ran at every commit and re-derived each
  // player's team from characterById(''), which throws. createGame is its own
  // transaction, so this was the first line of the first test to fail.
  it('creates a game before any roles exist, without throwing', () => {
    let tick = 1_700_000_000_000;
    const store = createStore([], () => (tick += 1000));
    expect(() =>
      createGame(store, ROLES.map(([id], index) => ({ id, name: `P${index + 1}` }))),
    ).not.toThrow();
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    expect(store.getState().players.every((p) => p.characterId === '')).toBe(true);
  });

  it('refuses to lock in a set that is illegal by the chart (§5.3)', () => {
    let tick = 1_700_000_000_000;
    const store = createStore([], () => (tick += 1000));
    createGame(store, ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })));
    expect(() =>
      assignRoles(store, {
        assignments: Object.fromEntries(ROLES),
        // 12 players wants 7/2/2/1; this claims an extra Outsider.
        distribution: { townsfolk: 6, outsider: 3, minion: 2, demon: 1 },
        setupModifiers: [],
        demonBluffs: null,
        drunkBelief: null,
        redHerring: 'p6',
      }),
    ).toThrow(/illegal set/i);
  });

  it('records the deal as one undoable transaction', () => {
    const store = seeded();
    store.undo(); // undoes beginFirstNight
    store.undo(); // undoes the deal
    expect(store.getState().players.every((p) => p.characterId === '')).toBe(true);
    expect(store.getState().demonBluffs).toBeNull();
  });
});

describe('resolveStep (§4.8, §6.2)', () => {
  it('applies the step effect in the same transaction', () => {
    const store = seeded();
    // Walk to the Poisoner step.
    while (nextStep(store.getState())?.step.id !== 'poisoner') skipStep(store, 'st_skip');
    // Targets p7, not the fixture's red herring (p6): ROLES_ASSIGNED gives p6 a
    // permanent redHerring StatusEntry at setup (applyRolesAssigned), so a
    // statusLedger equality check against p6 can never see a single-entry
    // ledger — it always carries that entry too. This is a real collision in
    // the brief's own transcribed fixture (seeded()'s redHerring: 'p6' against
    // this test's original target p6), not a hollow assertion: confirmed by
    // running it unmodified, which fails with the redHerring entry present.
    const result = resolveStep(store, {
      targets: ['p7'],
      chosenAnswer: 'P7 is poisoned',
      answerClass: 'canonical',
    });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_STEP_RESOLVED', 'STATUS_APPLIED']);
    expect(store.getState().players.find((p) => p.id === 'p7')?.statusLedger).toEqual([
      {
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        appliedAt: { kind: 'night', number: 1 },
        expiresAt: { kind: 'day', number: 1 },
      },
    ]);
  });

  it('marks the effect ineffective when the actor is not functional (§3.6)', () => {
    const store = seeded();
    // Poison the Poisoner's own target first is not possible on night 1 in order,
    // so poison the Monk-to-be instead and check the flag on a later night.
    toNightTwo(store);
    while (nextStep(store.getState())?.step.id !== 'poisoner') skipStep(store, 'st_skip');
    resolveStep(store, { targets: ['p4'], chosenAnswer: 'P4 is poisoned', answerClass: 'canonical' });
    while (nextStep(store.getState())?.step.id !== 'monk') skipStep(store, 'st_skip');
    const result = resolveStep(store, {
      targets: ['p9'],
      chosenAnswer: 'P9 is protected',
      answerClass: 'canonical',
    });
    const applied = result.events.find((e) => e.type === 'STATUS_APPLIED');
    // The token is placed, as the physical Storyteller would, but it does nothing.
    expect(applied?.payload).toMatchObject({ status: 'protected', effective: false });
    expect(result.events.find((e) => e.type === 'NIGHT_STEP_RESOLVED')?.payload).toMatchObject({
      abilityFunctional: false,
      effectSuppressed: true,
    });
  });

  it('flags an off-constraint target in the same transaction and still records it (§4.8)', () => {
    const store = seeded();
    toNightTwo(store);
    while (nextStep(store.getState())?.step.id !== 'monk') skipStep(store, 'st_skip');
    // A Monk who pointed at himself at the table must be recordable.
    const result = resolveStep(store, {
      targets: ['p4'],
      chosenAnswer: 'P4 protected themselves',
      answerClass: 'canonical',
    });
    expect(result.events.map((e) => e.type)).toContain('RULE_FLAGGED');
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'target_self',
      class: 'social',
    });
    expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toHaveLength(1);
  });

  it('advances the cursor and can be undone as one unit', () => {
    const store = seeded();
    while (nextStep(store.getState())?.step.id !== 'poisoner') skipStep(store, 'st_skip');
    // p7, not p6 (the fixture's red herring) — see the comment on the first test
    // in this block for why p6's statusLedger is never empty.
    resolveStep(store, { targets: ['p7'], chosenAnswer: 'poisoned', answerClass: 'canonical' });
    expect(nextStep(store.getState())?.step.id).not.toBe('poisoner');
    store.undo();
    expect(nextStep(store.getState())?.step.id).toBe('poisoner');
    expect(store.getState().players.find((p) => p.id === 'p7')?.statusLedger).toEqual([]);
  });

  // §16.6 — the registration ledger's own coverage. The 12-player roster fixed by
  // R10 has no Recluse or Spy, so nothing here can produce a conflicting ruling
  // THROUGH a resolver (ambiguity requires one of those two, and neither is in
  // play) — the brief's own worked example named the Recluse, which does not
  // exist on this roster. The Poisoner and the Monk both have resolverId: null,
  // so a StepResolution may carry registrationRulings directly (§4.3's "Only for
  // a step with no resolver" case) — used here to drive registrationInconsistency
  // at the command level without inventing a roster the rest of this suite
  // doesn't share.
  it('flags an inconsistent registration ruling without blocking it (§16.6)', () => {
    const store = seeded();
    while (nextStep(store.getState())?.step.id !== 'poisoner') skipStep(store, 'st_skip');
    resolveStep(store, {
      targets: ['p6'],
      chosenAnswer: 'P6 rules as a Minion for tonight (ST ruling)',
      answerClass: 'registration',
      registrationRulings: [{ playerId: 'p6', registersAs: { alignment: 'evil', team: 'minion' } }],
    });
    toNightTwo(store);
    while (nextStep(store.getState())?.step.id !== 'monk') skipStep(store, 'st_skip');
    const result = resolveStep(store, {
      targets: ['p7'],
      chosenAnswer: 'P6 rules as good now (ST ruling)',
      answerClass: 'registration',
      registrationRulings: [{ playerId: 'p6', registersAs: { alignment: 'good', team: 'townsfolk' } }],
    });
    expect(result.events.map((e) => e.type)).toContain('RULE_FLAGGED');
    expect(
      store.getState().ruleFlags.filter((f) => f.rule === 'registration_inconsistent'),
    ).toHaveLength(1);
    // Recorded, not blocked: both rulings still landed in the ledger.
    expect(store.getState().registrationHistory).toHaveLength(2);
  });
});

describe('autoSkipUnmetSteps (§6.1)', () => {
  it('logs condition_unmet skips so the log can say why a step did not happen', () => {
    const store = seeded();
    toNightTwo(store);
    // Every step before the Ravenkeeper on a normal night is unconditional or has
    // an empty wakes(), so autoSkipUnmetSteps is a no-op until the cursor reaches
    // one whose trigger is genuinely unmet. An earlier draft called it at the top
    // of the night and asserted `> 0`, which could never pass.
    let guard = 0;
    while (nextStep(store.getState())?.step.id !== 'ravenkeeper') {
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('never reached the Ravenkeeper');
    }
    const skipped = autoSkipUnmetSteps(store);
    expect(skipped).toBeGreaterThan(0);
    const reasons = store
      .getEvents()
      .filter((e) => e.type === 'NIGHT_STEP_SKIPPED')
      .map((e) => (e.payload as { reason: string }).reason);
    expect(reasons).toContain('condition_unmet');
    // The cursor now rests on a step that actually fires.
    expect(nextStep(store.getState())?.conditionMet).toBe(true);
  });
});

describe('resolveImpStep (§4.5, §4.6)', () => {
  function toImp(store: Store): void {
    toNightTwo(store);
    let guard = 0;
    while (nextStep(store.getState())?.step.id !== 'imp') {
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('never reached the Imp');
    }
  }

  it('kills an ordinary target in one transaction', () => {
    const store = seeded();
    toImp(store);
    const result = resolveImpStep(store, { targetId: 'p6' });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_KILL_RESOLVED', 'DEATH']);
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(false);
  });

  it('records a blocked kill with no death', () => {
    const store = seeded();
    toNightTwo(store);
    while (nextStep(store.getState())?.step.id !== 'monk') skipStep(store, 'st_skip');
    resolveStep(store, { targets: ['p6'], chosenAnswer: 'P6 protected', answerClass: 'canonical' });
    while (nextStep(store.getState())?.step.id !== 'imp') skipStep(store, 'st_skip');
    const result = resolveImpStep(store, { targetId: 'p6' });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_KILL_RESOLVED']);
    expect(result.events[0]?.payload).toMatchObject({
      finalVictimId: null,
      resolutionChain: [{ targetId: 'p6', result: 'monk_protected' }],
    });
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(true);
  });

  it('promotes the Scarlet Woman on a starpass and does not end the game', () => {
    const store = seeded();
    toImp(store);
    const result = resolveImpStep(store, { targetId: 'p1' });
    expect(result.events.map((e) => e.type)).toEqual([
      'NIGHT_KILL_RESOLVED',
      'DEATH',
      'DEMON_DIED',
      'ROLE_CHANGED',
    ]);
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  it('re-opens the Scarlet Woman notification, which sits earlier in the order (§6.1)', () => {
    const store = seeded();
    toImp(store);
    resolveImpStep(store, { targetId: 'p1' });
    expect(nextStep(store.getState())?.step.id).toBe('scarlet_woman_notify');
  });

  it('bounces off the Mayor when a target is given', () => {
    const store = seeded();
    toImp(store);
    const result = resolveImpStep(store, { targetId: 'p9', mayorBounceTargetId: 'p6' });
    expect(result.events[0]?.payload).toMatchObject({
      finalVictimId: 'p6',
      resolutionChain: [
        { targetId: 'p9', result: 'mayor_bounce' },
        { targetId: 'p6', result: 'died' },
      ],
    });
  });

  it('refuses to resolve a Mayor hit without a bounce decision', () => {
    const store = seeded();
    toImp(store);
    expect(() => resolveImpStep(store, { targetId: 'p9' })).toThrow(/bounce/i);
  });
});

describe('advanceToDay (§6.1)', () => {
  it('refuses while the night still has steps', () => {
    const store = seeded();
    expect(() => advanceToDay(store)).toThrow(/still has steps/i);
  });

  it('advances once the cursor is exhausted', () => {
    const store = seeded();
    while (nextStep(store.getState()) !== null) skipStep(store, 'st_skip');
    advanceToDay(store);
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
  });
});

describe('the engine barrel (§8.1 — Plan 2 imports only this)', () => {
  it('exports everything the UI needs', async () => {
    const api = await import('@/engine');
    for (const name of [
      'createStore', 'createGame', 'assignRoles', 'beginFirstNight',
      'nextStep', 'nightOverview', 'candidatesForCurrentStep', 'resolveStep',
      'resolveImpStep', 'skipStep', 'autoSkipUnmetSteps', 'advanceToDay',
      'nominate', 'castVote', 'closeNomination', 'closeDay', 'beginNight',
      'applyVirgin', 'claimSlayer', 'endGame',
      'characterById', 'charactersByTeam', 'distributionFor', 'nightOrderFor',
      'RESOLVERS', 'CHARACTERS', 'EDITION', 'INFO_THRESHOLD_PLAYERS',
      'chefDerivation', 'empathDerivation', 'thresholdDerivation',
      'distributionDerivation', 'demonDeathDerivation', 'victoryDerivation',
      'killDerivation', 'grimoireTokens',
    ]) {
      expect(name in api).toBe(true);
    }
  });
});
