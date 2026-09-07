import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { STEP_IDS } from './stepIds';
import { FIRST_NIGHT, OTHER_NIGHTS, nightOrderFor } from './nightOrder';
import { SINGLE_KEY_STEP_IDS, SCARLET_WOMAN_NOTIFY_STEP_ID } from '@/engine/reducer/applyEvent';
import { RESOLVERS } from './resolvers';

describe('the frozen step id list (§3.8)', () => {
  // A snapshot in code, not in a .snap file: this list is part of the replay
  // contract, so changing it must be a deliberate edit to a test, reviewed.
  it('is exactly this list, in this order', () => {
    expect(STEP_IDS).toEqual([
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
    ]);
  });

  it('contains every step used by either night order and nothing else', () => {
    const used = new Set([...FIRST_NIGHT, ...OTHER_NIGHTS].map((s) => s.id));
    expect([...used].sort()).toEqual([...STEP_IDS].sort());
  });

  it('has no duplicate step ids within an order', () => {
    for (const order of [FIRST_NIGHT, OTHER_NIGHTS]) {
      expect(new Set(order.map((s) => s.id)).size).toBe(order.length);
    }
  });

  // The reducer duplicates this set as SINGLE_KEY_STEP_IDS because it cannot
  // import the night order without pulling in the edition barrel (Task 4). A
  // step that drifts between the two settles under the wrong key and either
  // loops forever or skips silently.
  it('agrees with the reducer\'s SINGLE_KEY_STEP_IDS about what settles once per night', () => {
    const perNight = new Set(
      [...FIRST_NIGHT, ...OTHER_NIGHTS].filter((s) => s.settleScope === 'per-night').map((s) => s.id),
    );
    expect([...SINGLE_KEY_STEP_IDS].sort()).toEqual([...perNight].sort());
  });

  // Same duplicated-data hazard as SINGLE_KEY_STEP_IDS: SCARLET_WOMAN_NOTIFY_STEP_ID
  // is a string keyed against the night order's own step ids, and the reducer uses
  // it to set demonNotified. If it ever drifts from the real step id, the promoted
  // Demon is silently mis-notified every night for the rest of the game (§6.3).
  it('agrees with the reducer about which step notifies the Scarlet Woman', () => {
    const ids = new Set([...FIRST_NIGHT, ...OTHER_NIGHTS].map((s) => s.id));
    expect(ids.has(SCARLET_WOMAN_NOTIFY_STEP_ID)).toBe(true);
    expect(OTHER_NIGHTS.some((s) => s.id === SCARLET_WOMAN_NOTIFY_STEP_ID)).toBe(true);
  });

  // The Imp is the one step whose settleScope diverges from its grouping.
  it('settles the Imp once per night, not once per actor', () => {
    const imp = OTHER_NIGHTS.find((s) => s.id === 'imp')!;
    expect(imp.grouping).toBe('per-actor');
    expect(imp.settleScope).toBe('per-night');
    for (const other of [...FIRST_NIGHT, ...OTHER_NIGHTS]) {
      if (other.id === 'imp') continue;
      expect(other.settleScope).toBe(other.grouping === 'per-actor' ? 'per-actor' : 'per-night');
    }
  });

  // §10.3 — the handover instruction may only ever be rendered inside Spy Mode.
  // This is edition DATA, so no behavioural test would ever look at it.
  it('never puts handover copy in a step instruction (§10.3)', () => {
    for (const step of [...FIRST_NIGHT, ...OTHER_NIGHTS]) {
      expect(step.script.instruction).not.toMatch(/hand (it|the phone|this) over/i);
      expect(step.script.instruction).not.toMatch(/give (it|the phone) to/i);
    }
  });

  // Same duplicated-data hazard as SINGLE_KEY_STEP_IDS: resolverId is a string
  // keyed into RESOLVERS, and nothing in the engine would notice a typo.
  it('names only resolvers that exist, and uses every resolver', () => {
    const named = [...FIRST_NIGHT, ...OTHER_NIGHTS]
      .map((s) => s.resolverId)
      .filter((id): id is string => id !== null);
    expect([...new Set(named)].sort()).toEqual(Object.keys(RESOLVERS).sort());
  });
});

