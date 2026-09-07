import { describe, expect, it } from 'vitest';
import {
  advanceToDay,
  assignRoles,
  autoSkipUnmetSteps,
  beginFirstNight,
  beginNight,
  candidatesForCurrentStep,
  castVote,
  closeDay,
  closeNomination,
  createGame,
  createStore,
  isPoisoned,
  nextStep,
  nominate,
  recordDeath,
  reduce,
  resolveImpStep,
  resolveStep,
  skipStep,
  type Store,
  type TransactionResult,
} from '@/engine';

/**
 * 9 players, 5/2/1/1 — the legal chart (guide §2).
 *
 * R23 — the brief's original roster (`p2 scarlet_woman`, `p3 saint`) drifted
 * from its own script: day 1 executes p2 under a comment calling it "the
 * Poisoner" (there is no Poisoner in this roster), which kills the exact
 * character the whole test exists to promote, and day 4 would nominate p3 —
 * the Saint under the original roster — handing EVIL the game where the test
 * asserts a good win. Swapping p2 and p3's roles (washerwoman <-> scarlet_woman)
 * and p3 and p4's characters (saint moves to p4) fixes both: every existing
 * assertion below was traced against THIS roster and holds unchanged.
 */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'washerwoman'],
  ['p3', 'scarlet_woman'],
  ['p4', 'saint'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'undertaker'],
  ['p8', 'butler'],
  ['p9', 'mayor'],
];

function newGame(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(store, ROLES.map(([id], i) => ({ id, name: `P${i + 1}` })));
  // 9 players is 5/2/1/1 (guide §2). assignRoles enforces the chart (Task 5).
  assignRoles(store, {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['chef', 'slayer', 'soldier'],
    drunkBelief: null,
    redHerring: 'p5',
  });
  beginFirstNight(store);
  return store;
}

/** Resolves the current step whether or not it computes an answer. */
function takeCanonicalOrConfirm(store: Store): TransactionResult {
  const position = nextStep(store.getState());
  if (!position) throw new Error('no current step');
  if (position.step.resolverId !== null && position.actor !== null) {
    return takeCanonical(store);
  }
  return resolveStep(store, { chosenAnswer: 'shown', answerClass: 'canonical' });
}

/** Takes the canonical answer for whatever step the cursor is on. */
function takeCanonical(store: Store, targets?: string[]): TransactionResult {
  const [canonical] = candidatesForCurrentStep(store, targets);
  if (!canonical) throw new Error('no canonical answer for the current step');
  return resolveStep(store, {
    ...(targets ? { targets } : {}),
    answerKey: canonical.key,
    answerClass: 'canonical',
  });
}

/** Runs the night, resolving each step with the answers a Storyteller would give. */
function runNight(store: Store, choices: Record<string, () => void> = {}): string[] {
  const visited: string[] = [];
  let guard = 0;
  for (;;) {
    autoSkipUnmetSteps(store);
    const position = nextStep(store.getState());
    if (!position) return visited;
    visited.push(position.step.id);
    const handler = choices[position.step.id];
    if (handler) {
      handler();
    } else if (position.step.resolverId !== null) {
      // A step that computes answers: take the canonical one by key, which is what
      // §4.3 requires and what a Storyteller taps.
      takeCanonical(store);
    } else if (position.step.targets) {
      // Default: target the first living player who is neither the actor nor the
      // Demon, so the script never accidentally kills or self-targets.
      const target = store
        .getState()
        .players.find((p) => p.alive && p.id !== position.actor?.id && p.id !== 'p1')!;
      resolveStep(store, {
        targets: [target.id],
        chosenAnswer: `chose ${target.name}`,
        answerClass: 'canonical',
      });
    } else {
      resolveStep(store, { chosenAnswer: 'shown', answerClass: 'canonical' });
    }
    if (++guard > 80) throw new Error(`night did not terminate; visited ${visited.join(', ')}`);
  }
}

