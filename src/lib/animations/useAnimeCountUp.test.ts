import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAnimeCountUp } from './useAnimeCountUp.ts';

function mockReducedMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** Renders the hook with a live element attached, as a consumer would. */
function renderWithElement(target: number | null, durationMs?: number) {
  const element = document.createElement('p');
  document.body.append(element);
  const format = (value: number) => String(Math.round(value));

  const utils = renderHook(() => {
    const ref = useAnimeCountUp<HTMLParagraphElement>(target, format, durationMs);
    ref.current = element;
    return ref;
  });

  return { element, ...utils };
}

describe('useAnimeCountUp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('leaves the rendered value untouched when reduced motion is preferred', () => {
    mockReducedMotion(true);
    const { element } = renderWithElement(42);
    // React owns the final value; the hook must not overwrite it with a 0 frame.
    expect(element.textContent).toBe('');
  });

  it('animates the element text to the target when motion is allowed', async () => {
    mockReducedMotion(false);
    const { element } = renderWithElement(100, 200);

    await waitFor(() => {
      expect(element.textContent).toBe('100');
    });
  });

  it('never drives the animation through React state', async () => {
    mockReducedMotion(false);
    let renderCount = 0;
    const element = document.createElement('p');
    document.body.append(element);

    renderHook(() => {
      renderCount += 1;
      const ref = useAnimeCountUp<HTMLParagraphElement>(
        50,
        (v) => String(Math.round(v)),
        100,
      );
      ref.current = element;
      return ref;
    });

    await waitFor(() => {
      expect(element.textContent).toBe('50');
    });

    // A setState-per-frame tween re-rendered ~43 times per mount and could fire
    // mid-render of another component (React: "Cannot update a component while
    // rendering a different component"). Writing to the DOM keeps renders at 1.
    expect(renderCount).toBe(1);
  });

  it('does nothing for non-numeric content', () => {
    mockReducedMotion(false);
    const { element } = renderWithElement(null);
    expect(element.textContent).toBe('');
  });
});
