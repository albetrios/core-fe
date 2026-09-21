import { z } from 'zod';

import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';
import { fetchAllPages } from '@/shared/api/fetch-all-pages.ts';

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['active', 'suspended']).optional().default('active'),
  logoUrl: z.string().nullable().optional().default(null),
});

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationStatus = z.infer<typeof organizationSchema>['status'];

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{0,50}$/, 'Lowercase letters, numbers, and hyphens only')
    .optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(100).optional(),
  logoUrl: z.string().nullable().optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

const BASE = API_BASE_PATH;

/** Derive a URL-safe slug from an organization name (lowercase, hyphenated). */
export function deriveOrganizationSlug(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
}

/** Raw wire shape of one organization row (snake_case from core-be). */
const organizationWireRow = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  status: z.string().optional(),
  logo_url: z.string().nullable().optional(),
});
type OrganizationWireRow = z.infer<typeof organizationWireRow>;

function toOrganization(o: OrganizationWireRow): Organization {
  return organizationSchema.parse({
    id: o.id,
    name: o.name,
    slug: o.slug ?? '',
    status: (o.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'active' : 'suspended',
    logoUrl: o.logo_url ?? null,
  });
}

/** Single-object wire mapper for create/update responses. */
function mapOrganizationWire(raw: unknown): Organization {
  return toOrganization(organizationWireRow.parse(raw));
}

export async function listMyOrganizations(): Promise<Organization[]> {
  // `/users/me/organizations`, not `/tenancy/organizations`: the collection root is the admin
  // "every organization" view, and the caller's own list hangs off `/users/me` — the same split as
  // `GET /users` (admin) versus `GET /users/me`. This endpoint is always the caller's own,
  // whatever their role.
  //
  // Follow cursor pagination so a user in >25 orgs sees them all — the backend
  // defaults to 25/page, so a single un-paged fetch silently truncates the
  // org switcher / picker.
  return (
    await fetchAllPages(
      `${BASE}/users/me/organizations`,
      organizationWireRow,
      'organizations',
    )
  ).map(toOrganization);
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<Organization> {
  const payload = createOrganizationSchema.parse(input);
  const requestedSlug = payload.slug?.trim();
  const derivedSlug = requestedSlug?.length
    ? requestedSlug
    : deriveOrganizationSlug(payload.name);
  const slug = derivedSlug.length ? derivedSlug : 'org';
  const res = await apiClient.post<unknown>(`${BASE}/tenancy/organizations`, {
    name: payload.name,
    slug,
  });
  return mapOrganizationWire(res.data);
}

export async function updateOrganization(
  _organizationId: string,
  input: UpdateOrganizationInput,
): Promise<Organization> {
  const payload = updateOrganizationSchema.parse(input);
  const res = await apiClient.patch<unknown>(`${BASE}/tenancy/organization`, {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
  });
  return mapOrganizationWire(res.data);
}
