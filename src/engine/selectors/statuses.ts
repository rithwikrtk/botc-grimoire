import { isStatusActive } from '../phase';
import type { Phase, PlayerId, RulesView, RulesViewPlayer, StatusEntry, StatusName } from '../types';

/**
 * §3.7 — poisoned and friends are selectors over statusLedger, not stored flags.
 */
export function activeStatuses(
  player: Pick<RulesViewPlayer, 'statusLedger'>,
  now: Phase,
): StatusEntry[] {
  return player.statusLedger.filter((status) => isStatusActive(status, now));
}

/**
 * Returns true only for a status whose source ability actually worked. §3.6 stores
 * `effective: false` when the source was drunk or poisoned, so the reminder token
 * is placed (as the physical Storyteller does) without the effect being real.
 */
function hasEffectiveStatus(
  player: Pick<RulesViewPlayer, 'statusLedger'>,
  now: Phase,
  status: StatusName,
): boolean {
  return activeStatuses(player, now).some((s) => s.status === status && s.effective);
}

export function isPoisoned(player: Pick<RulesViewPlayer, 'statusLedger'>, now: Phase): boolean {
  return hasEffectiveStatus(player, now, 'poisoned');
}

/** §4.5 — "protected by a functional Monk". Effectiveness was frozen at application. */
export function isProtected(player: Pick<RulesViewPlayer, 'statusLedger'>, now: Phase): boolean {
  return hasEffectiveStatus(player, now, 'protected');
}

export function isRedHerring(view: RulesView, playerId: PlayerId): boolean {
  return view.redHerringPlayerId === playerId;
}

/**
 * The player this Butler chose as their Master. The mark sits on the CHOSEN
 * player with sourcePlayerId set to the Butler (§4.4).
 */
export function masterOf(view: RulesView, butlerId: PlayerId): RulesViewPlayer | null {
  return (
    view.players.find((p) =>
      activeStatuses(p, view.phase).some(
        // `effective` matters here for the same reason it does for poison and
        // protection: the token is on the table but a droisoned Butler's ability
        // did not work, so there is no restriction to violate.
        (s) => s.status === 'master' && s.sourcePlayerId === butlerId && s.effective,
      ),
    ) ?? null
  );
}

/**
 * Every token the Grimoire should render, including ineffective ones — the
 * physical Storyteller does place a poisoned Monk's protection marker (§3.6).
 *
 * Returns a PROJECTION without `effective`, because §10.1 is explicit: "Tokens,
 * never effectiveness. Spy Mode shows that a `protected` marker sits on a player;
 * it never exposes STATUS_APPLIED.effective." Handing the UI a StatusEntry[] from
 * the same module Plan 3's SpyView is built against is the shape most likely to be
 * spread into a Spy component, so the field is unavailable rather than merely
 * unused.
 */
export interface GrimoireToken {
  status: StatusName;
  sourcePlayerId: PlayerId | null;
  expiresAt: Phase | null;
}

export function grimoireTokens(
  player: Pick<RulesViewPlayer, 'statusLedger'>,
  now: Phase,
): GrimoireToken[] {
  return activeStatuses(player, now).map((entry) => ({
    status: entry.status,
    sourcePlayerId: entry.sourcePlayerId,
    expiresAt: entry.expiresAt,
  }));
}
