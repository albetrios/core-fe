import { beforeEach, describe, expect, it } from 'vitest';

import { popOauthProvider, stashOauthProvider } from './oauth-provider-handoff.ts';

beforeEach(() => {
  sessionStorage.clear();
});

describe('oauth provider hand-off', () => {
  it('round-trips a supported provider across the redirect', () => {
    stashOauthProvider('google');
    expect(popOauthProvider()).toBe('google');
  });

  it('supports every configured provider id', () => {
    for (const provider of ['google', 'github', 'apple']) {
      stashOauthProvider(provider);
      expect(popOauthProvider()).toBe(provider);
    }
  });

  it('returns undefined when nothing was stashed', () => {
    expect(popOauthProvider()).toBeUndefined();
  });

  it('clears on read so a reload cannot replay a stale provider', () => {
    stashOauthProvider('google');
    expect(popOauthProvider()).toBe('google');
    expect(popOauthProvider()).toBeUndefined();
  });

  it('refuses to stash an unknown provider id', () => {
    stashOauthProvider('evil-idp');
    expect(popOauthProvider()).toBeUndefined();
  });

  it('does not return a tampered storage value', () => {
    // A value written by anything other than stashOauthProvider must not reach a URL.
    stashOauthProvider('google');
    const key = Object.keys(sessionStorage).find((candidate) =>
      candidate.includes('oauth-provider'),
    );
    expect(key).toBeDefined();
    sessionStorage.setItem(key as string, '../../evil');
    expect(popOauthProvider()).toBeUndefined();
  });

  it('overwrites a previously stashed provider', () => {
    stashOauthProvider('google');
    stashOauthProvider('github');
    expect(popOauthProvider()).toBe('github');
  });

  it('drops any stashed value when an unsupported provider is stashed afterwards', () => {
    stashOauthProvider('google');
    stashOauthProvider('nope');
    expect(popOauthProvider()).toBeUndefined();
  });
});
