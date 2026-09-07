import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import {
  applyVirgin,
  castVote,
  claimSlayer,
  closeDay,
  closeNomination,
  nominate,
} from './dayCommands';

/** 12 players, 7/2/2/1 — Slayer, Virgin, Recluse, Scarlet Woman all in play. */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'virgin'],
  ['p5', 'slayer'],
  ['p6', 'recluse'],
  ['p7', 'chef'],
  ['p8', 'empath'],
  ['p9', 'monk'],
  ['p10', 'soldier'],
  ['p11', 'mayor'],
  ['p12', 'butler'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(store, ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })));
  assignRoles(store, {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['washerwoman', 'librarian', 'undertaker'],
    drunkBelief: null,
    redHerring: 'p7',
  });
  beginFirstNight(store);
  store.transaction('to day 1', (tx) => tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 }));
  return store;
}

// Fix round 1, FIX 6 — a separate, minimal 5-player game (chart 3/0/1/1),
// because this file's main roster (R1, copied verbatim from Task 15) has no
// Spy — and the Spy is the ONLY Trouble Brewing character who can ever be
// ruled a Townsfolk nominator: canRegisterAsTeam(id, 'townsfolk') is true only
// for the Spy's registration list; the Recluse's never includes townsfolk.
// Without a Spy in play, evaluateVirgin's `canRuleAsTownsfolk` is false for
// every possible nominator, so evaluateVirgin can NEVER produce a non-empty
// registrationRulings on the main roster — a test asserting the §16.6 flag
// fires there could not reach the case it claims to test, whatever it asserted.
function seededWithSpyNominator(): Store {
  const roles: Array<[string, string]> = [
    ['p1', 'imp'],
    ['p2', 'spy'],
    ['p3', 'virgin'],
    ['p4', 'chef'],
    ['p5', 'soldier'],
  ];
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(store, roles.map(([id], index) => ({ id, name: `P${index + 1}` })));
  assignRoles(store, {
    assignments: Object.fromEntries(roles),
    distribution: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
    setupModifiers: [],
    demonBluffs: null,
    drunkBelief: null,
    redHerring: null,
  });
  beginFirstNight(store);
  // Seed a prior ruling: p2 (the Spy) was ruled to register as a Minion — its
  // true team — on an earlier information step. Emitted directly (rather than
  // through a resolver) because the point under test is registrationInconsistency's
  // wiring into applyVirgin, not which resolver could have produced the prior
  // ruling.
  store.transaction('seed a prior ruling on the Spy', (tx) => {
    tx.emit('NIGHT_STEP_RESOLVED', {
      stepId: 'investigator',
      actorIds: ['p4'],
      targets: [],
      chosenAnswer: 'P2 registers as a Minion',
      answerClass: 'registration',
      registrationRulings: [{ playerId: 'p2', registersAs: { alignment: 'evil', team: 'minion' } }],
      abilityFunctional: true,
      effectSuppressed: false,
    });
  });
  store.transaction('to day 1', (tx) => tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 }));
  return store;
}

/**
 * FIX I7 — the cross-plan seam. The Virgin is the only ability in the edition
 * triggered by a nomination rather than a night step, so it has no cursor and no
 * step to sit on: it fires only if the app independently calls `evaluateVirgin`
 * after EVERY nomination. Forgetting is silent — no error, no flag,
 * `virginTriggered` never set, and the ability survives to fire on the next
 * nomination against her, which looks like a correct game state. `nominate` now
 * hands the evaluation back so the trigger cannot be missed at the call site.
 *
 * It is a SIGNAL only: `nominate` neither fires nor consumes the Virgin, which
 * is why `virginTriggered` is still false after the nomination below.
 */
