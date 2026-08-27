import { validateCallbackSearch } from './callback.search.ts';

describe('validateCallbackSearch', () => {
  it('passes through string code, state, and error', () => {
    expect(
      validateCallbackSearch({ code: '4/abc', state: 'st_1', error: 'access_denied' }),
    ).toEqual({ code: '4/abc', state: 'st_1', error: 'access_denied' });
  });

  it('drops non-string values and tolerates empty search', () => {
    expect(validateCallbackSearch({ code: 42, state: ['x'] })).toEqual({
      code: undefined,
      state: undefined,
      error: undefined,
    });
    expect(validateCallbackSearch({})).toEqual({
      code: undefined,
      state: undefined,
      error: undefined,
    });
  });
});
