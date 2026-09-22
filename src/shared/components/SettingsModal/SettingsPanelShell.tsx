interface SectionHeaderProps {
  title: string;
  description?: string;
  /** Optional breadcrumb above the title (e.g. "Organization · Members"). */
  breadcrumb?: string;
  /** Optional right-aligned meta (e.g., "Profile 80% complete"). */
  meta?: string;
}

/**
 * Visual header for every right-pane section in the Settings dialog.
 */
export function SectionHeader({
  title,
  description,
  breadcrumb,
  meta,
}: SectionHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4 border-b pb-4">
      <div className="space-y-1">
        {breadcrumb ? (
          /*
            `sm:` and up only. Below that the section picker sits directly above
            this header and already names the section, so a phone spent three of
            its first 120 vertical pixels saying "Profile" three times — picker,
            breadcrumb, title. The picker is the one that can also CHANGE the
            section, so it is the one that stays.
          */
          <p className="text-muted-foreground hidden text-xs font-medium tracking-wide sm:block">
            {breadcrumb}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {meta ? (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {meta}
        </span>
      ) : null}
    </header>
  );
}
