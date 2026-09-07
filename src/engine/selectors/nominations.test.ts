import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { masterOf } from './statuses';
import {
  butlerViolations,
  nominationIssues,
  nominationsOnDay,
  resolveDayExecution,
  tallyFor,
  threshold,
  thresholdDerivation,
  todaysNominations,
  voteIssues,
  voteOrder,
} from './nominations';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'butler'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
  ['p8', 'virgin'],
];

function day(dead: string[] = []): LogBuilder {
  const b = buildGame({ roles: ROLES, upTo: { kind: 'day', number: 1 } });
  for (const id of dead) {
    b.push('DEATH', {
      playerId: id,
      characterIdAtDeath: ROLES.find(([playerId]) => playerId === id)![1],
      cause: 'demon',
    });
  }
  return b;
}

/**
 * p3 is the Butler throughout this file. Builds to night 1, marks `masterId` as
 * p3's Master, optionally poisons a player (the Butler, in every current call
 * site — kept general so the parameter names the poisoned player rather than
 * assuming it's always the Butler), advances to day 1, and opens nomination n1
 * (p4 nominates p1). Shared by every fixture that needs a live Master mark, so a
 * copy cannot drift from the others and leave a `toEqual([])` sibling vacuously
 * green (review round 1, Minor 9).
 */
function withButlerMaster(masterId: string, opts: { poison?: string } = {}): LogBuilder {
  const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
  b.push('STATUS_APPLIED', {
    playerId: masterId,
    status: 'master',
    sourcePlayerId: 'p3',
    effective: true,
    expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
  });
  if (opts.poison) {
    b.push('STATUS_APPLIED', {
      playerId: opts.poison,
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
  }
  b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
  b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
  return b;
}

describe('threshold (§7, guide §10)', () => {
  it.each([
    [8, 4],
    [7, 4],
    [5, 3],
    [4, 2],
  ])('%i alive needs %i votes', (alive, expected) => {
    const toKill = ROLES.slice(alive).map(([id]) => id);
    expect(threshold(toRulesView(day(toKill).state))).toBe(expected);
  });

  it('shows its working (§8.2)', () => {
    const lines = thresholdDerivation(toRulesView(day(['p8']).state));
    expect(lines[0]?.detail).toMatch(/ceil\(7 alive \/ 2\)/);
    expect(lines.at(-1)?.detail).toMatch(/-> 4$/);
  });
});

describe('voteOrder (§7)', () => {
  it('starts clockwise from the nominee\'s left and wraps', () => {
    const order = voteOrder(toRulesView(day().state), 'p6').map((p) => p.id);
    expect(order).toEqual(['p7', 'p8', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  });

  it('includes the dead, who may still spend a ghost vote (guide §12)', () => {
    const order = voteOrder(toRulesView(day(['p7']).state), 'p6').map((p) => p.id);
    expect(order).toContain('p7');
  });
});

describe('nominationIssues — advisory, never blocking (§4.8, §7)', () => {
  it('accepts a clean nomination', () => {
    expect(nominationIssues(day().state, 'p4', 'p1')).toEqual([]);
  });

  it('flags a dead nominator as integrity', () => {
    const issues = nominationIssues(day(['p4']).state, 'p4', 'p1');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ class: 'integrity', rule: 'nominator_dead' });
  });

  it('flags a dead nominee as integrity', () => {
    expect(nominationIssues(day(['p1']).state, 'p4', 'p1')[0]).toMatchObject({
      class: 'integrity',
      rule: 'nominee_dead',
    });
  });

  it('flags self-nomination as integrity', () => {
    expect(nominationIssues(day().state, 'p4', 'p4')[0]).toMatchObject({
      class: 'integrity',
      rule: 'self_nomination',
    });
  });

  it('flags a second nomination by the same nominator as social', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    expect(nominationIssues(b.state, 'p4', 'p2')[0]).toMatchObject({
      class: 'social',
      rule: 'nominator_already_nominated',
    });
  });

  it('flags a second nomination against the same nominee as social', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    expect(nominationIssues(b.state, 'p5', 'p1')[0]).toMatchObject({
      class: 'social',
      rule: 'nominee_already_nominated',
    });
  });

  it('does not carry yesterday\'s nominations into today', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    b.push('DAY_CLOSED', {});
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    expect(nominationIssues(b.state, 'p4', 'p1')).toEqual([]);
  });
});

