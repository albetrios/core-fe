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
  listMyOrganizations,
  organizationSchema,
  updateOrganization,
  updateOrganizationSchema,
} from './my-organizations.ts';

describe('listMyOrganizations', () => {
  it('returns parsed organizations from API response', async () => {
    const mockData = [
      { id: 'org-1', name: 'Acme', slug: 'acme', logo_url: 'https://cdn.test/acme.png' },
      { id: 'org-2', name: 'Beta', slug: 'beta' },
    ];
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockData });

    const result = await listMyOrganizations();
    expect(result).toHaveLength(2);
    // snake_case logo_url maps to logoUrl; absent → null (FE-33).
    expect(result[0]).toEqual({
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      status: 'active',
      logoUrl: 'https://cdn.test/acme.png',
    });
    expect(result[1]?.logoUrl).toBeNull();
  });

  it('returns empty array when API returns non-array', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null });

    const result = await listMyOrganizations();
    expect(result).toEqual([]);
  });

  it('drops an invalid org row instead of failing the whole list (tolerant)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        { id: 'org-1', name: 'Acme', slug: 'acme' },
        { id: 'org-bad' }, // missing name + slug → dropped, not fatal
      ],
    });

    const result = await listMyOrganizations();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('org-1');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('follows cursor pagination so a user in >25 orgs sees them all (no truncation)', async () => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: [{ id: 'org-1', name: 'A', slug: 'a' }],
        meta: { pagination: { has_more: true, next: 'cur1' } },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'org-2', name: 'B', slug: 'b' }],
        meta: { pagination: { has_more: false, next: null } },
      });

    const result = await listMyOrganizations();

    expect(result.map((o) => o.id)).toEqual(['org-1', 'org-2']);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiClient.get).mock.calls[0]?.[0]).toContain('limit=100');
    expect(vi.mocked(apiClient.get).mock.calls[1]?.[0]).toContain('after=cur1');
  });
});

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
