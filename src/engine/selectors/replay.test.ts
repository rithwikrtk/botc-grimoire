import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { answersAtSeq } from './replay';
import { toRulesView } from './rulesView';
import { empathAnswers } from '@/editions/troubleBrewing/resolvers';

describe('answersAtSeq (§3.6)', () => {
  it('recomputes the answer set as it stood before that event', () => {
    // R24 — the brief's original roster (p2 poisoner / p4 chef) cannot
    // distinguish the live answer from the historical one: the Empath's seat-2
    // neighbours are p2 and p4 either way (a dead p2 is skipped in favour of
    // p1, also evil), so empathCount stays 1 before and after and
    // `.not.toEqual(expected)` cannot fail. Swapping the two roles so the
    // Empath's neighbours are good/evil (count 1) before p4 dies and good/good
    // (count 0) after makes the two assertions independent.
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'chef'], ['p3', 'empath'], ['p4', 'poisoner'],
        ['p5', 'monk'], ['p6', 'soldier'], ['p7', 'mayor'],
      ],
    });
    const before = toRulesView(b.state);
    const expected = empathAnswers(before, 'p3').map((a) => a.value);

    b.push('NIGHT_STEP_RESOLVED', {
      stepId: 'empath',
      actorIds: ['p3'],
      perceivedCharacterId: 'empath',
      targets: [],
      chosenAnswer: '1',
      answerClass: 'canonical',
      registrationRulings: [],
      abilityFunctional: true,
      effectSuppressed: false,
    });
    // A later death changes the live answer but must not change the historical one.
    b.push('DEATH', { playerId: 'p4', characterIdAtDeath: 'poisoner', cause: 'slayer' });

    const seq = b.events.findIndex((e) => e.type === 'NIGHT_STEP_RESOLVED');
    expect(answersAtSeq(b.events, seq, 'empath', 'p3').map((a) => a.value)).toEqual(expected);
    expect(empathAnswers(toRulesView(b.state), 'p3').map((a) => a.value)).not.toEqual(expected);
  });

  it('returns nothing for a step with no resolver', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'chef'], ['p3', 'empath'], ['p4', 'poisoner'],
        ['p5', 'monk'], ['p6', 'soldier'], ['p7', 'mayor'],
      ],
    });
    expect(answersAtSeq(b.events, 1, 'poisoner', 'p2')).toEqual([]);
  });
});
