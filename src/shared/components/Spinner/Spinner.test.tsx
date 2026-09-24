import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { loadIconSet } from '@/shared/icons/icon-registry.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import { Spinner } from './Spinner.tsx';

afterEach(() => {
  useThemeStore.setState({ iconLibrary: 'lucide' });
  useAuthStore.setState({ isAuthenticated: false, isLoading: false });
});

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('Spinner rendered no <svg>');
  return svg;
}

describe('Spinner', () => {
  it('spins at the inline icon size by default', () => {
    const { container } = render(<Spinner />);
    const svg = svgOf(container);
    expect(svg).toHaveClass('animate-spin');
    expect(svg).toHaveClass('size-4');
  });

  // Every call site sits next to text or inside something that already reports it is busy.
  // A spinner that announced itself too would make screen readers say it twice.
  it('is hidden from assistive technology by default', () => {
    const { container } = render(<Spinner />);
    expect(svgOf(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('lets a caller size replace the default rather than fight it', () => {
    const { container } = render(<Spinner className="text-primary size-8" />);
    const svg = svgOf(container);
    expect(svg).toHaveClass('size-8', 'text-primary', 'animate-spin');
    expect(svg).not.toHaveClass('size-4');
  });

  it('passes other props through to the glyph', () => {
    const { getByTestId } = render(<Spinner data-testid="row-spinner" />);
    expect(getByTestId('row-spinner')).toHaveClass('animate-spin');
  });

  // The reason this is not shadcn's vendored spinner: that one imports Lucide directly, so it
  // would ignore the Icon library appearance setting that every other app icon follows.
  it('follows the selected icon library and keeps spinning', async () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    const { container } = render(<Spinner />);
    expect(svgOf(container).getAttribute('class')).toContain('lucide');

    useThemeStore.getState().setIconLibrary('tabler');
    loadIconSet('tabler');
    await waitFor(
      () => {
        expect(svgOf(container).getAttribute('class')).toContain('tabler-icon');
      },
      { timeout: 12_000 },
    );
    expect(svgOf(container)).toHaveClass('animate-spin');
    expect(svgOf(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Spinner />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
