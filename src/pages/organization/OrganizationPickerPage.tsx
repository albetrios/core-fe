import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { organizationDashboard } from '@/lib/routes/index.ts';
import { AUTH_KEYS, AUTH_NS } from '@/shared/auth/auth-shell.constants.ts';
import { CreateOrganizationDialog } from '@/shared/components/CreateOrganizationDialog/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { AlertCircle, Building, ChevronRight, Plus } from '@/shared/icons/index.ts';
import {
  type MyOrganizationSummary,
  useMyOrganizationSummaries,
} from '@/shared/tenancy/my-organization-summaries.ts';

/**
 * The organization list. Split out so the boundary below wraps a real unit: a
 * throw in a row (a malformed slug, a missing field) takes the list, not the
 * page — and the `Create organization` action underneath stays reachable, which
 * matters because this screen is where the resolver sends a user who has
 * nowhere else to land.
 */
function OrganizationList() {
  const { t } = useTranslation(AUTH_NS);
  /*
   * The same list, under the same cache key, that the guard chain, the switcher
   * and the dashboard read. The guard that sent the user here already resolved
   * it, so the FIRST paint shows the real list instead of flashing two skeletons
   * for the length of a cached response (PICK-2). The hook raises no toast; this
   * list renders its own error card with a retry.
   */
  const { data, isLoading, isError, refetch } = useMyOrganizationSummaries();
  // A personal organization has no slug, so it has no row to link to.
  const organizations = (data ?? []).filter(
    (org): org is MyOrganizationSummary & { slug: string } => org.slug !== null,
  );

  const isEmpty = !(isLoading || isError) && organizations.length === 0;

  return (
    <>
      {isLoading && (
        <>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </>
      )}

      {isError && (
        <Card data-testid="organization-picker-error">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertCircle className="text-destructive h-6 w-6" />
            <p className="text-muted-foreground text-sm">
              {t(AUTH_KEYS.organizationPicker.loadError)}
            </p>
            {/*
              No `disabled`/spinner here on purpose. Retrying resets the query to
              pending, so this whole card unmounts and the skeletons below take
              its place — the feedback PICK-1 asked for, and a button that is
              gone cannot be spammed. A disabled state would never be rendered.
            */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              data-testid="organization-picker-retry"
            >
              {t(AUTH_KEYS.common.tryAgain)}
            </Button>
          </CardContent>
        </Card>
      )}

      {isEmpty && (
        <Card data-testid="organization-picker-empty">
          <CardContent className="text-muted-foreground p-6 text-center text-sm">
            {t(AUTH_KEYS.organizationPicker.empty)}
          </CardContent>
        </Card>
      )}

      {!(isLoading || isError) &&
        organizations.map((organization) => (
          <Link
            key={organization.id}
            {...organizationDashboard(organization.slug)}
            className="block"
            data-testid={`organization-picker-option-${organization.slug}`}
          >
            <Card className="hover:bg-muted/50 hover:border-primary/30 cursor-pointer py-0 transition-colors">
              <CardContent className="flex items-center gap-3 p-4">
                <div
                  data-slot="icon-chip"
                  className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center"
                >
                  <Building className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 text-start">
                  <p className="truncate text-sm font-medium">{organization.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {organization.slug}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
    </>
  );
}

/**
 * Organization picker — choose which organization to enter. Selecting one
 * navigates to its dashboard; the organization guard syncs context from the
 * URL and persists the choice for the `/` resolver.
 */
export function OrganizationPickerPage() {
  const { t } = useTranslation(AUTH_NS);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <main
      className="bg-background flex min-h-screen items-center justify-center p-6"
      data-testid="organization-page"
    >
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {t(AUTH_KEYS.organizationPicker.heading)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(AUTH_KEYS.organizationPicker.subheading)}
          </p>
        </header>

        <div className="space-y-2">
          <SectionErrorBoundary
            title={t(AUTH_KEYS.organizationPicker.listTitle)}
            testId="organization-picker-list-error"
          >
            <OrganizationList />
          </SectionErrorBoundary>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => setCreateOpen(true)}
          data-testid="organization-picker-create"
        >
          <Plus className="me-2 h-4 w-4" />
          {t(AUTH_KEYS.organizationPicker.create)}
        </Button>
      </div>

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
