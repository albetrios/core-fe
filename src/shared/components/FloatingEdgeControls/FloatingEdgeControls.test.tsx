import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { platformConfigMock, uiState, buttonMock } = vi.hoisted(() => ({
  platformConfigMock: { themeLock: false },
  uiState: { appearanceOpen: false },
  buttonMock: vi.fn(),
}));

vi.mock('@/core/config/env.ts', () => ({ platformConfig: platformConfigMock }));
vi.mock('@/shared/store/useUIStore/index.ts', () => ({
  useUIStore: (selector: (s: { appearanceOpen: boolean }) => unknown) =>
    selector({ appearanceOpen: uiState.appearanceOpen }),
}));
vi.mock('@/shared/components/FloatingSettingsButton/index.ts', () => ({
  FloatingSettingsButton: () => buttonMock() as unknown,
}));

import { FloatingEdgeControls } from './FloatingEdgeControls.tsx';

describe('FloatingEdgeControls', () => {
  beforeEach(() => {
    platformConfigMock.themeLock = false;
    uiState.appearanceOpen = false;
    buttonMock.mockReturnValue(<div data-testid="floating-settings-stub" />);
  });

  it('renders only the appearance handle', () => {
    render(<FloatingEdgeControls />);
    expect(screen.getByTestId('floating-edge-controls')).toBeInTheDocument();
    expect(screen.getByTestId('floating-settings-stub')).toBeInTheDocument();
  });

  it('hides the handle while the appearance panel is open', () => {
    uiState.appearanceOpen = true;
    render(<FloatingEdgeControls />);
    expect(screen.queryByTestId('floating-edge-controls')).not.toBeInTheDocument();
  });

  it('hides entirely when the theme is locked', () => {
    platformConfigMock.themeLock = true;
    render(<FloatingEdgeControls />);
    expect(screen.queryByTestId('floating-edge-controls')).not.toBeInTheDocument();
  });

  describe('house rule 2 — a decorative handle cannot take the app down', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    it('contains a throw and renders nothing, instead of escalating', () => {
      // Mounted on the ROOT route: without the boundary this throw reaches the
      // app-level boundary and replaces the entire application.
      buttonMock.mockImplementation(() => {
        throw new Error('edge handle exploded');
      });

      expect(() =>
        render(
          <>
            <div data-testid="app-survives" />
            <FloatingEdgeControls />
          </>,
        ),
      ).not.toThrow();

      expect(screen.getByTestId('app-survives')).toBeInTheDocument();
      expect(screen.queryByTestId('floating-edge-controls')).not.toBeInTheDocument();
    });
  });
});