describe('night order composition (§6.3, guide §3)', () => {
  it('runs the first night in the guide\'s order', () => {
    expect(FIRST_NIGHT.map((s) => s.id)).toEqual([
      'dusk_confirm_eyes_closed',
      'minion_info',
      'demon_info',
      'poisoner',
      'spy',
      'washerwoman',
      'librarian',
      'investigator',
      'chef',
      'empath',
      'fortune_teller',
      'butler',
      'dawn_wait',
      'dawn_announce_deaths',
    ]);
  });

  it('runs every other night in the guide\'s order', () => {
    expect(OTHER_NIGHTS.map((s) => s.id)).toEqual([
      'dusk_confirm_eyes_closed',
      'poisoner',
      'monk',
      'spy',
      'scarlet_woman_notify',
      'imp',
      'ravenkeeper',
      'undertaker',
      'empath',
      'fortune_teller',
      'butler',
      'dawn_wait',
      'dawn_announce_deaths',
    ]);
  });

  it('puts status modifiers before the kill and reactive abilities after it (guide §15)', () => {
    const index = (id: string) => OTHER_NIGHTS.findIndex((s) => s.id === id);
    expect(index('poisoner')).toBeLessThan(index('monk'));
    expect(index('monk')).toBeLessThan(index('imp'));
    expect(index('imp')).toBeLessThan(index('ravenkeeper'));
    expect(index('ravenkeeper')).toBeLessThan(index('undertaker'));
    expect(index('undertaker')).toBeLessThan(index('empath'));
  });

  it('selects the first-night order for night 1 only', () => {
    expect(nightOrderFor(1)).toBe(FIRST_NIGHT);
    expect(nightOrderFor(2)).toBe(OTHER_NIGHTS);
    expect(nightOrderFor(9)).toBe(OTHER_NIGHTS);
  });
});

describe('wakes() and the Drunk (§4.1)', () => {
  it('wakes a Drunk-believing-Monk at the Monk step and the real Monk too', () => {
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'monk'], ['p4', 'drunk'],
          ['p5', 'chef'], ['p6', 'empath'], ['p7', 'soldier'], ['p8', 'butler'], ['p9', 'saint'],
        ],
        drunkBelief: { playerId: 'p4', believesCharacterId: 'monk' },
        upTo: { kind: 'night', number: 2 },
      }).state,
    );
    const monk = OTHER_NIGHTS.find((s) => s.id === 'monk')!;
    expect(monk.wakes(view).map((p) => p.id)).toEqual(['p3', 'p4']);
  });

  it('does not wake a dead Monk but does wake a dead Ravenkeeper (§6.2)', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'monk'], ['p4', 'ravenkeeper'],
        ['p5', 'chef'], ['p6', 'empath'], ['p7', 'soldier'],
      ],
      upTo: { kind: 'night', number: 2 },
    });
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'monk', cause: 'demon' });
    b.push('DEATH', { playerId: 'p4', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    const view = toRulesView(b.state);
    expect(OTHER_NIGHTS.find((s) => s.id === 'monk')!.wakes(view)).toEqual([]);
    expect(OTHER_NIGHTS.find((s) => s.id === 'ravenkeeper')!.wakes(view).map((p) => p.id)).toEqual(['p4']);
  });
});

