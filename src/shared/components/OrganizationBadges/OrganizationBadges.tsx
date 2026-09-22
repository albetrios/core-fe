import type {
  InvitationStatus,
  MembershipStatus,
  OrgRole,
} from '@/shared/api/organization-contracts.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const ROLE_VARIANT: Record<OrgRole, BadgeVariant> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
  viewer: 'outline',
};

const MEMBER_STATUS_VARIANT: Record<MembershipStatus, BadgeVariant> = {
  active: 'success',
  invited: 'secondary',
  suspended: 'destructive',
};

const INVITATION_STATUS_VARIANT: Record<InvitationStatus, BadgeVariant> = {
  pending: 'secondary',
  accepted: 'success',
  expired: 'outline',
  revoked: 'destructive',
};

/** Badge for an organization role (owner/admin/member/viewer). */
export function RoleBadge({ role }: { role: OrgRole }) {
  const variant = ROLE_VARIANT[role];
  return (
    <Badge variant={variant} className="capitalize">
      {role}
    </Badge>
  );
}

/** Badge for a member's status (active/invited/suspended). */
export function MemberStatusBadge({ status }: { status: MembershipStatus }) {
  const variant = MEMBER_STATUS_VARIANT[status];
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

/** Badge for an invitation status (pending/accepted/expired/revoked). */
export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  const variant = INVITATION_STATUS_VARIANT[status];
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}
