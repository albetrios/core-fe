import {
  popOAuthProvider,
  safeOAuthProvider,
  stashOAuthProvider,
} from './oauth-provider.ts';

beforeEach(() => {
  sessionStorage.clear();
});

describe('safeOAuthProvider', () => {
  it('accepts lowercase kebab slugs', () => {
    expect(safeOAuthProvider('google')).toBe('google');
    expect(safeOAuthProvider('github')).toBe('github');
    expect(safeOAuthProvider('my-provider2')).toBe('my-provider2');
  });

  it('rejects malformed values', () => {
    expect(safeOAuthProvider('Google')).toBeUndefined();
    expect(safeOAuthProvider('goo gle')).toBeUndefined();
    expect(safeOAuthProvider('google/../evil')).toBeUndefined();
    expect(safeOAuthProvider('')).toBeUndefined();
    expect(safeOAuthProvider(42)).toBeUndefined();
    expect(safeOAuthProvider('a'.repeat(40))).toBeUndefined();
  });
});

describe('stashOAuthProvider / popOAuthProvider', () => {
  it('round-trips a provider slug and clears on pop', () => {
    stashOAuthProvider('google');
    expect(popOAuthProvider()).toBe('google');
    expect(popOAuthProvider()).toBeUndefined();
  });

  it('clears any previous stash when handed a malformed value', () => {
    stashOAuthProvider('google');
    stashOAuthProvider('NOT VALID');
    expect(popOAuthProvider()).toBeUndefined();
  });

  it('returns undefined when nothing is stashed', () => {
    expect(popOAuthProvider()).toBeUndefined();
  });
});
