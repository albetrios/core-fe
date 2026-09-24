import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConsentStore } from '@/shared/store/useConsentStore/index.ts';

import { ConsentBannerLazy } from './ConsentBannerLazy.tsx';

const env = vi.hoisted(() => ({ privacyPolicyUrl: undefined as string | undefined }));
vi.mock('@/core/config/env.ts', () => ({ platformConfig: env }));

// A file of its own is a module registry of its own: nothing here has loaded the
// card before this test renders, so the chunk genuinely is still in flight on the
// first render. Keep it to this one test — any earlier render in this file would
// resolve the lazy card and the empty-first-render assertion would fail.
//
// It used to live in ConsentBannerLazy.test.tsx and reach that state with
// vi.resetModules(). Whenever it ran before the other tests there, the statically
// imported component's lazy card never mounted again, and they timed out.
describe('ConsentBannerLazy — while the chunk is in flight', () => {
  beforeEach(() => {
    useConsentStore.getState().resetAnalyticsConsent();
  });

  it('reserves no space while the chunk is in flight', async () => {
    // A fixed-position card has no layout slot to hold: a spinner or a skeleton
    // in the corner would be louder than the thing it stands in for.
    const { container } = render(<ConsentBannerLazy />);

    expect(container.textContent).toBe('');
    expect(await screen.findByTestId('consent-banner')).toBeInTheDocument();
  });
});
