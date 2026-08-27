import { describe, expect, it } from 'vitest';

import { parseOAuthProviderParam, parseOrganizationSlugParam } from './params.ts';

describe('parseOrganizationSlugParam', () => {
  it('accepts well-formed team slugs', () => {
    expect(parseOrganizationSlugParam('acme')).toBe('acme');
    expect(parseOrganizationSlugParam('globex-corp')).toBe('globex-corp');
    expect(parseOrganizationSlugParam('a1')).toBe('a1');
    expect(parseOrganizationSlugParam('x')).toBe('x');
  });

  it.each([
    '', // empty
    '-acme', // leading hyphen
    'acme-', // trailing hyphen
    'Acme', // uppercase
    'acme_inc', // underscore
    'acme corp', // space
    'org_acme', // an id is not a slug
    'acme/../etc', // path traversal
    `${'a'.repeat(65)}`, // too long
  ])('rejects %j with null (guard turns this into a 404)', (raw) => {
    expect(parseOrganizationSlugParam(raw)).toBeNull();
  });
});

describe('parseOAuthProviderParam', () => {
  it('accepts well-formed provider slugs', () => {
    expect(parseOAuthProviderParam('google')).toBe('google');
    expect(parseOAuthProviderParam('github')).toBe('github');
    expect(parseOAuthProviderParam('my-provider2')).toBe('my-provider2');
  });

  it.each([
    '', // empty
    'Google', // uppercase
    '1google', // leading digit
    'goo gle', // space
    'google_x', // underscore
    'google/../etc', // path traversal
    `${'a'.repeat(33)}`, // too long
  ])('rejects %j with null (guard turns this into a 404)', (raw) => {
    expect(parseOAuthProviderParam(raw)).toBeNull();
  });
});
