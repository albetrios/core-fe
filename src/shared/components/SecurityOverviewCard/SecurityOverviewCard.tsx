import { useTranslation } from 'react-i18next';

import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { CheckCircle, ShieldAlert, ShieldCheck } from '@/shared/icons/index.ts';

export interface SecurityOverviewCardProps {
  mfaEnabled: boolean;
  passkeyCount: number;
}

/**
 * At-a-glance security posture — helps users see what's protecting their account
 * without digging through each card.
 */
export function SecurityOverviewCard({
  mfaEnabled,
  passkeyCount,
}: SecurityOverviewCardProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const keys = SETTINGS_KEYS.security.overview;

  const items = [
    {
      id: 'mfa',
      ok: mfaEnabled,
      label: mfaEnabled ? t(keys.mfaOn) : t(keys.mfaOff),
    },
    {
      id: 'passkeys',
      ok: passkeyCount > 0,
      label:
        passkeyCount > 0
          ? t(keys.passkeysOn, { count: passkeyCount })
          : t(keys.passkeysOff),
    },
    {
      id: 'idle',
      ok: true,
      label: t(keys.idleProtection),
    },
  ] as const;

  const score = items.filter((item) => item.ok).length;
  const strong = score === items.length;

  return (
    <Card data-testid="security-overview">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {strong ? (
              <ShieldCheck className="text-success" aria-hidden />
            ) : (
              <ShieldAlert className="text-warning" aria-hidden />
            )}
            <CardTitle className="text-base">{t(keys.title)}</CardTitle>
          </div>
          <Badge
            variant={strong ? 'success' : 'secondary'}
            data-testid="security-overview-score"
          >
            {t(keys.score, { score, total: items.length })}
          </Badge>
        </div>
        <CardDescription>{t(keys.description)}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 text-sm"
              data-testid={`security-overview-${item.id}`}
            >
              <CheckCircle
                className={item.ok ? 'text-success' : 'text-muted-foreground'}
                aria-hidden
              />
              <span className={item.ok ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
