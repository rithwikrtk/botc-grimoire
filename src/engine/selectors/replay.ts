import { RESOLVERS } from '@/editions/troubleBrewing/resolvers';
import type { GameEvent } from '../events';
import { reduce } from '../reducer/fold';
import type { LegalAnswer, PlayerId } from '../types';
import { toRulesView } from './rulesView';

/**
 * §3.6 — legalAnswers is NOT stored, because the cross-product can be kilobytes
 * per event. It is a pure function of the state at that seq, recomputed when a
 * log entry is expanded.
 *
 * Costs a full replay per call, against §3.5's "full replay only on undo and on
 * boot" — acceptable because it fires on a deliberate tap to expand one entry,
 * not per render. If Plan 2's log view ever expands many at once, memoise on seq.
 *
 * Looks the resolver up by `stepId` rather than by the step's own `resolverId`.
 * Every resolver-backed step in this edition happens to name its resolver after
 * itself (ravenkeeper, undertaker, washerwoman, librarian, investigator, chef,
 * empath, fortune_teller — all eight, verified against nightOrder.ts), so this is
 * correct today. It stops being correct the day a step's resolverId diverges
 * from its id; the safer read is `nightOrderFor(...).find((s) => s.id ===
 * stepId)?.resolverId`, not done here because no such step exists yet to justify
 * threading the phase number through this signature.
 */
export function answersAtSeq(
  events: readonly GameEvent[],
  seq: number,
  stepId: string,
  actorId: PlayerId,
  targets?: readonly PlayerId[],
): LegalAnswer[] {
  const resolver = RESOLVERS[stepId];
  if (!resolver) return [];
  // The state as it was BEFORE this event, which is what the resolver saw.
  const view = toRulesView(reduce(events.slice(0, seq)));
  return resolver(view, actorId, targets);
}
