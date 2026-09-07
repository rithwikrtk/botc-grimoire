import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import { addNote, changeRole, clearStatus, recordDeath } from './correctionCommands';
import type { GameEvent } from '../events';
import type { TransactionResult } from './store';

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

  // Review round 1, I2: this does NOT witness reload-safety across a process
  // restart — createStore here runs in the same module instance as `store`, so
  // even a naive module-level counter (the thing §12.8's docstring warns
  // about) would still survive this call and hand out a unique id; that
  // regression is only observable across an actual process restart, which
  // nothing in this suite performs. What this DOES witness: a producer that
  // reissues a fixed/constant id, ignoring prior state, collides across two
  // Store instances built from the same log. See the next test for the one
  // that pins nextNoteId's collision guard itself.
  it('gives a second Store built from the same log a distinct next id', () => {
    const store = seeded();
    addNote(store, 'game', 'first');
    const reloaded = createStore(store.getEvents());
    addNote(reloaded, 'game', 'second');
    const ids = reloaded.getState().notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Review round 1, I2: the discriminating case for nextNoteId's `taken.has`
  // guard is a non-dense note log. Seed a log holding note1 and note3 (a gap —
  // as could arise from an undo of a run that added note1, note2, note3, then
  // note2 alone was somehow removed, or any other non-contiguous history);
  // `state.notes.length + 1` alone would compute note3 and collide with the
  // existing one. The `taken` check is what skips past it.
  it('does not collide with an existing id when the note log has a gap', () => {
    let seq = 0;
    const e = <T extends GameEvent['type']>(
      type: T,
      payload: Extract<GameEvent, { type: T }>['payload'],
    ): GameEvent => ({ seq: seq++, txId: 'tx1', ts: 1_700_000_000_000 + seq, type, payload }) as GameEvent;
    const seedEvents: GameEvent[] = [
      e('NOTE_ADDED', { id: 'note1', scope: 'game', text: 'a' }),
      e('NOTE_ADDED', { id: 'note3', scope: 'game', text: 'b' }),
    ];
    const store = createStore(seedEvents);
    addNote(store, 'game', 'c');
    const ids = store.getState().notes.map((n) => n.id);
    expect(ids).toEqual(['note1', 'note3', 'note4']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attaches a player note to that player', () => {
    const store = seeded();
    addNote(store, 'player', 'claimed Empath loudly on day 1', 'p6');
    expect(store.getState().notes[0]).toMatchObject({ scope: 'player', playerId: 'p6' });
  });

  // Review round 1, M2: matches the malformed-input treatment used throughout
  // this file (unknown player ids) and elsewhere in the engine (assignRoles,
  // the Mayor bounce, castVote).
  it('refuses a player-scoped note with no playerId', () => {
    const store = seeded();
    expect(() => addNote(store, 'player', 'no target')).toThrow(/playerId/);
  });

  it('refuses a note for an unknown playerId', () => {
    const store = seeded();
    expect(() => addNote(store, 'player', 'ghost', 'p99')).toThrow(/Unknown player id/);
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
    // Review round 1, M5: without this, the assertion below would pass
    // vacuously if the fixture ever stopped applying the status at all.
    expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toHaveLength(1);
    clearStatus(store, 'p4', 'poisoned', 'p2');
    expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toEqual([]);
  });

  // Review round 1, M2: matches changeRole/recordDeath's treatment of an
  // unknown player id — thrown, not a silent no-op.
  it('refuses an unknown playerId', () => {
    const store = seeded();
    expect(() => clearStatus(store, 'p99', 'poisoned', 'p2')).toThrow(/Unknown player id/);
  });

  // Review round 1, M2: deliberately the opposite ruling — a status/source
  // pair that matches nothing in the ledger is a legitimate no-op, not a
  // malformed-input case, so it must NOT throw and must NOT be blocked.
  it('does not refuse clearing a status that was never applied', () => {
    const store = seeded();
    expect(() => clearStatus(store, 'p4', 'poisoned', 'p2')).not.toThrow();
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
    // §18 — "leaving them seated". This assertion stands for the SEAT
    // IMMUTABILITY half only, and it cannot fail: `seat` is written in exactly
    // one place (applyEvent.ts's GAME_CREATED case) and the event catalogue has
    // no reseat/add/remove event, so the absence of a write path — not this
    // line — is what enforces §18, and that is stronger than any test. What
    // stands behind "the catalogue has no such event" is the frozen event-type
    // list in reducer/applyEvent.test.ts, which reddens the moment one is added.
    // The OTHER half §18 implies — that `seat`, not array position, is what
    // defines the ring — is a live, testable property and is covered by
    // selectors/seating.test.ts' "the ring is defined by seat, not by array
    // position", which reddens when `bySeat`'s sort is removed. Neither claim
    // rests on this line; it is kept as a readable statement of intent.
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

  // Review round 1, I1 — a double-tap on an already-dead non-Demon must be
  // recorded and flagged, not a silent no-op (applyDeath's own comment says
  // "recorded and flagged", but nothing produced the flag before this fix).
  it('flags, rather than silently no-ops, a second death for an already-dead non-Demon', () => {
    const store = seeded();
    recordDeath(store, 'p6', 'other');
    const result = recordDeath(store, 'p6', 'other');
    expect(result.events.map((e) => e.type)).toEqual(['DEATH', 'RULE_FLAGGED']);
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'target_dead',
      class: 'integrity',
    });
    expect(store.getState().deaths.filter((d) => d.playerId === 'p6')).toHaveLength(1);
  });

  // Review round 1, I1 — the same double-tap on an already-dead Demon must
  // not throw onDemonDeath's §16.1 precondition (that throw is for a
  // different caller mistake — passing the post-DEATH view), and must not
  // produce a second promotion.
  it('flags, rather than throwing or re-promoting, a second death for an already-dead Demon', () => {
    const store = seeded();
    recordDeath(store, 'p1', 'other');
    let result: TransactionResult | undefined;
    expect(() => {
      result = recordDeath(store, 'p1', 'other');
    }).not.toThrow();
    expect(result!.events.map((e) => e.type)).toEqual(['DEATH', 'RULE_FLAGGED']);
    expect(result!.events[1]).toMatchObject({ payload: { rule: 'target_dead', class: 'integrity' } });
    const demonDiedCount = store.getEvents().filter((e) => e.type === 'DEMON_DIED').length;
    expect(demonDiedCount).toBe(1);
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
  });
});
