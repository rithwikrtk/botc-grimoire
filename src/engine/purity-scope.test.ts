import { describe, expect, it } from 'vitest';

describe('purity guard scope', () => {
  it('does not stub globals outside the reducer project', () => {
    expect(typeof Math.random()).toBe('number');
    expect(Number.isFinite(Date.now())).toBe(true);
    expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});
