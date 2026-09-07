# BOTC Storyteller — Slice 1, Plan 1 of 3: Rules Engine (headless)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete headless Trouble Brewing rules engine — event log, pure reducer, edition data, night cursor, information resolvers with derivations, kill/death/victory resolution, day-phase vote math, and transactional undo — verified by property tests and a scripted full game, with no UI.

**Architecture:** `state = events.reduce(applyEvent, initialState)`. A command layer above the reducer resolves every random draw and every Storyteller choice *before* creating events, stamps `ts`/`txId`/`seq`, appends, and runs `checkVictory` exactly once at commit. All Trouble Brewing data (characters, night order, distribution, registration, resolvers) lives under `src/editions/troubleBrewing/`; the engine imports it through one barrel. Derived facts (`poisoned`, `alive`, tallies, `nextStep`) are selectors over the folded state, never stored flags.

**Tech Stack:** TypeScript 5.9 (strict), Vite 7, Vitest 3 (two projects — one purity-scoped), fast-check 4 for property tests, ESLint 9 flat config. No React in this plan; no runtime dependencies at all in the engine.

**Status:** v2 — revised after a three-lens adversarial review (correctness, feasibility, coverage) that found four criticals and sixteen majors. §17 of the spec is the equivalent log for the spec itself; the deviations list and the three closed gaps near the end of this document record what changed and why.

**Spec:** `docs/superpowers/specs/2026-09-07-botc-storyteller-app-design.md` — read §3, §4, §5, §6, §7, §14, §16 before starting. Every task below cites the sections it implements. **Where this plan and the spec disagree, the spec wins and the disagreement is a bug in this plan** — with two deliberate, flagged exceptions, both in Task 3.

**Plans 2 and 3 (do not build here):** Plan 2 is the UI (setup screens, Grimoire, night/day screens, Reference, theme, panic blank). Plan 3 is durability and Spy Mode (persistence, PWA, export/import, tab lease, `SpyView`, canary test). This plan must leave clean seams for both: the engine exports pure selectors and a command store, and touches neither `window` nor the DOM.

---

## Global Constraints

Exact values, copied from the spec. Every task's requirements implicitly include this section.

- **Edition scope: Trouble Brewing only.** Do **not** build an edition abstraction layer. Edition *data* is isolated in `src/editions/troubleBrewing/`; the engine is explicitly **not** claimed to be edition-agnostic (§3.8). Engine code naming a Trouble Brewing character or concept is expected and allowed.
- **The reducer is pure.** No `Math.random()`, no `Date.now()`, no `new Date()`, no `performance.now()`, no `crypto.*` inside `applyEvent` or anything it calls (§3.3).
- **Event envelope is exactly** `{ seq, txId, ts, type, payload }`. `seq` is the array index — there is no separate `id`. No `night`/`day` on the envelope; both derive from the last `PHASE_ADVANCED` (§3.2).
- **One Storyteller action = one transaction**, however many events it emits. Undo drops every event sharing the last `txId` (§3.2, §3.4).
- **`SPY_VIEWED` / `SPY_VIEW_ENDED` are non-undoable** — they are an audit trail (§3.4).
- **Edit-and-replay and `EVENT_CORRECTED` do not exist.** Corrections are compensating events (§3.4).
- **`perceivedCharacterId` may be consulted only by `wakes()` and by step/UI rendering.** Every rules predicate reads the **true** `characterId` (§4.1). Enforced by ESLint in Task 6.
- **`requiresAlive` lives on the character, never on the step** (§4.2, §6.2).
- **Status expiry is inclusive:** `phaseOrdinal(now) <= phaseOrdinal(expiresAt)`. Phases alternate `night 1 → day 1 → night 2 → day 2 → …`; **day N follows night N** (§4.4).
- **`settledStepIds` keys are night-scoped strings:** `` `${phase.number}:${stepId}:${grouping === 'group' ? 'GROUP' : actorId}` `` (§3.7, §6.1).
- **`checkVictory` runs exactly once per transaction, at commit** — never per event, never inside `applyEvent` (§4.7).
- **Advisory enforcement:** the app never blocks a rule break and never silently alters a tally. Target constraints are **soft** — off-constraint picks are selectable and emit `RULE_FLAGGED` in the same transaction (§4.8).
- **An invalid Butler vote counts toward the tally** (§7, §16.3).
- **Deleted deliberately — do not reintroduce:** a seeded PRNG, a CI grep gate on character names, a per-character test-file CI gate, a full-game Playwright E2E (§3.3, §3.8, §14).
- **No mid-game roster or seating changes.** No add, no remove, no reseat. Only `PLAYER_RENAMED` survives (§18).
- **Node 20+ / npm.** Repo is public: no secrets, and no real player names in fixtures.
- **Commit after every task.** Do **not** push, and do **not** commit outside a task's Commit step, unless Rithwik asks. Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

Created by this plan. Files that change together live together; the edition folder is the only place Trouble Brewing *data* appears.

```
package.json                              npm scripts, deps
tsconfig.json                             strict TS, no emit
vite.config.ts                            minimal — Plan 2 extends it
vitest.config.ts                          two projects: `app` and `reducer-purity`
eslint.config.js                          flat config; Task 6 adds the perceived-character rule

src/engine/
  types.ts            GameState, Player, Phase, StatusEntry, RulesView, LegalAnswer, DerivationLine
  events.ts           the discriminated union of the 24 Slice 1 event types
  phase.ts            phaseOrdinal, nextPhase, isStatusActive
  reducer/
    purity.setup.ts   Vitest setup that makes impurity throw (§3.3)
    applyEvent.ts     the single write path — one case per event type
    fold.ts           reduce, applyMany (the store owns the incremental cache)
  selectors/
    players.ts        alive, perceivedCharacterId, playersWithPerceivedCharacter
    statuses.ts       activeStatuses, isPoisoned, isProtected, masterOf, grimoireTokens
    predicates.ts     isDrunk, abilityFunctional
    seating.ts        ring order, aliveNeighbours, adjacentEvilPairs
    rulesView.ts      toRulesView — field by field, no spreads
    nightCursor.ts    stepKey, nextStep, nightOverview
    registrationLedger.ts  priorRulings, registrationInconsistency (§16.6)
    replay.ts         answersAtSeq — legalAnswers is recomputed, never stored (§3.6)
    nominations.ts    todaysNominations, tallyFor, threshold, butlerViolations,
                      resolveDayExecution
    victory.ts        checkVictory
  rules/
    demonKill.ts      resolveDemonKill (§4.5)
    demonDeath.ts     onDemonDeath (§4.6)
    virgin.ts         evaluateVirgin (§7, §16.10)
    slayer.ts         evaluateSlayer (§7, §16.12)
  setup/
    deal.ts           legal deal, Baron modifiers, bluffs, Drunk belief, red herring (§5)
  commands/
    store.ts          createStore: transaction, commit, undo, subscribe
    setupCommands.ts  createGame, renamePlayer, assignRoles
    nightCommands.ts  candidatesForCurrentStep, resolveStep, skipStep,
                      autoSkipUnmetSteps, resolveImpStep, advanceToDay
    dayCommands.ts    nominate, castVote, closeNomination, closeDay, beginNight,
                      endGame, claimSlayer, applyVirgin
    correctionCommands.ts  addNote, clearStatus, changeRole, recordDeath (§3.4)

src/editions/troubleBrewing/
  characters.ts       all 22 characters with capability flags and setup modifiers
  distribution.ts     the 5–15 player-count chart
  registration.ts     Recluse / Spy registration options
  stepIds.ts          the frozen step-id list — part of the replay contract
  nightOrder.ts       FIRST_NIGHT and OTHER_NIGHTS step definitions
  resolvers.ts        computeCandidates for every information step, with derivations
  victory.ts          the four win predicates in precedence order
  index.ts            the barrel the engine imports

test/
  helpers/game.ts     fixture builders — buildGame, seat, kill, poison, advanceTo
  helpers/reference.ts naive, separately-written Chef and Empath reference impls
```

---

### Task 1: Project scaffold with the purity-scoped test project

Sets up the repo from nothing and proves the §3.3 purity guard actually fires — the one piece of scaffolding that is itself a rules defence, so it gets a test.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.gitignore` (modify)
- Create: `src/engine/reducer/purity.setup.ts`
- Test: `src/engine/reducer/purity.guard.test.ts`, `src/engine/purity-scope.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test`, `npm run typecheck`, `npm run lint`. The Vitest project named `reducer-purity` runs every `*.test.ts` under `src/engine/reducer/` with impurity stubbed to throw; the project named `app` runs everything else with globals intact.

- [ ] **Step 1: Initialise the repo files**

`package.json`. No `dev`/`build`/`preview` scripts: there is no `index.html` and no entry module in this plan, so `vite build` would fail with "Could not resolve entry module". Plan 2 adds them with the UI.

```json
{
  "name": "botc-grimoire",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "@types/node": "^22.9.0",
    "eslint": "^9.15.0",
    "fast-check": "^4.1.1",
    "typescript": "^5.9.2",
    "typescript-eslint": "^8.15.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "test", "*.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

`vitest.config.ts` — two projects. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on because the reducer indexes arrays constantly and the event payloads use optional fields; both would otherwise hide real bugs.

```ts
import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  test: {
    // No root-level options here: with `projects` set, Vitest resolves test
    // options per project and root ones do not propagate.
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'app',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          // Extends the defaults rather than replacing them, so node_modules and
          // dist stay excluded.
          exclude: [...configDefaults.exclude, 'src/engine/reducer/**'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'reducer-purity',
          globals: true,
          environment: 'node',
          include: ['src/engine/reducer/**/*.test.ts'],
          setupFiles: ['./src/engine/reducer/purity.setup.ts'],
        },
      },
    ],
  },
});
```

`eslint.config.js` — base only; Task 6 adds the perceived-character restriction.

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
```

Append to `.gitignore`:

```
node_modules/
dist/
coverage/
```

- [ ] **Step 2: Write the purity setup file**

`src/engine/reducer/purity.setup.ts`. Stubs are installed per-test and torn down after, so Vitest's own timing calls outside the hook window are unaffected — the spec calls for a *scoped* guard precisely because a global one breaks fake timers and date formatting.

```ts
import { afterEach, beforeEach } from 'vitest';

function boom(name: string): never {
  throw new Error(
    `Reducer purity violation: ${name} was called. Spec §3.3 — all randomness and ` +
      `every Storyteller choice must be resolved before the event is created and ` +
      `stored as literal data on it.`,
  );
}

const RealDate = globalThis.Date;
const realRandom = Math.random;
const realPerfNow = globalThis.performance.now;

/** Assigns through a possibly non-writable property descriptor. Returns a restore fn. */
function override<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): () => void {
  const prior = Object.getOwnPropertyDescriptor(obj, key);
  try {
    Object.defineProperty(obj, key, { value, writable: true, configurable: true });
  } catch {
    return () => undefined;
  }
  return () => {
    if (prior) Object.defineProperty(obj, key, prior);
    else delete (obj as Record<PropertyKey, unknown>)[key as PropertyKey];
  };
}

let restores: Array<() => void> = [];

beforeEach(() => {
  const DateTrap = new Proxy(RealDate, {
    construct: () => boom('new Date()'),
    apply: () => boom('Date()'),
    get(target, prop, receiver) {
      if (prop === 'now') return () => boom('Date.now()');
      return Reflect.get(target, prop, receiver);
    },
  }) as DateConstructor;

  restores = [
    override(globalThis, 'Date', DateTrap),
    override(Math, 'random', (() => boom('Math.random()')) as typeof Math.random),
    override(globalThis.performance, 'now', (() => boom('performance.now()')) as () => number),
  ];

  if (globalThis.crypto) {
    restores.push(
      override(globalThis.crypto, 'getRandomValues', (() =>
        boom('crypto.getRandomValues()')) as Crypto['getRandomValues']),
    );
    if ('randomUUID' in globalThis.crypto) {
      restores.push(
        override(globalThis.crypto, 'randomUUID', (() =>
          boom('crypto.randomUUID()')) as Crypto['randomUUID']),
      );
    }
  }
});

afterEach(() => {
  for (const restore of restores.reverse()) restore();
  restores = [];
  globalThis.Date = RealDate;
  Math.random = realRandom;
  globalThis.performance.now = realPerfNow;
});
```

- [ ] **Step 3: Write the failing tests**

`src/engine/reducer/purity.guard.test.ts` — runs in the `reducer-purity` project, so the stubs are live:

```ts
import { describe, expect, it } from 'vitest';

describe('purity guard (reducer project)', () => {
  it('throws on Math.random', () => {
    expect(() => Math.random()).toThrow(/purity violation: Math\.random/);
  });

  it('throws on new Date()', () => {
    expect(() => new Date()).toThrow(/purity violation: new Date/);
  });

  it('throws on Date.now()', () => {
    expect(() => Date.now()).toThrow(/purity violation: Date\.now/);
  });

  it('throws on performance.now()', () => {
    expect(() => performance.now()).toThrow(/purity violation: performance\.now/);
  });

  it('leaves non-clock Date statics reachable', () => {
    expect(typeof Date.UTC).toBe('function');
  });
});
```

`src/engine/purity-scope.test.ts` — runs in the `app` project, and proves the guard is scoped rather than global. Without this test a future change to `vitest.config.ts` could stub globally and nothing would notice until fake timers broke:

```ts
import { describe, expect, it } from 'vitest';

describe('purity guard scope', () => {
  it('does not stub globals outside the reducer project', () => {
    expect(typeof Math.random()).toBe('number');
    expect(Number.isFinite(Date.now())).toBe(true);
    expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 4: Install and run**

Run: `npm install && npm test`
Expected: 6 tests pass across both projects. Output names both projects (`app`, `reducer-purity`).

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: scaffold project with purity-scoped test project

Vite + TypeScript strict + Vitest with two projects. The reducer project
stubs Math.random, Date, performance.now and crypto to throw, per spec §3.3,
scoped rather than global so fake timers and date formatting still work
everywhere else. A second test asserts that scoping.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Trouble Brewing character and distribution data

The capability flags here are what stop the two worst v2 bugs (§4.2): `requiresAlive: false` on the Ravenkeeper and the Saint, and `falseSelfBelief` on the Drunk.

**Files:**
- Create: `src/editions/troubleBrewing/characters.ts`
- Create: `src/editions/troubleBrewing/distribution.ts`
- Create: `src/editions/troubleBrewing/registration.ts`
- Test: `src/editions/troubleBrewing/characters.test.ts`, `src/editions/troubleBrewing/distribution.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon'`
  - `type Alignment = 'good' | 'evil'`
  - `interface TeamCounts { townsfolk: number; outsider: number; minion: number; demon: number }`
  - `interface RegistrationOption { alignment: Alignment; team: Team }`
  - `interface Character { id: string; name: string; team: Team; abilityText: string; requiresAlive: boolean; falseSelfBelief: boolean; registration: readonly RegistrationOption[]; setupModifiers: Partial<TeamCounts> | null }`
  - `CHARACTERS: Readonly<Record<string, Character>>`, `characterById(id): Character` (throws on unknown), `charactersByTeam(team): Character[]`
  - `DISTRIBUTION: Readonly<Record<number, TeamCounts>>`, `distributionFor(playerCount): TeamCounts` (throws outside 5–15)
  - `registrationOptions(character): readonly RegistrationOption[]` — the character's own true option first

- [ ] **Step 1: Write the failing tests**

`src/editions/troubleBrewing/characters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById, charactersByTeam } from './characters';

describe('Trouble Brewing character list', () => {
  it('has the official 13/4/4/1 roster', () => {
    expect(charactersByTeam('townsfolk')).toHaveLength(13);
    expect(charactersByTeam('outsider')).toHaveLength(4);
    expect(charactersByTeam('minion')).toHaveLength(4);
    expect(charactersByTeam('demon')).toHaveLength(1);
    expect(Object.keys(CHARACTERS)).toHaveLength(22);
  });

  it('keys every record by its own id', () => {
    for (const [key, character] of Object.entries(CHARACTERS)) {
      expect(character.id).toBe(key);
    }
  });

  // §4.2 — the v2 bug. Their abilities fire because they are dead / dying.
  it('marks the Ravenkeeper and the Saint as not requiring life', () => {
    expect(characterById('ravenkeeper').requiresAlive).toBe(false);
    expect(characterById('saint').requiresAlive).toBe(false);
  });

  it('requires life for every other character', () => {
    const exempt = new Set(['ravenkeeper', 'saint']);
    for (const character of Object.values(CHARACTERS)) {
      if (!exempt.has(character.id)) expect(character.requiresAlive).toBe(true);
    }
  });

  // §4.1 — only the Drunk carries a false self-belief in Trouble Brewing.
  it('gives falseSelfBelief to the Drunk alone', () => {
    const believers = Object.values(CHARACTERS).filter((c) => c.falseSelfBelief);
    expect(believers.map((c) => c.id)).toEqual(['drunk']);
  });

  // §5.2, guide §2 — the Baron is the only setup modifier in the edition.
  it('gives the Baron +2 outsiders and -2 townsfolk and nobody else a modifier', () => {
    expect(characterById('baron').setupModifiers).toEqual({ townsfolk: -2, outsider: 2 });
    const modified = Object.values(CHARACTERS).filter((c) => c.setupModifiers !== null);
    expect(modified.map((c) => c.id)).toEqual(['baron']);
  });

  it('rejects an unknown character id loudly', () => {
    expect(() => characterById('lunatic')).toThrow(/unknown character/i);
  });
});
```

`src/editions/troubleBrewing/distribution.test.ts` — the ×11 counts from guide §2:

```ts
import { describe, expect, it } from 'vitest';
import { DISTRIBUTION, distributionFor } from './distribution';

const OFFICIAL: Array<[number, number, number, number, number]> = [
  // players, townsfolk, outsiders, minions, demons
  [5, 3, 0, 1, 1],
  [6, 3, 1, 1, 1],
  [7, 5, 0, 1, 1],
  [8, 5, 1, 1, 1],
  [9, 5, 2, 1, 1],
  [10, 7, 0, 2, 1],
  [11, 7, 1, 2, 1],
  [12, 7, 2, 2, 1],
  [13, 9, 0, 3, 1],
  [14, 9, 1, 3, 1],
  [15, 9, 2, 3, 1],
];

describe('player-count distribution chart', () => {
  it.each(OFFICIAL)(
    '%i players -> %i townsfolk, %i outsiders, %i minions, %i demons',
    (players, townsfolk, outsider, minion, demon) => {
      expect(distributionFor(players)).toEqual({ townsfolk, outsider, minion, demon });
    },
  );

  it.each(OFFICIAL)('%i players sums to the player count', (players) => {
    const d = distributionFor(players);
    expect(d.townsfolk + d.outsider + d.minion + d.demon).toBe(players);
  });

  it('covers exactly 5 to 15 and nothing else', () => {
    expect(Object.keys(DISTRIBUTION).map(Number).sort((a, b) => a - b)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(() => distributionFor(4)).toThrow(/between 5 and 15/);
    expect(() => distributionFor(16)).toThrow(/between 5 and 15/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/editions/troubleBrewing`
Expected: FAIL — `Cannot find module './characters'`.

- [ ] **Step 3: Write the character data**

`src/editions/troubleBrewing/characters.ts`. Ability text is verbatim from guide §1 so the Reference screen in Plan 2 can render it without a second source.

```ts
export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export type Alignment = 'good' | 'evil';

export interface TeamCounts {
  townsfolk: number;
  outsider: number;
  minion: number;
  demon: number;
}

export interface RegistrationOption {
  alignment: Alignment;
  team: Team;
}

export interface Character {
  id: string;
  name: string;
  team: Team;
  abilityText: string;
  /**
   * Whether the ability needs the holder alive. §4.2 — false for the Ravenkeeper
   * (their ability fires because they died) and the Saint (their win check happens
   * after their death). Never duplicated onto a night step (§6.2).
   */
  requiresAlive: boolean;
  /** The holder believes they are a different character (§4.1). Drunk only. */
  falseSelfBelief: boolean;
  /**
   * How this character may register to detection abilities, true option first.
   * Empty means it registers only as its own team and alignment. Registration is a
   * passive property and is NOT gated by abilityFunctional (§4.2).
   */
  registration: readonly RegistrationOption[];
  /** Team deltas applied after Minions are drawn (§5.2). Baron only. */
  setupModifiers: Partial<TeamCounts> | null;
}

const GOOD_TOWNSFOLK: RegistrationOption[] = [{ alignment: 'good', team: 'townsfolk' }];
const GOOD_OUTSIDER: RegistrationOption[] = [{ alignment: 'good', team: 'outsider' }];
const EVIL_MINION: RegistrationOption[] = [{ alignment: 'evil', team: 'minion' }];
const EVIL_DEMON: RegistrationOption[] = [{ alignment: 'evil', team: 'demon' }];

function character(
  id: string,
  name: string,
  team: Team,
  abilityText: string,
  overrides: Partial<Pick<Character, 'requiresAlive' | 'falseSelfBelief' | 'registration' | 'setupModifiers'>> = {},
): Character {
  const base: Record<Team, readonly RegistrationOption[]> = {
    townsfolk: GOOD_TOWNSFOLK,
    outsider: GOOD_OUTSIDER,
    minion: EVIL_MINION,
    demon: EVIL_DEMON,
  };
  return {
    id,
    name,
    team,
    abilityText,
    requiresAlive: overrides.requiresAlive ?? true,
    falseSelfBelief: overrides.falseSelfBelief ?? false,
    registration: overrides.registration ?? base[team],
    setupModifiers: overrides.setupModifiers ?? null,
  };
}

const LIST: readonly Character[] = [
  // ---- Townsfolk (13) ----
  character('washerwoman', 'Washerwoman', 'townsfolk',
    'You start knowing that 1 of 2 players is a particular Townsfolk.'),
  character('librarian', 'Librarian', 'townsfolk',
    'You start knowing that 1 of 2 players is a particular Outsider (or that zero are in play).'),
  character('investigator', 'Investigator', 'townsfolk',
    'You start knowing that 1 of 2 players is a particular Minion.'),
  character('chef', 'Chef', 'townsfolk',
    'You start knowing how many pairs of evil players there are.'),
  character('empath', 'Empath', 'townsfolk',
    'Each night, you learn how many of your 2 alive neighbours are evil.'),
  character('fortune_teller', 'Fortune Teller', 'townsfolk',
    'Each night, choose 2 players: you learn if either is a Demon. There is a good player who registers as a Demon to you.'),
  character('undertaker', 'Undertaker', 'townsfolk',
    'Each night*, you learn which character died by execution today.'),
  character('monk', 'Monk', 'townsfolk',
    'Each night*, choose a player (not yourself): they are safe from the Demon tonight.'),
  character('ravenkeeper', 'Ravenkeeper', 'townsfolk',
    'If you die at night, you are woken to choose a player: you learn their character.',
    { requiresAlive: false }),
  character('virgin', 'Virgin', 'townsfolk',
    'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.'),
  character('slayer', 'Slayer', 'townsfolk',
    'Once per game, during the day, publicly choose a player: if they are the Demon, they die.'),
  character('soldier', 'Soldier', 'townsfolk',
    'You are safe from the Demon.'),
  character('mayor', 'Mayor', 'townsfolk',
    'If only 3 players live and no execution occurs, your team wins. If you die at night, another player might die instead.'),

  // ---- Outsiders (4) ----
  character('butler', 'Butler', 'outsider',
    'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.'),
  character('drunk', 'Drunk', 'outsider',
    'You do not know you are the Drunk. You think you are a Townsfolk character, but you are not — your ability does not work and any info is arbitrary.',
    { falseSelfBelief: true }),
  character('recluse', 'Recluse', 'outsider',
    'You might register as evil, and as a Minion or Demon, even if dead.',
    {
      registration: [
        { alignment: 'good', team: 'outsider' },
        { alignment: 'evil', team: 'minion' },
        { alignment: 'evil', team: 'demon' },
      ],
    }),
  character('saint', 'Saint', 'outsider',
    'If you die by execution, your team loses immediately.',
    { requiresAlive: false }),

  // ---- Minions (4) ----
  character('poisoner', 'Poisoner', 'minion',
    'Each night, choose a player: they are poisoned tonight and tomorrow day.'),
  character('spy', 'Spy', 'minion',
    'Each night, you see the Grimoire. You might register as good, and as a Townsfolk or Outsider, even if dead.',
    {
      registration: [
        { alignment: 'evil', team: 'minion' },
        { alignment: 'good', team: 'townsfolk' },
        { alignment: 'good', team: 'outsider' },
      ],
    }),
  character('scarlet_woman', 'Scarlet Woman', 'minion',
    'If 5+ players are alive and the Demon dies, you become the Demon.'),
  character('baron', 'Baron', 'minion',
    'There are 2 extra Outsiders in play (replacing 2 Townsfolk).',
    { setupModifiers: { townsfolk: -2, outsider: 2 } }),

  // ---- Demon (1) ----
  character('imp', 'Imp', 'demon',
    'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the new Imp instead.'),
];

export const CHARACTERS: Readonly<Record<string, Character>> = Object.freeze(
  Object.fromEntries(LIST.map((c) => [c.id, c])),
);

export function characterById(id: string): Character {
  const character = CHARACTERS[id];
  if (!character) throw new Error(`Unknown character id: ${id}`);
  return character;
}

export function charactersByTeam(team: Team): Character[] {
  return LIST.filter((c) => c.team === team);
}

export function alignmentOf(characterId: string): Alignment {
  const { team } = characterById(characterId);
  return team === 'minion' || team === 'demon' ? 'evil' : 'good';
}
```

- [ ] **Step 4: Write the distribution chart and registration helper**

`src/editions/troubleBrewing/distribution.ts`:

```ts
import type { TeamCounts } from './characters';

/** Guide §2. Travellers (16+) are out of scope (§18). */
export const DISTRIBUTION: Readonly<Record<number, TeamCounts>> = Object.freeze({
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
});

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;
/** Below this, Minion info, Demon info and the 3 bluffs do not happen (guide §2, §5.2). */
export const INFO_THRESHOLD_PLAYERS = 7;

export function distributionFor(playerCount: number): TeamCounts {
  const counts = DISTRIBUTION[playerCount];
  if (!counts) {
    throw new Error(`Player count must be between 5 and 15, got ${playerCount}`);
  }
  return counts;
}
```

`src/editions/troubleBrewing/registration.ts`:

```ts
import { characterById } from './characters';
import type { Character, RegistrationOption, Team } from './characters';

/**
 * The ways this character may register. The true option is always first, so a
 * caller taking element 0 gets the canonical answer (§4.3).
 *
 * NOT gated by abilityFunctional: a poisoned Recluse still registers ambiguously,
 * because registration is a passive property rather than an ability (§4.2).
 */
export function registrationOptions(character: Character): readonly RegistrationOption[] {
  return character.registration;
}

export function registrationOptionsForCharacterId(characterId: string): readonly RegistrationOption[] {
  return registrationOptions(characterById(characterId));
}

export function isAmbiguous(characterId: string): boolean {
  return registrationOptionsForCharacterId(characterId).length > 1;
}

/**
 * Whether this character may register as the given team. Every caller wants
 * exactly this question, so there are no `asDemon` / `asMinion` / `asTeam`
 * combinator exports — they had no callers and no test.
 */
export function canRegisterAsTeam(characterId: string, team: Team): boolean {
  return registrationOptionsForCharacterId(characterId).some((o) => o.team === team);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/editions/troubleBrewing && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/editions/troubleBrewing
git commit -m "$(cat <<'EOF'
feat(edition): add Trouble Brewing characters, distribution and registration

All 22 characters with capability flags. requiresAlive is false for the
Ravenkeeper and the Saint per spec §4.2 — the v2 predicate hardcoded `alive`
and silently disabled both. Registration options carry the true option first
so callers can take the canonical answer, and are deliberately not gated by
ability functionality (a poisoned Recluse still registers ambiguously).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Core types, phase ordering and status lifetimes

The status-expiry comparison is the trap that "silently breaks the Monk" (§4.4). It gets its own task and its own explicit table of cases so the `<` / `<=` coin-flip cannot happen.

**Two deliberate deviations from the spec, flagged here rather than buried:**

1. **`perceivedCharacterId` is not a field on `Player`.** §3.7 lists it among the derived player fields, but §4.1 makes it a function whose call sites must be restricted by ESLint. A stored field is readable by any predicate with no import to lint, which makes the load-bearing invariant unenforceable. It is therefore a function only (Task 6).
2. **The JSON round-trip determinism test (§3.3) round-trips the *events*, not the state.** `settledStepIds` is a `Set` and does not survive `JSON.stringify`; events are what actually get persisted (§12), so `reduce(events)` vs `reduce(JSON.parse(JSON.stringify(events)))` is the property that matters.

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/phase.ts`
- Test: `src/engine/phase.test.ts`

**Interfaces:**
- Consumes: `Team`, `Alignment`, `TeamCounts` from Task 2.
- Produces:
  - `type PlayerId = string`, `type CharacterId = string`
  - `interface Phase { kind: 'night' | 'day'; number: number }`
  - `type StatusName = 'poisoned' | 'protected' | 'master' | 'redHerring'`
  - `interface StatusEntry { status: StatusName; sourcePlayerId: PlayerId | null; effective: boolean; appliedAt: Phase; expiresAt: Phase | null }`
  - `interface Player`, `interface GameState`, `interface Victory`, `interface Nomination`, `interface ExecutionRecord`, `interface RuleFlag`, `interface DeathRecord`
  - `interface DerivationLine { label: string; detail: string }`, `interface LegalAnswer`, `interface RegistrationRuling`
  - `phaseOrdinal(phase): number`, `nextPhase(phase): Phase`, `comparePhases(a, b): number`, `isStatusActive(status, now): boolean`
  - `type StatusLifetime = 'until_dawn' | 'tonight_and_tomorrow' | 'permanent'`, `expiryFor(lifetime, appliedAt): Phase | null`

- [ ] **Step 1: Write the failing test**

`src/engine/phase.test.ts`. Every case below is a rule from §4.4, named after what breaks if it is wrong:

```ts
import { describe, expect, it } from 'vitest';
import { comparePhases, isStatusActive, nextPhase, phaseOrdinal } from './phase';
import type { Phase, StatusEntry } from './types';

const night = (n: number): Phase => ({ kind: 'night', number: n });
const day = (n: number): Phase => ({ kind: 'day', number: n });

function status(
  name: StatusEntry['status'],
  appliedAt: Phase,
  expiresAt: Phase | null,
  sourcePlayerId: string | null = 'p1',
): StatusEntry {
  return { status: name, sourcePlayerId, effective: true, appliedAt, expiresAt };
}

describe('phaseOrdinal', () => {
  // Day N follows night N. Stated explicitly in §4.4 because every lifetime depends on it.
  it('orders night 1, day 1, night 2, day 2', () => {
    expect(phaseOrdinal(night(1))).toBe(2);
    expect(phaseOrdinal(day(1))).toBe(3);
    expect(phaseOrdinal(night(2))).toBe(4);
    expect(phaseOrdinal(day(2))).toBe(5);
  });

  it('is strictly increasing across the alternation', () => {
    const sequence = [night(1), day(1), night(2), day(2), night(3), day(3)];
    const ordinals = sequence.map(phaseOrdinal);
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
    expect(new Set(ordinals).size).toBe(ordinals.length);
  });

  it('compares phases by ordinal', () => {
    expect(comparePhases(night(2), day(1))).toBeGreaterThan(0);
    expect(comparePhases(day(1), night(2))).toBeLessThan(0);
    expect(comparePhases(day(3), day(3))).toBe(0);
  });
});

describe('nextPhase', () => {
  it('advances night N to day N and day N to night N+1', () => {
    expect(nextPhase(night(1))).toEqual(day(1));
    expect(nextPhase(day(1))).toEqual(night(2));
    expect(nextPhase(night(7))).toEqual(day(7));
  });
});

describe('isStatusActive — the inclusive comparison of §4.4', () => {
  // The Monk's protection must survive until the Imp step LATER THE SAME NIGHT.
  // A `<` comparison here silently breaks the Monk.
  it('keeps Monk protection active for the whole of the night it was applied', () => {
    const protection = status('protected', night(3), night(3));
    expect(isStatusActive(protection, night(3))).toBe(true);
  });

  it('drops Monk protection by the following day', () => {
    const protection = status('protected', night(3), night(3));
    expect(isStatusActive(protection, day(3))).toBe(false);
    expect(isStatusActive(protection, night(4))).toBe(false);
  });

  // Poison applied night N is active for night N AND day N, gone at the start of night N+1.
  it('keeps poison active for night N and day N and no longer', () => {
    const poison = status('poisoned', night(2), day(2));
    expect(isStatusActive(poison, night(2))).toBe(true);
    expect(isStatusActive(poison, day(2))).toBe(true);
    expect(isStatusActive(poison, night(3))).toBe(false);
    expect(isStatusActive(poison, day(3))).toBe(false);
  });

  it('keeps the Butler master mark active for night N and day N', () => {
    const master = status('master', night(4), day(4));
    expect(isStatusActive(master, night(4))).toBe(true);
    expect(isStatusActive(master, day(4))).toBe(true);
    expect(isStatusActive(master, night(5))).toBe(false);
  });

  it('treats a null expiry as permanent', () => {
    const herring = status('redHerring', night(1), null, null);
    expect(isStatusActive(herring, night(1))).toBe(true);
    expect(isStatusActive(herring, day(9))).toBe(true);
  });

  it('is not active before it was applied', () => {
    const poison = status('poisoned', night(5), day(5));
    expect(isStatusActive(poison, night(4))).toBe(false);
    expect(isStatusActive(poison, day(4))).toBe(false);
  });

  // §4.4 — declarative and time-driven, never actor-driven. A Poisoner executed on
  // day 3 must not leave their victim poisoned for the rest of the game, and equally
  // must not have their live poison cancelled early.
  it('ignores whether the source player is alive', () => {
    const poison = status('poisoned', night(3), day(3), 'the-dead-poisoner');
    expect(isStatusActive(poison, day(3))).toBe(true);
    expect(isStatusActive(poison, night(4))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/phase.test.ts`
Expected: FAIL — `Cannot find module './phase'`.

- [ ] **Step 3: Write the types**

`src/engine/types.ts`:

```ts
import type { Alignment, Team, TeamCounts } from '@/editions/troubleBrewing/characters';

export type PlayerId = string;
export type CharacterId = string;
export type TxId = string;

export type PhaseKind = 'night' | 'day';
export interface Phase {
  kind: PhaseKind;
  number: number;
}

export type StatusName = 'poisoned' | 'protected' | 'master' | 'redHerring';

export interface StatusEntry {
  status: StatusName;
  /** Who applied it. Retained for the Grimoire and the log; never used for expiry (§4.4). */
  sourcePlayerId: PlayerId | null;
  /**
   * Whether the source's ability actually worked at application time (§3.6). A
   * suppressed effect still places the reminder token, because the physical
   * Storyteller does. Spy Mode must never expose this field (§10.1).
   */
  effective: boolean;
  appliedAt: Phase;
  /** null = never expires (the red herring). */
  expiresAt: Phase | null;
}

export type DeathCause = 'demon' | 'execution' | 'slayer' | 'other';
export type ExecutionKind = 'vote' | 'virgin';

export interface DeathRecord {
  playerId: PlayerId;
  characterIdAtDeath: CharacterId;
  cause: DeathCause;
  executionKind?: ExecutionKind;
  phase: Phase;
  seq: number;
}

export interface ExecutionRecord {
  playerId: PlayerId;
  characterIdAtDeath: CharacterId;
  kind: ExecutionKind;
}

export interface Claim {
  id: string;
  claimedCharacterId: CharacterId;
  day: number;
  confidence: 'hard' | 'soft';
  note?: string;
}

export interface InfoRecord {
  seq: number;
  phase: Phase;
  stepId: string;
  display: string;
  answerClass: AnswerClass;
}

export interface Player {
  id: PlayerId;
  name: string;
  /** Position in the ring, 0-based, immutable after GAME_CREATED (§18). */
  seat: number;
  characterId: CharacterId;
  /** Derived from characterId (§3.8 debt: the Goon would break this). */
  alignment: Alignment;
  team: Team;
  /** Monotonic: derived from DEATH events, never un-set (§3.8 debt). */
  alive: boolean;
  statusLedger: StatusEntry[];
  claims: Claim[];
  infoHistory: InfoRecord[];
  deadVoteSpent: boolean;
  /** The Virgin has been nominated once and has lost the ability, poisoned or not (§16.10). */
  virginTriggered: boolean;
  slayerUsed: boolean;
  /** When this player became the Demon. Persistent, so §6.3's notification survives a day. */
  demonSince: Phase | null;
  demonNotified: boolean;
}

export type VictoryStatus = 'ongoing' | 'good' | 'evil';
export type VictoryReason =
  | 'demon_dead'
  | 'two_alive'
  | 'saint_executed'
  | 'mayor_no_execution'
  | 'abandoned';

export interface Victory {
  status: VictoryStatus;
  reason: VictoryReason | null;
}

export interface Vote {
  voterId: PlayerId;
  /** Whether the voter was dead when the vote was cast — derived at that seq (§7). */
  wasDead: boolean;
}

/**
 * There is deliberately NO butlerViolation field. Guide §10: the Master's vote
 * counts "in either order — the Storyteller can tally the Butler's hand before or
 * after the Master's, and retroactively validate/invalidate it". A flag frozen
 * when the vote lands is wrong for every Butler who raises their hand first, so
 * the violation is a selector over the nomination's FINAL vote set (Task 14).
 */

export interface Nomination {
  id: string;
  nominatorId: PlayerId;
  nomineeId: PlayerId;
  day: number;
  votes: Vote[];
  closed: boolean;
  /**
   * The threshold as it stood when this nomination closed, taken from
   * NOMINATION_CLOSED. Null while open.
   *
   * Guide §10's threshold is per tally, and a Virgin trigger or a Slayer shot can
   * kill someone mid-day — so the alive count at day close is not the count this
   * nomination was voted under. Reading it here is a deliberate departure from
   * §3.6's "write-only forensic record" (see the deviations list).
   */
  closedThreshold: number | null;
}

export type RuleFlagClass = 'social' | 'integrity';

export interface RuleFlag {
  rule: string;
  relatedTxId: TxId;
  class: RuleFlagClass;
  detail: string;
  phase: Phase;
  seq: number;
}

export type NoteScope = 'player' | 'game';
export interface Note {
  id: string;
  scope: NoteScope;
  playerId?: PlayerId;
  text: string;
  seq: number;
  phase: Phase;
}

export interface DrunkBelief {
  playerId: PlayerId;
  believesCharacterId: CharacterId;
}

export interface GameState {
  edition: { id: string; version: string };
  players: Player[];
  phase: Phase;
  /** The post-modifier counts. Public, displayed persistently (§5.4). */
  distribution: TeamCounts;
  /** Three good characters not in play. null below 7 players (§5.2). */
  demonBluffs: CharacterId[] | null;
  drunkBelief: DrunkBelief | null;
  redHerringPlayerId: PlayerId | null;
  /** Night-scoped keys: `${night}:${stepId}:${actorKey}` (§3.7, §6.1). */
  settledStepIds: ReadonlySet<string>;
  /** A list, not a singular field — a Virgin trigger plus a vote is two (§3.6, §16.5). */
  todaysExecutions: ExecutionRecord[];
  nominations: Nomination[];
  ruleFlags: RuleFlag[];
  deaths: DeathRecord[];
  notes: Note[];
  victory: Victory;
  /**
   * Private Storyteller scratch. Seeded in Slice 1 for one reason: Plan 3's Spy
   * Mode canary test must have a secret field to fail on from day one, rather than
   * passing vacuously until Slice 2 adds notes and ledgers (§15).
   */
  stPrivate: { plannerNote: string };
}

// ---- Information answers (§4.3, §8.2) ----

export type AnswerClass = 'canonical' | 'registration' | 'fabricated' | 'st_override';

export interface RegistrationRuling {
  playerId: PlayerId;
  registersAs: { alignment: Alignment; team: Team };
}

/** One line of "show your working" (§8.2). Rendered by Plan 2, produced here. */
export interface DerivationLine {
  label: string;
  detail: string;
}

export interface LegalAnswer {
  /** Stable across recomputation at the same seq, so a selection can be restored. */
  key: string;
  /**
   * The answer payload: a number, a boolean, a characterId, or a tuple. For the
   * "1 of these 2 players is X" answers the tuple is `[characterId, a, b]`, and
   * `characterId` is **null** when the Storyteller must pick which token to show
   * because the named player was ruled into a team they are not (see `oneOfTwo`).
   */
  value: number | boolean | string | readonly (string | null)[] | null;
  /** What the Storyteller says or shows. */
  display: string;
  answerClass: Extract<AnswerClass, 'canonical' | 'registration'>;
  registrationRulings: RegistrationRuling[];
  derivation: DerivationLine[];
}

/**
 * The narrowed state a resolver may see (§6.2). Built field by field with no
 * spreads so the edition layer structurally cannot reach notes, rule flags or
 * stPrivate.
 */
export interface RulesViewPlayer {
  id: PlayerId;
  name: string;
  seat: number;
  characterId: CharacterId;
  alignment: Alignment;
  team: Team;
  alive: boolean;
  statusLedger: readonly StatusEntry[];
  virginTriggered: boolean;
  slayerUsed: boolean;
  demonSince: Phase | null;
  demonNotified: boolean;
}

export interface RulesView {
  edition: { id: string; version: string };
  players: readonly RulesViewPlayer[];
  phase: Phase;
  distribution: TeamCounts;
  demonBluffs: readonly CharacterId[] | null;
  /**
   * Present because two rules need it directly: wakes() for the Drunk's believed
   * step, and the Washerwoman's exclusion of the Drunk's believed Townsfolk (§6.4).
   * Reading this is not reading perceivedCharacterId, so §4.1's invariant holds.
   */
  drunkBelief: DrunkBelief | null;
  redHerringPlayerId: PlayerId | null;
  deaths: readonly DeathRecord[];
  todaysExecutions: readonly ExecutionRecord[];
}
```

- [ ] **Step 4: Write the phase arithmetic**

`src/engine/phase.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/engine/phase.test.ts && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/phase.ts src/engine/phase.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): add core types, phase ordering and status lifetimes

phaseOrdinal encodes night N before day N (§4.4) and isStatusActive compares
inclusively on both ends, so Monk protection survives to the Imp step on the
same night and night-N poison covers day N. Expiry is time-driven and ignores
whether the source is alive.

Two deliberate deviations from the spec, both documented in the plan:
perceivedCharacterId is a function only, never a stored Player field, so §4.1's
call-site restriction is lintable; and GameState.stPrivate is seeded now so
Plan 3's Spy canary test is not vacuous.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: Event catalogue and the reducer core

The single write path. This task also establishes the three structural properties everything later relies on: determinism, referential stability, and purity.

**Scope note on the catalogue.** §3.6 lists 26 event types. This plan implements **24**: `CLAIM_RECORDED` and `CLAIM_RETRACTED` are omitted because structured claims are explicitly Slice 2 (§15), and nothing in Slice 1 produces them. `NOTE_ADDED` **is** included — §3.4 names it as a correction mechanism, so Slice 1 needs it. `Player.claims` stays on the type as a permanently-empty array in Slice 1, because Plan 3's exhaustive `SpyView` key partition has to classify it.

**Files:**
- Create: `src/engine/events.ts`
- Create: `src/engine/reducer/applyEvent.ts`
- Create: `src/engine/reducer/fold.ts`
- Create: `test/helpers/game.ts`
- Test: `src/engine/reducer/applyEvent.test.ts`, `src/engine/reducer/determinism.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 and 3.
- Produces:
  - `type GameEventPayloads` (a map from event type to payload) and `type GameEvent = { seq: number; txId: TxId; ts: number; type: T; payload: GameEventPayloads[T] }` as a discriminated union over `T`
  - `type EventType = GameEvent['type']`, `NON_UNDOABLE_EVENT_TYPES: ReadonlySet<EventType>`
  - `initialState(): GameState`
  - `applyEvent(state: GameState, event: GameEvent): GameState`
  - `applyMany(state: GameState, events: readonly GameEvent[]): GameState`
  - `reduce(events: readonly GameEvent[]): GameState`
  - Test helpers `class LogBuilder { push(type, payload, sameTx?): this; readonly events: GameEvent[]; get state(): GameState }`, `buildGame(options): LogBuilder`, `advanceTo(builder, phase): LogBuilder`

- [ ] **Step 1: Write the event catalogue**

`src/engine/events.ts`. Payload shapes are §3.6 verbatim, including the four v2 corrections noted there: every step event carries `stepId`; `actorIds` is always an array; `NOMINATION_CLOSED`'s tally fields are write-only forensics; `DAY_CLOSED` carries no `executedId`.

```ts
import type {
  AnswerClass,
  CharacterId,
  DeathCause,
  ExecutionKind,
  NoteScope,
  Phase,
  PlayerId,
  RegistrationRuling,
  RuleFlagClass,
  StatusName,
  TxId,
} from './types';
import type { Team, TeamCounts } from '@/editions/troubleBrewing/characters';

export interface ResolutionLink {
  targetId: PlayerId;
  result:
    | 'no_effect'
    | 'monk_protected'
    | 'soldier'
    | 'starpass'
    | 'mayor_bounce'
    | 'already_dead'
    | 'died';
}

export interface GameEventPayloads {
  GAME_CREATED: {
    players: Array<{ id: PlayerId; name: string; seat: number }>;
    edition: { id: string; version: string };
  };
  /** Typos only. Seating and the roster are immutable (§18). */
  PLAYER_RENAMED: { playerId: PlayerId; name: string };

  ROLES_ASSIGNED: {
    assignments: Record<PlayerId, CharacterId>;
    /** Post-modifier counts. Public thereafter (§5.4). */
    distribution: TeamCounts;
    setupModifiers: Array<{ characterId: CharacterId; teamDeltas: Partial<TeamCounts> }>;
    /** null below 7 players (§5.2). */
    demonBluffs: CharacterId[] | null;
    drunkBelief: { playerId: PlayerId; believesCharacterId: CharacterId } | null;
    redHerring: PlayerId | null;
  };
  ROLE_CHANGED: {
    playerId: PlayerId;
    from: CharacterId;
    to: CharacterId;
    reason: 'starpass' | 'scarlet_woman' | 'st_correction' | 'st_balance';
  };

  PHASE_ADVANCED: { phase: 'night' | 'day'; number: number };
  /** Executions are derived from the day's nominations, never stored here (§3.6). */
  DAY_CLOSED: Record<string, never>;

  NIGHT_STEP_RESOLVED: {
    stepId: string;
    actorIds: PlayerId[];
    /** Per-actor steps only. Group steps have no single perceived character (§3.6). */
    perceivedCharacterId?: CharacterId;
    targets: PlayerId[];
    chosenAnswer: string;
    answerClass: AnswerClass;
    answerReason?: string;
    registrationRulings: RegistrationRuling[];
    abilityFunctional: boolean;
    effectSuppressed: boolean;
    stChoice?: string;
  };
  NIGHT_STEP_SKIPPED: {
    stepId: string;
    actorIds: PlayerId[];
    reason: 'condition_unmet' | 'st_skip';
  };
  NIGHT_KILL_RESOLVED: {
    stepId: string;
    actorIds: PlayerId[];
    attackerId: PlayerId;
    chosenTargetId: PlayerId;
    resolutionChain: ResolutionLink[];
    finalVictimId: PlayerId | null;
    successorId: PlayerId | null;
  };

  STATUS_APPLIED: {
    playerId: PlayerId;
    status: StatusName;
    sourcePlayerId: PlayerId | null;
    /** Whether the source's ability worked at application time (§3.6). */
    effective: boolean;
    expiresAt: Phase | null;
  };
  /** Manual Storyteller override only. Normal expiry is declarative (§4.4). */
  STATUS_CLEARED: { playerId: PlayerId; status: StatusName; sourcePlayerId: PlayerId | null };

  DEATH: {
    playerId: PlayerId;
    characterIdAtDeath: CharacterId;
    cause: DeathCause;
    executionKind?: ExecutionKind;
  };
  DEMON_DIED: {
    deadDemonId: PlayerId;
    /** Counts the dying Demon (§16.1). */
    aliveCountAtDeath: number;
    successorId: PlayerId | null;
    successorReason: 'scarlet_woman' | 'starpass' | null;
  };

  NOMINATION_OPENED: { id: string; nominatorId: PlayerId; nomineeId: PlayerId };
  VOTE_CAST: { nominationId: string; voterId: PlayerId };
  NOMINATION_CLOSED: {
    id: string;
    /** Write-only forensic record. No selector reads these three (§3.6). */
    auditTally: number;
    auditThreshold: number;
    butlerVotesFlagged: PlayerId[];
  };
  EXECUTION: { playerId: PlayerId | null; kind: ExecutionKind };
  VIRGIN_TRIGGERED: {
    nominatorId: PlayerId;
    /**
     * Added to §3.6's shape. The reducer previously inferred the Virgin from "the
     * last nomination today", which is deterministic on replay but does not
     * record what the event means, and breaks silently under any reordering.
     */
    nomineeId: PlayerId;
    fired: boolean;
    reason?: string;
    /**
     * Added to §3.6's shape. A Spy ruled a Townsfolk here is a registration
     * ruling like any other, and §9's registration ledger has to see it — the
     * evaluation computed these and the earlier draft dropped them on the floor,
     * leaving the fact as English prose inside `reason`.
     */
    registrationRulings: RegistrationRuling[];
  };
  SLAYER_CLAIMED: {
    claimantId: PlayerId;
    targetId: PlayerId;
    claimantIsRealSlayer: boolean;
    /** The only field that routes into onDemonDeath (§4.6, §16.12). */
    targetIsTrueDemon: boolean;
    targetRegisteredAsDemon: boolean;
    abilityFunctional: boolean;
    outcome: 'died' | 'nothing';
    /** Added to §3.6's shape, for the same reason as VIRGIN_TRIGGERED's. */
    registrationRulings: RegistrationRuling[];
  };

  RULE_FLAGGED: { rule: string; relatedTxId: TxId; class: RuleFlagClass; detail: string };
  NOTE_ADDED: { id: string; scope: NoteScope; playerId?: PlayerId; text: string };

  /** Audit trail. Non-undoable (§3.4). */
  SPY_VIEWED: Record<string, never>;
  SPY_VIEW_ENDED: Record<string, never>;

  GAME_ENDED: {
    winner: 'good' | 'evil';
    reason: 'demon_dead' | 'two_alive' | 'saint_executed' | 'mayor_no_execution' | 'abandoned';
  };
}

export type EventType = keyof GameEventPayloads;

/** The envelope of §3.2, exactly: seq, txId, ts, type, payload. No id, no phase. */
export type GameEvent = {
  [T in EventType]: {
    seq: number;
    txId: TxId;
    /** Stamped by the command layer, never inside applyEvent (§3.2, §3.3). */
    ts: number;
    type: T;
    payload: GameEventPayloads[T];
  };
}[EventType];

export type EventOfType<T extends EventType> = Extract<GameEvent, { type: T }>;

/** §3.4 — the Spy audit trail survives undo. */
export const NON_UNDOABLE_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'SPY_VIEWED',
  'SPY_VIEW_ENDED',
]);

/** The team a character belongs to, re-exported so events.ts is the single import for the log. */
export type { Team };
```

- [ ] **Step 2: Write the failing tests**

`src/engine/reducer/applyEvent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEvent, initialState, reduce } from './fold';
import type { GameEvent } from '../events';

let nextSeq = 0;
function evt<T extends GameEvent['type']>(
  type: T,
  payload: Extract<GameEvent, { type: T }>['payload'],
  txId = `tx${nextSeq}`,
): GameEvent {
  return { seq: nextSeq++, txId, ts: 1_700_000_000_000 + nextSeq, type, payload } as GameEvent;
}

function fourPlayerLog(): GameEvent[] {
  nextSeq = 0;
  return [
    evt('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: [
        { id: 'p1', name: 'One', seat: 0 },
        { id: 'p2', name: 'Two', seat: 1 },
        { id: 'p3', name: 'Three', seat: 2 },
        { id: 'p4', name: 'Four', seat: 3 },
        { id: 'p5', name: 'Five', seat: 4 },
      ],
    }),
    evt('ROLES_ASSIGNED', {
      assignments: {
        p1: 'imp',
        p2: 'poisoner',
        p3: 'empath',
        p4: 'monk',
        p5: 'chef',
      },
      distribution: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    }),
    evt('PHASE_ADVANCED', { phase: 'night', number: 1 }),
  ];
}

describe('applyEvent — envelope and roster', () => {
  it('seats players in the order given and derives nothing else from GAME_CREATED', () => {
    const state = reduce(fourPlayerLog().slice(0, 1));
    expect(state.players.map((p) => [p.seat, p.name])).toEqual([
      [0, 'One'],
      [1, 'Two'],
      [2, 'Three'],
      [3, 'Four'],
      [4, 'Five'],
    ]);
    expect(state.players.every((p) => p.alive)).toBe(true);
    expect(state.phase).toEqual({ kind: 'night', number: 0 });
    expect(state.victory).toEqual({ status: 'ongoing', reason: null });
  });

  it('derives alignment and team from the assigned character', () => {
    const state = reduce(fourPlayerLog());
    const byId = new Map(state.players.map((p) => [p.id, p]));
    expect(byId.get('p1')).toMatchObject({ alignment: 'evil', team: 'demon' });
    expect(byId.get('p2')).toMatchObject({ alignment: 'evil', team: 'minion' });
    expect(byId.get('p3')).toMatchObject({ alignment: 'good', team: 'townsfolk' });
  });

  it('sets demonSince on the initial deal so §6.3 has a baseline', () => {
    const state = reduce(fourPlayerLog());
    expect(state.players.find((p) => p.id === 'p1')?.demonSince).toEqual({
      kind: 'night',
      number: 0,
    });
  });

  it('renames without touching seating', () => {
    const log = [...fourPlayerLog(), evt('PLAYER_RENAMED', { playerId: 'p2', name: 'Twoo' })];
    const state = reduce(log);
    const p2 = state.players.find((p) => p.id === 'p2');
    expect(p2?.name).toBe('Twoo');
    expect(p2?.seat).toBe(1);
  });

  it('derives the phase from the last PHASE_ADVANCED', () => {
    const log = [
      ...fourPlayerLog(),
      evt('PHASE_ADVANCED', { phase: 'day', number: 1 }),
      evt('PHASE_ADVANCED', { phase: 'night', number: 2 }),
    ];
    expect(reduce(log).phase).toEqual({ kind: 'night', number: 2 });
  });

  it('clears todaysExecutions when a new day opens, not when a night opens', () => {
    const log = [
      ...fourPlayerLog(),
      evt('PHASE_ADVANCED', { phase: 'day', number: 1 }),
      evt('EXECUTION', { playerId: 'p5', kind: 'vote' }),
      evt('DEATH', { playerId: 'p5', characterIdAtDeath: 'chef', cause: 'execution', executionKind: 'vote' }),
    ];
    expect(reduce(log).todaysExecutions).toHaveLength(1);

    const afterNight = reduce([...log, evt('DAY_CLOSED', {}), evt('PHASE_ADVANCED', { phase: 'night', number: 2 })]);
    // Still visible at night — the Undertaker wakes at night and needs it (§6.3).
    expect(afterNight.todaysExecutions).toHaveLength(1);

    const afterNextDay = reduce([
      ...log,
      evt('DAY_CLOSED', {}),
      evt('PHASE_ADVANCED', { phase: 'night', number: 2 }),
      evt('PHASE_ADVANCED', { phase: 'day', number: 2 }),
    ]);
    expect(afterNextDay.todaysExecutions).toEqual([]);
  });

  it('records deaths as monotonic and never resurrects', () => {
    const log = [
      ...fourPlayerLog(),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'demon' }),
    ];
    const state = reduce(log);
    expect(state.players.find((p) => p.id === 'p3')?.alive).toBe(false);
    expect(state.deaths).toHaveLength(1);
    expect(state.deaths[0]).toMatchObject({ playerId: 'p3', cause: 'demon', phase: { kind: 'night', number: 1 } });
  });

  // §4.8 integrity class: a flagged event must produce no derived state change.
  it('ignores a DEATH for a player who is already dead', () => {
    const log = [
      ...fourPlayerLog(),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'demon' }),
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'other' }),
    ];
    const state = reduce(log);
    expect(state.deaths).toHaveLength(1);
    expect(state.players.filter((p) => p.alive)).toHaveLength(4);
  });

  it('applies and clears statuses through the ledger', () => {
    const log = [
      ...fourPlayerLog(),
      evt('STATUS_APPLIED', {
        playerId: 'p3',
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: { kind: 'day', number: 1 },
      }),
    ];
    const applied = reduce(log);
    expect(applied.players.find((p) => p.id === 'p3')?.statusLedger).toEqual([
      {
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        appliedAt: { kind: 'night', number: 1 },
        expiresAt: { kind: 'day', number: 1 },
      },
    ]);

    const cleared = reduce([
      ...log,
      evt('STATUS_CLEARED', { playerId: 'p3', status: 'poisoned', sourcePlayerId: 'p2' }),
    ]);
    expect(cleared.players.find((p) => p.id === 'p3')?.statusLedger).toEqual([]);
  });

  // §3.7, §6.1 — the key must carry the night, or night 2 ends before it starts.
  it('night-scopes settled step keys', () => {
    const log = [
      ...fourPlayerLog(),
      evt('NIGHT_STEP_SKIPPED', { stepId: 'monk', actorIds: ['p4'], reason: 'condition_unmet' }),
    ];
    expect([...reduce(log).settledStepIds]).toEqual(['1:monk:p4']);
  });

  it('keys a group step once for the whole set', () => {
    const log = [
      ...fourPlayerLog(),
      evt('NIGHT_STEP_RESOLVED', {
        stepId: 'minion_info',
        actorIds: ['p2'],
        targets: [],
        chosenAnswer: 'shown the Demon',
        answerClass: 'canonical',
        registrationRulings: [],
        abilityFunctional: true,
        effectSuppressed: false,
      }),
    ];
    expect([...reduce(log).settledStepIds]).toEqual(['1:minion_info:GROUP']);
  });

  it('throws on an unrecognised event type rather than silently ignoring it', () => {
    const bogus = { seq: 0, txId: 'tx', ts: 0, type: 'NOT_AN_EVENT', payload: {} } as unknown as GameEvent;
    expect(() => applyEvent(initialState(), bogus)).toThrow(/unhandled event type/i);
  });
});

describe('applyEvent — referential stability (§3.5)', () => {
  it('returns identical sub-objects for everything the event did not touch', () => {
    const log = fourPlayerLog();
    const before = reduce(log);
    const after = applyEvent(
      before,
      evt('DEATH', { playerId: 'p3', characterIdAtDeath: 'empath', cause: 'demon' }),
    );

    const index = (s: typeof before, id: string) => s.players.findIndex((p) => p.id === id);
    expect(after.players[index(after, 'p3')]).not.toBe(before.players[index(before, 'p3')]);
    for (const id of ['p1', 'p2', 'p4', 'p5']) {
      expect(after.players[index(after, id)]).toBe(before.players[index(before, id)]);
    }
    expect(after.nominations).toBe(before.nominations);
    expect(after.ruleFlags).toBe(before.ruleFlags);
    expect(after.notes).toBe(before.notes);
    expect(after.settledStepIds).toBe(before.settledStepIds);
    expect(after.distribution).toBe(before.distribution);
  });

  it('returns the identical state object when an event changes nothing', () => {
    const before = reduce(fourPlayerLog());
    const after = applyEvent(before, evt('PLAYER_RENAMED', { playerId: 'p2', name: 'Two' }));
    expect(after).toBe(before);
  });
});
```

`src/engine/reducer/determinism.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { reduce } from './fold';
import type { GameEvent } from '../events';

function log(): GameEvent[] {
  let seq = 0;
  const e = <T extends GameEvent['type']>(
    type: T,
    payload: Extract<GameEvent, { type: T }>['payload'],
    txId: string,
  ): GameEvent => ({ seq: seq++, txId, ts: 1_700_000_000_000 + seq, type, payload }) as GameEvent;

  return [
    e('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: [
        { id: 'p1', name: 'A', seat: 0 },
        { id: 'p2', name: 'B', seat: 1 },
        { id: 'p3', name: 'C', seat: 2 },
        { id: 'p4', name: 'D', seat: 3 },
        { id: 'p5', name: 'E', seat: 4 },
      ],
    }, 't1'),
    e('ROLES_ASSIGNED', {
      assignments: { p1: 'imp', p2: 'poisoner', p3: 'empath', p4: 'monk', p5: 'chef' },
      distribution: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: 'p3',
    }, 't2'),
    e('PHASE_ADVANCED', { phase: 'night', number: 1 }, 't3'),
    e('STATUS_APPLIED', {
      playerId: 'p4',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    }, 't4'),
    e('NIGHT_STEP_RESOLVED', {
      stepId: 'empath',
      actorIds: ['p3'],
      perceivedCharacterId: 'empath',
      targets: [],
      chosenAnswer: '1',
      answerClass: 'canonical',
      registrationRulings: [],
      abilityFunctional: true,
      effectSuppressed: false,
    }, 't5'),
    e('PHASE_ADVANCED', { phase: 'day', number: 1 }, 't6'),
    e('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p3', nomineeId: 'p1' }, 't7'),
    e('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' }, 't8'),
    e('VOTE_CAST', { nominationId: 'n1', voterId: 'p4' }, 't9'),
    e('NOMINATION_CLOSED', { id: 'n1', auditTally: 2, auditThreshold: 3, butlerVotesFlagged: [] }, 't10'),
    e('NOTE_ADDED', { id: 'note1', scope: 'game', text: 'p4 claimed Monk loudly' }, 't11'),
  ];
}

describe('reducer determinism (§3.3)', () => {
  it('produces a deep-equal state when reduced twice', () => {
    expect(reduce(log())).toEqual(reduce(log()));
  });

  // Events are what get persisted (§12), so the round trip that matters is over
  // events. State holds a Set, which JSON does not preserve — see the plan's note.
  it('produces a deep-equal state after a JSON round trip of the events', () => {
    const events = log();
    const roundTripped = JSON.parse(JSON.stringify(events)) as typeof events;
    expect(reduce(roundTripped)).toEqual(reduce(events));
  });

  it('survives being reduced with the impurity guards armed', () => {
    // This test file lives under src/engine/reducer/, so purity.setup.ts has
    // stubbed Math.random, Date, performance.now and crypto to throw. If any of
    // them is reached from applyEvent this test fails with a purity violation.
    expect(() => reduce(log())).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/reducer`
Expected: FAIL — `Cannot find module './fold'`.

- [ ] **Step 4: Write applyEvent**

`src/engine/reducer/applyEvent.ts`:

```ts
import { alignmentOf, characterById } from '@/editions/troubleBrewing/characters';
import type { EventOfType, GameEvent } from '../events';
import { comparePhases } from '../phase';
import type { GameState, Nomination, Phase, Player, PlayerId, StatusEntry } from '../types';

const EMPTY_PLAYER_DEFAULTS = {
  statusLedger: [] as StatusEntry[],
  claims: [],
  infoHistory: [],
  deadVoteSpent: false,
  virginTriggered: false,
  slayerUsed: false,
  demonSince: null,
  demonNotified: false,
} as const;

export function initialState(): GameState {
  return {
    edition: { id: 'troubleBrewing', version: '0' },
    players: [],
    phase: { kind: 'night', number: 0 },
    distribution: { townsfolk: 0, outsider: 0, minion: 0, demon: 0 },
    demonBluffs: null,
    drunkBelief: null,
    redHerringPlayerId: null,
    settledStepIds: new Set<string>(),
    todaysExecutions: [],
    nominations: [],
    ruleFlags: [],
    deaths: [],
    notes: [],
    victory: { status: 'ongoing', reason: null },
    stPrivate: { plannerNote: '' },
  };
}

/**
 * Replaces one player, preserving referential identity of every other player and
 * of every untouched top-level slice (§3.5). Returns the SAME state object when
 * the mapper reports no change.
 */
function mapPlayer(
  state: GameState,
  playerId: PlayerId,
  fn: (player: Player) => Player,
): GameState {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) return state;
  const prior = state.players[index]!;
  const next = fn(prior);
  if (next === prior) return state;
  const players = state.players.slice();
  players[index] = next;
  return { ...state, players };
}

function stepKeyFromEvent(
  phase: Phase,
  stepId: string,
  actorIds: readonly PlayerId[],
): string[] {
  // One key per night for the steps in SINGLE_KEY_STEP_IDS, one per actor
  // otherwise. A step that drifts between the two settles under the wrong key and
  // either loops forever or skips silently, so Task 9 tests that this set agrees
  // with the night order's settleScope.
  if (SINGLE_KEY_STEP_IDS.has(stepId)) return [`${phase.number}:${stepId}:GROUP`];
  return actorIds.map((actorId) => `${phase.number}:${stepId}:${actorId}`);
}

/**
 * Steps that settle under ONE key per night rather than one per actor: the group
 * and pseudo steps, plus the Imp, whose settleScope is per-night because the
 * Demon gets one kill a night whoever holds the token (see nightOrder.ts).
 *
 * Duplicated here because the reducer cannot import the night order without
 * pulling in the whole edition barrel. Task 9 tests that the two agree.
 */
export const SINGLE_KEY_STEP_IDS: ReadonlySet<string> = new Set([
  'dusk_confirm_eyes_closed',
  'minion_info',
  'demon_info',
  'imp',
  'dawn_wait',
  'dawn_announce_deaths',
]);

function withSettled(state: GameState, keys: readonly string[]): GameState {
  const next = new Set(state.settledStepIds);
  let changed = false;
  for (const key of keys) {
    if (!next.has(key)) {
      next.add(key);
      changed = true;
    }
  }
  return changed ? { ...state, settledStepIds: next } : state;
}

function applyDeath(state: GameState, event: EventOfType<'DEATH'>): GameState {
  const { playerId, characterIdAtDeath, cause, executionKind } = event.payload;
  const player = state.players.find((p) => p.id === playerId);
  // §4.8 integrity class: recorded and flagged, but no derived state change.
  if (!player || !player.alive) return state;

  const withDead = mapPlayer(state, playerId, (p) => ({ ...p, alive: false }));
  const deaths = [
    ...state.deaths,
    {
      playerId,
      characterIdAtDeath,
      cause,
      ...(executionKind ? { executionKind } : {}),
      phase: state.phase,
      seq: event.seq,
    },
  ];
  const next: GameState = { ...withDead, deaths };
  if (cause !== 'execution') return next;
  return {
    ...next,
    todaysExecutions: [
      ...next.todaysExecutions,
      { playerId, characterIdAtDeath, kind: executionKind ?? 'vote' },
    ],
  };
}

function applyRolesAssigned(state: GameState, event: EventOfType<'ROLES_ASSIGNED'>): GameState {
  const { assignments, distribution, demonBluffs, drunkBelief, redHerring } = event.payload;
  const players = state.players.map((player) => {
    const characterId = assignments[player.id];
    if (!characterId) throw new Error(`ROLES_ASSIGNED omitted player ${player.id}`);
    const character = characterById(characterId);
    return {
      ...player,
      characterId,
      alignment: alignmentOf(characterId),
      team: character.team,
      demonSince: character.team === 'demon' ? state.phase : null,
      // The dealt Demon was handed their token at setup, so they are already
      // notified. Without this, §6.3's condition wakes the original Imp on night 2
      // and shows them a "You are the Imp" card.
      demonNotified: character.team === 'demon',
    };
  });

  const withHerring = redHerring
    ? players.map((p) =>
        p.id === redHerring
          ? {
              ...p,
              statusLedger: [
                ...p.statusLedger,
                {
                  status: 'redHerring' as const,
                  sourcePlayerId: null,
                  effective: true,
                  appliedAt: state.phase,
                  expiresAt: null,
                },
              ],
            }
          : p,
      )
    : players;

  return {
    ...state,
    players: withHerring,
    distribution,
    demonBluffs,
    drunkBelief,
    redHerringPlayerId: redHerring,
  };
}

export function applyEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_CREATED': {
      const { players, edition } = event.payload;
      return {
        ...state,
        edition,
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          seat: p.seat,
          characterId: '',
          alignment: 'good',
          team: 'townsfolk',
          alive: true,
          ...EMPTY_PLAYER_DEFAULTS,
          statusLedger: [],
          claims: [],
          infoHistory: [],
        })),
      };
    }

    case 'PLAYER_RENAMED':
      return mapPlayer(state, event.payload.playerId, (p) =>
        p.name === event.payload.name ? p : { ...p, name: event.payload.name },
      );

    case 'ROLES_ASSIGNED':
      return applyRolesAssigned(state, event);

    case 'ROLE_CHANGED': {
      const { playerId, to } = event.payload;
      const character = characterById(to);
      // §4.8 integrity invariant: two living Demons must be unreachable. A
      // correction that would create one is recorded in the log and produces no
      // derived state change, exactly like a DEATH for a dead player. The command
      // that emitted it pairs this with a RULE_FLAGGED so the banner can say so
      // (Task 17).
      //
      // This does NOT break the Scarlet Woman: her ROLE_CHANGED arrives in the
      // same transaction as the Imp's DEATH, which lands first, so at this moment
      // no living Demon exists.
      if (character.team === 'demon') {
        const existingDemon = state.players.find(
          (p) => p.alive && p.id !== playerId && p.team === 'demon',
        );
        if (existingDemon) return state;
      }
      return mapPlayer(state, playerId, (p) => ({
        ...p,
        characterId: to,
        alignment: alignmentOf(to),
        team: character.team,
        demonSince: character.team === 'demon' ? (p.demonSince ?? state.phase) : p.demonSince,
      }));
    }

    case 'PHASE_ADVANCED': {
      const phase: Phase = { kind: event.payload.phase, number: event.payload.number };
      if (comparePhases(phase, state.phase) <= 0) {
        throw new Error(
          `PHASE_ADVANCED went backwards: ${state.phase.kind} ${state.phase.number} -> ${phase.kind} ${phase.number}`,
        );
      }
      return {
        ...state,
        phase,
        // A fresh day starts with no executions. Cleared on day entry, not on
        // night entry, because the Undertaker wakes at night and reads the list (§6.3).
        todaysExecutions: phase.kind === 'day' ? [] : state.todaysExecutions,
      };
    }

    case 'DAY_CLOSED':
      return state;

    case 'NIGHT_STEP_RESOLVED': {
      const { stepId, actorIds, chosenAnswer, answerClass } = event.payload;
      const settled = withSettled(state, stepKeyFromEvent(state.phase, stepId, actorIds));
      let next = settled;
      for (const actorId of actorIds) {
        next = mapPlayer(next, actorId, (p) => ({
          ...p,
          infoHistory: [
            ...p.infoHistory,
            { seq: event.seq, phase: state.phase, stepId, display: chosenAnswer, answerClass },
          ],
          // §6.3 — persistent, so a daytime promotion notifies the following night.
          demonNotified: stepId === 'scarlet_woman_notify' ? true : p.demonNotified,
        }));
      }
      return next;
    }

    case 'NIGHT_STEP_SKIPPED':
      return withSettled(
        state,
        stepKeyFromEvent(state.phase, event.payload.stepId, event.payload.actorIds),
      );

    case 'NIGHT_KILL_RESOLVED':
      // Deaths, promotions and statuses are separate events in the same
      // transaction (§3.2). This event only settles the step and records forensics.
      return withSettled(
        state,
        stepKeyFromEvent(state.phase, event.payload.stepId, event.payload.actorIds),
      );

    case 'STATUS_APPLIED': {
      const { playerId, status, sourcePlayerId, effective, expiresAt } = event.payload;
      return mapPlayer(state, playerId, (p) => ({
        ...p,
        statusLedger: [
          ...p.statusLedger,
          { status, sourcePlayerId, effective, appliedAt: state.phase, expiresAt },
        ],
      }));
    }

    case 'STATUS_CLEARED': {
      const { playerId, status, sourcePlayerId } = event.payload;
      return mapPlayer(state, playerId, (p) => {
        const statusLedger = p.statusLedger.filter(
          (s) => !(s.status === status && s.sourcePlayerId === sourcePlayerId),
        );
        return statusLedger.length === p.statusLedger.length ? p : { ...p, statusLedger };
      });
    }

    case 'DEATH':
      return applyDeath(state, event);

    case 'DEMON_DIED':
      // Forensic record. The ROLE_CHANGED in the same transaction moves the role.
      return state;

    case 'NOMINATION_OPENED': {
      const { id, nominatorId, nomineeId } = event.payload;
      const nomination: Nomination = {
        id,
        nominatorId,
        nomineeId,
        day: state.phase.number,
        votes: [],
        closed: false,
        closedThreshold: null,
      };
      return { ...state, nominations: [...state.nominations, nomination] };
    }

    case 'VOTE_CAST': {
      const { nominationId, voterId } = event.payload;
      const index = state.nominations.findIndex((n) => n.id === nominationId);
      if (index === -1) return state;
      const nomination = state.nominations[index]!;
      const voter = state.players.find((p) => p.id === voterId);
      if (!voter) return state;
      if (nomination.votes.some((v) => v.voterId === voterId)) return state;

      const wasDead = !voter.alive;
      const nominations = state.nominations.slice();
      nominations[index] = {
        ...nomination,
        votes: [...nomination.votes, { voterId, wasDead }],
      };
      // A dead player's single ghost vote is spent the moment it is cast (guide §12).
      const withVote: GameState = { ...state, nominations };
      return wasDead && !voter.deadVoteSpent
        ? mapPlayer(withVote, voterId, (p) => ({ ...p, deadVoteSpent: true }))
        : withVote;
    }

    case 'NOMINATION_CLOSED': {
      const index = state.nominations.findIndex((n) => n.id === event.payload.id);
      if (index === -1) return state;
      const nominations = state.nominations.slice();
      nominations[index] = {
        ...nominations[index]!,
        closed: true,
        // Guide §10's threshold is per tally, so it is frozen per nomination.
        closedThreshold: event.payload.auditThreshold,
      };
      return { ...state, nominations };
    }

    case 'EXECUTION':
      // Forensic. The DEATH in the same transaction is what kills, and it is what
      // appends to todaysExecutions — so a no-execution day emits EXECUTION { null }
      // without touching the list (§4.7 row 4).
      return state;

    case 'VIRGIN_TRIGGERED':
      // The Virgin loses the ability either way, poisoned or not (§16.10). The
      // nominee is the Virgin; the nominator is who dies, in a separate DEATH
      // event in the same transaction.
      return mapPlayer(state, event.payload.nomineeId, (p) =>
        p.virginTriggered ? p : { ...p, virginTriggered: true },
      );

    case 'SLAYER_CLAIMED':
      // Only a real Slayer consumes the once-per-game ability. A bluffing claimant
      // has no ability to spend.
      return event.payload.claimantIsRealSlayer
        ? mapPlayer(state, event.payload.claimantId, (p) =>
            p.slayerUsed ? p : { ...p, slayerUsed: true },
          )
        : state;

    case 'RULE_FLAGGED':
      return {
        ...state,
        ruleFlags: [
          ...state.ruleFlags,
          { ...event.payload, phase: state.phase, seq: event.seq },
        ],
      };

    case 'NOTE_ADDED': {
      const { id, scope, playerId, text } = event.payload;
      return {
        ...state,
        notes: [
          ...state.notes,
          { id, scope, ...(playerId ? { playerId } : {}), text, seq: event.seq, phase: state.phase },
        ],
      };
    }

    case 'SPY_VIEWED':
    case 'SPY_VIEW_ENDED':
      // Audit trail only, and non-undoable (§3.4). No derived state.
      return state;

    case 'GAME_ENDED':
      return {
        ...state,
        victory: { status: event.payload.winner, reason: event.payload.reason },
      };

    default: {
      const exhaustive: never = event;
      throw new Error(
        `Unhandled event type: ${(exhaustive as { type?: string }).type ?? 'unknown'}`,
      );
    }
  }
}
```

The reducer deliberately does **not** decide anything about the Butler. Guide §10
lets the Master vote before or after, so the question is only answerable over a
nomination's finished vote set — which makes it a selector (Task 14), not a field
frozen when the vote lands.

- [ ] **Step 5: Write the fold**

`src/engine/reducer/fold.ts`:

```ts
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
```

- [ ] **Step 6: Write the test fixture helper**

`test/helpers/game.ts` — used by every later task, so it lives outside `src/`:

```ts
import { reduce } from '@/engine/reducer/fold';
import type { GameEvent } from '@/engine/events';
import type { CharacterId, GameState, PlayerId } from '@/engine/types';

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
    current =
      current.kind === 'night'
        ? { kind: 'day', number: current.number }
        : { kind: 'night', number: current.number + 1 };
    builder.push('PHASE_ADVANCED', { phase: current.kind, number: current.number });
    if (current.number > target.number + 1) {
      throw new Error(`advanceTo overshot ${target.kind} ${target.number}`);
    }
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

function teamOf(characterId: CharacterId): keyof typeof TEAM_KEYS {
  return TEAM_KEYS[characterId] ?? 'townsfolk';
}

// Filled from the edition data at module load so the fixture cannot drift.
const TEAM_KEYS: Record<string, 'townsfolk' | 'outsider' | 'minion' | 'demon'> = Object.fromEntries(
  Object.values(
    (await import('@/editions/troubleBrewing/characters')).CHARACTERS,
  ).map((c) => [c.id, c.team]),
);
```

Top-level `await import` in a helper is awkward; replace those last two declarations with a plain static import:

```ts
import { CHARACTERS } from '@/editions/troubleBrewing/characters';
import type { Team } from '@/editions/troubleBrewing/characters';

const TEAM_KEYS: Record<string, Team> = Object.fromEntries(
  Object.values(CHARACTERS).map((c) => [c.id, c.team]),
);

function teamOf(characterId: CharacterId): Team {
  const team = TEAM_KEYS[characterId];
  if (!team) throw new Error(`Fixture used unknown character ${characterId}`);
  return team;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck && npm run lint`
Expected: all green, all three commands clean.

- [ ] **Step 8: Commit**

```bash
git add src/engine test/helpers
git commit -m "$(cat <<'EOF'
feat(engine): add the event catalogue and the reducer core

24 event types with the §3.6 shapes, including the four v2 corrections: every
step event carries stepId, actorIds is always an array, NOMINATION_CLOSED's
tally fields are write-only forensics, and DAY_CLOSED carries no executedId.
CLAIM_RECORDED and CLAIM_RETRACTED are deferred to Slice 2.

applyEvent is the single write path and preserves referential identity of every
untouched sub-object, returning the same state object when an event changes
nothing. settledStepIds keys are night-scoped. A DEATH for a dead player and a
duplicate vote both produce no derived state change, per §4.8's integrity class.
Determinism tests double-reduce and round-trip the events through JSON with the
impurity guards armed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Setup — the legal deal

Draw order is the rule (§5.2): **Demon → Minions → apply setup modifiers → Outsiders → Townsfolk.** Applying the Baron before the Minions are known, or after the Outsiders are drawn, both produce an illegal set.

**Files:**
- Create: `src/engine/setup/deal.ts`
- Test: `src/engine/setup/deal.test.ts`

**Interfaces:**
- Consumes: `CHARACTERS`, `charactersByTeam`, `distributionFor`, `INFO_THRESHOLD_PLAYERS` (Task 2); `TeamCounts`, `DrunkBelief` (Tasks 2, 3).
- Produces:
  - `type Picker = <T>(items: readonly T[], count: number) => T[]` — injected randomness; the reducer never sees it (§3.3)
  - `randomPicker(): Picker`
  - `interface DealResult { assignments: Record<PlayerId, CharacterId>; distribution: TeamCounts; setupModifiers: Array<{ characterId: CharacterId; teamDeltas: Partial<TeamCounts> }>; demonBluffs: CharacterId[] | null; drunkBelief: DrunkBelief | null; redHerring: PlayerId | null }`
  - `deal(playerIds: readonly PlayerId[], pick: Picker): DealResult`
  - `rerollOne(result, playerId, pick): DealResult` — throws when the swap would change the setup-modifier set
  - `validateDeal(playerIds, result): string[]` — empty array means legal

- [ ] **Step 1: Write the failing test**

`src/engine/setup/deal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById } from '@/editions/troubleBrewing/characters';
import { distributionFor } from '@/editions/troubleBrewing/distribution';
import { deal, rerollOne, validateDeal, type Picker } from './deal';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Deterministic picker: always takes from the front of the list. */
const front: Picker = (items, count) => items.slice(0, count);

/**
 * Deterministic picker that prefers named characters, then falls back to the front.
 *
 * The read goes through `{ id?: unknown }` and `String(...)`, not
 * `{ id: string }`: narrowing an unconstrained `T` to `T & object` makes it
 * unassignable to a type with a *required* property, and tsc rejects the
 * assertion with TS2352.
 */
function preferring(...preferred: string[]): Picker {
  return <T,>(items: readonly T[], count: number): T[] => {
    const wanted = items.filter(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        preferred.includes(String((item as { id?: unknown }).id)),
    );
    const rest = items.filter((item) => !wanted.includes(item));
    return [...wanted, ...rest].slice(0, count);
  };
}

function teamCounts(assignments: Record<string, string>) {
  const counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const characterId of Object.values(assignments)) {
    counts[characterById(characterId).team] += 1;
  }
  return counts;
}

describe('deal — legality', () => {
  it.each([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
    'produces a legal set for %i players',
    (count) => {
      const result = deal(ids(count), front);
      expect(validateDeal(ids(count), result)).toEqual([]);
      expect(Object.keys(result.assignments)).toHaveLength(count);
      expect(teamCounts(result.assignments)).toEqual(result.distribution);
    },
  );

  it('assigns every character at most once', () => {
    const result = deal(ids(15), front);
    const assigned = Object.values(result.assignments);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('always includes exactly one Demon', () => {
    const result = deal(ids(9), front);
    expect(Object.values(result.assignments).filter((c) => characterById(c).team === 'demon')).toEqual(['imp']);
  });
});

describe('deal — Baron draw order (§5.2)', () => {
  it('records the post-modifier distribution when the Baron is drawn', () => {
    const result = deal(ids(9), preferring('baron'));
    expect(Object.values(result.assignments)).toContain('baron');
    // 9 players is 5/2/1/1; the Baron makes it 3/4/1/1.
    expect(result.distribution).toEqual({ townsfolk: 3, outsider: 4, minion: 1, demon: 1 });
    expect(teamCounts(result.assignments)).toEqual(result.distribution);
    expect(result.setupModifiers).toEqual([
      { characterId: 'baron', teamDeltas: { townsfolk: -2, outsider: 2 } },
    ]);
  });

  it('leaves the distribution at the chart value when the Baron is not drawn', () => {
    const result = deal(ids(9), (items, count) =>
      items.filter((i) => (i as { id?: string }).id !== 'baron').slice(0, count),
    );
    expect(result.distribution).toEqual(distributionFor(9));
    expect(result.setupModifiers).toEqual([]);
  });

  it('never draws more Outsiders than the edition has', () => {
    // 15 players is 9/2/3/1; the Baron makes it 7/4/3/1 and there are exactly 4.
    const result = deal(ids(15), preferring('baron'));
    expect(result.distribution.outsider).toBe(4);
    expect(teamCounts(result.assignments).outsider).toBe(4);
  });
});

describe('deal — demon bluffs (§5.2)', () => {
  it('withholds bluffs below 7 players', () => {
    expect(deal(ids(5), front).demonBluffs).toBeNull();
    expect(deal(ids(6), front).demonBluffs).toBeNull();
  });

  it('gives exactly 3 bluffs at 7 players and above', () => {
    for (const count of [7, 10, 15]) {
      expect(deal(ids(count), front).demonBluffs).toHaveLength(3);
    }
  });

  it('draws bluffs only from good characters not in play', () => {
    const result = deal(ids(10), front);
    const inPlay = new Set(Object.values(result.assignments));
    for (const bluff of result.demonBluffs ?? []) {
      expect(inPlay.has(bluff)).toBe(false);
      expect(['townsfolk', 'outsider']).toContain(characterById(bluff).team);
    }
  });
});

describe('deal — the Drunk (§5.2, guide §13)', () => {
  it('assigns a believed Townsfolk not otherwise in play when the Drunk is drawn', () => {
    const result = deal(ids(9), preferring('drunk'));
    expect(Object.values(result.assignments)).toContain('drunk');
    const belief = result.drunkBelief;
    expect(belief).not.toBeNull();
    expect(characterById(belief!.believesCharacterId).team).toBe('townsfolk');
    expect(Object.values(result.assignments)).not.toContain(belief!.believesCharacterId);
    expect(result.assignments[belief!.playerId]).toBe('drunk');
  });

  it('leaves drunkBelief null when the Drunk is not in play', () => {
    const result = deal(ids(9), (items, count) =>
      items.filter((i) => (i as { id?: string }).id !== 'drunk').slice(0, count),
    );
    expect(result.drunkBelief).toBeNull();
  });

  // The Drunk occupies an Outsider slot, so the public Townsfolk count is unchanged.
  it('does not alter the distribution', () => {
    const result = deal(ids(9), preferring('drunk'));
    expect(result.distribution.outsider).toBeGreaterThanOrEqual(1);
    expect(teamCounts(result.assignments)).toEqual(result.distribution);
  });
});

describe('deal — the red herring (§5.2)', () => {
  it('picks a good player', () => {
    const result = deal(ids(10), front);
    expect(result.redHerring).not.toBeNull();
    const characterId = result.assignments[result.redHerring!]!;
    expect(characterById(characterId).team === 'minion' || characterById(characterId).team === 'demon').toBe(false);
  });

  // §5.2 — "any good player, possibly the Fortune Teller themselves". Asserted
  // against the legality rule rather than by contriving a picker that lands on
  // them, which would only test the picker.
  it('accepts the Fortune Teller as the red herring', () => {
    const result = deal(ids(10), front);
    const ftId = Object.entries(result.assignments).find(([, c]) => c === 'fortune_teller')?.[0];
    expect(ftId).toBeDefined();
    expect(validateDeal(ids(10), { ...result, redHerring: ftId! })).toEqual([]);
  });
});

describe('validateDeal', () => {
  it('rejects a hand-edited set with two Demons', () => {
    const result = deal(ids(7), front);
    const [firstId] = Object.keys(result.assignments);
    const broken = { ...result, assignments: { ...result.assignments, [firstId!]: 'imp' } };
    expect(validateDeal(ids(7), broken).join(' ')).toMatch(/demon/i);
  });

  it('rejects a set that omits a player', () => {
    const result = deal(ids(7), front);
    const assignments = { ...result.assignments };
    delete assignments.p7;
    expect(validateDeal(ids(7), { ...result, assignments }).join(' ')).toMatch(/p7/);
  });

  it('rejects a duplicate character', () => {
    const result = deal(ids(7), front);
    const [a, b] = Object.keys(result.assignments);
    const assignments = { ...result.assignments, [b!]: result.assignments[a!]! };
    expect(validateDeal(ids(7), { ...result, assignments }).join(' ')).toMatch(/twice|duplicate/i);
  });

  it('rejects a Drunk in play with no belief recorded', () => {
    const result = deal(ids(9), preferring('drunk'));
    expect(validateDeal(ids(9), { ...result, drunkBelief: null }).join(' ')).toMatch(/drunk/i);
  });

  it('rejects a swap that changes the team counts with no Baron in play', () => {
    const result = deal(ids(9), front);
    const townsfolkId = Object.entries(result.assignments).find(
      ([, c]) => characterById(c).team === 'townsfolk',
    )![0];
    // Hand-edit a Townsfolk into an Outsider without touching the distribution.
    const broken = {
      ...result,
      assignments: { ...result.assignments, [townsfolkId]: 'saint' },
    };
    expect(validateDeal(ids(9), broken).join(' ')).toMatch(/the chart for 9 players/);
  });

  it('accepts a Baron set at every player count from 7 to 15', () => {
    for (const count of [7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      const result = deal(ids(count), preferring('baron'));
      expect(validateDeal(ids(count), result)).toEqual([]);
    }
  });

  it('rejects setupModifiers that name a character not in the set', () => {
    const result = deal(ids(9), front);
    const broken = {
      ...result,
      setupModifiers: [{ characterId: 'baron', teamDeltas: { townsfolk: -2, outsider: 2 } }],
    };
    expect(validateDeal(ids(9), broken).join(' ')).toMatch(/not in the set/);
  });

  it('refuses to reroll the Baron on its own, because the extra Outsiders are already dealt', () => {
    const result = deal(ids(9), preferring('baron'));
    const baronPlayerId = Object.entries(result.assignments).find(([, c]) => c === 'baron')![0];
    expect(() => rerollOne(result, baronPlayerId, front)).toThrow(/reroll the whole set/i);
  });

  it('keeps a one-player reroll legal', () => {
    const result = deal(ids(9), front);
    const [firstId] = Object.keys(result.assignments);
    const rerolled = rerollOne(result, firstId!, (items, count) => items.slice(-count));
    expect(validateDeal(ids(9), rerolled)).toEqual([]);
  });

  it('accepts every character in the edition as a legal member of its own team', () => {
    // Guards against a typo in CHARACTERS that would make a character undealable.
    for (const character of Object.values(CHARACTERS)) {
      expect(['townsfolk', 'outsider', 'minion', 'demon']).toContain(character.team);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/setup`
Expected: FAIL — `Cannot find module './deal'`.

- [ ] **Step 3: Write the deal**

`src/engine/setup/deal.ts`:

```ts
import {
  CHARACTERS,
  characterById,
  charactersByTeam,
  type Character,
  type Team,
  type TeamCounts,
} from '@/editions/troubleBrewing/characters';
import {
  INFO_THRESHOLD_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  distributionFor,
} from '@/editions/troubleBrewing/distribution';
import type { CharacterId, DerivationLine, DrunkBelief, PlayerId } from '@/engine/types';

/**
 * Injected randomness. Every draw happens here, in the command layer, and the
 * outcome is frozen onto ROLES_ASSIGNED as literal data — the reducer never draws
 * (§3.3). Tests pass a deterministic picker.
 */
export type Picker = <T>(items: readonly T[], count: number) => T[];

export function randomPicker(): Picker {
  return <T,>(items: readonly T[], count: number): T[] => {
    const pool = items.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, count);
  };
}

export interface DealResult {
  assignments: Record<PlayerId, CharacterId>;
  /** Post-modifier counts. Public and displayed persistently (§5.4). */
  distribution: TeamCounts;
  setupModifiers: Array<{ characterId: CharacterId; teamDeltas: Partial<TeamCounts> }>;
  demonBluffs: CharacterId[] | null;
  drunkBelief: DrunkBelief | null;
  redHerring: PlayerId | null;
}

function applyModifiers(
  base: TeamCounts,
  drawn: readonly Character[],
): { distribution: TeamCounts; setupModifiers: DealResult['setupModifiers'] } {
  const setupModifiers: DealResult['setupModifiers'] = [];
  const distribution: TeamCounts = { ...base };
  for (const character of drawn) {
    if (!character.setupModifiers) continue;
    setupModifiers.push({ characterId: character.id, teamDeltas: character.setupModifiers });
    for (const [team, delta] of Object.entries(character.setupModifiers)) {
      distribution[team as Team] += delta ?? 0;
    }
  }
  for (const team of ['townsfolk', 'outsider', 'minion', 'demon'] as const) {
    const available = charactersByTeam(team).length;
    if (distribution[team] < 0) {
      throw new Error(`Setup modifiers drove ${team} below zero`);
    }
    if (distribution[team] > available) {
      throw new Error(
        `Setup modifiers need ${distribution[team]} ${team} but the edition has ${available}`,
      );
    }
  }
  return { distribution, setupModifiers };
}

/** §5.2 draw order: Demon, Minions, apply modifiers, Outsiders, Townsfolk. */
export function deal(playerIds: readonly PlayerId[], pick: Picker): DealResult {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }
  const base = distributionFor(playerIds.length);

  const demons = pick(charactersByTeam('demon'), base.demon);
  const minions = pick(charactersByTeam('minion'), base.minion);

  const { distribution, setupModifiers } = applyModifiers(base, [...demons, ...minions]);

  const outsiders = pick(charactersByTeam('outsider'), distribution.outsider);
  const townsfolk = pick(charactersByTeam('townsfolk'), distribution.townsfolk);

  const drawn = [...demons, ...minions, ...outsiders, ...townsfolk];
  if (drawn.length !== playerIds.length) {
    throw new Error(
      `Drew ${drawn.length} characters for ${playerIds.length} players — the picker returned short`,
    );
  }

  // Characters are placed onto seats by the picker's own order over the seats, so
  // the ordering of the draw does not leak into the seating.
  const seatOrder = pick(playerIds, playerIds.length);
  const assignments: Record<PlayerId, CharacterId> = {};
  seatOrder.forEach((playerId, index) => {
    assignments[playerId] = drawn[index]!.id;
  });

  const inPlay = new Set(drawn.map((c) => c.id));

  // Bluffs: 3 good characters not in play, 7+ players only (§5.2, guide §2).
  const demonBluffs =
    playerIds.length >= INFO_THRESHOLD_PLAYERS
      ? pick(
          [...charactersByTeam('townsfolk'), ...charactersByTeam('outsider')].filter(
            (c) => !inPlay.has(c.id),
          ),
          3,
        ).map((c) => c.id)
      : null;

  // The Drunk's believed Townsfolk: not otherwise in play. It may legally collide
  // with a demon bluff — a bluff is not in play either (§5.2).
  const drunkPlayerId = Object.entries(assignments).find(([, c]) => c === 'drunk')?.[0] ?? null;
  const drunkBelief: DrunkBelief | null = drunkPlayerId
    ? {
        playerId: drunkPlayerId,
        believesCharacterId: pick(
          charactersByTeam('townsfolk').filter((c) => !inPlay.has(c.id)),
          1,
        )[0]!.id,
      }
    : null;

  // The red herring: any good player, possibly the Fortune Teller themselves (§5.2).
  const goodPlayerIds = Object.entries(assignments)
    .filter(([, characterId]) => {
      const { team } = characterById(characterId);
      return team === 'townsfolk' || team === 'outsider';
    })
    .map(([playerId]) => playerId);
  const redHerring = goodPlayerIds.length > 0 ? pick(goodPlayerIds, 1)[0]! : null;

  return { assignments, distribution, setupModifiers, demonBluffs, drunkBelief, redHerring };
}

/**
 * Swaps one player onto a fresh character of the same team, keeping the set legal.
 *
 * REFUSES a swap that would change the setup-modifier set, because it cannot: the
 * Baron's +2 Outsiders were already dealt into other seats, and rerolling the
 * Baron away would leave four Outsiders where the chart wants two. §5.3 offers
 * "reroll all" for that, and the UI should route there.
 */
export function rerollOne(
  result: DealResult,
  playerId: PlayerId,
  pick: Picker,
): DealResult {
  const current = result.assignments[playerId];
  if (!current) throw new Error(`${playerId} has no assignment to reroll`);
  const { team } = characterById(current);
  const inPlay = new Set(Object.values(result.assignments));
  const options = charactersByTeam(team).filter(
    (c) => !inPlay.has(c.id) && sameModifiers(c.setupModifiers, characterById(current).setupModifiers),
  );
  if (options.length === 0) {
    if (characterById(current).setupModifiers !== null) {
      throw new Error(
        `${characterById(current).name} changes the Outsider count, so it cannot be rerolled on its own — reroll the whole set (§5.3)`,
      );
    }
    return result;
  }

  const replacement = pick(options, 1)[0]!;
  const assignments = { ...result.assignments, [playerId]: replacement.id };

  // A reroll can invalidate the Baron's modifiers, the Drunk's belief, the bluffs
  // and the red herring, so recompute the three derived fields rather than patch them.
  const drawn = Object.values(assignments).map(characterById);
  const base = distributionFor(Object.keys(assignments).length);
  const { distribution, setupModifiers } = applyModifiers(base, drawn);
  const nextInPlay = new Set(assignments ? Object.values(assignments) : []);

  const drunkPlayerId = Object.entries(assignments).find(([, c]) => c === 'drunk')?.[0] ?? null;
  const beliefStillLegal =
    result.drunkBelief !== null &&
    drunkPlayerId === result.drunkBelief.playerId &&
    !nextInPlay.has(result.drunkBelief.believesCharacterId);

  const drunkBelief: DrunkBelief | null = drunkPlayerId
    ? beliefStillLegal
      ? result.drunkBelief
      : {
          playerId: drunkPlayerId,
          believesCharacterId: pick(
            charactersByTeam('townsfolk').filter((c) => !nextInPlay.has(c.id)),
            1,
          )[0]!.id,
        }
    : null;

  const demonBluffs =
    result.demonBluffs === null
      ? null
      : result.demonBluffs.some((id) => nextInPlay.has(id))
        ? pick(
            [...charactersByTeam('townsfolk'), ...charactersByTeam('outsider')].filter(
              (c) => !nextInPlay.has(c.id),
            ),
            3,
          ).map((c) => c.id)
        : result.demonBluffs;

  const goodPlayerIds = Object.entries(assignments)
    .filter(([, characterId]) => {
      const { team: t } = characterById(characterId);
      return t === 'townsfolk' || t === 'outsider';
    })
    .map(([id]) => id);
  const redHerring =
    result.redHerring !== null && goodPlayerIds.includes(result.redHerring)
      ? result.redHerring
      : (goodPlayerIds[0] ?? null);

  return { assignments, distribution, setupModifiers, demonBluffs, drunkBelief, redHerring };
}

function sameModifiers(a: Partial<TeamCounts> | null, b: Partial<TeamCounts> | null): boolean {
  if (a === null || b === null) return a === b;
  return (['townsfolk', 'outsider', 'minion', 'demon'] as const).every(
    (team) => (a[team] ?? 0) === (b[team] ?? 0),
  );
}

/**
 * §8.2 applied to the public counts. Guide §2 calls the Baron "the character most
 * likely to confuse newcomers because it silently changes the Outsider count", and
 * §5.4 displays this distribution persistently — so the one number the whole table
 * reasons from shows its working.
 */
export function distributionDerivation(
  playerCount: number,
  result: DealResult,
): DerivationLine[] {
  const base = distributionFor(playerCount);
  const fmt = (c: TeamCounts): string => `${c.townsfolk}/${c.outsider}/${c.minion}/${c.demon}`;
  const lines: DerivationLine[] = [
    { label: 'chart', detail: `${playerCount} players -> ${fmt(base)} (T/O/M/D)` },
  ];
  for (const modifier of result.setupModifiers) {
    const deltas = Object.entries(modifier.teamDeltas)
      .map(([team, delta]) => `${(delta ?? 0) > 0 ? '+' : ''}${delta} ${team}`)
      .join(', ');
    lines.push({
      label: characterById(modifier.characterId).name,
      detail: `${deltas}`,
    });
  }
  lines.push({ label: 'result', detail: `-> ${fmt(result.distribution)}` });
  return lines;
}

/** Empty array means legal. Re-run after every manual edit (§5.3). */
export function validateDeal(playerIds: readonly PlayerId[], result: DealResult): string[] {
  const issues: string[] = [];
  const assigned = Object.keys(result.assignments);

  for (const playerId of playerIds) {
    if (!result.assignments[playerId]) issues.push(`${playerId} has no character assigned.`);
  }
  for (const playerId of assigned) {
    if (!playerIds.includes(playerId)) issues.push(`${playerId} is not in the game.`);
  }

  const seen = new Map<CharacterId, number>();
  for (const characterId of Object.values(result.assignments)) {
    if (!CHARACTERS[characterId]) {
      issues.push(`${characterId} is not a Trouble Brewing character.`);
      continue;
    }
    seen.set(characterId, (seen.get(characterId) ?? 0) + 1);
  }
  for (const [characterId, count] of seen) {
    if (count > 1) issues.push(`${characterById(characterId).name} is assigned twice.`);
  }

  const counts: TeamCounts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const characterId of Object.values(result.assignments)) {
    if (CHARACTERS[characterId]) counts[characterById(characterId).team] += 1;
  }
  for (const team of ['townsfolk', 'outsider', 'minion', 'demon'] as const) {
    if (counts[team] !== result.distribution[team]) {
      issues.push(
        `${team}: the set has ${counts[team]} but the recorded distribution says ${result.distribution[team]}.`,
      );
    }
  }
  if (counts.demon !== 1) issues.push(`There must be exactly one Demon, found ${counts.demon}.`);

  // §5.3 — "Legality re-validated". Without this the recorded distribution is only
  // checked against itself, so a hand edit that swaps a Townsfolk for an Outsider
  // with no Baron in play passes, and Lock In accepts a set no legal deal could
  // produce.
  if (playerIds.length >= MIN_PLAYERS && playerIds.length <= MAX_PLAYERS) {
    const drawn = Object.values(result.assignments).filter((id) => CHARACTERS[id]).map(characterById);
    const expected: TeamCounts = { ...distributionFor(playerIds.length) };
    for (const character of drawn) {
      for (const [team, delta] of Object.entries(character.setupModifiers ?? {})) {
        expected[team as Team] += delta ?? 0;
      }
    }
    for (const team of ['townsfolk', 'outsider', 'minion', 'demon'] as const) {
      if (result.distribution[team] !== expected[team]) {
        issues.push(
          `${team}: the chart for ${playerIds.length} players plus setup modifiers wants ${expected[team]}, but the set records ${result.distribution[team]}.`,
        );
      }
    }
    const modifierIds = new Set(result.setupModifiers.map((m) => m.characterId));
    for (const character of drawn) {
      if (character.setupModifiers && !modifierIds.has(character.id)) {
        issues.push(`${character.name} changes the team counts but is not recorded in setupModifiers.`);
      }
    }
    for (const id of modifierIds) {
      if (!Object.values(result.assignments).includes(id)) {
        issues.push(`setupModifiers names ${id}, which is not in the set.`);
      }
    }
  }

  const drunkInPlay = Object.values(result.assignments).includes('drunk');
  if (drunkInPlay && result.drunkBelief === null) {
    issues.push('The Drunk is in play but no believed character is recorded.');
  }
  if (result.drunkBelief) {
    if (result.assignments[result.drunkBelief.playerId] !== 'drunk') {
      issues.push('The recorded Drunk belief is attached to a player who is not the Drunk.');
    }
    if (Object.values(result.assignments).includes(result.drunkBelief.believesCharacterId)) {
      issues.push('The Drunk believes they are a character that is in play.');
    }
  }

  if (result.demonBluffs) {
    if (result.demonBluffs.length !== 3) {
      issues.push(`Demon bluffs must number 3, found ${result.demonBluffs.length}.`);
    }
    const inPlay = new Set(Object.values(result.assignments));
    for (const bluff of result.demonBluffs) {
      if (inPlay.has(bluff)) issues.push(`${characterById(bluff).name} is a bluff but is in play.`);
    }
  }
  if (playerIds.length < INFO_THRESHOLD_PLAYERS && result.demonBluffs !== null) {
    issues.push(`Bluffs apply only at ${INFO_THRESHOLD_PLAYERS}+ players.`);
  }

  if (result.redHerring) {
    const characterId = result.assignments[result.redHerring];
    if (!characterId) issues.push('The red herring is not a player in this game.');
    else if (['minion', 'demon'].includes(characterById(characterId).team)) {
      issues.push('The red herring must be a good player.');
    }
  }

  return issues;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/setup && npm run typecheck`
Expected: all green.

If `deal(ids(15), preferring('baron'))` fails because the picker returns the Baron but the Outsider pool is exhausted, that is the test doing its job: check that `applyModifiers` runs **after** the Minion draw and **before** the Outsider draw.

- [ ] **Step 5: Commit**

```bash
git add src/engine/setup
git commit -m "$(cat <<'EOF'
feat(setup): add the legal deal with Baron draw order

Draw order is Demon, Minions, apply setup modifiers, Outsiders, Townsfolk
(§5.2) — applying the Baron before the Minions are known or after the Outsiders
are drawn both produce an illegal set, so the order has its own tests. Bluffs
are withheld below 7 players, the Drunk's believed Townsfolk is drawn from
characters not in play, and the red herring may be the Fortune Teller.

Randomness is injected as a Picker so the reducer never draws (§3.3).
validateDeal re-checks legality after every manual edit and is what the Lock In
button will gate on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Perceived character, ability functionality, and the ESLint boundary

§4.1's invariant is the single load-bearing rule in the engine: without it, an implementer writes `perceivedCharacterId(x) === 'soldier'` in the kill resolver and a Drunk-believing-Soldier survives the Demon. This task builds the function and the lint rule that confines it, and tests both.

**Files:**
- Create: `src/engine/selectors/statuses.ts`
- Create: `src/engine/selectors/players.ts`
- Create: `src/engine/selectors/predicates.ts`
- Create: `src/engine/selectors/rulesView.ts`
- Modify: `eslint.config.js`
- Test: `src/engine/selectors/predicates.test.ts`, `src/engine/selectors/players.test.ts`, `test/eslint-perceived-character.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, and `buildGame` from Task 4.
- Produces:
  - `activeStatuses(player, phase): StatusEntry[]`
  - `isPoisoned(player, phase): boolean` — requires `effective === true`
  - `isProtected(player, phase): boolean` — requires `effective === true`
  - `masterOf(view, butlerId): RulesViewPlayer | null`
  - `isRedHerring(view, playerId): boolean`
  - `alive(player): boolean`, `aliveCount(view): number`, `livingPlayers(view)`
  - `isDrunk(player): boolean`
  - `perceivedCharacterId(view, playerId): CharacterId` — **restricted by ESLint**
  - `playersWithPerceivedCharacter(view, characterId): RulesViewPlayer[]` — **restricted by ESLint**
  - `abilityFunctional(view, player): boolean`
  - `toRulesView(state): RulesView` — field by field, no spreads

- [ ] **Step 1: Write the failing tests**

`src/engine/selectors/predicates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from './rulesView';
import { abilityFunctional, isDrunk } from './predicates';
import { grimoireTokens, isPoisoned, isProtected } from './statuses';
import type { RulesView, RulesViewPlayer } from '@/engine/types';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'monk'],
  ['p4', 'ravenkeeper'],
  ['p5', 'saint'],
  ['p6', 'drunk'],
  ['p7', 'recluse'],
];

function view(builder: ReturnType<typeof buildGame>): RulesView {
  return toRulesView(builder.state);
}

function player(v: RulesView, id: string): RulesViewPlayer {
  const found = v.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

function game() {
  return buildGame({
    roles: ROLES,
    drunkBelief: { playerId: 'p6', believesCharacterId: 'empath' },
    redHerring: 'p5',
    demonBluffs: ['soldier', 'mayor', 'chef'],
  });
}

describe('abilityFunctional (§4.2)', () => {
  it('is true for a living, sober, unpoisoned player', () => {
    const v = view(game());
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(true);
  });

  // The v2 bug: a hardcoded `alive &&` disabled the Ravenkeeper permanently.
  it('is true for a DEAD Ravenkeeper — their ability fires because they died', () => {
    const b = game();
    b.push('DEATH', { playerId: 'p4', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    const v = view(b);
    expect(player(v, 'p4').alive).toBe(false);
    expect(abilityFunctional(v, player(v, 'p4'))).toBe(true);
  });

  // The other half of the same v2 bug: it made evil never win on a Saint execution.
  it('is true for a DEAD executed Saint', () => {
    const b = game();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DEATH', {
      playerId: 'p5',
      characterIdAtDeath: 'saint',
      cause: 'execution',
      executionKind: 'vote',
    });
    const v = view(b);
    expect(abilityFunctional(v, player(v, 'p5'))).toBe(true);
  });

  it('is false for a dead Monk', () => {
    const b = game();
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'monk', cause: 'demon' });
    const v = view(b);
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(false);
  });

  it('is false for a poisoned Monk', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    });
    const v = view(b);
    expect(isPoisoned(player(v, 'p3'), v.phase)).toBe(true);
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(false);
  });

  it('is false for the Drunk, always', () => {
    const v = view(game());
    expect(isDrunk(player(v, 'p6'))).toBe(true);
    expect(abilityFunctional(v, player(v, 'p6'))).toBe(false);
  });

  // §3.6 — a suppressed effect still places the reminder token, so an ineffective
  // poison mark must not poison anyone.
  it('ignores a poison mark applied with effective: false', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: false,
      expiresAt: { kind: 'day', number: 1 },
    });
    const v = view(b);
    expect(player(v, 'p3').statusLedger).toHaveLength(1);
    expect(isPoisoned(player(v, 'p3'), v.phase)).toBe(false);
    expect(abilityFunctional(v, player(v, 'p3'))).toBe(true);
  });

  // §10.1 — the canary for the token projection, live from Plan 1 rather than
  // discovered in Plan 3 when there are ten callers.
  it('never exposes effectiveness through grimoireTokens (§10.1)', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p1',
      status: 'protected',
      sourcePlayerId: 'p3',
      effective: false,
      expiresAt: { kind: 'night', number: 1 },
    });
    const v = view(b);
    const tokens = grimoireTokens(player(v, 'p1'), v.phase);
    expect(tokens).toHaveLength(1);
    expect(Object.keys(tokens[0]!)).not.toContain('effective');
    expect(JSON.stringify(tokens)).not.toMatch(/effective/);
  });

  it('ignores a protection mark applied with effective: false', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p1',
      status: 'protected',
      sourcePlayerId: 'p3',
      effective: false,
      expiresAt: { kind: 'night', number: 1 },
    });
    const v = view(b);
    expect(isProtected(player(v, 'p1'), v.phase)).toBe(false);
  });
});

describe('registration is not an ability (§4.2)', () => {
  it('leaves a poisoned Recluse registering ambiguously', () => {
    const b = game();
    b.push('STATUS_APPLIED', {
      playerId: 'p7',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    });
    const v = view(b);
    // The Recluse's ability is not functional...
    expect(abilityFunctional(v, player(v, 'p7'))).toBe(false);
    // ...but registration is a passive property and is unaffected.
    const { registrationOptionsForCharacterId } = await import(
      '@/editions/troubleBrewing/registration'
    );
    expect(registrationOptionsForCharacterId('recluse')).toHaveLength(3);
  });
});

describe('toRulesView (§6.2)', () => {
  it('omits every private field the edition layer must not see', () => {
    const b = game();
    b.push('NOTE_ADDED', { id: 'n', scope: 'game', text: 'secret' });
    b.push('RULE_FLAGGED', { rule: 'x', relatedTxId: 'tx1', class: 'social', detail: 'y' });
    // Double assertion: RulesView is an interface, so it has no implicit index
    // signature and neither direction of the comparability check succeeds. Going
    // through `unknown` is the only cast tsc accepts here.
    const v = view(b) as unknown as Record<string, unknown>;
    expect('notes' in v).toBe(false);
    expect('ruleFlags' in v).toBe(false);
    expect('stPrivate' in v).toBe(false);
    expect('nominations' in v).toBe(false);
    expect('settledStepIds' in v).toBe(false);
    for (const p of (v.players as Array<Record<string, unknown>>)) {
      expect('claims' in p).toBe(false);
      expect('infoHistory' in p).toBe(false);
      expect('deadVoteSpent' in p).toBe(false);
    }
  });

  it('carries the fields resolvers genuinely need', () => {
    const v = view(game());
    expect(v.drunkBelief).toEqual({ playerId: 'p6', believesCharacterId: 'empath' });
    expect(v.redHerringPlayerId).toBe('p5');
    expect(v.demonBluffs).toEqual(['soldier', 'mayor', 'chef']);
    expect(v.phase).toEqual({ kind: 'night', number: 1 });
    expect(v.players).toHaveLength(7);
  });
});
```

Note the `await import` inside a non-async test above will not compile. Fix it by hoisting that import to the top of the file:

```ts
import { registrationOptionsForCharacterId } from '@/editions/troubleBrewing/registration';
```

and using it directly in the test body.

`src/engine/selectors/players.test.ts` — the Drunk's waking behaviour:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from './rulesView';
import { perceivedCharacterId, playersWithPerceivedCharacter } from './players';

function game() {
  return buildGame({
    roles: [
      ['p1', 'imp'],
      ['p2', 'poisoner'],
      ['p3', 'empath'],
      ['p4', 'drunk'],
      ['p5', 'monk'],
      ['p6', 'soldier'],
      ['p7', 'chef'],
    ],
    // The Drunk believes they are the Empath — and a real Empath is also in play.
    drunkBelief: { playerId: 'p4', believesCharacterId: 'empath' },
  });
}

describe('perceivedCharacterId (§4.1)', () => {
  it('returns the believed character for the Drunk', () => {
    const v = toRulesView(game().state);
    expect(perceivedCharacterId(v, 'p4')).toBe('empath');
  });

  it('returns the true character for everyone else', () => {
    const v = toRulesView(game().state);
    expect(perceivedCharacterId(v, 'p3')).toBe('empath');
    expect(perceivedCharacterId(v, 'p1')).toBe('imp');
    expect(perceivedCharacterId(v, 'p6')).toBe('soldier');
  });

  it('returns the true character when a Drunk belief is recorded for someone else', () => {
    const v = toRulesView(game().state);
    // p6 is the Soldier and no belief names them, so no false self-belief applies.
    expect(perceivedCharacterId(v, 'p6')).toBe('soldier');
  });
});

describe('playersWithPerceivedCharacter (§4.1)', () => {
  it('wakes the real Empath and the Drunk-believing-Empath as two separate actors', () => {
    const v = toRulesView(game().state);
    const actors = playersWithPerceivedCharacter(v, 'empath').map((p) => p.id);
    expect(actors.sort()).toEqual(['p3', 'p4']);
  });

  it('does not wake the Drunk at the Drunk step', () => {
    const v = toRulesView(game().state);
    expect(playersWithPerceivedCharacter(v, 'drunk')).toEqual([]);
  });

  it('returns an array even for a character not in play', () => {
    const v = toRulesView(game().state);
    expect(playersWithPerceivedCharacter(v, 'ravenkeeper')).toEqual([]);
  });

  it('orders actors by seat so the night runs round the circle', () => {
    const v = toRulesView(game().state);
    const seats = playersWithPerceivedCharacter(v, 'empath').map((p) => p.seat);
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
  });
});
```

`test/eslint-perceived-character.test.ts` — the invariant's enforcement, tested:

```ts
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

async function lint(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? 'unknown'}: ${m.message}`);
}

describe('§4.1 enforcement — where perceivedCharacterId may be imported', () => {
  it('rejects the import from a rules module', async () => {
    const messages = await lint(
      'src/engine/rules/demonKill.ts',
      `import { perceivedCharacterId } from '../selectors/players';\nexport const x = perceivedCharacterId;\n`,
    );
    expect(messages.join('\n')).toMatch(/no-restricted-imports/);
    expect(messages.join('\n')).toMatch(/§4\.1/);
  });

  it('rejects the aliased import from a rules module too', async () => {
    const messages = await lint(
      'src/engine/rules/demonKill.ts',
      `import { playersWithPerceivedCharacter } from '@/engine/selectors/players';\nexport const x = playersWithPerceivedCharacter;\n`,
    );
    expect(messages.join('\n')).toMatch(/no-restricted-imports/);
  });

  it('allows other imports from the same module', async () => {
    const messages = await lint(
      'src/engine/rules/demonKill.ts',
      `import { alive } from '../selectors/players';\nexport const x = alive;\n`,
    );
    expect(messages.join('\n')).not.toMatch(/no-restricted-imports/);
  });

  it('allows the import in the night order, where wakes() lives', async () => {
    const messages = await lint(
      'src/editions/troubleBrewing/nightOrder.ts',
      `import { playersWithPerceivedCharacter } from '@/engine/selectors/players';\nexport const x = playersWithPerceivedCharacter;\n`,
    );
    expect(messages.join('\n')).not.toMatch(/no-restricted-imports/);
  });

  it('allows the import in UI code', async () => {
    const messages = await lint(
      'src/ui/Grimoire.tsx',
      `import { perceivedCharacterId } from '@/engine/selectors/players';\nexport const x = perceivedCharacterId;\n`,
    );
    expect(messages.join('\n')).not.toMatch(/no-restricted-imports/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/selectors test/eslint-perceived-character.test.ts`
Expected: FAIL — modules not found, and the ESLint test reports no `no-restricted-imports` message.

- [ ] **Step 3: Write the status selectors**

`src/engine/selectors/statuses.ts`:

```ts
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
```

- [ ] **Step 4: Write the player selectors**

`src/engine/selectors/players.ts`. The file-level comment is the enforcement's documentation; the ESLint rule is its teeth.

```ts
import type { CharacterId, PlayerId, RulesView, RulesViewPlayer } from '../types';

export function alive(player: Pick<RulesViewPlayer, 'alive'>): boolean {
  return player.alive;
}

export function livingPlayers(view: RulesView): RulesViewPlayer[] {
  return view.players.filter(alive);
}

export function aliveCount(view: RulesView): number {
  return livingPlayers(view).length;
}

export function playerById(view: RulesView, playerId: PlayerId): RulesViewPlayer {
  const player = view.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player id: ${playerId}`);
  return player;
}

export function bySeat(view: RulesView): RulesViewPlayer[] {
  return [...view.players].sort((a, b) => a.seat - b.seat);
}

/**
 * §4.1 — RESTRICTED. May be consulted ONLY by a step's wakes() and by step/UI
 * rendering. Every rules predicate — kill resolution, victory, Virgin, Slayer,
 * registration, alignment, distribution, and every "learn a character" answer —
 * must read the TRUE characterId.
 *
 * Enforced by no-restricted-imports in eslint.config.js. Do not widen the
 * allow-list without reading §4.1: the failure mode is a Drunk-believing-Soldier
 * surviving the Demon, and no test outside the kill resolver would catch it.
 */
export function perceivedCharacterId(view: RulesView, playerId: PlayerId): CharacterId {
  const player = playerById(view, playerId);
  const belief = view.drunkBelief;
  if (belief && belief.playerId === playerId) {
    // Only a character flagged falseSelfBelief can carry one, and the deal
    // validator guarantees the belief is attached to that character (§5).
    return belief.believesCharacterId;
  }
  return player.characterId;
}

/**
 * §4.1 — RESTRICTED, same rule as perceivedCharacterId. Always returns an array,
 * ordered by seat, so a real Empath and a Drunk-believing-Empath both wake at the
 * Empath step, separately.
 */
export function playersWithPerceivedCharacter(
  view: RulesView,
  characterId: CharacterId,
): RulesViewPlayer[] {
  return bySeat(view).filter((p) => perceivedCharacterId(view, p.id) === characterId);
}
```

- [ ] **Step 5: Write the predicates and the rules view**

`src/engine/selectors/predicates.ts`:

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import type { RulesView, RulesViewPlayer } from '../types';
import { isPoisoned } from './statuses';

/** Engine code naming a Trouble Brewing character is expected and allowed (§3.8). */
export function isDrunk(player: Pick<RulesViewPlayer, 'characterId'>): boolean {
  return player.characterId === 'drunk';
}

/**
 * §4.2. Deliberately does NOT hardcode `alive` — requiresAlive lives on the
 * character, and is false for the Ravenkeeper (whose ability fires because they
 * died) and the Saint (whose win check happens after death).
 *
 * Registration is NOT gated here: a poisoned Recluse still registers ambiguously,
 * because registration is a passive property rather than an ability.
 */
export function abilityFunctional(
  view: RulesView,
  player: Pick<RulesViewPlayer, 'characterId' | 'alive' | 'statusLedger'>,
): boolean {
  // Seated but not yet dealt (§5.1): no character, so no ability.
  if (player.characterId === '') return false;
  const character = characterById(player.characterId);
  const aliveRequirementMet = character.requiresAlive ? player.alive : true;
  return aliveRequirementMet && !isPoisoned(player, view.phase) && !isDrunk(player);
}
```

`src/engine/selectors/rulesView.ts`:

```ts
import type { GameState, RulesView, RulesViewPlayer } from '../types';

/**
 * §6.2 narrows the view; §10.2 item 2 is the rule this obeys — built field by
 * field, with NO SPREADS. TypeScript is erased and
 * excess-property checking does not fire through a variable, so a spread would
 * hand the edition layer notes, rule flags and stPrivate while type-checking
 * clean. Adding a field to GameState must not silently widen this.
 *
 * Plan 3's SpyView follows the same rule for the same reason (§10.2).
 */
export function toRulesView(state: GameState): RulesView {
  return {
    edition: state.edition,
    players: state.players.map(toRulesViewPlayer),
    phase: state.phase,
    distribution: state.distribution,
    demonBluffs: state.demonBluffs,
    drunkBelief: state.drunkBelief,
    redHerringPlayerId: state.redHerringPlayerId,
    deaths: state.deaths,
    todaysExecutions: state.todaysExecutions,
  };
}

function toRulesViewPlayer(player: GameState['players'][number]): RulesViewPlayer {
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    characterId: player.characterId,
    alignment: player.alignment,
    team: player.team,
    alive: player.alive,
    statusLedger: player.statusLedger,
    virginTriggered: player.virginTriggered,
    slayerUsed: player.slayerUsed,
    demonSince: player.demonSince,
    demonNotified: player.demonNotified,
  };
}
```

- [ ] **Step 6: Add the ESLint boundary**

Replace `eslint.config.js` with the version below — do not literally append the snippet, which would produce a second `export default`. The restriction uses `patterns` with a glob rather than `paths`, because a relative import (`../selectors/players`) does not match a `paths` entry written as the alias:

```js
const PERCEIVED_CHARACTER_MESSAGE =
  '§4.1: perceivedCharacterId may be consulted only by a step\'s wakes() in ' +
  'nightOrder.ts and by step/UI rendering. Rules predicates must read the true ' +
  'characterId — otherwise a Drunk-believing-Soldier survives the Demon.';

export default tseslint.config(
  // ...existing blocks...
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      // wakes() lives here — this is the sanctioned reader.
      'src/editions/troubleBrewing/nightOrder.ts',
      // The cursor resolves wakes() and hands the acting actor's perceived
      // character to the step event and to rendering, so the command layer never
      // has to read it. Second sanctioned reader, and deliberately the last.
      'src/engine/selectors/nightCursor.ts',
      // The definition itself.
      'src/engine/selectors/players.ts',
      // Rendering is sanctioned by §4.1.
      'src/ui/**',
      // Tests assert the behaviour and must be able to call it.
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/selectors/players', '@/engine/selectors/players'],
              importNames: ['perceivedCharacterId', 'playersWithPerceivedCharacter'],
              message: PERCEIVED_CHARACTER_MESSAGE,
            },
          ],
        },
      ],
    },
  },
);
```

**Known limitation, recorded rather than papered over (§10.2 notes the same one):** `no-restricted-imports` does not follow transitive imports. A module that re-exports `perceivedCharacterId` under a new name defeats it. The mitigation is that `players.ts` is the only definition site and no re-export exists; if one is ever added, add its path to the `group` list.

- [ ] **Step 7: Add the `@test` alias**

The tests import from `@test/helpers/game`. Add the alias in all three places that resolve modules.

`tsconfig.json` — extend `paths`:

```json
"paths": { "@/*": ["src/*"], "@test/*": ["test/*"] }
```

`vite.config.ts` and `vitest.config.ts` — extend the alias map:

```ts
const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@test': fileURLToPath(new URL('./test', import.meta.url)),
};
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: all green.

If the ESLint test fails with "No files matching the pattern", the `lintText` call is being ignored: check that `warnIgnored: false` is set and that `src/ui/**` is not in the top-level `ignores` block.

- [ ] **Step 9: Commit**

```bash
git add src/engine/selectors eslint.config.js tsconfig.json vite.config.ts vitest.config.ts test
git commit -m "$(cat <<'EOF'
feat(engine): add perceived character, ability functionality and the §4.1 boundary

abilityFunctional reads requiresAlive from the character rather than hardcoding
alive, so a dead Ravenkeeper still learns a character and an executed Saint still
wins for evil — the two halves of the v2 bug. Poison and protection require
effective: true, so an ineffective token is placed without taking effect.
Registration stays ungated: a poisoned Recluse registers ambiguously.

perceivedCharacterId is confined by no-restricted-imports to wakes() and UI
rendering, with a test that lints fixture files to prove the boundary holds. The
transitive-import limitation is recorded in the config rather than assumed away.

toRulesView is built field by field with no spreads, so the edition layer
structurally cannot reach notes, rule flags or stPrivate.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 7: Seating math, Chef and Empath, and the Tier 1 property tests

**The highest-value task in this plan.** §14 allocates effort by damage × how unlikely you are to notice, and positional information is top of that list: it corrupts every deduction chain silently, for the whole game, and ten people will not recount it out loud the way they recount a vote.

The two implementations here are deliberately *not* the obvious ones. `chefPairs` counts maximal runs of adjacent evils and sums `k − 1`, because that is the shape §8.2's derivation has to explain; the reference in `test/helpers/reference.ts` walks every adjacent pair directly. They are written to disagree if either is wrong.

**Files:**
- Create: `src/engine/selectors/seating.ts`
- Create: `test/helpers/reference.ts`
- Test: `src/engine/selectors/seating.test.ts`, `test/property/positional.property.test.ts`

**Interfaces:**
- Consumes: `bySeat`, `alive` (Task 6); `RulesView`, `DerivationLine` (Task 3).
- Produces:
  - `ringOrder(view): RulesViewPlayer[]` — by seat, ascending
  - `aliveNeighbours(view, playerId): RulesViewPlayer[]` — 0, 1 or 2 entries, deduped, seat-ordered
  - `chefPairs(view): number`
  - `chefDerivation(view): DerivationLine[]`
  - `empathCount(view, playerId): number`
  - `empathDerivation(view, playerId): DerivationLine[]`

- [ ] **Step 1: Write the naive reference implementations**

`test/helpers/reference.ts`. Independent of `src/` except for the types — deliberately the dumbest correct thing:

```ts
import type { RulesView } from '@/engine/types';

/**
 * Deliberately naive Chef reference (§14): walk every adjacent pair around the
 * ring and count the ones where both players are evil. Written independently of
 * src/engine/selectors/seating.ts, which sums maximal runs instead.
 *
 * Chef counts ALL evil players, alive or dead — the ability says "how many pairs
 * of evil players there are", with no life qualifier, and it fires on night 1
 * when nobody is dead anyway.
 */
export function referenceChefPairs(view: RulesView): number {
  const ring = [...view.players].sort((a, b) => a.seat - b.seat);
  const n = ring.length;
  if (n < 2) return 0;
  let pairs = 0;
  for (let i = 0; i < n; i += 1) {
    const here = ring[i]!;
    const next = ring[(i + 1) % n]!;
    if (here.alignment === 'evil' && next.alignment === 'evil') pairs += 1;
  }
  return pairs;
}

/**
 * Deliberately naive Empath reference (§14): **drop the dead first**, then take
 * the immediate neighbours in the surviving ring.
 *
 * This is a genuinely different method from `src/`, which walks outward from the
 * actor's seat one step at a time. That matters: §14 asks for a "separately
 * written, deliberately naive reference implementation", and two copies of the
 * same outward walk would agree on a shared off-by-one and the 500-run property
 * test would buy nothing — on the ability §14 puts at the TOP of the risk list.
 *
 * The two methods disagree under exactly the conditions where a bug would live:
 * two players alive (the sole survivor is both neighbours), one alive (no
 * neighbours), and long runs of dead on one side.
 */
export function referenceEmpathCount(view: RulesView, playerId: string): number {
  const aliveRing = [...view.players].sort((a, b) => a.seat - b.seat).filter((p) => p.alive);
  const size = aliveRing.length;
  const index = aliveRing.findIndex((p) => p.id === playerId);
  if (index === -1) throw new Error(`${playerId} is not alive`);
  if (size === 1) return 0;

  const left = aliveRing[(index - 1 + size) % size]!;
  const right = aliveRing[(index + 1) % size]!;
  const neighbours = new Map([left, right].map((p) => [p.id, p]));
  neighbours.delete(playerId);
  return [...neighbours.values()].filter((p) => p.alignment === 'evil').length;
}
```

- [ ] **Step 2: Write the failing tests**

`src/engine/selectors/seating.test.ts` — worked examples, including §8.2's own:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from './rulesView';
import { aliveNeighbours, chefDerivation, chefPairs, empathCount, empathDerivation } from './seating';

/** Seats a ring of the given characters in order and kills the named players. */
function ring(characters: string[], dead: number[] = []) {
  const roles = characters.map((c, i) => [`p${i + 1}`, c] as [string, string]);
  const builder = buildGame({ roles });
  for (const index of dead) {
    builder.push('DEATH', {
      playerId: `p${index + 1}`,
      characterIdAtDeath: characters[index]!,
      cause: 'demon',
    });
  }
  return toRulesView(builder.state);
}

describe('chefPairs (§6.4, §8.2)', () => {
  it('counts zero when no evils are adjacent', () => {
    // 7 players: 5 townsfolk, 0 outsiders, 1 minion, 1 demon.
    const view = ring(['imp', 'chef', 'empath', 'poisoner', 'monk', 'soldier', 'mayor']);
    expect(chefPairs(view)).toBe(0);
  });

  it('counts one adjacent pair', () => {
    const view = ring(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor']);
    expect(chefPairs(view)).toBe(1);
  });

  it('wraps around the ring', () => {
    const view = ring(['imp', 'chef', 'empath', 'monk', 'soldier', 'mayor', 'poisoner']);
    expect(chefPairs(view)).toBe(1);
  });

  it('gives k-1 pairs for a run of k adjacent evils', () => {
    // 12 players: 7/2/2/1 — three evils, all adjacent, gives 2 pairs.
    const view = ring([
      'imp', 'poisoner', 'baron', 'chef', 'empath', 'monk',
      'soldier', 'mayor', 'virgin', 'slayer', 'butler', 'recluse',
    ]);
    expect(chefPairs(view)).toBe(2);
  });

  it('counts dead evils too — the ability has no life qualifier', () => {
    const view = ring(
      ['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor'],
      [1],
    );
    expect(chefPairs(view)).toBe(1);
  });

  it('shows its working (§8.2)', () => {
    const view = ring(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'mayor']);
    const lines = chefDerivation(view);
    expect(lines[0]?.label).toBe('ring');
    expect(lines[0]?.detail).toMatch(/\(\* = evil\)/);
    expect(lines[0]?.detail).toMatch(/Player 1\*/);
    expect(lines[1]?.label).toBe('adjacent evil pairs');
    expect(lines[1]?.detail).toBe('(Player 1, Player 2)');
    expect(lines.at(-1)?.detail).toMatch(/-> 1$/);
    expect(lines.at(-1)?.detail).toMatch(/a run of k adjacent evils gives k-1 pairs; the ring wraps/);
  });
});

describe('aliveNeighbours and empathCount (§6.4, §8.2)', () => {
  const SEVEN = ['imp', 'poisoner', 'empath', 'chef', 'monk', 'soldier', 'mayor'];

  it('takes the immediate neighbours when both are alive', () => {
    const view = ring(SEVEN);
    // p3 is the Empath, between p2 (Poisoner, evil) and p4 (Chef, good).
    expect(aliveNeighbours(view, 'p3').map((p) => p.id).sort()).toEqual(['p2', 'p4']);
    expect(empathCount(view, 'p3')).toBe(1);
  });

  it('skips the dead outward in each direction', () => {
    // Kill p2 (evil) and p4 (good): neighbours become p1 (evil) and p5 (good).
    const view = ring(SEVEN, [1, 3]);
    expect(aliveNeighbours(view, 'p3').map((p) => p.id).sort()).toEqual(['p1', 'p5']);
    expect(empathCount(view, 'p3')).toBe(1);
  });

  it('wraps past the end of the ring', () => {
    // Empath at seat 0: neighbours are the last seat and seat 1.
    const view = ring(['empath', 'poisoner', 'chef', 'monk', 'soldier', 'mayor', 'imp']);
    expect(aliveNeighbours(view, 'p1').map((p) => p.id).sort()).toEqual(['p2', 'p7']);
    expect(empathCount(view, 'p1')).toBe(2);
  });

  it('counts a single remaining neighbour once, not twice', () => {
    // Only p3 (Empath) and p1 (Imp) are alive: p1 is both neighbours.
    const view = ring(SEVEN, [1, 3, 4, 5, 6]);
    expect(aliveNeighbours(view, 'p3').map((p) => p.id)).toEqual(['p1']);
    expect(empathCount(view, 'p3')).toBe(1);
  });

  it('returns zero when the Empath is the last one alive', () => {
    const view = ring(SEVEN, [0, 1, 3, 4, 5, 6]);
    expect(aliveNeighbours(view, 'p3')).toEqual([]);
    expect(empathCount(view, 'p3')).toBe(0);
  });

  it('shows its working, marking the dead it skipped (§8.2)', () => {
    const view = ring(SEVEN, [1]);
    const lines = empathDerivation(view, 'p3');
    expect(lines[0]?.label).toBe('seats');
    expect(lines[0]?.detail).toMatch(/Player 2 \(dead\)/);
    expect(lines[1]?.label).toBe('nearest alive either side, skipping the dead');
    expect(lines[1]?.detail).toBe('Player 1 · Player 4');
    expect(lines.at(-1)?.detail).toMatch(/-> 1$/);
  });
});
```

`test/property/positional.property.test.ts` — Tier 1:

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { chefPairs, empathCount } from '@/engine/selectors/seating';
import { referenceChefPairs, referenceEmpathCount } from '@test/helpers/reference';
import type { RulesView } from '@/engine/types';

/**
 * Builds an arbitrary ring. Evil placement is arbitrary rather than legal: the
 * positional maths must not depend on the distribution chart, and generating
 * illegal-but-well-formed rings covers the all-adjacent and fully-wrapped edges
 * that no legal set reaches.
 */
const ringArb = fc
  .integer({ min: 7, max: 15 })
  .chain((size) =>
    fc.record({
      size: fc.constant(size),
      evilSeats: fc.uniqueArray(fc.integer({ min: 0, max: size - 1 }), {
        minLength: 0,
        maxLength: size,
      }),
      deadSeats: fc.uniqueArray(fc.integer({ min: 0, max: size - 1 }), {
        minLength: 0,
        maxLength: size,
      }),
      empathSeat: fc.integer({ min: 0, max: size - 1 }),
    }),
  );

function makeView(spec: {
  size: number;
  evilSeats: number[];
  deadSeats: number[];
  empathSeat: number;
}): { view: RulesView; empathId: string } {
  const evil = new Set(spec.evilSeats);
  // The Empath's own seat must be good and alive for the ability to be asked at all.
  evil.delete(spec.empathSeat);
  const dead = new Set(spec.deadSeats);
  dead.delete(spec.empathSeat);

  // One character per seat, drawn so alignment matches the spec. The characters
  // themselves are irrelevant to positional maths; only alignment and life are.
  const evilPool = ['imp', 'poisoner', 'baron', 'scarlet_woman', 'spy'];
  const goodPool = [
    'washerwoman', 'librarian', 'investigator', 'chef', 'fortune_teller',
    'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier',
    'mayor', 'butler', 'recluse', 'saint',
  ];
  let evilTaken = 0;
  let goodTaken = 0;
  const roles: Array<[string, string]> = [];
  for (let seat = 0; seat < spec.size; seat += 1) {
    if (seat === spec.empathSeat) {
      roles.push([`p${seat}`, 'empath']);
      continue;
    }
    if (evil.has(seat)) {
      roles.push([`p${seat}`, evilPool[evilTaken++ % evilPool.length]!]);
    } else {
      roles.push([`p${seat}`, goodPool[goodTaken++ % goodPool.length]!]);
    }
  }

  const builder = buildGame({ roles });
  for (const seat of dead) {
    builder.push('DEATH', {
      playerId: `p${seat}`,
      characterIdAtDeath: roles[seat]![1],
      cause: 'demon',
    });
  }
  return { view: toRulesView(builder.state), empathId: `p${spec.empathSeat}` };
}

describe('positional information — property tests against a naive reference (§14 Tier 1)', () => {
  it('chefPairs agrees with the naive adjacent-pair walk on every ring', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const { view } = makeView(spec);
        expect(chefPairs(view)).toBe(referenceChefPairs(view));
      }),
      { numRuns: 500 },
    );
  });

  it('empathCount agrees with the naive outward walk on every ring and dead set', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const { view, empathId } = makeView(spec);
        expect(empathCount(view, empathId)).toBe(referenceEmpathCount(view, empathId));
      }),
      { numRuns: 500 },
    );
  });

  it('never reports more than 2 for the Empath or more than the evil count for the Chef', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const { view, empathId } = makeView(spec);
        const evils = view.players.filter((p) => p.alignment === 'evil').length;
        expect(empathCount(view, empathId)).toBeLessThanOrEqual(2);
        expect(chefPairs(view)).toBeLessThanOrEqual(Math.max(evils, 0));
      }),
      { numRuns: 300 },
    );
  });

  it('is invariant under rotating the whole ring', () => {
    fc.assert(
      fc.property(ringArb, (spec) => {
        const rotated = {
          ...spec,
          evilSeats: spec.evilSeats.map((s) => (s + 3) % spec.size),
          deadSeats: spec.deadSeats.map((s) => (s + 3) % spec.size),
          empathSeat: (spec.empathSeat + 3) % spec.size,
        };
        const a = makeView(spec);
        const b = makeView(rotated);
        expect(chefPairs(b.view)).toBe(chefPairs(a.view));
        expect(empathCount(b.view, b.empathId)).toBe(empathCount(a.view, a.empathId));
      }),
      { numRuns: 300 },
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/selectors/seating.test.ts test/property`
Expected: FAIL — `Cannot find module './seating'`.

- [ ] **Step 4: Write the seating selectors**

`src/engine/selectors/seating.ts`:

```ts
import type { Alignment } from '@/editions/troubleBrewing/characters';
import type { DerivationLine, PlayerId, RulesView, RulesViewPlayer } from '../types';
import { bySeat, playerById } from './players';

const mod = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * How a Recluse or Spy has been ruled to register for this answer (§4.3). Empty
 * for the canonical answer. Only alignment matters to the Chef and the Empath.
 */
export type AlignmentOverrides = ReadonlyMap<PlayerId, Alignment>;
const EMPTY: AlignmentOverrides = new Map();

function alignmentOf(
  player: Pick<RulesViewPlayer, 'id' | 'alignment'>,
  overrides: AlignmentOverrides,
): Alignment {
  return overrides.get(player.id) ?? player.alignment;
}

/**
 * Seat order, ascending. The ring is immutable after GAME_CREATED (§18).
 *
 * ORIENTATION, pinned here because nothing else pins it: **ascending seat index
 * is clockwise**, so a player's left-hand neighbour is `seat + 1` and their
 * right-hand neighbour is `seat - 1`. Voting runs clockwise from the nominee's
 * left, i.e. from `nominee.seat + 1` upward (§7, guide §10). Reverse this and
 * every vote is taken in the wrong order for the whole game, which is §8.2's
 * class of failure one level up: the code is correct and the convention is not.
 */
export function ringOrder(view: RulesView): RulesViewPlayer[] {
  return bySeat(view);
}

/**
 * §6.4 — the Empath's ALIVE neighbours, skipping the dead around the circle.
 * Deduped: with only one other living player, they are both neighbours and are
 * counted once. Returns 0, 1 or 2 players, seat-ordered.
 */
export function aliveNeighbours(view: RulesView, playerId: PlayerId): RulesViewPlayer[] {
  const ring = ringOrder(view);
  const size = ring.length;
  const selfIndex = ring.findIndex((p) => p.id === playerId);
  if (selfIndex === -1) throw new Error(`Unknown player id: ${playerId}`);

  const outward = (direction: 1 | -1): RulesViewPlayer | null => {
    for (let step = 1; step < size; step += 1) {
      const candidate = ring[mod(selfIndex + direction * step, size)]!;
      if (candidate.id === playerId) continue;
      if (candidate.alive) return candidate;
    }
    return null;
  };

  const found = [outward(-1), outward(1)].filter((p): p is RulesViewPlayer => p !== null);
  const unique = new Map(found.map((p) => [p.id, p]));
  return [...unique.values()].sort((a, b) => a.seat - b.seat);
}

export function empathCount(
  view: RulesView,
  playerId: PlayerId,
  overrides: AlignmentOverrides = EMPTY,
): number {
  return aliveNeighbours(view, playerId).filter((p) => alignmentOf(p, overrides) === 'evil').length;
}

/**
 * §6.4, §8.2 — pairs of evil players sitting next to each other, counted by
 * maximal runs: a run of k adjacent evils contributes k-1 pairs, and the ring
 * wraps. Written this way, rather than as a direct pair walk, because it is the
 * shape the derivation explains; the direct walk is the independent reference the
 * property test compares against.
 *
 * Counts all evil players, alive or dead: "how many pairs of evil players there
 * are" has no life qualifier.
 */
export function chefPairs(view: RulesView, overrides: AlignmentOverrides = EMPTY): number {
  const ring = ringOrder(view);
  const size = ring.length;
  if (size < 2) return 0;

  const evil = ring.map((p) => alignmentOf(p, overrides) === 'evil');
  const evilCount = evil.filter(Boolean).length;
  if (evilCount === 0) return 0;
  // A fully evil ring is one closed run with no gap, so it has `size` pairs
  // rather than size-1. Unreachable in Trouble Brewing, handled so the property
  // test's arbitrary rings agree with the reference.
  if (evilCount === size) return size;

  // Start at a good seat so no run straddles the array boundary.
  const start = evil.findIndex((isEvil) => !isEvil);
  let pairs = 0;
  let run = 0;
  for (let step = 0; step < size; step += 1) {
    if (evil[mod(start + step, size)]) {
      run += 1;
    } else {
      if (run > 0) pairs += run - 1;
      run = 0;
    }
  }
  if (run > 0) pairs += run - 1;
  return pairs;
}

export function chefDerivation(
  view: RulesView,
  overrides: AlignmentOverrides = EMPTY,
): DerivationLine[] {
  const ring = ringOrder(view);
  const size = ring.length;
  const isEvil = (p: RulesViewPlayer): boolean => alignmentOf(p, overrides) === 'evil';
  const evilCount = ring.filter(isEvil).length;

  const pairs: string[] = [];
  for (let i = 0; i < size; i += 1) {
    const here = ring[i]!;
    const next = ring[mod(i + 1, size)]!;
    if (isEvil(here) && isEvil(next)) {
      pairs.push(`(${here.name}, ${next.name})`);
    }
  }

  const total = chefPairs(view, overrides);
  return [
    ...(overrides.size > 0
      ? [
          {
            label: 'registration ruling',
            detail: [...overrides]
              .map(([id, alignment]) => `${playerById(view, id).name} ruled ${alignment.toUpperCase()}`)
              .join(' · '),
          },
        ]
      : []),
    {
      label: 'ring',
      detail: `${ring
        .map((p) => `${p.name}${isEvil(p) ? '*' : ''}${overrides.has(p.id) ? '(ruled)' : ''}`)
        .join(' ')}   (* = evil)`,
    },
    {
      label: 'adjacent evil pairs',
      detail: pairs.length > 0 ? pairs.join(' ') : 'none',
    },
    {
      label: 'result',
      detail: `${size} players, ${evilCount} evil; a run of k adjacent evils gives k-1 pairs; the ring wraps -> ${total}`,
    },
  ];
}

export function empathDerivation(
  view: RulesView,
  playerId: PlayerId,
  overrides: AlignmentOverrides = EMPTY,
): DerivationLine[] {
  const ring = ringOrder(view);
  const size = ring.length;
  const selfIndex = ring.findIndex((p) => p.id === playerId);
  const self = playerById(view, playerId);
  const neighbours = aliveNeighbours(view, playerId);
  const count = empathCount(view, playerId, overrides);

  // A window of the ring wide enough to show what was skipped in each direction.
  const window: string[] = [];
  for (let offset = -3; offset <= 3; offset += 1) {
    const player = ring[mod(selfIndex + offset, size)]!;
    const label =
      player.id === self.id ? `[${player.name}]` : player.alive ? player.name : `${player.name} (dead)`;
    window.push(label);
  }

  return [
    { label: 'seats', detail: `... ${window.join(' | ')} ...` },
    {
      label: 'nearest alive either side, skipping the dead',
      detail: neighbours.length > 0 ? neighbours.map((p) => p.name).join(' · ') : 'nobody alive',
    },
    ...(overrides.size > 0
      ? [
          {
            label: 'registration ruling',
            detail: [...overrides]
              .map(([id, alignment]) => `${playerById(view, id).name} ruled ${alignment.toUpperCase()}`)
              .join(' · '),
          },
        ]
      : []),
    {
      label: 'result',
      detail: `${
        neighbours.length > 0
          ? neighbours
              .map(
                (p) =>
                  `${p.name} ${alignmentOf(p, overrides).toUpperCase()}` +
                  `${overrides.has(p.id) ? ' (ruled)' : ''}`,
              )
              .join(' · ')
          : 'no living neighbours'
      } -> ${count}`,
    },
  ];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine/selectors/seating.test.ts test/property && npm run typecheck`
Expected: all green.

If a property test fails, **do not adjust the reference to match.** fast-check prints a minimal counterexample; work out which of the two implementations is wrong from first principles, because one of them is.

- [ ] **Step 6: Commit**

```bash
git add src/engine/selectors/seating.ts src/engine/selectors/seating.test.ts test/helpers/reference.ts test/property
git commit -m "$(cat <<'EOF'
feat(engine): add Chef and Empath positional maths with show-your-working

chefPairs sums maximal runs of adjacent evils (k gives k-1 pairs, ring wraps);
empathCount walks outward past the dead in each direction and dedupes, so a lone
surviving neighbour counts once. Both emit §8.2 derivations, which are the only
defence against a wrong integer at the table.

Property-tested against a separately written naive reference over generated
rings of 7-15 seats with arbitrary evil and dead sets — §14 puts positional
information at the top of the risk list because a wrong answer here is invisible
and corrupts every deduction chain for the rest of the game.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The remaining information resolvers

Washerwoman, Librarian, Investigator, Fortune Teller, Undertaker, Ravenkeeper — the ones whose answers are a *set* rather than a number, and where a Recluse or Spy makes the legal answer set larger than one (§4.3).

**Files:**
- Create: `src/editions/troubleBrewing/resolvers.ts`
- Test: `src/editions/troubleBrewing/resolvers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 6, 7.
- Produces, all of shape `(view: RulesView, actorId: PlayerId, targets?: readonly PlayerId[]) => LegalAnswer[]`, canonical answer first:
  - `chefAnswers`, `empathAnswers`
  - `washerwomanAnswers`, `librarianAnswers`, `investigatorAnswers`
  - `fortuneTellerAnswers(view, actorId, targets)` — `targets` is the two chosen players
  - `undertakerAnswers`, `ravenkeeperAnswers(view, actorId, targets)`
  - `RESOLVERS: Readonly<Record<string, Resolver>>` keyed by step id

- [ ] **Step 1: Write the failing test**

`src/editions/troubleBrewing/resolvers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { abilityFunctional } from '@/engine/selectors/predicates';
import {
  chefAnswers,
  empathAnswers,
  fortuneTellerAnswers,
  investigatorAnswers,
  librarianAnswers,
  ravenkeeperAnswers,
  undertakerAnswers,
  washerwomanAnswers,
} from './resolvers';

const NINE: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'washerwoman'],
  ['p4', 'librarian'],
  ['p5', 'investigator'],
  ['p6', 'recluse'],
  ['p7', 'drunk'],
  ['p8', 'fortune_teller'],
  ['p9', 'undertaker'],
];

function nine() {
  return buildGame({
    roles: NINE,
    drunkBelief: { playerId: 'p7', believesCharacterId: 'monk' },
    redHerring: 'p4',
    demonBluffs: ['chef', 'soldier', 'mayor'],
  });
}

/**
 * The same nine seats with the Spy as the Minion instead of the Poisoner, so both
 * ambiguous characters in the edition are in play at once. Still 5/2/1/1, the
 * legal chart for nine.
 *
 * The Spy previously appeared in no resolver fixture anywhere in this plan, so
 * half of its ability — "might register as good, and as a Townsfolk or Outsider,
 * even if dead" (guide §1) — was entirely untested.
 */
const NINE_SPY: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'spy'],
  ['p3', 'washerwoman'],
  ['p4', 'librarian'],
  ['p5', 'investigator'],
  ['p6', 'recluse'],
  ['p7', 'drunk'],
  ['p8', 'fortune_teller'],
  ['p9', 'empath'],
];

function nineWithSpy() {
  return buildGame({
    roles: NINE_SPY,
    drunkBelief: { playerId: 'p7', believesCharacterId: 'monk' },
    redHerring: 'p4',
    demonBluffs: ['chef', 'soldier', 'mayor'],
  });
}

describe('the Spy registers as good, even dead (guide §1, §4.3)', () => {
  it('is offered to the Washerwoman as a Townsfolk, classed as registration', () => {
    const view = toRulesView(nineWithSpy().state);
    const viaSpy = washerwomanAnswers(view, 'p3').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p2'),
    );
    expect(viaSpy.length).toBeGreaterThan(0);
    for (const a of viaSpy) {
      expect(a.answerClass).toBe('registration');
      expect(a.registrationRulings[0]?.registersAs).toEqual({ alignment: 'good', team: 'townsfolk' });
      // The token to show is the Storyteller's choice, so the slot is null.
      expect((a.value as readonly (string | null)[])[0]).toBeNull();
      expect(a.display).not.toMatch(/^Spy:/);
    }
  });

  it('is offered to the Librarian as an Outsider', () => {
    const view = toRulesView(nineWithSpy().state);
    const viaSpy = librarianAnswers(view, 'p4').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p2'),
    );
    expect(viaSpy.length).toBeGreaterThan(0);
    expect(viaSpy[0]?.registrationRulings[0]?.registersAs).toEqual({
      alignment: 'good',
      team: 'outsider',
    });
  });

  it('still registers after death — registration is not an ability', () => {
    const b = nineWithSpy();
    b.push('DEATH', { playerId: 'p2', characterIdAtDeath: 'spy', cause: 'execution', executionKind: 'vote' });
    const view = toRulesView(b.state);
    const viaSpy = washerwomanAnswers(view, 'p3').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p2'),
    );
    expect(viaSpy.length).toBeGreaterThan(0);
  });
});

describe('a poisoned Recluse still registers ambiguously (§4.2, §14 Tier 2)', () => {
  // §14 Tier 2 names this in bold, and the only previous test asserted that
  // CHARACTERS.recluse.registration has three entries — a property of a frozen
  // array literal that would pass with the Recluse dead, absent, or in another
  // game. This exercises it through a resolver and through a rule.
  it('is still offered as a Minion to the Investigator while poisoned', () => {
    const b = nine();
    b.push('STATUS_APPLIED', {
      playerId: 'p6',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: { kind: 'day', number: 1 },
    });
    const view = toRulesView(b.state);
    const recluse = view.players.find((p) => p.id === 'p6')!;
    expect(abilityFunctional(view, recluse)).toBe(false);

    const viaRecluse = investigatorAnswers(view, 'p5').filter((a) =>
      a.registrationRulings.some((r) => r.playerId === 'p6'),
    );
    expect(viaRecluse.length).toBeGreaterThan(0);
  });
});

describe('chefAnswers and empathAnswers — the §4.3 cross-product', () => {
  it('offers one answer when nobody ambiguous is in play', () => {
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'empath'],
          ['p5', 'monk'], ['p6', 'soldier'], ['p7', 'mayor'],
        ],
      }).state,
    );
    expect(chefAnswers(view, 'p3')).toHaveLength(1);
    expect(chefAnswers(view, 'p3')[0]?.answerClass).toBe('canonical');
  });

  it('offers four Chef answers with a Recluse and a Spy in the ring', () => {
    const view = toRulesView(nineWithSpy().state);
    const answers = chefAnswers(view, 'p3');
    expect(answers).toHaveLength(4);
    expect(answers[0]?.answerClass).toBe('canonical');
    expect(answers[0]?.registrationRulings).toEqual([]);
    expect(answers.slice(1).every((a) => a.answerClass === 'registration')).toBe(true);
    // Every answer shows its working, including which ruling produced it.
    for (const a of answers.slice(1)) {
      expect(a.derivation.map((d) => d.label)).toContain('registration ruling');
    }
  });

  it('changes the Chef count when the Recluse is ruled evil next to the Demon', () => {
    // p1 Imp, p2 Spy adjacent; p6 Recluse sits between p5 and p7, neither evil.
    const view = toRulesView(nineWithSpy().state);
    const canonical = chefAnswers(view, 'p3')[0]!;
    const values = chefAnswers(view, 'p3').map((a) => a.value as number);
    expect(canonical.value).toBe(1); // Imp and Spy are adjacent at seats 0 and 1
    // Ruling the Recluse evil adds no adjacency; ruling the Spy good removes one.
    expect(values).toContain(0);
  });

  it('offers both Empath readings when a Recluse is a living neighbour', () => {
    // p6 Recluse sits at seat 5, so the Empath at seat 8 is not adjacent —
    // build a ring where they are.
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'recluse'],
          ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'], ['p8', 'saint'], ['p9', 'butler'],
        ],
      }).state,
    );
    const answers = empathAnswers(view, 'p5');
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({ value: 0, answerClass: 'canonical' });
    expect(answers[1]).toMatchObject({ value: 1, answerClass: 'registration' });
    expect(answers[1]?.registrationRulings).toEqual([
      { playerId: 'p4', registersAs: { alignment: 'evil', team: 'minion' } },
    ]);
    expect(answers[1]?.derivation.map((d) => d.detail).join(' ')).toMatch(/ruled EVIL/);
  });

  it('ignores a DEAD ambiguous neighbour, whom the Empath cannot see', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'recluse'],
        ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'], ['p8', 'saint'], ['p9', 'butler'],
      ],
    });
    b.push('DEATH', { playerId: 'p4', characterIdAtDeath: 'recluse', cause: 'demon' });
    const view = toRulesView(b.state);
    // p3 (Chef, good) becomes the neighbour, and nobody ambiguous is adjacent.
    expect(empathAnswers(view, 'p5')).toHaveLength(1);
  });

  it('keeps answer keys stable across recomputation (§6.2)', () => {
    // §6.2: default selection happens once on step entry, "never during render,
    // or the Washerwoman decoy reshuffles every frame". Stable keys are what let
    // a selection be restored, so they must not depend on iteration order.
    const view = toRulesView(nineWithSpy().state);
    for (const resolve of [chefAnswers, washerwomanAnswers, investigatorAnswers]) {
      const first = resolve(view, 'p3').map((a) => a.key);
      const second = resolve(view, 'p3').map((a) => a.key);
      expect(second).toEqual(first);
      expect(new Set(first).size).toBe(first.length);
    }
  });
});

describe('washerwomanAnswers (§6.4)', () => {
  it('names a Townsfolk in play and two players, one of whom is them', () => {
    const view = toRulesView(nine().state);
    const answers = washerwomanAnswers(view, 'p3');
    expect(answers.length).toBeGreaterThan(0);
    for (const answer of answers) {
      const value = answer.value as readonly string[];
      // [characterId, playerA, playerB]
      expect(value).toHaveLength(3);
      const [characterId, a, b] = value;
      expect(['washerwoman', 'librarian', 'investigator', 'fortune_teller', 'undertaker']).toContain(characterId);
      expect(a).not.toBe(b);
      const holder = view.players.find((p) => p.characterId === characterId)!;
      expect([a, b]).toContain(holder.id);
    }
  });

  // §6.4 — the Washerwoman may NOT be shown the Drunk under their believed Townsfolk.
  it('never shows the Drunk as their believed Townsfolk', () => {
    const view = toRulesView(nine().state);
    for (const answer of washerwomanAnswers(view, 'p3')) {
      const [characterId, a, b] = answer.value as readonly string[];
      expect(characterId).not.toBe('monk');
      if (characterId) {
        const holder = view.players.find((p) => p.characterId === characterId)!;
        expect(holder.id).not.toBe('p7');
      }
      expect([a, b]).not.toContain(undefined);
    }
  });

  it('never names the Washerwoman themselves as the Townsfolk they learn', () => {
    const view = toRulesView(nine().state);
    for (const answer of washerwomanAnswers(view, 'p3')) {
      const [characterId] = answer.value as readonly string[];
      expect(characterId).not.toBe('washerwoman');
    }
  });

  it('shows its working', () => {
    const view = toRulesView(nine().state);
    const [first] = washerwomanAnswers(view, 'p3');
    expect(first?.derivation.map((d) => d.label)).toContain('townsfolk in play');
    expect(first?.derivation.map((d) => d.label)).toContain('decoy');
  });
});

describe('librarianAnswers (§6.4)', () => {
  it('may show the Drunk, who is a real Outsider (guide §13)', () => {
    const view = toRulesView(nine().state);
    const shown = librarianAnswers(view, 'p4').map((a) => (a.value as readonly string[])[0]);
    expect(shown).toContain('drunk');
  });

  it('has an explicit zero-Outsiders branch', () => {
    // 7 players, 5/0/1/1 — no Outsiders at all.
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'librarian'], ['p4', 'chef'],
          ['p5', 'empath'], ['p6', 'monk'], ['p7', 'soldier'],
        ],
      }).state,
    );
    const answers = librarianAnswers(view, 'p3');
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBeNull();
    expect(answers[0]?.display).toMatch(/zero/i);
    expect(answers[0]?.answerClass).toBe('canonical');
  });

  it('offers the Recluse as an Outsider only under its true registration', () => {
    const view = toRulesView(nine().state);
    // The Recluse IS an Outsider, so it is a legal canonical Librarian answer.
    const shown = librarianAnswers(view, 'p4').map((a) => (a.value as readonly string[])[0]);
    expect(shown).toContain('recluse');
  });
});

describe('investigatorAnswers (§4.3, §6.4)', () => {
  it('names a Minion in play', () => {
    const view = toRulesView(nine().state);
    const shown = investigatorAnswers(view, 'p5').map((a) => (a.value as readonly string[])[0]);
    expect(shown).toContain('poisoner');
  });

  // The cross-product of §4.3: a Recluse may be ruled to register as a Minion.
  it('offers the Recluse ruled as a Minion, classed as registration', () => {
    const view = toRulesView(nine().state);
    const answers = investigatorAnswers(view, 'p5');
    const viaRecluse = answers.filter(
      (a) => a.answerClass === 'registration' && a.registrationRulings.some((r) => r.playerId === 'p6'),
    );
    expect(viaRecluse.length).toBeGreaterThan(0);
    for (const answer of viaRecluse) {
      expect(answer.registrationRulings).toEqual([
        { playerId: 'p6', registersAs: { alignment: 'evil', team: 'minion' } },
      ]);
      // Never "Recluse: P6 or P3" — the shown token is the Storyteller's choice.
      expect((answer.value as readonly (string | null)[])[0]).toBeNull();
      expect(answer.display).toMatch(/^a minion of your choosing:/);
      expect(answer.display).not.toMatch(/Recluse/);
    }
  });

  it('puts the canonical answers before the registration ones', () => {
    const view = toRulesView(nine().state);
    const classes = investigatorAnswers(view, 'p5').map((a) => a.answerClass);
    const firstRegistration = classes.indexOf('registration');
    if (firstRegistration !== -1) {
      expect(classes.slice(0, firstRegistration).every((c) => c === 'canonical')).toBe(true);
    }
  });
});

describe('fortuneTellerAnswers (§6.4)', () => {
  it('says yes when a chosen player is the Demon', () => {
    const view = toRulesView(nine().state);
    const [first] = fortuneTellerAnswers(view, 'p8', ['p1', 'p3']);
    expect(first?.value).toBe(true);
    expect(first?.answerClass).toBe('canonical');
  });

  it('says yes when a chosen player is the red herring', () => {
    const view = toRulesView(nine().state);
    // p4 is the red herring and is not the Demon.
    const [first] = fortuneTellerAnswers(view, 'p8', ['p4', 'p3']);
    expect(first?.value).toBe(true);
    expect(first?.derivation.map((d) => d.detail).join(' ')).toMatch(/red herring/i);
  });

  it('says no when neither is a Demon nor the herring', () => {
    const view = toRulesView(nine().state);
    const [first] = fortuneTellerAnswers(view, 'p8', ['p3', 'p5']);
    expect(first?.value).toBe(false);
  });

  it('offers a registration answer when a Recluse is chosen', () => {
    const view = toRulesView(nine().state);
    const answers = fortuneTellerAnswers(view, 'p8', ['p6', 'p3']);
    expect(answers.map((a) => a.value)).toContain(false);
    expect(answers.map((a) => a.value)).toContain(true);
    const registration = answers.find((a) => a.answerClass === 'registration');
    expect(registration?.registrationRulings).toEqual([
      { playerId: 'p6', registersAs: { alignment: 'evil', team: 'demon' } },
    ]);
  });

  // §4.8 — an off-constraint pick must be recordable, not refused.
  it('still answers for an off-constraint target list, with the deviation shown', () => {
    const view = toRulesView(nine().state);
    const answers = fortuneTellerAnswers(view, 'p8', ['p1']);
    expect(answers.length).toBeGreaterThan(0);
    expect(answers[0]?.derivation[0]).toMatchObject({ label: 'off-constraint' });
    expect(answers[0]?.value).toBe(true);
    expect(fortuneTellerAnswers(view, 'p8', [])[0]?.value).toBe(false);
  });
});

describe('undertakerAnswers (§16.5)', () => {
  it('reports nothing when nobody was executed', () => {
    const view = toRulesView(nine().state);
    expect(undertakerAnswers(view, 'p9')).toEqual([]);
  });

  it('reports the executed player\'s TRUE character, not their believed one', () => {
    const b = nine();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    // The Drunk is executed; the Undertaker learns Drunk, not Monk (guide §13).
    b.push('DEATH', {
      playerId: 'p7',
      characterIdAtDeath: 'drunk',
      cause: 'execution',
      executionKind: 'vote',
    });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const view = toRulesView(b.state);
    const answers = undertakerAnswers(view, 'p9');
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBe('drunk');
  });

  it('becomes a Storyteller choice when two players were executed in one day', () => {
    const b = nine();
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'washerwoman', cause: 'execution', executionKind: 'virgin' });
    b.push('DEATH', { playerId: 'p5', characterIdAtDeath: 'investigator', cause: 'execution', executionKind: 'vote' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const view = toRulesView(b.state);
    const answers = undertakerAnswers(view, 'p9');
    expect(answers).toHaveLength(2);
    expect(answers.map((a) => a.value).sort()).toEqual(['investigator', 'washerwoman']);
  });
});

describe('ravenkeeperAnswers (§6.4, guide §13)', () => {
  it('reports the chosen player\'s TRUE character', () => {
    const view = toRulesView(nine().state);
    const answers = ravenkeeperAnswers(view, 'p9', ['p7']);
    expect(answers[0]?.value).toBe('drunk');
  });

  it('offers a registration answer for a Recluse', () => {
    const view = toRulesView(nine().state);
    const answers = ravenkeeperAnswers(view, 'p9', ['p6']);
    expect(answers[0]?.value).toBe('recluse');
    expect(answers.length).toBeGreaterThan(1);
    expect(answers.some((a) => a.answerClass === 'registration')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editions/troubleBrewing/resolvers.test.ts`
Expected: FAIL — `Cannot find module './resolvers'`.

- [ ] **Step 3: Write the resolvers**

`src/editions/troubleBrewing/resolvers.ts`:

```ts
import type {
  CharacterId,
  DerivationLine,
  LegalAnswer,
  PlayerId,
  RegistrationRuling,
  RulesView,
  RulesViewPlayer,
} from '@/engine/types';
import { playerById } from '@/engine/selectors/players';
import {
  aliveNeighbours,
  chefDerivation,
  chefPairs,
  empathCount,
  empathDerivation,
  type AlignmentOverrides,
} from '@/engine/selectors/seating';
import {
  alignmentOf,
  characterById,
  type Alignment,
  type RegistrationOption,
  type Team,
} from './characters';
import { isAmbiguous, registrationOptionsForCharacterId } from './registration';

export type Resolver = (
  view: RulesView,
  actorId: PlayerId,
  targets?: readonly PlayerId[],
) => LegalAnswer[];

function answer(
  key: string,
  value: LegalAnswer['value'],
  display: string,
  derivation: DerivationLine[],
  rulings: RegistrationRuling[] = [],
): LegalAnswer {
  return {
    key,
    value,
    display,
    answerClass: rulings.length > 0 ? 'registration' : 'canonical',
    registrationRulings: rulings,
    derivation,
  };
}

// ---- numeric answers ----

/**
 * §4.3 — the cross-product over each ambiguous player's registration options,
 * reduced to the distinct ALIGNMENTS, because alignment is all the Chef and the
 * Empath can see. Trouble Brewing has at most one Recluse and one Spy, so this is
 * at most four combinations.
 *
 * The empty combination comes first, so element 0 is always the canonical answer.
 */
function alignmentCombinations(
  candidates: readonly RulesViewPlayer[],
): RegistrationRuling[][] {
  let combos: RegistrationRuling[][] = [[]];
  for (const player of candidates) {
    const byAlignment = new Map<Alignment, RegistrationOption>();
    for (const option of registrationOptionsForCharacterId(player.characterId)) {
      if (!byAlignment.has(option.alignment)) byAlignment.set(option.alignment, option);
    }
    const trueAlignment = alignmentOf(player.characterId);
    const next: RegistrationRuling[][] = [];
    for (const combo of combos) {
      for (const [alignment, option] of byAlignment) {
        next.push(
          alignment === trueAlignment
            ? combo
            : [...combo, { playerId: player.id, registersAs: option }],
        );
      }
    }
    combos = next;
  }
  return combos;
}

function overridesFrom(rulings: readonly RegistrationRuling[]): AlignmentOverrides {
  return new Map(rulings.map((r) => [r.playerId, r.registersAs.alignment]));
}

function ambiguousAmong(players: readonly RulesViewPlayer[]): RulesViewPlayer[] {
  return players.filter((p) => p.characterId !== '' && isAmbiguous(p.characterId));
}

function rulingKey(prefix: string, rulings: readonly RegistrationRuling[]): string {
  if (rulings.length === 0) return prefix;
  return `${prefix}:${rulings
    .map((r) => `${r.playerId}=${r.registersAs.alignment}`)
    .sort()
    .join(',')}`;
}

/**
 * The Chef counts ALL evil players, alive or dead, so every ambiguous seat in the
 * ring can change the answer — a Recluse adjacent to a Minion is the single most
 * common Storyteller ruling in the edition.
 */
export const chefAnswers: Resolver = (view) =>
  alignmentCombinations(ambiguousAmong(view.players)).map((rulings) => {
    const overrides = overridesFrom(rulings);
    const value = chefPairs(view, overrides);
    return answer(
      rulingKey('chef', rulings),
      value,
      String(value),
      chefDerivation(view, overrides),
      rulings,
    );
  });

/** Only the two ALIVE neighbours can register to the Empath (§6.4). */
export const empathAnswers: Resolver = (view, actorId) =>
  alignmentCombinations(ambiguousAmong(aliveNeighbours(view, actorId))).map((rulings) => {
    const overrides = overridesFrom(rulings);
    const value = empathCount(view, actorId, overrides);
    return answer(
      rulingKey('empath', rulings),
      value,
      String(value),
      empathDerivation(view, actorId, overrides),
      rulings,
    );
  });

// ---- "1 of these 2 players is X" answers ----

/**
 * The players who could be presented as holding `team`, each with the ruling that
 * makes it true. A player whose true team matches needs no ruling; an ambiguous
 * player (Recluse, Spy) needs one (§4.3).
 */
function couldRegisterAs(
  view: RulesView,
  team: Team,
): Array<{ player: RulesViewPlayer; rulings: RegistrationRuling[] }> {
  const results: Array<{ player: RulesViewPlayer; rulings: RegistrationRuling[] }> = [];
  for (const player of view.players) {
    if (player.characterId === '') continue;
    for (const option of registrationOptionsForCharacterId(player.characterId)) {
      if (option.team !== team) continue;
      const isTrue = characterById(player.characterId).team === team;
      results.push({
        player,
        rulings: isTrue ? [] : [{ playerId: player.id, registersAs: option }],
      });
    }
  }
  return results;
}

/**
 * Builds the "1 of these 2 is a particular X" answer set: each candidate holder,
 * paired with every other player as the decoy.
 *
 * `excludePlayerIds` drops players who may not be presented in this slot at all
 * — the Washerwoman's exclusion of the Drunk (§6.4) and of the actor themselves.
 * The character shown is always the candidate's character as it registers, and
 * NEVER a believed character: §4.1 confines perceivedCharacterId to wakes() and
 * rendering, and this is a rules answer.
 */
function oneOfTwo(
  view: RulesView,
  actorId: PlayerId,
  team: Team,
  label: string,
  excludePlayerIds: ReadonlySet<PlayerId>,
): LegalAnswer[] {
  const answers: LegalAnswer[] = [];
  const candidates = couldRegisterAs(view, team).filter(
    ({ player }) => player.id !== actorId && !excludePlayerIds.has(player.id),
  );

  for (const { player, rulings } of candidates) {
    // A ruled registration shows SOME character of the ruled team that is not in
    // play, and which one is the Storyteller's choice, recorded on the step's
    // stChoice (§3.6). The resolver cannot pick it — enumerating every not-in-play
    // Minion × every decoy is the kilobyte cross-product §3.6 refuses to store.
    //
    // So the shown character is deliberately NULL for a ruled answer. It must not
    // fall back to the ambiguous player's own character: that renders as
    // "Recluse: P6 or P3" for an Investigator, which is the one thing that must
    // never be shown or written into infoHistory.
    const ruled = rulings.length > 0;
    const shownCharacterId = ruled ? null : player.characterId;

    for (const decoy of view.players) {
      if (decoy.id === player.id || decoy.id === actorId) continue;
      answers.push(
        answer(
          `${team}:${player.id}:${decoy.id}`,
          [shownCharacterId, player.id, decoy.id],
          ruled
            ? `a ${label} of your choosing: ${player.name} or ${decoy.name}`
            : `${characterById(player.characterId).name}: ${player.name} or ${decoy.name}`,
          [
            {
              label: `${label} in play`,
              detail: ruled
                ? `${player.name}, ruled to register as ${team} — choose which ${label} token to show`
                : `${characterById(player.characterId).name} (${player.name})`,
            },
            { label: 'decoy', detail: decoy.name },
            ...(ruled
              ? [
                  {
                    label: 'registration ruling',
                    detail: `${player.name} (${characterById(player.characterId).name}) ruled to register as ${team}`,
                  },
                ]
              : []),
          ],
          rulings,
        ),
      );
    }
  }

  // Canonical answers first (§4.3), then registration ones.
  return answers.sort(
    (a, b) => Number(a.answerClass === 'registration') - Number(b.answerClass === 'registration'),
  );
}

export const washerwomanAnswers: Resolver = (view, actorId) => {
  // §6.4 — the Washerwoman may NOT be shown the Drunk under their believed
  // Townsfolk. The Drunk's TRUE team is outsider, so couldRegisterAs('townsfolk')
  // already excludes them; the explicit exclusion documents the rule and survives
  // any future change to how the Drunk registers.
  const excluded = new Set<PlayerId>();
  if (view.drunkBelief) excluded.add(view.drunkBelief.playerId);
  return oneOfTwo(view, actorId, 'townsfolk', 'townsfolk', excluded);
};

export const librarianAnswers: Resolver = (view, actorId) => {
  // The Librarian MAY be shown the Drunk — they are a real Outsider (§6.4).
  const answers = oneOfTwo(view, actorId, 'outsider', 'outsider', new Set());
  if (answers.length > 0) return answers;
  // §6.4 — the explicit zero-Outsiders branch.
  return [
    answer('librarian:zero', null, 'Zero Outsiders are in play', [
      { label: 'outsiders in play', detail: 'none' },
      { label: 'result', detail: 'show the "zero" signal -> 0' },
    ]),
  ];
};

export const investigatorAnswers: Resolver = (view, actorId) =>
  oneOfTwo(view, actorId, 'minion', 'minion', new Set());

// ---- yes/no and character answers ----

/**
 * §4.8 — target constraints are SOFT. An earlier draft threw when the Fortune
 * Teller had not chosen exactly two players, which is the v2 bug §4.8 was written
 * to kill: the command layer records an off-constraint pick with a `social` flag,
 * and the resolver then refused to produce an answer for it. It degrades instead,
 * and puts the deviation in the derivation.
 */
export const fortuneTellerAnswers: Resolver = (view, actorId, targets = []) => {
  const chosen = targets.map((id) => playerById(view, id));
  const herring = chosen.find((p) => p.id === view.redHerringPlayerId) ?? null;
  const trueDemon = chosen.find((p) => characterById(p.characterId).team === 'demon') ?? null;

  const base: DerivationLine[] = [
    ...(chosen.length !== 2
      ? [
          {
            label: 'off-constraint',
            detail: `${chosen.length} player${chosen.length === 1 ? '' : 's'} chosen, not 2 — recorded and flagged (§4.8)`,
          },
        ]
      : []),
    { label: 'chosen', detail: chosen.length > 0 ? chosen.map((p) => p.name).join(' · ') : 'nobody' },
    {
      label: 'true characters',
      detail: chosen
        .map((p) => `${p.name} = ${characterById(p.characterId).name}`)
        .join(' · '),
    },
    {
      label: 'red herring',
      detail: herring ? `${herring.name} registers as a Demon to the Fortune Teller` : 'not among the chosen',
    },
  ];

  const canonicalYes = trueDemon !== null || herring !== null;
  const answers: LegalAnswer[] = [
    answer(
      `ft:${canonicalYes ? 'yes' : 'no'}`,
      canonicalYes,
      canonicalYes ? 'Yes — nod' : 'No — shake head',
      [
        ...base,
        {
          label: 'result',
          detail: `${
            trueDemon ? `${trueDemon.name} is the Demon` : herring ? `${herring.name} is the red herring` : 'neither is a Demon'
          } -> ${canonicalYes ? 'YES' : 'NO'}`,
        },
      ],
    ),
  ];

  // §4.3 — an ambiguous chosen player may be ruled to register as the Demon,
  // which flips a No into a Yes.
  if (!canonicalYes) {
    for (const player of chosen) {
      const demonOption = registrationOptionsForCharacterId(player.characterId).find(
        (o) => o.team === 'demon' && characterById(player.characterId).team !== 'demon',
      );
      if (!demonOption) continue;
      answers.push(
        answer(
          `ft:yes:${player.id}`,
          true,
          'Yes — nod',
          [
            ...base,
            {
              label: 'registration ruling',
              detail: `${player.name} (${characterById(player.characterId).name}) ruled to register as the Demon`,
            },
            { label: 'result', detail: '-> YES' },
          ],
          [{ playerId: player.id, registersAs: demonOption }],
        ),
      );
    }
  }
  return answers;
};

export const undertakerAnswers: Resolver = (view) =>
  // §16.5 — a Virgin trigger plus a vote execution means two, and the Storyteller
  // chooses which one the Undertaker learns.
  view.todaysExecutions.map((execution) => {
    const player = view.players.find((p) => p.id === execution.playerId);
    return answer(
      `undertaker:${execution.playerId}`,
      execution.characterIdAtDeath,
      characterById(execution.characterIdAtDeath).name,
      [
        {
          label: 'executed today',
          detail: `${player?.name ?? execution.playerId} (${execution.kind})`,
        },
        {
          label: 'result',
          detail: `true character at death -> ${characterById(execution.characterIdAtDeath).name}`,
        },
      ],
    );
  });

/** §4.8 — soft constraints, same as the Fortune Teller. No target, no answers. */
export const ravenkeeperAnswers: Resolver = (view, _actorId, targets = []) => {
  if (targets.length === 0) return [];
  const target = playerById(view, targets[0]!);
  // Guide §13 — a detection ability shows the TRUE character, never the believed
  // one. The Drunk is shown as the Drunk.
  const answers: LegalAnswer[] = [
    answer(
      `ravenkeeper:${target.id}`,
      target.characterId,
      characterById(target.characterId).name,
      [
        { label: 'chosen', detail: target.name },
        {
          label: 'result',
          detail: `true character -> ${characterById(target.characterId).name}`,
        },
      ],
    ),
  ];

  for (const option of registrationOptionsForCharacterId(target.characterId)) {
    if (option.team === characterById(target.characterId).team) continue;
    answers.push(
      answer(
        `ravenkeeper:${target.id}:${option.team}`,
        target.characterId,
        `a ${option.team} of the Storyteller's choosing`,
        [
          { label: 'chosen', detail: target.name },
          {
            label: 'registration ruling',
            detail: `${target.name} ruled to register as ${option.team}; show a ${option.team} token not in play`,
          },
        ],
        [{ playerId: target.id, registersAs: option }],
      ),
    );
  }
  return answers;
};

/** Keyed by night-order step id (Task 9). */
export const RESOLVERS: Readonly<Record<string, Resolver>> = Object.freeze({
  chef: chefAnswers,
  empath: empathAnswers,
  washerwoman: washerwomanAnswers,
  librarian: librarianAnswers,
  investigator: investigatorAnswers,
  fortune_teller: fortuneTellerAnswers,
  undertaker: undertakerAnswers,
  ravenkeeper: ravenkeeperAnswers,
});
```

**One thing to notice while implementing.** In `oneOfTwo`, `shownCharacterId` computes the same value on both branches. That is deliberate and it is a limitation, not a bug: when a Recluse is ruled to register as a Minion, the Storyteller must physically show *some* Minion token, and which one is their choice, recorded on the step's `stChoice` (§3.6). The resolver cannot pick it. Leave the branch collapsed to `player.characterId` and keep the comment — the alternative is enumerating every not-in-play Minion × every decoy, which is the kilobyte cross-product §3.6 explicitly refuses to store.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/editions/troubleBrewing && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/editions/troubleBrewing/resolvers.ts src/editions/troubleBrewing/resolvers.test.ts
git commit -m "$(cat <<'EOF'
feat(edition): add the information resolvers with legal answer sets

Every resolver returns LegalAnswer[] with the canonical answer first and its
§8.2 derivation attached, and the Recluse/Spy cross-product as separate
registration-class answers carrying their rulings (§4.3).

The rules that bit earlier drafts are covered: the Librarian has an explicit
zero-Outsiders branch and may be shown the Drunk; the Washerwoman may not; the
Undertaker and the Ravenkeeper report the TRUE character, so an executed Drunk
reads as the Drunk; and the Undertaker returns two answers when a Virgin trigger
and a vote both executed someone the same day.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 9: Night order data and the lazy cursor

Four separate bugs live in this task's territory, all fixed in the spec and all easy to reintroduce: the night-scoped key (without it night 2 ends instantly), skipped steps not counting as settled (a hard stall, at night, live), group steps being unselectable, and the cursor being assumed monotonic.

**A defect in Task 4 surfaces here and this task fixes it.** §6.3's Scarlet Woman condition is `isDemon && demonSince != null && !demonNotified`. Task 4 sets `demonSince` on the original Demon at the deal but leaves `demonNotified` false, so the original Imp would be woken on night 2 and shown a "You are the Imp" card. The deal must set `demonNotified: true` for the Demon it assigns.

**Files:**
- Create: `src/editions/troubleBrewing/stepIds.ts`
- Create: `src/editions/troubleBrewing/nightOrder.ts`
- Create: `src/editions/troubleBrewing/index.ts`
- Create: `src/engine/selectors/nightCursor.ts`
- Modify: `src/engine/reducer/applyEvent.ts` — set `demonNotified` on the dealt Demon
- Test: `src/editions/troubleBrewing/nightOrder.test.ts`, `src/engine/selectors/nightCursor.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 6, 7, 8.
- Produces:
  - `STEP_IDS: readonly string[]` — the frozen replay contract
  - `interface NightStep { id; grouping: 'per-actor' | 'group' | 'pseudo'; wakes(view): RulesViewPlayer[]; condition(view, actors): boolean; script: StepScript; reminderTokens: { add: StatusName[]; remove: StatusName[] }; targets: StepTargets | null; effect: StepEffect | null; resolverId: string | null }`
  - `FIRST_NIGHT: readonly NightStep[]`, `OTHER_NIGHTS: readonly NightStep[]`, `nightOrderFor(nightNumber)`
  - `stepKey(step, phase, actorId): string`
  - `nextStep(state): CursorPosition | null`
  - `interface CursorPosition { step; actors; actor; conditionMet; key }`
  - `nightOverview(state): Array<{ step; actors; state: 'settled' | 'current' | 'upcoming'; key }>` — Plan 2's night overview screen reads this

**One shape addition to §6.2, stated so it is a decision rather than drift.** §6.2 lists `dusk_confirm_eyes_closed`, `dawn_wait` and `dawn_announce_deaths` as pseudo-steps but does not say how the cursor selects a step with no actors, since §6.1's predicate requires `wakes()` to be non-empty. This plan adds a third `grouping` value, `'pseudo'`, which the cursor offers on the unsettled check alone. Nothing else changes.

- [ ] **Step 1: Write the failing tests**

`src/editions/troubleBrewing/nightOrder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { STEP_IDS } from './stepIds';
import { FIRST_NIGHT, OTHER_NIGHTS, nightOrderFor } from './nightOrder';
import { SINGLE_KEY_STEP_IDS } from '@/engine/reducer/fold';
import { RESOLVERS } from './resolvers';

describe('the frozen step id list (§3.8)', () => {
  // A snapshot in code, not in a .snap file: this list is part of the replay
  // contract, so changing it must be a deliberate edit to a test, reviewed.
  it('is exactly this list, in this order', () => {
    expect(STEP_IDS).toEqual([
      'dusk_confirm_eyes_closed',
      'minion_info',
      'demon_info',
      'poisoner',
      'monk',
      'spy',
      'scarlet_woman_notify',
      'imp',
      'ravenkeeper',
      'undertaker',
      'washerwoman',
      'librarian',
      'investigator',
      'chef',
      'empath',
      'fortune_teller',
      'butler',
      'dawn_wait',
      'dawn_announce_deaths',
    ]);
  });

  it('contains every step used by either night order and nothing else', () => {
    const used = new Set([...FIRST_NIGHT, ...OTHER_NIGHTS].map((s) => s.id));
    expect([...used].sort()).toEqual([...STEP_IDS].sort());
  });

  it('has no duplicate step ids within an order', () => {
    for (const order of [FIRST_NIGHT, OTHER_NIGHTS]) {
      expect(new Set(order.map((s) => s.id)).size).toBe(order.length);
    }
  });

  // The reducer duplicates this set as SINGLE_KEY_STEP_IDS because it cannot
  // import the night order without pulling in the edition barrel (Task 4). A step
  // that drifts between the two settles under the wrong key and either loops
  // forever or skips silently.
  it('agrees with the reducer\'s SINGLE_KEY_STEP_IDS about what settles once per night', () => {
    const perNight = new Set(
      [...FIRST_NIGHT, ...OTHER_NIGHTS].filter((s) => s.settleScope === 'per-night').map((s) => s.id),
    );
    expect([...SINGLE_KEY_STEP_IDS].sort()).toEqual([...perNight].sort());
  });

  // The Imp is the one step whose settleScope diverges from its grouping.
  it('settles the Imp once per night, not once per actor', () => {
    const imp = OTHER_NIGHTS.find((s) => s.id === 'imp')!;
    expect(imp.grouping).toBe('per-actor');
    expect(imp.settleScope).toBe('per-night');
    for (const other of [...FIRST_NIGHT, ...OTHER_NIGHTS]) {
      if (other.id === 'imp') continue;
      expect(other.settleScope).toBe(other.grouping === 'per-actor' ? 'per-actor' : 'per-night');
    }
  });

  // §10.3 — the handover instruction may only ever be rendered inside Spy Mode.
  // This is edition DATA, so no behavioural test would ever look at it.
  it('never puts handover copy in a step instruction (§10.3)', () => {
    for (const step of [...FIRST_NIGHT, ...OTHER_NIGHTS]) {
      expect(step.script.instruction).not.toMatch(/hand (it|the phone|this) over/i);
      expect(step.script.instruction).not.toMatch(/give (it|the phone) to/i);
    }
  });

  // Same duplicated-data hazard as SINGLE_KEY_STEP_IDS: resolverId is a string
  // keyed into RESOLVERS, and nothing in the engine would notice a typo.
  it('names only resolvers that exist, and uses every resolver', () => {
    const named = [...FIRST_NIGHT, ...OTHER_NIGHTS]
      .map((s) => s.resolverId)
      .filter((id): id is string => id !== null);
    expect([...new Set(named)].sort()).toEqual(Object.keys(RESOLVERS).sort());
  });
});

describe('night order composition (§6.3, guide §3)', () => {
  it('runs the first night in the guide\'s order', () => {
    expect(FIRST_NIGHT.map((s) => s.id)).toEqual([
      'dusk_confirm_eyes_closed',
      'minion_info',
      'demon_info',
      'poisoner',
      'spy',
      'washerwoman',
      'librarian',
      'investigator',
      'chef',
      'empath',
      'fortune_teller',
      'butler',
      'dawn_wait',
      'dawn_announce_deaths',
    ]);
  });

  it('runs every other night in the guide\'s order', () => {
    expect(OTHER_NIGHTS.map((s) => s.id)).toEqual([
      'dusk_confirm_eyes_closed',
      'poisoner',
      'monk',
      'spy',
      'scarlet_woman_notify',
      'imp',
      'ravenkeeper',
      'undertaker',
      'empath',
      'fortune_teller',
      'butler',
      'dawn_wait',
      'dawn_announce_deaths',
    ]);
  });

  it('puts status modifiers before the kill and reactive abilities after it (guide §15)', () => {
    const index = (id: string) => OTHER_NIGHTS.findIndex((s) => s.id === id);
    expect(index('poisoner')).toBeLessThan(index('monk'));
    expect(index('monk')).toBeLessThan(index('imp'));
    expect(index('imp')).toBeLessThan(index('ravenkeeper'));
    expect(index('ravenkeeper')).toBeLessThan(index('undertaker'));
    expect(index('undertaker')).toBeLessThan(index('empath'));
  });

  it('selects the first-night order for night 1 only', () => {
    expect(nightOrderFor(1)).toBe(FIRST_NIGHT);
    expect(nightOrderFor(2)).toBe(OTHER_NIGHTS);
    expect(nightOrderFor(9)).toBe(OTHER_NIGHTS);
  });
});

describe('wakes() and the Drunk (§4.1)', () => {
  it('wakes a Drunk-believing-Monk at the Monk step and the real Monk too', () => {
    const view = toRulesView(
      buildGame({
        roles: [
          ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'monk'], ['p4', 'drunk'],
          ['p5', 'chef'], ['p6', 'empath'], ['p7', 'soldier'], ['p8', 'butler'], ['p9', 'saint'],
        ],
        drunkBelief: { playerId: 'p4', believesCharacterId: 'monk' },
        upTo: { kind: 'night', number: 2 },
      }).state,
    );
    const monk = OTHER_NIGHTS.find((s) => s.id === 'monk')!;
    expect(monk.wakes(view).map((p) => p.id)).toEqual(['p3', 'p4']);
  });

  it('does not wake a dead Monk but does wake a dead Ravenkeeper (§6.2)', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'monk'], ['p4', 'ravenkeeper'],
        ['p5', 'chef'], ['p6', 'empath'], ['p7', 'soldier'],
      ],
      upTo: { kind: 'night', number: 2 },
    });
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'monk', cause: 'demon' });
    b.push('DEATH', { playerId: 'p4', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    const view = toRulesView(b.state);
    expect(OTHER_NIGHTS.find((s) => s.id === 'monk')!.wakes(view)).toEqual([]);
    expect(OTHER_NIGHTS.find((s) => s.id === 'ravenkeeper')!.wakes(view).map((p) => p.id)).toEqual(['p4']);
  });
});

describe('step conditions (§6.3)', () => {
  function nine(upTo: { kind: 'night' | 'day'; number: number }) {
    return buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'scarlet_woman'], ['p4', 'undertaker'],
        ['p5', 'ravenkeeper'], ['p6', 'chef'], ['p7', 'empath'], ['p8', 'butler'], ['p9', 'saint'],
      ],
      upTo,
    });
  }

  it('withholds Minion info and Demon info below 7 players', () => {
    const small = toRulesView(
      buildGame({
        roles: [['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'chef'], ['p4', 'empath'], ['p5', 'monk']],
      }).state,
    );
    const minionInfo = FIRST_NIGHT.find((s) => s.id === 'minion_info')!;
    const demonInfo = FIRST_NIGHT.find((s) => s.id === 'demon_info')!;
    expect(minionInfo.condition(small, minionInfo.wakes(small))).toBe(false);
    expect(demonInfo.condition(small, demonInfo.wakes(small))).toBe(false);
  });

  it('runs Minion info and Demon info at 7+ players', () => {
    const view = toRulesView(nine({ kind: 'night', number: 1 }).state);
    const minionInfo = FIRST_NIGHT.find((s) => s.id === 'minion_info')!;
    expect(minionInfo.condition(view, minionInfo.wakes(view))).toBe(true);
  });

  it('runs the Undertaker only when someone was executed today', () => {
    const quiet = toRulesView(nine({ kind: 'night', number: 2 }).state);
    const undertaker = OTHER_NIGHTS.find((s) => s.id === 'undertaker')!;
    expect(undertaker.condition(quiet, undertaker.wakes(quiet))).toBe(false);

    const b = nine({ kind: 'day', number: 1 });
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'execution', executionKind: 'vote' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    const busy = toRulesView(b.state);
    expect(undertaker.condition(busy, undertaker.wakes(busy))).toBe(true);
  });

  it('runs the Ravenkeeper only when they died this night', () => {
    const b = nine({ kind: 'night', number: 2 });
    const ravenkeeper = OTHER_NIGHTS.find((s) => s.id === 'ravenkeeper')!;
    const before = toRulesView(b.state);
    expect(ravenkeeper.condition(before, ravenkeeper.wakes(before))).toBe(false);

    b.push('DEATH', { playerId: 'p5', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    const after = toRulesView(b.state);
    expect(ravenkeeper.condition(after, ravenkeeper.wakes(after))).toBe(true);
  });

  it('does not run the Ravenkeeper for a death on a previous night', () => {
    const b = nine({ kind: 'night', number: 2 });
    b.push('DEATH', { playerId: 'p5', characterIdAtDeath: 'ravenkeeper', cause: 'demon' });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 3 });
    const ravenkeeper = OTHER_NIGHTS.find((s) => s.id === 'ravenkeeper')!;
    const view = toRulesView(b.state);
    expect(ravenkeeper.condition(view, ravenkeeper.wakes(view))).toBe(false);
  });

  // §6.3 — a persistent flag, not "promoted this night". A promotion by daytime
  // execution on day 3 must notify on night 4.
  it('notifies a Scarlet Woman promoted by a DAYTIME execution on the following night', () => {
    const b = nine({ kind: 'day', number: 3 });
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'execution', executionKind: 'vote' });
    b.push('ROLE_CHANGED', { playerId: 'p3', from: 'scarlet_woman', to: 'imp', reason: 'scarlet_woman' });
    b.push('PHASE_ADVANCED', { phase: 'night', number: 4 });
    const view = toRulesView(b.state);
    const notify = OTHER_NIGHTS.find((s) => s.id === 'scarlet_woman_notify')!;
    expect(notify.wakes(view).map((p) => p.id)).toEqual(['p3']);
    expect(notify.condition(view, notify.wakes(view))).toBe(true);
  });

  // The Task 4 defect this task fixes: without demonNotified on the deal, the
  // original Imp is woken on night 2 and shown a "You are the Imp" card.
  it('does not notify the original Demon, who was told at setup', () => {
    const view = toRulesView(nine({ kind: 'night', number: 2 }).state);
    const notify = OTHER_NIGHTS.find((s) => s.id === 'scarlet_woman_notify')!;
    expect(notify.wakes(view)).toEqual([]);
  });
});
```

`src/engine/selectors/nightCursor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { nextStep, nightOverview, stepKey } from './nightCursor';
import { OTHER_NIGHTS } from '@/editions/troubleBrewing/nightOrder';
import type { GameEvent } from '@/engine/events';

function nine(upTo: { kind: 'night' | 'day'; number: number }) {
  return buildGame({
    roles: [
      ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'scarlet_woman'], ['p4', 'monk'],
      ['p5', 'ravenkeeper'], ['p6', 'chef'], ['p7', 'empath'], ['p8', 'butler'], ['p9', 'saint'],
    ],
    upTo,
  });
}

/** Settles the current step, whatever it is, without caring what it does. */
function settleCurrent(builder: ReturnType<typeof nine>): string | null {
  const position = nextStep(builder.state);
  if (!position) return null;
  const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
  builder.push('NIGHT_STEP_SKIPPED', {
    stepId: position.step.id,
    actorIds,
    reason: 'st_skip',
  });
  return position.step.id;
}

describe('stepKey (§3.7, §6.1)', () => {
  it('is night-scoped and per-actor for a per-actor step', () => {
    const monk = OTHER_NIGHTS.find((s) => s.id === 'monk')!;
    expect(stepKey(monk, { kind: 'night', number: 3 }, 'p4')).toBe('3:monk:p4');
  });

  it('is one key for the whole set on a group step', () => {
    const dusk = OTHER_NIGHTS.find((s) => s.id === 'dusk_confirm_eyes_closed')!;
    expect(stepKey(dusk, { kind: 'night', number: 3 }, null)).toBe('3:dusk_confirm_eyes_closed:GROUP');
  });
});

describe('nextStep (§6.1)', () => {
  it('starts at dusk on night 1', () => {
    expect(nextStep(nine({ kind: 'night', number: 1 }).state)?.step.id).toBe('dusk_confirm_eyes_closed');
  });

  // The v3.1 bug: without the night in the key, night 2 ends before it starts.
  it('offers a full night 2 even though the same step ids settled on night 1', () => {
    const b = nine({ kind: 'night', number: 1 });
    let guard = 0;
    while (settleCurrent(b) !== null) {
      if (++guard > 100) throw new Error('night 1 did not terminate');
    }
    expect(nextStep(b.state)).toBeNull();

    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('DAY_CLOSED', {});
    b.push('PHASE_ADVANCED', { phase: 'night', number: 2 });
    expect(nextStep(b.state)?.step.id).toBe('dusk_confirm_eyes_closed');
  });

  // v2 counted only resolved steps, so tapping skip returned the same step forever.
  it('treats a skipped step as settled and advances', () => {
    const b = nine({ kind: 'night', number: 2 });
    const first = settleCurrent(b);
    expect(nextStep(b.state)?.step.id).not.toBe(first);
  });

  it('offers a per-actor step once per actor', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'empath'], ['p4', 'drunk'],
        ['p5', 'chef'], ['p6', 'monk'], ['p7', 'soldier'],
      ],
      drunkBelief: { playerId: 'p4', believesCharacterId: 'empath' },
      upTo: { kind: 'night', number: 2 },
    });
    const seen: Array<string | undefined> = [];
    for (let i = 0; i < 40; i += 1) {
      const position = nextStep(b.state);
      if (!position) break;
      if (position.step.id === 'empath') seen.push(position.actor?.id);
      const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
      b.push('NIGHT_STEP_SKIPPED', { stepId: position.step.id, actorIds, reason: 'st_skip' });
    }
    expect(seen).toEqual(['p3', 'p4']);
  });

  it('settles a group step once for the whole set', () => {
    const b = nine({ kind: 'night', number: 1 });
    // Settle dusk, then Minion info: one event covering the group.
    settleCurrent(b);
    const position = nextStep(b.state)!;
    expect(position.step.id).toBe('minion_info');
    expect(position.actor).toBeNull();
    b.push('NIGHT_STEP_RESOLVED', {
      stepId: 'minion_info',
      actorIds: position.actors.map((p) => p.id),
      targets: [],
      chosenAnswer: 'shown the Demon',
      answerClass: 'canonical',
      registrationRulings: [],
      abilityFunctional: true,
      effectSuppressed: false,
    });
    expect(nextStep(b.state)?.step.id).toBe('demon_info');
  });

  // §6.1 — deliberately non-monotonic. A mid-night promotion re-opens an earlier step.
  it('re-opens an earlier step after a mid-night Scarlet Woman promotion', () => {
    const b = nine({ kind: 'night', number: 2 });
    let position = nextStep(b.state)!;
    while (position.step.id !== 'imp') {
      const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
      b.push('NIGHT_STEP_SKIPPED', { stepId: position.step.id, actorIds, reason: 'st_skip' });
      position = nextStep(b.state)!;
    }
    // The Imp self-kills; the Scarlet Woman is promoted mid-night.
    b.push('NIGHT_STEP_RESOLVED', {
      stepId: 'imp',
      actorIds: ['p1'],
      perceivedCharacterId: 'imp',
      targets: ['p1'],
      chosenAnswer: 'starpass',
      answerClass: 'canonical',
      registrationRulings: [],
      abilityFunctional: true,
      effectSuppressed: false,
    });
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'demon' });
    b.push('ROLE_CHANGED', { playerId: 'p3', from: 'scarlet_woman', to: 'imp', reason: 'scarlet_woman' });

    // scarlet_woman_notify sits BEFORE imp in the order, and is now unsettled for p3.
    expect(nextStep(b.state)?.step.id).toBe('scarlet_woman_notify');
    expect(nextStep(b.state)?.actor?.id).toBe('p3');
  });

  it('returns null once the game is over (§4.7)', () => {
    const b = nine({ kind: 'night', number: 2 });
    b.push('GAME_ENDED', { winner: 'good', reason: 'demon_dead' });
    expect(nextStep(b.state)).toBeNull();
  });

  it('returns null during the day', () => {
    expect(nextStep(nine({ kind: 'day', number: 1 }).state)).toBeNull();
  });

  it('terminates when every step is skipped', () => {
    const b = nine({ kind: 'night', number: 2 });
    let steps = 0;
    while (settleCurrent(b) !== null) {
      if (++steps > 100) throw new Error('cursor did not terminate');
    }
    expect(nextStep(b.state)).toBeNull();
    expect(steps).toBeGreaterThan(5);
  });

  it('reports conditionMet false rather than hiding the step', () => {
    const b = nine({ kind: 'night', number: 2 });
    let position = nextStep(b.state)!;
    const guard = new Set<string>();
    while (position.step.id !== 'undertaker') {
      const actorIds = position.actor ? [position.actor.id] : position.actors.map((p) => p.id);
      b.push('NIGHT_STEP_SKIPPED', { stepId: position.step.id, actorIds, reason: 'st_skip' });
      const next = nextStep(b.state);
      if (!next) throw new Error('never reached the Undertaker');
      if (guard.has(next.key)) throw new Error('cursor looped');
      guard.add(next.key);
      position = next;
    }
    // Nobody was executed, so the step is offered with conditionMet false and the
    // command layer will auto-skip it with reason 'condition_unmet' (§6.1).
    expect(position.conditionMet).toBe(false);
  });
});

describe('nightOverview (§8.1)', () => {
  it('labels settled, current and upcoming steps for tonight', () => {
    const b = nine({ kind: 'night', number: 2 });
    settleCurrent(b);
    const overview = nightOverview(b.state);
    expect(overview[0]?.state).toBe('settled');
    expect(overview.filter((row) => row.state === 'current')).toHaveLength(1);
    expect(overview.some((row) => row.state === 'upcoming')).toBe(true);
  });

  it('is empty during the day', () => {
    expect(nightOverview(nine({ kind: 'day', number: 1 }).state)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/editions/troubleBrewing/nightOrder.test.ts src/engine/selectors/nightCursor.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the frozen step id list**

`src/editions/troubleBrewing/stepIds.ts`:

```ts
/**
 * Part of the replay contract (§3.8). Every NIGHT_STEP_RESOLVED and
 * NIGHT_STEP_SKIPPED in every persisted game references one of these, and
 * settledStepIds keys are built from them — so renaming one silently un-settles
 * every step of that name in every saved game. Add to the end; never rename.
 */
export const STEP_IDS = [
  'dusk_confirm_eyes_closed',
  'minion_info',
  'demon_info',
  'poisoner',
  'monk',
  'spy',
  'scarlet_woman_notify',
  'imp',
  'ravenkeeper',
  'undertaker',
  'washerwoman',
  'librarian',
  'investigator',
  'chef',
  'empath',
  'fortune_teller',
  'butler',
  'dawn_wait',
  'dawn_announce_deaths',
] as const;

export type StepId = (typeof STEP_IDS)[number];

```

- [ ] **Step 4: Write the night order**

`src/editions/troubleBrewing/nightOrder.ts`. This is the only file permitted to import `playersWithPerceivedCharacter` (§4.1, enforced in Task 6).

```ts
import { playersWithPerceivedCharacter } from '@/engine/selectors/players';
import { alive } from '@/engine/selectors/players';
import type { PlayerId, RulesView, RulesViewPlayer, StatusName } from '@/engine/types';
import { characterById } from './characters';
import { INFO_THRESHOLD_PLAYERS } from './distribution';
import type { StepId } from './stepIds';

export type StepGrouping = 'per-actor' | 'group' | 'pseudo';
export type StatusLifetimeName = 'until_dawn' | 'tonight_and_tomorrow';

export interface StepScript {
  instruction: string;
  wakeConfirm: string;
  sleepConfirm: string;
  showCard?: 'this_is_the_demon' | 'these_are_your_minions' | 'not_in_play' | 'you_are';
  showToken?: boolean;
  output: 'point' | 'fingers' | 'nod' | 'token' | 'handover' | 'none';
}

/** All constraints are SOFT (§4.8). Off-constraint picks are selectable and flag. */
export interface StepTargets {
  min: number;
  max: number;
  distinct?: boolean;
  warnSelf?: boolean;
  warnDead?: boolean;
  warnRepeat?: boolean;
}

export interface StepEffect {
  status: StatusName;
  lifetime: StatusLifetimeName;
}

export interface NightStep {
  id: StepId;
  grouping: StepGrouping;
  /**
   * Whether the step settles once per actor or once for the whole night.
   *
   * Per-actor is the default and is what lets a real Empath and a
   * Drunk-believing-Empath both resolve separately. The **Imp overrides it to
   * `per-night`**: the Demon gets one kill a night regardless of who holds the
   * token, and without this a mid-night Scarlet Woman promotion leaves
   * `${night}:imp:${newDemonId}` unsettled, so the cursor offers the Imp step a
   * second time and `advanceToDay` will not let you leave the night until you
   * resolve or skip it.
   */
  settleScope: 'per-actor' | 'per-night';
  /** Who is roused. NOT the same question as whether their ability works (§6.2). */
  wakes: (view: RulesView) => RulesViewPlayer[];
  /** Whether the step fires at all tonight. False means auto-skip with a log entry (§6.1). */
  condition: (view: RulesView, actors: readonly RulesViewPlayer[]) => boolean;
  script: StepScript;
  /** Physical table instructions, not the expiry mechanism (§4.4). */
  reminderTokens: { add: StatusName[]; remove: StatusName[] };
  targets: StepTargets | null;
  effect: StepEffect | null;
  /** Key into RESOLVERS (Task 8), or null for a step with no computed answer. */
  resolverId: string | null;
}

const always = (): boolean => true;
const noTokens = { add: [] as StatusName[], remove: [] as StatusName[] };

/** §4.1 — the sanctioned reader of perceived character. */
const perceivedActors =
  (characterId: string, requireAlive = true) =>
  (view: RulesView): RulesViewPlayer[] => {
    const actors = playersWithPerceivedCharacter(view, characterId);
    return requireAlive ? actors.filter(alive) : actors;
  };

/** `settleScope` defaults from `grouping`; only the Imp overrides it. */
function step(config: Omit<NightStep, 'settleScope'> & { settleScope?: NightStep['settleScope'] }): NightStep {
  return {
    ...config,
    settleScope: config.settleScope ?? (config.grouping === 'per-actor' ? 'per-actor' : 'per-night'),
  };
}

// ---- pseudo-steps ----

const DUSK = step({
  id: 'dusk_confirm_eyes_closed',
  grouping: 'pseudo',
  wakes: () => [],
  condition: always,
  script: {
    instruction: 'Confirm every player has their eyes closed. Wait about ten seconds.',
    wakeConfirm: '',
    sleepConfirm: 'Eyes closed',
    output: 'none',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

const DAWN_WAIT = step({
  id: 'dawn_wait',
  grouping: 'pseudo',
  wakes: () => [],
  condition: always,
  script: {
    instruction: 'Wait about ten seconds, then call eyes open.',
    wakeConfirm: '',
    sleepConfirm: 'Eyes open',
    output: 'none',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

const DAWN_ANNOUNCE = step({
  id: 'dawn_announce_deaths',
  grouping: 'pseudo',
  wakes: () => [],
  condition: always,
  script: {
    instruction:
      'Announce who died tonight, or that no one died. Read the resolved outcome below.',
    wakeConfirm: '',
    sleepConfirm: 'Announced',
    output: 'none',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- evil info, 7+ players only ----

const MINION_INFO = step({
  id: 'minion_info',
  grouping: 'group',
  wakes: (view) => view.players.filter((p) => p.team === 'minion'),
  // Guide §2, §5.2 — 7+ players only. The eye contact itself needs two Minions,
  // but the step still runs at 7+ with one, to show them the Demon.
  condition: (view) => view.players.length >= INFO_THRESHOLD_PLAYERS,
  script: {
    instruction:
      'If there is more than one Minion, have them make eye contact. Then show the "This is the Demon" card and point to the Demon.',
    wakeConfirm: 'Minions awake',
    sleepConfirm: 'Minions asleep',
    showCard: 'this_is_the_demon',
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

const DEMON_INFO = step({
  id: 'demon_info',
  grouping: 'group',
  wakes: (view) => view.players.filter((p) => p.team === 'demon'),
  condition: (view) => view.players.length >= INFO_THRESHOLD_PLAYERS,
  script: {
    instruction:
      'Show the "These are your Minions" card and point to each Minion. Then show the "These characters are not in play" card with the three bluffs.',
    wakeConfirm: 'Demon awake',
    sleepConfirm: 'Demon asleep',
    showCard: 'these_are_your_minions',
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- status modifiers ----

const POISONER = step({
  id: 'poisoner',
  grouping: 'per-actor',
  wakes: perceivedActors('poisoner'),
  condition: always,
  script: {
    instruction: 'The Poisoner points to a player. That player is poisoned tonight and tomorrow day.',
    wakeConfirm: 'Poisoner awake',
    sleepConfirm: 'Poisoner asleep',
    output: 'point',
  },
  reminderTokens: { add: ['poisoned'], remove: ['poisoned'] },
  targets: { min: 1, max: 1, warnDead: true },
  effect: { status: 'poisoned', lifetime: 'tonight_and_tomorrow' },
  resolverId: null,
});

const MONK = step({
  id: 'monk',
  grouping: 'per-actor',
  wakes: perceivedActors('monk'),
  condition: always,
  script: {
    instruction: 'The Monk points to a player other than themselves. That player is safe from the Demon tonight.',
    wakeConfirm: 'Monk awake',
    sleepConfirm: 'Monk asleep',
    output: 'point',
  },
  reminderTokens: { add: ['protected'], remove: ['protected'] },
  // Soft: a Monk who points at himself at the table must be recordable (§4.8).
  targets: { min: 1, max: 1, warnSelf: true, warnDead: true },
  effect: { status: 'protected', lifetime: 'until_dawn' },
  resolverId: null,
});

const SPY = step({
  id: 'spy',
  grouping: 'per-actor',
  wakes: perceivedActors('spy'),
  condition: always,
  script: {
    /**
     * §10.3 — "the instruction 'hand the phone over' is rendered ONLY inside Spy
     * Mode. There is no screen that says hand it over which is not already Spy
     * Mode." This string is rendered on the night-step modal, over the Grimoire,
     * so it must carry only the guarded action. The handover copy belongs to
     * Plan 3, inside SpyRoot.
     */
    instruction: 'Enter Spy Mode.',
    wakeConfirm: 'Spy awake',
    sleepConfirm: 'Spy asleep',
    output: 'handover',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- promotion notification ----

const SCARLET_WOMAN_NOTIFY = step({
  id: 'scarlet_woman_notify',
  grouping: 'per-actor',
  /**
   * §6.3 — a persistent flag, not "promoted this night". demonSince is set when
   * the role changes and demonNotified only once they have been told, so a
   * daytime promotion on day 3 is notified on night 4.
   */
  wakes: (view) =>
    view.players.filter(
      (p) =>
        p.alive &&
        characterById(p.characterId).team === 'demon' &&
        p.demonSince !== null &&
        !p.demonNotified,
    ),
  condition: (_view, actors) => actors.length > 0,
  script: {
    instruction: 'Show the "You are" card and the Demon token.',
    wakeConfirm: 'Awake',
    sleepConfirm: 'Asleep',
    showCard: 'you_are',
    showToken: true,
    output: 'token',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: null,
});

// ---- the kill ----

const IMP = step({
  id: 'imp',
  grouping: 'per-actor',
  // One kill a night for whoever holds the token. See settleScope's doc comment:
  // per-actor keying here gives the promoted Scarlet Woman a second kill.
  settleScope: 'per-night',
  wakes: perceivedActors('imp'),
  condition: always,
  script: {
    instruction:
      'The Imp points to a player, who dies. If they point to themselves, a Minion becomes the new Imp.',
    wakeConfirm: 'Imp awake',
    sleepConfirm: 'Imp asleep',
    output: 'point',
  },
  reminderTokens: noTokens,
  // Self-target is legal here — it is the starpass (§4.5).
  targets: { min: 1, max: 1, warnDead: true },
  effect: null,
  resolverId: null,
});

// ---- reactive info ----

const RAVENKEEPER = step({
  id: 'ravenkeeper',
  grouping: 'per-actor',
  // §6.2 — deliberately does NOT filter on alive. Their ability fires because
  // they died.
  wakes: perceivedActors('ravenkeeper', false),
  condition: (view, actors) =>
    actors.some((actor) =>
      view.deaths.some(
        (death) =>
          death.playerId === actor.id &&
          death.phase.kind === view.phase.kind &&
          death.phase.number === view.phase.number,
      ),
    ),
  script: {
    instruction: 'The Ravenkeeper points to a player. Show them that player\'s character token.',
    wakeConfirm: 'Ravenkeeper awake',
    sleepConfirm: 'Ravenkeeper asleep',
    showToken: true,
    output: 'token',
  },
  reminderTokens: noTokens,
  targets: { min: 1, max: 1 },
  effect: null,
  resolverId: 'ravenkeeper',
});

const UNDERTAKER = step({
  id: 'undertaker',
  grouping: 'per-actor',
  wakes: perceivedActors('undertaker'),
  condition: (view) => view.todaysExecutions.length > 0,
  script: {
    instruction: 'Show the Undertaker the character token of the player executed today.',
    wakeConfirm: 'Undertaker awake',
    sleepConfirm: 'Undertaker asleep',
    showToken: true,
    output: 'token',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'undertaker',
});

// ---- first-night one-shot info ----

const WASHERWOMAN = step({
  id: 'washerwoman',
  grouping: 'per-actor',
  wakes: perceivedActors('washerwoman'),
  condition: always,
  script: {
    instruction: 'Show a Townsfolk token, then point to two players — one of them is that character.',
    wakeConfirm: 'Washerwoman awake',
    sleepConfirm: 'Washerwoman asleep',
    showToken: true,
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'washerwoman',
});

const LIBRARIAN = step({
  id: 'librarian',
  grouping: 'per-actor',
  wakes: perceivedActors('librarian'),
  condition: always,
  script: {
    instruction:
      'Show an Outsider token and point to two players, or give the "zero" signal if no Outsiders are in play.',
    wakeConfirm: 'Librarian awake',
    sleepConfirm: 'Librarian asleep',
    showToken: true,
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'librarian',
});

const INVESTIGATOR = step({
  id: 'investigator',
  grouping: 'per-actor',
  wakes: perceivedActors('investigator'),
  condition: always,
  script: {
    instruction: 'Show a Minion token, then point to two players — one of them is that character.',
    wakeConfirm: 'Investigator awake',
    sleepConfirm: 'Investigator asleep',
    showToken: true,
    output: 'point',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'investigator',
});

const CHEF = step({
  id: 'chef',
  grouping: 'per-actor',
  wakes: perceivedActors('chef'),
  condition: always,
  script: {
    instruction: 'Hold up fingers for the number of pairs of adjacent evil players.',
    wakeConfirm: 'Chef awake',
    sleepConfirm: 'Chef asleep',
    output: 'fingers',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'chef',
});

// ---- nightly passive info ----

const EMPATH = step({
  id: 'empath',
  grouping: 'per-actor',
  wakes: perceivedActors('empath'),
  condition: always,
  script: {
    instruction: 'Hold up fingers for how many of their two alive neighbours are evil.',
    wakeConfirm: 'Empath awake',
    sleepConfirm: 'Empath asleep',
    output: 'fingers',
  },
  reminderTokens: noTokens,
  targets: null,
  effect: null,
  resolverId: 'empath',
});

const FORTUNE_TELLER = step({
  id: 'fortune_teller',
  grouping: 'per-actor',
  wakes: perceivedActors('fortune_teller'),
  condition: always,
  script: {
    instruction: 'The Fortune Teller points to two players. Nod or shake your head.',
    wakeConfirm: 'Fortune Teller awake',
    sleepConfirm: 'Fortune Teller asleep',
    output: 'nod',
  },
  reminderTokens: noTokens,
  targets: { min: 2, max: 2, distinct: true },
  effect: null,
  resolverId: 'fortune_teller',
});

const BUTLER = step({
  id: 'butler',
  grouping: 'per-actor',
  wakes: perceivedActors('butler'),
  condition: always,
  script: {
    instruction: 'The Butler points to a player other than themselves, who becomes their Master.',
    wakeConfirm: 'Butler awake',
    sleepConfirm: 'Butler asleep',
    output: 'point',
  },
  reminderTokens: { add: ['master'], remove: ['master'] },
  targets: { min: 1, max: 1, warnSelf: true },
  effect: { status: 'master', lifetime: 'tonight_and_tomorrow' },
  resolverId: null,
});

/** Guide §3, first night. */
export const FIRST_NIGHT: readonly NightStep[] = Object.freeze([
  DUSK,
  MINION_INFO,
  DEMON_INFO,
  POISONER,
  SPY,
  WASHERWOMAN,
  LIBRARIAN,
  INVESTIGATOR,
  CHEF,
  EMPATH,
  FORTUNE_TELLER,
  BUTLER,
  DAWN_WAIT,
  DAWN_ANNOUNCE,
]);

/** Guide §3, every other night. */
export const OTHER_NIGHTS: readonly NightStep[] = Object.freeze([
  DUSK,
  POISONER,
  MONK,
  SPY,
  SCARLET_WOMAN_NOTIFY,
  IMP,
  RAVENKEEPER,
  UNDERTAKER,
  EMPATH,
  FORTUNE_TELLER,
  BUTLER,
  DAWN_WAIT,
  DAWN_ANNOUNCE,
]);

export function nightOrderFor(nightNumber: number): readonly NightStep[] {
  return nightNumber === 1 ? FIRST_NIGHT : OTHER_NIGHTS;
}


/** Re-exported so callers need one import for a target check. */
export type { PlayerId };
```

- [ ] **Step 5: Write the cursor**

`src/engine/selectors/nightCursor.ts`:

```ts
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
```

- [ ] **Step 6: Write the edition barrel**

`src/editions/troubleBrewing/index.ts` — the one import surface for the engine:

```ts
export {
  CHARACTERS,
  alignmentOf,
  characterById,
  charactersByTeam,
  type Alignment,
  type Character,
  type RegistrationOption,
  type Team,
  type TeamCounts,
} from './characters';
export {
  DISTRIBUTION,
  INFO_THRESHOLD_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  distributionFor,
} from './distribution';
export {
  canRegisterAsTeam,
  isAmbiguous,
  registrationOptions,
  registrationOptionsForCharacterId,
} from './registration';
export { RESOLVERS, type Resolver } from './resolvers';
export { STEP_IDS, type StepId } from './stepIds';
export {
  FIRST_NIGHT,
  OTHER_NIGHTS,
  nightOrderFor,
  type NightStep,
  type StepEffect,
  type StepScript,
  type StepTargets,
} from './nightOrder';

export const EDITION = { id: 'troubleBrewing', version: '1' } as const;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: all green, including everything from Tasks 1–8. `npm run lint` matters here: `nightOrder.ts` and `nightCursor.ts` are the only files allowed to read perceived character, and the Task 6 rule proves it.

- [ ] **Step 8: Commit**

```bash
git add src/editions/troubleBrewing src/engine/selectors/nightCursor.ts src/engine/selectors/nightCursor.test.ts src/engine/reducer/applyEvent.ts
git commit -m "$(cat <<'EOF'
feat(engine): add the night order and the lazy cursor

stepKey is night-scoped, so night 2 offers a full night instead of ending
instantly, and settledStepIds counts skipped steps as settled, so tapping skip
advances instead of stalling. Group steps settle once for the whole set. The
cursor is deliberately non-monotonic: a mid-night Scarlet Woman promotion
re-opens a step earlier in the order, with a test for exactly that.

wakes() decides who is roused and condition() decides whether the step fires,
which keeps the Ravenkeeper waking while dead and gives an unmet trigger a log
entry rather than silence. nightOrder.ts is the only file permitted to read
perceived character.

Also fixes a Task 4 defect found while writing the Scarlet Woman condition: the
dealt Demon now has demonNotified true, or the original Imp is woken on night 2
and shown a "You are the Imp" card.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Status timeline property tests

§14 Tier 1. Task 3 tested the comparison in isolation; this tests it over generated event traces, which is where an off-by-one in *which phase a status was applied in* shows up.

**Files:**
- Test: `test/property/statusTimeline.property.test.ts` (create)

**Interfaces:**
- Consumes: Tasks 3, 4, 6.
- Produces: no production code. This task is property tests only — it asserts that code written in Tasks 3, 4 and 6 holds over generated traces, which is the whole of its deliverable.

An earlier draft of this plan also created `src/engine/selectors/statusTimeline.ts` with a `statusHistory` selector, justified as "Plan 2's Grimoire tooltip". §8.1 lists status *chips*, not timelines; nothing called it and no test imported it. **Cut.** If Plan 2 turns out to want a timeline tooltip, it is ten lines over `statusLedger` and belongs in the task that renders it.

- [ ] **Step 1: Write the failing test**

`test/property/statusTimeline.property.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LogBuilder } from '@test/helpers/game';
import { expiryFor, isStatusActive } from '@/engine/phase';
import { isPoisoned, isProtected } from '@/engine/selectors/statuses';
import { toRulesView } from '@/engine/selectors/rulesView';
import type { GameState, Phase } from '@/engine/types';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'monk'],
  ['p4', 'butler'],
  ['p5', 'chef'],
  ['p6', 'empath'],
  ['p7', 'soldier'],
];

interface TraceAction {
  poisonTarget: number;
  protectTarget: number;
  masterTarget: number;
  killPoisoner: boolean;
}

const traceArb = fc.array(
  fc.record({
    poisonTarget: fc.integer({ min: 0, max: 6 }),
    protectTarget: fc.integer({ min: 0, max: 6 }),
    masterTarget: fc.integer({ min: 0, max: 6 }),
    killPoisoner: fc.boolean(),
  }),
  { minLength: 1, maxLength: 5 },
);

/** Plays out `actions`, one night each, applying statuses the way the engine will. */
function playTrace(actions: TraceAction[]): { builder: LogBuilder; nights: number } {
  const builder = new LogBuilder();
  builder.push('GAME_CREATED', {
    edition: { id: 'troubleBrewing', version: '1' },
    players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
  });
  builder.push('ROLES_ASSIGNED', {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
    setupModifiers: [],
    demonBluffs: null,
    drunkBelief: null,
    redHerring: null,
  });

  let poisonerAlive = true;
  actions.forEach((action, index) => {
    const night = index + 1;
    builder.push('PHASE_ADVANCED', { phase: 'night', number: night });
    const now: Phase = { kind: 'night', number: night };

    if (poisonerAlive) {
      builder.push('STATUS_APPLIED', {
        playerId: ROLES[action.poisonTarget]![0],
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: expiryFor('tonight_and_tomorrow', now),
      });
    }
    builder.push('STATUS_APPLIED', {
      playerId: ROLES[action.protectTarget]![0],
      status: 'protected',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('until_dawn', now),
    });
    builder.push('STATUS_APPLIED', {
      playerId: ROLES[action.masterTarget]![0],
      status: 'master',
      sourcePlayerId: 'p4',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', now),
    });

    builder.push('PHASE_ADVANCED', { phase: 'day', number: night });
    if (action.killPoisoner && poisonerAlive) {
      builder.push('DEATH', {
        playerId: 'p2',
        characterIdAtDeath: 'poisoner',
        cause: 'execution',
        executionKind: 'vote',
      });
      poisonerAlive = false;
    }
    builder.push('DAY_CLOSED', {});
  });

  return { builder, nights: actions.length };
}

function poisonedIds(state: GameState): string[] {
  const view = toRulesView(state);
  return view.players.filter((p) => isPoisoned(p, view.phase)).map((p) => p.id);
}

function protectedIds(state: GameState): string[] {
  const view = toRulesView(state);
  return view.players.filter((p) => isProtected(p, view.phase)).map((p) => p.id);
}

describe('status timeline invariants (§14 Tier 1, §4.4)', () => {
  it('never carries night-N poison into night N+1', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        for (let cut = 1; cut <= actions.length; cut += 1) {
          const { builder } = playTrace(actions.slice(0, cut));
          // Open the next night and check nothing from the previous one survives.
          builder.push('PHASE_ADVANCED', { phase: 'night', number: cut + 1 });
          const carried = poisonedIds(builder.state);
          expect(carried).toEqual([]);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps night-N poison active through day N', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        const first = actions[0]!;
        const { builder } = playTrace([first]);
        // playTrace ends at DAY_CLOSED on day 1, so the current phase is day 1.
        expect(builder.state.phase).toEqual({ kind: 'day', number: 1 });
        expect(poisonedIds(builder.state)).toEqual([ROLES[first.poisonTarget]![0]]);
      }),
      { numRuns: 200 },
    );
  });

  it('never lets protection survive dawn', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        for (let cut = 1; cut <= actions.length; cut += 1) {
          const { builder } = playTrace(actions.slice(0, cut));
          expect(protectedIds(builder.state)).toEqual([]);
        }
      }),
      { numRuns: 200 },
    );
  });

  // §4.4 — declarative and time-driven, never actor-driven. Executing the
  // Poisoner the day after they acted must neither cancel their poison early nor
  // extend it, so the two traces must agree at every phase.
  it('makes expiry independent of whether the source is alive', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        const never = actions.map((a) => ({ ...a, killPoisoner: false }));
        const early = actions.map((a, index) => ({ ...a, killPoisoner: index === 0 }));
        for (let cut = 1; cut <= actions.length; cut += 1) {
          const a = playTrace(never.slice(0, cut)).builder;
          const b = playTrace(early.slice(0, cut)).builder;
          // Compare at the end of every phase the traces reached.
          expect(poisonedIds(b.state)).toEqual(poisonedIds(a.state));
          expect(protectedIds(b.state)).toEqual(protectedIds(a.state));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never leaves a status active in a phase before it was applied', () => {
    fc.assert(
      fc.property(traceArb, (actions) => {
        const { builder } = playTrace(actions);
        for (const player of builder.state.players) {
          for (const status of player.statusLedger) {
            const earlier: Phase = { kind: 'night', number: status.appliedAt.number - 1 };
            if (earlier.number >= 1) {
              expect(isStatusActive(status, earlier)).toBe(false);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npx vitest run test/property && npm run typecheck`
Expected: all green — five property families over roughly a thousand generated traces.

- [ ] **Step 3: Commit**

```bash
git add test/property/statusTimeline.property.test.ts
git commit -m "$(cat <<'EOF'
test(engine): add status timeline invariants as property tests

Generated traces over five nights of Poisoner, Monk and Butler marks assert the
§4.4 lifetimes hold end to end, not just in the comparison function: night-N
poison never reaches night N+1, protection never survives dawn, nothing is
active before it was applied, and executing the Poisoner on the day after they
acted neither cancels their poison early nor extends it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 11: Demon kill resolution

§4.5's order **is** the rule. v2 stated it twice — pseudocode and prose — and the two disagreed, with the pseudocode starpassing before checking Monk protection.

**Files:**
- Create: `src/engine/rules/demonKill.ts`
- Test: `src/engine/rules/demonKill.test.ts`

**Interfaces:**
- Consumes: `abilityFunctional` (Task 6), `isProtected` (Task 6), `characterById` (Task 2), `ResolutionLink` (Task 4).
- Produces:
  - `type KillOutcome = { kind: 'resolved'; resolutionChain: ResolutionLink[]; finalVictimId: PlayerId | null; starpass: boolean } | { kind: 'needs_mayor_choice'; mayorId: PlayerId; candidates: PlayerId[]; resolutionChain: ResolutionLink[] }`
  - `resolveDemonKill(view, attackerId, targetId, mayorBounceTargetId?: PlayerId | null): KillOutcome`
  - `mayorBounceCandidates(view, attackerId, mayorId): PlayerId[]`

**Two labelling decisions, stated so they are not read as drift.** §4.5 gives `'no_effect'` for both a non-functional attacker and an already-dead target; this plan keeps `'no_effect'` for the attacker and uses the more specific `'already_dead'` for the target, because the dawn announcement renders the chain and the two cases read differently. And §4.5 has the Mayor "ST picks a bounce target"; the Mayor's ability says another player *might* die instead, so `mayorBounceTargetId: null` is a legal choice meaning the Mayor dies.

- [ ] **Step 1: Write the failing test**

`src/engine/rules/demonKill.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { mayorBounceCandidates, resolveDemonKill } from './demonKill';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'monk'],
  ['p4', 'soldier'],
  ['p5', 'mayor'],
  ['p6', 'chef'],
  ['p7', 'scarlet_woman'],
  ['p8', 'empath'],
  ['p9', 'butler'],
];

function night(n = 2): LogBuilder {
  return buildGame({ roles: ROLES, upTo: { kind: 'night', number: n } });
}

function poison(b: LogBuilder, playerId: string, effective = true): LogBuilder {
  return b.push('STATUS_APPLIED', {
    playerId,
    status: 'poisoned',
    sourcePlayerId: 'p2',
    effective,
    expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
  });
}

function protect(b: LogBuilder, playerId: string, effective = true): LogBuilder {
  return b.push('STATUS_APPLIED', {
    playerId,
    status: 'protected',
    sourcePlayerId: 'p3',
    effective,
    expiresAt: expiryFor('until_dawn', b.state.phase),
  });
}

function resolve(b: LogBuilder, targetId: string, bounce?: string | null) {
  return resolveDemonKill(toRulesView(b.state), 'p1', targetId, bounce);
}

describe('resolveDemonKill — order is the rule (§4.5)', () => {
  it('kills an ordinary target', () => {
    const outcome = resolve(night(), 'p6');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p6', starpass: false });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'died' }]);
  });

  it('does nothing when the Imp is poisoned', () => {
    const outcome = resolve(poison(night(), 'p1'), 'p6');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: null, starpass: false });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'no_effect' }]);
  });

  it('does nothing when the target is already dead', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'demon' });
    const outcome = resolve(b, 'p6');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'already_dead' }]);
  });

  it('is blocked by a functional Monk', () => {
    const outcome = resolve(protect(night(), 'p6'), 'p6');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p6', result: 'monk_protected' }]);
  });

  it('is NOT blocked by a poisoned Monk\'s protection', () => {
    // A poisoned Monk still places the token, with effective: false (§3.6, §4.2).
    const outcome = resolve(protect(night(), 'p6', false), 'p6');
    expect(outcome).toMatchObject({ finalVictimId: 'p6' });
  });

  it('is blocked by a functional Soldier', () => {
    const outcome = resolve(night(), 'p4');
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p4', result: 'soldier' }]);
    expect(outcome).toMatchObject({ finalVictimId: null });
  });

  it('kills a poisoned Soldier', () => {
    const outcome = resolve(poison(night(), 'p4'), 'p4');
    expect(outcome).toMatchObject({ finalVictimId: 'p4' });
  });

  it('starpasses on a self-target', () => {
    const outcome = resolve(night(), 'p1');
    expect(outcome).toMatchObject({ finalVictimId: 'p1', starpass: true });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p1', result: 'starpass' }]);
  });

  // §16.11 — the guard order matters: protection is checked before self-target.
  it('does NOT starpass when the Imp targeting itself is Monk-protected', () => {
    const outcome = resolve(protect(night(), 'p1'), 'p1');
    expect(outcome).toMatchObject({ finalVictimId: null, starpass: false });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p1', result: 'monk_protected' }]);
  });

  it('does not starpass when the poisoned Imp targets itself', () => {
    const outcome = resolve(poison(night(), 'p1'), 'p1');
    expect(outcome).toMatchObject({ finalVictimId: null, starpass: false });
  });
});

describe('resolveDemonKill and the Drunk (§4.1 — the load-bearing invariant)', () => {
  // §4.1 names this exact failure: "an implementer writes
  // perceivedCharacterId(x) === 'soldier' in the kill resolver and a
  // Drunk-believing-Soldier survives the Demon." The ESLint rule is the guard;
  // this is the assertion that survives a lint bypass, and there was none.
  function withDrunk(believes: string): LogBuilder {
    return buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'drunk'], ['p4', 'chef'],
        ['p5', 'empath'], ['p6', 'monk'], ['p7', 'mayor'],
      ],
      drunkBelief: { playerId: 'p3', believesCharacterId: believes },
      upTo: { kind: 'night', number: 2 },
    });
  }

  it('kills a Drunk who believes they are the Soldier', () => {
    const outcome = resolve(withDrunk('soldier'), 'p3');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p3' });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p3', result: 'died' }]);
  });

  it('kills a Drunk who believes they are the Mayor, offering no bounce', () => {
    const outcome = resolve(withDrunk('mayor'), 'p3');
    expect(outcome.kind).toBe('resolved');
    expect(outcome).toMatchObject({ finalVictimId: 'p3' });
  });

  it('still bounces off the REAL Mayor in the same game', () => {
    const outcome = resolve(withDrunk('mayor'), 'p7');
    expect(outcome.kind).toBe('needs_mayor_choice');
  });
});

describe('resolveDemonKill — the Mayor bounce (§4.5, §16.7)', () => {
  it('asks for a bounce target when a functional Mayor is hit', () => {
    const outcome = resolve(night(), 'p5');
    expect(outcome.kind).toBe('needs_mayor_choice');
    if (outcome.kind !== 'needs_mayor_choice') throw new Error('wrong shape');
    expect(outcome.mayorId).toBe('p5');
    // Alive, not the Mayor, not the attacker (§16.7).
    expect(outcome.candidates).not.toContain('p5');
    expect(outcome.candidates).not.toContain('p1');
    expect(outcome.candidates.sort()).toEqual(['p2', 'p3', 'p4', 'p6', 'p7', 'p8', 'p9']);
  });

  it('kills a poisoned Mayor outright with no choice', () => {
    const outcome = resolve(poison(night(), 'p5'), 'p5');
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p5' });
  });

  it('lets the Mayor die when the Storyteller declines to bounce', () => {
    const outcome = resolve(night(), 'p5', null);
    expect(outcome).toMatchObject({ kind: 'resolved', finalVictimId: 'p5' });
    expect(outcome.resolutionChain).toEqual([{ targetId: 'p5', result: 'died' }]);
  });

  it('kills the bounce target', () => {
    const outcome = resolve(night(), 'p5', 'p6');
    expect(outcome).toMatchObject({ finalVictimId: 'p6' });
    expect(outcome.resolutionChain).toEqual([
      { targetId: 'p5', result: 'mayor_bounce' },
      { targetId: 'p6', result: 'died' },
    ]);
  });

  // §4.5 — "re-run the already-dead, Monk and Soldier guards on that bounce target".
  it('re-checks Monk protection on the bounce target', () => {
    const outcome = resolve(protect(night(), 'p6'), 'p5', 'p6');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain).toEqual([
      { targetId: 'p5', result: 'mayor_bounce' },
      { targetId: 'p6', result: 'monk_protected' },
    ]);
  });

  it('re-checks Soldier on the bounce target', () => {
    const outcome = resolve(night(), 'p5', 'p4');
    expect(outcome).toMatchObject({ finalVictimId: null });
    expect(outcome.resolutionChain.at(-1)).toEqual({ targetId: 'p4', result: 'soldier' });
  });

  it('re-checks already-dead on the bounce target', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p6', characterIdAtDeath: 'chef', cause: 'demon' });
    const outcome = resolve(b, 'p5', 'p6');
    expect(outcome.resolutionChain.at(-1)).toEqual({ targetId: 'p6', result: 'already_dead' });
  });

  // §4.5 — the attacker-functional and self-target guards cannot apply on a bounce.
  it('does not starpass when the bounce target is the attacker', () => {
    // §16.7 excludes the attacker from the candidates, and the resolver enforces it
    // rather than trusting the caller.
    expect(() => resolve(night(), 'p5', 'p1')).toThrow(/not a legal bounce target/i);
  });

  it('rejects the Mayor as their own bounce target', () => {
    expect(() => resolve(night(), 'p5', 'p5')).toThrow(/not a legal bounce target/i);
  });

  it('does not bounce twice when the bounce target is another Mayor-like case', () => {
    // There is only one Mayor in Trouble Brewing, so a second bounce is
    // unreachable. The chain must be at most two links regardless.
    const outcome = resolve(night(), 'p5', 'p6');
    expect(outcome.resolutionChain.length).toBeLessThanOrEqual(2);
  });
});

describe('mayorBounceCandidates (§16.7)', () => {
  it('excludes the dead, the Mayor and the attacker', () => {
    const b = night();
    b.push('DEATH', { playerId: 'p8', characterIdAtDeath: 'empath', cause: 'demon' });
    const candidates = mayorBounceCandidates(toRulesView(b.state), 'p1', 'p5');
    expect(candidates).not.toContain('p8');
    expect(candidates).not.toContain('p5');
    expect(candidates).not.toContain('p1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/rules`
Expected: FAIL — `Cannot find module './demonKill'`.

- [ ] **Step 3: Write the resolver**

`src/engine/rules/demonKill.ts`:

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import type { ResolutionLink } from '../events';
import { abilityFunctional } from '../selectors/predicates';
import { playerById } from '../selectors/players';
import { isProtected } from '../selectors/statuses';
import type { PlayerId, RulesView, RulesViewPlayer } from '../types';

export type KillOutcome =
  | {
      kind: 'resolved';
      resolutionChain: ResolutionLink[];
      finalVictimId: PlayerId | null;
      /** True when the chain ended in a starpass — the caller routes to §4.6. */
      starpass: boolean;
    }
  | {
      kind: 'needs_mayor_choice';
      mayorId: PlayerId;
      candidates: PlayerId[];
      resolutionChain: ResolutionLink[];
    };

/** §16.7 — alive, not the Mayor, not the attacking Demon. */
export function mayorBounceCandidates(
  view: RulesView,
  attackerId: PlayerId,
  mayorId: PlayerId,
): PlayerId[] {
  return view.players
    .filter((p) => p.alive && p.id !== mayorId && p.id !== attackerId)
    .map((p) => p.id);
}

/**
 * The three guards that apply to any target, bounce targets included (§4.5).
 * Returns the blocking link, or null when the target dies.
 */
function guards(view: RulesView, target: RulesViewPlayer): ResolutionLink | null {
  if (!target.alive) return { targetId: target.id, result: 'already_dead' };
  // "protected by a functional Monk" — effectiveness was frozen at application.
  if (isProtected(target, view.phase)) return { targetId: target.id, result: 'monk_protected' };
  if (target.characterId === 'soldier' && abilityFunctional(view, target)) {
    return { targetId: target.id, result: 'soldier' };
  }
  return null;
}

/**
 * §4.5, in exactly this order:
 *
 *   attacker not functional      -> no_effect
 *   target already dead          -> already_dead
 *   protected by functional Monk -> monk_protected
 *   functional Soldier           -> soldier
 *   target is the attacker       -> starpass (§4.6)
 *   functional Mayor             -> ST picks a bounce target, then re-run the
 *                                   already-dead, Monk and Soldier guards on it
 *   otherwise                    -> died
 *
 * `mayorBounceTargetId` is undefined when the caller has not been asked yet,
 * `null` when the Storyteller chose to let the Mayor die, and a player id to
 * bounce onto them.
 */
export function resolveDemonKill(
  view: RulesView,
  attackerId: PlayerId,
  targetId: PlayerId,
  mayorBounceTargetId?: PlayerId | null,
): KillOutcome {
  const attacker = playerById(view, attackerId);
  const target = playerById(view, targetId);

  if (!abilityFunctional(view, attacker)) {
    return {
      kind: 'resolved',
      resolutionChain: [{ targetId, result: 'no_effect' }],
      finalVictimId: null,
      starpass: false,
    };
  }

  const blocked = guards(view, target);
  if (blocked) {
    return { kind: 'resolved', resolutionChain: [blocked], finalVictimId: null, starpass: false };
  }

  if (targetId === attackerId) {
    return {
      kind: 'resolved',
      resolutionChain: [{ targetId, result: 'starpass' }],
      finalVictimId: targetId,
      starpass: true,
    };
  }

  const isFunctionalMayor =
    characterById(target.characterId).id === 'mayor' && abilityFunctional(view, target);

  if (isFunctionalMayor) {
    if (mayorBounceTargetId === undefined) {
      return {
        kind: 'needs_mayor_choice',
        mayorId: targetId,
        candidates: mayorBounceCandidates(view, attackerId, targetId),
        resolutionChain: [],
      };
    }
    if (mayorBounceTargetId === null) {
      return {
        kind: 'resolved',
        resolutionChain: [{ targetId, result: 'died' }],
        finalVictimId: targetId,
        starpass: false,
      };
    }
    if (!mayorBounceCandidates(view, attackerId, targetId).includes(mayorBounceTargetId)) {
      throw new Error(
        `${mayorBounceTargetId} is not a legal bounce target: it must be alive, not the Mayor and not the attacking Demon (§16.7)`,
      );
    }
    const bounceTarget = playerById(view, mayorBounceTargetId);
    const bounceBlocked = guards(view, bounceTarget);
    const chain: ResolutionLink[] = [{ targetId, result: 'mayor_bounce' }];
    if (bounceBlocked) {
      return {
        kind: 'resolved',
        resolutionChain: [...chain, bounceBlocked],
        finalVictimId: null,
        starpass: false,
      };
    }
    return {
      kind: 'resolved',
      // A second Mayor bounce is unreachable in Trouble Brewing (one Mayor), and
      // the chain is deliberately capped at two links so it stays renderable.
      resolutionChain: [...chain, { targetId: mayorBounceTargetId, result: 'died' }],
      finalVictimId: mayorBounceTargetId,
      starpass: false,
    };
  }

  return {
    kind: 'resolved',
    resolutionChain: [{ targetId, result: 'died' }],
    finalVictimId: targetId,
    starpass: false,
  };
}

/** §6.2's dawn announcement renders this (§8.2 applied to the kill). */
export function killDerivation(view: RulesView, outcome: KillOutcome): string[] {
  const name = (id: PlayerId): string => playerById(view, id).name;
  if (outcome.kind === 'needs_mayor_choice') {
    return [`${name(outcome.mayorId)} is the Mayor — choose who dies instead, or nobody`];
  }
  const lines = outcome.resolutionChain.map((link) => {
    switch (link.result) {
      case 'no_effect':
        return `${name(link.targetId)} chosen, but the Demon's ability is not working -> nothing happens`;
      case 'already_dead':
        return `${name(link.targetId)} is already dead -> nothing happens`;
      case 'monk_protected':
        return `${name(link.targetId)} is protected by the Monk -> safe`;
      case 'soldier':
        return `${name(link.targetId)} is the Soldier -> safe from the Demon`;
      case 'starpass':
        return `${name(link.targetId)} killed themselves -> starpass`;
      case 'mayor_bounce':
        return `${name(link.targetId)} is the Mayor -> the kill bounces`;
      case 'died':
        return `${name(link.targetId)} dies`;
    }
  });
  return [
    ...lines,
    outcome.finalVictimId
      ? `announce at dawn: ${name(outcome.finalVictimId)} died`
      : 'announce at dawn: no one died tonight',
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/rules && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/rules/demonKill.ts src/engine/rules/demonKill.test.ts
git commit -m "$(cat <<'EOF'
feat(rules): add demon kill resolution in §4.5's order

The order is the rule and it has one implementation, not two: attacker
functionality, already-dead, Monk protection, Soldier, self-target starpass,
Mayor bounce, death. Protection is checked before self-target, so a
Monk-protected Imp pointing at itself does not starpass (§16.11), and the
bounce target re-runs the already-dead, Monk and Soldier guards (§16.7).

A poisoned Monk's token is present but ineffective, so it does not block. The
Mayor bounce is a Storyteller choice returned as needs_mayor_choice rather than
guessed, and declining to bounce is legal — their ability says another player
MIGHT die instead. killDerivation renders the chain for the dawn announcement,
including "no one died tonight".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Demon death and win conditions

Two spec sections that only work together. §4.6's handler is shared by night kill, execution and Slayer; §4.7's `checkVictory` runs once per transaction at commit, which is the only ordering under which the Scarlet Woman ever promotes.

**Files:**
- Create: `src/engine/rules/demonDeath.ts`
- Create: `src/editions/troubleBrewing/victory.ts`
- Create: `src/engine/selectors/victory.ts`
- Test: `src/engine/rules/demonDeath.test.ts`, `src/engine/selectors/victory.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 6.
- Produces:
  - `type DemonDeathOutcome = { kind: 'resolved'; aliveCountAtDeath: number; successorId: PlayerId | null; successorReason: 'scarlet_woman' | 'starpass' | null } | { kind: 'needs_successor_choice'; aliveCountAtDeath: number; candidates: PlayerId[] }`
  - `onDemonDeath(view, deadDemonId, opts: { starpass: boolean; chosenSuccessorId?: PlayerId | null }): DemonDeathOutcome`
  - `interface VictoryContext { dayClosed: boolean }`
  - `checkVictory(view, context): Victory`
  - `VICTORY_PREDICATES: readonly VictoryPredicate[]` — in precedence order, in the edition folder

**Contract, stated because it decides the arithmetic (§16.1).** `onDemonDeath` receives the view from **before** the `DEATH` event is applied, so `aliveCountAtDeath` counts the dying Demon naturally. Calling it after the death is applied gives an off-by-one that turns the Scarlet Woman's threshold from 5 into 6.

**One spec gap this task fills, flagged.** §4.7 row 2 is "Saint died by execution, ability functional", with no time qualifier. Evaluated literally on every later transaction, it fires *retroactively*: a Saint poisoned on night 3 and executed on day 3 is not functional on day 3 (so no evil win, correctly), but the poison expires at the start of night 4, and re-evaluating the same death then would hand evil the game a phase late. This plan therefore scopes row 2 to a Saint execution **in the current phase**, which gives the §14 behaviour ("poisoned Saint does not") and cannot fire late.

- [ ] **Step 1: Write the failing tests**

`src/engine/rules/demonDeath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { onDemonDeath } from './demonDeath';

/** 7 seats. Fixtures record their own counts and never go through assignRoles,
 *  which is the gate that enforces chart legality (Task 5). */
const WITH_SW: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'scarlet_woman'],
  ['p3', 'poisoner'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

const NO_SW: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'baron'],
  ['p3', 'poisoner'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

function game(roles: Array<[string, string]>, dead: string[] = []): LogBuilder {
  const b = buildGame({ roles, upTo: { kind: 'night', number: 2 } });
  for (const id of dead) {
    const characterId = roles.find(([playerId]) => playerId === id)![1];
    b.push('DEATH', { playerId: id, characterIdAtDeath: characterId, cause: 'demon' });
  }
  return b;
}

describe('onDemonDeath — the Scarlet Woman (§4.6, §16.1)', () => {
  it('promotes her at 5 alive, counting the dying Demon', () => {
    // Kill two of seven: five alive, including the Imp who is about to die.
    const b = game(WITH_SW, ['p6', 'p7']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toEqual({
      kind: 'resolved',
      aliveCountAtDeath: 5,
      successorId: 'p2',
      successorReason: 'scarlet_woman',
    });
  });

  it('does NOT promote her at 4 alive', () => {
    const b = game(WITH_SW, ['p5', 'p6', 'p7']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toEqual({
      kind: 'resolved',
      aliveCountAtDeath: 4,
      successorId: null,
      successorReason: null,
    });
  });

  it('does not promote a dead Scarlet Woman', () => {
    const b = game(WITH_SW, ['p2']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: null, successorReason: null });
  });

  it('does not promote a poisoned Scarlet Woman', () => {
    const b = game(WITH_SW);
    b.push('STATUS_APPLIED', {
      playerId: 'p2',
      status: 'poisoned',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: null, successorReason: null });
  });

  it('promotes her on a daytime execution too — the handler is phase-agnostic', () => {
    const b = buildGame({ roles: WITH_SW, upTo: { kind: 'day', number: 3 } });
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: 'p2', successorReason: 'scarlet_woman' });
  });
});

describe('onDemonDeath — the starpass (§4.6, §16.9)', () => {
  // §16.9 — genuinely contested; the recorded default is that she wins.
  it('gives the Scarlet Woman precedence over the starpass', () => {
    const b = game(WITH_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: true });
    expect(outcome).toMatchObject({ successorId: 'p2', successorReason: 'scarlet_woman' });
  });

  // §16.9 is contested, so the constant's OTHER branch is tested too — flipping it
  // at the table must not silently break the case it was not flipped for.
  it('defers to the starpass when SCARLET_WOMAN_BEATS_STARPASS is false', () => {
    const b = game(WITH_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', {
      starpass: true,
      scarletWomanBeatsStarpass: false,
    });
    expect(outcome.kind).toBe('needs_successor_choice');
    if (outcome.kind !== 'needs_successor_choice') throw new Error('wrong shape');
    // She is a living Minion, so she remains a legal choice — just not automatic.
    expect(outcome.candidates).toContain('p2');
  });

  it('still promotes her on a NON-starpass death when the constant is false', () => {
    const b = game(WITH_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', {
      starpass: false,
      scarletWomanBeatsStarpass: false,
    });
    expect(outcome).toMatchObject({ successorId: 'p2', successorReason: 'scarlet_woman' });
  });

  it('asks the Storyteller to pick a successor on a starpass with no Scarlet Woman', () => {
    const b = game(NO_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: true });
    expect(outcome.kind).toBe('needs_successor_choice');
    if (outcome.kind !== 'needs_successor_choice') throw new Error('wrong shape');
    // Living Minions only, and never the dying Demon.
    expect(outcome.candidates.sort()).toEqual(['p2', 'p3']);
  });

  it('accepts the chosen successor', () => {
    const b = game(NO_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', {
      starpass: true,
      chosenSuccessorId: 'p3',
    });
    expect(outcome).toMatchObject({ successorId: 'p3', successorReason: 'starpass' });
  });

  it('rejects a successor who is not a living Minion', () => {
    const b = game(NO_SW);
    expect(() =>
      onDemonDeath(toRulesView(b.state), 'p1', { starpass: true, chosenSuccessorId: 'p4' }),
    ).toThrow(/living Minion/i);
  });

  it('has no successor on a starpass with no living Minion', () => {
    const b = game(NO_SW, ['p2', 'p3']);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: true });
    expect(outcome).toEqual({
      kind: 'resolved',
      aliveCountAtDeath: 5,
      successorId: null,
      successorReason: null,
    });
  });

  it('has no successor on an ordinary death with no Scarlet Woman', () => {
    const b = game(NO_SW);
    const outcome = onDemonDeath(toRulesView(b.state), 'p1', { starpass: false });
    expect(outcome).toMatchObject({ successorId: null, successorReason: null });
  });
});
```

`src/engine/selectors/victory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { checkVictory } from './victory';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'saint'],
  ['p4', 'mayor'],
  ['p5', 'chef'],
  ['p6', 'empath'],
  ['p7', 'monk'],
];

function game(upTo: { kind: 'night' | 'day'; number: number }): LogBuilder {
  return buildGame({ roles: ROLES, upTo });
}

function kill(b: LogBuilder, ids: string[], cause: 'demon' | 'execution' = 'demon'): LogBuilder {
  for (const id of ids) {
    const characterId = ROLES.find(([playerId]) => playerId === id)![1];
    b.push('DEATH', {
      playerId: id,
      characterIdAtDeath: characterId,
      cause,
      ...(cause === 'execution' ? { executionKind: 'vote' as const } : {}),
    });
  }
  return b;
}

const ongoing = { dayClosed: false };

describe('checkVictory (§4.7)', () => {
  it('reports ongoing at the start', () => {
    expect(checkVictory(toRulesView(game({ kind: 'night', number: 1 }).state), ongoing)).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  it('row 1 — good wins when no living player holds the Demon', () => {
    const b = kill(game({ kind: 'night', number: 2 }), ['p1']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'good',
      reason: 'demon_dead',
    });
  });

  it('row 1 does not fire while a promoted successor holds the Demon', () => {
    const b = kill(game({ kind: 'night', number: 2 }), ['p1']);
    b.push('ROLE_CHANGED', { playerId: 'p2', from: 'poisoner', to: 'imp', reason: 'scarlet_woman' });
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 2 — evil wins on a Saint executed by vote', () => {
    const b = kill(game({ kind: 'day', number: 2 }), ['p3'], 'execution');
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'evil',
      reason: 'saint_executed',
    });
  });

  it('row 2 — evil wins on a Saint executed by a Virgin trigger', () => {
    const b = game({ kind: 'day', number: 2 });
    b.push('DEATH', {
      playerId: 'p3',
      characterIdAtDeath: 'saint',
      cause: 'execution',
      executionKind: 'virgin',
    });
    expect(checkVictory(toRulesView(b.state), ongoing)).toMatchObject({ reason: 'saint_executed' });
  });

  it('row 2 does not fire for a Saint killed at night', () => {
    const b = kill(game({ kind: 'night', number: 2 }), ['p3']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 2 does not fire for a poisoned Saint', () => {
    const b = game({ kind: 'night', number: 2 });
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    kill(b, ['p3'], 'execution');
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  // The gap §4.7 leaves open, closed here: the poison expires overnight, and an
  // unscoped row 2 would hand evil the game a phase late.
  it('row 2 does not fire retroactively once the poison has expired', () => {
    const b = game({ kind: 'night', number: 2 });
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 2 });
    kill(b, ['p3'], 'execution');
    b.push('DAY_CLOSED', {});
    b.push('PHASE_ADVANCED', { phase: 'night', number: 3 });
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 3 — evil wins at two alive', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p4', 'p5', 'p6', 'p7']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'evil',
      reason: 'two_alive',
    });
  });

  // §4.7 — row 1 precedes row 3. A Demon death that brings the count to 2 is GOOD.
  it('row 1 beats row 3 when the Demon\'s death brings the count to two', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p4', 'p5', 'p6']);
    // Three alive: p1 (Imp), p2, p7. Now the Imp dies -> two alive AND no Demon.
    kill(b, ['p1']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({
      status: 'good',
      reason: 'demon_dead',
    });
  });

  it('row 3 uses <= so a skipped count still ends the game', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p4', 'p5', 'p6', 'p7', 'p2']);
    // One alive. An equality test on 2 would report ongoing forever.
    expect(checkVictory(toRulesView(b.state), ongoing)).toMatchObject({ status: 'evil' });
  });

  it('row 4 — good wins at three alive with a functional Mayor and no execution', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6', 'p7']);
    // Alive: p1 (Imp), p2 (Poisoner), p4 (Mayor).
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'good',
      reason: 'mayor_no_execution',
    });
  });

  it('row 4 does not fire on a day when somebody WAS executed (§3.6)', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6']);
    kill(b, ['p7'], 'execution');
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  it('row 4 does not fire mid-day', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p3', 'p5', 'p6', 'p7']);
    expect(checkVictory(toRulesView(b.state), ongoing)).toEqual({ status: 'ongoing', reason: null });
  });

  it('row 4 does not fire for a poisoned Mayor', () => {
    const b = game({ kind: 'night', number: 3 });
    b.push('STATUS_APPLIED', {
      playerId: 'p4',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 3 });
    kill(b, ['p3', 'p5', 'p6', 'p7']);
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });

  it('row 4 does not fire for a dead Mayor', () => {
    const b = kill(game({ kind: 'day', number: 3 }), ['p4', 'p5', 'p6', 'p7']);
    // Alive: p1, p2, p3 — three, but the Mayor is dead.
    expect(checkVictory(toRulesView(b.state), { dayClosed: true })).toEqual({
      status: 'ongoing',
      reason: null,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/rules/demonDeath.test.ts src/engine/selectors/victory.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the demon death handler**

`src/engine/rules/demonDeath.ts`:

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import { abilityFunctional } from '../selectors/predicates';
import { aliveCount, playerById } from '../selectors/players';
import type { DerivationLine, PlayerId, RulesView } from '../types';

export type DemonDeathOutcome =
  | {
      kind: 'resolved';
      /** Counts the dying Demon (§16.1). */
      aliveCountAtDeath: number;
      successorId: PlayerId | null;
      successorReason: 'scarlet_woman' | 'starpass' | null;
    }
  | {
      kind: 'needs_successor_choice';
      aliveCountAtDeath: number;
      candidates: PlayerId[];
    };

export const SCARLET_WOMAN_THRESHOLD = 5;

/**
 * §16.9, genuinely contested. `true` (the recorded default) means her ability
 * reads as an unconditional trigger, so when its condition is met she becomes the
 * Demon even on a starpass. `false` means the starpass lets the Storyteller hand
 * the Imp to any living Minion, her included.
 *
 * A constant rather than an inline branch because Rithwik said either is fine:
 * flipping this is a one-line change at the table, and BOTH branches are tested,
 * so the flip cannot silently break the other case.
 */
export const SCARLET_WOMAN_BEATS_STARPASS = true;

/**
 * §4.6 — one shared, phase-agnostic handler, invoked from the night kill, an
 * execution, and the Slayer, but ONLY when the dead player's TRUE character is
 * the Demon. Routing any successful Slayer shot here promotes the Scarlet Woman
 * off a Recluse ruled as the Demon, and you get two living Imps (§16.12).
 *
 * CONTRACT: `view` must be the state from BEFORE the DEATH event is applied, so
 * aliveCountAtDeath counts the dying Demon. Passing the post-death view turns the
 * Scarlet Woman's threshold from 5 into 6.
 */
/**
 * §8.2 applied to the most contested number in the engine. `aliveCountAtDeath`
 * decides whether the game continues, it counts the dying Demon (§16.1), and
 * without a derivation the Storyteller has no way to check it at the table.
 */
export function demonDeathDerivation(
  view: RulesView,
  deadDemonId: PlayerId,
  outcome: DemonDeathOutcome,
): DerivationLine[] {
  const living = view.players.filter((p) => p.alive);
  const scarletWoman = view.players.find((p) => p.characterId === 'scarlet_woman');
  const lines: DerivationLine[] = [
    {
      label: 'alive at death',
      detail:
        `${living
          .map((p) => `${p.name}${p.id === deadDemonId ? ' (the dying Demon)' : ''}`)
          .join(' ')} -> ${outcome.aliveCountAtDeath}` +
        `   (the dying Demon counts, §16.1)`,
    },
    {
      label: 'Scarlet Woman',
      detail: scarletWoman
        ? `${scarletWoman.name}: ${scarletWoman.alive ? 'alive' : 'dead'}, ` +
          `ability ${abilityFunctional(view, scarletWoman) ? 'functional' : 'not functional'}`
        : 'not in play',
    },
  ];

  if (outcome.kind === 'needs_successor_choice') {
    lines.push({
      label: 'result',
      detail: `starpass with no Scarlet Woman — choose a successor from ${outcome.candidates.length} living Minion(s)`,
    });
    return lines;
  }

  const successor = outcome.successorId
    ? view.players.find((p) => p.id === outcome.successorId)
    : null;
  lines.push({
    label: 'result',
    detail: successor
      ? outcome.successorReason === 'scarlet_woman'
        ? `${outcome.aliveCountAtDeath} >= ${SCARLET_WOMAN_THRESHOLD} -> ${successor.name} becomes the Demon`
        : `starpass -> ${successor.name} becomes the Demon`
      : 'no successor — nobody holds the Demon',
  });
  return lines;
}

export function onDemonDeath(
  view: RulesView,
  deadDemonId: PlayerId,
  opts: {
    starpass: boolean;
    chosenSuccessorId?: PlayerId | null;
    /** §16.9. Defaults to SCARLET_WOMAN_BEATS_STARPASS; only tests pass it. */
    scarletWomanBeatsStarpass?: boolean;
  },
): DemonDeathOutcome {
  const dead = playerById(view, deadDemonId);
  if (characterById(dead.characterId).team !== 'demon') {
    throw new Error(
      `onDemonDeath called for ${deadDemonId}, whose true character is ${dead.characterId}, not the Demon (§4.6)`,
    );
  }
  const count = aliveCount(view);

  // §4.6, §16.9 — checked FIRST, including on a starpass: her ability is worded as
  // an unconditional trigger, not a Storyteller option. Contested; the alternative
  // is a two-line change here plus its test.
  const scarletWoman = view.players.find(
    (p) =>
      p.characterId === 'scarlet_woman' &&
      p.alive &&
      p.id !== deadDemonId &&
      abilityFunctional(view, p),
  );
  const beatsStarpass = opts.scarletWomanBeatsStarpass ?? SCARLET_WOMAN_BEATS_STARPASS;
  const scarletWomanTriggers = scarletWoman !== undefined && count >= SCARLET_WOMAN_THRESHOLD;
  if (scarletWomanTriggers && (beatsStarpass || !opts.starpass)) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: scarletWoman!.id,
      successorReason: 'scarlet_woman',
    };
  }

  if (!opts.starpass) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: null,
      successorReason: null,
    };
  }

  const candidates = view.players
    .filter((p) => p.alive && p.id !== deadDemonId && characterById(p.characterId).team === 'minion')
    .map((p) => p.id);

  if (candidates.length === 0) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: null,
      successorReason: null,
    };
  }

  if (opts.chosenSuccessorId === undefined) {
    return { kind: 'needs_successor_choice', aliveCountAtDeath: count, candidates };
  }
  if (opts.chosenSuccessorId === null) {
    return {
      kind: 'resolved',
      aliveCountAtDeath: count,
      successorId: null,
      successorReason: null,
    };
  }
  if (!candidates.includes(opts.chosenSuccessorId)) {
    throw new Error(
      `${opts.chosenSuccessorId} cannot take the starpass: the successor must be a living Minion (§4.6)`,
    );
  }
  return {
    kind: 'resolved',
    aliveCountAtDeath: count,
    successorId: opts.chosenSuccessorId,
    successorReason: 'starpass',
  };
}
```

- [ ] **Step 4: Write the victory predicates**

`src/editions/troubleBrewing/victory.ts` — edition data, in precedence order:

```ts
import type { RulesView, RulesViewPlayer, Victory, VictoryReason } from '@/engine/types';
import { abilityFunctional } from '@/engine/selectors/predicates';
import { aliveCount } from '@/engine/selectors/players';
import { characterById } from './characters';

export interface VictoryContext {
  /** True only in the transaction that closes the day (§4.7 row 4). */
  dayClosed: boolean;
}

export interface VictoryPredicate {
  reason: VictoryReason;
  winner: 'good' | 'evil';
  test: (view: RulesView, context: VictoryContext) => boolean;
}

/**
 * Reads the already-derived `team`, NOT characterById(p.characterId). Before the
 * deal every player has characterId '', and characterById throws on it — which
 * made the very first createGame transaction crash at its own commit-time victory
 * check.
 */
function livingDemon(view: RulesView): RulesViewPlayer | undefined {
  return view.players.find((p) => p.alive && p.team === 'demon');
}

/**
 * §4.7, in precedence order. Row 1 precedes row 3 so a Demon death that brings
 * the count to 2 is a GOOD win.
 */
export const VICTORY_PREDICATES: readonly VictoryPredicate[] = Object.freeze([
  {
    // Row 1 — evaluated after successor resolution, which is why checkVictory
    // runs once at commit and not per event (§4.7).
    reason: 'demon_dead',
    winner: 'good',
    test: (view) => view.players.length > 0 && livingDemon(view) === undefined,
  },
  {
    // Row 2 — a Saint executed by vote or by a Virgin trigger, ability functional.
    //
    // §4.7's table says "execution tx", and this is evaluated in that
    // transaction: `closeDay` and `applyVirgin` both check victory while the phase
    // is still day N, so a Saint poisoned on night N is correctly still poisoned
    // here and does not win. Because the check happens in the transaction, the
    // predicate never gets a chance to fire late.
    //
    // Scoped to the current phase so a re-check on a later day cannot resurrect
    // it. That scoping is safe ONLY because no command advances the phase in the
    // same transaction as an execution — see the closeDay/beginNight split in
    // Task 14, which exists for exactly this reason.
    reason: 'saint_executed',
    winner: 'evil',
    test: (view) =>
      view.deaths.some((death) => {
        if (death.cause !== 'execution') return false;
        if (death.characterIdAtDeath !== 'saint') return false;
        if (death.phase.kind !== view.phase.kind || death.phase.number !== view.phase.number) {
          return false;
        }
        const saint = view.players.find((p) => p.id === death.playerId);
        return saint !== undefined && abilityFunctional(view, saint);
      }),
  },
  {
    // Row 3 — <= rather than == defensively. Deaths arrive one at a time so the
    // count should never skip 2, but an equality test that is wrong once ends the
    // game never, and the looser comparison costs nothing.
    reason: 'two_alive',
    winner: 'evil',
    test: (view) => view.players.length > 0 && aliveCount(view) <= 2,
  },
  {
    // Row 4 — only reachable through a day that closed with no execution, which is
    // why the day must be closeable with nobody nominated (§7).
    reason: 'mayor_no_execution',
    winner: 'good',
    test: (view, context) => {
      if (!context.dayClosed) return false;
      if (aliveCount(view) !== 3) return false;
      if (view.todaysExecutions.length !== 0) return false;
      const mayor = view.players.find((p) => p.characterId === 'mayor' && p.alive);
      return mayor !== undefined && abilityFunctional(view, mayor);
    },
  },
]);

export const ONGOING: Victory = { status: 'ongoing', reason: null };
```

`src/engine/selectors/victory.ts`:

```ts
import { ONGOING, VICTORY_PREDICATES, type VictoryContext } from '@/editions/troubleBrewing/victory';
import { abilityFunctional } from './predicates';
import type { DerivationLine, RulesView, Victory } from '../types';

export type { VictoryContext };

/**
 * §4.7 — pure, and called EXACTLY ONCE PER TRANSACTION AT COMMIT by the command
 * store (Task 13). Never per event, and never inside applyEvent: the per-event
 * reading declares good the winner the instant the Imp dies, before the Scarlet
 * Woman's ROLE_CHANGED lands, which undoes §4.6 entirely.
 */
/**
 * §8.2, and §4.7's "blocking modal" — the Storyteller must be able to audit the
 * claim before announcing the game is over. Row 4 in particular is a three-clause
 * conjunction that is easy to mis-read at the table.
 */
export function victoryDerivation(view: RulesView, context: VictoryContext): DerivationLine[] {
  const living = view.players.filter((p) => p.alive);
  const demon = living.find((p) => p.team === 'demon');
  const mayor = view.players.find((p) => p.characterId === 'mayor');
  return [
    { label: 'alive', detail: `${living.map((p) => p.name).join(' ')} -> ${living.length}` },
    { label: 'holds the Demon', detail: demon ? demon.name : 'nobody' },
    {
      label: 'executed today',
      detail:
        view.todaysExecutions.length === 0
          ? 'nobody'
          : view.todaysExecutions
              .map((e) => `${view.players.find((p) => p.id === e.playerId)?.name} (${e.kind})`)
              .join(', '),
    },
    {
      label: 'Mayor',
      detail: mayor
        ? `${mayor.name}: ${mayor.alive ? 'alive' : 'dead'}, ability ${
            abilityFunctional(view, mayor) ? 'functional' : 'not functional'
          }`
        : 'not in play',
    },
    { label: 'day closed', detail: context.dayClosed ? 'yes' : 'no' },
    {
      label: 'result',
      detail: (() => {
        const victory = checkVictory(view, context);
        return victory.status === 'ongoing' ? 'the game continues' : `${victory.status} wins — ${victory.reason}`;
      })(),
    },
  ];
}

export function checkVictory(view: RulesView, context: VictoryContext): Victory {
  // Before the deal there are seated players with no characters. Nothing can be
  // won yet, and every predicate that reads a character would be meaningless.
  if (view.players.length === 0 || view.players.some((p) => p.characterId === '')) {
    return ONGOING;
  }
  for (const predicate of VICTORY_PREDICATES) {
    if (predicate.test(view, context)) {
      return { status: predicate.winner, reason: predicate.reason };
    }
  }
  return ONGOING;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/rules/demonDeath.ts src/engine/rules/demonDeath.test.ts src/editions/troubleBrewing/victory.ts src/engine/selectors/victory.ts src/engine/selectors/victory.test.ts
git commit -m "$(cat <<'EOF'
feat(rules): add the demon death handler and the win conditions

onDemonDeath is one phase-agnostic handler, checks the Scarlet Woman first
(including on a starpass, per §16.9's recorded default), counts the dying Demon
toward her threshold of 5, and throws if called for a player whose TRUE
character is not the Demon — the guard that stops a Recluse ruled as the Demon
promoting her.

checkVictory evaluates §4.7's four rows in precedence order, so a Demon death
that brings the count to two is a good win, and the Mayor's row needs a closed
day with zero executions. The Saint row is scoped to the current phase, closing
a gap in §4.7: unscoped, a poisoned Saint's execution would win for evil a phase
later once the poison lapsed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 13: The command layer — transactions, commit-time victory, undo

One Storyteller action = one transaction, however many events it emits (§3.2). Undo drops every event sharing the last `txId`, and `checkVictory` runs once at commit — which is the only ordering under which the Scarlet Woman ever promotes (§4.7).

**Files:**
- Create: `src/engine/commands/store.ts`
- Test: `src/engine/commands/store.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 12.
- Produces:
  - `interface Tx { emit<T>(type, payload): void; state(): GameState; view(): RulesView; flag(rule, class, detail): void }`
  - `interface Store { getState(); getEvents(); subscribe(fn): () => void; transaction(label, fn, options?): TransactionResult; undo(): boolean; canUndo(): boolean; lastTransactionLabel(): string | null }`
  - `createStore(events?: readonly GameEvent[], clock?: () => number): Store`
  - `interface TransactionResult { txId: TxId; events: GameEvent[]; victory: Victory }`

**Label persistence, decided here.** The store keeps a human label per `txId` ("resolve the Monk step") in memory for the undo button's caption. Labels are **not** persisted — Plan 3 reloads a game from events alone, and the caption after a reload is derived from the last transaction's event types. Persisting labels would put UI copy in the replay contract.

- [ ] **Step 1: Write the failing test**

`src/engine/commands/store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';
import { reduce } from '@/engine/reducer/fold';
import type { GameEvent } from '@/engine/events';

/** 7 players: 5/0/1/1 is the chart, so one Minion — but the fixtures below
 *  deliberately record their own counts and never go through assignRoles, which
 *  is the gate that enforces chart legality (Task 5). */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'scarlet_woman'],
  ['p3', 'poisoner'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'mayor'],
];

/** A store seeded with a dealt 7-player game sitting on night 2. */
function seeded() {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create the game', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 4, outsider: 0, minion: 2, demon: 1 },
      setupModifiers: [],
      demonBluffs: ['virgin', 'slayer', 'mayor'],
      drunkBelief: null,
      redHerring: 'p4',
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
  store.transaction('advance to night 2', (tx) => {
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
    tx.emit('DAY_CLOSED', {});
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 2 });
  });
  return store;
}

describe('transactions (§3.2)', () => {
  it('stamps one txId across every event in the action', () => {
    const store = seeded();
    const result = store.transaction('resolve the Monk step', (tx) => {
      tx.emit('NIGHT_STEP_RESOLVED', {
        stepId: 'monk',
        actorIds: ['p6'],
        perceivedCharacterId: 'monk',
        targets: ['p4'],
        chosenAnswer: 'protected P4',
        answerClass: 'canonical',
        registrationRulings: [],
        abilityFunctional: true,
        effectSuppressed: false,
      });
      tx.emit('STATUS_APPLIED', {
        playerId: 'p4',
        status: 'protected',
        sourcePlayerId: 'p6',
        effective: true,
        expiresAt: { kind: 'night', number: 2 },
      });
    });
    expect(result.events).toHaveLength(2);
    expect(new Set(result.events.map((e) => e.txId)).size).toBe(1);
  });

  it('numbers seq as the array index with no gaps', () => {
    const store = seeded();
    expect(store.getEvents().map((e) => e.seq)).toEqual(
      store.getEvents().map((_, index) => index),
    );
  });

  it('stamps ts from the clock, never inside the reducer (§3.2, §3.3)', () => {
    const store = seeded();
    const timestamps = store.getEvents().map((e) => e.ts);
    expect(timestamps.every((t) => t > 1_700_000_000_000)).toBe(true);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });

  it('lets a transaction read the state it has built so far', () => {
    const store = seeded();
    store.transaction('kill the Chef', (tx) => {
      expect(tx.state().players.find((p) => p.id === 'p4')?.alive).toBe(true);
      tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
      expect(tx.state().players.find((p) => p.id === 'p4')?.alive).toBe(false);
    });
  });

  it('discards the whole transaction when the body throws', () => {
    const store = seeded();
    const before = store.getEvents().length;
    expect(() =>
      store.transaction('half an action', (tx) => {
        tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
        throw new Error('changed my mind');
      }),
    ).toThrow(/changed my mind/);
    expect(store.getEvents()).toHaveLength(before);
    expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(true);
  });

  it('notifies subscribers once per transaction, not once per event', () => {
    const store = seeded();
    const listener = vi.fn();
    store.subscribe(listener);
    store.transaction('two events', (tx) => {
      tx.emit('NOTE_ADDED', { id: 'n1', scope: 'game', text: 'one' });
      tx.emit('NOTE_ADDED', { id: 'n2', scope: 'game', text: 'two' });
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('folds incrementally and agrees with a full replay', () => {
    const store = seeded();
    store.transaction('a death', (tx) => {
      tx.emit('DEATH', { playerId: 'p5', characterIdAtDeath: 'empath', cause: 'demon' });
    });
    expect(store.getState()).toEqual(reduce(store.getEvents()));
  });
});

describe('commit-time victory (§4.7)', () => {
  // The bug the per-event reading causes: good wins the instant the Imp dies and
  // the Scarlet Woman never promotes.
  it('does not end the game mid-transaction when a successor promotes', () => {
    const store = seeded();
    store.transaction('the Imp is slain and the Scarlet Woman takes over', (tx) => {
      tx.emit('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'slayer' });
      tx.emit('DEMON_DIED', {
        deadDemonId: 'p1',
        aliveCountAtDeath: 7,
        successorId: 'p2',
        successorReason: 'scarlet_woman',
      });
      tx.emit('ROLE_CHANGED', { playerId: 'p2', from: 'scarlet_woman', to: 'imp', reason: 'scarlet_woman' });
    });
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    expect(store.getState().players.find((p) => p.id === 'p2')?.characterId).toBe('imp');
  });

  it('ends the game at commit when nobody holds the Demon', () => {
    const store = seeded();
    const result = store.transaction('the Imp is slain with no successor', (tx) => {
      tx.emit('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'slayer' });
      tx.emit('DEMON_DIED', {
        deadDemonId: 'p1',
        aliveCountAtDeath: 7,
        successorId: null,
        successorReason: null,
      });
    });
    expect(result.victory).toEqual({ status: 'good', reason: 'demon_dead' });
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'demon_dead' });
    // GAME_ENDED joins the SAME transaction, so undoing the death undoes the win.
    const ended = store.getEvents().filter((e) => e.type === 'GAME_ENDED');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.txId).toBe(result.txId);
  });

  it('checks victory exactly once per transaction', () => {
    const store = seeded();
    let checks = 0;
    store.transaction(
      'three events',
      (tx) => {
        tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
        tx.emit('NOTE_ADDED', { id: 'n', scope: 'game', text: 'x' });
        tx.emit('RULE_FLAGGED', { rule: 'x', relatedTxId: 'tx0', class: 'social', detail: 'y' });
      },
      { onVictoryCheck: () => (checks += 1) },
    );
    expect(checks).toBe(1);
  });

  it('passes dayClosed so the Mayor row is only reachable at day close', () => {
    // ROLES has the Mayor at p7 — without one in the fixture this test would pass
    // even if dayClosed were ignored entirely, which is how an earlier draft of it
    // asserted nothing at all.
    const store = seeded();
    store.transaction('open day 2 and thin the herd', (tx) => {
      tx.emit('PHASE_ADVANCED', { phase: 'day', number: 2 });
      for (const id of ['p3', 'p5', 'p6']) {
        const characterId = ROLES.find(([playerId]) => playerId === id)![1];
        tx.emit('DEATH', { playerId: id, characterIdAtDeath: characterId, cause: 'demon' });
      }
    });
    // Three alive (p1 Imp, p2 Scarlet Woman, p7 Mayor), no execution — but this
    // transaction did not close a day, so nothing fires.
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });

    // The same state, with dayClosed, is the Mayor's win.
    const result = store.transaction('close the day', () => undefined, { dayClosed: true });
    expect(result.victory).toEqual({ status: 'good', reason: 'mayor_no_execution' });
  });
});

describe('undo (§3.4)', () => {
  it('drops every event sharing the last txId', () => {
    const store = seeded();
    const before = store.getEvents().length;
    store.transaction('resolve the Monk step', (tx) => {
      tx.emit('NIGHT_STEP_RESOLVED', {
        stepId: 'monk',
        actorIds: ['p6'],
        targets: ['p4'],
        chosenAnswer: 'protected P4',
        answerClass: 'canonical',
        registrationRulings: [],
        abilityFunctional: true,
        effectSuppressed: false,
      });
      tx.emit('STATUS_APPLIED', {
        playerId: 'p4',
        status: 'protected',
        sourcePlayerId: 'p6',
        effective: true,
        expiresAt: { kind: 'night', number: 2 },
      });
    });
    expect(store.getEvents()).toHaveLength(before + 2);
    expect(store.undo()).toBe(true);
    expect(store.getEvents()).toHaveLength(before);
    expect(store.getState().settledStepIds.size).toBe(0);
    expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toEqual([]);
  });

  it('undoes the win along with the death that caused it', () => {
    const store = seeded();
    store.transaction('slay the Imp', (tx) => {
      tx.emit('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'slayer' });
      tx.emit('DEMON_DIED', { deadDemonId: 'p1', aliveCountAtDeath: 7, successorId: null, successorReason: null });
    });
    expect(store.getState().victory.status).toBe('good');
    store.undo();
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
  });

  it('never drops the Spy audit trail', () => {
    const store = seeded();
    store.transaction('note something', (tx) => {
      tx.emit('NOTE_ADDED', { id: 'n1', scope: 'game', text: 'the Spy looked' });
    });
    store.transaction('spy views', (tx) => {
      tx.emit('SPY_VIEWED', {});
    });
    store.transaction('spy done', (tx) => {
      tx.emit('SPY_VIEW_ENDED', {});
    });

    // Undo skips past the two non-undoable transactions to the note.
    expect(store.undo()).toBe(true);
    const types = store.getEvents().map((e) => e.type);
    expect(types).toContain('SPY_VIEWED');
    expect(types).toContain('SPY_VIEW_ENDED');
    expect(types).not.toContain('NOTE_ADDED');
  });

  it('reports canUndo false when only non-undoable events remain', () => {
    let tick = 1_700_000_000_000;
    const store = createStore([], () => (tick += 1000));
    store.transaction('spy views', (tx) => tx.emit('SPY_VIEWED', {}));
    expect(store.canUndo()).toBe(false);
    expect(store.undo()).toBe(false);
  });

  it('reports canUndo false on an empty log', () => {
    expect(createStore().canUndo()).toBe(false);
  });

  it('captions the undo button with the transaction label', () => {
    const store = seeded();
    store.transaction('resolve the Monk step', (tx) => {
      tx.emit('NOTE_ADDED', { id: 'n', scope: 'game', text: 'x' });
    });
    expect(store.lastTransactionLabel()).toBe('resolve the Monk step');
    store.undo();
    expect(store.lastTransactionLabel()).toBe('advance to night 2');
  });

  it('derives a caption after a reload, where labels are gone', () => {
    const store = seeded();
    store.transaction('kill the Chef', (tx) => {
      tx.emit('DEATH', { playerId: 'p4', characterIdAtDeath: 'chef', cause: 'demon' });
    });
    const reloaded = createStore(store.getEvents());
    expect(reloaded.lastTransactionLabel()).toBe('DEATH');
    expect(reloaded.canUndo()).toBe(true);
  });

  it('does not reissue a txId already in the log after an undo and a reload', () => {
    const store = seeded();
    store.transaction('a', (tx) => tx.emit('NOTE_ADDED', { id: 'n1', scope: 'game', text: 'a' }));
    store.transaction('b', (tx) => tx.emit('NOTE_ADDED', { id: 'n2', scope: 'game', text: 'b' }));
    // Undo the middle transaction, leaving a gap in the txId sequence.
    const beforeUndo = new Set(store.getEvents().map((e) => e.txId));
    store.undo();
    const surviving = new Set(store.getEvents().map((e) => e.txId));
    expect(surviving.size).toBe(beforeUndo.size - 1);

    const reloaded = createStore(store.getEvents());
    reloaded.transaction('c', (tx) => tx.emit('NOTE_ADDED', { id: 'n3', scope: 'game', text: 'c' }));
    const fresh = reloaded.getEvents().at(-1)!.txId;
    expect(surviving.has(fresh)).toBe(false);
  });

  it('rebuilds from a persisted log with the state intact', () => {
    const store = seeded();
    const events = JSON.parse(JSON.stringify(store.getEvents())) as GameEvent[];
    expect(createStore(events).getState()).toEqual(store.getState());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/commands`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Write the store**

`src/engine/commands/store.ts`:

```ts
import { NON_UNDOABLE_EVENT_TYPES, type EventType, type GameEvent, type GameEventPayloads } from '../events';
import { applyMany, initialState, reduce } from '../reducer/fold';
import { toRulesView } from '../selectors/rulesView';
import { checkVictory } from '../selectors/victory';
import type { GameState, RuleFlagClass, RulesView, TxId, Victory } from '../types';

export interface Tx {
  emit<T extends EventType>(type: T, payload: GameEventPayloads[T]): void;
  /** The state including everything emitted so far in this transaction. */
  state(): GameState;
  view(): RulesView;
  /** §4.8 — records a rule break in the same transaction as the action itself. */
  flag(rule: string, ruleClass: RuleFlagClass, detail: string): void;
}

export interface TransactionOptions {
  /** §4.7 row 4 is only reachable in the transaction that closes the day. */
  dayClosed?: boolean;
  /** Test seam: called once, when victory is checked at commit. */
  onVictoryCheck?: (victory: Victory) => void;
}

export interface TransactionResult {
  txId: TxId;
  events: GameEvent[];
  victory: Victory;
}

export interface Store {
  getState(): GameState;
  getEvents(): readonly GameEvent[];
  subscribe(listener: () => void): () => void;
  transaction(label: string, body: (tx: Tx) => void, options?: TransactionOptions): TransactionResult;
  undo(): boolean;
  canUndo(): boolean;
  /** Caption for the undo control. Derived from event types after a reload. */
  lastTransactionLabel(): string | null;
}

/**
 * The command layer. Every draw and every Storyteller choice is resolved HERE and
 * frozen onto the event as literal data, so the reducer stays pure (§3.3).
 */
export function createStore(
  seedEvents: readonly GameEvent[] = [],
  clock: () => number = () => Date.now(),
): Store {
  let events: GameEvent[] = [...seedEvents];
  // §3.5 — fold incrementally, cached; full replay only on undo and on boot.
  let state: GameState = events.length > 0 ? reduce(events) : initialState();
  let txCounter = highestTxNumber(events);
  const labels = new Map<TxId, string>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function transaction(
    label: string,
    body: (tx: Tx) => void,
    options: TransactionOptions = {},
  ): TransactionResult {
    const txId = `tx${++txCounter}`;
    const staged: GameEvent[] = [];
    let stagedState = state;

    const append = <T extends EventType>(type: T, payload: GameEventPayloads[T]): void => {
      const event = {
        seq: events.length + staged.length,
        txId,
        ts: clock(),
        type,
        payload,
      } as GameEvent;
      staged.push(event);
      stagedState = applyMany(stagedState, [event]);
    };

    const tx: Tx = {
      emit: append,
      state: () => stagedState,
      view: () => toRulesView(stagedState),
      flag: (rule, ruleClass, detail) =>
        append('RULE_FLAGGED', { rule, relatedTxId: txId, class: ruleClass, detail }),
    };

    try {
      body(tx);
    } catch (error) {
      // Nothing was committed: `events` and `state` were never reassigned.
      txCounter -= 1;
      throw error;
    }

    // §4.7 — EXACTLY ONCE, at commit, after every event of the action has landed.
    let victory = stagedState.victory;
    if (victory.status === 'ongoing') {
      victory = checkVictory(toRulesView(stagedState), { dayClosed: options.dayClosed ?? false });
      options.onVictoryCheck?.(victory);
      if (victory.status !== 'ongoing' && victory.reason !== null) {
        append('GAME_ENDED', { winner: victory.status, reason: victory.reason });
      }
    } else {
      options.onVictoryCheck?.(victory);
    }

    events = [...events, ...staged];
    state = stagedState;
    labels.set(txId, label);
    notify();
    return { txId, events: staged, victory: state.victory };
  }

  /**
   * The most recent txId whose events are all undoable (§3.4).
   *
   * Walks backwards a transaction at a time rather than filtering the whole log
   * per candidate: §3.5 budgets 3,000 events for a pathological game, and
   * `canUndo()` is called on every render.
   */
  function lastUndoableTxId(): TxId | null {
    let end = events.length - 1;
    while (end >= 0) {
      const txId = events[end]!.txId;
      let start = end;
      while (start > 0 && events[start - 1]!.txId === txId) start -= 1;
      let undoable = true;
      for (let i = start; i <= end; i += 1) {
        if (NON_UNDOABLE_EVENT_TYPES.has(events[i]!.type)) {
          undoable = false;
          break;
        }
      }
      if (undoable) return txId;
      end = start - 1;
    }
    return null;
  }

  function undo(): boolean {
    const txId = lastUndoableTxId();
    if (txId === null) return false;
    const kept = events.filter((e) => e.txId !== txId);
    // seq is the array index (§3.2), so it must be renumbered after a removal.
    events = kept.map((event, index) => ({ ...event, seq: index }) as GameEvent);
    state = reduce(events);
    labels.delete(txId);
    notify();
    return true;
  }

  return {
    getState: () => state,
    getEvents: () => events,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    transaction,
    undo,
    canUndo: () => lastUndoableTxId() !== null,
    lastTransactionLabel() {
      const txId = lastUndoableTxId();
      if (txId === null) return null;
      const label = labels.get(txId);
      if (label) return label;
      // After a reload the labels are gone, so derive a caption from the events.
      const txEvents = events.filter((e) => e.txId === txId);
      return txEvents[0]?.type ?? null;
    },
  };
}

/**
 * The largest tx number already in the log, so the next mint cannot collide.
 *
 * Counting DISTINCT txIds was wrong: undo removes a transaction without
 * renumbering the survivors, so a log can hold tx1, tx2, tx4 with tx3 undone. On
 * reload the count is 3, the next mint is tx4 — and undo would then drop both
 * transactions sharing that id, silently reverting a table action from earlier in
 * the game.
 */
function highestTxNumber(events: readonly GameEvent[]): number {
  let highest = 0;
  for (const event of events) {
    const parsed = Number.parseInt(event.txId.replace(/^tx/, ''), 10);
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
  }
  return highest;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/commands && npm run typecheck`
Expected: all green.

Note the `undo` implementation renumbers `seq` after removing a transaction, because §3.2 defines `seq` as the array index. Anything that stored a `seq` (`DeathRecord.seq`, `RuleFlag.seq`, `InfoRecord.seq`) is re-derived by the full replay, so nothing goes stale.

- [ ] **Step 5: Commit**

```bash
git add src/engine/commands
git commit -m "$(cat <<'EOF'
feat(engine): add the command store with transactional undo

One Storyteller action is one transaction: events share a txId, the body can
read the state it has built so far, a throw commits nothing, and subscribers are
notified once per action rather than once per event.

checkVictory runs exactly once at commit, so the Imp's death and the Scarlet
Woman's promotion land in the same transaction and good does not win the instant
the Demon dies. GAME_ENDED joins that transaction, which makes undoing the death
undo the win. Undo drops every event sharing the last undoable txId and skips
past SPY_VIEWED, which is an audit trail.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: The day phase — nominations, votes, thresholds and execution

§14 puts vote math at the *bottom* of the risk list: ten people just watched the hands go up and will recount out loud. So this task is tested for the rulings, not exhaustively for the arithmetic — the arithmetic is self-correcting, the Butler ruling is not.

**Files:**
- Create: `src/engine/selectors/nominations.ts`
- Create: `src/engine/commands/dayCommands.ts`
- Test: `src/engine/selectors/nominations.test.ts`, `src/engine/commands/dayCommands.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 12, 13.
- Produces:
  - `threshold(view): number`, `thresholdDerivation(view): DerivationLine[]`
  - `todaysNominations(state): Nomination[]`, `tallyFor(nomination): number`
  - `voteOrder(view, nomineeId): RulesViewPlayer[]` — clockwise from the nominee's left; includes the dead, who may spend a ghost vote
  - `interface FlagDraft { rule: string; class: RuleFlagClass; detail: string }`
  - `nominationIssues(state, nominatorId, nomineeId): FlagDraft[]`
  - `voteIssues(state, nominationId, voterId): FlagDraft[]`
  - `resolveDayExecution(state): { playerId: PlayerId | null; reason: string; derivation: DerivationLine[] }`
  - Commands: `nominate(store, nominatorId, nomineeId)`, `castVote(store, nominationId, voterId)`, `closeNomination(store, nominationId)`, `closeDay(store)`, `endGame(store, winner, reason)`

- [ ] **Step 1: Write the failing tests**

`src/engine/selectors/nominations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import {
  nominationIssues,
  resolveDayExecution,
  tallyFor,
  threshold,
  thresholdDerivation,
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
  function withButlerMaster(masterId: string): LogBuilder {
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: masterId,
      status: 'master',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    return b;
  }

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
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: 'p5',
      status: 'master',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    expect(voteIssues(b.state, 'n1', 'p3')).toEqual([]);
  });

  it('does not restrict a dead Butler\'s ghost vote (§4.2, guide §12)', () => {
    const b = withButlerMaster('p5');
    b.push('DEATH', { playerId: 'p3', characterIdAtDeath: 'butler', cause: 'demon' });
    expect(voteIssues(b.state, 'n1', 'p3')).toEqual([]);
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
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: 'p5',
      status: 'master',
      sourcePlayerId: 'p3',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    // Three clean votes plus the Butler's invalid one clears the threshold of 4.
    vote(b, 'n1', ['p4', 'p6', 'p7', 'p3']);
    const result = resolveDayExecution(b.state);
    expect(result.playerId).toBe('p1');
  });
});
```

`src/engine/commands/dayCommands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { beginNight, castVote, closeDay, closeNomination, endGame, nominate } from './dayCommands';
import { expiryFor } from '@/engine/phase';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'butler'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

/** Same seven seats, with the Saint in p3 so a vote execution can reach §4.7 row 2. */
const SAINT_ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'saint'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'soldier'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 4, outsider: 1, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

function seededWithSaint(opts: { poison?: string } = {}): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('create', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: SAINT_ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(SAINT_ROLES),
      distribution: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
      setupModifiers: [],
      demonBluffs: ['virgin', 'slayer', 'mayor'],
      drunkBelief: null,
      redHerring: null,
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
    if (opts.poison) {
      tx.emit('STATUS_APPLIED', {
        playerId: opts.poison,
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: expiryFor('tonight_and_tomorrow', { kind: 'night', number: 1 }),
      });
    }
    tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 });
  });
  return store;
}

describe('day commands (§4.8, §7)', () => {
  it('opens a nomination and flags an illegal one in the same transaction', () => {
    const store = seeded();
    const result = nominate(store, 'p4', 'p4');
    expect(result.events.map((e) => e.type)).toEqual(['NOMINATION_OPENED', 'RULE_FLAGGED']);
    // Never blocked: the nomination exists (§4.8).
    expect(store.getState().nominations).toHaveLength(1);
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'self_nomination',
      class: 'integrity',
      relatedTxId: result.txId,
    });
  });

  it('undoes the nomination and its flag together', () => {
    const store = seeded();
    nominate(store, 'p4', 'p4');
    store.undo();
    expect(store.getState().nominations).toEqual([]);
    expect(store.getState().ruleFlags).toEqual([]);
  });

  it('records a vote and closes the nomination with write-only forensics (§3.6)', () => {
    const store = seeded();
    const { nominationId } = nominate(store, 'p4', 'p1');
    castVote(store, nominationId, 'p4');
    castVote(store, nominationId, 'p5');
    const result = closeNomination(store, nominationId);
    const closed = result.events.find((e) => e.type === 'NOMINATION_CLOSED');
    expect(closed?.payload).toMatchObject({ auditTally: 2, auditThreshold: 4, butlerVotesFlagged: [] });
    expect(store.getState().nominations[0]?.closed).toBe(true);
  });

  it('closes a day with zero nominations, which is what makes the Mayor win reachable (§7)', () => {
    const store = seeded();
    const result = closeDay(store);
    const types = result.events.map((e) => e.type);
    expect(types).toEqual(['DAY_CLOSED', 'EXECUTION']);
    expect(result.events.find((e) => e.type === 'EXECUTION')?.payload).toEqual({
      playerId: null,
      kind: 'vote',
    });
    // closeDay does NOT advance the phase — victory is decided on the day.
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
    expect(store.getState().todaysExecutions).toEqual([]);
    beginNight(store);
    expect(store.getState().phase).toEqual({ kind: 'night', number: 2 });
  });

  it('executes at day close in one undoable transaction, leaving the phase on the day', () => {
    const store = seeded();
    const { nominationId } = nominate(store, 'p4', 'p1');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    const result = closeDay(store);
    expect(result.events.map((e) => e.type)).toEqual([
      'DAY_CLOSED',
      'EXECUTION',
      'DEATH',
      'DEMON_DIED',
      'GAME_ENDED',
    ]);
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'demon_dead' });
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
    // The whole day-close, including the win, undoes as one action.
    store.undo();
    expect(store.getState().victory.status).toBe('ongoing');
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
  });

  // §4.7 row 2, §14 Tier 2. This is the case the earlier draft made unreachable:
  // the predicate was tested directly and the PATH was not.
  it('awards evil the game when a Saint is executed by vote (§4.7 row 2)', () => {
    const store = seededWithSaint();
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'saint_executed' });
  });

  it('does not award it for a POISONED Saint, whose poison is still live on the day', () => {
    const store = seededWithSaint({ poison: 'p3' });
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  it('refuses to begin the night once the game is decided', () => {
    const store = seededWithSaint();
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(() => beginNight(store)).toThrow(/game is over/i);
  });

  it('ends an abandoned game so the reason has a producer (§7)', () => {
    const store = seeded();
    endGame(store, 'evil', 'abandoned');
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'abandoned' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/selectors/nominations.test.ts src/engine/commands/dayCommands.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the nomination selectors**

`src/engine/selectors/nominations.ts`:

```ts
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
```

- [ ] **Step 4: Write the day commands**

`src/engine/commands/dayCommands.ts`:

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import { onDemonDeath } from '../rules/demonDeath';
import {
  nominationIssues,
  resolveDayExecution,
  tallyFor,
  threshold,
  voteIssues,
} from '../selectors/nominations';
import { toRulesView } from '../selectors/rulesView';
import type { PlayerId, VictoryReason } from '../types';
import type { Store, Tx, TransactionResult } from './store';

/**
 * Derived from the log, never from module state. §12.8 reloads a game from its
 * events alone, so a module counter restarts at zero while the log already holds
 * nom1..nomN — and the reducer resolves VOTE_CAST by id, so every vote on the new
 * nomination would silently land on the old one.
 */
function nextNominationId(state: GameState): string {
  const taken = new Set(state.nominations.map((n) => n.id));
  for (let n = state.nominations.length + 1; ; n += 1) {
    const id = `nom${n}`;
    if (!taken.has(id)) return id;
  }
}

/** §4.8 — record the action, then flag it. Never the other way round, and never instead. */
function emitFlags(tx: Tx, issues: ReturnType<typeof nominationIssues>): void {
  for (const issue of issues) tx.flag(issue.rule, issue.class, issue.detail);
}

export function nominate(
  store: Store,
  nominatorId: PlayerId,
  nomineeId: PlayerId,
): TransactionResult & { nominationId: string } {
  const id = nextNominationId(store.getState());
  const issues = nominationIssues(store.getState(), nominatorId, nomineeId);
  const view = toRulesView(store.getState());
  const label = `${view.players.find((p) => p.id === nominatorId)?.name} nominates ${
    view.players.find((p) => p.id === nomineeId)?.name
  }`;
  const result = store.transaction(label, (tx) => {
    tx.emit('NOMINATION_OPENED', { id, nominatorId, nomineeId });
    emitFlags(tx, issues);
  });
  return { ...result, nominationId: id };
}

export function castVote(store: Store, nominationId: string, voterId: PlayerId): TransactionResult {
  const issues = voteIssues(store.getState(), nominationId, voterId);
  const name = toRulesView(store.getState()).players.find((p) => p.id === voterId)?.name;
  return store.transaction(`${name} votes`, (tx) => {
    tx.emit('VOTE_CAST', { nominationId, voterId });
    emitFlags(tx, issues);
  });
}

export function closeNomination(store: Store, nominationId: string): TransactionResult {
  const state = store.getState();
  const nomination = state.nominations.find((n) => n.id === nominationId);
  if (!nomination) throw new Error(`Unknown nomination: ${nominationId}`);
  const view = toRulesView(state);
  return store.transaction('close the nomination', (tx) => {
    tx.emit('NOMINATION_CLOSED', {
      id: nominationId,
      // Write-only forensic record. No selector reads these (§3.6).
      auditTally: tallyFor(nomination),
      auditThreshold: threshold(view),
      butlerVotesFlagged: butlerViolations(state, nominationId),
    });
  });
}

/**
 * §7 — always available, INCLUDING with zero nominations, because the Mayor's win
 * is only reachable through a day that closed with no execution. Resolves any
 * execution and routes a Demon death through §4.6, in one transaction, so undo
 * restores the whole day close.
 *
 * DELIBERATELY DOES NOT ADVANCE THE PHASE. Victory is checked at this
 * transaction's commit (§4.7), and three of the four rows are phase-sensitive:
 *
 *   - row 2 compares the Saint's DeathRecord.phase to the current phase, and
 *   - rows 2 and 4 both call abilityFunctional, which reads poison that expires
 *     at the end of day N.
 *
 * Advancing to night N+1 inside this transaction therefore made evil's Saint win
 * unreachable and handed good the game for a poisoned Mayor. Call `beginNight`
 * once the win modal has been dismissed.
 */
export function closeDay(store: Store): TransactionResult {
  const state = store.getState();
  const execution = resolveDayExecution(state);

  return store.transaction(
    'close the day',
    (tx) => {
      tx.emit('DAY_CLOSED', {});
      tx.emit('EXECUTION', { playerId: execution.playerId, kind: 'vote' });

      if (execution.playerId !== null) {
        const view = tx.view();
        const victim = view.players.find((p) => p.id === execution.playerId)!;
        const isDemon = characterById(victim.characterId).team === 'demon';

        // §4.6 — read the outcome BEFORE the death is applied, so
        // aliveCountAtDeath counts the dying Demon (§16.1).
        const demonDeath = isDemon
          ? onDemonDeath(view, victim.id, { starpass: false, chosenSuccessorId: null })
          : null;

        tx.emit('DEATH', {
          playerId: victim.id,
          characterIdAtDeath: victim.characterId,
          cause: 'execution',
          executionKind: 'vote',
        });

        if (demonDeath && demonDeath.kind === 'resolved') {
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
      }

    },
    { dayClosed: true },
  );
}

/**
 * §6 — opens the next night. Separate from `closeDay` so victory is decided while
 * the phase is still day N (see closeDay), and so §4.7's blocking modal appears on
 * the day screen rather than after the night has already started.
 *
 * Refuses once the game is over: `nextStep` returns null on a finished game
 * anyway, but advancing would put a decided game on a night screen.
 */
export function beginNight(store: Store): TransactionResult {
  const state = store.getState();
  if (state.phase.kind !== 'day') throw new Error('It is not day');
  if (state.victory.status !== 'ongoing') {
    throw new Error('The game is over — there is no next night');
  }
  return store.transaction('begin the night', (tx) => {
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: state.phase.number + 1 });
  });
}

/**
 * §7 — for the ordinary case where evil concedes or people go home. Without this,
 * reason 'abandoned' has no producer and an abandoned game cannot be summarised.
 */
export function endGame(
  store: Store,
  winner: 'good' | 'evil',
  reason: VictoryReason,
): TransactionResult {
  return store.transaction('end the game', (tx) => {
    tx.emit('GAME_ENDED', { winner, reason });
  });
}

```

**Why `closeDay` does not advance the phase.** An earlier draft of this plan ended `closeDay` with `PHASE_ADVANCED { night, N+1 }` and justified it as protecting the Mayor's win. That justification was wrong — advancing to a *night* never clears `todaysExecutions` (Task 4), so row 4 is safe either way — and the ordering broke two other things outright:

- **Evil could never win by Saint execution.** Row 2 compares the Saint's `DeathRecord.phase` (day N) to the current phase, which had already become night N+1. And `closeDay` is the *only* path that can execute a Saint: a Virgin trigger kills the nominator, who must be a Townsfolk.
- **A poisoned Mayor won for good.** Row 4 calls `abilityFunctional`, and a poison applied on night N expires at the end of day N — so by night N+1 the Mayor reads as functional.

Both are the same defect: **victory is phase-sensitive, so it must be decided in the phase the execution happened in.** Splitting the command fixes both with no context plumbing, and puts §4.7's blocking modal on the day screen where it belongs. Plan 2 calls `closeDay`, shows any win, then `beginNight`.

- [ ] **Step 5: Add the Butler and threshold tests**

Add to `src/engine/selectors/nominations.test.ts`, inside the Butler describe block. These are the cases guide §10's "in either order" clause creates, and the reason the violation is a selector rather than a stored field:

```ts
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
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: 'p5', status: 'master', sourcePlayerId: 'p3',
      effective: true, expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('STATUS_APPLIED', {
      playerId: 'p3', status: 'poisoned', sourcePlayerId: 'p2',
      effective: true, expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p4', nomineeId: 'p1' });
    b.push('VOTE_CAST', { nominationId: 'n1', voterId: 'p3' });
    expect(butlerViolations(b.state, 'n1')).toEqual([]);
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
```

And add the per-nomination threshold case, which is what `closedThreshold` exists for:

```ts
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
```

Add `butlerViolations` to the imports at the top of the file.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/engine/selectors/nominations.ts src/engine/selectors/nominations.test.ts src/engine/commands/dayCommands.ts src/engine/commands/dayCommands.test.ts src/engine/reducer/applyEvent.ts
git commit -m "$(cat <<'EOF'
feat(engine): add the day phase — nominations, votes, thresholds, execution

Threshold is ceil(alive/2), verified against guide §10 at 8, 7, 5 and 4 alive,
with its derivation. Voting order runs clockwise from the nominee's left and
includes the dead, who may spend one ghost vote.

Enforcement is advisory throughout (§4.8): every issue is recorded and warned
about, nothing is blocked, and no tally is silently altered. An invalid Butler
vote counts and decides executions, which is the §16.3 ruling — striking it
would make the announced tally disagree with the hands the table watched go up
and leak who the Butler is. A dead or droisoned Butler is unrestricted.

The day closes with zero nominations, which is the only path to the Mayor's win,
and the close resolves the execution, routes a Demon death through §4.6 and
advances to night in one undoable transaction.

Also fixes the reducer's Butler check from Task 4, which ignored status expiry
and ability functionality: last night's Master mark flagged today's vote, and a
poisoned Butler was flagged when their vote always counts.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 15: The Virgin and the Slayer

Both are day abilities with a rule people get wrong at the table, and both were bugs in earlier drafts. The Virgin kills the **nominator** and loses the ability either way, poisoned or not (§16.10). A Slayer shot routes into `onDemonDeath` **only** when the target's true character is the Demon (§16.12) — v2 routed any successful shot, so a Recluse ruled as the Demon promoted the Scarlet Woman and you got two living Imps.

**Files:**
- Create: `src/engine/rules/virgin.ts`
- Create: `src/engine/rules/slayer.ts`
- Modify: `src/engine/commands/dayCommands.ts` — add `applyVirgin`, `claimSlayer`
- Test: `src/engine/rules/virgin.test.ts`, `src/engine/rules/slayer.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 6, 12, 13, 14.
- Produces:
  - `interface VirginEvaluation { isVirginNomination: boolean; consumed: boolean; fired: boolean; reason: string; needsRegistrationRuling: boolean; registrationRulings: RegistrationRuling[] }`
  - `evaluateVirgin(view, nominatorId, nomineeId, opts?: { ruleNominatorAsTownsfolk?: boolean }): VirginEvaluation`
  - `interface SlayerEvaluation { claimantIsRealSlayer: boolean; abilityFunctional: boolean; targetIsTrueDemon: boolean; targetRegisteredAsDemon: boolean; canRuleAsDemon: boolean; outcome: 'died' | 'nothing'; routesToDemonDeath: boolean; reason: string }`
  - `evaluateSlayer(view, claimantId, targetId, opts?: { ruleTargetAsDemon?: boolean }): SlayerEvaluation`
  - `applyVirgin(store, nominatorId, nomineeId, opts?): TransactionResult`
  - `claimSlayer(store, claimantId, targetId, opts?): TransactionResult`

- [ ] **Step 1: Write the failing tests**

`src/engine/rules/virgin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { evaluateVirgin } from './virgin';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'spy'],
  ['p4', 'virgin'],
  ['p5', 'chef'],
  ['p6', 'recluse'],
  ['p7', 'monk'],
];

function day(): LogBuilder {
  return buildGame({ roles: ROLES, upTo: { kind: 'day', number: 1 } });
}

describe('evaluateVirgin (§7, §11 of the guide, §16.10)', () => {
  it('fires when a true Townsfolk nominates the Virgin', () => {
    const result = evaluateVirgin(toRulesView(day().state), 'p5', 'p4');
    expect(result).toMatchObject({ isVirginNomination: true, consumed: true, fired: true });
  });

  it('does nothing special when the nominee is not the Virgin', () => {
    expect(evaluateVirgin(toRulesView(day().state), 'p5', 'p7')).toMatchObject({
      isVirginNomination: false,
      consumed: false,
      fired: false,
    });
  });

  it('does not fire when a Minion nominates, and normal voting proceeds', () => {
    const result = evaluateVirgin(toRulesView(day().state), 'p2', 'p4');
    // Still consumed: she loses the ability either way (guide §11).
    expect(result).toMatchObject({ consumed: true, fired: false });
    expect(result.reason).toMatch(/not a Townsfolk/i);
  });

  it('does not fire when the Demon nominates', () => {
    expect(evaluateVirgin(toRulesView(day().state), 'p1', 'p4')).toMatchObject({
      consumed: true,
      fired: false,
    });
  });

  it('does not fire for an Outsider nominator', () => {
    expect(evaluateVirgin(toRulesView(day().state), 'p6', 'p4')).toMatchObject({
      consumed: true,
      fired: false,
    });
  });

  // §16.10 — poison silently disables the ability but still consumes it.
  it('does not fire for a poisoned Virgin but still consumes the ability', () => {
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: 'p4',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    const result = evaluateVirgin(toRulesView(b.state), 'p5', 'p4');
    expect(result).toMatchObject({ consumed: true, fired: false });
    expect(result.reason).toMatch(/poisoned|not functional/i);
  });

  it('does not fire on the second nomination against the Virgin', () => {
    const b = day();
    b.push('NOMINATION_OPENED', { id: 'n1', nominatorId: 'p5', nomineeId: 'p4' });
    b.push('VIRGIN_TRIGGERED', { nominatorId: 'p5', fired: true });
    const result = evaluateVirgin(toRulesView(b.state), 'p7', 'p4');
    expect(result).toMatchObject({ isVirginNomination: true, consumed: false, fired: false });
    expect(result.reason).toMatch(/already/i);
  });

  // Guide §11 — the Spy can be made to register as Townsfolk at the ST's discretion.
  it('offers the Spy as a Townsfolk nominator, ruled by the Storyteller', () => {
    const view = toRulesView(day().state);
    const unruled = evaluateVirgin(view, 'p3', 'p4');
    expect(unruled).toMatchObject({ needsRegistrationRuling: true, fired: false });

    const ruled = evaluateVirgin(view, 'p3', 'p4', { ruleNominatorAsTownsfolk: true });
    expect(ruled.fired).toBe(true);
    expect(ruled.registrationRulings).toEqual([
      { playerId: 'p3', registersAs: { alignment: 'good', team: 'townsfolk' } },
    ]);
  });

  it('does not offer a ruling for a Recluse, who cannot register as a Townsfolk', () => {
    expect(evaluateVirgin(toRulesView(day().state), 'p6', 'p4').needsRegistrationRuling).toBe(false);
  });
});
```

`src/engine/rules/slayer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame, type LogBuilder } from '@test/helpers/game';
import { toRulesView } from '@/engine/selectors/rulesView';
import { expiryFor } from '@/engine/phase';
import { evaluateSlayer } from './slayer';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'slayer'],
  ['p4', 'recluse'],
  ['p5', 'chef'],
  ['p6', 'scarlet_woman'],
  ['p7', 'monk'],
];

function day(): LogBuilder {
  return buildGame({ roles: ROLES, upTo: { kind: 'day', number: 1 } });
}

describe('evaluateSlayer (§7, §16.12)', () => {
  it('kills the true Demon and routes into the demon death handler', () => {
    const result = evaluateSlayer(toRulesView(day().state), 'p3', 'p1');
    expect(result).toMatchObject({
      claimantIsRealSlayer: true,
      abilityFunctional: true,
      targetIsTrueDemon: true,
      outcome: 'died',
      routesToDemonDeath: true,
    });
  });

  it('does nothing when the target is not the Demon', () => {
    expect(evaluateSlayer(toRulesView(day().state), 'p3', 'p5')).toMatchObject({
      outcome: 'nothing',
      routesToDemonDeath: false,
    });
  });

  it('does nothing when the claimant is not the real Slayer', () => {
    expect(evaluateSlayer(toRulesView(day().state), 'p5', 'p1')).toMatchObject({
      claimantIsRealSlayer: false,
      outcome: 'nothing',
      routesToDemonDeath: false,
    });
  });

  it('does nothing for a poisoned Slayer', () => {
    const b = buildGame({ roles: ROLES, upTo: { kind: 'night', number: 1 } });
    b.push('STATUS_APPLIED', {
      playerId: 'p3',
      status: 'poisoned',
      sourcePlayerId: 'p2',
      effective: true,
      expiresAt: expiryFor('tonight_and_tomorrow', b.state.phase),
    });
    b.push('PHASE_ADVANCED', { phase: 'day', number: 1 });
    expect(evaluateSlayer(toRulesView(b.state), 'p3', 'p1')).toMatchObject({
      abilityFunctional: false,
      outcome: 'nothing',
    });
  });

  it('does nothing when the ability has already been used', () => {
    const b = day();
    b.push('SLAYER_CLAIMED', {
      claimantId: 'p3',
      targetId: 'p5',
      claimantIsRealSlayer: true,
      targetIsTrueDemon: false,
      targetRegisteredAsDemon: false,
      abilityFunctional: true,
      outcome: 'nothing',
    });
    const result = evaluateSlayer(toRulesView(b.state), 'p3', 'p1');
    expect(result.outcome).toBe('nothing');
    expect(result.reason).toMatch(/once per game|already used/i);
  });

  // §16.12, §4.6 — the whole point. A Recluse ruled as the Demon dies, and
  // promotes nobody. Routing this into onDemonDeath gives two living Imps.
  it('kills a Recluse ruled to register as the Demon WITHOUT routing to demon death', () => {
    const view = toRulesView(day().state);
    const unruled = evaluateSlayer(view, 'p3', 'p4');
    expect(unruled).toMatchObject({ canRuleAsDemon: true, outcome: 'nothing' });

    const ruled = evaluateSlayer(view, 'p3', 'p4', { ruleTargetAsDemon: true });
    expect(ruled).toMatchObject({
      targetIsTrueDemon: false,
      targetRegisteredAsDemon: true,
      outcome: 'died',
      routesToDemonDeath: false,
    });
  });

  it('does not offer a Demon ruling for a player who cannot register as one', () => {
    expect(evaluateSlayer(toRulesView(day().state), 'p3', 'p5').canRuleAsDemon).toBe(false);
  });

  it('does nothing against an already-dead target', () => {
    const b = day();
    b.push('DEATH', { playerId: 'p1', characterIdAtDeath: 'imp', cause: 'demon' });
    const result = evaluateSlayer(toRulesView(b.state), 'p3', 'p1');
    expect(result.outcome).toBe('nothing');
    expect(result.reason).toMatch(/already dead/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/rules/virgin.test.ts src/engine/rules/slayer.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the Virgin rule**

`src/engine/rules/virgin.ts`:

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import { registrationOptionsForCharacterId } from '@/editions/troubleBrewing/registration';
import { abilityFunctional } from '../selectors/predicates';
import { playerById } from '../selectors/players';
import type { PlayerId, RegistrationRuling, RulesView } from '../types';

export interface VirginEvaluation {
  isVirginNomination: boolean;
  /** The Virgin loses the ability — true on the FIRST nomination, whatever happens. */
  consumed: boolean;
  /** The nominator is executed immediately. */
  fired: boolean;
  reason: string;
  /** The nominator is ambiguous and the Storyteller must decide (guide §11). */
  needsRegistrationRuling: boolean;
  registrationRulings: RegistrationRuling[];
}

/**
 * §7, guide §11. The NOMINATOR dies, not the Virgin. Triggers on the first
 * nomination against the Virgin ever, and she loses the ability either way —
 * including when poisoned (§16.10). The nomination then proceeds to a normal vote.
 */
export function evaluateVirgin(
  view: RulesView,
  nominatorId: PlayerId,
  nomineeId: PlayerId,
  opts: { ruleNominatorAsTownsfolk?: boolean } = {},
): VirginEvaluation {
  const nominee = playerById(view, nomineeId);
  const nominator = playerById(view, nominatorId);

  const none: VirginEvaluation = {
    isVirginNomination: false,
    consumed: false,
    fired: false,
    reason: 'the nominee is not the Virgin',
    needsRegistrationRuling: false,
    registrationRulings: [],
  };

  // §4.1 — the TRUE character. A Drunk who believes they are the Virgin has no
  // ability, and a real Virgin's step is decided by their true role.
  if (nominee.characterId !== 'virgin') return none;

  if (nominee.virginTriggered) {
    return {
      isVirginNomination: true,
      consumed: false,
      fired: false,
      reason: 'the Virgin has already been nominated once and has lost the ability',
      needsRegistrationRuling: false,
      registrationRulings: [],
    };
  }

  const nominatorIsTrueTownsfolk = characterById(nominator.characterId).team === 'townsfolk';
  const canRuleAsTownsfolk =
    !nominatorIsTrueTownsfolk &&
    registrationOptionsForCharacterId(nominator.characterId).some((o) => o.team === 'townsfolk');

  const rulings: RegistrationRuling[] =
    canRuleAsTownsfolk && opts.ruleNominatorAsTownsfolk === true
      ? [{ playerId: nominatorId, registersAs: { alignment: 'good', team: 'townsfolk' } }]
      : [];

  const nominatorCounts = nominatorIsTrueTownsfolk || rulings.length > 0;

  if (!abilityFunctional(view, nominee)) {
    return {
      isVirginNomination: true,
      // The ability is spent even though nothing happens (§16.10).
      consumed: true,
      fired: false,
      reason: `${nominee.name} is the Virgin but their ability is not functional (poisoned, drunk or dead), so nothing happens`,
      needsRegistrationRuling: false,
      registrationRulings: [],
    };
  }

  if (!nominatorCounts) {
    return {
      isVirginNomination: true,
      consumed: true,
      fired: false,
      reason: `${nominator.name} is not a Townsfolk, so nothing happens and the nomination proceeds to a normal vote`,
      needsRegistrationRuling: canRuleAsTownsfolk && opts.ruleNominatorAsTownsfolk === undefined,
      registrationRulings: [],
    };
  }

  return {
    isVirginNomination: true,
    consumed: true,
    fired: true,
    reason: `${nominator.name} is a Townsfolk and is executed immediately; ${nominee.name} survives and loses the ability`,
    needsRegistrationRuling: false,
    registrationRulings: rulings,
  };
}
```

- [ ] **Step 4: Write the Slayer rule**

`src/engine/rules/slayer.ts`:

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import { registrationOptionsForCharacterId } from '@/editions/troubleBrewing/registration';
import { abilityFunctional } from '../selectors/predicates';
import { playerById } from '../selectors/players';
import type { PlayerId, RulesView } from '../types';

export interface SlayerEvaluation {
  claimantIsRealSlayer: boolean;
  abilityFunctional: boolean;
  /** The ONLY field that routes into §4.6. */
  targetIsTrueDemon: boolean;
  targetRegisteredAsDemon: boolean;
  canRuleAsDemon: boolean;
  outcome: 'died' | 'nothing';
  /** §16.12 — true only when the target's TRUE character is the Demon. */
  routesToDemonDeath: boolean;
  reason: string;
}

/**
 * §7, §16.12. Anyone may claim the Slayer. A shot kills when the claimant is the
 * real Slayer with a functional, unspent ability and the target registers as the
 * Demon — but it only routes into onDemonDeath when the target's TRUE character
 * is the Demon. v2 routed any successful shot, so a Recluse ruled as the Demon
 * promoted the Scarlet Woman while the real Imp was alive: two living Imps.
 */
export function evaluateSlayer(
  view: RulesView,
  claimantId: PlayerId,
  targetId: PlayerId,
  opts: { ruleTargetAsDemon?: boolean } = {},
): SlayerEvaluation {
  const claimant = playerById(view, claimantId);
  const target = playerById(view, targetId);

  const claimantIsRealSlayer = claimant.characterId === 'slayer';
  const functional = claimantIsRealSlayer && abilityFunctional(view, claimant);
  const targetIsTrueDemon = characterById(target.characterId).team === 'demon';
  const canRuleAsDemon =
    !targetIsTrueDemon &&
    registrationOptionsForCharacterId(target.characterId).some((o) => o.team === 'demon');
  const targetRegisteredAsDemon = canRuleAsDemon && opts.ruleTargetAsDemon === true;

  const base = {
    claimantIsRealSlayer,
    abilityFunctional: functional,
    targetIsTrueDemon,
    targetRegisteredAsDemon,
    canRuleAsDemon,
  };

  // "Once per game, DURING THE DAY" (guide §1). A mistap at night would otherwise
  // resolve a real kill.
  if (view.phase.kind !== 'day') {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: 'the Slayer may only be used during the day',
    };
  }

  if (!claimantIsRealSlayer) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${claimant.name} is not the Slayer — the claim is a bluff and nothing happens`,
    };
  }
  if (claimant.slayerUsed) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${claimant.name} has already used the Slayer ability — it is once per game`,
    };
  }
  if (!functional) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${claimant.name}'s ability is not functional (poisoned, drunk or dead)`,
    };
  }
  if (!target.alive) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: `${target.name} is already dead`,
    };
  }
  if (!targetIsTrueDemon && !targetRegisteredAsDemon) {
    return {
      ...base,
      outcome: 'nothing',
      routesToDemonDeath: false,
      reason: canRuleAsDemon
        ? `${target.name} could be ruled to register as the Demon — decide before resolving`
        : `${target.name} is not the Demon, so nothing happens`,
    };
  }

  return {
    ...base,
    outcome: 'died',
    // §16.12 — a Recluse ruled as the Demon dies and promotes NOBODY.
    routesToDemonDeath: targetIsTrueDemon,
    reason: targetIsTrueDemon
      ? `${target.name} is the Demon and dies`
      : `${target.name} was ruled to register as the Demon and dies, but no successor is promoted (§16.12)`,
  };
}
```

- [ ] **Step 5: Add the two commands**

Append to `src/engine/commands/dayCommands.ts`:

```ts
import { evaluateSlayer } from '../rules/slayer';
import { evaluateVirgin } from '../rules/virgin';

/**
 * Records the Virgin trigger and, when it fired, executes the nominator. Called
 * right after `nominate`, in its own transaction, so undoing the execution does
 * not undo the nomination — they are two things that happened at the table.
 */
export function applyVirgin(
  store: Store,
  nominatorId: PlayerId,
  nomineeId: PlayerId,
  opts: { ruleNominatorAsTownsfolk?: boolean } = {},
): TransactionResult {
  const view = toRulesView(store.getState());
  const evaluation = evaluateVirgin(view, nominatorId, nomineeId, opts);
  if (!evaluation.isVirginNomination || !evaluation.consumed) {
    throw new Error('applyVirgin called for a nomination that does not trigger the Virgin');
  }
  const nominator = view.players.find((p) => p.id === nominatorId)!;

  return store.transaction('the Virgin is nominated', (tx) => {
    tx.emit('VIRGIN_TRIGGERED', {
      nominatorId,
      nomineeId,
      fired: evaluation.fired,
      reason: evaluation.reason,
      registrationRulings: evaluation.registrationRulings,
    });
    if (!evaluation.fired) return;
    // §16.5 — this is an execution, and it is possible for a vote execution to
    // follow it the same day, which is why todaysExecutions is a list.
    tx.emit('EXECUTION', { playerId: nominatorId, kind: 'virgin' });
    tx.emit('DEATH', {
      playerId: nominatorId,
      characterIdAtDeath: nominator.characterId,
      cause: 'execution',
      executionKind: 'virgin',
    });
  });
}

export function claimSlayer(
  store: Store,
  claimantId: PlayerId,
  targetId: PlayerId,
  opts: { ruleTargetAsDemon?: boolean } = {},
): TransactionResult {
  const view = toRulesView(store.getState());
  const evaluation = evaluateSlayer(view, claimantId, targetId, opts);
  const target = view.players.find((p) => p.id === targetId)!;

  return store.transaction('a Slayer claim', (tx) => {
    tx.emit('SLAYER_CLAIMED', {
      claimantId,
      targetId,
      claimantIsRealSlayer: evaluation.claimantIsRealSlayer,
      targetIsTrueDemon: evaluation.targetIsTrueDemon,
      targetRegisteredAsDemon: evaluation.targetRegisteredAsDemon,
      abilityFunctional: evaluation.abilityFunctional,
      outcome: evaluation.outcome,
      registrationRulings: evaluation.targetRegisteredAsDemon
        ? [{ playerId: targetId, registersAs: { alignment: 'evil', team: 'demon' } }]
        : [],
    });
    if (evaluation.outcome !== 'died') return;

    // Read the demon-death outcome BEFORE the DEATH lands (§16.1).
    const demonDeath = evaluation.routesToDemonDeath
      ? onDemonDeath(tx.view(), targetId, { starpass: false, chosenSuccessorId: null })
      : null;

    tx.emit('DEATH', {
      playerId: targetId,
      characterIdAtDeath: target.characterId,
      cause: 'slayer',
    });

    if (demonDeath && demonDeath.kind === 'resolved') {
      tx.emit('DEMON_DIED', {
        deadDemonId: targetId,
        aliveCountAtDeath: demonDeath.aliveCountAtDeath,
        successorId: demonDeath.successorId,
        successorReason: demonDeath.successorReason,
      });
      if (demonDeath.successorId) {
        const successor = tx.view().players.find((p) => p.id === demonDeath.successorId)!;
        tx.emit('ROLE_CHANGED', {
          playerId: successor.id,
          from: successor.characterId,
          to: target.characterId,
          reason: demonDeath.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman',
        });
      }
    }
  });
}
```

- [ ] **Step 6: Test the commands, not just the evaluators**

`src/engine/commands/dayAbilities.test.ts`. The two evaluators are well covered, but nothing exercised `applyVirgin` or `claimSlayer` — so §16.5 (two executions in one day) was never played out, and §16.12's guarantee was asserted as a boolean on an intermediate object rather than as the absence of a promotion.

```ts
import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import {
  applyVirgin,
  castVote,
  claimSlayer,
  closeDay,
  closeNomination,
  nominate,
} from './dayCommands';

/** 12 players, 7/2/2/1 — Slayer, Virgin, Recluse, Scarlet Woman all in play. */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'virgin'],
  ['p5', 'slayer'],
  ['p6', 'recluse'],
  ['p7', 'chef'],
  ['p8', 'empath'],
  ['p9', 'monk'],
  ['p10', 'soldier'],
  ['p11', 'mayor'],
  ['p12', 'butler'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(store, ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })));
  assignRoles(store, {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['washerwoman', 'librarian', 'undertaker'],
    drunkBelief: null,
    redHerring: 'p7',
  });
  beginFirstNight(store);
  store.transaction('to day 1', (tx) => tx.emit('PHASE_ADVANCED', { phase: 'day', number: 1 }));
  return store;
}

describe('applyVirgin (§7, §16.5, §16.10)', () => {
  it('executes the nominator and records the Virgin as spent', () => {
    const store = seeded();
    nominate(store, 'p7', 'p4');
    const result = applyVirgin(store, 'p7', 'p4');
    expect(result.events.map((e) => e.type)).toEqual(['VIRGIN_TRIGGERED', 'EXECUTION', 'DEATH']);
    expect(store.getState().players.find((p) => p.id === 'p7')?.alive).toBe(false);
    expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(true);
    expect(store.getState().players.find((p) => p.id === 'p4')?.virginTriggered).toBe(true);
    expect(store.getState().todaysExecutions).toHaveLength(1);
  });

  // §16.5 — the day continues after a Virgin trigger, so a vote can execute a
  // second player the same day. This is why todaysExecutions is a list.
  it('leaves the day open for a second execution', () => {
    const store = seeded();
    const first = nominate(store, 'p7', 'p4');
    applyVirgin(store, 'p7', 'p4');
    // 11 alive now, so the threshold is 6.
    for (const voterId of ['p5', 'p8', 'p9', 'p10', 'p11', 'p12']) {
      castVote(store, first.nominationId, voterId);
    }
    closeNomination(store, first.nominationId);
    closeDay(store);
    expect(store.getState().todaysExecutions).toHaveLength(2);
    expect(store.getState().todaysExecutions.map((e) => e.kind).sort()).toEqual(['virgin', 'vote']);
  });

  it('records the trigger but no execution when the nominator is not a Townsfolk', () => {
    const store = seeded();
    nominate(store, 'p2', 'p4');
    const result = applyVirgin(store, 'p2', 'p4');
    expect(result.events.map((e) => e.type)).toEqual(['VIRGIN_TRIGGERED']);
    expect(store.getState().players.find((p) => p.id === 'p4')?.virginTriggered).toBe(true);
    expect(store.getState().players.find((p) => p.id === 'p2')?.alive).toBe(true);
  });

  it('refuses to apply the Virgin a second time', () => {
    const store = seeded();
    nominate(store, 'p7', 'p4');
    applyVirgin(store, 'p7', 'p4');
    nominate(store, 'p8', 'p4');
    expect(() => applyVirgin(store, 'p8', 'p4')).toThrow(/does not trigger/i);
  });

  it('names the nominee on the event rather than inferring it', () => {
    const store = seeded();
    nominate(store, 'p7', 'p4');
    const result = applyVirgin(store, 'p7', 'p4');
    expect(result.events[0]?.payload).toMatchObject({ nominatorId: 'p7', nomineeId: 'p4' });
  });
});

describe('claimSlayer (§7, §16.12)', () => {
  it('kills the true Demon and promotes the Scarlet Woman in one transaction', () => {
    const store = seeded();
    const result = claimSlayer(store, 'p5', 'p1');
    expect(result.events.map((e) => e.type)).toEqual([
      'SLAYER_CLAIMED',
      'DEATH',
      'DEMON_DIED',
      'ROLE_CHANGED',
    ]);
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  // §16.12 — the guarantee, asserted as the ABSENCE of a promotion rather than as
  // a boolean on an intermediate object.
  it('kills a Recluse ruled as the Demon and promotes nobody', () => {
    const store = seeded();
    const result = claimSlayer(store, 'p5', 'p6', { ruleTargetAsDemon: true });
    expect(result.events.map((e) => e.type)).toEqual(['SLAYER_CLAIMED', 'DEATH']);
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(false);
    // The Scarlet Woman is untouched and there is still exactly one living Imp.
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('scarlet_woman');
    expect(store.getState().players.filter((p) => p.alive && p.characterId === 'imp')).toHaveLength(1);
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    // The ruling is on the event, for §9's registration ledger.
    expect(result.events[0]?.payload).toMatchObject({
      targetIsTrueDemon: false,
      targetRegisteredAsDemon: true,
      registrationRulings: [{ playerId: 'p6', registersAs: { alignment: 'evil', team: 'demon' } }],
    });
  });

  it('records a bluffed claim with no death', () => {
    const store = seeded();
    const result = claimSlayer(store, 'p7', 'p1');
    expect(result.events.map((e) => e.type)).toEqual(['SLAYER_CLAIMED']);
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
    expect(store.getState().players.find((p) => p.id === 'p7')?.slayerUsed).toBe(false);
  });

  it('spends the real Slayer ability even on a miss', () => {
    const store = seeded();
    claimSlayer(store, 'p5', 'p7');
    expect(store.getState().players.find((p) => p.id === 'p5')?.slayerUsed).toBe(true);
    const second = claimSlayer(store, 'p5', 'p1');
    expect(second.events.map((e) => e.type)).toEqual(['SLAYER_CLAIMED']);
    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(true);
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/engine/rules/virgin.ts src/engine/rules/slayer.ts src/engine/rules/virgin.test.ts src/engine/rules/slayer.test.ts src/engine/commands/dayCommands.ts src/engine/commands/dayAbilities.test.ts src/engine/events.ts src/engine/reducer/applyEvent.ts
git commit -m "$(cat <<'EOF'
feat(rules): add the Virgin and the Slayer

The Virgin kills the NOMINATOR, survives herself, and loses the ability on the
first nomination against her whatever the outcome — including when poisoned,
where nothing fires but the ability is still spent (§16.10). A Spy nominator can
be ruled a Townsfolk at the Storyteller's discretion (guide §11).

A Slayer claim records whether the claimant is real, whether their ability is
functional, whether the target was ruled to register as the Demon, and —
separately — whether the target IS the true Demon. Only the last routes into
onDemonDeath, so a Recluse ruled as the Demon dies and promotes nobody. v2
routed any successful shot and produced two living Imps (§16.12).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Setup and night commands

The commands the UI in Plan 2 will call. Each one resolves every Storyteller choice up front and emits one transaction, so the reducer stays pure and undo works at the granularity of a table action.

**Files:**
- Create: `src/engine/commands/setupCommands.ts`
- Create: `src/engine/commands/nightCommands.ts`
- Create: `src/engine/index.ts`
- Test: `src/engine/commands/nightCommands.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `createGame(store, players: Array<{ id: PlayerId; name: string }>): TransactionResult`
  - `renamePlayer(store, playerId, name): TransactionResult`
  - `assignRoles(store, result: DealResult): TransactionResult`
  - `beginFirstNight(store): TransactionResult`
  - `interface StepResolution { targets?: PlayerId[]; chosenAnswer: string; answerClass: AnswerClass; answerReason?: string; registrationRulings?: RegistrationRuling[]; stChoice?: string }`
  - `resolveStep(store, resolution): TransactionResult`
  - `skipStep(store, reason: 'st_skip' | 'condition_unmet'): TransactionResult`
  - `autoSkipUnmetSteps(store): number` — settles every condition-unmet step until the cursor rests on one that fires
  - `resolveImpStep(store, opts: { targetId; mayorBounceTargetId?; chosenSuccessorId? }): TransactionResult`
  - `advanceToDay(store): TransactionResult`
  - `src/engine/index.ts` — the single import surface for Plan 2

- [ ] **Step 1: Write the failing test**

`src/engine/commands/nightCommands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import {
  advanceToDay,
  autoSkipUnmetSteps,
  resolveImpStep,
  resolveStep,
  skipStep,
} from './nightCommands';
import { nextStep } from '../selectors/nightCursor';

/**
 * 12 players, 7/2/2/1 — the legal chart (guide §2).
 *
 * Twelve rather than nine because these tests need the Poisoner, the Scarlet
 * Woman AND the Mayor at once, and nine players allows only one Minion. Nine was
 * illegal, which went unnoticed only because assignRoles did not check the chart
 * until Task 5 was fixed.
 */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'monk'],
  ['p5', 'ravenkeeper'],
  ['p6', 'chef'],
  ['p7', 'empath'],
  ['p8', 'butler'],
  ['p9', 'mayor'],
  ['p10', 'saint'],
  ['p11', 'soldier'],
  ['p12', 'virgin'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(
    store,
    ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })),
  );
  // assignRoles is the Lock In gate and now enforces chart legality (Task 5), so
  // the fixture must be a set a legal deal could actually produce.
  assignRoles(store, {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['washerwoman', 'librarian', 'slayer'],
    drunkBelief: null,
    redHerring: 'p6',
  });
  beginFirstNight(store);
  return store;
}

/** Walks to night 2 by skipping the whole first night. */
function toNightTwo(store: Store): void {
  let guard = 0;
  while (nextStep(store.getState()) !== null) {
    skipStep(store, 'st_skip');
    if (++guard > 60) throw new Error('night 1 did not terminate');
  }
  advanceToDay(store);
  store.transaction('close day 1', (tx) => {
    tx.emit('DAY_CLOSED', {});
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 2 });
  });
}

describe('setup commands (§5)', () => {
  it('seats players in the order given and starts on night 1', () => {
    const store = seeded();
    expect(store.getState().players.map((p) => p.seat)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(store.getState().phase).toEqual({ kind: 'night', number: 1 });
    expect(store.getState().distribution).toEqual({
      townsfolk: 7,
      outsider: 2,
      minion: 2,
      demon: 1,
    });
  });

  // C1 from the review: checkVictory ran at every commit and re-derived each
  // player's team from characterById(''), which throws. createGame is its own
  // transaction, so this was the first line of the first test to fail.
  it('creates a game before any roles exist, without throwing', () => {
    let tick = 1_700_000_000_000;
    const store = createStore([], () => (tick += 1000));
    expect(() =>
      createGame(store, ROLES.map(([id], index) => ({ id, name: `P${index + 1}` }))),
    ).not.toThrow();
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
    expect(store.getState().players.every((p) => p.characterId === '')).toBe(true);
  });

  it('refuses to lock in a set that is illegal by the chart (§5.3)', () => {
    let tick = 1_700_000_000_000;
    const store = createStore([], () => (tick += 1000));
    createGame(store, ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })));
    expect(() =>
      assignRoles(store, {
        assignments: Object.fromEntries(ROLES),
        // 12 players wants 7/2/2/1; this claims an extra Outsider.
        distribution: { townsfolk: 6, outsider: 3, minion: 2, demon: 1 },
        setupModifiers: [],
        demonBluffs: null,
        drunkBelief: null,
        redHerring: 'p6',
      }),
    ).toThrow(/illegal set/i);
  });

  it('records the deal as one undoable transaction', () => {
    const store = seeded();
    store.undo(); // undoes beginFirstNight
    store.undo(); // undoes the deal
    expect(store.getState().players.every((p) => p.characterId === '')).toBe(true);
    expect(store.getState().demonBluffs).toBeNull();
  });
});

describe('resolveStep (§4.8, §6.2)', () => {
  it('applies the step effect in the same transaction', () => {
    const store = seeded();
    // Walk to the Poisoner step.
    while (nextStep(store.getState())?.step.id !== 'poisoner') skipStep(store, 'st_skip');
    const result = resolveStep(store, {
      targets: ['p6'],
      chosenAnswer: 'P6 is poisoned',
      answerClass: 'canonical',
    });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_STEP_RESOLVED', 'STATUS_APPLIED']);
    expect(store.getState().players.find((p) => p.id === 'p6')?.statusLedger).toEqual([
      {
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        appliedAt: { kind: 'night', number: 1 },
        expiresAt: { kind: 'day', number: 1 },
      },
    ]);
  });

  it('marks the effect ineffective when the actor is not functional (§3.6)', () => {
    const store = seeded();
    // Poison the Poisoner's own target first is not possible on night 1 in order,
    // so poison the Monk-to-be instead and check the flag on a later night.
    toNightTwo(store);
    while (nextStep(store.getState())?.step.id !== 'poisoner') skipStep(store, 'st_skip');
    resolveStep(store, { targets: ['p4'], chosenAnswer: 'P4 is poisoned', answerClass: 'canonical' });
    while (nextStep(store.getState())?.step.id !== 'monk') skipStep(store, 'st_skip');
    const result = resolveStep(store, {
      targets: ['p9'],
      chosenAnswer: 'P9 is protected',
      answerClass: 'canonical',
    });
    const applied = result.events.find((e) => e.type === 'STATUS_APPLIED');
    // The token is placed, as the physical Storyteller would, but it does nothing.
    expect(applied?.payload).toMatchObject({ status: 'protected', effective: false });
    expect(result.events.find((e) => e.type === 'NIGHT_STEP_RESOLVED')?.payload).toMatchObject({
      abilityFunctional: false,
      effectSuppressed: true,
    });
  });

  it('flags an off-constraint target in the same transaction and still records it (§4.8)', () => {
    const store = seeded();
    toNightTwo(store);
    while (nextStep(store.getState())?.step.id !== 'monk') skipStep(store, 'st_skip');
    // A Monk who pointed at himself at the table must be recordable.
    const result = resolveStep(store, {
      targets: ['p4'],
      chosenAnswer: 'P4 protected themselves',
      answerClass: 'canonical',
    });
    expect(result.events.map((e) => e.type)).toContain('RULE_FLAGGED');
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'target_self',
      class: 'social',
    });
    expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toHaveLength(1);
  });

  it('advances the cursor and can be undone as one unit', () => {
    const store = seeded();
    while (nextStep(store.getState())?.step.id !== 'poisoner') skipStep(store, 'st_skip');
    resolveStep(store, { targets: ['p6'], chosenAnswer: 'poisoned', answerClass: 'canonical' });
    expect(nextStep(store.getState())?.step.id).not.toBe('poisoner');
    store.undo();
    expect(nextStep(store.getState())?.step.id).toBe('poisoner');
    expect(store.getState().players.find((p) => p.id === 'p6')?.statusLedger).toEqual([]);
  });
});

describe('autoSkipUnmetSteps (§6.1)', () => {
  it('logs condition_unmet skips so the log can say why a step did not happen', () => {
    const store = seeded();
    toNightTwo(store);
    // Every step before the Ravenkeeper on a normal night is unconditional or has
    // an empty wakes(), so autoSkipUnmetSteps is a no-op until the cursor reaches
    // one whose trigger is genuinely unmet. An earlier draft called it at the top
    // of the night and asserted `> 0`, which could never pass.
    let guard = 0;
    while (nextStep(store.getState())?.step.id !== 'ravenkeeper') {
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('never reached the Ravenkeeper');
    }
    const skipped = autoSkipUnmetSteps(store);
    expect(skipped).toBeGreaterThan(0);
    const reasons = store
      .getEvents()
      .filter((e) => e.type === 'NIGHT_STEP_SKIPPED')
      .map((e) => (e.payload as { reason: string }).reason);
    expect(reasons).toContain('condition_unmet');
    // The cursor now rests on a step that actually fires.
    expect(nextStep(store.getState())?.conditionMet).toBe(true);
  });
});

describe('resolveImpStep (§4.5, §4.6)', () => {
  function toImp(store: Store): void {
    toNightTwo(store);
    let guard = 0;
    while (nextStep(store.getState())?.step.id !== 'imp') {
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('never reached the Imp');
    }
  }

  it('kills an ordinary target in one transaction', () => {
    const store = seeded();
    toImp(store);
    const result = resolveImpStep(store, { targetId: 'p6' });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_KILL_RESOLVED', 'DEATH']);
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(false);
  });

  it('records a blocked kill with no death', () => {
    const store = seeded();
    toNightTwo(store);
    while (nextStep(store.getState())?.step.id !== 'monk') skipStep(store, 'st_skip');
    resolveStep(store, { targets: ['p6'], chosenAnswer: 'P6 protected', answerClass: 'canonical' });
    while (nextStep(store.getState())?.step.id !== 'imp') skipStep(store, 'st_skip');
    const result = resolveImpStep(store, { targetId: 'p6' });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_KILL_RESOLVED']);
    expect(result.events[0]?.payload).toMatchObject({
      finalVictimId: null,
      resolutionChain: [{ targetId: 'p6', result: 'monk_protected' }],
    });
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(true);
  });

  it('promotes the Scarlet Woman on a starpass and does not end the game', () => {
    const store = seeded();
    toImp(store);
    const result = resolveImpStep(store, { targetId: 'p1' });
    expect(result.events.map((e) => e.type)).toEqual([
      'NIGHT_KILL_RESOLVED',
      'DEATH',
      'DEMON_DIED',
      'ROLE_CHANGED',
    ]);
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  it('re-opens the Scarlet Woman notification, which sits earlier in the order (§6.1)', () => {
    const store = seeded();
    toImp(store);
    resolveImpStep(store, { targetId: 'p1' });
    expect(nextStep(store.getState())?.step.id).toBe('scarlet_woman_notify');
  });

  it('bounces off the Mayor when a target is given', () => {
    const store = seeded();
    toImp(store);
    const result = resolveImpStep(store, { targetId: 'p9', mayorBounceTargetId: 'p6' });
    expect(result.events[0]?.payload).toMatchObject({
      finalVictimId: 'p6',
      resolutionChain: [
        { targetId: 'p9', result: 'mayor_bounce' },
        { targetId: 'p6', result: 'died' },
      ],
    });
  });

  it('refuses to resolve a Mayor hit without a bounce decision', () => {
    const store = seeded();
    toImp(store);
    expect(() => resolveImpStep(store, { targetId: 'p9' })).toThrow(/bounce/i);
  });
});

describe('advanceToDay (§6.1)', () => {
  it('refuses while the night still has steps', () => {
    const store = seeded();
    expect(() => advanceToDay(store)).toThrow(/still has steps/i);
  });

  it('advances once the cursor is exhausted', () => {
    const store = seeded();
    while (nextStep(store.getState()) !== null) skipStep(store, 'st_skip');
    advanceToDay(store);
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/commands/nightCommands.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the setup commands**

`src/engine/commands/setupCommands.ts`:

```ts
import { EDITION } from '@/editions/troubleBrewing';
import { MAX_PLAYERS, MIN_PLAYERS } from '@/editions/troubleBrewing/distribution';
import type { DealResult } from '../setup/deal';
import { validateDeal } from '../setup/deal';
import type { PlayerId } from '../types';
import type { Store, TransactionResult } from './store';

export function createGame(
  store: Store,
  players: Array<{ id: PlayerId; name: string }>,
): TransactionResult {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error('Player ids must be unique');

  return store.transaction('create the game', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: EDITION.id, version: EDITION.version },
      // Seat order is the array order and is immutable thereafter (§18).
      players: players.map((player, seat) => ({ id: player.id, name: player.name, seat })),
    });
  });
}

/** Typos only. There is no reseat and no roster change (§18). */
export function renamePlayer(store: Store, playerId: PlayerId, name: string): TransactionResult {
  return store.transaction('rename a player', (tx) => {
    tx.emit('PLAYER_RENAMED', { playerId, name });
  });
}

/** §5.4 — Lock In. Refuses an illegal set rather than recording one. */
export function assignRoles(store: Store, result: DealResult): TransactionResult {
  const playerIds = store.getState().players.map((p) => p.id);
  const issues = validateDeal(playerIds, result);
  if (issues.length > 0) {
    throw new Error(`Cannot lock in an illegal set:\n- ${issues.join('\n- ')}`);
  }
  return store.transaction('lock in the roles', (tx) => {
    tx.emit('ROLES_ASSIGNED', {
      assignments: result.assignments,
      distribution: result.distribution,
      setupModifiers: result.setupModifiers,
      demonBluffs: result.demonBluffs,
      drunkBelief: result.drunkBelief,
      redHerring: result.redHerring,
    });
  });
}

/** §5.5 — called after the seating confirmation screen (Plan 2). */
export function beginFirstNight(store: Store): TransactionResult {
  if (store.getState().players.some((p) => p.characterId === '')) {
    throw new Error('Roles must be locked in before the first night');
  }
  return store.transaction('begin the first night', (tx) => {
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
}
```

- [ ] **Step 4: Write the night commands**

`src/engine/commands/nightCommands.ts`:

```ts
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
```

**Note the `perceivedCharacterId` field on `NIGHT_STEP_RESOLVED`.** The draft above sets it to `position.step.id`, which is right only because every per-actor step in Trouble Brewing is named after the character whose step it is. That is a coincidence worth relying on but not worth hiding — add a comment saying so, and if a future step id ever diverges from a character id, this is where it breaks.

- [ ] **Step 5: Write the registration ledger**

`src/engine/selectors/registrationLedger.ts`. §16.6 is one of the twelve rulings the engine hardcodes, and nothing in the plan implemented it — the coverage table's claim that Tasks 8 and 14 covered it was unsupported.

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import type { GameState, PlayerId, RegistrationRuling } from '../types';
import type { FlagDraft } from './nominations';
import { toRulesView } from './rulesView';

/** Every registration ruling made about this player so far, oldest first. */
export function priorRulings(state: GameState, playerId: PlayerId): RegistrationRuling[] {
  const rulings: RegistrationRuling[] = [];
  for (const event of state.registrationHistory) {
    for (const ruling of event) {
      if (ruling.playerId === playerId) rulings.push(ruling);
    }
  }
  return rulings;
}

/**
 * §16.6 — "Registration consistency: flagged, never blocked." Returns a flag when
 * a ruling contradicts one already made about the same player.
 */
export function registrationInconsistency(
  state: GameState,
  rulings: readonly RegistrationRuling[],
): FlagDraft[] {
  const view = toRulesView(state);
  const flags: FlagDraft[] = [];
  for (const ruling of rulings) {
    const player = view.players.find((p) => p.id === ruling.playerId);
    if (!player) continue;
    for (const prior of priorRulings(state, ruling.playerId)) {
      if (prior.registersAs.team === ruling.registersAs.team) continue;
      flags.push({
        rule: 'registration_inconsistent',
        class: 'social',
        detail:
          `${player.name} (${characterById(player.characterId).name}) was previously ruled to ` +
          `register as ${prior.registersAs.team} and is now ruled ${ruling.registersAs.team}. ` +
          'Recorded, not blocked (§16.6).',
      });
      break;
    }
  }
  return flags;
}
```

This needs the history it reads, so add a derived field. In `src/engine/types.ts`, on `GameState`:

```ts
  /**
   * Every registration ruling made, in order, as flat arrays per event. Feeds
   * §16.6's consistency flag and Slice 2's registration ledger (§9), which is why
   * VIRGIN_TRIGGERED and SLAYER_CLAIMED also carry their rulings (Task 15).
   */
  registrationHistory: RegistrationRuling[][];
```

initialise it to `[]` in `initialState()`, and append in `applyEvent` wherever rulings arrive — the `NIGHT_STEP_RESOLVED`, `VIRGIN_TRIGGERED` and `SLAYER_CLAIMED` cases:

```ts
      const registrationHistory =
        event.payload.registrationRulings.length > 0
          ? [...state.registrationHistory, event.payload.registrationRulings]
          : state.registrationHistory;
```

and include it in the returned state. Add a test in `nightCommands.test.ts`:

```ts
  it('flags an inconsistent registration ruling without blocking it (§16.6)', () => {
    const store = seeded();
    // Rule the Recluse a Minion for the Investigator on night 1...
    // ...then good for the Empath on night 2, and assert one social flag plus the
    // answer still being recorded.
    expect(store.getState().ruleFlags.filter((f) => f.rule === 'registration_inconsistent'))
      .toHaveLength(1);
  });
```

- [ ] **Step 6: Write the engine barrel**

`src/engine/index.ts` — the surface Plan 2 imports, so the UI never reaches into internals.

**It re-exports the edition's public surface too.** Plan 2's Reference screen renders `abilityText`, every Grimoire row renders a character *name*, the setup screen needs the chart and the 7-player info threshold, the night-step modal renders `step.script`, and `stepKey`'s own first parameter is `NightStep` — so a barrel without them is not the single import surface it claims to be, and Plan 2 would be written against a promise it does not keep.

```ts
// ---- the edition's public surface (§3.8 isolates the DATA, not access to it) ----
export {
  CHARACTERS,
  DISTRIBUTION,
  EDITION,
  FIRST_NIGHT,
  INFO_THRESHOLD_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  OTHER_NIGHTS,
  RESOLVERS,
  STEP_IDS,
  alignmentOf,
  canRegisterAsTeam,
  characterById,
  charactersByTeam,
  distributionFor,
  isAmbiguous,
  nightOrderFor,
  registrationOptionsForCharacterId,
  type Alignment,
  type Character,
  type NightStep,
  type RegistrationOption,
  type Resolver,
  type StepEffect,
  type StepId,
  type StepScript,
  type StepTargets,
  type Team,
  type TeamCounts,
} from '@/editions/troubleBrewing';
export { SCARLET_WOMAN_BEATS_STARPASS, SCARLET_WOMAN_THRESHOLD } from './rules/demonDeath';

export type {
  AnswerClass,
  CharacterId,
  Claim,
  DeathRecord,
  DerivationLine,
  ExecutionRecord,
  GameState,
  InfoRecord,
  LegalAnswer,
  Nomination,
  Note,
  Phase,
  Player,
  PlayerId,
  RegistrationRuling,
  ResolutionLink,
  RuleFlag,
  RuleFlagClass,
  RulesView,
  RulesViewPlayer,
  StatusEntry,
  StatusName,
  Victory,
  VictoryReason,
  Vote,
} from './types';
export type { GameEvent, EventType } from './events';

export { comparePhases, expiryFor, isStatusActive, nextPhase, phaseOrdinal } from './phase';
export { reduce, initialState } from './reducer/fold';

export { createStore, type Store, type Tx, type TransactionResult } from './commands/store';
export { assignRoles, beginFirstNight, createGame, renamePlayer } from './commands/setupCommands';
export {
  advanceToDay,
  autoSkipUnmetSteps,
  candidatesForCurrentStep,
  resolveImpStep,
  resolveStep,
  skipStep,
  type ImpStepOptions,
  type StepResolution,
} from './commands/nightCommands';
export {
  applyVirgin,
  beginNight,
  castVote,
  claimSlayer,
  closeDay,
  closeNomination,
  endGame,
  nominate,
} from './commands/dayCommands';
export { addNote, changeRole, clearStatus, recordDeath } from './commands/correctionCommands';

export {
  deal,
  distributionDerivation,
  randomPicker,
  rerollOne,
  validateDeal,
  type DealResult,
  type Picker,
} from './setup/deal';

export {
  nextStep,
  nightOverview,
  stepKey,
  type CursorPosition,
  type OverviewRow,
} from './selectors/nightCursor';
export { answersAtSeq } from './selectors/replay';
export { priorRulings, registrationInconsistency } from './selectors/registrationLedger';
export { toRulesView } from './selectors/rulesView';
export { abilityFunctional, isDrunk } from './selectors/predicates';
export {
  alive,
  aliveCount,
  bySeat,
  livingPlayers,
  perceivedCharacterId,
  playerById,
  playersWithPerceivedCharacter,
} from './selectors/players';
export {
  activeStatuses,
  grimoireTokens,
  isPoisoned,
  isProtected,
  isRedHerring,
  masterOf,
  type GrimoireToken,
} from './selectors/statuses';
export {
  aliveNeighbours,
  chefDerivation,
  chefPairs,
  empathCount,
  empathDerivation,
  ringOrder,
  type AlignmentOverrides,
} from './selectors/seating';
export {
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
  type FlagDraft,
} from './selectors/nominations';
export { checkVictory, victoryDerivation, type VictoryContext } from './selectors/victory';
export { killDerivation, mayorBounceCandidates, resolveDemonKill, type KillOutcome } from './rules/demonKill';
export { demonDeathDerivation, onDemonDeath, type DemonDeathOutcome } from './rules/demonDeath';
export { evaluateVirgin, type VirginEvaluation } from './rules/virgin';
export { evaluateSlayer, type SlayerEvaluation } from './rules/slayer';
```

Add a test that the barrel keeps its promise, in `src/engine/commands/nightCommands.test.ts`:

```ts
describe('the engine barrel (§8.1 — Plan 2 imports only this)', () => {
  it('exports everything the UI needs', async () => {
    const api = await import('@/engine');
    for (const name of [
      'createStore', 'createGame', 'assignRoles', 'beginFirstNight',
      'nextStep', 'nightOverview', 'candidatesForCurrentStep', 'resolveStep',
      'resolveImpStep', 'skipStep', 'autoSkipUnmetSteps', 'advanceToDay',
      'nominate', 'castVote', 'closeNomination', 'closeDay', 'beginNight',
      'applyVirgin', 'claimSlayer', 'endGame',
      'addNote', 'changeRole', 'clearStatus', 'recordDeath',
      'characterById', 'charactersByTeam', 'distributionFor', 'nightOrderFor',
      'RESOLVERS', 'CHARACTERS', 'EDITION', 'INFO_THRESHOLD_PLAYERS',
      'chefDerivation', 'empathDerivation', 'thresholdDerivation',
      'distributionDerivation', 'demonDeathDerivation', 'victoryDerivation',
      'killDerivation', 'grimoireTokens', 'answersAtSeq',
    ]) {
      expect(name in api).toBe(true);
    }
  });
});
```

`src/engine/index.ts` re-exports `perceivedCharacterId`, which the Task 6 ESLint rule restricts by path. Add the barrel to that rule's `group` list so the boundary cannot be laundered through it:

```js
              group: [
                '**/selectors/players',
                '@/engine/selectors/players',
                '@/engine',
                '@/engine/index',
              ],
```

and add `src/engine/index.ts` to that block's `ignores`, since the barrel itself must be able to re-export.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/engine/commands src/engine/index.ts eslint.config.js
git commit -m "$(cat <<'EOF'
feat(engine): add setup and night commands and the engine barrel

Each command resolves every Storyteller choice up front and emits one
transaction, so undo works at the granularity of a table action. resolveStep
applies the step's effect in the same transaction, freezes the actor's
functionality onto the event, and places an ineffective token when the ability is
suppressed. Off-constraint targets are recorded and flagged, never refused
(§4.8), so a Monk who pointed at himself is representable.

resolveImpStep runs the §4.5 chain, refuses to guess a Mayor bounce or a
starpass successor, and emits the death, promotion and role change together —
which is what keeps the Scarlet Woman's promotion inside the transaction whose
commit checks victory. autoSkipUnmetSteps logs a condition_unmet skip per step
so the log can say why the Undertaker did not wake.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 17: Correction commands

§3.4's whole correction model is "undo, or a compensating event". The events existed and the reducer handled them, but **nothing could emit any of them**: there was no producer for `NOTE_ADDED`, `STATUS_CLEARED`, `ROLE_CHANGED { st_correction }` or a corrective `DEATH { cause: 'other' }`, and none was in the barrel. §3.4 justifies deleting edit-and-replay on the grounds that the case is "covered by undo plus a note" — so the note has to exist. §18 requires `DEATH { cause: 'other' }` for a player who drops out.

**Files:**
- Create: `src/engine/commands/correctionCommands.ts`
- Test: `src/engine/commands/correctionCommands.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 12, 13, 16.
- Produces:
  - `addNote(store, scope: NoteScope, text: string, playerId?): TransactionResult`
  - `clearStatus(store, playerId, status: StatusName, sourcePlayerId: PlayerId | null): TransactionResult`
  - `changeRole(store, playerId, to: CharacterId, reason: 'st_correction' | 'st_balance'): TransactionResult`
  - `recordDeath(store, playerId, cause: 'other'): TransactionResult`

- [ ] **Step 1: Write the failing test**

`src/engine/commands/correctionCommands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createStore, type Store } from './store';
import { assignRoles, beginFirstNight, createGame } from './setupCommands';
import { addNote, changeRole, clearStatus, recordDeath } from './correctionCommands';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'monk'],
  ['p5', 'chef'],
  ['p6', 'empath'],
  ['p7', 'soldier'],
  ['p8', 'mayor'],
  ['p9', 'butler'],
  ['p10', 'saint'],
  ['p11', 'virgin'],
  ['p12', 'slayer'],
];

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(store, ROLES.map(([id], index) => ({ id, name: `P${index + 1}` })));
  assignRoles(store, {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['washerwoman', 'librarian', 'undertaker'],
    drunkBelief: null,
    redHerring: 'p5',
  });
  beginFirstNight(store);
  return store;
}

describe('addNote (§3.4)', () => {
  it('records a game note with an id derived from the log', () => {
    const store = seeded();
    addNote(store, 'game', 'told P5 the Chef number before checking the seating');
    const notes = store.getState().notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ scope: 'game', text: expect.stringContaining('Chef') });
    expect(notes[0]?.id).toBeTruthy();
  });

  it('does not reuse a note id after a reload', () => {
    const store = seeded();
    addNote(store, 'game', 'first');
    const reloaded = createStore(store.getEvents());
    addNote(reloaded, 'game', 'second');
    const ids = reloaded.getState().notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attaches a player note to that player', () => {
    const store = seeded();
    addNote(store, 'player', 'claimed Empath loudly on day 1', 'p6');
    expect(store.getState().notes[0]).toMatchObject({ scope: 'player', playerId: 'p6' });
  });
});

describe('clearStatus (§3.4, §4.4)', () => {
  it('removes a status the Storyteller applied by mistake', () => {
    const store = seeded();
    store.transaction('poison', (tx) =>
      tx.emit('STATUS_APPLIED', {
        playerId: 'p4',
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: { kind: 'day', number: 1 },
      }),
    );
    clearStatus(store, 'p4', 'poisoned', 'p2');
    expect(store.getState().players.find((p) => p.id === 'p4')?.statusLedger).toEqual([]);
  });
});

describe('changeRole (§3.4, §4.8)', () => {
  it('corrects a mis-dealt role', () => {
    const store = seeded();
    changeRole(store, 'p5', 'undertaker', 'st_correction');
    expect(store.getState().players.find((p) => p.id === 'p5')?.characterId).toBe('undertaker');
    expect(store.getState().ruleFlags).toEqual([]);
  });

  // §4.8 integrity: "Recorded and flagged, but produce no derived state change;
  // the banner says so." The reducer's guard was silent, so the Storyteller got a
  // no-op with no explanation.
  it('records and FLAGS a change that would create a second living Demon', () => {
    const store = seeded();
    const result = changeRole(store, 'p5', 'imp', 'st_correction');
    expect(result.events.map((e) => e.type)).toEqual(['ROLE_CHANGED', 'RULE_FLAGGED']);
    expect(store.getState().players.find((p) => p.id === 'p5')?.characterId).toBe('chef');
    expect(store.getState().ruleFlags[0]).toMatchObject({
      rule: 'two_living_demons',
      class: 'integrity',
    });
    expect(store.getState().players.filter((p) => p.alive && p.team === 'demon')).toHaveLength(1);
  });

  it('allows the change once the first Demon is dead', () => {
    const store = seeded();
    recordDeath(store, 'p1', 'other');
    changeRole(store, 'p5', 'imp', 'st_correction');
    expect(store.getState().players.find((p) => p.id === 'p5')?.characterId).toBe('imp');
  });
});

describe('recordDeath (§18)', () => {
  it('kills a player who dropped out, leaving them seated', () => {
    const store = seeded();
    recordDeath(store, 'p6', 'other');
    const player = store.getState().players.find((p) => p.id === 'p6')!;
    expect(player.alive).toBe(false);
    expect(player.seat).toBe(5);
    expect(store.getState().deaths[0]).toMatchObject({ cause: 'other' });
  });

  // The Demon dropping out must route through §4.6 like any other Demon death,
  // or the Scarlet Woman never promotes and good wins by default.
  it('routes a Demon drop-out through the demon death handler', () => {
    const store = seeded();
    const result = recordDeath(store, 'p1', 'other');
    expect(result.events.map((e) => e.type)).toEqual([
      'DEATH',
      'DEMON_DIED',
      'ROLE_CHANGED',
    ]);
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/commands/correctionCommands.test.ts`
Expected: FAIL — `Cannot find module './correctionCommands'`.

- [ ] **Step 3: Write the commands**

`src/engine/commands/correctionCommands.ts`:

```ts
import { characterById } from '@/editions/troubleBrewing/characters';
import { onDemonDeath } from '../rules/demonDeath';
import { playerById } from '../selectors/players';
import { toRulesView } from '../selectors/rulesView';
import type { CharacterId, DeathCause, GameState, NoteScope, PlayerId, StatusName } from '../types';
import type { Store, TransactionResult } from './store';

/**
 * Ids are derived from the log, never from a module counter — §12.8 reloads a game
 * from its events alone, and a counter that restarts at zero reissues ids that are
 * already in use.
 */
function nextNoteId(state: GameState): string {
  const taken = new Set(state.notes.map((n) => n.id));
  for (let n = state.notes.length + 1; ; n += 1) {
    const id = `note${n}`;
    if (!taken.has(id)) return id;
  }
}

/** §3.4 — the second half of "undo plus a note". */
export function addNote(
  store: Store,
  scope: NoteScope,
  text: string,
  playerId?: PlayerId,
): TransactionResult {
  return store.transaction('add a note', (tx) => {
    tx.emit('NOTE_ADDED', {
      id: nextNoteId(store.getState()),
      scope,
      ...(playerId ? { playerId } : {}),
      text,
    });
  });
}

/**
 * §3.4, §4.4 — a manual override. Normal expiry is declarative and needs no
 * event; this is for a status applied by mistake.
 */
export function clearStatus(
  store: Store,
  playerId: PlayerId,
  status: StatusName,
  sourcePlayerId: PlayerId | null,
): TransactionResult {
  return store.transaction('clear a status', (tx) => {
    tx.emit('STATUS_CLEARED', { playerId, status, sourcePlayerId });
  });
}

/**
 * §3.4's primary compensating event. §4.8's integrity invariant means the reducer
 * drops a change that would put two living Demons on the board — so this pairs
 * the event with the flag that makes the banner say so, rather than leaving the
 * Storyteller with a silent no-op.
 */
export function changeRole(
  store: Store,
  playerId: PlayerId,
  to: CharacterId,
  reason: 'st_correction' | 'st_balance',
): TransactionResult {
  const view = toRulesView(store.getState());
  const player = playerById(view, playerId);
  const wouldDoubleDemon =
    characterById(to).team === 'demon' &&
    view.players.some((p) => p.alive && p.id !== playerId && p.team === 'demon');

  return store.transaction(`change ${player.name}'s role`, (tx) => {
    tx.emit('ROLE_CHANGED', { playerId, from: player.characterId, to, reason });
    if (wouldDoubleDemon) {
      tx.flag(
        'two_living_demons',
        'integrity',
        `${player.name} cannot become the Demon while one is alive. Recorded in the log, not applied (§4.8).`,
      );
    }
  });
}

/**
 * §18 — a player who must drop out is handled as a death like any other, left
 * seated so adjacency is unchanged. Also §3.4's corrective DEATH.
 *
 * Routes a true-Demon death through §4.6, exactly as the night kill, the execution
 * and the Slayer do — otherwise the Scarlet Woman never promotes and good wins by
 * default the moment the Demon's player goes home.
 */
export function recordDeath(
  store: Store,
  playerId: PlayerId,
  cause: DeathCause = 'other',
): TransactionResult {
  const view = toRulesView(store.getState());
  const player = playerById(view, playerId);
  const isDemon = characterById(player.characterId).team === 'demon';
  const demonDeath = isDemon
    ? onDemonDeath(view, playerId, { starpass: false, chosenSuccessorId: null })
    : null;

  return store.transaction(`record ${player.name}'s death`, (tx) => {
    tx.emit('DEATH', {
      playerId,
      characterIdAtDeath: player.characterId,
      cause,
    });
    if (demonDeath && demonDeath.kind === 'resolved') {
      tx.emit('DEMON_DIED', {
        deadDemonId: playerId,
        aliveCountAtDeath: demonDeath.aliveCountAtDeath,
        successorId: demonDeath.successorId,
        successorReason: demonDeath.successorReason,
      });
      if (demonDeath.successorId) {
        const successor = tx.view().players.find((p) => p.id === demonDeath.successorId)!;
        tx.emit('ROLE_CHANGED', {
          playerId: successor.id,
          from: successor.characterId,
          to: player.characterId,
          reason: demonDeath.successorReason === 'starpass' ? 'starpass' : 'scarlet_woman',
        });
      }
    }
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/commands/correctionCommands.ts src/engine/commands/correctionCommands.test.ts src/engine/index.ts
git commit -m "$(cat <<'EOF'
feat(engine): add the §3.4 correction commands

§3.4's correction model is "undo, or a compensating event", and it justifies
deleting edit-and-replay on the grounds that the narrow case is covered by undo
plus a note. The events existed and the reducer handled them, but nothing could
emit any of them — no producer for NOTE_ADDED, STATUS_CLEARED, ROLE_CHANGED with
reason st_correction, or a corrective DEATH.

changeRole pairs the event with the RULE_FLAGGED that §4.8 requires, so a
correction the reducer refuses (two living Demons) reaches the banner instead of
silently doing nothing. recordDeath handles §18's drop-out and routes a Demon
through §4.6 like the other three call sites — otherwise good wins by default the
moment the Demon's player goes home. Note ids are derived from the log so a
reload cannot reissue one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Advisory invariants and a scripted full game

Three things close the plan. The **advisory invariants** are §4.8's promise made testable: no sequence of flagged events can corrupt the game. The **answer-class rules** of §4.3 are constraints the plan has so far only described. And the **scripted full game** is §14 Tier 3's replacement for the Playwright walkthrough — same rules coverage, no flake.

**Files:**
- Modify: `src/engine/commands/nightCommands.ts` — validate `answerClass`
- Create: `src/engine/selectors/replay.ts`
- Test: `test/property/advisory.property.test.ts`, `test/scripted/fullGame.test.ts`, `src/engine/commands/answerClass.test.ts`

**Interfaces:**
- Consumes: everything.
- Produces: `answersAtSeq(events, seq, stepId, actorId, targets?): LegalAnswer[]` — recomputes a step's legal answer set from the state at that `seq`, which is why `legalAnswers` is never stored (§3.6).

- [ ] **Step 1: Write the answer-class tests**

Task 16's `resolveAnswer` enforces §4.3's classes. These are its tests, in `src/engine/commands/answerClass.test.ts`, using Task 16's `seeded()` fixture and helpers:

```ts
describe('answer classes (§4.3)', () => {
  it('accepts a canonical answer named by key', () => {
    const store = seeded();
    walkTo(store, 'empath');
    const [first] = candidatesForCurrentStep(store);
    expect(() =>
      resolveStep(store, { answerKey: first!.key, answerClass: 'canonical' }),
    ).not.toThrow();
  });

  // The trust model of §4.3: a canonical answer must be one the app computed, or
  // answerClass is self-reported and §9's ledgers mean nothing.
  it('refuses a canonical answer the app never computed', () => {
    const store = seeded();
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { answerKey: 'empath:made-up', answerClass: 'canonical' })).toThrow(
      /not one of the legal answers/i,
    );
    expect(() => resolveStep(store, { chosenAnswer: '7', answerClass: 'canonical' })).toThrow(
      /must name one by key/i,
    );
  });

  it('refuses a registration class on a canonical answer and vice versa', () => {
    const store = seeded();
    walkTo(store, 'empath');
    const [canonical] = candidatesForCurrentStep(store);
    expect(() =>
      resolveStep(store, { answerKey: canonical!.key, answerClass: 'registration' }),
    ).toThrow(/is a canonical answer, not registration/i);
  });

  // §4.3 — fabricated is ONLY legal when the actor is drunk or poisoned.
  it('refuses a fabricated answer from a sober actor', () => {
    const store = seeded();
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { chosenAnswer: '2', answerClass: 'fabricated' })).toThrow(
      /drunk or poisoned/i,
    );
  });

  it('accepts a fabricated answer from a poisoned actor', () => {
    const store = seeded();
    walkTo(store, 'poisoner');
    resolveStep(store, { targets: ['p7'], chosenAnswer: 'P7 is poisoned', answerClass: 'canonical' });
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { chosenAnswer: '2', answerClass: 'fabricated' })).not.toThrow();
  });

  it('refuses an st_override with no reason, and raises no flag when given one', () => {
    const store = seeded();
    walkTo(store, 'empath');
    expect(() => resolveStep(store, { chosenAnswer: '0', answerClass: 'st_override' })).toThrow(
      /answerReason/i,
    );
    const result = resolveStep(store, {
      chosenAnswer: '0',
      answerClass: 'st_override',
      answerReason: 'I think the seating was entered wrong',
    });
    expect(result.events.map((e) => e.type)).toEqual(['NIGHT_STEP_RESOLVED']);
    expect(store.getState().ruleFlags).toEqual([]);
  });

  it('requires stChoice when a ruled registration does not name the token', () => {
    const store = seeded();
    walkTo(store, 'investigator');
    const ruled = candidatesForCurrentStep(store).find((c) => c.answerClass === 'registration');
    if (!ruled) return; // no ambiguous player in this fixture
    expect(() => resolveStep(store, { answerKey: ruled.key, answerClass: 'registration' })).toThrow(
      /stChoice/i,
    );
    expect(() =>
      resolveStep(store, { answerKey: ruled.key, answerClass: 'registration', stChoice: 'Baron' }),
    ).not.toThrow();
  });

  // §4.1 — the field must carry a character id, not a step id.
  it('stamps the actor\'s perceived character, never the step id', () => {
    const store = seeded();
    walkTo(store, 'empath');
    const [first] = candidatesForCurrentStep(store);
    const result = resolveStep(store, { answerKey: first!.key, answerClass: 'canonical' });
    expect(result.events[0]?.payload).toMatchObject({ perceivedCharacterId: 'empath' });
  });
});
```

- [ ] **Step 2: Write the replay selector**

`src/engine/selectors/replay.ts`:

```ts
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
```

Add its test to `src/engine/selectors/replay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGame } from '@test/helpers/game';
import { answersAtSeq } from './replay';
import { toRulesView } from './rulesView';
import { empathAnswers } from '@/editions/troubleBrewing/resolvers';

describe('answersAtSeq (§3.6)', () => {
  it('recomputes the answer set as it stood before that event', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'empath'], ['p4', 'chef'],
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
    b.push('DEATH', { playerId: 'p2', characterIdAtDeath: 'poisoner', cause: 'slayer' });

    const seq = b.events.findIndex((e) => e.type === 'NIGHT_STEP_RESOLVED');
    expect(answersAtSeq(b.events, seq, 'empath', 'p3').map((a) => a.value)).toEqual(expected);
    expect(empathAnswers(toRulesView(b.state), 'p3').map((a) => a.value)).not.toEqual(expected);
  });

  it('returns nothing for a step with no resolver', () => {
    const b = buildGame({
      roles: [
        ['p1', 'imp'], ['p2', 'poisoner'], ['p3', 'empath'], ['p4', 'chef'],
        ['p5', 'monk'], ['p6', 'soldier'], ['p7', 'mayor'],
      ],
    });
    expect(answersAtSeq(b.events, 1, 'poisoner', 'p2')).toEqual([]);
  });
});
```

- [ ] **Step 3: Write the advisory invariant property test**

`test/property/advisory.property.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { characterById } from '@/editions/troubleBrewing/characters';
import { createStore, type Store } from '@/engine/commands/store';
import type { GameState } from '@/engine/types';

const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'poisoner'],
  ['p3', 'scarlet_woman'],
  ['p4', 'chef'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'saint'],
];
const IDS = ROLES.map(([id]) => id);

/**
 * Arbitrary raw event streams, including illegal ones — the point of §4.8 is that
 * a flagged, illegal input is recorded and cannot corrupt derived state.
 */
type Action =
  | { kind: 'death'; playerId: string }
  | { kind: 'execution'; playerId: string }
  | { kind: 'nominate'; nominatorId: string; nomineeId: string }
  | { kind: 'vote'; voterId: string }
  | { kind: 'advance' }
  | { kind: 'promote'; playerId: string };

const actionArb = fc.oneof(
  fc.record({ kind: fc.constant('death' as const), playerId: fc.constantFrom(...IDS) }),
  fc.record({ kind: fc.constant('execution' as const), playerId: fc.constantFrom(...IDS) }),
  fc.record({
    kind: fc.constant('nominate' as const),
    nominatorId: fc.constantFrom(...IDS),
    nomineeId: fc.constantFrom(...IDS),
  }),
  fc.record({ kind: fc.constant('vote' as const), voterId: fc.constantFrom(...IDS) }),
  fc.record({ kind: fc.constant('advance' as const) }),
  fc.record({ kind: fc.constant('promote' as const), playerId: fc.constantFrom(...IDS) }),
);

function seeded(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  store.transaction('seed', (tx) => {
    tx.emit('GAME_CREATED', {
      edition: { id: 'troubleBrewing', version: '1' },
      players: ROLES.map(([id], seat) => ({ id, name: `P${seat + 1}`, seat })),
    });
    tx.emit('ROLES_ASSIGNED', {
      assignments: Object.fromEntries(ROLES),
      distribution: { townsfolk: 3, outsider: 1, minion: 2, demon: 1 },
      setupModifiers: [],
      demonBluffs: null,
      drunkBelief: null,
      redHerring: 'p4',
    });
    tx.emit('PHASE_ADVANCED', { phase: 'night', number: 1 });
  });
  return store;
}

function play(store: Store, actions: readonly Action[]): void {
  let nominationCount = 0;
  let lastNominationId: string | null = null;

  for (const action of actions) {
    // Every action is attempted, however illegal. Nothing is filtered out: that
    // is the whole point.
    try {
      store.transaction('fuzz', (tx) => {
        const state = tx.state();
        switch (action.kind) {
          case 'death':
          case 'execution': {
            const player = state.players.find((p) => p.id === action.playerId)!;
            tx.emit('DEATH', {
              playerId: action.playerId,
              characterIdAtDeath: player.characterId,
              cause: action.kind === 'execution' ? 'execution' : 'demon',
              ...(action.kind === 'execution' ? { executionKind: 'vote' as const } : {}),
            });
            tx.flag('fuzz', 'integrity', 'generated');
            break;
          }
          case 'nominate': {
            lastNominationId = `n${++nominationCount}`;
            tx.emit('NOMINATION_OPENED', {
              id: lastNominationId,
              nominatorId: action.nominatorId,
              nomineeId: action.nomineeId,
            });
            tx.flag('fuzz', 'social', 'generated');
            break;
          }
          case 'vote': {
            if (lastNominationId) {
              tx.emit('VOTE_CAST', { nominationId: lastNominationId, voterId: action.voterId });
            }
            break;
          }
          case 'advance': {
            const next =
              state.phase.kind === 'night'
                ? { phase: 'day' as const, number: state.phase.number }
                : { phase: 'night' as const, number: state.phase.number + 1 };
            tx.emit('PHASE_ADVANCED', next);
            break;
          }
          case 'promote': {
            const player = state.players.find((p) => p.id === action.playerId)!;
            tx.emit('ROLE_CHANGED', {
              playerId: action.playerId,
              from: player.characterId,
              to: 'imp',
              reason: 'st_correction',
            });
            break;
          }
        }
      });
    } catch {
      // A command may legitimately refuse (a backwards PHASE_ADVANCED throws).
      // A refusal is fine; corruption is not.
    }
  }
}

function invariants(state: GameState): void {
  const aliveCount = state.players.filter((p) => p.alive).length;
  // §4.8 — no sequence of flagged events can make aliveCount negative...
  expect(aliveCount).toBeGreaterThanOrEqual(0);
  expect(aliveCount).toBeLessThanOrEqual(state.players.length);

  // ...or emit a DEATH for a player already dead: one death record per player.
  const deathCounts = new Map<string, number>();
  for (const death of state.deaths) {
    deathCounts.set(death.playerId, (deathCounts.get(death.playerId) ?? 0) + 1);
  }
  for (const count of deathCounts.values()) expect(count).toBe(1);

  // Every dead player has exactly one death record, and vice versa.
  const dead = state.players.filter((p) => !p.alive).map((p) => p.id).sort();
  expect([...deathCounts.keys()].sort()).toEqual(dead);

  // A vote is recorded at most once per voter per nomination.
  for (const nomination of state.nominations) {
    const voters = nomination.votes.map((v) => v.voterId);
    expect(new Set(voters).size).toBe(voters.length);
  }

  // Seating is immutable: the seats are always 0..n-1, each once (§18).
  expect(state.players.map((p) => p.seat).sort((a, b) => a - b)).toEqual(
    state.players.map((_, index) => index),
  );
}

describe('advisory enforcement invariants (§4.8, §14 Tier 1)', () => {
  it('cannot be driven into a corrupt state by any sequence of flagged events', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 25 }), (actions) => {
        const store = seeded();
        play(store, actions as Action[]);
        invariants(store.getState());
      }),
      { numRuns: 400 },
    );
  });

  it('never produces two living Demons', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 25 }), (actions) => {
        const store = seeded();
        play(store, actions as Action[]);
        const livingDemons = store
          .getState()
          .players.filter((p) => p.alive && characterById(p.characterId).team === 'demon');
        expect(livingDemons.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 400 },
    );
  });

  it('survives undoing every transaction back to the seed', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 15 }), (actions) => {
        const store = seeded();
        play(store, actions as Action[]);
        let guard = 0;
        while (store.canUndo()) {
          store.undo();
          invariants(store.getState());
          if (++guard > 100) throw new Error('undo did not converge');
        }
        expect(store.getEvents()).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });
});
```

**One note on the second test.** It was this property test that found the `ROLE_CHANGED` hole — a raw `ROLE_CHANGED { to: 'imp', reason: 'st_correction' }` emitted while the original Imp was alive really did produce two living Demons, violating §4.8's own integrity invariant. The guard now ships in Task 4's reducer and the flag in Task 17's `changeRole`, so this test should pass as written. If it fails, the guard has regressed — do not weaken the test.

- [ ] **Step 4: Write the scripted full game**

`test/scripted/fullGame.test.ts` — §14 Tier 3's replacement for the Playwright walkthrough:

```ts
import { describe, expect, it } from 'vitest';
import {
  advanceToDay,
  assignRoles,
  autoSkipUnmetSteps,
  beginFirstNight,
  beginNight,
  candidatesForCurrentStep,
  castVote,
  claimSlayer,
  closeDay,
  closeNomination,
  createGame,
  createStore,
  nextStep,
  nominate,
  recordDeath,
  reduce,
  resolveImpStep,
  resolveStep,
  skipStep,
  type Store,
} from '@/engine';

/**
 * 9 players, 5/2/1/1 — the legal chart. The Scarlet Woman replaces the Poisoner
 * as the single Minion, because nine players allows only one and her promotion is
 * what this game is built to exercise. Poison is applied directly in the script
 * where the trace needs it.
 */
const ROLES: Array<[string, string]> = [
  ['p1', 'imp'],
  ['p2', 'scarlet_woman'],
  ['p3', 'saint'],
  ['p4', 'washerwoman'],
  ['p5', 'empath'],
  ['p6', 'monk'],
  ['p7', 'undertaker'],
  ['p8', 'butler'],
  ['p9', 'mayor'],
];

function newGame(): Store {
  let tick = 1_700_000_000_000;
  const store = createStore([], () => (tick += 1000));
  createGame(store, ROLES.map(([id], i) => ({ id, name: `P${i + 1}` })));
  // 9 players is 5/2/1/1 (guide §2). assignRoles enforces the chart (Task 5).
  assignRoles(store, {
    assignments: Object.fromEntries(ROLES),
    distribution: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
    setupModifiers: [],
    demonBluffs: ['chef', 'slayer', 'soldier'],
    drunkBelief: null,
    redHerring: 'p5',
  });
  beginFirstNight(store);
  return store;
}

/** Resolves the current step whether or not it computes an answer. */
function takeCanonicalOrConfirm(store: Store): void {
  const position = nextStep(store.getState());
  if (!position) throw new Error('no current step');
  if (position.step.resolverId !== null && position.actor !== null) {
    takeCanonical(store);
    return;
  }
  resolveStep(store, { chosenAnswer: 'shown', answerClass: 'canonical' });
}

/** Takes the canonical answer for whatever step the cursor is on. */
function takeCanonical(store: Store, targets?: string[]): void {
  const [canonical] = candidatesForCurrentStep(store, targets);
  if (!canonical) throw new Error('no canonical answer for the current step');
  resolveStep(store, {
    ...(targets ? { targets } : {}),
    answerKey: canonical.key,
    answerClass: 'canonical',
  });
}

/** Runs the night, resolving each step with the answers a Storyteller would give. */
function runNight(store: Store, choices: Record<string, () => void> = {}): string[] {
  const visited: string[] = [];
  let guard = 0;
  for (;;) {
    autoSkipUnmetSteps(store);
    const position = nextStep(store.getState());
    if (!position) return visited;
    visited.push(position.step.id);
    const handler = choices[position.step.id];
    if (handler) {
      handler();
    } else if (position.step.resolverId !== null) {
      // A step that computes answers: take the canonical one by key, which is what
      // §4.3 requires and what a Storyteller taps.
      takeCanonical(store);
    } else if (position.step.targets) {
      // Default: target the first living player who is neither the actor nor the
      // Demon, so the script never accidentally kills or self-targets.
      const target = store
        .getState()
        .players.find((p) => p.alive && p.id !== position.actor?.id && p.id !== 'p1')!;
      resolveStep(store, {
        targets: [target.id],
        chosenAnswer: `chose ${target.name}`,
        answerClass: 'canonical',
      });
    } else {
      resolveStep(store, { chosenAnswer: 'shown', answerClass: 'canonical' });
    }
    if (++guard > 80) throw new Error(`night did not terminate; visited ${visited.join(', ')}`);
  }
}

describe('a full scripted game (§14 Tier 3)', () => {
  it('plays nine players from the deal to a good win and keeps the log consistent', () => {
    const store = newGame();

    // ---- Night 1 ----
    const night1 = runNight(store, {
      poisoner: () =>
        resolveStep(store, { targets: ['p5'], chosenAnswer: 'P5 poisoned', answerClass: 'canonical' }),
      empath: () =>
        // The Empath is poisoned, so a fabricated answer is legal (§4.3), and it
        // carries free text rather than an answer key by design.
        resolveStep(store, { chosenAnswer: '0', answerClass: 'fabricated' }),
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    expect(night1).toContain('minion_info');
    expect(night1).toContain('demon_info');
    expect(night1).toContain('washerwoman');
    // No Monk, Imp, Undertaker or Ravenkeeper on the first night (§6.3).
    expect(night1).not.toContain('imp');
    expect(night1).not.toContain('monk');
    expect(night1).not.toContain('undertaker');
    advanceToDay(store);
    expect(store.getState().phase).toEqual({ kind: 'day', number: 1 });

    // ---- Day 1: the Poisoner is executed ----
    const first = nominate(store, 'p4', 'p2');
    for (const voterId of ['p4', 'p6', 'p7', 'p9', 'p5']) castVote(store, first.nominationId, voterId);
    closeNomination(store, first.nominationId);
    closeDay(store);
    beginNight(store);
    expect(store.getState().players.find((p) => p.id === 'p2')?.alive).toBe(false);
    expect(store.getState().phase).toEqual({ kind: 'night', number: 2 });
    // Poison applied on night 1 expired at the end of day 1 (§4.4).
    expect(
      store.getState().players.find((p) => p.id === 'p5')?.statusLedger.length,
    ).toBeGreaterThan(0);

    // ---- Night 2: the Monk protects, the Imp kills elsewhere ----
    const night2 = runNight(store, {
      monk: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 protected', answerClass: 'canonical' }),
      imp: () => resolveImpStep(store, { targetId: 'p4' }),
      empath: () => takeCanonical(store),
      undertaker: () => takeCanonical(store),
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    expect(night2).toContain('monk');
    expect(night2).toContain('imp');
    // The Undertaker wakes because someone was executed on day 1 (§6.3).
    expect(night2).toContain('undertaker');
    // No Poisoner step: they are dead, so wakes() is empty (§6.1).
    expect(night2).not.toContain('poisoner');
    expect(store.getState().players.find((p) => p.id === 'p4')?.alive).toBe(false);
    advanceToDay(store);

    // ---- Day 2: nobody meets the threshold ----
    const second = nominate(store, 'p5', 'p3');
    castVote(store, second.nominationId, 'p5');
    closeNomination(store, second.nominationId);
    closeDay(store);
    beginNight(store);
    expect(store.getState().todaysExecutions).toEqual([]);
    expect(store.getState().victory.status).toBe('ongoing');

    // ---- Night 3: the Imp kills the Monk ----
    runNight(store, {
      monk: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 protected', answerClass: 'canonical' }),
      imp: () => resolveImpStep(store, { targetId: 'p6' }),
      empath: () => takeCanonical(store),
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    expect(store.getState().players.find((p) => p.id === 'p6')?.alive).toBe(false);
    advanceToDay(store);

    // ---- Day 3: the Imp is executed. Six alive, so the Scarlet Woman promotes ----
    const third = nominate(store, 'p5', 'p1');
    for (const voterId of ['p5', 'p7', 'p8', 'p9']) castVote(store, third.nominationId, voterId);
    closeNomination(store, third.nominationId);
    closeDay(store);
    beginNight(store);

    expect(store.getState().players.find((p) => p.id === 'p1')?.alive).toBe(false);
    // §4.6 — she becomes the Demon, so good does NOT win here.
    expect(store.getState().players.find((p) => p.id === 'p3')?.characterId).toBe('imp');
    expect(store.getState().victory).toEqual({ status: 'ongoing', reason: null });

    // ---- Night 4: she is notified, having been promoted by a DAYTIME execution ----
    const night4 = runNight(store, {
      imp: () => resolveImpStep(store, { targetId: 'p7' }),
      empath: () => takeCanonical(store),
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    // §6.3 — the notification fires the night AFTER a daytime promotion.
    expect(night4).toContain('scarlet_woman_notify');
    expect(store.getState().players.find((p) => p.id === 'p3')?.demonNotified).toBe(true);
    advanceToDay(store);

    // ---- Day 4: the new Demon is executed with no successor left ----
    const fourth = nominate(store, 'p5', 'p3');
    for (const voterId of ['p5', 'p8', 'p9']) castVote(store, fourth.nominationId, voterId);
    closeNomination(store, fourth.nominationId);
    closeDay(store);

    expect(store.getState().victory).toEqual({ status: 'good', reason: 'demon_dead' });
    // §4.7 — the night cannot continue past the end of the game.
    expect(nextStep(store.getState())).toBeNull();
  });

  it('leaves a log that replays to the same state and undoes to nothing', () => {
    const store = newGame();
    runNight(store, { imp: () => skipStep(store, 'st_skip') });
    advanceToDay(store);
    closeDay(store);

    expect(reduce(store.getEvents())).toEqual(store.getState());

    let guard = 0;
    while (store.canUndo()) {
      store.undo();
      if (++guard > 200) throw new Error('undo did not converge');
    }
    expect(store.getEvents()).toEqual([]);
  });

  // The bug the review found: the Imp step is keyed per-actor, so after a
  // mid-night promotion `${night}:imp:${newDemon}` was unsettled and the cursor
  // offered the kill a SECOND time — and advanceToDay refuses to leave the night
  // while a step remains. settleScope: 'per-night' is the fix (Task 9).
  it('gives the promoted Scarlet Woman no second kill on the same night', () => {
    const store = newGame();
    runNight(store);
    advanceToDay(store);
    closeDay(store);
    beginNight(store);

    // Night 2: the Imp self-kills, promoting the Scarlet Woman mid-night.
    let guard = 0;
    while (nextStep(store.getState())?.step.id !== 'imp') {
      autoSkipUnmetSteps(store);
      if (nextStep(store.getState())?.step.id === 'imp') break;
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('never reached the Imp');
    }
    resolveImpStep(store, { targetId: 'p1' });
    expect(store.getState().players.find((p) => p.id === 'p2')?.characterId).toBe('imp');

    // Her notification re-opens, which is intended and non-monotonic (§6.1)...
    expect(nextStep(store.getState())?.step.id).toBe('scarlet_woman_notify');
    takeCanonicalOrConfirm(store);

    // ...but the Imp step must NOT come back round.
    const remaining: string[] = [];
    guard = 0;
    for (;;) {
      autoSkipUnmetSteps(store);
      const position = nextStep(store.getState());
      if (!position) break;
      remaining.push(position.step.id);
      skipStep(store, 'st_skip');
      if (++guard > 60) throw new Error('night did not terminate');
    }
    expect(remaining).not.toContain('imp');
    expect(store.getState().players.filter((p) => !p.alive)).toHaveLength(1);
    expect(() => advanceToDay(store)).not.toThrow();
  });

  // The other half of the phase-ordering defect: row 4 calls abilityFunctional,
  // and a poison applied on night N expires at the end of day N — so checking
  // victory after advancing to night N+1 handed good the game for a poisoned
  // Mayor. closeDay no longer advances (Task 14).
  it('does not award the Mayor win when the Mayor is poisoned', () => {
    const store = newGame();
    runNight(store);
    advanceToDay(store);
    // Thin the table to three: p1 (Imp), p2 (Scarlet Woman), p9 (Mayor).
    for (const id of ['p3', 'p4', 'p5', 'p6', 'p7', 'p8']) recordDeath(store, id, 'other');
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'mayor_no_execution' });

    // Same shape, but the Mayor was poisoned on the night before.
    const poisoned = newGame();
    runNight(poisoned);
    poisoned.transaction('poison the Mayor', (tx) => {
      tx.emit('STATUS_APPLIED', {
        playerId: 'p9',
        status: 'poisoned',
        sourcePlayerId: 'p2',
        effective: true,
        expiresAt: { kind: 'day', number: 1 },
      });
    });
    advanceToDay(poisoned);
    for (const id of ['p3', 'p4', 'p5', 'p6', 'p7', 'p8']) recordDeath(poisoned, id, 'other');
    closeDay(poisoned);
    expect(poisoned.getState().victory).toEqual({ status: 'ongoing', reason: null });
  });

  // Guide §10 — the Master may vote after the Butler. An earlier draft froze the
  // violation when the vote landed, so a Butler voting first was flagged forever.
  it('does not flag a Butler who voted before their Master', () => {
    const store = newGame();
    runNight(store, {
      butler: () =>
        resolveStep(store, { targets: ['p9'], chosenAnswer: 'P9 is the Master', answerClass: 'canonical' }),
    });
    advanceToDay(store);
    const { nominationId } = nominate(store, 'p4', 'p1');
    // p8 is the Butler, p9 the Master — Butler's hand goes up first.
    castVote(store, nominationId, 'p8');
    castVote(store, nominationId, 'p9');
    const closed = closeNomination(store, nominationId);
    expect(closed.events[0]?.payload).toMatchObject({ butlerVotesFlagged: [] });
  });

  // Row 2 of §4.7, through the only path that can execute a Saint.
  it('awards evil the game when the Saint is executed by vote', () => {
    const store = newGame();
    runNight(store);
    advanceToDay(store);
    const { nominationId } = nominate(store, 'p4', 'p3');
    for (const voterId of ['p4', 'p5', 'p6', 'p7', 'p9']) castVote(store, nominationId, voterId);
    closeNomination(store, nominationId);
    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'evil', reason: 'saint_executed' });
  });

  // §16.5 — closeDay no longer advances the phase, so the Mayor win is reachable
  // without the sequencing trick an earlier draft relied on.
  it('awards the Mayor win on a closed day with three alive and no execution', () => {
    const store = newGame();
    runNight(store, { imp: () => skipStep(store, 'st_skip') });
    advanceToDay(store);
    // Thin the table to three: p1 (Imp), p3 (Scarlet Woman), p9 (Mayor).
    store.transaction('offscreen deaths', (tx) => {
      for (const id of ['p2', 'p4', 'p5', 'p6', 'p7', 'p8']) {
        const characterId = ROLES.find(([playerId]) => playerId === id)![1];
        tx.emit('DEATH', { playerId: id, characterIdAtDeath: characterId, cause: 'other' });
      }
    });
    expect(store.getState().victory.status).toBe('ongoing');

    closeDay(store);
    expect(store.getState().victory).toEqual({ status: 'good', reason: 'mayor_no_execution' });
  });
});
```

`reduce` comes from the file's top-level `@/engine` import — the second test must not use a dynamic `await import`, which would need the arrow function marked `async`.

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

The scripted game is the plan's acceptance test. If it passes, the engine plays Trouble Brewing end to end: deal, both night orders, poison and protection lifetimes, a fabricated answer, nominations and thresholds, two kinds of execution, a Scarlet Woman promotion by daytime execution and her delayed notification, the Mayor's win, and a good win with the log replaying to the same state.

- [ ] **Step 6: Commit**

```bash
git add test/property/advisory.property.test.ts test/scripted src/engine/commands/answerClass.test.ts src/engine/commands/nightCommands.ts src/engine/selectors/replay.ts src/engine/reducer/applyEvent.ts src/engine/reducer/applyEvent.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): enforce answer classes, prove advisory invariants, script a full game

§4.3's classes are now constraints rather than descriptions: a fabricated answer
is refused from a sober actor, an st_override requires a reason and raises no
flag, and a registration answer requires its rulings.

The advisory property tests fuzz arbitrary illegal event streams and assert
§4.8's guarantee holds — aliveCount stays in range, no player dies twice, no
duplicate votes, seating stays immutable, and there is never more than one living
Demon. That last one found a real hole: ROLE_CHANGED with reason st_correction
could promote a second Demon while the first was alive, so the reducer now treats
that as an integrity case and produces no derived state change.

The scripted nine-player game replaces the Playwright walkthrough (§14 Tier 3):
four nights and four days through a Scarlet Woman promotion by daytime
execution, her delayed notification, and a good win, with the log replaying to
the same state and undoing back to nothing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Spec coverage

Run after writing the plan, checking each spec section against a task. Sections owned by Plans 2 and 3 are named as such so nothing looks silently dropped.

| Spec | Covered by |
|---|---|
| §3.1–3.2 envelope, one write path, txId | Task 4, Task 13 |
| §3.3 purity, both enforcement mechanisms | Task 1 (scoped project), Task 4 (double-reduce + JSON round trip of events) |
| §3.4 undo, non-undoable Spy trail | Task 13 |
| §3.4 compensating events (note, status clear, role correction, corrective death) | Task 17 |
| §3.5 incremental fold, referential identity | Task 13, Task 4 |
| §3.6 event catalogue, all four v2 corrections | Task 4 (24 of 26; claims deferred to Slice 2 with reason) |
| §3.7 derived state, night-scoped `settledStepIds` | Task 3, Task 4, Task 9 |
| §3.8 edition boundary, frozen step ids, known debt | Task 2, Task 9 (`stepIds.ts`), Global Constraints |
| §4.1 perceived character + the invariant + lint | Task 6 |
| §4.2 `abilityFunctional`, `requiresAlive`, ungated registration | Task 2, Task 6 |
| §4.3 answer classes, their constraints, and the Recluse/Spy cross-product | Task 8 (sets, including Chef and Empath), Task 16 (enforcement against the computed set) |
| §4.4 status lifetimes, inclusive comparison, phase order | Task 3, Task 10 |
| §4.5 kill resolution order, Mayor bounce | Task 11 |
| §4.6 `onDemonDeath`, Scarlet Woman precedence | Task 12 |
| §4.7 four win rows, once per transaction at commit | Task 12, Task 13 |
| §4.8 advisory enforcement, both classes, the invariant | Task 4, Task 14, Task 16, Task 17 |
| §5 setup, deal, Baron order, bluffs, Drunk, herring | Task 5, Task 16 |
| §5.5 seating confirmation screen | **Plan 2** — `beginFirstNight` is the seam |
| §6.1 lazy cursor, skip-as-settled, non-monotonic | Task 9 |
| §6.2 step shape, `RulesView` narrowing, pseudo-steps | Task 6, Task 9 |
| §6.3 first vs other nights, Scarlet Woman notification | Task 9 |
| §6.4 information, derivations, Librarian zero branch | Task 7, Task 8 |
| §7 day phase, Virgin, Slayer, close day, end game | Task 14, Task 15 |
| §8.1 screens | **Plan 2** — `nightOverview` and the selectors are the seam |
| §8.2 show your working | Task 5 (distribution), Task 7 (Chef, Empath), Task 8 (all resolvers), Task 11 (kill chain), Task 12 (demon death, victory), Task 14 (threshold, execution) |
| §9 notes, claims, ledgers | **Slice 2**; `NOTE_ADDED` in Task 4 |
| §10 Spy Mode | **Plan 3**; `stPrivate` seeded in Task 3 |
| §11 live-conditions safety | **Plan 2** |
| §12 persistence, PWA, export/import | **Plan 3**; events are the persisted unit (Task 13) |
| §13 responsive and accessibility | **Plan 2** |
| §14 Tier 1 | Task 7 (positional), Task 10 (status timeline), Task 4 (determinism), Task 17 (advisory) |
| §14 Tier 2 | every named case has a test at the level where the bug would occur, not only at the predicate: Tasks 2, 5, 6, 9, 11, 12, 14, 15, 18 |
| §14 Tier 3 browser tests | **Plan 3**; the scripted game (Task 17) replaces the full-game E2E |
| §14 Tier 4 device checklist | **Plan 3** |
| §15 Slice 1 scope, seeded secret field | This plan plus Plans 2 and 3; Task 3 |
| §16 hardcoded rulings 1–12 | 1, 7, 9, 11, 12 → Tasks 11, 12, 15; 3 → Task 14; 5 → Task 15; 6 → Task 16 (`registrationLedger`); 8 → Task 14; 10 → Task 15; 2, 4 → **Plan 3** |
| §18 out of scope, immutable roster and seating | Global Constraints, Task 16, Task 17 (seat invariant) |

**Deliberate deviations from §3.6's and §3.7's shapes, each flagged at its task:**

1. `perceivedCharacterId` is a function, never a stored `Player` field — §3.7 lists it as a field, but a field is unlintable and §4.1's invariant is load-bearing. (Task 3)
2. The §3.3 JSON round-trip test round-trips the **events**, not the state, because state holds a `Set` and events are what persist. (Task 3)
3. `'already_dead'` where §4.5 says `'no_effect'` for a dead target, so the dawn announcement can distinguish the two. (Task 11)
4. `grouping: 'pseudo'` added to §6.2's step shape, because §6.1's predicate requires non-empty `wakes()` and the dusk/dawn steps have no actors. (Task 9)
5. `settleScope` added to §6.2's step shape, and the Imp set to `per-night`. §6.1's key is per-actor, which gives a promoted Scarlet Woman a second kill on the same night. (Task 9)
6. `Vote` has **no** `butlerViolation` field, and `Nomination` gains `closedThreshold`. Guide §10 lets the Master vote in either order, so the violation must be judged over the finished vote set; and the threshold is per tally, so §3.6's `auditThreshold` stops being write-only. (Tasks 3, 14)
7. `NOTE_ADDED` carries an `id`; `VIRGIN_TRIGGERED` carries `nomineeId` and `registrationRulings`; `SLAYER_CLAIMED` carries `registrationRulings`. The nominee was previously inferred from "the last nomination today", and the rulings were computed and thrown away — leaving §9's registration ledger blind to every day-phase ruling. (Tasks 4, 15)
8. `GameState.registrationHistory` is added, to feed §16.6's consistency flag. (Task 16)
9. `closeDay` does not advance the phase; `beginNight` does. See below. (Task 14)

**Three spec gaps this plan closes, all with tests:**

- **§4.7 is phase-sensitive and its own table says so** ("execution tx"), but nothing in the plan could express that: `VictoryContext` carried only `dayClosed`. An earlier draft substituted a phase comparison on row 2, which then broke outright the moment `closeDay` advanced the phase before committing — evil could never win by Saint execution, and a poisoned Mayor won for good. Splitting `closeDay`/`beginNight` so victory is decided in the phase the execution happened in fixes both with no plumbing. (Tasks 12, 14)
- §3.4 offers `ROLE_CHANGED { reason: 'st_correction' }` with no guard, which can produce two living Demons and violate §4.8's own invariant. Treated as an integrity case: no derived state change, and the command raises the flag §4.8 requires. (Tasks 4, 17)
- §16.6 ("registration consistency — flagged, never blocked") had no implementation anywhere. (Task 16)

**One open decision Rithwik may still want to flip.** §16.9 — Scarlet Woman versus starpass precedence. The plan implements the recorded default (she wins) in `onDemonDeath`, with the alternative reachable by moving the Scarlet Woman branch after the starpass branch and updating one test in `src/engine/rules/demonDeath.test.ts`.

---

## Definition of done

- `npm test` green: the unit suites, twelve property families (roughly 4,000 generated cases), and the scripted full game.
- `npm run typecheck` and `npm run lint` clean, including the ESLint boundary tests that prove §4.1's restriction fires and the barrel-completeness test that proves Plan 2 can import what it needs.
- The scripted game in `test/scripted/fullGame.test.ts` plays nine players from the deal to a good win, and the four regression tests beside it hold: no second Imp kill after a mid-night promotion, no Mayor win for a poisoned Mayor, no Butler flag for voting before their Master, and an evil win for a voted Saint execution.
- No `window`, no DOM, and no React anywhere in `src/engine/` or `src/editions/` — Plan 2 adds the UI on top of `src/engine/index.ts`.
- 18 commits, one per task, none pushed.
