import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadCsv, toCsv } from './csv.ts';

describe('toCsv', () => {
  it('joins headers and rows with escaped cells', () => {
    expect(
      toCsv(
        ['name', 'email'],
        [
          ['Ada', 'ada@example.com'],
          ['Grace', 'grace@example.com'],
        ],
      ),
    ).toBe('name,email\nAda,ada@example.com\nGrace,grace@example.com');
  });

  it('stringifies null, numbers, booleans, and objects', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [[null, 42, true, { x: 1 }]])).toBe(
      'a,b,c,d\n,42,true,"{""x"":1}"',
    );
  });

  it('quotes fields containing commas, quotes, or newlines and doubles quotes', () => {
    expect(toCsv(['v'], [['a,b']])).toBe('v\n"a,b"');
    expect(toCsv(['v'], [['say "hi"']])).toBe('v\n"say ""hi"""');
    expect(toCsv(['v'], [['line1\nline2']])).toBe('v\n"line1\nline2"');
  });

  it('neutralizes formula-injection prefixes with a leading apostrophe', () => {
    expect(toCsv(['v'], [['=HYPERLINK("http://evil")']])).toBe(
      'v\n"\'=HYPERLINK(""http://evil"")"',
    );
    expect(toCsv(['v'], [['+1']])).toBe("v\n'+1");
    expect(toCsv(['v'], [['-2']])).toBe("v\n'-2");
    expect(toCsv(['v'], [['@cmd']])).toBe("v\n'@cmd");
    // A plain negative-looking name is still readable text, not a formula.
    expect(toCsv(['v'], [['safe']])).toBe('v\nsafe');
  });
});

describe('downloadCsv', () => {
  const createObjectURL = vi.fn(() => 'blob:csv');
  const revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');

  beforeEach(() => {
    vi.resetAllMocks();
    // After the reset, which puts a spy back on the real method: a real anchor
    // click would try to navigate.
    anchorClick.mockImplementation(() => undefined);
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterAll(() => {
    anchorClick.mockRestore();
  });

  it('creates a blob link, clicks it, and cleans everything up', () => {
    downloadCsv('members.csv', 'a,b\n1,2');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    // The temporary anchor never leaks into the document.
    expect(document.querySelector('a[download="members.csv"]')).toBeNull();
  });
});
