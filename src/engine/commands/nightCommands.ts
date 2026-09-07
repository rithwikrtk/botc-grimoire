import { characterById } from '@/editions/troubleBrewing/characters';
import { RESOLVERS } from '@/editions/troubleBrewing/resolvers';
import { expiryFor } from '../phase';
import { onDemonDeath } from '../rules/demonDeath';
import { resolveDemonKill } from '../rules/demonKill';
import { nextStep, type CursorPosition } from '../selectors/nightCursor';
import { abilityFunctional, isDrunk } from '../selectors/predicates';
import { registrationInconsistency } from '../selectors/registrationLedger';
import { toRulesView } from '../selectors/rulesView';
import { isPoisoned } from '../selectors/statuses';
import type {
  AnswerClass,
  LegalAnswer,
  PlayerId,
  RegistrationRuling,
  RulesView,
} from '../types';
import type { Store, Tx, TransactionResult } from './store';

export interface StepResolution {
  targets?: PlayerId[];
  /**
   * The `key` of the chosen `LegalAnswer`, for a `canonical` or `registration`
   * answer on a step that has a resolver. The engine looks it up and takes the
   * display text and the rulings from it, so `answerClass: 'canonical'` cannot be
   * self-reported over an answer the app never computed.
   */
  answerKey?: string;
  /**
   * The answer text, for `fabricated` and `st_override`, and for steps with no
   * computed answer (the Poisoner, the Monk, the Butler, the Spy).
   */
  chosenAnswer?: string;
  answerClass: AnswerClass;
  /** Required for st_override (§4.3). */
  answerReason?: string;
  /** Only for a step with no resolver; otherwise taken from the chosen answer. */
  registrationRulings?: RegistrationRuling[];
  /** Which token was physically shown, when the resolver could not decide (Task 8). */
  stChoice?: string;
}

function requireCursor(store: Store): CursorPosition {
  const position = nextStep(store.getState());
  if (!position) throw new Error('There is no current night step');
  return position;
}

/**
 * §4.3, §8.2 — the legal answer set for the step the cursor is on, with each
 * answer's derivation. This is the resolver layer's production caller: Plan 2
 * renders these, and `resolveStep` validates the chosen key against them.
 *
 * `legalAnswers` is never stored (§3.6) — it is recomputed here and, for a log
 * entry being expanded, by `answersAtSeq`.
 */
export function candidatesForCurrentStep(
  store: Store,
  targets?: readonly PlayerId[],
): LegalAnswer[] {
  const position = requireCursor(store);
  if (position.step.resolverId === null || position.actor === null) return [];
  const resolver = RESOLVERS[position.step.resolverId];
  if (!resolver) {
    throw new Error(
      `Step ${position.step.id} names resolver ${position.step.resolverId}, which does not exist`,
    );
  }
  return resolver(toRulesView(store.getState()), position.actor.id, targets);
}

/**
 * §4.8 — target constraints are SOFT. An off-constraint pick is recorded and
 * flagged in the same transaction, never refused: a Monk who pointed at himself
 * at the table has already done so, and an app that rejects the input just loses
 * the game state.
 */
function flagTargetIssues(tx: Tx, position: CursorPosition, targets: readonly PlayerId[]): void {
  const constraints = position.step.targets;
  if (!constraints) return;
  const view = tx.view();
  const actorId = position.actor?.id;
  const name = (id: PlayerId): string => view.players.find((p) => p.id === id)?.name ?? id;

  if (constraints.warnSelf && actorId && targets.includes(actorId)) {
    tx.flag('target_self', 'social', `${name(actorId)} targeted themselves at the ${position.step.id} step.`);
  }
  if (constraints.warnDead) {
    for (const targetId of targets) {
      if (!view.players.find((p) => p.id === targetId)?.alive) {
        tx.flag(
          'target_dead',
          'integrity',
          `${name(targetId)} is dead and was targeted at the ${position.step.id} step. No derived state changes.`,
        );
      }
    }
  }
  if (constraints.distinct && new Set(targets).size !== targets.length) {
    tx.flag('targets_not_distinct', 'social', 'The same player was chosen twice.');
  }
  if (targets.length < constraints.min || targets.length > constraints.max) {
    tx.flag(
      'target_count',
      'social',
      `The ${position.step.id} step expects ${constraints.min}-${constraints.max} targets, got ${targets.length}.`,
    );
  }
}

