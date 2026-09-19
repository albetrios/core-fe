import type { ReactNode } from 'react';

import { cn } from '@/lib/utils.ts';
import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import { AlertCircle } from '@/shared/icons/index.ts';

interface FormErrorProps {
  message?: string | null;
  /**
   * Optional control rendered inline after the message — a retry, typically.
   * Lives inside the banner so a recoverable error carries its own way out
   * instead of the fix being stranded in loose text next to it.
   */
  action?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Standalone error display for non-field errors (API errors, general form errors).
 */
export function FormError({
  message,
  action,
  className,
  'data-testid': dataTestId,
}: FormErrorProps) {
  if (!message) return null;

  return (
    <Card
      data-testid={dataTestId ?? 'form-error'}
      className={cn(
        'border-destructive/20 bg-destructive/10 text-destructive gap-0 py-0 shadow-none',
        className,
      )}
      role="alert"
    >
      <CardContent className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
        {action}
      </CardContent>
    </Card>
  );
}
