import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  deleteMock: vi.fn(),
}));
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: getMock, delete: deleteMock },
}));

import { listSessions, revokeSession } from './sessions-api.ts';

const WIRE = {
  id: 'ses_x',
  device: 'Mac',
  browser: 'Chrome',
  ip_address: '203.0.113.7',
  user_agent: 'Mozilla/5.0',
  last_active_at: '2026-06-24T00:00:00.000Z',
  is_current: true,
};

beforeEach(() => {
  getMock.mockReset();
  deleteMock.mockReset();
});

describe('sessions-api', () => {
  it('lists and maps wire → domain', async () => {
    getMock.mockResolvedValue({ data: [WIRE] });
    const res = await listSessions();
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining('/auth/me/sessions'));
    expect(res).toEqual([
      {
        id: 'ses_x',
        device: 'Mac',
        browser: 'Chrome',
        ipAddress: '203.0.113.7',
        lastActiveAt: '2026-06-24T00:00:00.000Z',
        current: true,
      },
    ]);
  });

  // core-be types `device` / `browser` as `string | null` — `parseUserAgent`
  // returns null for any agent outside its seven device and five browser
  // matchers (a mobile app, an API client, curl, a headless run, or no
  // User-Agent at all). `parseListTolerant` DROPS a row the schema rejects, so
  // a schema that demanded strings made those sessions invisible in Settings →
  // Sessions, and therefore impossible to sign out.
  it('keeps a session whose user agent core-be could not parse', async () => {
    getMock.mockResolvedValue({
      data: [{ ...WIRE, id: 'ses_cli', device: null, browser: null, user_agent: null }],
    });
    const res = await listSessions();
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 'ses_cli', device: null, browser: null });
  });

  it('revokes via DELETE', async () => {
    deleteMock.mockResolvedValue({ data: null });
    await revokeSession('ses_x');
    expect(deleteMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me/sessions/ses_x'),
    );
  });
});
