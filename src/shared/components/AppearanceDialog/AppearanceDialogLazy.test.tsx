import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LazyModule from '@/lib/lazy-module.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { AppearanceDialogLazy } from './AppearanceDialogLazy.tsx';

const transport = vi.hoisted(() => ({
  wait: vi.fn<() => Promise<void>>(),
  reset: [] as Array<() => void>,
}));

// Keep the production cache and React.lazy retry behavior; delay only transport.
vi.mock('@/lib/lazy-module.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof LazyModule>();
  return {
    ...actual,
    onceAsync: function onceAsync<T>(factory: () => Promise<T>) {
      const createLoader = () =>
        actual.onceAsync(async () => {
          await transport.wait();
          return factory();
        });
      let loader = createLoader();
      transport.reset.push(() => {
        loader = createLoader();
      });
      return Object.assign(() => loader(), { peek: () => loader.peek() });
    },
  };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: '/dashboard' } }),
}));
vi.mock('@/lib/chunk-prefetch.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAuthenticatedIdleChunkPrefetch: vi.fn(),
}));
vi.mock('./AppearancePanel.tsx', () => ({
  AppearancePanel: () => <div data-testid="appearance-panel" />,
}));

describe('AppearanceDialogLazy', () => {
  beforeEach(() => {
    transport.reset.forEach((reset) => {
      reset();
    });
    transport.wait.mockReset().mockReturnValue(new Promise<void>(() => {}));
    useUIStore.setState({ appearanceOpen: false });
  });
  afterEach(() => {
    act(() => useUIStore.setState({ appearanceOpen: false }));
    vi.restoreAllMocks();
  });

  it('does not mount or request the panel while closed', () => {
    const { container } = render(<AppearanceDialogLazy />);
    expect(container).toBeEmptyDOMElement();
    expect(transport.wait).not.toHaveBeenCalled();
  });

  it('shows live title, description, Shuffle and close while only the body loads', () => {
    useThemeStore.setState({ preset: 'default', customTheme: null });
    useUIStore.setState({ appearanceOpen: true });
    render(<AppearanceDialogLazy />);
    const dialog = screen.getByRole('dialog', { name: 'Appearance' });
    const pending = screen.getByTestId('appearance-dialog-pending');
    const shuffle = screen.getByTestId('theme-shuffle');
    expect(dialog).not.toHaveAttribute('aria-busy');
    expect(screen.getByText(/changes apply live/i)).toBeInTheDocument();
    expect(pending).not.toContainElement(shuffle);
    expect(pending).not.toContainElement(screen.getByTestId('appearance-close'));
    expect(within(pending).getAllByRole('status')).toHaveLength(1);
    expect(within(pending).getByRole('status')).toHaveTextContent('Loading');
    for (const name of [
      'Theme',
      'Mode',
      'Colour',
      'Type & shape',
      'Icons',
      'Dashboard',
      'Surface & motion',
      'Notifications',
    ]) {
      expect(within(pending).getByRole('heading', { name, exact: true })).toBeVisible();
    }
    fireEvent.click(shuffle);
    expect(useThemeStore.getState().preset).toBe('custom');
    fireEvent.click(screen.getByTestId('appearance-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape before the panel resolves', () => {
    useUIStore.setState({ appearanceOpen: true });
    render(<AppearanceDialogLazy />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves the shell when the panel arrives and reopens without a skeleton', async () => {
    const request = deferred();
    transport.wait.mockReturnValue(request.promise);
    useUIStore.setState({ appearanceOpen: true });
    render(<AppearanceDialogLazy />);
    const dialog = screen.getByRole('dialog');
    await act(async () => {
      request.resolve();
    });
    expect(await screen.findByTestId('appearance-panel')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
    fireEvent.click(screen.getByTestId('appearance-close'));
    act(() => useUIStore.setState({ appearanceOpen: true }));
    expect(screen.queryByTestId('appearance-dialog-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('appearance-panel')).toBeInTheDocument();
  });

  it('keeps the header usable on failure and retries just the panel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.wait
      .mockRejectedValueOnce(new Error('Chunk unavailable'))
      .mockResolvedValue(undefined);
    useUIStore.setState({ appearanceOpen: true });
    render(<AppearanceDialogLazy />);
    const dialog = screen.getByRole('dialog');
    expect(await screen.findByTestId('appearance-dialog-error')).toBeInTheDocument();
    expect(screen.getByTestId('theme-shuffle')).toBeEnabled();
    expect(screen.getByTestId('appearance-close')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByTestId('appearance-panel')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(transport.wait).toHaveBeenCalledTimes(2);
  });
});
