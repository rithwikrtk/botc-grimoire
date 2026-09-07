import type {
  DerivationLine,
  GameState,
  Nomination,
  PlayerId,
  RuleFlagClass,
  RulesView,
  RulesViewPlayer,
} from '../types';
import { abilityFunctional } from './predicates';
import { aliveCount, playerById } from './players';
import { masterOf } from './statuses';
import { ringOrder } from './seating';
import { toRulesView } from './rulesView';

/** §7, guide §10 — half the living players, rounded up. Verified 8->4, 7->4, 5->3, 4->2. */
export function threshold(view: RulesView): number {
  return Math.ceil(aliveCount(view) / 2);
}

export function thresholdDerivation(view: RulesView): DerivationLine[] {
  const alive = aliveCount(view);
  return [
    { label: 'threshold', detail: `ceil(${alive} alive / 2)` },
    { label: 'result', detail: `-> ${Math.ceil(alive / 2)}` },
  ];
}

/**
 * Empty at night: during night N the phase number is still N, so filtering on the
 * number alone would report day N's nominations as "today's".
 */
export function todaysNominations(state: GameState): Nomination[] {
  if (state.phase.kind !== 'day') return [];
  return state.nominations.filter((n) => n.day === state.phase.number);
}

/** Nominations from day N, readable at any point after (the Undertaker step reads it). */
export function nominationsOnDay(state: GameState, day: number): Nomination[] {
  return state.nominations.filter((n) => n.day === day);
}

export function tallyFor(nomination: Nomination): number {
  // Every recorded vote counts, including a flagged Butler vote and a second
  // dead vote (§16.3, §7). The app never silently alters a tally.
  return nomination.votes.length;
}

/** §7 — clockwise from the nominee's left, wrapping. The dead are included. */
export function voteOrder(view: RulesView, nomineeId: PlayerId): RulesViewPlayer[] {
  const ring = ringOrder(view);
  const start = ring.findIndex((p) => p.id === nomineeId);
  if (start === -1) throw new Error(`Unknown nominee: ${nomineeId}`);
  return ring.slice(start + 1).concat(ring.slice(0, start + 1));
}

export interface FlagDraft {
  rule: string;
  class: RuleFlagClass;
  detail: string;
}

/**
 * §7, §16.3, guide §10 — which Butlers on this nomination voted without their
 * Master, judged over the nomination's FINAL vote set.
 *
 * Guide §10 is explicit that the order does not matter: "the Storyteller can tally
 * the Butler's hand before or after the Master's, and retroactively
 * validate/invalidate it". So this cannot be a flag frozen when the vote lands —
 * a Butler who raises their hand before their Master is not in violation once the
 * Master's hand goes up.
 *
 * The violation NEVER removes the vote (§16.3): striking it would make the
 * announced tally disagree with the hands the table just watched, which leaks who
 * the Butler is.
 */
export function butlerViolations(state: GameState, nominationId: string): PlayerId[] {
  const view = toRulesView(state);
  const nomination = state.nominations.find((n) => n.id === nominationId);
  if (!nomination) return [];
  const voted = new Set(nomination.votes.map((v) => v.voterId));

  return nomination.votes
    .map((vote) => playerById(view, vote.voterId))
    .filter((voter) => {
      if (voter.characterId !== 'butler') return false;
      // A dead Butler's ghost vote is unrestricted (§4.2, guide §12).
      if (!voter.alive) return false;
      // A drunk or poisoned Butler's vote always counts (§7).
      if (!abilityFunctional(view, voter)) return false;
      const master = masterOf(view, voter.id);
      if (!master) return false;
      return !voted.has(master.id);
    })
    .map((voter) => voter.id);
}

/**
 * §4.8, §7 — advisory. Every issue here is recorded and warned about; none of it
 * blocks the nomination. `integrity` issues additionally produce no derived state
 * change, which the reducer enforces (Task 4).
 */
export function nominationIssues(
  state: GameState,
  nominatorId: PlayerId,
  nomineeId: PlayerId,
): FlagDraft[] {
  const view = toRulesView(state);
  const nominator = playerById(view, nominatorId);
  const nominee = playerById(view, nomineeId);
  const today = todaysNominations(state);
  const issues: FlagDraft[] = [];

  if (nominatorId === nomineeId) {
    issues.push({
      rule: 'self_nomination',
      class: 'integrity',
      detail: `${nominator.name} nominated themselves.`,
    });
  }
  if (!nominator.alive) {
    issues.push({
      rule: 'nominator_dead',
      class: 'integrity',
      detail: `${nominator.name} is dead and cannot nominate (guide §12).`,
    });
  }
  if (!nominee.alive) {
    issues.push({
      rule: 'nominee_dead',
      class: 'integrity',
      detail: `${nominee.name} is already dead.`,
    });
  }
  if (today.some((n) => n.nominatorId === nominatorId)) {
    issues.push({
      rule: 'nominator_already_nominated',
      class: 'social',
      detail: `${nominator.name} has already nominated today.`,
    });
  }
  if (today.some((n) => n.nomineeId === nomineeId)) {
    issues.push({
      rule: 'nominee_already_nominated',
      class: 'social',
      detail: `${nominee.name} has already been nominated today.`,
    });
  }
  return issues;
}