describe('voteIssues — the Butler ruling (§7, §16.3)', () => {
  it('flags a Butler voting without their Master as social, and the vote still counts', () => {
    const b = withButlerMaster('p5');
    const issues = voteIssues(b.state, 'n1', 'p3');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ class: 'social', rule: 'butler_without_master' });
    // The critical part: the vote is recorded and counted (§16.3).
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' });
    expect(tallyFor(b.state.nominations[0]!)).toBe(1);
  });

  it('does not flag a Butler who votes after their Master', () => {
    const b = withButlerMaster('p5');
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p5' });
    expect(voteIssues(b.state, 'n1', 'p3')).toEqual([]);
  });

  it('does not flag a poisoned Butler — their vote always counts', () => {
    const b = withButlerMaster('p5', { poison: 'p3' });
    expect(voteIssues(b.state, 'n1', 'p3')).toEqual([]);
  });

  it('does not restrict a dead Butler\'s ghost vote (§4.2, guide §12)', () => {
    const b = withButlerMaster('p5');
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'butler', cause: 'demon' });
    expect(voteIssues(b.state, 'n1', 'p3')).toEqual([]);
  });

  it('clears the violation once the Master votes, whatever the order (guide §10)', () => {
    const b = withButlerMaster('p5');
    // The Butler's hand goes up first. Live warning fires...
    expect(voteIssues(b.state, 'n1', 'p3').some((i) => i.rule === 'butler_without_master')).toBe(true);
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' });
    expect(butlerViolations(b.state, 'n1')).toEqual(['p3']);
    // ...and is retroactively satisfied when the Master's hand goes up.
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p5' });
    expect(butlerViolations(b.state, 'n1')).toEqual([]);
    // Both votes count throughout (§16.3).
    expect(tallyFor(b.state.nominations[0]!)).toBe(2);
  });

  it('reports a violation when the Master never votes', () => {
    const b = withButlerMaster('p5');
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' });
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p4' });
    expect(butlerViolations(b.state, 'n1')).toEqual(['p3']);
  });

  it('does not report a poisoned Butler, whose vote always counts', () => {
    const b = withButlerMaster('p5', { poison: 'p3' });
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' });
    expect(butlerViolations(b.state, 'n1')).toEqual([]);
  });

  // FIX 4a — the case the Master mark's lifetime makes reachable and nothing
  // covered: the mark is applied on night N and expires at the END of day N, so
  // a Butler who dies DURING day N (a Virgin trigger, a Slayer shot) still
  // carries a live mark when they spend their ghost vote that same day. Without
  // the exemption the vote lands in `butlerVotesFlagged` on the permanent
  // record, which §4.2 names as a thing the previous version got wrong.
  //
  // The existing sibling above covers `voteIssues` with a Butler who dies before
  // voting at all; this is the `butlerViolations` half, over a finished vote set
  // that actually contains the ghost vote. Redden by: deleting the
  // `if (!abilityFunctional(view, player)) return null;` line in
  // `restrictedButlerMaster`.
  it("does not report a Butler who dies during the day and then ghost-votes (§4.2, §7)", () => {
    const b = withButlerMaster('p5');
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'butler', cause: 'execution', executionKind: 'virgin' });
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' });
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p4' });
    // The mark is still live — this is not vacuous because the Master expired.
    expect(masterOf(toRulesView(b.state), 'p3')?.id).toBe('p5');
    expect(b.state.players.find((p) => p.id === 'p3')?.alive).toBe(false);
    // ...and p5, the Master, never voted.
    expect(butlerViolations(b.state, 'n1')).toEqual([]);
    expect(voteIssues(b.state, 'n1', 'p3').filter((i) => i.rule === 'butler_without_master')).toEqual([]);
  });

  it('ignores an expired Master mark from a previous night', () => {
    const b = withButlerMaster('p5');
    b.push('DAY_CLOSED', {});
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    b.push('NOMINATION_OPENED', { id: 'n2', nominatorId: 'p4', nomineeId: 'p1' });
    b.push('VOTE_CAST', { nominationId: 'n2', voterId: 'p3' });
    expect(voteIssues(b.state, 'n2', 'p3').filter((i) => i.rule === 'butler_without_master')).toEqual([]);
    expect(butlerViolations(b.state, 'n2')).toEqual([]);
  });
});

describe('voteIssues — dead votes (§7, guide §12)', () => {
  it('does not flag a dead player\'s first vote', () => {
    const b = day(['p7']);
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    expect(voteIssues(b.state, 'n1', 'p7')).toEqual([]);
  });

  it('flags a second dead vote as social, and counts it', () => {
    const b = day(['p7']);
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p7' });
    b.push('NOMINATION_OPENED', { id: 'n2', nominatorId: 'p5', nomineeId: 'p2' });
    expect(voteIssues(b.state, 'n2', 'p7')[0]).toMatchObject({
      class: 'social',
      rule: 'dead_vote_already_spent',
    });
    b.push('VOTE_CAST', { nominationId: 'n2', voterId: 'p7' });
    expect(tallyFor(b.state.nominations[1]!)).toBe(1);
  });

  it('flags a duplicate vote on the same nomination as integrity', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p5' });
    expect(voteIssues(b.state, 'n1', 'p5')[0]).toMatchObject({
      class: 'integrity',
      rule: 'duplicate_vote',
    });
    // The integrity class produces no derived state change (§4.8).
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p5' });
    expect(tallyFor(b.state.nominations[0]!)).toBe(1);
  });
});