export function resolveStep(store: Store, resolution: StepResolution): TransactionResult {
  const position = requireCursor(store);
  if (position.step.id === 'imp') {
    throw new Error('Use resolveImpStep for the Imp step — it resolves a kill chain (§4.5)');
  }
  const view = toRulesView(store.getState());
  const targets = resolution.targets ?? [];
  const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);

  // The actor's functionality is frozen onto the event and decides whether the
  // step's effect is real (§3.6, §4.2).
  const functional =
    position.actor !== null ? abilityFunctional(view, position.actor) : position.actors.every((a) => abilityFunctional(view, a));

  const answer = resolveAnswer(store, position, view, resolution, functional);

  return store.transaction(`resolve the ${position.step.id} step`, (tx) => {
    tx.emit('NIGHT_STEP_RESOLVED', {
      stepId: position.step.id,
      actorIds,
      // §4.1 — the ACTOR's perceived character, handed over by the cursor. An
      // earlier draft used position.step.id, which is a valid character id for 13
      // of the 14 per-actor steps and wrong for scarlet_woman_notify.
      ...(position.actorPerceivedCharacterId !== null
        ? { perceivedCharacterId: position.actorPerceivedCharacterId }
        : {}),
      targets,
      chosenAnswer: answer.chosenAnswer,
      answerClass: resolution.answerClass,
      ...(resolution.answerReason ? { answerReason: resolution.answerReason } : {}),
      registrationRulings: answer.registrationRulings,
      abilityFunctional: functional,
      effectSuppressed: position.step.effect !== null && !functional,
      ...(resolution.stChoice ? { stChoice: resolution.stChoice } : {}),
    });

    const effect = position.step.effect;
    if (effect) {
      for (const targetId of targets) {
        tx.emit('STATUS_APPLIED', {
          playerId: targetId,
          status: effect.status,
          sourcePlayerId: position.actor?.id ?? null,
          // A suppressed effect still places the token (§4.2).
          effective: functional,
          expiresAt: expiryFor(effect.lifetime, store.getState().phase),
        });
      }
    }

    flagTargetIssues(tx, position, targets);

    // §16.6 — registration consistency is flagged, never blocked. Ruling the
    // Recluse a Minion on night 1 and good on night 2 is legal and sometimes
    // deliberate; the app's job is to notice out loud.
    for (const issue of registrationInconsistency(store.getState(), answer.registrationRulings)) {
      tx.flag(issue.rule, issue.class, issue.detail);
    }
  });
}

/**
 * §4.3 — the class constraints, enforced rather than described.
 *
 * A `canonical` or `registration` answer on a step that computes answers must
 * name one the app actually produced. Without that, `answerClass` is self-reported
 * and the lies ledger and the overrides list of §9 are built on a field nothing
 * checks — which is precisely the "silently wrong" failure the spec exists to
 * prevent.
 */
function resolveAnswer(
  store: Store,
  position: CursorPosition,
  view: RulesView,
  resolution: StepResolution,
  functional: boolean,
): { chosenAnswer: string; registrationRulings: RegistrationRuling[] } {
  const { answerClass } = resolution;

  if (answerClass === 'fabricated') {
    // ONLY when the actor is drunk or poisoned. Says what it means rather than
    // testing `functional`, which is also false for a dead actor.
    const actor = position.actor;
    const droisoned =
      actor !== null && (isDrunk(actor) || isPoisoned(actor, view.phase));
    if (!droisoned) {
      throw new Error(
        'A fabricated answer is only legal when the actor is drunk or poisoned (§4.3). ' +
          'If you disagree with the computed answer, use st_override with a reason.',
      );
    }
  }

  if (answerClass === 'st_override' && !resolution.answerReason?.trim()) {
    throw new Error('An st_override requires an answerReason (§4.3)');
  }

  const computes = position.step.resolverId !== null && position.actor !== null;

  if (answerClass === 'canonical' || answerClass === 'registration') {
    if (!computes) {
      // A step with no computed answer — the Poisoner, the Monk, the Butler, the
      // Spy. There is nothing to check the text against.
      if (!resolution.chosenAnswer) {
        throw new Error(`The ${position.step.id} step needs a chosenAnswer`);
      }
      const rulings = resolution.registrationRulings ?? [];
      if (answerClass === 'registration' && rulings.length === 0) {
        throw new Error('A registration answer requires registrationRulings (§4.3)');
      }
      return { chosenAnswer: resolution.chosenAnswer, registrationRulings: rulings };
    }

    if (!resolution.answerKey) {
      throw new Error(
        `The ${position.step.id} step computes its answers, so a ${answerClass} answer must name one by key (§4.3)`,
      );
    }
    const candidates = candidatesForCurrentStep(store, resolution.targets);
    const chosen = candidates.find((c) => c.key === resolution.answerKey);
    if (!chosen) {
      throw new Error(
        `${resolution.answerKey} is not one of the legal answers for the ${position.step.id} step. ` +
          `Legal keys: ${candidates.map((c) => c.key).join(', ') || 'none'}. ` +
          'To give an answer the app did not compute, use st_override with a reason (§4.3).',
      );
    }
    if (chosen.answerClass !== answerClass) {
      throw new Error(
        `${resolution.answerKey} is a ${chosen.answerClass} answer, not ${answerClass} (§4.3)`,
      );
    }
    // A ruled "1 of these 2 is X" answer leaves the shown token to the Storyteller
    // (Task 8), so the record is incomplete without it.
    const value = chosen.value;
    if (Array.isArray(value) && value[0] === null && !resolution.stChoice) {
      throw new Error(
        'This answer needs stChoice: record which token you showed, because the ' +
          'ruled registration does not name one (§3.6).',
      );
    }
    return { chosenAnswer: chosen.display, registrationRulings: chosen.registrationRulings };
  }

  // fabricated / st_override carry free text by design.
  if (!resolution.chosenAnswer) {
    throw new Error(`A ${answerClass} answer needs a chosenAnswer`);
  }
  void functional;
  return {
    chosenAnswer: resolution.chosenAnswer,
    registrationRulings: resolution.registrationRulings ?? [],
  };
}

