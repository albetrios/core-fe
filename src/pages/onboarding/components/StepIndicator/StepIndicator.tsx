import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { iconOnPrimarySurface } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { Check } from '@/shared/icons/index.ts';
import type { OnboardingStep } from '@/shared/store/useOnboardingStore/index.ts';

type StepState = 'done' | 'current' | 'upcoming';

function stepState(index: number, current: number): StepState {
  if (index < current) return 'done';
  if (index === current) return 'current';
  return 'upcoming';
}

function stepCircleClass(state: StepState): string {
  const base =
    'flex size-7 items-center justify-center rounded-full text-xs transition-all duration-300 ease-out';
  if (state === 'done') return `bg-primary text-primary-foreground ${base}`;
  if (state === 'current')
    return `border-primary text-primary ring-primary/25 border font-medium ring-2 ${base}`;
  return `border-muted text-muted-foreground border ${base}`;
}

/** Numbered progress dots across the top of the onboarding card. */
export function StepIndicator({
  current,
  steps,
}: {
  current: number;
  steps: readonly OnboardingStep[];
}) {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <ol
      className="flex items-center gap-2"
      aria-label={t(LOCALE_KEYS.onboardingProgress)}
    >
      {steps.map((step, i) => {
        const state = stepState(i, current);
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={stepCircleClass(state)}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {state === 'done' ? (
                <Check className={cn('h-4 w-4', iconOnPrimarySurface)} />
              ) : (
                i + 1
              )}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'h-px w-6 transition-colors duration-300 ease-out',
                  i < current ? 'bg-primary' : 'bg-border',
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
