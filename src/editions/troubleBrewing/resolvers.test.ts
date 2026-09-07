import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { abilityFunctional } from '@/engine/selectors/predicates';
import {
  chefAnswers,
  empathAnswers,
  fortuneTellerAnswers,
  investigatorAnswers,
  librarianAnswers,
  ravenkeeperAnswers,
  undertakerAnswers,
  washerwomanAnswers,
} from './resolvers';

const NINE: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'washerwoman'],
  ['p4', 'librarian'],
  ['p5', 'investigator'],
  ['p6', 'recluse'],
  ['p7', 'drunk'],
  ['p8', 'fortune_teller'],
  ['p9', 'undertaker'],
];

function nine() {
  return buildGame({
    roles: NINE,
    drunkBelief: { playerId: 'p7', believesCharacterId: 'monk' },
    redHerring: 'p4',
    demonBluffs: ['chef', 'soldier', 'mayor'],
  });
}

/**
 * The same nine seats with the Spy as the Minion instead of the Poisoner, so both
 * ambiguous characters in the edition are in play at once. Still 5/2/1/1, the
 * legal chart for nine.
 *
 * The Spy previously appeared in no resolver fixture anywhere in this plan, so
 * half of its ability — "might register as good, and as a Townsfolk or Outsider,
 * even if dead" (guide §1) — was entirely untested.
 */
const NINE_SPY: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'spy'],
  ['p3', 'washerwoman'],
  ['p4', 'librarian'],
  ['p5', 'investigator'],
  ['p6', 'recluse'],
  ['p7', 'drunk'],
  ['p8', 'fortune_teller'],
  ['p9', 'empath'],
];

function nineWithSpy() {
  return buildGame({
    roles: NINE_SPY,
    drunkBelief: { playerId: 'p7', believesCharacterId: 'monk' },
    redHerring: 'p4',
    demonBluffs: ['chef', 'soldier', 'mayor'],
  });
}

describe('the Spy registers as good, even dead (guide §1, §4.3)', () => {
  it('is offered to the Washerwoman as a Townsfolk, classed as registration', () => {
    const view = toRulesView(nineWithSpy().state);
    const viaSpy = washerwomanAnswers(view, 'p3').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p2'),
    );
    expect(viaSpy.length).toBeGreaterThan(0);
    for (const a of viaSpy) {
      expect(a.answerClass).toBe('registration');
      expect(a.registrationRulings[0]?.registersAs).toEqual({ alignment: 'good', team: 'townsfolk' });
      // The token to show is the Storyteller's choice, so the slot is null.
      expect((a.value as readonly (string | null)[])[0]).toBeNull();
      expect(a.display).not.toMatch(/^Spy:/);
    }
  });

  it('is offered to the Librarian as an Outsider', () => {
    const view = toRulesView(nineWithSpy().state);
    const viaSpy = librarianAnswers(view, 'p4').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p2'),
    );
    expect(viaSpy.length).toBeGreaterThan(0);
    expect(viaSpy[0]?.registrationRulings[0]?.registersAs).toEqual({
      alignment: 'good',
      team: 'outsider',
    });
  });

  it('still registers after death — registration is not an ability', () => {
    const b = nineWithSpy();
    b.push('DEATH', { playerId: 'p2', characterIdAtDeath: 'spy', cause: 'execution', executionKind: 'vote' });
    const view = toRulesView(b.state);
    const viaSpy = washerwomanAnswers(view, 'p3').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p2'),
    );
    expect(viaSpy.length).toBeGreaterThan(0);
  });
});

describe('a poisoned Recluse still registers ambiguously (§4.2, §14 Tier 2)', () => {
  // §14 Tier 2 names this in bold, and the only previous test asserted that
  // CHARACTERS.recluse.registration has three entries — a property of a frozen
  // array literal that would pass with the Recluse dead, absent, or in another
  // game. This exercises it through a resolver and through a rule.
  it('is still offered as a Minion to the Investigator while poisoned', () => {
    const b = nine();
    b.push('STATUS_APPLIED', {
      playerId: 'p6',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    });
    const view = toRulesView(b.state);
    const recluse = view.players.find((p) => p.id === 'p6')!;
    expect(abilityFunctional(view, recluse)).toBe(false);

    const viaRecluse = investigatorAnswers(view, 'p5').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p6'),
    );
    expect(viaRecluse.length).toBeGreaterThan(0);
  });
});

