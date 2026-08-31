import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import { Search, Sparkles } from '@/shared/icons/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

const CHIP_KEYS = [
  DASHBOARD_KEYS.ai.chips.usage,
  DASHBOARD_KEYS.ai.chips.members,
  DASHBOARD_KEYS.ai.chips.appearance,
] as const;

/**
 * "Ask your workspace" — the reference boards' assistant card, wired to a real
 * surface: the animated gradient orb, the prompt field, and every suggestion
 * chip all open the command palette (⌘K). No fake data, so no sample badge.
 */
export function AiAssistantCard() {
  const { t } = useTranslation(DASHBOARD_NS);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const open = () => setCommandPaletteOpen(true);

  return (
    <Card
      data-testid="dashboard-ai-card"
      className="border-primary/25 from-primary/12 via-card to-card relative gap-0 overflow-hidden bg-gradient-to-br py-0"
    >
      <div
        className="bg-chart-2/20 pointer-events-none absolute -start-12 -bottom-16 h-44 w-44 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <CardContent className="relative flex flex-col items-center gap-4 p-5 text-center sm:p-6">
        <div className="relative" aria-hidden="true">
          <div className="from-chart-1 via-chart-2 to-chart-3 size-14 rounded-full bg-gradient-to-br opacity-80 blur-[6px] motion-safe:animate-pulse" />
          <div className="from-chart-1/80 via-chart-2/80 to-chart-3/80 absolute inset-1 rounded-full bg-gradient-to-tl" />
          <Sparkles className="text-primary-foreground absolute inset-0 m-auto size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-foreground text-lg font-semibold tracking-tight text-balance">
            {t(DASHBOARD_KEYS.ai.heading)}
          </p>
          <p className="text-muted-foreground text-sm text-pretty">
            {t(DASHBOARD_KEYS.ai.description)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {CHIP_KEYS.map((chipKey) => (
            <button
              key={chipKey}
              type="button"
              data-slot="button"
              onClick={open}
              data-testid={`dashboard-ai-chip-${chipKey.split('.').pop() ?? 'chip'}`}
              className="border-border/70 bg-card/80 text-foreground hover:border-primary/40 hover:bg-primary/10 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            >
              {t(chipKey)}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-slot="button"
          onClick={open}
          data-testid="dashboard-ai-prompt"
          className={cn(
            'border-border bg-background/80 text-muted-foreground hover:border-primary/50',
            'flex w-full max-w-sm items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm',
            'transition-[border-color]',
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {t(DASHBOARD_KEYS.ai.placeholder)}
          </span>
          <kbd className="border-border bg-muted text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>
      </CardContent>
    </Card>
  );
}
