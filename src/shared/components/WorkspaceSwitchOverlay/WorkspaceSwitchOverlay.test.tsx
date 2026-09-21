import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { useWorkspaceSwitchStore } from '@/shared/store/useWorkspaceSwitchStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { WorkspaceSwitchOverlay } from './WorkspaceSwitchOverlay.tsx';

const { prefersReducedMotionMock } = vi.hoisted(() => ({
  prefersReducedMotionMock: vi.fn(() => false),
}));
vi.mock('@/lib/animations/index.ts', () => ({
  prefersReducedMotion: () => prefersReducedMotionMock(),
}));

describe('WorkspaceSwitchOverlay', () => {
  beforeEach(() => {
    prefersReducedMotionMock.mockReturnValue(false);
    useWorkspaceSwitchStore.setState({ switchingTo: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing while no switch is in flight', async () => {
    // Anchored on a marker that DOES render, so "absent" cannot be the router simply not having
    // mounted yet — the failure mode that makes an absence assertion pass for the wrong reason.
    renderWithProviders(
      <>
        <span data-testid="mounted" />
        <WorkspaceSwitchOverlay />
      </>,
    );
    await screen.findByTestId('mounted');
    expect(screen.queryByTestId('workspace-switch-overlay')).not.toBeInTheDocument();
  });

  it('names the workspace being switched to', async () => {
    useWorkspaceSwitchStore.setState({ switchingTo: 'Acme Corp' });
    renderWithProviders(<WorkspaceSwitchOverlay />);

    expect(await screen.findByTestId('workspace-switch-overlay')).toBeInTheDocument();
    // The name is the part that answers "did my click register, and on which one?".
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-switch-message')).toHaveTextContent(
      'Preparing your workspace',
    );
  });

  it('moves to the next line while the switch is still running', async () => {
    // `shouldAdvanceTime` so the interval under test is fake while Testing Library's polling
    // still runs — installing fake timers AFTER mount would leave the real interval in place and
    // advancing them would do nothing.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useWorkspaceSwitchStore.setState({ switchingTo: 'Acme Corp' });
    renderWithProviders(<WorkspaceSwitchOverlay />);
    await screen.findByTestId('workspace-switch-message');

    act(() => {
      vi.advanceTimersByTime(1_600);
    });
    expect(screen.getByTestId('workspace-switch-message')).toHaveTextContent(
      'Loading members and permissions',
    );

    // ...and it settles on the last line rather than cycling, because looping back to
    // "Preparing…" after "Almost ready" reads as a stall.
    act(() => {
      vi.advanceTimersByTime(1_600 * 5);
    });
    expect(screen.getByTestId('workspace-switch-message')).toHaveTextContent(
      'Almost ready',
    );
  });

  it('holds the first line when the user asked for reduced motion', async () => {
    prefersReducedMotionMock.mockReturnValue(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useWorkspaceSwitchStore.setState({ switchingTo: 'Acme Corp' });
    renderWithProviders(<WorkspaceSwitchOverlay />);
    await screen.findByTestId('workspace-switch-message');

    act(() => {
      vi.advanceTimersByTime(1_600 * 4);
    });

    // The rotation is decoration; the workspace name above it already carries the information.
    expect(screen.getByTestId('workspace-switch-message')).toHaveTextContent(
      'Preparing your workspace',
    );
  });

  it('clears on completion and starts the next switch from the first line', async () => {
    // The overlay lives in the app shell and never unmounts, so "the next switch starts over" is
    // not something a remount gives for free — it is the reset this component does when the target
    // changes. A second switch inheriting "Almost ready" from the first would be a lie.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useWorkspaceSwitchStore.setState({ switchingTo: 'Acme Corp' });
    renderWithProviders(<WorkspaceSwitchOverlay />);
    await screen.findByTestId('workspace-switch-message');

    act(() => {
      vi.advanceTimersByTime(1_600 * 3);
    });
    expect(screen.getByTestId('workspace-switch-message')).toHaveTextContent(
      'Almost ready',
    );

    act(() => {
      useWorkspaceSwitchStore.getState().endSwitch();
    });
    expect(screen.queryByTestId('workspace-switch-overlay')).not.toBeInTheDocument();

    act(() => {
      useWorkspaceSwitchStore.getState().beginSwitch('Other Workspace');
    });
    expect(screen.getByText('Other Workspace')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-switch-message')).toHaveTextContent(
      'Preparing your workspace',
    );
  });

  it('announces politely rather than interrupting', async () => {
    useWorkspaceSwitchStore.setState({ switchingTo: 'Acme Corp' });
    const { container } = renderWithProviders(<WorkspaceSwitchOverlay />);

    const overlay = await screen.findByTestId('workspace-switch-overlay');
    // `<output>` carries the status role implicitly and is better supported than a div wearing
    // `role="status"`, so assert the role as assistive tech resolves it rather than the attribute.
    expect(overlay.tagName).toBe('OUTPUT');
    expect(screen.getByRole('status')).toBe(overlay);
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveAttribute('aria-busy', 'true');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