describe('chefAnswers and empathAnswers — the §4.3 cross-product', () => {
  it('offers one answer when nobody ambiguous is in play', () => {
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'empath'],
          ['p5', 'monk'], ['p6', 'soldier'], ['p7', 'mayor'],
        ],
      }).state,
    );
    expect(chefAnswers(view, 'p3')).toHaveLength(1);
    expect(chefAnswers(view, 'p3')[0]?.answerClass).toBe('canonical');
  });

  it('offers four Chef answers with a Recluse and a Spy in the ring', () => {
    const view = toRulesView(nineWithSpy().state);
    const answers = chefAnswers(view, 'p3');
    expect(answers).toHaveLength(4);
    expect(answers[0]?.answerClass).toBe('canonical');
    expect(answers[0]?.registrationRulings).toEqual([]);
    expect(answers.slice(1).every((a) => a.answerClass === 'registration')).toBe(true);
    // Every answer shows its working, including which ruling produced it.
    for (const a of answers.slice(1)) {
      expect(a.derivation.map((d) => d.label)).toContain('registration ruling');
    }
  });

  it('changes the Chef count when the Recluse is ruled evil next to the Demon', () => {
    // p1 Imp, p2 Spy adjacent; p6 Recluse sits between p5 and p7, neither evil.
    const view = toRulesView(nineWithSpy().state);
    const canonical = chefAnswers(view, 'p3')[0]!;
    const values = chefAnswers(view, 'p3').map((a) => a.value as number);
    expect(canonical.value).toBe(1); // Imp and Spy are adjacent at seats 0 and 1
    // Ruling the Recluse evil adds no adjacency; ruling the Spy good removes one.
    expect(values).toContain(0);
  });

  it('offers both Empath readings when a Recluse is a living neighbour', () => {
    // p6 Recluse sits at seat 5, so the Empath at seat 8 is not adjacent —
    // build a ring where they are.
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'recluse'],
          ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'], ['p8', 'saint'], ['p9', 'butler'],
        ],
      }).state,
    );
    const answers = empathAnswers(view, 'p5');
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({ value: 0, answerClass: 'canonical' });
    expect(answers[1]).toMatchObject({ value: 1, answerClass: 'registration' });
    expect(answers[1]?.registrationRulings).toEqual([
      { playerId: 'p4', registersAs: { alignment: 'evil', team: 'minion' } },
    ]);
    expect(answers[1]?.derivation.map((d) => d.detail).join(' ')).toMatch(/ruled EVIL/);
  });

  it('ignores a DEAD ambiguous neighbour, whom the Empath cannot see', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'recluse'],
        ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'], ['p8', 'saint'], ['p9', 'butler'],
      ],
    });
    b.push('DEATH', { playerId: 'p4', characterIdAtDeath: 'recluse', cause: 'demon' });
    const view = toRulesView(b.state);
    // p3 (Chef, good) becomes the neighbour, and nobody ambiguous is adjacent.
    expect(empathAnswers(view, 'p5')).toHaveLength(1);
  });

  it('keeps answer keys stable across recomputation (§6.2)', () => {
    // §6.2: default selection happens once on step entry, "never during render,
    // or the Washerwoman decoy reshuffles every frame". Stable keys are what let
    // a selection be restored, so they must not depend on iteration order.
    const view = toRulesView(nineWithSpy().state);
    for (const resolve of [chefAnswers, washerwomanAnswers, investigatorAnswers]) {
      const first = resolve(view, 'p3').map((a) => a.key);
      const second = resolve(view, 'p3').map((a) => a.key);
      expect(second).toEqual(first);
      expect(new Set(first).size).toBe(first.length);
    }
  });
});

