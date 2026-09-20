import { describe, expect, it } from 'vitest';

import { layoutMainClassName, resolveEffectiveLayoutWidth } from './layout-width.ts';

describe('layout-width', () => {
  it('resolveEffectiveLayoutWidth prefers forced deploy value', () => {
    expect(resolveEffectiveLayoutWidth('full', 'reading')).toBe('full');
    expect(resolveEffectiveLayoutWidth('contained', 'full')).toBe('contained');
  });

  it('resolveEffectiveLayoutWidth uses preference when not forced', () => {
    expect(resolveEffectiveLayoutWidth(null, 'reading')).toBe('reading');
    expect(resolveEffectiveLayoutWidth(null, undefined)).toBe('contained');
    expect(resolveEffectiveLayoutWidth(null, 'bogus')).toBe('contained');
  });

  it('layoutMainClassName maps each width id', () => {
    expect(layoutMainClassName('full')).toBe('w-full');
    expect(layoutMainClassName('contained')).toContain('max-w-screen-2xl');
    expect(layoutMainClassName('reading')).toContain('max-w-3xl');
  });

  it('keeps the contained column growing on big monitors', () => {
    // Capped at `2xl` (1536px) it covered well under half of a 3440px ultrawide
    // and no longer lined up with the header above it.
    const classes = layoutMainClassName('contained').split(' ');
    expect(classes).toContain('3xl:max-w-[112rem]');
    expect(classes).toContain('4xl:max-w-[136rem]');
    expect(classes).toContain('mx-auto');
  });

  it('leaves the reading and full widths alone on big monitors', () => {
    expect(layoutMainClassName('reading')).not.toMatch(/[34]xl:/);
    expect(layoutMainClassName('full')).not.toMatch(/[34]xl:/);
  });
});
