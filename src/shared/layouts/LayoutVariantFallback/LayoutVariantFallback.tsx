/** Lightweight suspense fallback while a layout variant chunk loads. */
export function LayoutVariantFallback() {
  return (
    <div
      data-testid="layout-variant-fallback"
      className="bg-background text-muted-foreground flex min-h-24 items-center justify-center text-sm"
      aria-busy="true"
    >
      Loading…
    </div>
  );
}
