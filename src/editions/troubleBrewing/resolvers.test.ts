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
    // Article fix: "an outsider", not "a outsider".
    expect(viaSpy[0]?.display).toMatch(/^an outsider of your choosing:/);
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

  it('changes the Chef count when the Spy is ruled good, removing an adjacency', () => {
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

  it('keeps answer keys stable across independently-reduced views, and unique within one set (§6.2)', () => {
    // §6.2: default selection happens once on step entry, "never during render,
    // or the Washerwoman decoy reshuffles every frame". Stable keys are what let
    // a selection be restored, so they must not depend on iteration order.
    //
    // The equality check calls the resolver on two SEPARATELY reduced RulesViews
    // built from the same log (`nineWithSpy()` re-runs the whole event fold), not
    // twice on the same in-memory view — two calls on one object can never
    // disagree for a pure function, so that half would be unfalsifiable otherwise.
    // The uniqueness check is the half that can actually fail, and previously
    // never ran against the Fortune Teller, which is exactly the resolver whose
    // duplicate-key bug (a target chosen twice) this suite now separately covers.
    const configs: Array<{
      resolve: typeof chefAnswers;
      actorId: string;
      targets?: readonly string[];
    }> = [
      { resolve: chefAnswers, actorId: 'p3' },
      { resolve: washerwomanAnswers, actorId: 'p3' },
      { resolve: investigatorAnswers, actorId: 'p3' },
      { resolve: fortuneTellerAnswers, actorId: 'p8', targets: ['p6', 'p3'] },
    ];
    for (const { resolve, actorId, targets } of configs) {
      const first = resolve(toRulesView(nineWithSpy().state), actorId, targets).map((a) => a.key);
      const second = resolve(toRulesView(nineWithSpy().state), actorId, targets).map((a) => a.key);
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
      const [characterId] = answer.value as readonly string[];
      expect(characterId).not.toBe('monk');
      if (characterId) {
        const holder = view.players.find((p) => p.characterId === characterId)!;
        expect(holder.id).not.toBe('p7');
      }
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
    // The Recluse IS an Outsider, so it is a legal canonical Librarian answer
    // (one per decoy). There is no OTHER way for a Recluse to register as an
    // Outsider, so every answer showing it must be `canonical` — none may be
    // `registration`-class, which is the exclusivity the title claims.
    const viaRecluse = librarianAnswers(view, 'p4').filter(
      (a) => (a.value as readonly string[])[0] === 'recluse',
    );
    expect(viaRecluse.length).toBeGreaterThan(0);
    for (const a of viaRecluse) {
      expect(a.answerClass).toBe('canonical');
      expect(a.registrationRulings).toEqual([]);
    }
  });

  // FIX 1 (Critical) — the zero-Outsiders branch must be discriminated by the
  // WORLD (a true Outsider actually dealt), never by whether the answer list
  // happens to be non-empty. A Spy's {good, outsider} registration option makes
  // `oneOfTwo` non-empty even in a legal zero-Outsider game (7 players here),
  // which must not make the true "zero Outsiders" answer vanish.
  it('keeps the true zero-Outsiders answer present and first even with a Spy in play', () => {
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'spy'], ['p3', 'librarian'], ['p4', 'chef'],
          ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'],
        ],
      }).state,
    );
    const answers = librarianAnswers(view, 'p3');
    // The Spy's registration options still produce answers alongside the zero one.
    expect(answers.length).toBeGreaterThan(1);
    expect(answers[0]?.value).toBeNull();
    expect(answers[0]?.display).toMatch(/zero/i);
    expect(answers[0]?.answerClass).toBe('canonical');
    expect(answers.slice(1).every((a) => a.answerClass === 'registration')).toBe(true);
  });

  // FIX 1 correction — the actor themselves must be excluded from the
  // "is there a true Outsider" check. A Drunk who believes they are the
  // Librarian wakes at this very step (§4.1), and the Drunk's true team IS
  // outsider. Without the exclusion, `hasTrueOutsider` would be true (so no
  // zero answer is prepended) while `oneOfTwo` excludes the actor from its own
  // candidates and finds nobody else — an empty answer set, the same failure
  // one edge over.
  it('still offers the zero-Outsiders answer when the only true Outsider is the actor themselves (a Drunk believing they are the Librarian)', () => {
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'washerwoman'], ['p4', 'chef'],
          ['p5', 'empath'], ['p6', 'drunk'],
        ],
        drunkBelief: { playerId: 'p6', believesCharacterId: 'librarian' },
      }).state,
    );
    const answers = librarianAnswers(view, 'p6');
    expect(answers).not.toHaveLength(0);
    expect(answers[0]?.value).toBeNull();
    expect(answers[0]?.display).toMatch(/zero/i);
    expect(answers[0]?.answerClass).toBe('canonical');
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
    // Unconditional: `classes[0]` must be canonical, full stop. The previous form
    // — `slice(0, indexOf('registration')).every(...)` — passes vacuously
    // (`slice(0, 0)` is `[]`) on exactly the one shape that matters: a set with
    // NO canonical answer at all, where `indexOf` returns 0.
    expect(classes[0]).toBe('canonical');
    // Properly partitioned: no `canonical` appears after any `registration`.
    const firstRegistration = classes.indexOf('registration');
    if (firstRegistration !== -1) {
      expect(classes.slice(firstRegistration).every((c) => c === 'registration')).toBe(true);
    }
  });

  // FIX 3 — this is the genuine witness the vacuous form above could never be:
  // run the same unconditional ordering assertion over the exact broken shape
  // FIX 1 produced (a Librarian zero-Outsiders answer set with a Spy in play,
  // where the canonical zero answer used to be entirely absent, leaving
  // `classes[0] === 'registration'`).
  it('puts the canonical zero-Outsiders answer first even in the Spy-in-play set that FIX 1 repairs', () => {
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'spy'], ['p3', 'librarian'], ['p4', 'chef'],
          ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'],
        ],
      }).state,
    );
    const classes = librarianAnswers(view, 'p3').map((a) => a.answerClass);
    expect(classes[0]).toBe('canonical');
    const firstRegistration = classes.indexOf('registration');
    if (firstRegistration !== -1) {
      expect(classes.slice(firstRegistration).every((c) => c === 'registration')).toBe(true);
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

  // §8.2 — derivations are user-facing; a zero-target call must not render a
  // "true characters" line with an empty detail.
  it('omits the "true characters" derivation line rather than rendering it empty when nobody is chosen', () => {
    const view = toRulesView(nine().state);
    const [first] = fortuneTellerAnswers(view, 'p8', []);
    expect(first?.derivation.some((d) => d.label === 'true characters')).toBe(false);
  });

  // Cheap minor — pointing at the SAME player twice satisfies `chosen.length === 2`
  // and would otherwise mint two answers sharing the key `ft:yes:<id>`, breaking
  // §6.2's "stable key -> restorable selection" contract, and the deviation of a
  // repeated target was silently invisible.
  it('dedupes a target chosen twice, keeps answer keys unique, and flags the deviation (§4.8, §6.2)', () => {
    const view = toRulesView(nine().state);
    // p6 is the Recluse: chosen twice, not the Demon and not the herring, so it
    // takes the registration branch that used to duplicate.
    const answers = fortuneTellerAnswers(view, 'p8', ['p6', 'p6']);
    const keys = answers.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(answers[0]?.derivation[0]).toMatchObject({ label: 'off-constraint' });
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

  // FIX 2 (Important) — guide §1: the Recluse "might register as evil, and as a
  // Minion or Demon, EVEN IF DEAD". That clause exists for this ability. Without
  // an enumerated `registration` answer the only route is `st_override`, which
  // §4.3/§9 keep out of the registration ledger, so §16.6's contradiction check
  // could never see the most common ruling in the edition.
  it('offers a registration answer per off-team option for an executed Recluse', () => {
    const b = nine();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'recluse', cause: 'execution', executionKind: 'vote' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const view = toRulesView(b.state);
    const [canonical, ...ruled] = undertakerAnswers(view, 'p9');

    expect(canonical).toMatchObject({ key: 'undertaker:p6', value: 'recluse', answerClass: 'canonical' });
    expect(canonical?.registrationRulings).toEqual([]);

    // The Recluse's two off-team options, each keyed by team.
    expect(ruled.map((a) => a.key)).toEqual(['undertaker:p6:minion', 'undertaker:p6:demon']);
    for (const answer of ruled) {
      expect(answer.answerClass).toBe('registration');
      expect(answer.registrationRulings).toHaveLength(1);
      expect(answer.registrationRulings[0]?.playerId).toBe('p6');
      expect(answer.registrationRulings[0]?.registersAs.alignment).toBe('evil');
      // The exact boolean the downstream guard at nightCommands.ts evaluates:
      // `Array.isArray(value) && value[0] === null` must be TRUE, so that the
      // command layer demands an `stChoice`. A bare `null` would leave it dead.
      expect(Array.isArray(answer.value) && (answer.value as readonly (string | null)[])[0] === null).toBe(true);
      expect((answer.value as readonly (string | null)[])[1]).toBe('p6');
      expect(answer.display).toMatch(/Storyteller's choosing/);
    }
  });

  // The Spy's half of the same clause, and the case that proves the options are
  // read off `characterIdAtDeath` rather than off a good/evil assumption.
  it('offers the Spy\'s good registrations to the Undertaker', () => {
    const b = nineWithSpy();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DEATH', { playerId: 'p2', characterIdAtDeath: 'spy', cause: 'execution', executionKind: 'vote' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const answers = undertakerAnswers(toRulesView(b.state), 'p9');
    expect(answers.map((a) => a.key)).toEqual([
      'undertaker:p2',
      'undertaker:p2:townsfolk',
      'undertaker:p2:outsider',
    ]);
    expect(answers.slice(1).every((a) => a.registrationRulings[0]?.registersAs.alignment === 'good')).toBe(true);
  });

  // An unambiguous executed character must gain nothing: one answer, canonical.
  it('offers no registration answer for an unambiguous executed character', () => {
    const b = nine();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'washerwoman', cause: 'execution', executionKind: 'vote' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const answers = undertakerAnswers(toRulesView(b.state), 'p9');
    expect(answers).toHaveLength(1);
    expect(answers[0]?.answerClass).toBe('canonical');
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

  // FIX 2 (Important) — a ruled Ravenkeeper answer must NOT carry the true
  // character as its value (that would silently record "learned Recluse" when
  // the display says "a minion of the Storyteller's choosing"). The shape must
  // match the documented tuple contract so the downstream command-layer guard
  // `Array.isArray(value) && value[0] === null` (which demands an `stChoice`)
  // actually fires — that exact boolean is asserted directly below, since a
  // bare `null` would type-check and read like a fix while leaving the guard
  // permanently dead.
  it('carries the true character as a bare value for the canonical answer, and a nulled tuple for each ruled answer', () => {
    const view = toRulesView(nine().state);
    const answers = ravenkeeperAnswers(view, 'p9', ['p6']);
    const [canonical, ...ruled] = answers;

    expect(canonical?.value).toBe('recluse');
    expect(Array.isArray(canonical?.value) && (canonical!.value as readonly (string | null)[])[0] === null).toBe(
      false,
    );

    expect(ruled.length).toBeGreaterThan(0);
    for (const answer of ruled) {
      expect(Array.isArray(answer.value)).toBe(true);
      const [shown, targetId] = answer.value as readonly (string | null)[];
      expect(shown).toBeNull();
      expect(targetId).toBe('p6');
      expect(Array.isArray(answer.value) && (answer.value as readonly (string | null)[])[0] === null).toBe(true);
    }
  });
});