describe('nominate surfaces the Virgin trigger (§7, guide §11)', () => {
  it('reports a fired Virgin nomination without resolving it', () => {
    const store = seeded();
    const result = nominate(store, 'p7', 'p4');
    expect(result.virgin).toMatchObject({
      isVirginNomination: true,
      consumed: true,
      fired: true,
      needsRegistrationRuling: false,
    });
    // Signal only: nothing was resolved and nothing was consumed.
    expect(result.events.map((e) => e.type)).toEqual(['NOMINATION_OPENED']);
    expect(store.getState().players.find((p) => p.id === 'p4')?.virginTriggered).toBe(false);
    expect(store.getState().players.find((p) => p.id === 'p7')?.alive).toBe(true);
  });

  it('reports a trigger that consumes the ability without an execution', () => {
    const store = seeded();
    // p2 is the Poisoner: the Virgin is consumed, but no Townsfolk nominated her.
    const result = nominate(store, 'p2', 'p4');
    expect(result.virgin).toMatchObject({ isVirginNomination: true, consumed: true, fired: false });
  });

  it('reports the ambiguous nominator the Storyteller must rule on (guide §11)', () => {
    // The SPY roster, not the main one: only the Spy's registration list
    // includes townsfolk (the Recluse's never does), so this is the sole
    // fixture in the file that can reach needsRegistrationRuling at all.
    const store = seededWithSpyNominator();
    const result = nominate(store, 'p2', 'p3');
    expect(result.virgin).toMatchObject({
      isVirginNomination: true,
      needsRegistrationRuling: true,
    });
  });

  it('reports nothing for an ordinary nomination, and for a spent Virgin', () => {
    const store = seeded();
    expect(nominate(store, 'p7', 'p8').virgin.isVirginNomination).toBe(false);

    nominate(store, 'p9', 'p4');
    applyVirgin(store, 'p9', 'p4');
    const afterwards = nominate(store, 'p10', 'p4');
    expect(afterwards.virgin).toMatchObject({
      isVirginNomination: true,
      consumed: false,
      fired: false,
    });
  });
});

describe('applyVirgin (§7, §16.5, §16.10)', () => {
  // A ruling flagged as inconsistent needs a PRIOR ruling about the same
  // player with a different team already in registrationHistory — a test that
  // makes only the new ruling could pass whether or not the check exists.
  it('flags an inconsistent registration ruling when the Spy nominator is ruled a Townsfolk (§16.6)', () => {
    const store = seededWithSpyNominator();
    nominate(store, 'p2', 'p3');
    const result = applyVirgin(store, 'p2', 'p3', { ruleNominatorAsTownsfolk: true });
    expect(result.events.map((e) => e.type)).toContain('RULE_FLAGGED');
    expect(
      store.getState().ruleFlags.filter((f) => f.rule === 'registration_inconsistent'),
    ).toHaveLength(1);
    expect(store.getState().registrationHistory).toHaveLength(2);
  });

  it('executes the nominator and records the Virgin as spent', () => {
    const store = seeded();
    nominate(store, 'p7', 'p4');
    const result = applyVirgin(store, 'p7', 'p4');
    expect(result.events.map((e) => e.type)).toEqual(['VIRGIN_TRIGGERED', 'EXECUTION', 'DEATH']);
    expect(store.getState().players.find((p) => p.id === 'p7')?.alive).toBe(false);
    expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(true);
    expect(store.getState().players.find((p) => p.id === 'p4')?.virginTriggered).toBe(true);
    expect(store.getState().todaysExecutions).toHaveLength(1);
  });

  // §16.5 — the day continues after a Virgin trigger, so a vote can execute a
  // second player the same day. This is why todaysExecutions is a list.
  it('leaves the day open for a second execution', () => {
    const store = seeded();
    const first = nominate(store, 'p7', 'p4');
    applyVirgin(store, 'p7', 'p4');
    // 11 alive now, so the threshold is 6.
    for (const voterId of ['p5', 'p8', 'p9', 'p10', 'p11', 'p12']) {
      castVote(store, first.nominationId, voterId);
    }
    closeNomination(store, first.nominationId);
    closeDay(store);
    expect(store.getState().todaysExecutions).toHaveLength(2);
    expect(store.getState().todaysExecutions.map((e) => e.kind).sort()).toEqual(['virgin', 'vote']);
  });

  it('records the trigger but no execution when the nominator is not a Townsfolk', () => {
    const store = seeded();
    nominate(store, 'p2', 'p4');
    const result = applyVirgin(store, 'p2', 'p4');
    expect(result.events.map((e) => e.type)).toEqual(['VIRGIN_TRIGGERED']);
    expect(store.getState().players.find((p) => p.id === 'p4')?.virginTriggered).toBe(true);
    expect(store.getState().players.find((p) => p.id === 'p2')?.alive).toBe(true);
  });

  it('refuses to apply the Virgin a second time', () => {
    const store = seeded();
    nominate(store, 'p7', 'p4');
    applyVirgin(store, 'p7', 'p4');
    nominate(store, 'p8', 'p4');
    expect(() => applyVirgin(store, 'p8', 'p4')).toThrow(/does not trigger/i);
  });

  it('names the nominee on the event rather than inferring it', () => {
    const store = seeded();
    nominate(store, 'p7', 'p4');
    const result = applyVirgin(store, 'p7', 'p4');
    expect(result.events[0]?.payload).toMatchObject({ nominatorId: 'p7', nomineeId: 'p4' });
  });
});

