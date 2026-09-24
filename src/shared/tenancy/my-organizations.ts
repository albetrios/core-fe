import { z } from 'zod';

import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['active', 'suspended']).optional().default('active'),
  logoUrl: z.string().nullable().optional().default(null),
});

export type Organization = z.infer<typeof organizationSchema>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(100),
  // Length and charset are separate rules on purpose: one regex covering both
  // answered a 60-character all-lowercase slug with "Lowercase letters,
  // numbers, and hyphens only", which is not what was wrong with it. That
  // misdirection was invisible while the field rendered no message at all.
  slug: z
    .string()
    .trim()
    .max(50, 'Workspace URL cannot be longer than 50 characters')
    .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers, and hyphens only')
    .optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/**
 * Rename-only. The logo is NOT settable here: `updateOrganization` forwards `name` and
 * nothing else, so a `logoUrl` accepted by this schema was silently dropped and the caller
 * still got a success. The logo goes through `useOrganizationLogo` and core-be's own
 * `PUT`/`DELETE /tenancy/organization/logo`; keeping the field out means that mistake cannot
 * be made again.
 */
export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(100).optional(),
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
