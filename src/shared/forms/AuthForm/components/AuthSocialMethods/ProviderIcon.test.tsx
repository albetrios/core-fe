import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { ProviderIcon } from './ProviderIcon.tsx';

/** The providers this component actually draws a mark for. */
const DRAWN_PROVIDERS = ['google', 'github', 'apple'] as const;

function renderIcon(provider: string) {
  const { container } = render(<ProviderIcon provider={provider} />);
  return container;
}

describe('ProviderIcon', () => {
  it.each(DRAWN_PROVIDERS)('draws the %s brand mark', (provider) => {
    const icon = renderIcon(provider).querySelector('svg[data-icon]');
    expect(icon).not.toBeNull();
  });

  it('draws a distinct mark per provider rather than one shared glyph', () => {
    const marks = DRAWN_PROVIDERS.map((provider) => renderIcon(provider).innerHTML);
    expect(new Set(marks).size).toBe(DRAWN_PROVIDERS.length);
  });

  it('renders nothing at all for a provider it does not draw', () => {
    const container = renderIcon('myspace');
    // Nothing — not a fallback or placeholder glyph in the button's icon slot.
    expect(container).toBeEmptyDOMElement();
    expect(container.querySelector('svg')).toBeNull();
  });

  /*
   * These marks sit inside auth buttons that already carry their own label
   * ("Continue with Google"), so the icon must be decorative — an accessible
   * name here would be read twice. Plain `axe`, not `axeForDialog`: nothing
   * portals, so the aria-hidden-focus rule that helper relaxes should stay on.
   */
  describe('accessibility', () => {
    it.each(DRAWN_PROVIDERS)('has no axe violations for %s', async (provider) => {
      const container = renderIcon(provider);
      expect(await axe(container)).toHaveNoViolations();
    });

    it.each(DRAWN_PROVIDERS)('exposes %s decoratively, not as an image', (provider) => {
      const svg = renderIcon(provider).querySelector('svg');
      expect(svg).not.toBeNull();
      // Either hidden from the tree, or carrying no accessible name of its own.
      const hidden = svg?.getAttribute('aria-hidden') === 'true';
      const named = Boolean(
        svg?.getAttribute('aria-label') ?? svg?.getAttribute('title'),
      );
      expect(hidden || !named).toBe(true);
    });
  });
});
