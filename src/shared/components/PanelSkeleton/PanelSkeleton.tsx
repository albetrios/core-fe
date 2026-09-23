import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { cn } from '@/lib/utils.ts';
import { Card } from '@/shared/components/ui/card.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';

/** How many rows a wait draws. Three reads as "a list is coming" without implying a length. */
const ROW_KEYS = ['first', 'second', 'third'] as const;

/**
 * The one shape every wait in the app draws.
 *
 * @remarks
 * There used to be two, back to back: a shell skeleton while a panel's chunk
 * loaded, then a second, differently-shaped skeleton inside the panel while its
 * query resolved — each with its own line of text that advanced through
 * "Loading…", "Still working…", "Almost there…". One click produced up to four
 * visual states before any content. Sharing one component means the handoff
 * from shell to panel swaps identical markup, so a click reads as a single
 * skeleton that is replaced by content.
 *
 * The announcement is **`sr-only` and says one thing**. `Skeleton` is
 * decorative, so without a live region a screen reader is told nothing at all
 * while a surface loads — but the visible copy was the churn, not the
 * information, and the section header above already names what is loading.
 *
 * It still NAMES what is loading when the caller knows: a sighted user reads
 * the section header, and a screen-reader user should not have to settle for a
 * bare "Loading…" when the panel can say which one.
 *
 * **The shape approximates the content it becomes.** Three bare bars were not
 * wrong so much as unrecognisable: the card, the dividers and the row rhythm
 * are what a settings panel actually looks like, so the swap to real content
 * reads as filling in rather than replacing (the property SET-22 was protecting).
 *
 * @param props - `name` is what is being fetched ("Members", "Billing");
 *   `testId` overrides the default for a caller whose tests already assert on
 *   its own id; `className` tunes spacing at the call site.
 */
export function PanelSkeleton({
  name,
  testId,
  className,
}: {
  name?: string;
  testId?: string;
  className?: string;
}) {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      data-testid={testId ?? 'panel-skeleton'}
    >
      <output aria-live="polite" className="sr-only">
        {name ? t(LOCALE_KEYS.loadingNamed, { name }) : `${t(LOCALE_KEYS.loading)}…`}
      </output>
      <Card className="gap-0 overflow-hidden py-0" aria-hidden="true">
        <ul className="divide-border divide-y">
          {ROW_KEYS.map((row) => (
            <li key={row} className="flex items-center gap-3 p-3">
              <Skeleton className="size-5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40 max-w-[60%]" />
                <Skeleton className="h-3 w-64 max-w-[85%]" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
