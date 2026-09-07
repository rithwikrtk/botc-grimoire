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
