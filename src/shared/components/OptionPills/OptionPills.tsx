import { appearanceChoiceClassName } from '@/lib/appearance-surface.ts';
import { cn } from '@/lib/utils.ts';

/** Compact label above a prefs control (shared by locale preference cards). */
export function FieldLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium">{children}</p>;
}

/**
 * Exclusive option pills — fieldset + `aria-pressed` buttons for preference
 * catalogs (date format, hour cycle, number style, text direction, …).
 */
export function OptionPills<T extends string>({
  ariaLabel,
  value,
  options,
  labelFor,
  onPick,
  testPrefix,
}: {
  ariaLabel: string;
  value: T;
  options: readonly T[];
  labelFor: (id: T) => string;
  onPick: (id: T) => void;
  testPrefix: string;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{ariaLabel}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              data-slot="button"
              aria-pressed={active}
              onClick={() => onPick(id)}
              data-testid={`${testPrefix}-${id}`}
              className={cn(
                appearanceChoiceClassName,
                'min-w-0 flex-1 text-center text-xs sm:flex-none',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50',
              )}
            >
              {labelFor(id)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
