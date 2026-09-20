import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
  DASHBOARD_TEST_IDS,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import {
  DASHBOARD_HIGHLIGHT_SLIDES,
  type DashboardHighlightSlide,
} from '@/shared/components/Dashboard/dashboard.placeholder-data.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/shared/components/ui/carousel.tsx';
import type { LucideIcon } from '@/shared/icons/index.ts';
import { ChevronRight, Palette, ShieldCheck, UserPlus } from '@/shared/icons/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

const HIGHLIGHT_ICONS: Record<DashboardHighlightSlide['id'], LucideIcon> = {
  appearance: Palette,
  invite: UserPlus,
  security: ShieldCheck,
};

const SLIDE_ATMOSPHERE: Record<
  DashboardHighlightSlide['id'],
  { orb: string; chip: string; ring: string }
> = {
  appearance: {
    orb: 'bg-primary/15',
    chip: 'bg-primary/12 text-primary',
    ring: 'ring-primary/15',
  },
  invite: {
    orb: 'bg-brand/12',
    chip: 'bg-brand/10 text-brand',
    ring: 'ring-brand/15',
  },
  security: {
    orb: 'bg-success/12',
    chip: 'bg-success/10 text-success',
    ring: 'ring-success/15',
  },
};

const SLIDE_COUNT = DASHBOARD_HIGHLIGHT_SLIDES.length;

const NAV_BUTTON_CLASS =
  'static top-auto right-auto left-auto size-8 shrink-0 translate-x-0 translate-y-0 touch-manipulation';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function highlightTabId(slideId: DashboardHighlightSlide['id']): string {
  return `dashboard-highlight-tab-${slideId}`;
}

function highlightPanelId(slideId: DashboardHighlightSlide['id']): string {
  return `dashboard-highlight-panel-${slideId}`;
}