describe('voteIssues — a vote after the nomination has closed (§4.8)', () => {
  it('flags it as social, and counts it anyway', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    b.push('NOMINATION_CLOSED', { id: 'n1', auditTally: 0, auditThreshold: 4, butlerVotesFlagged: [] });
    expect(voteIssues(b.state, 'n1', 'p5')[0]).toMatchObject({
      class: 'social',
      rule: 'vote_after_close',
    });
    // §4.8 — the app never silently alters a tally. The vote lands anyway.
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p5' });
    expect(tallyFor(b.state.nominations[0]!)).toBe(1);
  });
});

describe('todaysNominations (§7)', () => {
  it(
    'is empty at night, even though night N shares its phase number with the day that follows',
    () => {
      const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
      // Pushed directly into the log for the test's sake — in play this only
      // happens by day — so it carries `day: 1`, same as tonight's phase number.
      b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
      expect(todaysNominations(b.state)).toEqual([]);
    },
  );
});

describe('nominationsOnDay (the Undertaker\'s read, §7)', () => {
  it('is readable on a later day, unlike todaysNominations', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    b.push('DAY_CLOSED', {});
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    expect(nominationsOnDay(b.state, 1).map((n) => n.id)).toEqual(['n1']);
    expect(todaysNominations(b.state)).toEqual([]);
  });
});

describe('resolveDayExecution (§7, §16.8)', () => {
  function vote(b: LogBuilder, nominationId: string, voters: string[]): LogBuilder {
    for (const voterId of voters) b.push('VOTE_CAST', { nominationId, voterId });
    return b;
  }

  it('executes nobody when no nomination met the threshold', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    vote(b, 'n1', ['p4', 'p5']);
    const result = resolveDayExecution(b.state);
    expect(result.playerId).toBeNull();
    expect(result.reason).toMatch(/threshold/i);
  });

  it('executes the unique highest tally that met the threshold', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    vote(b, 'n1', ['p4', 'p5', 'p6', 'p7']);
    b.push('NOMINATION_OPENED', { id: 'n2', nominatorId: 'p5', nomineeId: 'p2' });
    vote(b, 'n2', ['p5', 'p6', 'p7', 'p8', 'p1']);
    const result = resolveDayExecution(b.state);
    expect(result.playerId).toBe('p2');
    expect(result.derivation.map((d) => d.detail).join(' ')).toMatch(/5/);
  });

  it('executes nobody on a tie at the top', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    vote(b, 'n1', ['p4', 'p5', 'p6', 'p7']);
    b.push('NOMINATION_OPENED', { id: 'n2', nominatorId: 'p5', nomineeId: 'p2' });
    vote(b, 'n2', ['p5', 'p6', 'p7', 'p8']);
    const result = resolveDayExecution(b.state);
    expect(result.playerId).toBeNull();
    expect(result.reason).toMatch(/tie/i);
  });

  it('executes nobody on a day with no nominations, so the Mayor win is reachable (§7)', () => {
    const result = resolveDayExecution(day().state);
    expect(result.playerId).toBeNull();
    expect(result.reason).toMatch(/no nominations/i);
  });

  it('counts an invalid Butler vote toward the tally that decides the execution', () => {
    const b = withButlerMaster('p5');
    // Three clean votes plus the Butler's invalid one clears the threshold of 4.
    vote(b, 'n1', ['p4', 'p6', 'p7', 'p3']);
    const result = resolveDayExecution(b.state);
    expect(result.playerId).toBe('p1');
  });
});

describe('resolveDayExecution — the threshold is per nomination (guide §10)', () => {
  it('judges each nomination against the threshold it was voted under', () => {
    // 8 alive: threshold 4. Nomination A gets 3 votes and closes, failing.
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    for (const v of ['p4', 'p5', 'p6']) b.push('VOTE_CAST', { nominationId: 'n1', voterId: v });
    b.push('NOMINATION_CLOSED', { id: 'n1', auditTally: 3, auditThreshold: 4, butlerVotesFlagged: [] });

    // Two players then die during the day, dropping the live threshold to 3.
    b.push('DEATH', { playerId: 'p7', characterIdAtDeath: 'soldier', cause: 'slayer' });
    b.push('DEATH', { playerId: 'p8', characterIdAtDeath: 'virgin', cause: 'execution', executionKind: 'virgin' });

    // A must NOT retroactively qualify: nobody voted it through at 3.
    const result = resolveDayExecution(b.state);
    expect(result.playerId).toBeNull();
    expect(result.derivation.map((d) => d.detail).join(' ')).toMatch(/threshold of 4/);
  });

  it('never executes a nominee who is already dead', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    for (const v of ['p4', 'p5', 'p6', 'p7']) b.push('VOTE_CAST', { nominationId: 'n1', voterId: v });
    b.push('NOMINATION_CLOSED', { id: 'n1', auditTally: 4, auditThreshold: 4, butlerVotesFlagged: [] });
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'slayer' });
    const result = resolveDayExecution(b.state);
    expect(result.playerId).toBeNull();
    expect(result.derivation.map((d) => d.detail).join(' ')).toMatch(/already dead/);
  });
});
