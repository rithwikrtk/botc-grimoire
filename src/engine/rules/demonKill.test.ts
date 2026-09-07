import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { killDerivation, mayorBounceCandidates, resolveDemonKill } from './demonKill';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'monk'],
  ['p4', 'soldier'],
  ['p5', 'mayor'],
  ['p6', 'chef'],
  ['p7', 'scarlet_woman'],
  ['p8', 'empath'],
  ['p9', 'butler'],
];

function night(n = 2): LogBuilder {
  return buildGame({ roles: ROLES, upTo: { kind: 'night', number: n } });
}

function poison(b: LogBuilder, playerId: string, effective = true): LogBuilder {
  return b.push('STATUS_APPLIED', {
    playerId,
    status: 'poisoned',
    sourcePlayerId: 'p2',
    effective,
    expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
  });
}

function protect(b: LogBuilder, playerId: string, effective = true): LogBuilder {
  return b.push('STATUS_APPLIED', {
    playerId,
    status: 'protected',
    sourcePlayerId: 'p3',
    effective,
    expiresAt: expiryFor('until_dawn', b.state.phase),
  });
}

function resolve(b: LogBuilder, targetId: string, bounce?: string | null) {
  return resolveDemonKill(toRulesView(b.state), 'p1', targetId, bounce);
}

describe('resolveDemonKill — order is the rule (§4.5)', () => {
  it('kills an ordinary target', () => {
    const outcome = resolve(night(), 'p6');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p6', starpass: false });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'died' }]);
  });

  it('does nothing when the Imp is poisoned', () => {
    const outcome = resolve(poison(night(), 'p1'), 'p6');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: null, starpass: false });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'no_effect' }]);
  });

  // The poisoned-Imp test above reaches `no_effect` via isPoisoned. This reaches
  // the SAME outcome via the other half of abilityFunctional — requiresAlive —
  // exercising a path the poisoned fixture cannot: a dead attacker.
  it('does nothing when the Imp itself is dead (the requiresAlive route to no_effect)', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'other' });
    const outcome = resolve(b, 'p6');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: null, starpass: false });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'no_effect' }]);
  });

  // Order-pinning: already-dead is checked before Monk protection (§4.5). A dead
  // AND protected target must report already_dead, not monk_protected. A guards()
  // reordered to check protection first passes every other test in this file
  // unchanged and only reddens here.
  it('reports already_dead, not monk_protected, for a target that is both', () => {
    const b = protect(night(), 'p6');
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'demon' });
    const outcome = resolve(b, 'p6');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'already_dead' }]);
  });

  it('does nothing when the target is already dead', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'demon' });
    const outcome = resolve(b, 'p6');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'already_dead' }]);
  });

  it('is blocked by a functional Monk', () => {
    const outcome = resolve(protect(night(), 'p6'), 'p6');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'monk_protected' }]);
  });

  it('is NOT blocked by a poisoned Monk\'s protection', () => {
    // A poisoned Monk still places the token, with effective: false (§3.6, §4.2).
    const outcome = resolve(protect(night(), 'p6', false), 'p6');
    expect(outcome).toMatchObject({ finalVictimId: 'p6' });
  });

  it('is blocked by a functional Soldier', () => {
    const outcome = resolve(night(), 'p4');
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p4', result: 'soldier' }]);
    expect(outcome).toMatchObject({ finalVictimId: null });
  });

  it('kills a poisoned Soldier', () => {
    const outcome = resolve(poison(night(), 'p4'), 'p4');
    expect(outcome).toMatchObject({ finalVictimId: 'p4' });
  });

  // Order-pinning: Monk protection is checked before the Soldier check (§4.5).
  // A protected Soldier must report monk_protected, not soldier. A guards()
  // reordered to Soldier-before-Monk passes every other test in this file
  // unchanged and only reddens here.
  it('reports monk_protected, not soldier, for a protected Soldier', () => {
    const outcome = resolve(protect(night(), 'p4'), 'p4');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p4', result: 'monk_protected' }]);
  });

  it('starpasses on a self-target', () => {
    const outcome = resolve(night(), 'p1');
    expect(outcome).toMatchObject({ finalVictimId: 'p1', starpass: true });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p1', result: 'starpass' }]);
  });

  // §16.11 — the guard order matters: protection is checked before self-target.
  it('does NOT starpass when the Imp targeting itself is Monk-protected', () => {
    const outcome = resolve(protect(night(), 'p1'), 'p1');
    expect(outcome).toMatchObject({ finalVictimId: null, starpass: false });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p1', result: 'monk_protected' }]);
  });

  it('does not starpass when the poisoned Imp targets itself', () => {
    const outcome = resolve(poison(night(), 'p1'), 'p1');
    expect(outcome).toMatchObject({ finalVictimId: null, starpass: false });
  });
});