describe('washerwomanAnswers (§6.4)', () => {
  it('names a Townsfolk in play and two players, one of whom is them', () => {
    const view = toRulesView(nine().state);
    const answers = washerwomanAnswers(view, 'p3');
    expect(answers.length).toBeGreaterThan(0);
    for (const answer of answers) {
      const value = answer.value as readonly string[];
      // [characterId, playerA, playerB]
      expect(value).toHaveLength(3);
      const [characterId, a, b] = value;
      expect(['washerwoman', 'librarian', 'investigator', 'fortune_teller', 'undertaker']).toContain(characterId);
      expect(a).not.toBe(b);
      const holder = view.players.find((p) => p.characterId === characterId)!;
      expect([a, b]).toContain(holder.id);
    }
  });

  // §6.4 — the Washerwoman may NOT be shown the Drunk under their believed Townsfolk.
  it('never shows the Drunk as their believed Townsfolk', () => {
    const view = toRulesView(nine().state);
    for (const answer of washerwomanAnswers(view, 'p3')) {
      const [characterId, a, b] = answer.value as readonly string[];
      expect(characterId).not.toBe('monk');
      if (characterId) {
        const holder = view.players.find((p) => p.characterId === characterId)!;
        expect(holder.id).not.toBe('p7');
      }
      expect([a, b]).not.toContain(undefined);
    }
  });

  it('never names the Washerwoman themselves as the Townsfolk they learn', () => {
    const view = toRulesView(nine().state);
    for (const answer of washerwomanAnswers(view, 'p3')) {
      const [characterId] = answer.value as readonly string[];
      expect(characterId).not.toBe('washerwoman');
    }
  });

  it('shows its working', () => {
    const view = toRulesView(nine().state);
    const [first] = washerwomanAnswers(view, 'p3');
    expect(first?.derivation.map((d) => d.label)).toContain('townsfolk in play');
    expect(first?.derivation.map((d) => d.label)).toContain('decoy');
  });
});

describe('librarianAnswers (§6.4)', () => {
  it('may show the Drunk, who is a real Outsider (guide §13)', () => {
    const view = toRulesView(nine().state);
    const shown = librarianAnswers(view, 'p4').map((a) => (a.value as readonly string[])[0]);
    expect(shown).toContain('drunk');
  });

  it('has an explicit zero-Outsiders branch', () => {
    // 7 players, 5/0/1/1 — no Outsiders at all.
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'librarian'], ['p4', 'chef'],
          ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'],
        ],
      }).state,
    );
    const answers = librarianAnswers(view, 'p3');
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBeNull();
    expect(answers[0]?.display).toMatch(/zero/i);
    expect(answers[0]?.answerClass).toBe('canonical');
  });

  it('offers the Recluse as an Outsider only under its true registration', () => {
    const view = toRulesView(nine().state);
    // The Recluse IS an Outsider, so it is a legal canonical Librarian answer.
    const shown = librarianAnswers(view, 'p4').map((a) => (a.value as readonly string[])[0]);
    expect(shown).toContain('recluse');
  });
});

describe('investigatorAnswers (§4.3, §6.4)', () => {
  it('names a Minion in play', () => {
    const view = toRulesView(nine().state);
    const shown = investigatorAnswers(view, 'p5').map((a) => (a.value as readonly string[])[0]);
    expect(shown).toContain('poisoner');
  });

  // The cross-product of §4.3: a Recluse may be ruled to register as a Minion.
  it('offers the Recluse ruled as a Minion, classed as registration', () => {
    const view = toRulesView(nine().state);
    const answers = investigatorAnswers(view, 'p5');
    const viaRecluse = answers.filter(
      (a) => a.answerClass === 'registration' && a.registrationRulings.some((r) => r.playerId === 'p6'),
    );
    expect(viaRecluse.length).toBeGreaterThan(0);
    for (const answer of viaRecluse) {
      expect(answer.registrationRulings).toEqual([
        { playerId: 'p6', registersAs: { alignment: 'evil', team: 'minion' } },
      ]);
      // Never "Recluse: P6 or P3" — the shown token is the Storyteller's choice.
      expect((answer.value as readonly (string | null)[])[0]).toBeNull();
      expect(answer.display).toMatch(/^a minion of your choosing:/);
      expect(answer.display).not.toMatch(/Recluse/);
    }
  });

  it('puts the canonical answers before the registration ones', () => {
    const view = toRulesView(nine().state);
    const classes = investigatorAnswers(view, 'p5').map((a) => a.answerClass);
    const firstRegistration = classes.indexOf('registration');
    if (firstRegistration !== -1) {
      expect(classes.slice(0, firstRegistration).every((c) => c === 'canonical')).toBe(true);
    }
  });
});

