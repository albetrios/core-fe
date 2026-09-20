import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { AuthLayout, preloadAuthLayoutVariants } from './AuthLayout.tsx';

describe('AuthLayout', () => {
  // Preload lazy shells so Suspense doesn't flake under full-suite contention.
  beforeAll(async () => {
    await preloadAuthLayoutVariants();
  });

  beforeEach(() => {
    // Default to the split variant; the shuffle-driven previews are opt-in below.
    useThemeStore.setState({ authVariant: 0 });
    useLocaleStore.setState({ locale: 'en', textDirection: 'auto' });
  });

  it('renders the layout shell and its children', async () => {
    const { findByTestId, getByText } = renderWithProviders(
      <AuthLayout>
        <div data-testid="child">Form content</div>
      </AuthLayout>,
    );

    expect(
      await findByTestId('auth-layout', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(await findByTestId('auth-form-container')).toBeInTheDocument();
    expect(getByText('Form content')).toBeInTheDocument();
  });

  it('shows the brand value props', async () => {
    const { findByText } = renderWithProviders(
      <AuthLayout>
        <span>child</span>
      </AuthLayout>,
    );

    expect(
      await findByText('The operating system for your organization.'),
    ).toBeInTheDocument();
    expect(await findByText('All systems operational')).toBeInTheDocument();
  });

  it('keeps the split hero growing on big monitors (3xl / 4xl)', async () => {
    // Without the tier the hero stayed a 28rem column pinned to the corner of a
    // 1400px panel on a 2560px monitor.
    const { findByText, findByTestId } = renderWithProviders(
      <AuthLayout>
        <span>child</span>
      </AuthLayout>,
    );

    const headline = await findByText('The operating system for your organization.');
    expect(headline).toHaveClass('xl:text-5xl', '3xl:text-6xl', '4xl:text-7xl');
    expect(headline.closest('.max-w-md')).toHaveClass('3xl:max-w-xl', '4xl:max-w-2xl');
    // The form column widens with it — a 420px form looks lost beside a 7xl hero.
    expect((await findByTestId('auth-form-container')).parentElement).toHaveClass(
      'max-w-[420px]',
      '3xl:max-w-[480px]',
    );
  });

  it('tags the status chip as a pill, so the Sharp shape squares it', async () => {
    const { findByText } = renderWithProviders(
      <AuthLayout>
        <span>child</span>
      </AuthLayout>,
    );

    const chip = (await findByText('All systems operational')).closest('[data-slot]');
    expect(chip).toHaveAttribute('data-slot', 'pill');
    expect(chip).toHaveClass('rounded-full');
  });

  it('renders the spotlight preview variant (1)', async () => {
    useThemeStore.setState({ authVariant: 1 });
    const { findByTestId } = renderWithProviders(
      <AuthLayout>
        <div>child</div>
      </AuthLayout>,
    );
    expect(await findByTestId('auth-layout')).toBeInTheDocument();
    expect(await findByTestId('auth-form-container')).toBeInTheDocument();
  });

  it('renders the minimal preview variant (2)', async () => {
    useThemeStore.setState({ authVariant: 2 });
    const { findByTestId } = renderWithProviders(
      <AuthLayout>
        <div>child</div>
      </AuthLayout>,
    );
    expect(await findByTestId('auth-layout')).toBeInTheDocument();
    expect(await findByTestId('auth-form-container')).toBeInTheDocument();
  });

  it('shows the auth locale select in multi-locale builds', async () => {
    const { findByTestId } = renderWithProviders(
      <AuthLayout>
        <div>child</div>
      </AuthLayout>,
    );
    expect(await findByTestId('auth-layout')).toBeInTheDocument();
    expect(await findByTestId('auth-locale-select')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container, findByTestId } = renderWithProviders(
      <AuthLayout>
        <div>child</div>
      </AuthLayout>,
    );
    await findByTestId('auth-layout');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