describe('resolveDemonKill and the Drunk (§4.1 — the load-bearing invariant)', () => {
  // §4.1 names this exact failure: "an implementer writes
  // perceivedCharacterId(x) === 'soldier' in the kill resolver and a
  // Drunk-believing-Soldier survives the Demon." The ESLint rule is the guard;
  // this is the assertion that survives a lint bypass, and there was none.
  function withDrunk(believes: string): LogBuilder {
    return buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'drunk'], ['p4', 'chef'],
        ['p5', 'empath'], ['p6', 'monk'], ['p7', 'mayor'],
      ],
      drunkBelief: { playerId: 'p3', believesCharacterId: believes },
      upTo: { kind: 'night', number: 2 },
    });
  }

  it('kills a Drunk who believes they are the Soldier', () => {
    const outcome = resolve(withDrunk('soldier'), 'p3');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p3' });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p3', result: 'died' }]);
  });

  it('kills a Drunk who believes they are the Mayor, offering no bounce', () => {
    const outcome = resolve(withDrunk('mayor'), 'p3');
    expect(outcome.kind).toBe('resolved');
    expect(outcome).toMatchObject({ finalVictimId: 'p3' });
  });

  it('still bounces off the REAL Mayor in the same game', () => {
    const outcome = resolve(withDrunk('mayor'), 'p7');
    expect(outcome.kind).toBe('needs_mayor_choice');
  });
});

describe('resolveDemonKill — the Mayor bounce (§4.5, §16.7)', () => {
  it('asks for a bounce target when a functional Mayor is hit', () => {
    const outcome = resolve(night(), 'p5');
    expect(outcome.kind).toBe('needs_mayor_choice');
    if (outcome.kind !== 'needs_mayor_choice') throw new Error('wrong shape');
    expect(outcome.mayorId).toBe('p5');
    // Alive, not the Mayor, not the attacker (§16.7).
    expect(outcome.candidates).not.toContain('p5');
    expect(outcome.candidates).not.toContain('p1');
    expect(outcome.candidates.sort()).toEqual(['p2', 'p3', 'p4', 'p6', 'p7', 'p8', 'p9']);
  });

  it('kills a poisoned Mayor outright with no choice', () => {
    const outcome = resolve(poison(night(), 'p5'), 'p5');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p5' });
  });

  // Order-pinning: protection (and the other target-side guards) is checked
  // BEFORE the Mayor branch — a protected Mayor is blocked outright and never
  // reaches a bounce choice. Hoisting the Mayor check above guards() passes
  // every other test in this file unchanged and only reddens here: it would
  // return needs_mayor_choice instead, letting the Storyteller bounce a kill
  // the Monk already stopped and kill an innocent player who should have
  // survived the night. `kind` is asserted explicitly because that is the
  // distinction that matters.
  it('blocks a protected Mayor outright rather than asking for a bounce', () => {
    const outcome = resolve(protect(night(), 'p5'), 'p5');
    expect(outcome.kind).toBe('resolved');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p5', result: 'monk_protected' }]);
  });

  it('lets the Mayor die when the Storyteller declines to bounce', () => {
    const outcome = resolve(night(), 'p5', null);
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p5' });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p5', result: 'died' }]);
  });

  it('kills the bounce target', () => {
    const outcome = resolve(night(), 'p5', 'p6');
    expect(outcome).toMatchObject({ finalVictimId: 'p6' });
    expect(outcome.resolutionChain).toEqual([
      { targetId: 'p5', result: 'mayor_bounce' },
      { targetId: 'p6', result: 'died' },
    ]);
  });

  // §4.5 — "re-run the already-dead, Monk and Soldier guards on that bounce target".
  it('re-checks Monk protection on the bounce target', () => {
    const outcome = resolve(protect(night(), 'p6'), 'p5', 'p6');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([
      { targetId: 'p5', result: 'mayor_bounce' },
      { targetId: 'p6', result: 'monk_protected' },
    ]);
  });

  it('re-checks Soldier on the bounce target', () => {
    const outcome = resolve(night(), 'p5', 'p4');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain.at(-1)).toEqual({ targetId: 'p4', result: 'soldier' });
  });

  it('re-checks already-dead on the bounce target', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'demon' });
    const outcome = resolve(b, 'p5', 'p6');
    expect(outcome.resolutionChain.at(-1)).toEqual({ targetId: 'p6', result: 'already_dead' });
  });

  // §4.5 — the attacker-functional and self-target guards cannot apply on a bounce.
  it('does not starpass when the bounce target is the attacker', () => {
    // §16.7 excludes the attacker from the candidates, and the resolver enforces it
    // rather than trusting the caller.
    expect(() => resolve(night(), 'p5', 'p1')).toThrow(/not a legal bounce target/i);
  });

  it('rejects the Mayor as their own bounce target', () => {
    expect(() => resolve(night(), 'p5', 'p5')).toThrow(/not a legal bounce target/i);
  });
});

