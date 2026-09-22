import { cn } from '@/lib/utils.ts';

import { useLoadingMessage } from './useLoadingMessage.ts';

interface LoadingMessageProps {
  /** What is being fetched ("Sessions", "Members"). Optional. */
  name?: string;
  className?: string;
  /** Defaults to `loading-message`; override where a panel asserts on its own. */
  testId?: string;
}

/**
 * The line that sits above a skeleton and says what is being waited for.
 *
 * @remarks
 * Each settings panel shapes its own skeleton like its real content, so the
 * panel does not jump when the answer lands (SET-22) — which means there is no
 * one skeleton component to put this in. It is a separate line instead, dropped
 * above whichever bars a panel draws.
 *
 * `<output>` with `aria-live="polite"`: `Skeleton` is decorative, so without
 * this a screen reader was told nothing at all while a panel loaded. Polite,
 * because a wait is progress and an alert would interrupt whatever was being
 * read. The text advances while the wait continues — see {@link useLoadingMessage}.
 */
export function LoadingMessage({ name, className, testId }: LoadingMessageProps) {
  const message = useLoadingMessage(name);
  return (
    <output
      aria-live="polite"
      className={cn('text-muted-foreground block text-sm', className)}
      data-testid={testId ?? 'loading-message'}
    >
      {message}
    </output>
  );
}
