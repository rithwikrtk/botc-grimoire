import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import { addNote, changeRole, clearStatus, recordDeath } from './correctionCommands';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'monk'],
  ['p5', 'chef'],
  ['p6', 'empath'],
  ['p7', 'soldier'],
  ['p8', 'mayor'],
  ['p9', 'butler'],
  ['p10', 'saint'],
  ['p11', 'virgin'],
  ['p12', 'slayer'],
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
    redHerring: 'p5',
  });
  beginFirstNight(store);
  return store;
}

describe('addNote (§3.4)', () => {
  it('records a game note with an id derived from the log', () => {
    const store = seeded();
    addNote(store, 'game', 'told P5 the Chef number before checking the seating');
    const notes = store.getState().notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ scope: 'game', text: expect.stringContaining('Chef') });
    expect(notes[0]?.id).toBeTruthy();
  });

  it('does not reuse a note id after a reload', () => {
    const store = seeded();
    addNote(store, 'game', 'first');
    const reloaded = createStore(store.getEvents());
    addNote(reloaded, 'game', 'second');
    const ids = reloaded.getState().notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attaches a player note to that player', () => {
    const store = seeded();
    addNote(store, 'player', 'claimed Empath loudly on day 1', 'p6');
    expect(store.getState().notes[0]).toMatchObject({ scope: 'player', playerId: 'p6' });
  });
});

describe('clearStatus (§3.4, §4.4)', () => {
  it('removes a status the Storyteller applied by mistake', () => {
    const store = seeded();
    store.transaction('poison', (tx) =>
      tx.emit('STATUS_APPLIED', {
        playerId: 'p4',
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: { kind: 'day', number: 1 },
      }),
    );
    clearStatus(store, 'p4', 'poisoned', 'p2');
    expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toEqual([]);
  });
});

describe('changeRole (§3.4, §4.8)', () => {
  it('corrects a mis-dealt role', () => {
    const store = seeded();
    changeRole(store, 'p5', 'undertaker', 'st_correction');
    expect(store.getState().players.find((p) => p.id === 'p5')?.characterId).toBe('undertaker');
    expect(store.getState().ruleFlags).toEqual([]);
  });

  // §4.8 integrity: "Recorded and flagged, but produce no derived state change;
  // the banner says so." The reducer's guard was silent, so the Storyteller got a
  // no-op with no explanation.
  it('records and FLAGS a change that would create a second living Demon', () => {
    const store = seeded();
    const result = changeRole(store, 'p5', 'imp', 'st_correction');
    expect(result.events.map((e) => e.type)).toEqual(['ROLE_CHANGED', 'RULE_FLAGGED']);
    expect(store.getState().players.find((p) => p.id === 'p5')?.characterId).toBe('chef');
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'two_living_demons',
      class: 'integrity',
    });
    expect(store.getState().players.filter((p) => p.alive && p.team === 'demon')).toHaveLength(1);
  });

  // R15: `recordDeath(store, 'p1', 'other')` routes the Imp's death through §4.6,
  // and `seeded()` seats a Scarlet Woman at p3 who is promoted to Imp in that same
  // transaction — so a single kill leaves a living Demon behind and the guard
  // above would correctly (and unhelpfully, for this test) drop the change. The
  // successor must also die before "the first Demon is dead" is true of the
  // board. With p3 killed too: p3's characterId is already 'imp' by then, so
  // onDemonDeath finds no Scarlet Woman and returns successorId: null (no third
  // successor); p3 is alive going into its own recordDeath so §16.1's
  // already-dead precondition cannot throw; and with no living Demon left, §4.7
  // row 1 fires at that second commit and good wins — this correction therefore
  // lands AFTER the game is decided. That is unavoidable, not a bug: "the Demon
  // is dead and nobody else holds it" IS the good-win condition, and it is
  // exactly the situation st_correction exists for. Paired with the test above,
  // the two pin the guard as being about LIVING Demons, not Demons as such.
  it('allows the change once the first Demon is dead', () => {
    const store = seeded();
    recordDeath(store, 'p1', 'other');
    recordDeath(store, 'p3', 'other');
    changeRole(store, 'p5', 'imp', 'st_correction');
    expect(store.getState().players.find((p) => p.id === 'p5')?.characterId).toBe('imp');
  });
});

describe('recordDeath (§18)', () => {
  it('kills a player who dropped out, leaving them seated', () => {
    const store = seeded();
    recordDeath(store, 'p6', 'other');
    const player = store.getState().players.find((p) => p.id === 'p6')!;
    expect(player.alive).toBe(false);
    expect(player.seat).toBe(5);
    expect(store.getState().deaths[0]).toMatchObject({ cause: 'other' });
  });

  // The Demon dropping out must route through §4.6 like any other Demon death,
  // or the Scarlet Woman never promotes and good wins by default.
  it('routes a Demon drop-out through the demon death handler', () => {
    const store = seeded();
    const result = recordDeath(store, 'p1', 'other');
    expect(result.events.map((e) => e.type)).toEqual([
      'DEATH',
      'DEMON_DIED',
      'ROLE_CHANGED',
    ]);
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });
});