describe('claimSlayer (§7, §16.12)', () => {
  it('kills the true Demon and promotes the Scarlet Woman in one transaction', () => {
    const store = seeded();
    const result = claimSlayer(store, 'p5', 'p1');
    expect(result.events.map((e) => e.type)).toEqual([
      'SLAYER_CLAIMED',
      'DEATH',
      'DEMON_DIED',
      'ROLE_CHANGED',
    ]);
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  // §16.12 — the guarantee, asserted as the ABSENCE of a promotion rather than as
  // a boolean on an intermediate object.
  it('kills a Recluse ruled as the Demon and promotes nobody', () => {
    const store = seeded();
    const result = claimSlayer(store, 'p5', 'p6', { ruleTargetAsDemon: true });
    expect(result.events.map((e) => e.type)).toEqual(['SLAYER_CLAIMED', 'DEATH']);
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(false);
    // The Scarlet Woman is untouched and there is still exactly one living Imp.
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('scarlet_woman');
    expect(store.getState().players.filter((p) => p.alive && p.characterId === 'imp')).toHaveLength(1);
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    // The ruling is on the event, for §9's registration ledger.
    expect(result.events[0]?.payload).toMatchObject({
      targetIsTrueDemon: false,
      targetRegisteredAsDemon: true,
      registrationRulings: [{ playerId: 'p6', registersAs: { alignment: 'evil', team: 'demon' } }],
    });
  });

  // Fix round 1, FIX 6 — §16.6 was wired into resolveStep only, so a Slayer
  // ruling was recorded but never checked against a prior one on the same
  // player. The canonical case (per the review): ruling the Recluse a Demon
  // here, after an earlier ruling registered them as good, is exactly the
  // contradiction this ledger exists to surface.
  //
  // The prior ruling is seeded directly via a raw NIGHT_STEP_RESOLVED
  // transaction rather than through a resolver, because dayAbilities.test.ts
  // does not import nightCommands.ts and this file's seeded() already skips
  // straight from night 1 to day 1 without resolving any step — the point
  // under test is registrationInconsistency's wiring into claimSlayer, not
  // which resolver could have produced the prior ruling. A ruling this
  // specific (team differs from the new one) can only pass if BOTH the prior
  // ruling actually lands in registrationHistory AND the new one is checked
  // against it — a test with only the new ruling could pass whether or not
  // that check exists at all.
  it('flags an inconsistent registration ruling against a previously-ruled player (§16.6)', () => {
    const store = seeded();
    store.transaction('seed a prior ruling on the Recluse', (tx) => {
      tx.emit('NIGHT_STEP_RESOLVED', {
        stepId: 'investigator',
        actorIds: ['p8'],
        targets: [],
        chosenAnswer: 'P6 registers as a good Outsider',
        answerClass: 'registration',
        registrationRulings: [{ playerId: 'p6', registersAs: { alignment: 'good', team: 'outsider' } }],
        abilityFunctional: true,
        effectSuppressed: false,
      });
    });
    const result = claimSlayer(store, 'p5', 'p6', { ruleTargetAsDemon: true });
    expect(result.events.map((e) => e.type)).toContain('RULE_FLAGGED');
    expect(
      store.getState().ruleFlags.filter((f) => f.rule === 'registration_inconsistent'),
    ).toHaveLength(1);
    // Recorded, not blocked: both rulings still landed in the ledger.
    expect(store.getState().registrationHistory).toHaveLength(2);
  });

  it('records a bluffed claim with no death', () => {
    const store = seeded();
    const result = claimSlayer(store, 'p7', 'p1');
    expect(result.events.map((e) => e.type)).toEqual(['SLAYER_CLAIMED']);
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
    expect(store.getState().players.find((p) => p.id === 'p7')?.slayerUsed).toBe(false);
  });

  it('spends the real Slayer ability even on a miss', () => {
    const store = seeded();
    claimSlayer(store, 'p5', 'p7');
    expect(store.getState().players.find((p) => p.id === 'p5')?.slayerUsed).toBe(true);
    const second = claimSlayer(store, 'p5', 'p1');
    expect(second.events.map((e) => e.type)).toEqual(['SLAYER_CLAIMED']);
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
  });
});
