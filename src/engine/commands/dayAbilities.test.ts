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

describe('applyVirgin (§7, §16.5, §16.10)', () => {
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
