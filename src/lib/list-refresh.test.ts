import { describe, expect, it } from 'vitest';

import { listRefreshClass } from './list-refresh.ts';

describe('listRefreshClass', () => {
  it('dims the rows while they belong to the previous params', () => {
    expect(listRefreshClass(true)).toContain('opacity-60');
  });

  it('leaves settled rows at full opacity', () => {
    expect(listRefreshClass(false)).not.toContain('opacity-60');
  });

  it('always carries the transition, so the dim fades in both directions', () => {
    expect(listRefreshClass(true)).toContain('transition-opacity');
    expect(listRefreshClass(false)).toContain('transition-opacity');
  });
});