describe('step conditions (§6.3)', () => {
  function nine(upTo: { kind: 'night' | 'day'; number: number }) {
    return buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'scarlet_woman'], ['p4', 'undertaker'],
        ['p5', 'ravenkeeper'], ['p6', 'chef'], ['p7', 'empath'], ['p8', 'butler'], ['p9', 'saint'],
      ],
      upTo,
    });
  }

  it('withholds Minion info and Demon info below 7 players', () => {
    const small = toRulesView(
      buildGame({
        roles: [['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'empath'], ['p5', 'monk']],
      }).state,
    );
    const minionInfo = FIRST_NIGHT.find((s) => s.id === 'minion_info')!;
    const demonInfo = FIRST_NIGHT.find((s) => s.id === 'demon_info')!;
    expect(minionInfo.condition(small, minionInfo.wakes(small))).toBe(false);
    expect(demonInfo.condition(small, demonInfo.wakes(small))).toBe(false);
  });

  it('runs Minion info and Demon info at 7+ players', () => {
    const view = toRulesView(nine({ kind: 'night', number: 1 }).state);
    const minionInfo = FIRST_NIGHT.find((s) => s.id === 'minion_info')!;
    expect(minionInfo.condition(view, minionInfo.wakes(view))).toBe(true);
  });

  // §6.3's "7+ players only" qualifier is a named v2 regression (v2 dropped it,
  // v1 had it right) — pin the exact boundary rather than leaving it free to
  // drift to 6 or 8 while the 5-vs-9 tests above still pass either way.
  it('pins the Minion/Demon info threshold at exactly 7, not 6 or 8', () => {
    const six = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'empath'], ['p5', 'monk'],
          ['p6', 'butler'],
        ],
      }).state,
    );
    const seven = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'empath'], ['p5', 'monk'],
          ['p6', 'butler'], ['p7', 'saint'],
        ],
      }).state,
    );
    const minionInfo = FIRST_NIGHT.find((s) => s.id === 'minion_info')!;
    const demonInfo = FIRST_NIGHT.find((s) => s.id === 'demon_info')!;
    expect(minionInfo.condition(six, minionInfo.wakes(six))).toBe(false);
    expect(demonInfo.condition(six, demonInfo.wakes(six))).toBe(false);
    expect(minionInfo.condition(seven, minionInfo.wakes(seven))).toBe(true);
    expect(demonInfo.condition(seven, demonInfo.wakes(seven))).toBe(true);
  });

  it('runs the Undertaker only when someone was executed today', () => {
    const quiet = toRulesView(nine({ kind: 'night', number: 2 }).state);
    const undertaker = OTHER_NIGHTS.find((s) => s.id === 'undertaker')!;
    expect(undertaker.condition(quiet, undertaker.wakes(quiet))).toBe(false);

    const b = nine({ kind: 'day', number: 1 });
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'execution', executionKind: 'vote' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const busy = toRulesView(b.state);
    expect(undertaker.condition(busy, undertaker.wakes(busy))).toBe(true);
  });

  it('runs the Ravenkeeper only when they died this night', () => {
    const b = nine({ kind: 'night', number: 2 });
    const ravenkeeper = OTHER_NIGHTS.find((s) => s.id === 'ravenkeeper')!;
    const before = toRulesView(b.state);
    expect(ravenkeeper.condition(before, ravenkeeper.wakes(before))).toBe(false);

    b.push('DEATH', { playerId: 'p5', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    const after = toRulesView(b.state);
    expect(ravenkeeper.condition(after, ravenkeeper.wakes(after))).toBe(true);
  });

  it('does not run the Ravenkeeper for a death on a previous night', () => {
    const b = nine({ kind: 'night', number: 2 });
    b.push('DEATH', { playerId: 'p5', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 3 });
    const ravenkeeper = OTHER_NIGHTS.find((s) => s.id === 'ravenkeeper')!;
    const view = toRulesView(b.state);
    expect(ravenkeeper.condition(view, ravenkeeper.wakes(view))).toBe(false);
  });

  // §6.3 — a persistent flag, not "promoted this night". A promotion by daytime
  // execution on day 3 must notify on night 4.
  it('notifies a Scarlet Woman promoted by a DAYTIME execution on the following night', () => {
    const b = nine({ kind: 'day', number: 3 });
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'execution', executionKind: 'vote' });
    b.push('ROLE_CHANGED', { playerId: 'p3', from: 'scarlet_woman', to: 'imp', reason: 'scarlet_woman' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 4 });
    const view = toRulesView(b.state);
    const notify = OTHER_NIGHTS.find((s) => s.id === 'scarlet_woman_notify')!;
    expect(notify.wakes(view).map((p) => p.id)).toEqual(['p3']);
    expect(notify.condition(view, notify.wakes(view))).toBe(true);
  });

  // The Task 4 defect this task fixes: without demonNotified on the deal, the
  // original Imp is woken on night 2 and shown a "You are the Imp" card.
  it('does not notify the original Demon, who was told at setup', () => {
    const view = toRulesView(nine({ kind: 'night', number: 2 }).state);
    const notify = OTHER_NIGHTS.find((s) => s.id === 'scarlet_woman_notify')!;
    expect(notify.wakes(view)).toEqual([]);
  });
});
