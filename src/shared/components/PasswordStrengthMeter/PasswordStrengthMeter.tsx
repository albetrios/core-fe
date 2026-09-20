import { useEffect, useRef, useState } from 'react';

import { type BreachResult, checkPasswordBreached } from '@/lib/password-breach.ts';
import { estimatePasswordStrength, type PasswordScore } from '@/lib/password-strength.ts';
import { cn } from '@/lib/utils.ts';

/** Filled-segment colour per score (semantic tokens only). */
const SEGMENT_TONE: Record<PasswordScore, string> = {
  0: 'bg-destructive',
  1: 'bg-destructive',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

const DEBOUNCE_MS = 500;

interface PasswordStrengthMeterProps {
  password: string;
  /** Personal strings (e.g. email) to penalize if embedded in the password. */
  userInputs?: string[];
  /**
   * Fired when the breach verdict changes — the form gates submit on a
   * confirmed breach. Fail-open: a check that can't run reports `false`.
   */
  onBreachedChange?: (breached: boolean) => void;
}

/**
 * Live password feedback: a 0–4 strength meter ({@link estimatePasswordStrength})
 * plus a debounced Have I Been Pwned breach check ({@link checkPasswordBreached},
 * k-anonymity — only a hash prefix leaves the browser). Renders nothing for an
 * empty password.
 */
export function PasswordStrengthMeter({
  password,
  userInputs = [],
  onBreachedChange,
}: PasswordStrengthMeterProps) {
  const strength = estimatePasswordStrength(password, userInputs);
  // Stamp the result with the password it belongs to: a verdict for a stale
  // password is ignored on render, so we never need a synchronous reset.
  const [breachFor, setBreachFor] = useState<{
    password: string;
    result: BreachResult | null;
  }>({ password: '', result: null });

  // Keep the callback in a ref (updated in an effect, not during render) so the
  // debounce effect depends only on `password` — an inline parent callback must
  // not reset the timer each render.
  const onBreachedChangeRef = useRef(onBreachedChange);
  useEffect(() => {
    onBreachedChangeRef.current = onBreachedChange;
  });

  useEffect(() => {
    if (!password) {
      onBreachedChangeRef.current?.(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      checkPasswordBreached(password)
        .then((result) => {
          if (!active) return;
          setBreachFor({ password, result });
          onBreachedChangeRef.current?.(result?.breached ?? false);
        })
        .catch(() => {
          /* best-effort — a failed check never blocks the user */
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [password]);

  if (!password) return null;

  const breach = breachFor.password === password ? breachFor.result : null;

  const filled = Math.max(1, strength.score);

  return (
    <div className="space-y-1.5" data-testid="password-strength">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            data-slot="pill"
            className={cn(
              'h-1 flex-1 rounded-full',
              i < filled ? SEGMENT_TONE[strength.score] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs" aria-live="polite">
        Password strength:{' '}
        <span className="text-foreground font-medium">{strength.label}</span>
        {strength.suggestion ? ` — ${strength.suggestion}` : ''}
      </p>
      {breach?.breached && (
        <p
          className="text-destructive text-xs"
          role="alert"
          data-testid="password-breach-warning"
        >
          This password has appeared in a known data breach. Please choose a different
          one.
        </p>
      )}
    </div>
  );
}
