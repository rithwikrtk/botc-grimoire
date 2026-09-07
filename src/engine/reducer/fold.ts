import type { GameEvent } from '../events';
import type { GameState } from '../types';

export { applyEvent, initialState, SINGLE_KEY_STEP_IDS } from './applyEvent';
import { applyEvent, initialState } from './applyEvent';

export function applyMany(state: GameState, events: readonly GameEvent[]): GameState {
  let next = state;
  for (const event of events) next = applyEvent(next, event);
  return next;
}

/** Full replay. Used on boot and on undo only (§3.5). */
export function reduce(events: readonly GameEvent[]): GameState {
  return applyMany(initialState(), events);
}
