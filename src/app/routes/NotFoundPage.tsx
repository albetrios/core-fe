import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { composePageTitle } from '@/lib/routes/page-head.ts';
import { Button } from '@/shared/components/ui/button.tsx';

export function Component() {
  const { t } = useTranslation(ERRORS_NS);
  // Set the title here, not only on the `$` route's head: notFound() thrown
  // from a beforeLoad guard renders via rootRoute.notFoundComponent, where
  // no route head applies — without this the previous page's title sticks
  // (and the RouteAnnouncer would announce that stale title).
  useEffect(() => {
    document.title = composePageTitle('Page not found');
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center sm:p-8"
      data-testid="not-found-page"
    >
      <h1 className="text-foreground text-5xl font-bold sm:text-6xl">404</h1>
      <p className="text-muted-foreground max-w-md text-base sm:text-lg">
        {t(ERRORS_KEYS.route.notFound)}
      </p>
      <Button asChild className="mt-4">
        <Link to="/">{t(ERRORS_KEYS.route.goHome)}</Link>
      </Button>
    </div>
  );
}
