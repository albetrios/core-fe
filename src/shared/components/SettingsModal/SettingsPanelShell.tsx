interface SectionHeaderProps {
  title: string;
  description?: string;
  /** Optional right-aligned meta (e.g., "Profile 80% complete"). */
  meta?: string;
}

/**
 * Visual header for every right-pane section in the Settings dialog.
 */
export function SectionHeader({ title, description, meta }: SectionHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4 border-b pb-4">
      <div className="space-y-1">
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
