import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PRODUCT_NAME } from '@/lib/product-identity.ts';
import { copySensitiveText } from '@/lib/sensitive-clipboard.ts';
import { cn } from '@/lib/utils.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Checkbox } from '@/shared/components/ui/checkbox.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import { Copy, Download, Eye, EyeOff } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';

export interface RecoveryCodesPanelProps {
  codes: string[];
  onDone: () => void;
  testId?: string;
}

function buildDownloadBlob(codes: string[]): Blob {
  const body = [
    `${PRODUCT_NAME} — two-factor recovery codes`,
    'Each code works once. Store offline in a password manager or safe.',
    '',
    ...codes,
    '',
    `Generated: ${new Date().toISOString()}`,
  ].join('\n');
  return new Blob([body], { type: 'text/plain;charset=utf-8' });
}

/**
 * One-time recovery code reveal — masked by default, copy/download with clipboard
 * auto-wipe, and an acknowledgment gate before Done.
 */
export function RecoveryCodesPanel({
  codes,
  onDone,
  testId = 'recovery-codes-panel',
}: RecoveryCodesPanelProps) {
  const { t } = useTranslation(SETTINGS_NS);
  const keys = SETTINGS_KEYS.security.recoveryCodes;
  const [revealed, setRevealed] = useState(false);
  const [savedAck, setSavedAck] = useState(false);

  async function handleCopyAll() {
    const ok = await copySensitiveText(codes.join('\n'));
    if (ok) {
      notify.success(t(keys.copySuccess));
    } else {
      notify.error(t(keys.copyFailed));
    }
  }

  function handleDownload() {
    const url = URL.createObjectURL(buildDownloadBlob(codes));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'core-recovery-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    notify.info(t(keys.downloadStarted));
  }

  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRevealed((prev) => !prev)}
          data-testid={`${testId}-toggle-reveal`}
        >
          {revealed ? (
            <EyeOff data-icon="inline-start" />
          ) : (
            <Eye data-icon="inline-start" />
          )}
          {revealed ? t(keys.hide) : t(keys.reveal)}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleCopyAll()}
          data-testid={`${testId}-copy-all`}
        >
          <Copy data-icon="inline-start" />
          {t(keys.copyAll)}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownload}
          data-testid={`${testId}-download`}
        >
          <Download data-icon="inline-start" />
          {t(keys.download)}
        </Button>
      </div>

      <ul
        className={cn(
          'bg-muted grid grid-cols-2 gap-2 rounded-md p-3 font-mono text-sm tabular-nums',
          !revealed && 'blur-sm select-none',
        )}
        data-testid="mfa-recovery-codes"
        aria-hidden={!revealed}
      >
        {codes.map((code) => (
          <li key={code}>{revealed ? code : '••••-••••'}</li>
        ))}
      </ul>

      <p className="text-muted-foreground text-xs">{t(keys.clipboardNotice)}</p>

      <div className="flex items-start gap-2">
        <Checkbox
          id={`${testId}-ack`}
          checked={savedAck}
          onCheckedChange={(checked) => setSavedAck(checked === true)}
          data-testid={`${testId}-ack`}
        />
        <Label htmlFor={`${testId}-ack`} className="text-sm leading-snug font-normal">
          {t(keys.acknowledge)}
        </Label>
      </div>

      <Button onClick={onDone} disabled={!savedAck} data-testid="mfa-done">
        {t(SETTINGS_KEYS.security.mfa.done)}
      </Button>
    </div>
  );
}
