import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { evaluateVirgin } from './virgin';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'spy'],
  ['p4', 'virgin'],
  ['p5', 'chef'],
  ['p6', 'recluse'],
  ['p7', 'monk'],
];

function day(): LogBuilder {
  return buildGame({ roles: ROLES, upTo: { kind: 'day', number: 1 } });
}

describe('evaluateVirgin (§7, §11 of the guide, §16.10)', () => {
  it('fires when a true Townsfolk nominates the Virgin', () => {
    const result = evaluateVirgin(toRulesView(day().state), 'p5', 'p4');
    expect(result).toMatchObject({ isVirginNomination: true, consumed: true, fired: true });
  });

  it('does nothing special when the nominee is not the Virgin', () => {
    expect(evaluateVirgin(toRulesView(day().state), 'p5', 'p7')).toMatchObject({
      isVirginNomination: false,
      consumed: false,
      fired: false,
    });
  });

  it('does not fire when a Minion nominates, and normal voting proceeds', () => {
    const result = evaluateVirgin(toRulesView(day().state), 'p2', 'p4');
    // Still consumed: she loses the ability either way (guide §11).
    expect(result).toMatchObject({ consumed: true, fired: false });
    expect(result.reason).toMatch(/not a Townsfolk/i);
  });

  it('does not fire when the Demon nominates', () => {
    const result = evaluateVirgin(toRulesView(day().state), 'p1', 'p4');
    expect(result).toMatchObject({
      consumed: true,
      fired: false,
    });
    // Folded-in minor 4 — `consumed`/`fired` alone are also produced by the
    // poisoned-Virgin and already-triggered guards; the reason is what proves
    // THIS guard (not a Townsfolk) fired.
    expect(result.reason).toMatch(/not a Townsfolk/i);
  });

  it('does not fire for an Outsider nominator', () => {
    const result = evaluateVirgin(toRulesView(day().state), 'p6', 'p4');
    expect(result).toMatchObject({
      consumed: true,
      fired: false,
    });
    expect(result.reason).toMatch(/not a Townsfolk/i);
  });

  // §16.10 — poison silently disables the ability but still consumes it.
  it('does not fire for a poisoned Virgin but still consumes the ability', () => {
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: 'p4',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    const result = evaluateVirgin(toRulesView(b.state), 'p5', 'p4');
    expect(result).toMatchObject({ consumed: true, fired: false });
    expect(result.reason).toMatch(/poisoned|not functional/i);
  });

  it('does not fire on the second nomination against the Virgin', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p5', nomineeId: 'p4' });
    b.push('VIRGIN_TRIGGERED', {
      nominatorId: 'p5',
      nomineeId: 'p4',
      fired: true,
      registrationRulings: [],
    });
    const result = evaluateVirgin(toRulesView(b.state), 'p7', 'p4');
    expect(result).toMatchObject({ isVirginNomination: true, consumed: false, fired: false });
    expect(result.reason).toMatch(/already/i);
  });

  // Guide §11 — the Spy can be made to register as Townsfolk at the ST's discretion.
  it('offers the Spy as a Townsfolk nominator, ruled by the Storyteller', () => {
    const view = toRulesView(day().state);
    const unruled = evaluateVirgin(view, 'p3', 'p4');
    expect(unruled).toMatchObject({ needsRegistrationRuling: true, fired: false });

    const ruled = evaluateVirgin(view, 'p3', 'p4', { ruleNominatorAsTownsfolk: true });
    expect(ruled.fired).toBe(true);
    expect(ruled.registrationRulings).toEqual([
      { playerId: 'p3', registersAs: { alignment: 'good', team: 'townsfolk' } },
    ]);
  });

  it('does not offer a ruling for a Recluse, who cannot register as a Townsfolk', () => {
    expect(evaluateVirgin(toRulesView(day().state), 'p6', 'p4').needsRegistrationRuling).toBe(false);
  });

  // Folded-in minor 8 — the tri-state at virgin.ts distinguishes `undefined`
  // (not yet decided, needsRegistrationRuling: true, per the Spy test above)
  // from an explicit `false` (decided NOT to rule as Townsfolk, so there is
  // nothing left to ask). Collapsing that distinction to "anything but true"
  // would make this test, and only this test, red.
  it('does not ask for a ruling again once the Storyteller has declined it', () => {
    const view = toRulesView(day().state);
    const declined = evaluateVirgin(view, 'p3', 'p4', { ruleNominatorAsTownsfolk: false });
    expect(declined).toMatchObject({ fired: false, needsRegistrationRuling: false });
  });

  // Folded-in minor 5, §4.1 — a Drunk who believes they are the Virgin has no
  // ability, and nominating them must not look like nominating the Virgin.
  // Reading `perceivedCharacterId` instead of the true `characterId` at
  // virgin.ts would leave every other test in this file green, because no
  // fixture here has a Drunk or a drunkBelief.
  it('does not treat a Drunk who believes they are the Virgin as the Virgin (§4.1)', () => {
    const rolesWithDrunk: Array<[string, string]> = [...ROLES, ['p8', 'drunk']];
    const b = buildGame({
      roles: rolesWithDrunk,
      drunkBelief: { playerId: 'p8', believesCharacterId: 'virgin' },
      upTo: { kind: 'day', number: 1 },
    });
    const result = evaluateVirgin(toRulesView(b.state), 'p5', 'p8');
    expect(result.isVirginNomination).toBe(false);
  });
});
