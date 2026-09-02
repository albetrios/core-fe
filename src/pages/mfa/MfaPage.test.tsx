import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { MfaPage } from './MfaPage.tsx';

const { mfaFormMock } = vi.hoisted(() => ({ mfaFormMock: vi.fn() }));
// Only the form is swapped, so a render crash can be injected behind the page
// boundary without touching the shell that is supposed to survive it.
vi.mock('./forms/MfaForm/index.ts', () => ({
  MfaForm: () => mfaFormMock() as unknown,
}));

describe('MfaPage', () => {
  beforeEach(() => {
    mfaFormMock.mockReturnValue(<div data-testid="mfa-form">form</div>);
  });

  it('renders the page container', async () => {
    renderWithProviders(<MfaPage />);
    expect(await screen.findByTestId('mfa-page')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-form')).toBeInTheDocument();
  });

  describe('when the form throws', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    it('contains the crash to the form and keeps the page shell mounted', async () => {
      mfaFormMock.mockImplementation(() => {
        throw new Error('mfa form exploded');
      });

      renderWithProviders(<MfaPage />);

      // The contained fallback renders...
      expect(await screen.findByTestId('mfa-form-boundary-error')).toBeInTheDocument();
      // ...and the page shell around it is still mounted, so the throw never
      // reaches the route boundary and blanks the auth screen.
      expect(screen.getByTestId('mfa-page')).toBeInTheDocument();
    });
  });
});
