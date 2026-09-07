import { reduce } from '@/engine/reducer/fold';
import type { GameEvent } from '@/engine/events';
import type { CharacterId, GameState, PlayerId } from '@/engine/types';
import { CHARACTERS } from '@/editions/troubleBrewing/characters';
import type { Team } from '@/editions/troubleBrewing/characters';

export interface BuildGameOptions {
  /** Seat order is the array order. Names are Player 1..N unless given. */
  roles: Array<[PlayerId, CharacterId]>;
  names?: Record<PlayerId, string>;
  demonBluffs?: CharacterId[] | null;
  drunkBelief?: { playerId: PlayerId; believesCharacterId: CharacterId } | null;
  redHerring?: PlayerId | null;
  /** Advance to this phase after the deal. Defaults to night 1. */
  upTo?: { kind: 'night' | 'day'; number: number };
}

export class LogBuilder {
  private seq = 0;
  private tx = 0;
  readonly events: GameEvent[] = [];

  push<T extends GameEvent['type']>(
    type: T,
    payload: Extract<GameEvent, { type: T }>['payload'],
    sameTx = false,
  ): this {
    if (!sameTx) this.tx += 1;
    this.events.push({
      seq: this.seq++,
      txId: `tx${this.tx}`,
      ts: 1_700_000_000_000 + this.seq,
      type,
      payload,
    } as GameEvent);
    return this;
  }

  get state(): GameState {
    return reduce(this.events);
  }
}

/** Advances the log from its current phase to `target`, one PHASE_ADVANCED at a time. */
export function advanceTo(
  builder: LogBuilder,
  target: { kind: 'night' | 'day'; number: number },
): LogBuilder {
  let current = builder.state.phase;
  while (current.kind !== target.kind || current.number !== target.number) {
    const next: { kind: 'night' | 'day'; number: number } =
      current.kind === 'night'
        ? { kind: 'day', number: current.number }
        : { kind: 'night', number: current.number + 1 };
    // Checked BEFORE pushing: an unreachable target must throw with the log
    // untouched, not after already emitting up to three spurious PHASE_ADVANCED
    // events into it.
    if (next.number > target.number + 1) {
      throw new Error(`advanceTo overshot ${target.kind} ${target.number}`);
    }
    current = next;
    builder.push('PHASE_ADVANCED', { phase: current.kind, number: current.number });
  }
  return builder;
}

export function buildGame(options: BuildGameOptions): LogBuilder {
  const { roles, names = {}, demonBluffs = null, drunkBelief = null, redHerring = null } = options;
  const builder = new LogBuilder();

  builder.push('GAME_CREATED', {
    edition: { id: 'troubleBrewing', version: '1' },
    players: roles.map(([id], seat) => ({ id, name: names[id] ?? `Player ${seat + 1}`, seat })),
  });

  const counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  const assignments: Record<PlayerId, CharacterId> = {};
  for (const [id, characterId] of roles) assignments[id] = characterId;

  builder.push('ROLES_ASSIGNED', {
    assignments,
    // Counted by the caller's roles, so a fixture never disagrees with itself.
    distribution: roles.reduce((acc, [, characterId]) => {
      const team = teamOf(characterId);
      return { ...acc, [team]: acc[team] + 1 };
    }, counts),
    setupModifiers: [],
    demonBluffs,
    drunkBelief,
    redHerring,
  });

  builder.push('PHASE_ADVANCED', { phase: 'night', number: 1 });
  if (options.upTo) advanceTo(builder, options.upTo);
  return builder;
}

const TEAM_KEYS: Record<string, Team> = Object.fromEntries(
  Object.values(CHARACTERS).map((c) => [c.id, c.team]),
);

function teamOf(characterId: CharacterId): Team {
  const team = TEAM_KEYS[characterId];
  if (!team) throw new Error(`Fixture used unknown character ${characterId}`);
  return team;
}
