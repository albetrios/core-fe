import { onceAsync } from '@/lib/lazy-module.ts';

/** Share one retryable panel import between idle prefetch and the visible dialog. */
export const loadAppearancePanel = onceAsync(() =>
  import('./AppearancePanel.tsx').then((m) => ({ default: m.AppearancePanel })),
);