export function skipStep(
  store: Store,
  reason: 'st_skip' | 'condition_unmet' = 'st_skip',
): TransactionResult {
  const position = requireCursor(store);
  const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
  return store.transaction(`skip the ${position.step.id} step`, (tx) => {
    tx.emit('NIGHT_STEP_SKIPPED', { stepId: position.step.id, actorIds, reason });
  });
}

/**
 * §6.1 — settles every step whose trigger is unmet tonight, each with its own
 * log entry, so the log can answer "why didn't the Undertaker wake?". Returns how
 * many it settled.
 */
export function autoSkipUnmetSteps(store: Store): number {
  let count = 0;
  for (;;) {
    const position = nextStep(store.getState());
    if (!position || position.conditionMet) return count;
    skipStep(store, 'condition_unmet');
    count += 1;
    if (count > 100) throw new Error('autoSkipUnmetSteps did not converge');
  }
}

export interface ImpStepOptions {
  targetId: PlayerId;
  /** Required when a functional Mayor is hit. null means the Mayor dies (§4.5). */
  mayorBounceTargetId?: PlayerId | null;
  /** Required when a starpass has living Minions and no Scarlet Woman (§4.6). */
  chosenSuccessorId?: PlayerId | null;
}

export function resolveImpStep(store: Store, opts: ImpStepOptions): TransactionResult {
  const position = requireCursor(store);
  if (position.step.id !== 'imp') {
    throw new Error(`The current step is ${position.step.id}, not the Imp`);
  }
  const attacker = position.actor;
  if (!attacker) throw new Error('The Imp step has no actor');

  const view = toRulesView(store.getState());
  const kill = resolveDemonKill(view, attacker.id, opts.targetId, opts.mayorBounceTargetId);
  if (kill.kind === 'needs_mayor_choice') {
    throw new Error(
      `${view.players.find((p) => p.id === kill.mayorId)?.name} is the Mayor — pass mayorBounceTargetId (a candidate, or null to let them die)`,
    );
  }

  const victimId = kill.finalVictimId;
  const victim = victimId ? view.players.find((p) => p.id === victimId) : null;
  const victimIsDemon = victim ? characterById(victim.characterId).team === 'demon' : false;

  // Read the successor BEFORE the death lands (§16.1).
  const demonDeath =
    victim && victimIsDemon
      ? onDemonDeath(view, victim.id, {
          starpass: kill.starpass,
          ...(opts.chosenSuccessorId !== undefined
            ? { chosenSuccessorId: opts.chosenSuccessorId }
            : {}),
        })
      : null;
  if (demonDeath && demonDeath.kind === 'needs_successor_choice') {
    throw new Error(
      `The Imp starpassed and there is no Scarlet Woman — pass chosenSuccessorId (one of ${demonDeath.candidates.join(', ')}, or null for no successor)`,
    );
  }

  return store.transaction('resolve the Imp step', (tx) => {
    tx.emit('NIGHT_KILL_RESOLVED', {
      stepId: 'imp',
      actorIds: [attacker.id],
      attackerId: attacker.id,
      chosenTargetId: opts.targetId,
      resolutionChain: kill.resolutionChain,
      finalVictimId: victimId,
      successorId: demonDeath?.kind === 'resolved' ? demonDeath.successorId : null,
    });

    if (!victim) return;

    tx.emit('DEATH', {
      playerId: victim.id,
      characterIdAtDeath: victim.characterId,
      cause: 'demon',
    });

    if (demonDeath?.kind === 'resolved') {
      tx.emit('DEMON_DIED', {
        deadDemonId: victim.id,
        aliveCountAtDeath: demonDeath.aliveCountAtDeath,
        successorId: demonDeath.successorId,
        successorReason: demonDeath.successorReason,
      });
      if (demonDeath.successorId) {
        const successor = tx.view().players.find((p) => p.id === demonDeath.successorId)!;
        tx.emit('ROLE_CHANGED', {
          playerId: successor.id,
          from: successor.characterId,
          to: victim.characterId,
          reason: demonDeath.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman',
        });
      }
    }
  });
}

/** §6.1 — the night ends when nextStep() returns null. */
export function advanceToDay(store: Store): TransactionResult {
  const state = store.getState();
  if (state.phase.kind !== 'night') throw new Error('It is not night');
  if (nextStep(state) !== null) {
    throw new Error('The night still has steps to resolve');
  }
  return store.transaction('dawn', (tx) => {
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: state.phase.number });
  });
}
