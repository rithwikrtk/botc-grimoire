import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from './rulesView';
import { abilityFunctional, isDrunk } from './predicates';
import { grimoireTokens, isPoisoned, isProtected } from './statuses';
import { registrationOptionsForCharacterId } from '@/editions/troubleBrewing/registration';
import type { RulesView, RulesViewPlayer } from '@/engine/types';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'monk'],
  ['p4', 'ravenkeeper'],
  ['p5', 'saint'],
  ['p6', 'drunk'],
  ['p7', 'recluse'],
];

function view(builder: ReturnType<typeof buildGame>): RulesView {
  return toRulesView(builder.state);
}

function player(v: RulesView, id: string): RulesViewPlayer {
  const found = v.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

function game() {
  return buildGame({
    roles: ROLES,
    drunkBelief: { playerId: 'p6', believesCharacterId: 'empath' },
    redHerring: 'p5',
    demonBluffs: ['soldier', 'mayor', 'chef'],
  });
}

describe('abilityFunctional (§4.2)', () => {
  it('is true for a living, sober, unpoisoned player', () => {
    const v = view(game());
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(true);
  });

  // The v2 bug: a hardcoded `alive &&` disabled the Ravenkeeper permanently.
  it('is true for a DEAD Ravenkeeper — their ability fires because they died', () => {
    const b = game();
    b.push('DEATH', { playerId: 'p4', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    const v = view(b);
    expect(player(v, 'p4').alive).toBe(false);
    expect(abilityFunctional(v, player(v, 'p4'))).toBe(true);
  });

  // The other half of the same v2 bug: it made evil never win on a Saint execution.
  it('is true for a DEAD executed Saint', () => {
    const b = game();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DEATH', {
      playerId: 'p5',
      characterIdAtDeath: 'saint',
      cause: 'execution',
      executionKind: 'vote',
    });
    const v = view(b);
    expect(abilityFunctional(v, player(v, 'p5'))).toBe(true);
  });

  it('is false for a dead Monk', () => {
    const b = game();
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'monk', cause: 'demon' });
    const v = view(b);
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(false);
  });

  it('is false for a poisoned Monk', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    });
    const v = view(b);
    expect(isPoisoned(player(v, 'p3'), v.phase)).toBe(true);
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(false);
  });

  it('is false for the Drunk, always', () => {
    const v = view(game());
    expect(isDrunk(player(v, 'p6'))).toBe(true);
    expect(abilityFunctional(v, player(v, 'p6'))).toBe(false);
  });

  // §3.6 — a suppressed effect still places the reminder token, so an ineffective
  // poison mark must not poison anyone.
  it('ignores a poison mark applied with effective: false', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: false,
      expiresAt: { kind: 'day', number: 1 },
    });
    const v = view(b);
    expect(player(v, 'p3').statusLedger).toHaveLength(1);
    expect(isPoisoned(player(v, 'p3'), v.phase)).toBe(false);
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(true);
  });

  // §10.1 — the canary for the token projection, live from Plan 1 rather than
  // discovered in Plan 3 when there are ten callers.
  it('never exposes effectiveness through grimoireTokens (§10.1)', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p1',
      status: 'protected',
      sourcePlayerId: 'p3',
      effective: false,
      expiresAt: { kind: 'night', number: 1 },
    });
    const v = view(b);
    const tokens = grimoireTokens(player(v, 'p1'), v.phase);
    expect(tokens).toHaveLength(1);
    expect(Object.keys(tokens[0]!)).not.toContain('effective');
    expect(JSON.stringify(tokens)).not.toMatch(/effective/);
  });

  it('ignores a protection mark applied with effective: false', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p1',
      status: 'protected',
      sourcePlayerId: 'p3',
      effective: false,
      expiresAt: { kind: 'night', number: 1 },
    });
    const v = view(b);
    expect(isProtected(player(v, 'p1'), v.phase)).toBe(false);
  });
});

describe('registration is not an ability (§4.2)', () => {
  it('leaves a poisoned Recluse registering ambiguously', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p7',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    });
    const v = view(b);
    // The Recluse's ability is not functional...
    expect(abilityFunctional(v, player(v, 'p7'))).toBe(false);
    // ...but registration is a passive property and is unaffected.
    expect(registrationOptionsForCharacterId('recluse')).toHaveLength(3);
  });
});

describe('toRulesView (§6.2)', () => {
  it('omits every private field the edition layer must not see', () => {
    const b = game();
    b.push('NOTE_ADDED', { id: 'n', scope: 'game', text: 'secret' });
    b.push('RULE_FLAGGED', { rule: 'x', relatedTxId: 'tx1', class: 'social', detail: 'y' });
    // Double assertion: RulesView is an interface, so it has no implicit index
    // signature and neither direction of the comparability check succeeds. Going
    // through `unknown` is the only cast tsc accepts here.
    const v = view(b) as unknown as Record<string, unknown>;
    expect('notes' in v).toBe(false);
    expect('ruleFlags' in v).toBe(false);
    expect('stPrivate' in v).toBe(false);
    expect('nominations' in v).toBe(false);
    expect('settledStepIds' in v).toBe(false);
    for (const p of (v.players as Array<Record<string, unknown>>)) {
      expect('claims' in p).toBe(false);
      expect('infoHistory' in p).toBe(false);
      expect('deadVoteSpent' in p).toBe(false);
    }
  });

  it('carries the fields resolvers genuinely need', () => {
    const v = view(game());
    expect(v.drunkBelief).toEqual({ playerId: 'p6', believesCharacterId: 'empath' });
    expect(v.redHerringPlayerId).toBe('p5');
    expect(v.demonBluffs).toEqual(['soldier', 'mayor', 'chef']);
    expect(v.phase).toEqual({ kind: 'night', number: 1 });
    expect(v.players).toHaveLength(7);
  });
});
