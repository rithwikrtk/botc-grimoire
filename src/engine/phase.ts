import type { Phase, StatusEntry } from './types';

/**
 * §4.4. Phases alternate night 1 -> day 1 -> night 2 -> day 2. Day N FOLLOWS
 * night N, so a night sorts before the day of the same number.
 */
export function phaseOrdinal(phase: Phase): number {
  return phase.number * 2 + (phase.kind === 'night' ? 0 : 1);
}

export function comparePhases(a: Phase, b: Phase): number {
  return phaseOrdinal(a) - phaseOrdinal(b);
}

export function nextPhase(phase: Phase): Phase {
  return phase.kind === 'night'
    ? { kind: 'day', number: phase.number }
    : { kind: 'night', number: phase.number + 1 };
}

/**
 * §4.4. The comparison is INCLUSIVE on both ends. A status expiring "end of night
 * N" is active throughout night N — the Monk's protection has to survive until the
 * Imp step later that same night — and is gone by day N.
 *
 * Deliberately independent of whether the source player is still alive: a Poisoner
 * executed on day 3 must not leave their victim poisoned forever, and must not have
 * that day's poison cancelled early either.
 */
export function isStatusActive(status: StatusEntry, now: Phase): boolean {
  if (comparePhases(now, status.appliedAt) < 0) return false;
  if (status.expiresAt === null) return true;
  return phaseOrdinal(now) <= phaseOrdinal(status.expiresAt);
}

/** The declarative lifetimes of §4.4, resolved against the phase of application. */
export type StatusLifetime = 'until_dawn' | 'tonight_and_tomorrow' | 'permanent';

export function expiryFor(lifetime: StatusLifetime, appliedAt: Phase): Phase | null {
  switch (lifetime) {
    // Monk: applied night N, expires end of night N.
    case 'until_dawn':
      return { kind: 'night', number: appliedAt.number };
    // Poisoner, Butler: applied night N, expires end of day N.
    case 'tonight_and_tomorrow':
      return { kind: 'day', number: appliedAt.number };
    case 'permanent':
      return null;
  }
}
