import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { authFormMock } = vi.hoisted(() => ({ authFormMock: vi.fn() }));
vi.mock('@/shared/forms/AuthForm/index.ts', () => ({
  AuthForm: () => authFormMock(),
}));

import { LoginPage } from './LoginPage.tsx';

describe('LoginPage', () => {
  beforeEach(() => {
    authFormMock.mockReset();
    authFormMock.mockImplementation(() => <div data-testid="auth-form" />);
  });

  it('renders the page container and unified auth form', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-form')).toBeInTheDocument();
  });

  describe('when the auth form throws', () => {
    // The boundary logs through react-error-boundary; React also logs the caught
    // error. Silence both so the failure path does not spam the suite output.
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    it('contains the failure to the form and keeps the page shell mounted', async () => {
      authFormMock.mockImplementation(() => {
        throw new Error('auth form exploded');
      });

      renderWithProviders(<LoginPage />);

      // The crash is caught here, not escalated to the route boundary, so the
      // page container (and the auth layout around it) survives.
      expect(await screen.findByTestId('login-form-error')).toBeInTheDocument();
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument();
    });
  });
});
