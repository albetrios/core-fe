import { z } from 'zod';

import type { Resource } from './types.ts';

/**
 * Reference member record shape for the L7 resource registry. The live members
 * UI is Settings → Members (`OrganizationMembersPanel`) and the dashboard's
 * members widget, both on `useMembers` (org-scoped hooks); this manifest stays
 * as the canonical CRUD/RBAC reference until a members resource *page* adopts
 * the shared `useList`/`useCreate` hooks.
 */
export const memberSchema = z.object({
  id: z.string(),
  email: z.email(),
  role: z.string(),
  status: z.enum(['active', 'invited', 'suspended']),
});

/** Reference resource manifest for the members CRUD surface (L7 registry). */
export const membersResource: Resource<typeof memberSchema> = {
  name: 'members',
  schema: memberSchema,
  permissions: {
    list: 'membership:read',
    show: 'membership:read',
    create: 'membership:manage',
    update: 'membership:manage',
    delete: 'membership:manage',
  },
  ui: { label: 'Members', icon: 'Users', showInNav: true },
};
