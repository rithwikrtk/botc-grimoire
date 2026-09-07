import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById, charactersByTeam } from './characters';

describe('Trouble Brewing character list', () => {
  it('has the official 13/4/4/1 roster', () => {
    expect(charactersByTeam('townsfolk')).toHaveLength(13);
    expect(charactersByTeam('outsider')).toHaveLength(4);
    expect(charactersByTeam('minion')).toHaveLength(4);
    expect(charactersByTeam('demon')).toHaveLength(1);
    expect(Object.keys(CHARACTERS)).toHaveLength(22);
  });

  it('keys every record by its own id', () => {
    for (const [key, character] of Object.entries(CHARACTERS)) {
      expect(character.id).toBe(key);
    }
  });

  // §4.2 — the v2 bug. Their abilities fire because they are dead / dying.
  it('marks the Ravenkeeper and the Saint as not requiring life', () => {
    expect(characterById('ravenkeeper').requiresAlive).toBe(false);
    expect(characterById('saint').requiresAlive).toBe(false);
  });

  it('requires life for every other character', () => {
    const exempt = new Set(['ravenkeeper', 'saint']);
    for (const character of Object.values(CHARACTERS)) {
      if (!exempt.has(character.id)) expect(character.requiresAlive).toBe(true);
    }
  });

  // §4.1 — only the Drunk carries a false self-belief in Trouble Brewing.
  it('gives falseSelfBelief to the Drunk alone', () => {
    const believers = Object.values(CHARACTERS).filter((c) => c.falseSelfBelief);
    expect(believers.map((c) => c.id)).toEqual(['drunk']);
  });

  // §5.2, guide §2 — the Baron is the only setup modifier in the edition.
  it('gives the Baron +2 outsiders and -2 townsfolk and nobody else a modifier', () => {
    expect(characterById('baron').setupModifiers).toEqual({ townsfolk: -2, outsider: 2 });
    const modified = Object.values(CHARACTERS).filter((c) => c.setupModifiers !== null);
    expect(modified.map((c) => c.id)).toEqual(['baron']);
  });

  it('rejects an unknown character id loudly', () => {
    expect(() => characterById('lunatic')).toThrow(/unknown character/i);
  });

  // Freeze depth — a shared module singleton must not be mutable by any consumer.
  it('freezes each character object', () => {
    expect(Object.isFrozen(characterById('imp'))).toBe(true);
  });
});

/**
 * Deferred minor 4, promoted to must-fix by the whole-branch review — a code
 * snapshot of all 22 ability texts, same treatment `STEP_IDS` gets in
 * nightOrder.test.ts and for the same reason.
 *
 * Plan 2's Reference screen renders these verbatim and has no second source for
 * them, so a mistyped ability is read aloud at a real table. Two drift instances
 * were already caught inside this plan. Changing one must be a deliberate,
 * reviewed edit to a test rather than a one-character diff nothing notices.
 *
 * The keys are typed against the catalogue, so adding or removing a character is
 * a compile error here as well as a failing assertion.
 */
describe('the frozen ability texts (§3.8, guide §1)', () => {
  it('are exactly these strings', () => {
    const EXPECTED: Record<string, string> = {
      washerwoman: 'You start knowing that 1 of 2 players is a particular Townsfolk.',
      librarian: 'You start knowing that 1 of 2 players is a particular Outsider (or that zero are in play).',
      investigator: 'You start knowing that 1 of 2 players is a particular Minion.',
      chef: 'You start knowing how many pairs of evil players there are.',
      empath: 'Each night, you learn how many of your 2 alive neighbours are evil.',
      fortune_teller: 'Each night, choose 2 players: you learn if either is a Demon. There is a good player who registers as a Demon to you.',
      undertaker: 'Each night*, you learn which character died by execution today.',
      monk: 'Each night*, choose a player (not yourself): they are safe from the Demon tonight.',
      ravenkeeper: 'If you die at night, you are woken to choose a player: you learn their character.',
      virgin: 'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.',
      slayer: 'Once per game, during the day, publicly choose a player: if they are the Demon, they die.',
      soldier: 'You are safe from the Demon.',
      mayor: 'If only 3 players live and no execution occurs, your team wins. If you die at night, another player might die instead.',
      butler: 'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.',
      drunk: "You do not know you are the Drunk. You think you are a Townsfolk character, but you are not — your ability doesn't work and any info is arbitrary.",
      recluse: 'You might register as evil, and as a Minion or Demon, even if dead.',
      saint: 'If you die by execution, your team loses immediately.',
      poisoner: 'Each night, choose a player: they are poisoned tonight and tomorrow day (their ability malfunctions / gives false info).',
      spy: 'Each night, you see the Grimoire. You might register as good, and as a Townsfolk or Outsider, even if dead.',
      scarlet_woman: 'If 5+ players are alive and the Demon dies, you become the Demon.',
      baron: 'There are 2 extra Outsiders in play (replacing 2 Townsfolk).',
      imp: 'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the new Imp instead.',
    };
    expect(Object.keys(EXPECTED)).toHaveLength(22);
    for (const [id, abilityText] of Object.entries(EXPECTED)) {
      expect(characterById(id).abilityText).toBe(abilityText);
    }
    // ...and nothing in the catalogue is missing from the snapshot.
    expect(Object.values(CHARACTERS).map((c) => c.id).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
  });
});
