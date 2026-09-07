import { nightOrderFor, type NightStep } from '@/editions/troubleBrewing/nightOrder';
import type { CharacterId, GameState, Phase, PlayerId, RulesViewPlayer } from '../types';
import { perceivedCharacterId } from './players';
import { toRulesView } from './rulesView';

export interface CursorPosition {
  step: NightStep;
  /** Every actor the step wakes tonight, seat-ordered. */
  actors: RulesViewPlayer[];
  /** The one actor whose turn it is, or null for a group or pseudo step. */
  actor: RulesViewPlayer | null;
  /**
   * §4.1 — the acting actor's perceived character, for the step event and for
   * rendering. Carried here because `nightCursor.ts` already resolved `wakes()`
   * and is therefore a sanctioned reader; the command layer must not import
   * `perceivedCharacterId` itself.
   */
  actorPerceivedCharacterId: CharacterId | null;
  /**
   * False means the step's trigger is unmet tonight. The step is still returned,
   * so the command layer can emit NIGHT_STEP_SKIPPED { condition_unmet } and the
   * log can answer "why didn't the Undertaker wake?" (§6.1).
   */
  conditionMet: boolean;
  key: string;
}

/**
 * §3.7, §6.1 — night-scoped, and one key per actor on a per-actor step.
 *
 * The `GROUP` sentinel means "one key for this step tonight, whoever acts": it
 * covers group and pseudo steps, and the Imp, whose settleScope is per-night.
 *
 * Throws rather than substituting a placeholder on a missing actor — a
 * `…:UNKNOWN` key looks plausible and would never match, so the step would be
 * offered forever.
 */
export function stepKey(step: NightStep, phase: Phase, actorId: PlayerId | null): string {
  if (step.settleScope === 'per-actor') {
    if (actorId === null) {
      throw new Error(`stepKey needs an actor for the per-actor step ${step.id}`);
    }
    return `${phase.number}:${step.id}:${actorId}`;
  }
  return `${phase.number}:${step.id}:GROUP`;
}

/**
 * §6.1 — re-evaluated after EVERY step event. No materialised queue: a mid-night
 * Scarlet Woman promotion re-opens a step that sits earlier in the order, and
 * that is intended.
 */
export function nextStep(state: GameState): CursorPosition | null {
  if (state.victory.status !== 'ongoing') return null;
  if (state.phase.kind !== 'night') return null;

  const view = toRulesView(state);
  for (const step of nightOrderFor(state.phase.number)) {
    if (step.grouping === 'pseudo') {
      const key = stepKey(step, state.phase, null);
      if (state.settledStepIds.has(key)) continue;
      return {
        step,
        actors: [],
        actor: null,
        actorPerceivedCharacterId: null,
        conditionMet: true,
        key,
      };
    }

    const actors = step.wakes(view);
    if (actors.length === 0) continue;

    if (step.grouping === 'group') {
      const key = stepKey(step, state.phase, null);
      if (state.settledStepIds.has(key)) continue;
      return {
        step,
        actors,
        actor: null,
        actorPerceivedCharacterId: null,
        conditionMet: step.condition(view, actors),
        key,
      };
    }

    if (step.settleScope === 'per-night') {
      // The Imp: one key for the night, but still a single acting actor.
      const key = stepKey(step, state.phase, null);
      if (state.settledStepIds.has(key)) continue;
      const actor = actors[0]!;
      return {
        step,
        actors,
        actor,
        actorPerceivedCharacterId: perceivedCharacterId(view, actor.id),
        conditionMet: step.condition(view, [actor]),
        key,
      };
    }

    for (const actor of actors) {
      const key = stepKey(step, state.phase, actor.id);
      if (state.settledStepIds.has(key)) continue;
      return {
        step,
        actors,
        actor,
        actorPerceivedCharacterId: perceivedCharacterId(view, actor.id),
        conditionMet: step.condition(view, [actor]),
        key,
      };
    }
  }
  return null;
}

export interface OverviewRow {
  step: NightStep;
  actors: RulesViewPlayer[];
  actor: RulesViewPlayer | null;
  state: 'settled' | 'current' | 'upcoming';
  conditionMet: boolean;
  key: string;
}

/**
 * §8.1 — tonight's full ordered step list, so the night overview screen can
 * replace the printed sheet rather than walking one step at a time.
 */
export function nightOverview(state: GameState): OverviewRow[] {
  if (state.phase.kind !== 'night') return [];
  const view = toRulesView(state);
  const current = nextStep(state);
  const rows: OverviewRow[] = [];

  for (const step of nightOrderFor(state.phase.number)) {
    const actors = step.grouping === 'pseudo' ? [] : step.wakes(view);
    if (step.grouping !== 'pseudo' && actors.length === 0) continue;

    const entries: Array<RulesViewPlayer | null> =
      step.settleScope === 'per-actor' ? actors : [null];

    for (const actor of entries) {
      const key = stepKey(step, state.phase, actor?.id ?? null);
      rows.push({
        step,
        actors,
        actor,
        state: state.settledStepIds.has(key)
          ? 'settled'
          : current?.key === key
            ? 'current'
            : 'upcoming',
        conditionMet: step.condition(view, actor ? [actor] : actors),
        key,
      });
    }
  }
  return rows;
}
