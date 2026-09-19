import { iconChipClassName, iconOnPrimarySurface } from '@/lib/icon-surface.ts';
import { PRODUCT_NAME } from '@/lib/product-identity.ts';
import { cn } from '@/lib/utils.ts';
import { Boxes } from '@/shared/icons/index.ts';

interface BrandLoaderProps {
  className?: string;
}

/**
 * The product's loading visual — a "breathing" brand tile, the wordmark, and an
 * indeterminate bar. NOT a rotating spinner. Reduced motion is honoured globally.
 *
 * This component is **in flow**: it occupies only the space it needs, so it can sit
 * inside a card or panel alongside other controls. {@link FullPageSpinner} is this
 * same visual pinned as a `fixed inset-0` overlay for app bootstrap — use that one
 * only when the loader owns the entire viewport. Anywhere the loader shares a
 * surface with siblings, use this: an overlay there paints over its own neighbours
 * (that is what hid the auth screen's cancel button in LOGIN-1).
 */
export function BrandLoader({ className }: BrandLoaderProps) {
  return (
    <div
      className={cn('flex flex-col items-center gap-6', className)}
      data-testid="brand-loader"
    >
      <div className="flex flex-col items-center gap-4">
        <span
          data-slot="icon-chip"
          className={cn(
            'bg-primary text-primary-foreground animate-boot-breathe size-12',
            iconChipClassName,
          )}
          aria-hidden="true"
        >
          <Boxes className={cn('size-6', iconOnPrimarySurface)} />
        </span>
        <span className="text-foreground text-base font-semibold tracking-tight">
          {PRODUCT_NAME}
        </span>
      </div>
      <span
        className="bg-muted block h-1 w-32 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <span className="bg-primary animate-boot-progress block h-full w-1/2 rounded-full" />
      </span>
    </div>
  );
}
