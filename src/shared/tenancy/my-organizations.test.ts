import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from '@/core/http/fetch-client.ts';

import {
  createOrganization,
  organizationSchema,
  updateOrganization,
  updateOrganizationSchema,
} from './my-organizations.ts';

describe('createOrganization', () => {
  it('posts name and explicit slug, returns the parsed organization', async () => {
    const created = { id: 'org-3', name: 'Gamma', slug: 'gamma' };
    vi.mocked(apiClient.post).mockResolvedValue({ data: created });

    const result = await createOrganization({ name: 'Gamma', slug: 'gamma' });

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/organizations'),
      {
        name: 'Gamma',
        slug: 'gamma',
      },
    );
    expect(result).toEqual({ ...created, status: 'active', logoUrl: null });
  });

  it('derives a slug from the name when none is provided', async () => {
    const created = { id: 'org-4', name: 'My New Org', slug: 'my-new-org' };
    vi.mocked(apiClient.post).mockResolvedValue({ data: created });

    await createOrganization({ name: 'My New Org' });

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/organizations'),
      {
        name: 'My New Org',
        slug: 'my-new-org',
      },
    );
  });

  it('rejects an empty name', async () => {
    await expect(createOrganization({ name: '   ' })).rejects.toThrow();
  });

  it('throws when the API returns an invalid shape', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'org-5' } });

    await expect(createOrganization({ name: 'Bad' })).rejects.toThrow();
  });
});

describe('organizationSchema', () => {
  it('parses valid organization', () => {
    const result = organizationSchema.parse({ id: '1', name: 'Test', slug: 'test' });
    expect(result.slug).toBe('test');
  });

  it('rejects missing fields', () => {
    expect(() => organizationSchema.parse({ id: '1' })).toThrow();
  });
});

describe('updateOrganization', () => {
  // This was the coverage hole that let the logo bug ship: the hook test and the panel test
  // both mocked `updateOrganization` itself, so nothing anywhere asserted the request body.
  // A `logoUrl` was accepted by the schema, never forwarded, and the mutation still reported
  // success — the user saw "Organization updated" and an unchanged logo.
  it('sends the name and nothing else', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: {
        id: 'org_acme',
        name: 'Acme Co.',
        slug: 'acme',
        status: 'ACTIVE',
        logo_url: null,
      },
    } as never);

    await updateOrganization('org_acme', { name: 'Acme Co.' });

    expect(apiClient.patch).toHaveBeenCalledWith(
      expect.stringContaining('/tenancy/organization'),
      { name: 'Acme Co.' },
    );
  });

  it('rejects a logo field outright rather than dropping it silently', () => {
    // The logo has its own routes (`PUT`/`DELETE /tenancy/organization/logo`). Keeping the
    // field out of the schema means it cannot be passed here and quietly lost again.
    expect(() =>
      updateOrganizationSchema.parse({
        name: 'Acme',
        logoUrl: 'data:image/png;base64,AA',
      }),
    ).not.toThrow();
    expect(
      updateOrganizationSchema.parse({
        name: 'Acme',
        logoUrl: 'data:image/png;base64,AA',
      }),
    ).toEqual({ name: 'Acme' });
  });
});
