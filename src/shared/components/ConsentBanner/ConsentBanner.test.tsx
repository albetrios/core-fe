import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { PRODUCT_NAME } from '@/lib/product-identity.ts';
import { useConsentStore } from '@/shared/store/useConsentStore/index.ts';

import { ConsentBanner } from './ConsentBanner.tsx';

const env = vi.hoisted(() => ({ privacyPolicyUrl: undefined as string | undefined }));
vi.mock('@/core/config/env.ts', () => ({
  platformConfig: env,
}));

const captureAnalyticsConsentDecision = vi.fn(async () => undefined);
vi.mock('@/shared/analytics/capture-consent-decision.ts', () => ({
  captureAnalyticsConsentDecision: (...args: unknown[]) =>
    captureAnalyticsConsentDecision(...args),
}));

/** Tailwind classes on the card, as a list — assertions read better than regexes. */
function cardClasses(): string[] {
  return screen.getByTestId('consent-banner').className.split(/\s+/);
}

describe('ConsentBanner', () => {
  beforeEach(() => {
    useConsentStore.getState().resetAnalyticsConsent();
    captureAnalyticsConsentDecision.mockClear();
    env.privacyPolicyUrl = undefined;
  });

  it('renders the privacy link with a safe rel for an external _blank target', () => {
    env.privacyPolicyUrl = 'https://example.com/privacy';
    render(<ConsentBanner />);
    const link = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('omits the privacy link when no policy URL is configured', () => {
    render(<ConsentBanner />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows while the decision is undecided, named by its visible title', () => {
    render(<ConsentBanner />);
    // <section aria-labelledby> exposes an implicit region role with that name.
    const region = screen.getByRole('region', { name: 'Cookie consent' });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cookie consent' })).toBeVisible();
  });

  it('describes itself with translated copy that names the product', () => {
    render(<ConsentBanner />);
    // `{{productName}}` is an i18n default variable — locale files never carry
    // the brand, so a rebrand does not touch 11 translated strings.
    expect(
      screen.getByRole('region', { name: 'Cookie consent' }),
    ).toHaveAccessibleDescription(
      `We use cookies for product analytics to improve ${PRODUCT_NAME}. Essential functionality and error monitoring work without them.`,
    );
  });

  it('Accept grants consent and hides the banner', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ConsentBanner />);

    await user.click(screen.getByTestId('consent-accept'));

    expect(useConsentStore.getState().analyticsConsent).toBe('granted');
    await waitFor(() => {
      expect(captureAnalyticsConsentDecision).toHaveBeenCalledWith('granted');
    });
    rerender(<ConsentBanner />);
    expect(screen.queryByTestId('consent-banner')).not.toBeInTheDocument();
  });

  it('Decline denies consent and hides the banner', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ConsentBanner />);

    await user.click(screen.getByTestId('consent-decline'));

    expect(useConsentStore.getState().analyticsConsent).toBe('denied');
    await waitFor(() => {
      expect(captureAnalyticsConsentDecision).toHaveBeenCalledWith('denied');
    });
    rerender(<ConsentBanner />);
    expect(screen.queryByTestId('consent-banner')).not.toBeInTheDocument();
  });

  it('renders nothing once a decision exists', () => {
    useConsentStore.getState().setAnalyticsConsent('denied');
    const { container } = render(<ConsentBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not take focus when it appears', () => {
    // A non-modal notice. Stealing focus on every first visit would yank a
    // keyboard user out of the login form they were about to type into.
    render(<ConsentBanner />);
    expect(screen.getByTestId('consent-banner')).not.toContainElement(
      document.activeElement as HTMLElement | null,
    );
  });

  it('has no accessibility violations', async () => {
    env.privacyPolicyUrl = 'https://example.com/privacy';
    const { container } = render(<ConsentBanner />);
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── A corner card, not a full-width bar ──────────────────────────────────

  describe('placement', () => {
    it('is a corner card from `sm` up — never a viewport-wide bar', () => {
      // Regression: `inset-x-0 bottom-0` spanned the viewport, which put Accept
      // in the bottom-end corner underneath the Sentry feedback trigger.
      render(<ConsentBanner />);
      const classes = cardClasses();

      expect(classes).not.toContain('inset-x-0');
      expect(classes).not.toContain('bottom-0');
      expect(classes).toContain('sm:inset-x-auto');
      expect(classes.some((c) => c.startsWith('sm:w-'))).toBe(true);
    });

    it('takes the bottom-START corner with logical properties, so RTL mirrors it', () => {
      render(<ConsentBanner />);
      const classes = cardClasses();

      expect(classes).toContain('sm:start-4');
      // The END corner belongs to the feedback trigger and the edge controls.
      expect(classes.filter((c) => /(^|:)(end|right|left)-/.test(c))).toEqual([]);
    });

    it('widens into an inset sheet below `sm` instead of touching the screen edges', () => {
      render(<ConsentBanner />);
      expect(cardClasses()).toContain('inset-x-3');
    });

    it('rides above the mobile tab bar via --floating-bottom-offset', () => {
      // A shell that renders the tab bar publishes its height (index.css); the
      // card must consume it at EVERY width the bar exists, i.e. below `md`.
      render(<ConsentBanner />);
      const bottoms = cardClasses().filter((c) => c.includes('bottom-['));

      expect(bottoms).toHaveLength(2);
      for (const bottom of bottoms) {
        expect(bottom).toContain('var(--floating-bottom-offset,0rem)');
        expect(bottom).toContain('env(safe-area-inset-bottom,0rem)');
      }
    });

    it('is a themed floating surface — elevation, separation and shape apply', () => {
      render(<ConsentBanner />);
      const card = screen.getByTestId('consent-banner');

      expect(card).toHaveAttribute('data-slot', 'surface');
      expect(card).toHaveAttribute('data-floating');
      // Depth comes from the elevation axis, never from a hardcoded utility.
      expect(cardClasses().filter((c) => c.includes('shadow'))).toEqual([]);
    });

    it('honours reduced motion on its entrance', () => {
      render(<ConsentBanner />);
      expect(cardClasses()).toContain('motion-reduce:animate-none');
    });
  });

  describe('page clearance (--consent-card-height)', () => {
    const published = () =>
      document.documentElement.style.getPropertyValue('--consent-card-height');

    it('publishes its measured height while it is up', () => {
      // Below `sm` the card spans the width and can cover a page's last control
      // (the onboarding wizard's Continue button). index.css reserves this much
      // at the end of whatever scrolls, so that control can be scrolled clear.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        height: 173.4,
      } as DOMRect);

      render(<ConsentBanner />);

      expect(published()).toBe('174px');
      vi.restoreAllMocks();
    });

    it('withdraws the reservation once a decision is made', async () => {
      const user = userEvent.setup();
      render(<ConsentBanner />);
      expect(published()).not.toBe('');

      await user.click(screen.getByTestId('consent-decline'));

      await waitFor(() => expect(published()).toBe(''));
    });

    it('withdraws the reservation on unmount', () => {
      const { unmount } = render(<ConsentBanner />);
      unmount();
      expect(published()).toBe('');
    });

    it('reserves nothing when a decision already exists', () => {
      useConsentStore.getState().setAnalyticsConsent('granted');
      render(<ConsentBanner />);
      expect(published()).toBe('');
    });
  });

  it('gives Accept and Decline equal weight', () => {
    // Consent has to be as easy to refuse as to give: same size, same width.
    render(<ConsentBanner />);
    const accept = screen.getByTestId('consent-accept');
    const decline = screen.getByTestId('consent-decline');

    expect(accept).toHaveAttribute('data-size', 'sm');
    expect(decline).toHaveAttribute('data-size', 'sm');
    expect(accept).toHaveClass('flex-1');
    expect(decline).toHaveClass('flex-1');
  });
});