describe('mayorBounceCandidates (§16.7)', () => {
  it('excludes the dead, the Mayor and the attacker', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p8', characterIdAtDeath: 'empath', cause: 'demon' });
    const candidates = mayorBounceCandidates(toRulesView(b.state), 'p1', 'p5');
    expect(candidates).not.toContain('p8');
    expect(candidates).not.toContain('p5');
    expect(candidates).not.toContain('p1');
  });
});

describe('killDerivation (§8.2 — show your working)', () => {
  // Player n's default fixture name is `Player n` (test/helpers/game.ts).
  it('renders no_effect and "no one died tonight"', () => {
    const b = poison(night(), 'p1');
    const outcome = resolve(b, 'p6');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      "Player 6 chosen, but the Demon's ability is not working -> nothing happens",
      'announce at dawn: no one died tonight',
    ]);
  });

  it('renders already_dead', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'demon' });
    const outcome = resolve(b, 'p6');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      'Player 6 is already dead -> nothing happens',
      'announce at dawn: no one died tonight',
    ]);
  });

  it('renders monk_protected', () => {
    const b = protect(night(), 'p6');
    const outcome = resolve(b, 'p6');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      'Player 6 is protected by the Monk -> safe',
      'announce at dawn: no one died tonight',
    ]);
  });

  it('renders soldier', () => {
    const b = night();
    const outcome = resolve(b, 'p4');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      'Player 4 is the Soldier -> safe from the Demon',
      'announce at dawn: no one died tonight',
    ]);
  });

  it('renders starpass, and the victim in the announcement', () => {
    const b = night();
    const outcome = resolve(b, 'p1');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      'Player 1 killed themselves -> starpass',
      'announce at dawn: Player 1 died',
    ]);
  });

  it('renders died, and the victim in the announcement', () => {
    const b = night();
    const outcome = resolve(b, 'p6');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      'Player 6 dies',
      'announce at dawn: Player 6 died',
    ]);
  });

  it('renders mayor_bounce followed by the bounce victim dying', () => {
    const b = night();
    const outcome = resolve(b, 'p5', 'p6');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      'Player 5 is the Mayor -> the kill bounces',
      'Player 6 dies',
      'announce at dawn: Player 6 died',
    ]);
  });

  it('renders needs_mayor_choice as its own single line', () => {
    const b = night();
    const outcome = resolve(b, 'p5');
    expect(killDerivation(toRulesView(b.state), outcome)).toEqual([
      'Player 5 is the Mayor — choose who dies instead, or nobody',
    ]);
  });
});
