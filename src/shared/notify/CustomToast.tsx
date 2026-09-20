import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { cn } from '@/lib/utils.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  type LucideIcon,
  X,
  XCircle,
} from '@/shared/icons/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { TOAST_VARIANTS } from '@/shared/theme/index.ts';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface ToastTone {
  icon: LucideIcon;
  /** Filled icon badge — semantic bg + contrasting foreground (readable on dark hues). */
  iconBadge: string;
  tintSurface: string;
  solid: string;
  outlineBorder: string;
  bar: string;
}

const TONES: Record<ToastType, ToastTone> = {
  success: {
    icon: CheckCircle2,
    iconBadge: 'bg-success text-success-foreground',
    tintSurface: 'border-success/25 bg-success/10',
    solid: 'bg-success text-success-foreground',
    outlineBorder: 'border-success/40',
    bar: 'bg-success',
  },
  error: {
    icon: XCircle,
    iconBadge: 'bg-destructive text-destructive-foreground',
    tintSurface: 'border-destructive/25 bg-destructive/10',
    solid: 'bg-destructive text-destructive-foreground',
    outlineBorder: 'border-destructive/40',
    bar: 'bg-destructive',
  },
  warning: {
    icon: AlertTriangle,
    iconBadge: 'bg-warning text-warning-foreground',
    tintSurface: 'border-warning/25 bg-warning/10',
    solid: 'bg-warning text-warning-foreground',
    outlineBorder: 'border-warning/40',
    bar: 'bg-warning',
  },
  info: {
    icon: AlertCircle,
    iconBadge: 'bg-info text-info-foreground',
    tintSurface: 'border-info/25 bg-info/10',
    solid: 'bg-info text-info-foreground',
    outlineBorder: 'border-info/40',
    bar: 'bg-info',
  },
  loading: {
    icon: Loader2,
    iconBadge: 'bg-muted text-muted-foreground',
    tintSurface: 'border-border bg-muted/40',
    solid: 'bg-muted text-foreground',
    outlineBorder: 'border-border',
    bar: 'bg-muted-foreground',
  },
};

export interface CustomToastProps {
  id: string | number;
  type: ToastType;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** Called when the toast is dismissed (close button or auto-dismiss). */
  onDismiss?: () => void;
}

function stopToastPointerBubble(event: React.SyntheticEvent) {
  // Sonner attaches swipe / pointer-capture handlers on `[data-sonner-toast]`.
  event.stopPropagation();
}

function ToastInlineAction({
  id,
  action,
  solid,
}: {
  id: string | number;
  action: { label: string; onClick: () => void };
  solid: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onPointerDown={stopToastPointerBubble}
      onClick={(event) => {
        stopToastPointerBubble(event);
        action.onClick();
        toast.dismiss(id);
      }}
      className={cn(
        'mt-0.5 shrink-0 underline-offset-2 hover:underline',
        solid && 'text-current',
      )}
      data-testid="toast-action"
    >
      {action.label}
    </Button>
  );
}

function ToastDismissButton({
  id,
  solid,
  label,
  onDismiss,
}: {
  id: string | number;
  solid: boolean;
  label: string;
  onDismiss?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onPointerDown={stopToastPointerBubble}
      onClick={(event) => {
        stopToastPointerBubble(event);
        onDismiss?.();
        toast.dismiss(id);
      }}
      aria-label={label}
      data-testid="toast-dismiss"
      className={cn(
        'mt-0.5 shrink-0 touch-auto opacity-70 hover:opacity-100',
        solid && 'text-current hover:bg-current/15',
      )}
    >
      <X className="size-3.5" />
    </Button>
  );
}

function ToastIconBadge({
  Icon,
  tone,
  variant,
  solid,
  isLoading,
}: {
  Icon: LucideIcon;
  tone: ToastTone;
  variant: string;
  solid: boolean;
  isLoading: boolean;
}) {
  const useTintBadge = variant === 'tint' || variant === 'outline';
  return (
    <span
      data-slot="pill"
      className={cn(
        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
        useTintBadge && tone.iconBadge,
        solid && 'bg-transparent',
        variant === 'accent' && tone.iconBadge,
      )}
      aria-hidden="true"
    >
      <Icon
        className={cn('size-3.5', solid && 'text-current', isLoading && 'animate-spin')}
      />
    </span>
  );
}

/**
 * Compact toast surface — default **tint** variant uses a subtle semantic wash
 * and a filled icon badge (foreground always contrasts the hue, including dark
 * greens). Other variants remain for the Appearance preview / shuffle.
 */
export function CustomToast({
  id,
  type,
  title,
  description,
  action,
  onDismiss,
}: CustomToastProps) {
  const { t } = useTranslation(ERRORS_NS);
  const index = useThemeStore((s) => s.toastVariant);
  const variant = TOAST_VARIANTS[index % TOAST_VARIANTS.length] ?? 'tint';
  const tone = TONES[type];
  const Icon = tone.icon;
  const solid = variant === 'solid';
  const isLoading = type === 'loading';

  return (
    <div
      data-slot="card"
      data-testid="app-toast"
      data-toast-variant={variant}
      className={cn(
        'pointer-events-auto relative flex w-full max-w-[min(100%,20rem)] items-start gap-2.5 overflow-hidden border px-3 py-2.5 backdrop-blur-[2px]',
        variant === 'tint' && cn('text-foreground', tone.tintSurface),
        solid && cn(tone.solid, 'border-transparent shadow-md'),
        variant === 'outline' &&
          cn('bg-popover/95 text-popover-foreground', tone.outlineBorder),
        variant === 'accent' &&
          'bg-popover/95 text-popover-foreground border-border ps-4',
        variant === 'minimal' &&
          'border-border/70 bg-background/90 text-foreground border-dashed',
        variant === 'glass' &&
          'border-border/35 bg-popover/50 text-popover-foreground backdrop-blur-md',
      )}
    >
      {variant === 'accent' ? (
        <span
          className={cn('absolute inset-y-0 start-0 w-1', tone.bar)}
          aria-hidden="true"
        />
      ) : null}
      <ToastIconBadge
        Icon={Icon}
        tone={tone}
        variant={variant}
        solid={solid}
        isLoading={isLoading}
      />
      <div className="min-w-0 flex-1 pt-px">
        <p className="text-sm leading-snug font-medium">{title}</p>
        {description ? (
          <p
            className={cn(
              'mt-0.5 text-xs leading-snug',
              solid ? 'opacity-90' : 'text-muted-foreground',
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action && !isLoading ? (
        <ToastInlineAction id={id} action={action} solid={solid} />
      ) : null}
      <ToastDismissButton
        id={id}
        solid={solid}
        label={t(ERRORS_KEYS.toast.dismiss)}
        onDismiss={onDismiss}
      />
    </div>
  );
}