export function voteIssues(
  state: GameState,
  nominationId: string,
  voterId: PlayerId,
): FlagDraft[] {
  const view = toRulesView(state);
  const voter = playerById(view, voterId);
  const nomination = state.nominations.find((n) => n.id === nominationId);
  if (!nomination) return [];
  const issues: FlagDraft[] = [];

  if (nomination.votes.some((v) => v.voterId === voterId)) {
    issues.push({
      rule: 'duplicate_vote',
      class: 'integrity',
      detail: `${voter.name} has already voted on this nomination.`,
    });
  }

  const storedVoter = state.players.find((p) => p.id === voterId);
  if (!voter.alive && storedVoter?.deadVoteSpent) {
    issues.push({
      rule: 'dead_vote_already_spent',
      class: 'social',
      detail: `${voter.name} has already spent their dead vote. It is counted anyway (§4.8).`,
    });
  }

  // §4.8 — a vote after the nomination closed still counts, because the reducer
  // records it and the app never silently alters a tally. Flagged so the
  // Storyteller is told rather than the number moving under them.
  if (nomination.closed) {
    issues.push({
      rule: 'vote_after_close',
      class: 'social',
      detail: `This nomination is already closed. ${voter.name}'s vote is recorded and counted; re-close to refresh the tally.`,
    });
  }

  // §16.3 — a Butler voting without their Master YET. This is the live warning
  // shown as the hands go up; guide §10 lets the Master vote afterwards, in which
  // case the violation disappears — so the authoritative answer is
  // butlerViolations() over the finished vote set, not this.
  //
  // The vote COUNTS either way: striking it would make the announced tally
  // disagree with the hands the table just watched, which leaks who the Butler is.
  if (voter.characterId === 'butler' && voter.alive && abilityFunctional(view, voter)) {
    const master = masterOf(view, voterId);
    if (master && !nomination.votes.some((v) => v.voterId === master.id)) {
      issues.push({
        rule: 'butler_without_master',
        class: 'social',
        detail: `${voter.name} is the Butler and ${master.name}, their Master, has not voted yet. The vote counts; if the Master votes too, the restriction is satisfied (guide §10).`,
      });
    }
  }
  return issues;
}

/**
 * §7, §16.8 — the highest tally that met the threshold is executed at day close;
 * a tie at the top means nobody is executed, and once a nomination is the unique
 * highest and meets the threshold there is no legal skip.
 */
export function resolveDayExecution(state: GameState): {
  playerId: PlayerId | null;
  reason: string;
  derivation: DerivationLine[];
} {
  const view = toRulesView(state);
  const liveThreshold = threshold(view);
  const today = todaysNominations(state);

  if (today.length === 0) {
    return {
      playerId: null,
      reason: 'no nominations were made today',
      derivation: [
        { label: 'nominations', detail: 'none' },
        { label: 'result', detail: 'nobody is executed' },
      ],
    };
  }

  const tallies = today.map((nomination) => ({
    nomination,
    tally: tallyFor(nomination),
    nomineeName: playerById(view, nomination.nomineeId).name,
    nomineeAlive: playerById(view, nomination.nomineeId).alive,
    // Guide §10's threshold is per tally. A Virgin trigger or a Slayer shot can
    // kill someone mid-day, so the alive count at day close is not necessarily
    // the count this nomination was voted under. Use the frozen one when the
    // nomination was closed properly.
    required: nomination.closedThreshold ?? liveThreshold,
  }));

  const derivation: DerivationLine[] = [
    ...tallies.map((row) => ({
      label: row.nomineeName,
      detail:
        `${row.tally} vote${row.tally === 1 ? '' : 's'} against a threshold of ${row.required}` +
        `${row.tally >= row.required ? ' (meets threshold)' : ''}` +
        `${row.nomineeAlive ? '' : ' — already dead, cannot be executed'}`,
    })),
  ];

  const qualifying = tallies.filter((row) => row.tally >= row.required && row.nomineeAlive);
  if (qualifying.length === 0) {
    return {
      playerId: null,
      reason: 'no living nominee met their threshold',
      derivation: [...derivation, { label: 'result', detail: 'nobody is executed' }],
    };
  }

  const highest = Math.max(...qualifying.map((row) => row.tally));
  const leaders = qualifying.filter((row) => row.tally === highest);
  if (leaders.length > 1) {
    return {
      playerId: null,
      reason: `a tie at the top on ${highest} votes means no execution`,
      derivation: [
        ...derivation,
        {
          label: 'result',
          detail: `tie at ${highest} between ${leaders.map((r) => r.nomineeName).join(' and ')} -> nobody is executed`,
        },
      ],
    };
  }

  const winner = leaders[0]!;
  return {
    playerId: winner.nomination.nomineeId,
    reason: `${winner.nomineeName} had the highest tally at ${highest} and met the threshold`,
    derivation: [
      ...derivation,
      { label: 'result', detail: `${winner.nomineeName} is executed on ${highest} votes` },
    ],
  };
}
