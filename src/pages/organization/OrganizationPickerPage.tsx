import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { organizationDashboard } from '@/lib/routes/index.ts';
import { CreateOrganizationDialog } from '@/shared/components/CreateOrganizationDialog/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { AlertCircle, Building2, ChevronRight, Plus } from '@/shared/icons/index.ts';
import { listMyOrganizations } from '@/shared/tenancy/my-organizations.ts';

/**
 * Organization picker — choose which organization to enter. Selecting one
 * navigates to its dashboard; the organization guard syncs context from the
 * URL and persists the choice for the `/` resolver.
 */
export function OrganizationPickerPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const {
    data: organizations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['organizations'],
    queryFn: listMyOrganizations,
  });

  const isEmpty = !(isLoading || isError) && organizations.length === 0;

  return (
    <main
      className="bg-background flex min-h-screen items-center justify-center p-6"
      data-testid="organization-page"
    >
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Select organization</h1>
          <p className="text-muted-foreground text-sm">
            Choose an organization to continue, or create a new one.
          </p>
        </header>

        <div className="space-y-2">
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
                  We couldn&rsquo;t load your organizations. Check your connection and try
                  again.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                  data-testid="organization-picker-retry"
                >
                  Try again
                </Button>
              </CardContent>
            </Card>
          )}

          {isEmpty && (
            <Card data-testid="organization-picker-empty">
              <CardContent className="text-muted-foreground p-6 text-center text-sm">
                You&rsquo;re not part of any organization yet. Create one below to get
                started.
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
                      <Building2 className="h-5 w-5" />
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
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => setCreateOpen(true)}
          data-testid="organization-picker-create"
        >
          <Plus className="me-2 h-4 w-4" />
          Create organization
        </Button>
      </div>

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