describe('a full scripted game (§14 Tier 3)', () => {
  it('plays nine players from the deal to a good win and keeps the log consistent', () => {
    const store = newGame();

    // ---- Night 1 ----
    const night1 = runNight(store, {
      // R17 — there is no Poisoner in this nine-player roster, so nothing can
      // make the Empath's premise (drunk or poisoned) true except a direct
      // STATUS_APPLIED. Applied in its own top-level transaction: runNight
      // calls each handler OUTSIDE any transaction, so this is not the
      // re-entrant nesting the store throws on. `sourcePlayerId: null` because
      // there is genuinely no in-fiction poisoner here — this handler exists
      // to exercise the fabricated-answer path through the command layer
      // (§14 Tier 2), not to simulate a character this roster does not have.
      empath: () => {
        store.transaction('poison the Empath for the night', (tx) => {
          tx.emit('STATUS_APPLIED', {
            playerId: 'p5',
            status: 'poisoned',
            sourcePlayerId: null,
            effective: true,
            expiresAt: { kind: 'day', number: 1 },
          });
        });
        // The Empath is now genuinely poisoned, so a fabricated answer is
        // legal (§4.3), and it carries free text rather than an answer key by
        // design.
        resolveStep(store, { chosenAnswer: '0', answerClass: 'fabricated' });
      },
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    expect(night1).toContain('minion_info');
    expect(night1).toContain('demon_info');
    expect(night1).toContain('washerwoman');
    // No Monk, Imp, Undertaker or Ravenkeeper on the first night (§6.3).
    expect(night1).not.toContain('imp');
    expect(night1).not.toContain('monk');
    expect(night1).not.toContain('undertaker');
    advanceToDay(store);
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });

    // ---- Day 1: the Washerwoman (p2) is executed ----
    const first = nominate(store, 'p4', 'p2');
    for (const voterId of ['p4', 'p6', 'p7', 'p9', 'p5']) castVote(store, first.nominationId, voterId);
    closeNomination(store, first.nominationId);
    closeDay(store);
    beginNight(store);
    expect(store.getState().players.find((p) => p.id === 'p2')?.alive).toBe(false);
    expect(store.getState().phase).toEqual({ kind: 'night', number: 2 });
    // R18 — a length says nothing about expiry, and p5 is this fixture's
    // redHerring, whose permanent entry the reducer writes at ROLES_ASSIGNED,
    // so a bare length check is green before a single night step runs. Assert
    // the predicate AND the entry's persistence instead: by night 2, the
    // poison applied on night 1 reads as expired (`isPoisoned` false) while its
    // ledger entry is still present — entries persist, the predicate is what
    // moves. (This pair does not itself witness §4.4's inclusive `<=`
    // comparison at the boundary — flipping it to `<` does not redden this
    // assertion, per fix round 1; that boundary is covered separately by the
    // Mayor-poison test pair below.)
    const p5AtNight2 = store.getState().players.find((p) => p.id === 'p5')!;
    expect(isPoisoned(p5AtNight2, store.getState().phase)).toBe(false);
    expect(p5AtNight2.statusLedger.some((s) => s.status === 'poisoned')).toBe(true);

    // ---- Night 2: the Monk protects, the Imp kills elsewhere ----
    // Fix round 1, folded minor (e) — the Monk's STATUS_APPLIED is emitted
    // here, but the Imp never targets the protected player (p9) anywhere in
    // this script, and nothing here reads `isProtected`, so this arc does NOT
    // witness protection actually blocking a kill. Deleting this handler's
    // STATUS_APPLIED would leave the whole file green. That coverage is real,
    // just not here: src/engine/commands/nightCommands.test.ts's 'records a
    // blocked kill with no death' resolves a Monk protection then an Imp kill
    // against the same target and asserts `finalVictimId: null` and
    // `resolutionChain: [{ result: 'monk_protected' }]`. Not duplicated here
    // because moving a scripted kill to target p9 would break the alive-count
    // arithmetic every later day's execution threshold depends on.
    const night2 = runNight(store, {
      monk: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 protected', answerClass: 'canonical' }),
      imp: () => resolveImpStep(store, { targetId: 'p4' }),
      empath: () => takeCanonical(store),
      undertaker: () => takeCanonical(store),
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    expect(night2).toContain('monk');
    expect(night2).toContain('imp');
    // The Undertaker wakes because someone was executed on day 1 (§6.3).
    expect(night2).toContain('undertaker');
    // There is no Poisoner in this roster at all, so the step never wakes (§6.1).
    expect(night2).not.toContain('poisoner');
    expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(false);
    advanceToDay(store);

    // ---- Day 2: nobody meets the threshold ----
    const second = nominate(store, 'p5', 'p3');
    castVote(store, second.nominationId, 'p5');
    closeNomination(store, second.nominationId);
    closeDay(store);
    beginNight(store);
    expect(store.getState().todaysExecutions).toEqual([]);
    expect(store.getState().victory.status).toBe('ongoing');

    // ---- Night 3: the Imp kills the Monk ----
    runNight(store, {
      monk: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 protected', answerClass: 'canonical' }),
      imp: () => resolveImpStep(store, { targetId: 'p6' }),
      empath: () => takeCanonical(store),
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(false);
    advanceToDay(store);

    // ---- Day 3: the Imp is executed. Six alive, so the Scarlet Woman promotes ----
    const third = nominate(store, 'p5', 'p1');
    for (const voterId of ['p5', 'p7', 'p8', 'p9']) castVote(store, third.nominationId, voterId);
    closeNomination(store, third.nominationId);
    closeDay(store);
    beginNight(store);

    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(false);
    // §4.6 — she becomes the Demon, so good does NOT win here.
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });

    // ---- Night 4: she is notified, having been promoted by a DAYTIME execution ----
    const night4 = runNight(store, {
      imp: () => resolveImpStep(store, { targetId: 'p7' }),
      empath: () => takeCanonical(store),
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    // §6.3 — the notification fires the night AFTER a daytime promotion.
    expect(night4).toContain('scarlet_woman_notify');
    expect(store.getState().players.find((p) => p.id === 'p3')?.demonNotified).toBe(true);
    advanceToDay(store);

    // ---- Day 4: the new Demon is executed with no successor left ----
    const fourth = nominate(store, 'p5', 'p3');
    for (const voterId of ['p5', 'p8', 'p9']) castVote(store, fourth.nominationId, voterId);
    closeNomination(store, fourth.nominationId);
    closeDay(store);

    expect(store.getState().victory).toEqual({ status: 'good', reason: 'demon_dead' });
    // The phase is DAY 4 here, so `nextStep` returning null is already
    // guaranteed by the phase check alone (`nextStep` only ever returns
    // non-null during a night) — it does not by itself witness §4.7's "the
    // night cannot continue past the end of the game". Kept as a sanity check,
    // but the real witness is `beginNight` refusing to open a next night at
    // all now that the game is decided (fix round 1, folded minor (c)).
    expect(nextStep(store.getState())).toBeNull();
    expect(() => beginNight(store)).toThrow(/game is over/i);
  });

  it('leaves a log that replays to the same state and undoes to nothing', () => {
    const store = newGame();
    // R17/One folded minor — §6.3 gives the first night no Imp step, so an
    // `imp:` handler on a night-1 runNight is dead code that reads as covering
    // a kill. Deleted; the default paths (autoSkipUnmetSteps / takeCanonical /
    // the targets-fallback) are what actually run on night 1.
    runNight(store);
    advanceToDay(store);
    closeDay(store);

    expect(reduce(store.getEvents())).toEqual(store.getState());

    let guard = 0;
    while (store.canUndo()) {
      store.undo();
      if (++guard > 200) throw new Error('undo did not converge');
    }
    expect(store.getEvents()).toEqual([]);
  });

  // The bug the review found: the Imp step is keyed per-actor, so after a
  // mid-night promotion `${night}:imp:${newDemon}` was unsettled and the cursor
  // offered the kill a SECOND time — and advanceToDay refuses to leave the night
  // while a step remains. settleScope: 'per-night' is the fix (Task 9).
  it('gives the promoted Scarlet Woman no second kill on the same night', () => {
    const store = newGame();
    runNight(store);
    advanceToDay(store);
    closeDay(store);
    beginNight(store);

    // Night 2: the Imp self-kills, promoting the Scarlet Woman (p3) mid-night.
    let guard = 0;
    while (nextStep(store.getState())?.step.id !== 'imp') {
      autoSkipUnmetSteps(store);
      if (nextStep(store.getState())?.step.id === 'imp') break;
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('never reached the Imp');
    }
    resolveImpStep(store, { targetId: 'p1' });
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');

    // Her notification re-opens, which is intended and non-monotonic (§6.1)...
    expect(nextStep(store.getState())?.step.id).toBe('scarlet_woman_notify');
    // Fix round 1, FIX 2 — §4.1's per-actor stamping had no witness anywhere in
    // the tree: `scarlet_woman_notify` is the ONE step in the whole night order
    // where the step id is not itself a valid character id, so it is the only
    // place a `perceivedCharacterId: position.step.id` regression in
    // nightCommands.ts can be caught. The promoted p3's true AND perceived
    // character is `imp`, not `scarlet_woman_notify`.
    const notifyResult = takeCanonicalOrConfirm(store);
    expect(notifyResult.events[0]?.payload).toMatchObject({ perceivedCharacterId: 'imp' });

    // ...but the Imp step must NOT come back round.
    const remaining: string[] = [];
    guard = 0;
    for (;;) {
      autoSkipUnmetSteps(store);
      const position = nextStep(store.getState());
      if (!position) break;
      remaining.push(position.step.id);
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('night did not terminate');
    }
    expect(remaining).not.toContain('imp');
    expect(store.getState().players.filter((p) => !p.alive)).toHaveLength(1);
    expect(() => advanceToDay(store)).not.toThrow();
  });

  // The other half of the phase-ordering defect: row 4 calls abilityFunctional,
  // and a poison applied on night N expires at the end of day N — so checking
  // victory after advancing to night N+1 handed good the game for a poisoned
  // Mayor. closeDay no longer advances (Task 14).
  it('does not award the Mayor win when the Mayor is poisoned', () => {
    const store = newGame();
    runNight(store);
    advanceToDay(store);
    // Thin the table to three: p1 (Imp), p2 (Washerwoman), p9 (Mayor).
    for (const id of ['p3', 'p4', 'p5', 'p6', 'p7', 'p8']) recordDeath(store, id, 'other');
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'mayor_no_execution' });

    // Same shape, but the Mayor was poisoned on the night before.
    const poisoned = newGame();
    runNight(poisoned);
    poisoned.transaction('poison the Mayor', (tx) => {
      tx.emit('STATUS_APPLIED', {
        playerId: 'p9',
        status: 'poisoned',
        sourcePlayerId: 'p3',
        effective: true,
        expiresAt: { kind: 'day', number: 1 },
      });
    });
    advanceToDay(poisoned);
    for (const id of ['p3', 'p4', 'p5', 'p6', 'p7', 'p8']) recordDeath(poisoned, id, 'other');
    closeDay(poisoned);
    expect(poisoned.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  // Guide §10 — the Master may vote after the Butler. An earlier draft froze the
  // violation when the vote landed, so a Butler voting first was flagged forever.
  it('does not flag a Butler who voted before their Master', () => {
    const store = newGame();
    runNight(store, {
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    advanceToDay(store);
    const { nominationId } = nominate(store, 'p4', 'p1');
    // p8 is the Butler, p9 the Master — Butler's hand goes up first.
    castVote(store, nominationId, 'p8');
    castVote(store, nominationId, 'p9');
    const closed = closeNomination(store, nominationId);
    expect(closed.events[0]?.payload).toMatchObject({ butlerVotesFlagged: [] });
  });

  // Row 2 of §4.7, through the only path that can execute a Saint. Nominates
  // p4 (the Saint under R23's roster), five of nine votes, deliberately
  // excluding the Butler (p8) so no incidental §16.3 flag rides along.
  it('awards evil the game when the Saint is executed by vote', () => {
    const store = newGame();
    runNight(store);
    advanceToDay(store);
    const { nominationId } = nominate(store, 'p2', 'p4');
    for (const voterId of ['p2', 'p5', 'p6', 'p7', 'p9']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'saint_executed' });
  });

  // §16.5 — closeDay no longer advances the phase, so the Mayor win is reachable
  // without the sequencing trick an earlier draft relied on.
  it('awards the Mayor win on a closed day with three alive and no execution', () => {
    const store = newGame();
    // R17/One folded minor — no Imp step exists on night 1 (§6.3), so this
    // handler was dead code. Deleted; runNight(store) takes the default paths.
    runNight(store);
    advanceToDay(store);
    // Thin the table to three: p1 (Imp), p3 (Scarlet Woman), p9 (Mayor).
    store.transaction('offscreen deaths', (tx) => {
      for (const id of ['p2', 'p4', 'p5', 'p6', 'p7', 'p8']) {
        const characterId = ROLES.find(([playerId]) => playerId === id)![1];
        tx.emit('DEATH', { playerId: id, characterIdAtDeath: characterId, cause: 'other' });
      }
    });
    expect(store.getState().victory.status).toBe('ongoing');

    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'mayor_no_execution' });
  });
});
