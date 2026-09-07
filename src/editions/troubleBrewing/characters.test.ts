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
});
