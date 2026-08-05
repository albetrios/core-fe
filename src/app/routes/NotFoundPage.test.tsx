import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_TITLE } from '@/lib/routes/page-head.ts';

// Link needs a router context; the page only needs an anchor here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { Component as NotFoundPage } from './NotFoundPage.tsx';

describe('NotFoundPage', () => {
  beforeEach(() => {
    document.title = `Dashboard · ${APP_TITLE}`; // simulate a stale previous title
  });

  it('renders the 404 content with a way home', () => {
    render(<NotFoundPage />);

    expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });

  it('replaces a stale document title (guard-thrown notFound path)', () => {
    render(<NotFoundPage />);

    expect(document.title).toBe(`Page not found · ${APP_TITLE}`);
  });
});
