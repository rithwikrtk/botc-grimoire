import { describe, expect, it } from 'vitest';
import { LogBuilder, advanceTo, buildGame } from './game';

describe('buildGame', () => {
  it('produces GAME_CREATED, ROLES_ASSIGNED and a PHASE_ADVANCED to night 1, in order', () => {
    const builder = buildGame({
      roles: [
        ['p1', 'imp'],
        ['p2', 'poisoner'],
        ['p3', 'empath'],
        ['p4', 'monk'],
        ['p5', 'chef'],
      ],
    });

    expect(builder.events.map((e) => e.type)).toEqual([
      'GAME_CREATED',
      'ROLES_ASSIGNED',
      'PHASE_ADVANCED',
    ]);

    const created = builder.events[0]!;
    expect(created.type).toBe('GAME_CREATED');
    if (created.type !== 'GAME_CREATED') throw new Error('unreachable');
    expect(created.payload.players).toEqual([
      { id: 'p1', name: 'Player 1', seat: 0 },
      { id: 'p2', name: 'Player 2', seat: 1 },
      { id: 'p3', name: 'Player 3', seat: 2 },
      { id: 'p4', name: 'Player 4', seat: 3 },
      { id: 'p5', name: 'Player 5', seat: 4 },
    ]);

    const rolesAssigned = builder.events[1]!;
    expect(rolesAssigned.type).toBe('ROLES_ASSIGNED');
    if (rolesAssigned.type !== 'ROLES_ASSIGNED') throw new Error('unreachable');
    expect(rolesAssigned.payload.assignments).toEqual({
      p1: 'imp',
      p2: 'poisoner',
      p3: 'empath',
      p4: 'monk',
      p5: 'chef',
    });
    expect(rolesAssigned.payload.distribution).toEqual({
      townsfolk: 3,
      outsider: 0,
      minion: 1,
      demon: 1,
    });

    const phaseAdvanced = builder.events[2]!;
    expect(phaseAdvanced.type).toBe('PHASE_ADVANCED');
    if (phaseAdvanced.type !== 'PHASE_ADVANCED') throw new Error('unreachable');
    expect(phaseAdvanced.payload).toEqual({ phase: 'night', number: 1 });
  });

  it('honours custom names', () => {
    const builder = buildGame({
      roles: [
        ['p1', 'imp'],
        ['p2', 'poisoner'],
      ],
      names: { p1: 'Alpha' },
    });
    const created = builder.events[0]!;
    if (created.type !== 'GAME_CREATED') throw new Error('unreachable');
    expect(created.payload.players).toEqual([
      { id: 'p1', name: 'Alpha', seat: 0 },
      { id: 'p2', name: 'Player 2', seat: 1 },
    ]);
  });
});

describe('LogBuilder — txId grouping', () => {
  it('gives each push its own txId by default, and shares one when sameTx is true', () => {
    const builder = new LogBuilder();
    builder.push('PLAYER_RENAMED', { playerId: 'p1', name: 'A' });
    builder.push('PLAYER_RENAMED', { playerId: 'p1', name: 'B' });
    builder.push('PLAYER_RENAMED', { playerId: 'p1', name: 'C' }, true);

    const [first, second, third] = builder.events;
    expect(first!.txId).not.toBe(second!.txId);
    expect(third!.txId).toBe(second!.txId);
  });
});

describe('advanceTo', () => {
  it('emits exactly the PHASE_ADVANCED events needed to reach the target, in order', () => {
    // buildGame with no upTo leaves the builder at night 1.
    const builder = buildGame({
      roles: [
        ['p1', 'imp'],
        ['p2', 'poisoner'],
      ],
    });
    const before = builder.events.length;
    advanceTo(builder, { kind: 'day', number: 2 });
    const added = builder.events.slice(before);

    expect(added.map((e) => e.type)).toEqual([
      'PHASE_ADVANCED',
      'PHASE_ADVANCED',
      'PHASE_ADVANCED',
    ]);
    expect(added.map((e) => (e.type === 'PHASE_ADVANCED' ? e.payload : null))).toEqual([
      { phase: 'day', number: 1 },
      { phase: 'night', number: 2 },
      { phase: 'day', number: 2 },
    ]);
    expect(builder.state.phase).toEqual({ kind: 'day', number: 2 });
  });

  it('throws on an unreachable target and leaves builder.events unchanged', () => {
    const builder = buildGame({
      roles: [
        ['p1', 'imp'],
        ['p2', 'poisoner'],
      ],
      upTo: { kind: 'day', number: 2 },
    });
    const before = [...builder.events];

    expect(() => advanceTo(builder, { kind: 'night', number: 1 })).toThrow(/overshot/);
    expect(builder.events).toEqual(before);
  });
});
