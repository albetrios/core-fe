import { cn } from '@/lib/utils.ts';

/** Shared styles for right-edge floating quick-action handles (theme, language, …). */
export const floatingEdgeButtonClassName = cn(
  'bg-primary text-primary-foreground hover:bg-primary/90',
  'pointer-events-auto flex size-11 items-center justify-center rounded-s-2xl',
  'transition outline-none hover:-translate-x-0.5 rtl:hover:translate-x-0.5 focus-visible:outline-hidden',
);
