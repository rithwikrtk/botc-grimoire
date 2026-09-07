import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import {
  applyVirgin,
  beginNight,
  castVote,
  claimSlayer,
  closeDay,
  closeNomination,
  endGame,
  nominate,
} from './dayCommands';
import { expiryFor } from '@/engine/phase';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'butler'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

/** Same seven seats, with the Saint in p3 so a vote execution can reach §4.7 row 2. */
const SAINT_ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'saint'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

/**
 * 6 seats matching the guide §2 chart exactly (3 townsfolk, 1 outsider, 1
 * minion, 1 demon) with a Scarlet Woman in the minion slot, so executing the
 * Imp by vote with 5+ alive exercises closeDay's promotion branch (review
 * round 1, FIX 3).
 */
const SCARLET_WOMAN_ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'scarlet_woman'],
  ['p3', 'butler'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

function seededWithSaint(opts: { poison?: string } = {}): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: SAINT_ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(SAINT_ROLES),
      // Corrected (review round 1, Minor 10): the roster's Saint sits in the
      // Outsider slot, so the true counts are 4 townsfolk / 1 outsider, not the
      // 7-player chart's 5/0 — nothing reads this field, but a fixture that
      // contradicts its own roster misleads the next reader.
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: ['virgin', 'slayer', 'mayor'],
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    if (opts.poison) {
      tx.emit('STATUS_APPLIED', {
        playerId: opts.poison,
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: expiryFor('tonight_and_tomorrow', { kind: 'night', number: 1 }),
      });
    }
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

/** Same roster as `seeded()`, stopped at night 1 (§4.7, FIX 1's night-phase guard). */
function seededAtNight(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
  return store;
}

/**
 * Same roster as `seeded()`, with `masterId` marked as p3 (the Butler)'s Master
 * during night 1, so the mark is still active on day 1 (review round 1, FIX 2).
 */
function seededWithButlerMaster(masterId: string): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    tx.emit('STATUS_APPLIED', {
      playerId: masterId,
      status: 'master',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', { kind: 'night', number: 1 }),
    });
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

/**
 * Same shape as `ROLES`, with the Virgin in p4 instead of the Chef. Review
 * round 2, folded-in minor 6 — the phase-guard test needs a real Virgin in
 * play so it can prove `todaysExecutions` stays empty after the throw, not
 * just that the guard fired; a roster without a Virgin cannot make that
 * promise, since applyVirgin would refuse for a second reason regardless.
 */
const VIRGIN_ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'butler'],
  ['p4', 'virgin'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

/**
 * Same seven-seat shape, with a real Slayer (p3) and a Recluse (p4) — the
 * roster FIX 1b's test needs: a functional, unspent Slayer aiming at a
 * living target who is genuinely ambiguous (§16.12), so the new
 * needsRegistrationRuling throw is what fires, not one of the four guards
 * that also produce `outcome: 'nothing'`.
 */
const SLAYER_ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'slayer'],
  ['p4', 'recluse'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

function seededAtNightWithVirgin(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: VIRGIN_ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(VIRGIN_ROLES),
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
  return store;
}

function seededWithSlayerAndRecluse(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: SLAYER_ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(SLAYER_ROLES),
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

function seededWithScarletWoman(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: SCARLET_WOMAN_ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(SCARLET_WOMAN_ROLES),
      distribution: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      // Below 7 players, no bluffs (guide §5.2).
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

describe('day commands (§4.8, §7)', () => {
  it('opens a nomination and flags an illegal one in the same transaction', () => {
    const store = seeded();
    const result = nominate(store, 'p4', 'p4');
    expect(result.events.map((e) => e.type)).toEqual(['NOMINATION_OPENED', 'RULE_FLAGGED']);
    // Never blocked: the nomination exists (§4.8).
    expect(store.getState().nominations).toHaveLength(1);
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'self_nomination',
      class: 'integrity',
      relatedTxId: result.txId,
    });
  });

  it('undoes the nomination and its flag together', () => {
    const store = seeded();
    nominate(store, 'p4', 'p4');
    store.undo();
    expect(store.getState().nominations).toEqual([]);
    expect(store.getState().ruleFlags).toEqual([]);
  });

  it('records a vote and closes the nomination with write-only forensics (§3.6)', () => {
    const store = seeded();
    const { nominationId } = nominate(store, 'p4', 'p1');
    castVote(store, nominationId, 'p4');
    castVote(store, nominationId, 'p5');
    const result = closeNomination(store, nominationId);
    const closed = result.events.find((e) => e.type === 'NOMINATION_CLOSED');
    expect(closed?.payload).toMatchObject({ auditTally: 2, auditThreshold: 4, butlerVotesFlagged: [] });
    expect(store.getState().nominations[0]?.closed).toBe(true);
  });

  it('closes a day with zero nominations, which is what makes the Mayor win reachable (§7)', () => {
    const store = seeded();
    const result = closeDay(store);
    const types = result.events.map((e) => e.type);
    expect(types).toEqual(['DAY_CLOSED', 'EXECUTION']);
    expect(result.events.find((e) => e.type === 'EXECUTION')?.payload).toEqual({
      playerId: null,
      kind: 'vote',
    });
    // closeDay does NOT advance the phase — victory is decided on the day.
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
    expect(store.getState().todaysExecutions).toEqual([]);
    beginNight(store);
    expect(store.getState().phase).toEqual({ kind: 'night', number: 2 });
  });

  it('executes at day close in one undoable transaction, leaving the phase on the day', () => {
    const store = seeded();
    const { nominationId } = nominate(store, 'p4', 'p1');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    const result = closeDay(store);
    expect(result.events.map((e) => e.type)).toEqual([
      'DAY_CLOSED',
      'EXECUTION',
      'DEATH',
      'DEMON_DIED',
      'GAME_ENDED',
    ]);
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'demon_dead' });
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
    // The whole day-close, including the win, undoes as one action.
    store.undo();
    expect(store.getState().victory.status).toBe('ongoing');
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
  });

  // §4.7 row 2, §14 Tier 2. This is the case the earlier draft made unreachable:
  // the predicate was tested directly and the PATH was not.
  it('awards evil the game when a Saint is executed by vote (§4.7 row 2)', () => {
    const store = seededWithSaint();
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'saint_executed' });
  });

  it('does not award it for a POISONED Saint, whose poison is still live on the day', () => {
    const store = seededWithSaint({ poison: 'p3' });
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    // The execution still happened — only the win is suppressed (review round 1,
    // Minor 11: without this, the assertion above also holds if closeDay never
    // executed anyone at all).
    expect(store.getState().players.find((p) => p.id === 'p3')?.alive).toBe(false);
  });

  it('refuses to begin the night once the game is decided', () => {
    const store = seededWithSaint();
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(() => beginNight(store)).toThrow(/game is over/i);
  });

  it('ends an abandoned game so the reason has a producer (§7)', () => {
    const store = seeded();
    endGame(store, 'evil', 'abandoned');
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'abandoned' });
  });

  // Review round 1, FIX 1 — row 4 (§4.7) checks only `dayClosed`, `aliveCount`,
  // `todaysExecutions` and the Mayor; nothing there checks phase. Without this
  // guard, closeDay is reachable at night — see the docstring on closeDay for the
  // full path (a no-execution day at 4 alive, beginNight, an Imp kill down to 3,
  // then a mistimed closeDay) — and would hand good the game silently.
  it('refuses to close a day that is not the current phase', () => {
    const store = seededAtNight();
    expect(() => closeDay(store)).toThrow(/it is not day/i);
  });

  // Pre-review correction, folded-in minor 6: nominationIssues has no phase
  // check of any kind, so nominate + applyVirgin at night was fully reachable
  // with no friction, and a night trigger injects a phantom execution into
  // that very night's Undertaker answer set (todaysExecutions is cleared only
  // on entry into a day). The nomination stays reachable at night — only the
  // derived death is refused. Uses a roster with a REAL Virgin (p4) and
  // asserts todaysExecutions stays empty, so this proves the consequence the
  // guard exists for, not just that the guard fired.
  it('refuses to apply the Virgin outside of the day, leaving no phantom execution', () => {
    const store = seededAtNightWithVirgin();
    expect(() => applyVirgin(store, 'p5', 'p4')).toThrow(/it is not day/i);
    expect(store.getState().todaysExecutions).toEqual([]);
  });

  // Review round 2, FIX 1a — symmetric with applyVirgin's guard above: the
  // reducer's slayerUsed is set purely from claimantIsRealSlayer, with no
  // reference to phase, so a night claim from a real Slayer would otherwise
  // silently burn the once-per-game shot on a claim never actually made at
  // the table.
  it('refuses to claim the Slayer outside of the day', () => {
    const store = seededAtNight();
    expect(() => claimSlayer(store, 'p4', 'p1')).toThrow(/it is not day/i);
  });

  // Review round 2, FIX 1b — the worse half. p3 is a real, functional, unspent
  // Slayer (confirmed below); p4 (Recluse) is alive and genuinely ambiguous
  // (canRuleAsDemon). Without the new guard this would resolve to
  // `outcome: 'nothing'` and still set slayerUsed, so the assertion on
  // slayerUsed is what proves the shot was never spent, not merely that some
  // error was thrown.
  it('refuses to resolve a Slayer claim against an undecided ambiguous target', () => {
    const store = seededWithSlayerAndRecluse();
    expect(() => claimSlayer(store, 'p3', 'p4')).toThrow(/ruling/i);
    expect(store.getState().players.find((p) => p.id === 'p3')?.slayerUsed).toBe(false);
  });

  // Review round 2, follow-up — the escape hatch's end-to-end witness: an
  // explicit decline must resolve where an undecided ruling (above) throws.
  // Without this, a refactor from `=== undefined` to a falsy check would pass
  // every other test in the suite while permanently blocking a legitimate
  // Storyteller decision.
  it('resolves a Slayer claim once the Storyteller has explicitly declined the Demon ruling', () => {
    const store = seededWithSlayerAndRecluse();
    expect(() => claimSlayer(store, 'p3', 'p4', { ruleTargetAsDemon: false })).not.toThrow();
    expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(true);
    // Spent even on a miss — the claim still resolved and recorded (§4.8).
    expect(store.getState().players.find((p) => p.id === 'p3')?.slayerUsed).toBe(true);
  });

  // Review round 1, FIX 2 — the only command-layer exercise of the §16.3 ruling's
  // permanent forensic record. §3.6 makes butlerVotesFlagged write-only (no
  // selector reads it), so a broken wire here would silently drop every Butler
  // violation from the audit log for a whole game with nothing else to contradict
  // it.
  it('records the Butler in the closed nomination\'s forensic record when they voted without their Master (§16.3)', () => {
    const store = seededWithButlerMaster('p5');
    const { nominationId } = nominate(store, 'p4', 'p1');
    // The Butler (p3) votes; their Master (p5) genuinely never does.
    castVote(store, nominationId, 'p3');
    const result = closeNomination(store, nominationId);
    const closed = result.events.find((e) => e.type === 'NOMINATION_CLOSED');
    expect(closed?.payload).toMatchObject({ butlerVotesFlagged: ['p3'] });
  });

  // Review round 1, FIX 3 — DEMON_DIED is a reducer no-op (the ROLE_CHANGED in the
  // same transaction is what moves the role), so if that ROLE_CHANGED is wrong or
  // missing, checkVictory sees no living Demon and ends the game for good on the
  // spot: exactly the scenario the Scarlet Woman exists to prevent, silently.
  it('promotes the Scarlet Woman when the Demon is executed by vote with 5+ alive (§4.6, §16.9)', () => {
    const store = seededWithScarletWoman();
    const { nominationId } = nominate(store, 'p4', 'p1');
    for (const voterId of ['p3', 'p4', 'p5']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    const result = closeDay(store);
    const demonDied = result.events.find((e) => e.type === 'DEMON_DIED');
    // §16.1 — the dying Demon (p1) counts toward the 6 the Scarlet Woman's
    // threshold of 5 is judged against; it is NOT 5.
    expect(demonDied?.payload).toMatchObject({
      aliveCountAtDeath: 6,
      successorId: 'p2',
      successorReason: 'scarlet_woman',
    });
    expect(store.getState().players.find((p) => p.id === 'p2')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  // Review round 1, Minor 6 — matches closeNomination's existing guard. Without
  // it, castVote on a mistyped id silently no-ops in the reducer and raises no
  // flag: a vote that is "recorded" and invisible.
  it('refuses to cast a vote on an unknown nomination', () => {
    const store = seeded();
    expect(() => castVote(store, 'nom-does-not-exist', 'p4')).toThrow(/unknown nomination/i);
  });
});
