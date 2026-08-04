import { Trans, useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';

type AuthWelcomeHeaderProps = {
  className?: string;
  /** `emailVerify` — focused copy after the user commits to email OTP. */
  variant?: 'welcome' | 'emailVerify';
  /** Shown under the verify heading — the address the code was sent to. */
  email?: string;
};

/** Welcome copy for the unified auth entry — tuned for split and card layouts. */
export function AuthWelcomeHeader({
  className,
  variant = 'welcome',
  email,
}: AuthWelcomeHeaderProps) {
  const { t } = useTranslation(AUTH_NS);

  if (variant === 'emailVerify') {
    return (
      <header className={cn('space-y-2 text-center lg:text-start', className)}>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
          {t(AUTH_KEYS.auth.verify.heading)}
        </h1>
        {email ? (
          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
            <Trans
              ns={AUTH_NS}
              i18nKey={AUTH_KEYS.auth.email.codeSentTo}
              values={{ email }}
              components={{ 1: <span className="text-foreground font-medium" /> }}
            />
          </p>
        ) : null}
      </header>
    );
  }

  return (
    <header className={cn('space-y-2 text-center lg:text-start', className)}>
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
        {t(AUTH_KEYS.auth.heading)}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
        {t(AUTH_KEYS.auth.subheading)}
      </p>
    </header>
  );
}
