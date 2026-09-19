import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LazyModule from '@/lib/lazy-module.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';

import { CommandPaletteLazy } from './CommandPaletteLazy.tsx';

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
  useNavigate: () => vi.fn(),
}));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: () => ({ data: undefined }),
}));

describe('CommandPaletteLazy', () => {
  beforeEach(() => {
    transport.reset.forEach((reset) => {
      reset();
    });
    transport.wait.mockReset().mockReturnValue(new Promise<void>(() => {}));
    useUIStore.setState({ commandPaletteOpen: false });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    act(() => useUIStore.setState({ commandPaletteOpen: false }));
    vi.restoreAllMocks();
  });

  it('stays absent until opened and toggles with either shortcut', () => {
    render(<CommandPaletteLazy />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'k' });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('textbox')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps search usable, traps Tab and restores trigger focus on Escape while loading', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button
          type="button"
          onClick={() => useUIStore.getState().setCommandPaletteOpen(true)}
        >
          Open
        </button>
        <CommandPaletteLazy />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const input = screen.getByRole('textbox');
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId('command-palette-pending')).not.toContainElement(input);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await user.type(input, 'dark');
    expect(input).toHaveValue('dark');
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('dismisses using the scrim while the list is loading', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPaletteLazy />);
    fireEvent.click(screen.getByRole('dialog').querySelector('[aria-hidden="true"]')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hands typed query, focus and selection to cmdk without replacing the dialog', async () => {
    const request = deferred();
    transport.wait.mockReturnValue(request.promise);
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPaletteLazy />);
    const shell = screen.getByRole('dialog');
    const pendingInput = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(pendingInput, { target: { value: 'dark' } });
    pendingInput.setSelectionRange(1, 3);
    await act(async () => {
      request.resolve();
    });
    const input = await screen.findByRole('combobox');
    expect(input).toHaveValue('dark');
    expect(input).toHaveFocus();
    expect((input as HTMLInputElement).selectionStart).toBe(1);
    expect((input as HTMLInputElement).selectionEnd).toBe(3);
    expect(screen.getByRole('dialog')).toBe(shell);
    expect(screen.queryByTestId('command-palette-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark mode' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => useUIStore.setState({ commandPaletteOpen: true }));
    expect(screen.queryByTestId('command-palette-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('recovers a failed chunk in place and keeps the query for retry', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = deferred();
    transport.wait
      .mockImplementationOnce(async () => {
        await request.promise;
        throw new Error('Chunk unavailable');
      })
      .mockResolvedValue(undefined);
    render(
      <>
        <button
          type="button"
          onClick={() => useUIStore.getState().setCommandPaletteOpen(true)}
        >
          Open
        </button>
        <CommandPaletteLazy />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const shell = screen.getByRole('dialog');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dark' } });
    await act(async () => {
      request.resolve();
    });
    expect(await screen.findByTestId('command-palette-error')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(shell);
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toHaveFocus();
    await user.tab();
    expect(retry).toHaveFocus();
    await user.tab({ shift: true });
    expect(retry).toHaveFocus();
    trigger.focus();
    await user.tab();
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('combobox')).toHaveValue('dark');
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('dialog')).toBe(shell);
    expect(transport.wait).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
