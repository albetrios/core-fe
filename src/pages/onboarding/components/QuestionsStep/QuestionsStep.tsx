import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';

import { ONBOARDING_NS } from '../../onboarding.constants.ts';
import {
  QUESTIONS_STEP_KEYS,
  REFERRAL_OPTION_KEYS,
  TEAM_SIZE_OPTION_KEYS,
  USE_CASE_OPTION_KEYS,
} from './QuestionsStep.constants.ts';

type ChoiceField = 'teamSize' | 'primaryUseCase' | 'referralSource';

/**
 * Single-select chip group built as toggle buttons (`aria-pressed`) inside a
 * native `fieldset`/`legend`. Toggle buttons — not `role="radio"`/native radios
 * — because the choices are optional: clicking the active chip clears it, which
 * a radio cannot do.
 */
function ChoiceGroup({
  label,
  optionKeys,
  value,
  onSelect,
  testId,
}: {
  label: string;
  optionKeys: readonly string[];
  value: string;
  onSelect: (value: string) => void;
  testId: string;
}) {
  const { t } = useTranslation(ONBOARDING_NS);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm leading-none font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2" data-testid={testId}>
        {optionKeys.map((optionKey) => {
          const optionLabel = t(optionKey);
          const selected = value === optionLabel;
          return (
            <button
              key={optionKey}
              type="button"
              data-slot="button"
              aria-pressed={selected}
              onClick={() => onSelect(selected ? '' : optionLabel)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-foreground hover:bg-muted',
              )}
            >
              {optionLabel}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Optional qualifying questions (team size, primary use case, referral). All
 * skippable — they segment the user and seed smart defaults, never gate the
 * flow. Answers are captured for analytics on finish (not stored server-side).
 */
export function QuestionsStep() {
  const { t } = useTranslation(ONBOARDING_NS);
  /*
   * Field-level selectors (ONB-13). `useOnboardingStore()` with no selector
   * subscribes to the whole store, and `patch` replaces the entire `data`
   * object, so this component re-rendered on every keystroke anywhere in the
   * wizard. `patch` is a stable store closure.
   */
  const teamSize = useOnboardingStore((s) => s.data.teamSize);
  const primaryUseCase = useOnboardingStore((s) => s.data.primaryUseCase);
  const referralSource = useOnboardingStore((s) => s.data.referralSource);
  const patch = useOnboardingStore((s) => s.patch);

  const patchField = (field: ChoiceField, translatedValue: string) => {
    patch({ [field]: translatedValue });
  };

  return (
    <div className="space-y-5">
      <ChoiceGroup
        label={t(QUESTIONS_STEP_KEYS.teamSize.label)}
        optionKeys={TEAM_SIZE_OPTION_KEYS}
        value={teamSize}
        onSelect={(teamSize) => patchField('teamSize', teamSize)}
        testId={QUESTIONS_STEP_KEYS.teamSize.testId}
      />
      <ChoiceGroup
        label={t(QUESTIONS_STEP_KEYS.useCase.label)}
        optionKeys={USE_CASE_OPTION_KEYS}
        value={primaryUseCase}
        onSelect={(primaryUseCase) => patchField('primaryUseCase', primaryUseCase)}
        testId={QUESTIONS_STEP_KEYS.useCase.testId}
      />
      <ChoiceGroup
        label={t(QUESTIONS_STEP_KEYS.referral.label)}
        optionKeys={REFERRAL_OPTION_KEYS}
        value={referralSource}
        onSelect={(referralSource) => patchField('referralSource', referralSource)}
        testId={QUESTIONS_STEP_KEYS.referral.testId}
      />
    </div>
  );
}