function HighlightSlide({
  slide,
  isActive,
}: {
  slide: DashboardHighlightSlide;
  isActive: boolean;
}) {
  const { t } = useTranslation(DASHBOARD_NS);
  const Icon = HIGHLIGHT_ICONS[slide.id];
  const atmosphere = SLIDE_ATMOSPHERE[slide.id];
  const Action = slide.id === 'appearance' ? 'button' : 'a';

  return (
    <div
      role="tabpanel"
      id={highlightPanelId(slide.id)}
      aria-labelledby={highlightTabId(slide.id)}
      hidden={!isActive}
      className="text-start"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className={cn(
            'ring-border/60 shrink-0 rounded-xl p-0.5 ring-1',
            atmosphere.ring,
          )}
        >
          <span
            data-slot="icon-chip"
            className={cn('size-11', iconChipClassName, atmosphere.chip)}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold tracking-tight text-balance">
              {t(slide.titleKey)}
            </p>
            <p className="text-muted-foreground max-w-prose text-sm leading-snug text-pretty">
              {t(slide.descriptionKey)}
            </p>
          </div>

          <Button asChild size="sm" className="group h-9 w-fit rounded-full ps-4 pe-1">
            <Action
              type={slide.id === 'appearance' ? 'button' : undefined}
              href={slide.href}
              onClick={
                slide.id === 'appearance'
                  ? () => useUIStore.getState().setAppearanceOpen(true)
                  : undefined
              }
              tabIndex={isActive ? 0 : -1}
              data-testid={`dashboard-highlight-action-${slide.id}`}
            >
              {t(slide.actionKey)}
              <span
                data-slot="pill"
                className="bg-primary-foreground/15 flex size-7 items-center justify-center rounded-full"
                aria-hidden="true"
              >
                <ChevronRight className="size-3.5" data-icon="inline-end" />
              </span>
            </Action>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Workspace spotlight — taste-skill / product-register polish: atmospheric card,
 * segmented navigation, hero typography, pill CTA, and a compact control rail.
 */
export function HighlightsCarousel() {
  const { t } = useTranslation(DASHBOARD_NS);
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);

  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    if (!api) return;

    const syncIndex = () => {
      setActiveIndex(api.selectedScrollSnap());
    };

    syncIndex();
    api.on('select', syncIndex);
    api.on('reInit', syncIndex);

    return () => {
      api.off('select', syncIndex);
      api.off('reInit', syncIndex);
    };
  }, [api]);

  const activeSlide =
    DASHBOARD_HIGHLIGHT_SLIDES[activeIndex] ?? DASHBOARD_HIGHLIGHT_SLIDES[0];
  if (!activeSlide) return null;

  const atmosphere = SLIDE_ATMOSPHERE[activeSlide.id];
  const slideAnnouncement = t(DASHBOARD_KEYS.highlights.slideAnnouncement, {
    current: activeIndex + 1,
    total: SLIDE_COUNT,
    title: t(activeSlide.titleKey),
  });

  const goToSlide = (index: number) => {
    api?.scrollTo(index);
  };

  return (
    <section aria-label={t(DASHBOARD_KEYS.highlights.ariaLabel)}>
      <Card
        data-testid={DASHBOARD_TEST_IDS.highlightsCarousel}
        className="border-border/70 text-card-foreground relative gap-0 overflow-hidden py-0"
      >
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -end-12 -top-16 size-40 rounded-full blur-3xl transition-colors duration-700 ease-out',
            atmosphere.orb,
          )}
        />
        <div
          aria-hidden="true"
          className="bg-muted/30 pointer-events-none absolute -start-14 -bottom-16 size-32 rounded-full blur-3xl"
        />

        <CardHeader className="relative z-10 flex flex-row items-start justify-between gap-3 px-4 pt-4 pb-0">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold tracking-tight">
              {t(DASHBOARD_KEYS.highlights.heading)}
            </CardTitle>
            <CardDescription className="text-xs text-pretty">
              {t(DASHBOARD_KEYS.highlights.description)}
            </CardDescription>
          </div>
          <p
            aria-hidden="true"
            className="text-muted-foreground shrink-0 pt-0.5 text-xs font-medium tabular-nums"
          >
            {String(activeIndex + 1).padStart(2, '0')}
            <span className="text-muted-foreground/50 mx-1">/</span>
            {String(SLIDE_COUNT).padStart(2, '0')}
          </p>
        </CardHeader>

        <CardContent className="relative z-10 flex flex-col gap-3 px-4 pt-3 pb-4">
          <div
            role="tablist"
            aria-label={t(DASHBOARD_KEYS.highlights.tabsLabel)}
            data-testid={DASHBOARD_TEST_IDS.highlightsTabs}
            className="bg-muted/40 flex flex-wrap gap-0.5 rounded-lg p-0.5 sm:inline-flex sm:w-fit"
          >
            {DASHBOARD_HIGHLIGHT_SLIDES.map((slide, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  id={highlightTabId(slide.id)}
                  aria-selected={isActive}
                  aria-controls={highlightPanelId(slide.id)}
                  tabIndex={isActive ? 0 : -1}
                  data-slot="button"
                  className={cn(
                    'text-foreground inline-flex min-h-8 touch-manipulation items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-200 ease-out outline-none focus-visible:outline-hidden sm:text-sm',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                  )}
                  data-testid={`dashboard-highlights-tab-${slide.id}`}
                  onClick={() => goToSlide(index)}
                >
                  {t(slide.tabKey)}
                </button>
              );
            })}
          </div>

          <p aria-live="polite" className="sr-only">
            {slideAnnouncement}
          </p>

          <Carousel
            setApi={setApi}
            className="w-full"
            opts={{
              align: 'start',
              loop: true,
              duration: reducedMotion ? 0 : 25,
            }}
          >
            <CarouselContent className="-ms-0">
              {DASHBOARD_HIGHLIGHT_SLIDES.map((slide, index) => (
                <CarouselItem key={slide.id} className="ps-0">
                  <HighlightSlide slide={slide} isActive={index === activeIndex} />
                </CarouselItem>
              ))}
            </CarouselContent>

            <div className="border-border/60 mt-1 flex items-center gap-2 border-t pt-3">
              <CarouselPrevious
                variant="outline"
                size="icon-sm"
                className={NAV_BUTTON_CLASS}
                aria-label={t(DASHBOARD_KEYS.highlights.previousSlide)}
                data-testid="dashboard-highlights-prev"
              />
              <div
                className="flex flex-1 items-center justify-center gap-1.5"
                role="group"
                aria-label={t(DASHBOARD_KEYS.highlights.tabsLabel)}
              >
                {DASHBOARD_HIGHLIGHT_SLIDES.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    data-slot="pill"
                    className={cn(
                      'bg-muted-foreground/25 h-1 touch-manipulation rounded-full transition-[width,background-color] duration-300 ease-out',
                      index === activeIndex
                        ? 'bg-primary w-8'
                        : 'hover:bg-muted-foreground/40 w-2',
                    )}
                    aria-label={t(DASHBOARD_KEYS.highlights.goToSlide, {
                      title: t(slide.tabKey),
                    })}
                    aria-current={index === activeIndex ? 'true' : undefined}
                    data-testid={`dashboard-highlights-dot-${slide.id}`}
                    onClick={() => goToSlide(index)}
                  />
                ))}
              </div>
              <CarouselNext
                variant="outline"
                size="icon-sm"
                className={NAV_BUTTON_CLASS}
                aria-label={t(DASHBOARD_KEYS.highlights.nextSlide)}
                data-testid="dashboard-highlights-next"
              />
            </div>
          </Carousel>
        </CardContent>
      </Card>
    </section>
  );
}
