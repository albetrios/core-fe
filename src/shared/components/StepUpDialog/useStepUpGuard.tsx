import { useCallback, useRef, useState } from 'react';

import { isStepUpRequiredError } from '@/shared/api/step-up-api.ts';

import { StepUpDialog } from './StepUpDialog.tsx';

interface GuardOptions {
  /** Offer the bootstrap email-code factor (false for destructive mutations). */
  allowEmailCode?: boolean;
  /** Non-step-up errors land here (step-up 403s never do — they open the dialog). */
  onError?: (error: unknown) => void;
}

interface PendingStepUp {
  action: () => Promise<unknown>;
  options?: GuardOptions;
}

/**
 * Guard for step-up-gated mutations. Wrap the call: on core-be's
 * "recent step-up required" 403 it opens {@link StepUpDialog} and re-runs the
 * action after verification; any other error goes to `options.onError`.
 *
 * **`guard` RETURNS its promise**, settling only when the action does. It used
 * to return `void`, so a caller like `ConfirmDialog` — which does
 * `await onConfirm()` to hold a busy state — resolved instantly: the dialog
 * closed on click and whatever came back (an error, the step-up prompt) landed
 * on a screen the gesture had already left (SET-8).
 *
 * ```tsx
 * const { guard, isGuarding, isSteppingUp, stepUpDialog } = useStepUpGuard();
 * await guard(() => begin.mutateAsync().then(onBegun), { onError: notifyFailed });
 * // …render {stepUpDialog} once at the component root.
 * ```
 */
export function useStepUpGuard() {
  const [pending, setPending] = useState<PendingStepUp | null>(null);
  const [isGuarding, setIsGuarding] = useState(false);
  // Synchronous twin of `isGuarding` — a second click in the same frame lands
  // before React has re-rendered the button disabled, and these actions are
  // credential mutations (disable 2FA, revoke a passkey). One gesture, one run.
  const guardingRef = useRef(false);

  const guard = useCallback(
    async (action: () => Promise<unknown>, options?: GuardOptions): Promise<void> => {
      if (guardingRef.current) return;
      guardingRef.current = true;
      setIsGuarding(true);
      try {
        await action();
      } catch (error: unknown) {
        if (isStepUpRequiredError(error)) {
          // Not a failure — the dialog takes over and re-runs the action.
          setPending({ action, options });
          return;
        }
        options?.onError?.(error);
      } finally {
        guardingRef.current = false;
        setIsGuarding(false);
      }
    },
    [],
  );

  const stepUpDialog = pending ? (
    <StepUpDialog
      open
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      allowEmailCode={pending.options?.allowEmailCode ?? true}
      onVerified={() => {
        const { action, options } = pending;
        setPending(null);
        void guard(action, options);
      }}
    />
  ) : null;

  return {
    guard,
    isGuarding,
    /**
     * The re-authentication DIALOG is open. Distinct from `isGuarding`, which
     * also covers the action itself: "one ceremony at a time" is a reason to
     * block a sibling control, "one row is being removed" is not (SET-24).
     */
    isSteppingUp: pending !== null,
    stepUpDialog,
  };
}
