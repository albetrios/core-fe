import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
});
