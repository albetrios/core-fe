import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConsentStore } from '@/shared/store/useConsentStore/index.ts';

import { ConsentBannerLazy } from './ConsentBannerLazy.tsx';

const env = vi.hoisted(() => ({ privacyPolicyUrl: undefined as string | undefined }));
vi.mock('@/core/config/env.ts', () => ({ platformConfig: env }));

const reportError = vi.hoisted(() => vi.fn());
vi.mock('@/shared/errors/errorHandler.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportError,
}));

describe('ConsentBannerLazy', () => {
  beforeEach(() => {
    useConsentStore.getState().resetAnalyticsConsent();
  });

  afterEach(() => {
    vi.doUnmock('./ConsentBanner.tsx');
    vi.clearAllMocks();
  });

  it('loads and shows the card for a visitor who has not decided', async () => {
    render(<ConsentBannerLazy />);

    expect(await screen.findByTestId('consent-banner')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeVisible();
  });

  it.each(['granted', 'denied'] as const)(
    'renders nothing — and mounts no card — once consent is %s',
    (decision) => {
      // The returning visitor is the common case, and the reason this is lazy:
      // they never see the card, so they should never download it.
      useConsentStore.getState().setAnalyticsConsent(decision);

      const { container } = render(<ConsentBannerLazy />);

      expect(container).toBeEmptyDOMElement();
    },
  );

  it('goes away as soon as a decision is made', async () => {
    render(<ConsentBannerLazy />);
    await screen.findByTestId('consent-banner');

    screen.getByTestId('consent-decline').click();

    await vi.waitFor(() =>
      expect(screen.queryByTestId('consent-banner')).not.toBeInTheDocument(),
    );
    expect(useConsentStore.getState().analyticsConsent).toBe('denied');
  });

  it('reserves no space while the chunk is in flight', async () => {
    // A fixed-position card has no layout slot to hold: a spinner or a skeleton
    // in the corner would be louder than the thing it stands in for. A fresh
    // module registry, so the chunk really is still loading on first render.
    vi.resetModules();
    const fresh = await import('./ConsentBannerLazy.tsx');

    const { container } = render(<fresh.ConsentBannerLazy />);

    expect(container.textContent).toBe('');
    expect(await screen.findByTestId('consent-banner')).toBeInTheDocument();
  });
});

describe('ConsentBannerLazy — the entry chunk', () => {
  it('is the ONLY thing the barrel exports, so the root route cannot import the card', async () => {
    // The root route mounts this barrel: a static re-export of `ConsentBanner`
    // would put the whole card back in the entry chunk of every load.
    const barrel = await import('./index.ts');

    expect(Object.keys(barrel)).toEqual(['ConsentBannerLazy']);
  });
});
