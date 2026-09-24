import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { recoverInitialLocale } = vi.hoisted(() => ({
  recoverInitialLocale: vi.fn(),
}));

vi.mock('@/shared/store/useLocaleStore/index.ts', async () => {
  const { create } = await import('zustand');
  return {
    useLocaleStore: create(() => ({ isLocaleReady: false, recoverInitialLocale })),
  };
});

import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

import { I18nProvider } from './I18nProvider.tsx';

function Child() {
  const { t } = useTranslation();
  return (
    <input aria-label="Draft" defaultValue={typeof t === 'function' ? 'draft' : ''} />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  useLocaleStore.setState({ isLocaleReady: false });
  recoverInitialLocale.mockImplementation(async () => {
    useLocaleStore.setState({ isLocaleReady: true });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('I18nProvider', () => {
  it('renders immediately when translations are ready', () => {
    useLocaleStore.setState({ isLocaleReady: true });
    render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('draft');
  });

  it('keeps a nonblank pending UI until translation readiness, not storage hydration', () => {
    const { container } = render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
    act(() => useLocaleStore.setState({ locale: 'es' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    act(() => useLocaleStore.setState({ isLocaleReady: true }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('recovers at the deadline and waits for the bundled locale to be applied', async () => {
    let finish!: () => void;
    recoverInitialLocale.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            useLocaleStore.setState({ isLocaleReady: true });
            resolve();
          };
        }),
    );
    render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(recoverInitialLocale).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(recoverInitialLocale).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => {
      finish();
    });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('cancels recovery after successful readiness', async () => {
    render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    act(() => useLocaleStore.setState({ isLocaleReady: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(recoverInitialLocale).not.toHaveBeenCalled();
  });

  it('cleans up the startup deadline on unmount', async () => {
    const { unmount } = render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(recoverInitialLocale).not.toHaveBeenCalled();
  });

  it('preserves the mounted UI and draft during interactive locale changes', () => {
    useLocaleStore.setState({ isLocaleReady: true });
    render(
      <I18nProvider>
        <Child />
      </I18nProvider>,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'unsaved work' } });
    act(() => useLocaleStore.setState({ locale: 'fr' }));
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('unsaved work');
  });
});
