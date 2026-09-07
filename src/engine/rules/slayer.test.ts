import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { evaluateSlayer } from './slayer';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'slayer'],
  ['p4', 'recluse'],
  ['p5', 'chef'],
  ['p6', 'scarlet_woman'],
  ['p7', 'monk'],
];

function day(): LogBuilder {
  return buildGame({ roles: ROLES, upTo: { kind: 'day', number: 1 } });
}

describe('evaluateSlayer (§7, §16.12)', () => {
  it('kills the true Demon and routes into the demon death handler', () => {
    const result = evaluateSlayer(toRulesView(day().state), 'p3', 'p1');
    expect(result).toMatchObject({
      claimantIsRealSlayer: true,
      abilityFunctional: true,
      targetIsTrueDemon: true,
      outcome: 'died',
      routesToDemonDeath: true,
    });
  });

  it('does nothing when the target is not the Demon', () => {
    const result = evaluateSlayer(toRulesView(day().state), 'p3', 'p5');
    expect(result).toMatchObject({
      outcome: 'nothing',
      routesToDemonDeath: false,
    });
    // Folded-in minor 4 — outcome/routesToDemonDeath alone are also produced by
    // four other guards (bluff, spent, non-functional, dead target); the
    // reason is what proves THIS guard fired.
    expect(result.reason).toMatch(/is not the Demon/i);
  });

  it('does nothing when the claimant is not the real Slayer', () => {
    expect(evaluateSlayer(toRulesView(day().state), 'p5', 'p1')).toMatchObject({
      claimantIsRealSlayer: false,
      outcome: 'nothing',
      routesToDemonDeath: false,
    });
  });

  it('does nothing for a poisoned Slayer', () => {
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    expect(evaluateSlayer(toRulesView(b.state), 'p3', 'p1')).toMatchObject({
      abilityFunctional: false,
      outcome: 'nothing',
    });
  });

  it('does nothing when the ability has already been used', () => {
    const b = day();
    b.push('SLAYER_CLAIMED', {
      claimantId: 'p3',
      targetId: 'p5',
      claimantIsRealSlayer: true,
      targetIsTrueDemon: false,
      targetRegisteredAsDemon: false,
      abilityFunctional: true,
      outcome: 'nothing',
      registrationRulings: [],
    });
    const result = evaluateSlayer(toRulesView(b.state), 'p3', 'p1');
    expect(result.outcome).toBe('nothing');
    expect(result.reason).toMatch(/once per game|already used/i);
  });

  // §16.12, §4.6 — the whole point. A Recluse ruled as the Demon dies, and
  // promotes nobody. Routing this into onDemonDeath gives two living Imps.
  it('kills a Recluse ruled to register as the Demon WITHOUT routing to demon death', () => {
    const view = toRulesView(day().state);
    const unruled = evaluateSlayer(view, 'p3', 'p4');
    expect(unruled).toMatchObject({
      canRuleAsDemon: true,
      outcome: 'nothing',
      // FIX 1b (review round 2) — an otherwise-resolvable claim against an
      // undecided ambiguous target must ask for a ruling rather than resolve.
      needsRegistrationRuling: true,
    });

    const ruled = evaluateSlayer(view, 'p3', 'p4', { ruleTargetAsDemon: true });
    expect(ruled).toMatchObject({
      targetIsTrueDemon: false,
      targetRegisteredAsDemon: true,
      outcome: 'died',
      routesToDemonDeath: false,
      needsRegistrationRuling: false,
    });
  });

  it('does not offer a Demon ruling for a player who cannot register as one', () => {
    expect(evaluateSlayer(toRulesView(day().state), 'p3', 'p5').canRuleAsDemon).toBe(false);
  });

  it('does nothing against an already-dead target', () => {
    const b = day();
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'demon' });
    const result = evaluateSlayer(toRulesView(b.state), 'p3', 'p1');
    expect(result.outcome).toBe('nothing');
    expect(result.reason).toMatch(/already dead/i);
  });

  // FIX 2 (review round 2) — all eight tests above build from a day fixture,
  // so the day guard at slayer.ts's top was deletable with the whole suite
  // green. The reason pin is what discriminates it from the other four
  // guards that also produce `outcome: 'nothing'`.
  it('does nothing outside of the day, and says so', () => {
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    const result = evaluateSlayer(toRulesView(b.state), 'p3', 'p1');
    expect(result).toMatchObject({ outcome: 'nothing' });
    expect(result.reason).toMatch(/only be used during the day/i);
  });

  // Folded-in minor 5, §4.1 — a Drunk who believes they are the Slayer is not
  // the Slayer. Reading `perceivedCharacterId` instead of the true
  // `characterId` at slayer.ts would leave every other test in this file
  // green, because no fixture here has a Drunk or a drunkBelief.
  it('does not treat a Drunk who believes they are the Slayer as the Slayer (§4.1)', () => {
    const rolesWithDrunk: Array<[string, string]> = [...ROLES, ['p8', 'drunk']];
    const b = buildGame({
      roles: rolesWithDrunk,
      drunkBelief: { playerId: 'p8', believesCharacterId: 'slayer' },
      upTo: { kind: 'day', number: 1 },
    });
    const result = evaluateSlayer(toRulesView(b.state), 'p8', 'p1');
    expect(result.claimantIsRealSlayer).toBe(false);
  });
});
