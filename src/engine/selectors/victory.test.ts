import { describe, expect, it } from 'vitest';
import { buildGame, LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { checkVictory, victoryDerivation } from './victory';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'saint'],
  ['p4', 'mayor'],
  ['p5', 'chef'],
  ['p6', 'empath'],
  ['p7', 'monk'],
];

function game(upTo: { kind: 'night' | 'day'; number: number }): LogBuilder {
  return buildGame({ roles: ROLES, upTo });
}

function kill(b: LogBuilder, ids: string[], cause: 'demon' | 'execution' = 'demon'): LogBuilder {
  for (const id of ids) {
    const characterId = ROLES.find(([playerId]) => playerId === id)![1];
    b.push('DEATH', {
      playerId: id,
      characterIdAtDeath: characterId,
      cause,
      ...(cause === 'execution' ? { executionKind: 'vote' as const } : {}),
    });
  }
  return b;
}

const ongoing = { dayClosed: false };

describe('checkVictory (§4.7)', () => {
  it('reports ongoing at the start', () => {
    expect(checkVictory(toRulesView(game({ kind: 'night', number: 1 }).state), ongoing)).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  it('row 1 — good wins when no living player holds the Demon', () => {
    const b = kill(game({ kind: 'night', number: 2 }), ['p1']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'good',
      reason: 'demon_dead',
    });
  });

  it('row 1 does not fire while a promoted successor holds the Demon', () => {
    const b = kill(game({ kind: 'night', number: 2 }), ['p1']);
    b.push('ROLE_CHANGED', { playerId: 'p2', from: 'poisoner', to: 'imp', reason: 'scarlet_woman' });
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 2 — evil wins on a Saint executed by vote', () => {
    const b = kill(game({ kind: 'day', number: 2 }), ['p3'], 'execution');
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'evil',
      reason: 'saint_executed',
    });
  });

  it('row 2 — evil wins on a Saint executed by a Virgin trigger', () => {
    const b = game({ kind: 'day', number: 2 });
    b.push('DEATH', {
      playerId: 'p3',
      characterIdAtDeath: 'saint',
      cause: 'execution',
      executionKind: 'virgin',
    });
    expect(checkVictory(toRulesView(b.state), ongoing)).toMatchObject({ reason: 'saint_executed' });
  });

  it('row 2 does not fire for a Saint killed at night', () => {
    const b = kill(game({ kind: 'night', number: 2 }), ['p3']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 2 does not fire for a poisoned Saint', () => {
    const b = game({ kind: 'night', number: 2 });
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    kill(b, ['p3'], 'execution');
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  // The gap §4.7 leaves open, closed here: the poison expires overnight, and an
  // unscoped row 2 would hand evil the game a phase late.
  it('row 2 does not fire retroactively once the poison has expired', () => {
    const b = game({ kind: 'night', number: 2 });
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    kill(b, ['p3'], 'execution');
    b.push('DAY_CLOSED', {});
    b.push('PHASE_ADVANCED', { phase: 'night', number: 3 });
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 3 — evil wins at two alive', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p4', 'p5', 'p6', 'p7']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'evil',
      reason: 'two_alive',
    });
  });

  // §4.7 — row 1 precedes row 3. A Demon death that brings the count to 2 is GOOD.
  it('row 1 beats row 3 when the Demon\'s death brings the count to two', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p4', 'p5', 'p6']);
    // Three alive: p1 (Imp), p2, p7. Now the Imp dies -> two alive AND no Demon.
    kill(b, ['p1']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'good',
      reason: 'demon_dead',
    });
  });

  it('row 3 uses <= so a skipped count still ends the game', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p4', 'p5', 'p6', 'p7', 'p2']);
    // One alive. An equality test on 2 would report ongoing forever.
    expect(checkVictory(toRulesView(b.state), ongoing)).toMatchObject({ status: 'evil' });
  });

  it('row 4 — good wins at three alive with a functional Mayor and no execution', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6', 'p7']);
    // Alive: p1 (Imp), p2 (Poisoner), p4 (Mayor).
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'good',
      reason: 'mayor_no_execution',
    });
  });

  it('row 4 does not fire on a day when somebody WAS executed (§3.6)', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6']);
    kill(b, ['p7'], 'execution');
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  it('row 4 does not fire mid-day', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6', 'p7']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 4 does not fire for a poisoned Mayor', () => {
    const b = game({ kind: 'night', number: 3 });
    b.push('STATUS_APPLIED', {
      playerId: 'p4',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 3 });
    kill(b, ['p3', 'p5', 'p6', 'p7']);
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  it('row 4 does not fire for a dead Mayor', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p4', 'p5', 'p6', 'p7']);
    // Alive: p1, p2, p3 — three, but the Mayor is dead.
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  // The `aliveCount === 3` clause was previously unpinned: deleting it left
  // 29/29 green because every other `dayClosed: true` test happens to sit at
  // exactly 3 alive. This sits at 4.
  it('row 4 does not fire at four alive, even with a functional Mayor and no execution', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6']);
    // Alive: p1 (Imp), p2 (Poisoner), p4 (Mayor), p7 (Monk) — four.
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  // The pre-deal guard actually enforced by checkVictory (characterId === '') —
  // NOT the `players.length > 0` clauses that used to sit on rows 1 and 3, which
  // could never fire: seats exist from GAME_CREATED, before ROLES_ASSIGNED ever
  // runs, so `players.length > 0` was already true by the time either predicate
  // was reachable. Deleting the real guard here (weakening it to
  // `players.length === 0`) is what should be checked as a mutation; this test
  // is what catches it.
  it('reports ongoing for seats that exist but have not been dealt characters yet', () => {
    const b = new LogBuilder();
    b.push('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: [
        { id: 'p1', name: 'Player 1', seat: 0 },
        { id: 'p2', name: 'Player 2', seat: 1 },
      ],
    });
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  // §4.1 — a Drunk's TRUE character is 'drunk', never the believed character.
  // Both DEATH events below record the true character, as any real caller must
  // (§4.1's invariant binds the caller, not just this predicate) — the point is
  // that the predicate cannot be fooled even when a drunkBelief is attached.
  it('§4.1 — a Drunk believing they are the Saint does not hand evil a win when executed', () => {
    const drunkRoles: Array<[string, string]> = [
      ['p1', 'imp'],
      ['p2', 'poisoner'],
      ['p3', 'drunk'],
      ['p4', 'mayor'],
      ['p5', 'chef'],
      ['p6', 'empath'],
      ['p7', 'monk'],
    ];
    const b = buildGame({
      roles: drunkRoles,
      drunkBelief: { playerId: 'p3', believesCharacterId: 'saint' },
      upTo: { kind: 'day', number: 2 },
    });
    b.push('DEATH', {
      playerId: 'p3',
      characterIdAtDeath: 'drunk',
      cause: 'execution',
      executionKind: 'vote',
    });
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('§4.1 — a Drunk believing they are the Mayor does not win the game for good', () => {
    const drunkRoles: Array<[string, string]> = [
      ['p1', 'imp'],
      ['p2', 'poisoner'],
      ['p3', 'saint'],
      ['p4', 'drunk'],
      ['p5', 'chef'],
      ['p6', 'empath'],
      ['p7', 'monk'],
    ];
    const b = buildGame({
      roles: drunkRoles,
      drunkBelief: { playerId: 'p4', believesCharacterId: 'mayor' },
      upTo: { kind: 'day', number: 3 },
    });
    const dying: Array<[string, string]> = [
      ['p3', 'saint'],
      ['p5', 'chef'],
      ['p6', 'empath'],
      ['p7', 'monk'],
    ];
    for (const [id, characterId] of dying) {
      b.push('DEATH', { playerId: id, characterIdAtDeath: characterId, cause: 'demon' });
    }
    // Alive: p1 (Imp), p2 (Poisoner), p4 (Drunk, believes Mayor). No real Mayor.
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });
});

describe('victoryDerivation (§8.2 — show your working)', () => {
  it('renders an ongoing game', () => {
    const b = game({ kind: 'night', number: 1 });
    const view = toRulesView(b.state);
    expect(victoryDerivation(view, ongoing)).toEqual([
      { label: 'alive', detail: 'Player 1 Player 2 Player 3 Player 4 Player 5 Player 6 Player 7 -> 7' },
      { label: 'holds the Demon', detail: 'Player 1' },
      { label: 'executed today', detail: 'nobody' },
      { label: 'Mayor', detail: 'Player 4: alive, ability functional' },
      { label: 'day closed', detail: 'no' },
      { label: 'result', detail: 'the game continues' },
    ]);
  });

  it('renders a good win with nobody holding the Demon', () => {
    const b = kill(game({ kind: 'night', number: 2 }), ['p1']);
    const view = toRulesView(b.state);
    expect(victoryDerivation(view, ongoing)).toEqual([
      { label: 'alive', detail: 'Player 2 Player 3 Player 4 Player 5 Player 6 Player 7 -> 6' },
      { label: 'holds the Demon', detail: 'nobody' },
      { label: 'executed today', detail: 'nobody' },
      { label: 'Mayor', detail: 'Player 4: alive, ability functional' },
      { label: 'day closed', detail: 'no' },
      { label: 'result', detail: 'good wins — demon_dead' },
    ]);
  });

  it('renders an execution in the "executed today" line, and an evil win', () => {
    const b = kill(game({ kind: 'day', number: 2 }), ['p3'], 'execution');
    const view = toRulesView(b.state);
    expect(victoryDerivation(view, ongoing)).toEqual([
      { label: 'alive', detail: 'Player 1 Player 2 Player 4 Player 5 Player 6 Player 7 -> 6' },
      { label: 'holds the Demon', detail: 'Player 1' },
      { label: 'executed today', detail: 'Player 3 (vote)' },
      { label: 'Mayor', detail: 'Player 4: alive, ability functional' },
      { label: 'day closed', detail: 'no' },
      { label: 'result', detail: 'evil wins — saint_executed' },
    ]);
  });

  it('renders a closed day and the Mayor\'s good win', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6', 'p7']);
    const view = toRulesView(b.state);
    expect(victoryDerivation(view, { dayClosed: true })).toEqual([
      { label: 'alive', detail: 'Player 1 Player 2 Player 4 -> 3' },
      { label: 'holds the Demon', detail: 'Player 1' },
      { label: 'executed today', detail: 'nobody' },
      { label: 'Mayor', detail: 'Player 4: alive, ability functional' },
      { label: 'day closed', detail: 'yes' },
      { label: 'result', detail: 'good wins — mayor_no_execution' },
    ]);
  });
});
