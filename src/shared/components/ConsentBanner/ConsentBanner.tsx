import { useTranslation } from 'react-i18next';

import { platformConfig } from '@/core/config/env.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { useConsentStore } from '@/shared/store/useConsentStore/index.ts';

/**
 * Analytics cookie-consent banner. Shown only while the decision is undecided;
 * Accept/Decline persist to {@link useConsentStore}. PostHog (the only
 * cookie-setting analytics) does not initialize until consent is granted — the
 * boot sequence in `main.tsx` reacts to the store. Error monitoring (Sentry)
 * runs under legitimate interest and is not gated here.
 */
export function ConsentBanner() {
  const { t } = useTranslation(LOCALE_NS);
  const decision = useConsentStore((s) => s.analyticsConsent);
  const setConsent = useConsentStore((s) => s.setAnalyticsConsent);

  const handleAccept = () => {
    setConsent('granted');
    import('@/shared/analytics/capture-consent-decision.ts')
      .then((m) => m.captureAnalyticsConsentDecision('granted'))
      .catch(() => undefined);
  };

  const handleDecline = () => {
    setConsent('denied');
    import('@/shared/analytics/capture-consent-decision.ts')
      .then((m) => m.captureAnalyticsConsentDecision('denied'))
      .catch(() => undefined);
  };

  if (decision !== null) return null;

  return (
    <section
      aria-label={t(LOCALE_KEYS.cookieConsent)}
      data-testid="consent-banner"
      data-slot="card"
      className="bg-card text-card-foreground fixed inset-x-0 bottom-0 z-50 border-t"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          We use cookies for product analytics to improve Core. Essential functionality
          and error monitoring work without them.
          {platformConfig.privacyPolicyUrl ? (
            <>
              {' '}
              <a
                href={platformConfig.privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-medium underline"
              >
                Privacy Policy
              </a>
            </>
          ) : null}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDecline}
            data-testid="consent-decline"
          >
            Decline
          </Button>
          <Button size="sm" onClick={handleAccept} data-testid="consent-accept">
            Accept
          </Button>
        </div>
      </div>
    </section>
  );
}
