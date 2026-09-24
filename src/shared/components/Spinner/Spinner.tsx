import { cn } from '@/lib/utils.ts';
import { type IconProps, Loader } from '@/shared/icons/index.ts';

/**
 * Inline loading spinner — the one spinning glyph app code draws.
 *
 * @remarks
 * shadcn's `Spinner` — same name, same props, same `size-4 animate-spin` default — with two
 * deliberate differences:
 *
 * - **The glyph comes from the `@/shared/icons` barrel**, not straight from Lucide, so it follows
 *   the Icon library appearance setting like every other app icon. Vendored `ui/` primitives
 *   cannot import the barrel and stay Lucide by design (docs/reference/theming.md → Icon
 *   library), which is why `Button` and `AlertDialogAction` keep their own `isLoading` spinner.
 * - **It is decorative by default** (`aria-hidden`). Upstream sets `role="status"` with an
 *   English `aria-label`, but every spinner here sits next to text, or inside a control or
 *   region that already reports it is busy (`aria-busy`, an `<output>`) — announcing the glyph
 *   as well would say it twice, and a fixed English label cannot be translated. A spinner with
 *   nothing around it to speak for it belongs inside a translated status region.
 *
 * Size it with a single `size-*` class; `cn()` lets it replace the default.
 */
export function Spinner({ className, ...props }: IconProps) {
  return (
    <Loader aria-hidden className={cn('size-4 animate-spin', className)} {...props} />
  );
}
