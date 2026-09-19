import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { dismissAppSplash } from '@/lib/app-splash.ts';

import { FullPageSpinner } from './FullPageSpinner.tsx';

describe('FullPageSpinner', () => {
  it('renders with data-testid="full-page-spinner" when boot splash is gone', () => {
    render(<FullPageSpinner />);
    expect(screen.getByTestId('full-page-spinner')).toBeInTheDocument();
  });

  it('renders nothing while the HTML boot splash is still active', () => {
    const splash = document.createElement('div');
    splash.id = 'app-splash';
    document.body.prepend(splash);

    render(<FullPageSpinner />);
    expect(screen.queryByTestId('full-page-spinner')).not.toBeInTheDocument();

    splash.remove();
    window.dispatchEvent(new CustomEvent('app-splash-dismissed'));
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<FullPageSpinner />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // Regression: the splash used to ease out at React's first paint while this
  // component was still mounted, so bootstrap showed the same loader twice —
  // fade to nothing, then an identical one popping back in a frame later.
  describe('boot splash handoff', () => {
    function mountSplash() {
      const splash = document.createElement('div');
      splash.id = 'app-splash';
      document.body.prepend(splash);
      return splash;
    }

    afterEach(() => {
      document.getElementById('app-splash')?.remove();
      vi.useRealTimers();
    });

    it('holds the boot splash up for as long as it is mounted', () => {
      vi.useFakeTimers();
      mountSplash();

      const { unmount } = render(<FullPageSpinner />);
      dismissAppSplash();
      vi.advanceTimersByTime(480);

      expect(document.getElementById('app-splash')).not.toBeNull();
      expect(screen.queryByTestId('full-page-spinner')).not.toBeInTheDocument();

      unmount();
    });

    it('releases the splash when it unmounts, so content is revealed once', () => {
      vi.useFakeTimers();
      mountSplash();

      const { unmount } = render(<FullPageSpinner />);
      dismissAppSplash();
      unmount();

      vi.advanceTimersByTime(250);
      vi.advanceTimersByTime(480);

      expect(document.getElementById('app-splash')).toBeNull();
    });
  });
});
