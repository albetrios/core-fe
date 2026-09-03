import { useTranslation } from 'react-i18next';

import { SkeletonShimmer } from '@/lib/animations/Skeleton.tsx';
import { iconChipClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import {
  DASHBOARD_KEYS,
  DASHBOARD_NS,
  DASHBOARD_TEST_IDS,
  MEMBER_STATUS_META,
} from '@/shared/components/Dashboard/dashboard.constants.ts';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar.tsx';
import { Badge } from '@/shared/components/ui/badge.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';
import { useMembers } from '@/shared/hooks/useMembers/index.ts';
import { Users } from '@/shared/icons/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function MembersSkeleton() {
  return (
    <div className="space-y-3" data-testid="dashboard-members-loading">
      <SkeletonShimmer className="h-10 w-full rounded-md" />
      <SkeletonShimmer className="h-10 w-full rounded-md" />
      <SkeletonShimmer className="h-10 w-full rounded-md" />
    </div>
  );
}

/**
 * Team-member roster — who's in the active workspace, their role, status, and
 * join date, from the real memberships list (`useMembers` → cursor-paginated
 * `GET /organizations/memberships`). The dashboard renders it only for team
 * organizations whose viewer holds `membership:read`. Doubles as a theme-axis
 * testbed: borders/density on rows, radius on the card + avatars + badges, and
 * the join date rendered through the user's locale format.
 */
export function MembersTable() {
  const { t } = useTranslation(DASHBOARD_NS);
  const { formatDate } = useLocaleFormat();
  const { rows, isPending, isError } = useMembers();
  /*
   * `useMembers` passes `enabled: Boolean(orgId)`, and in TanStack Query v5 a
   * DISABLED query reports `status: 'pending'` forever — it is idle, not
   * loading. Gating the skeleton on `isPending` alone therefore left three
   * shimmering rows on screen indefinitely whenever there was no active org
   * (mid org-switch, or a store-sync gap): no data, no empty state, no error
   * (DASH-1). Reading the same store field the hook gates on tells the two
   * apart without touching the shared hook.
   */
  const hasActiveOrg = Boolean(useOrganizationStore((state) => state.organizationId));
  const isLoading = isPending && hasActiveOrg;
  const isIdle = !hasActiveOrg;
  const isEmpty = !(isLoading || isIdle || isError) && rows.length === 0;
  const showTable = !(isLoading || isIdle || isError || isEmpty);

  return (
    <Card data-testid={DASHBOARD_TEST_IDS.membersTable}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            data-slot="icon-chip"
            className={cn('bg-primary/10 text-primary size-9', iconChipClassName)}
            aria-hidden="true"
          >
            <Users className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              {t(DASHBOARD_KEYS.members.heading)}
            </CardTitle>
            {showTable ? (
              <CardDescription>
                {t(DASHBOARD_KEYS.members.description, { count: rows.length })}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <MembersSkeleton /> : null}
        {isIdle ? (
          <p
            className="text-muted-foreground py-6 text-center text-sm"
            data-testid="dashboard-members-no-workspace"
          >
            {t(DASHBOARD_KEYS.members.noWorkspace)}
          </p>
        ) : null}
        {isEmpty ? (
          <p
            className="text-muted-foreground py-6 text-center text-sm"
            data-testid="dashboard-members-empty"
          >
            {t(DASHBOARD_KEYS.members.empty)}
          </p>
        ) : null}
        {isError ? (
          <p className="text-muted-foreground text-sm" role="alert">
            {t(DASHBOARD_KEYS.members.error)}
          </p>
        ) : null}
        {showTable ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(DASHBOARD_KEYS.members.columnMember)}</TableHead>
                <TableHead>{t(DASHBOARD_KEYS.members.columnRole)}</TableHead>
                <TableHead>{t(DASHBOARD_KEYS.members.columnStatus)}</TableHead>
                <TableHead className="text-end">
                  {t(DASHBOARD_KEYS.members.columnJoined)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((member) => {
                const status = MEMBER_STATUS_META[member.status];
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback>{initials(member.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{member.name}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {member.role}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{t(status.key)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-end tabular-nums">
                      {member.joinedAt ? formatDate(member.joinedAt) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
