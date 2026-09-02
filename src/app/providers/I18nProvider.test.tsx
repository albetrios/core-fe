import { act, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { hasHydrated, onFinishHydration } = vi.hoisted(() => ({
  hasHydrated: vi.fn(),
  onFinishHydration: vi.fn(),
}));

vi.mock('@/shared/store/useLocaleStore/index.ts', () => ({
  useLocaleStore: { persist: { hasHydrated, onFinishHydration } },
}));

import { I18nProvider } from './I18nProvider.tsx';

/** Reads from i18n, so it only renders if the provider is actually above it. */
function Child() {
  const { t } = useTranslation();
  return <p data-testid="child">{typeof t === 'function' ? 'child' : 'no-i18n'}</p>;
}

let finishHydration: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  finishHydration = null;
  hasHydrated.mockReturnValue(false);
  onFinishHydration.mockImplementation((cb: () => void) => {
    finishHydration = cb;
    return () => {
      finishHydration = null;
    };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('I18nProvider', () => {
  it('renders children immediately when the store is already hydrated', () => {
    hasHydrated.mockReturnValue(true);
    render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders children once hydration finishes', () => {
    render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();

    act(() => finishHydration?.());
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  describe('when hydration never completes (X-8)', () => {
    it('falls through to the default locale instead of holding forever', async () => {
      // Synchronous localStorage means this never happens today — which is why
      // it has to be handled. An async or blocked storage adapter would park
      // `hasHydrated` at false, and the boot splash is dismissed after first
      // paint regardless: a white screen with no spinner and no error.
      render(
        <I18nProvider>
          <Child />
        </I18nProvider>,
      );
      expect(screen.queryByTestId('child')).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('shows a loader rather than nothing while it waits', () => {
      // `null` here is what turned a slow hydrate into a bare background.
      const { container } = render(
        <I18nProvider>
          <Child />
        </I18nProvider>,
      );
      expect(container).not.toBeEmptyDOMElement();
    });
  });
});
