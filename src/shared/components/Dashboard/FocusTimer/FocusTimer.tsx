import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import { RotateCw, Zap } from '@/shared/icons/index.ts';

const FOCUS_SECONDS = 25 * 60;
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

/** Diagonal hairline texture (currentColor) — the reference dashboards' hatch. */
const hatchOverlayClassName =
  'pointer-events-none absolute inset-0 opacity-[0.07] ' +
  'bg-[repeating-linear-gradient(135deg,currentColor_0,currentColor_1px,transparent_1px,transparent_7px)]';

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * "Focus timer" — the Donezo-style dark accent card with a genuinely working
 * 25-minute sprint: start/pause/reset, a smoothly draining SVG ring, and a
 * ticking tabular clock. Real client-side state, so no sample badge.
 */
export function FocusTimer() {
  const { t } = useTranslation(DASHBOARD_NS);
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return undefined;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const progress = secondsLeft / FOCUS_SECONDS;

  return (
    <Card
      data-testid="dashboard-focus-timer"
      className="border-primary/50 bg-primary text-primary-foreground relative gap-0 overflow-hidden py-0"
    >
      <div className={hatchOverlayClassName} aria-hidden="true" />
      <div
        className="bg-primary-foreground/10 pointer-events-none absolute -end-10 -top-14 h-40 w-40 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <CardContent className="relative flex flex-col items-center gap-4 p-4 sm:p-5">
        <div className="flex w-full items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn(
              'bg-primary-foreground/15 text-primary-foreground size-9',
              iconChipClassName,
            )}
            aria-hidden="true"
          >
            <Zap className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-tight">
              {t(DASHBOARD_KEYS.focus.heading)}
            </p>
            <p className="text-primary-foreground/75 truncate text-xs">
              {t(DASHBOARD_KEYS.focus.description)}
            </p>
          </div>
        </div>

        <div className="relative">
          <svg
            viewBox="0 0 120 120"
            className="size-36"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx={60}
              cy={60}
              r={RING_R}
              fill="none"
              strokeWidth={7}
              className="stroke-current opacity-20"
            />
            <circle
              cx={60}
              cy={60}
              r={RING_R}
              fill="none"
              strokeWidth={7}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              className="stroke-current transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progress)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <p
              role="timer"
              aria-label={t(DASHBOARD_KEYS.focus.heading)}
              data-testid="dashboard-focus-clock"
              className="text-3xl font-semibold tracking-tight tabular-nums"
            >
              {formatClock(secondsLeft)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setRunning((current) => !current)}
            disabled={secondsLeft === 0}
            data-testid="dashboard-focus-toggle"
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/85 min-w-20"
          >
            {running ? t(DASHBOARD_KEYS.focus.pause) : t(DASHBOARD_KEYS.focus.start)}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setRunning(false);
              setSecondsLeft(FOCUS_SECONDS);
            }}
            data-testid="dashboard-focus-reset"
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          >
            <RotateCw className="me-1.5 size-3.5" aria-hidden="true" />
            {t(DASHBOARD_KEYS.focus.reset)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
