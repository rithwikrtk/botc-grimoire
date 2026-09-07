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
