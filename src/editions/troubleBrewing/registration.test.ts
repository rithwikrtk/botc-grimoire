import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById } from './characters';
import type { Alignment } from './characters';
import {
  canRegisterAsTeam,
  isAmbiguous,
  registrationOptions,
  registrationOptionsForCharacterId,
} from './registration';

describe('registration', () => {
  it('gives the Recluse its true option first: good/outsider, then evil/minion, then evil/demon', () => {
    expect(registrationOptionsForCharacterId('recluse')).toEqual([
      { alignment: 'good', team: 'outsider' },
      { alignment: 'evil', team: 'minion' },
      { alignment: 'evil', team: 'demon' },
    ]);
  });

  it('gives the Spy its true option first: evil/minion, then good/townsfolk, then good/outsider', () => {
    expect(registrationOptionsForCharacterId('spy')).toEqual([
      { alignment: 'evil', team: 'minion' },
      { alignment: 'good', team: 'townsfolk' },
      { alignment: 'good', team: 'outsider' },
    ]);
  });

  it('gives every character other than the Recluse and the Spy exactly one registration option, equal to its own team and alignment', () => {
    const ambiguous = new Set(['recluse', 'spy']);
    for (const c of Object.values(CHARACTERS)) {
      if (ambiguous.has(c.id)) continue;
      const alignment: Alignment = c.team === 'minion' || c.team === 'demon' ? 'evil' : 'good';
      expect(registrationOptions(c)).toEqual([{ alignment, team: c.team }]);
    }
  });

  it('marks the Recluse and the Spy ambiguous, and at least one other character unambiguous', () => {
    expect(isAmbiguous('recluse')).toBe(true);
    expect(isAmbiguous('spy')).toBe(true);
    expect(isAmbiguous('imp')).toBe(false);
  });

  it('lets the Recluse register as the Demon (spec §16.12 — may die to the Slayer) and the Spy register as Townsfolk (spec §16.6 — the Virgin ruling)', () => {
    expect(canRegisterAsTeam('recluse', 'demon')).toBe(true);
    expect(canRegisterAsTeam('spy', 'townsfolk')).toBe(true);
  });

  // §4.2 — registration is a passive property, not an ability: "a poisoned Recluse
  // still registers ambiguously." The strongest witness available at this layer is
  // structural: none of these functions has any parameter through which game state,
  // phase, or aliveness could even be passed in, so none of them could be gated on
  // poison even by accident.
  it('takes only a character id or Character — no state, phase or aliveness parameter exists to gate it', () => {
    expect(registrationOptions).toHaveLength(1);
    expect(registrationOptionsForCharacterId).toHaveLength(1);
    expect(isAmbiguous).toHaveLength(1);
    expect(canRegisterAsTeam).toHaveLength(2); // (characterId, team) — team is the question, not a gate
  });

  // Freeze depth — the shared registration constants back most characters' arrays.
  it('freezes the shared registration array', () => {
    expect(Object.isFrozen(characterById('washerwoman').registration)).toBe(true);
  });
});