describe('fortuneTellerAnswers (§6.4)', () => {
  it('says yes when a chosen player is the Demon', () => {
    const view = toRulesView(nine().state);
    const [first] = fortuneTellerAnswers(view, 'p8', ['p1', 'p3']);
    expect(first?.value).toBe(true);
    expect(first?.answerClass).toBe('canonical');
  });

  it('says yes when a chosen player is the red herring', () => {
    const view = toRulesView(nine().state);
    // p4 is the red herring and is not the Demon.
    const [first] = fortuneTellerAnswers(view, 'p8', ['p4', 'p3']);
    expect(first?.value).toBe(true);
    expect(first?.derivation.map((d) => d.detail).join(' ')).toMatch(/red herring/i);
  });

  it('says no when neither is a Demon nor the herring', () => {
    const view = toRulesView(nine().state);
    const [first] = fortuneTellerAnswers(view, 'p8', ['p3', 'p5']);
    expect(first?.value).toBe(false);
  });

  it('offers a registration answer when a Recluse is chosen', () => {
    const view = toRulesView(nine().state);
    const answers = fortuneTellerAnswers(view, 'p8', ['p6', 'p3']);
    expect(answers.map((a) => a.value)).toContain(false);
    expect(answers.map((a) => a.value)).toContain(true);
    const registration = answers.find((a) => a.answerClass === 'registration');
    expect(registration?.registrationRulings).toEqual([
      { playerId: 'p6', registersAs: { alignment: 'evil', team: 'demon' } },
    ]);
  });

  // §4.8 — an off-constraint pick must be recordable, not refused.
  it('still answers for an off-constraint target list, with the deviation shown', () => {
    const view = toRulesView(nine().state);
    const answers = fortuneTellerAnswers(view, 'p8', ['p1']);
    expect(answers.length).toBeGreaterThan(0);
    expect(answers[0]?.derivation[0]).toMatchObject({ label: 'off-constraint' });
    expect(answers[0]?.value).toBe(true);
    expect(fortuneTellerAnswers(view, 'p8', [])[0]?.value).toBe(false);
  });
});

describe('undertakerAnswers (§16.5)', () => {
  it('reports nothing when nobody was executed', () => {
    const view = toRulesView(nine().state);
    expect(undertakerAnswers(view, 'p9')).toEqual([]);
  });

  it('reports the executed player\'s TRUE character, not their believed one', () => {
    const b = nine();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    // The Drunk is executed; the Undertaker learns Drunk, not Monk (guide §13).
    b.push('DEATH', {
      playerId: 'p7',
      characterIdAtDeath: 'drunk',
      cause: 'execution',
      executionKind: 'vote',
    });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const view = toRulesView(b.state);
    const answers = undertakerAnswers(view, 'p9');
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBe('drunk');
  });

  it('becomes a Storyteller choice when two players were executed in one day', () => {
    const b = nine();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'washerwoman', cause: 'execution', executionKind: 'virgin' });
    b.push('DEATH', { playerId: 'p5', characterIdAtDeath: 'investigator', cause: 'execution', executionKind: 'vote' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const view = toRulesView(b.state);
    const answers = undertakerAnswers(view, 'p9');
    expect(answers).toHaveLength(2);
    expect(answers.map((a) => a.value).sort()).toEqual(['investigator', 'washerwoman']);
  });
});

describe('ravenkeeperAnswers (§6.4, guide §13)', () => {
  it('reports the chosen player\'s TRUE character', () => {
    const view = toRulesView(nine().state);
    const answers = ravenkeeperAnswers(view, 'p9', ['p7']);
    expect(answers[0]?.value).toBe('drunk');
  });

  it('offers a registration answer for a Recluse', () => {
    const view = toRulesView(nine().state);
    const answers = ravenkeeperAnswers(view, 'p9', ['p6']);
    expect(answers[0]?.value).toBe('recluse');
    expect(answers.length).toBeGreaterThan(1);
    expect(answers.some((a) => a.answerClass === 'registration')).toBe(true);
  });
});
