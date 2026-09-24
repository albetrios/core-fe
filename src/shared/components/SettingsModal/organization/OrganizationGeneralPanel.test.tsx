import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n/i18n.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

/** The panel's copy as the bundle renders it — never the English literal. */
const copy = (key: string, lng = 'en') => i18n.t(key, { ns: SETTINGS_NS, lng });

const { fetchPagesMock, updateMock, uploadLogoMock, removeLogoMock } = vi.hoisted(() => ({
  fetchPagesMock: vi.fn(),
  updateMock: vi.fn(),
  uploadLogoMock: vi.fn(),
  removeLogoMock: vi.fn(),
}));
// The logo goes through core-be's storage flow now (presign → storage → confirm → attach),
// not a `logoUrl` field on the rename PATCH — which the client silently dropped.
vi.mock('@/shared/api/organization-logo-api.ts', () => ({
  uploadOrganizationLogo: uploadLogoMock,
  removeOrganizationLogo: removeLogoMock,
}));
vi.mock('@/shared/tenancy/my-organizations.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, updateOrganization: updateMock };
});
// Only the paginated fetch is stubbed: the list goes through the same fetcher
// and cache the switcher reads.
vi.mock('@/shared/api/fetch-all-pages.ts', () => ({ fetchAllPages: fetchPagesMock }));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

import { OrganizationGeneralPanel } from './OrganizationGeneralPanel.tsx';

const ACME_ID = `org_${'a'.repeat(21)}`;

function orgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACME_ID,
    name: 'Acme Inc.',
    slug: 'acme',
    type: 'TEAM',
    status: 'ACTIVE',
    logo_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setCanManage(value: boolean) {
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.test', role: 'user' },
    isAuthenticated: true,
  });
  useOrganizationStore.setState({
    organizationId: ACME_ID,
    organizationType: value ? 'TEAM' : 'PERSONAL',
    // `PATCH /tenancy/organization` and the logo routes enforce `organization:update`.
    permissions: value ? ['organization:update'] : [],
    permissionsResolved: true,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  fetchPagesMock.mockResolvedValue([orgRow()]);
  updateMock.mockResolvedValue({
    id: ACME_ID,
    name: 'Acme Co.',
    slug: 'acme',
    status: 'active',
  });
  setCanManage(true);
});

describe('OrganizationGeneralPanel', () => {
  it('renders the org name + read-only slug', async () => {
    renderWithProviders(<OrganizationGeneralPanel />);
    expect(await screen.findByTestId('settings-section-org-general')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('org-name')).toHaveValue('Acme Inc.'));
    expect(screen.getByTestId('org-slug')).toHaveValue('acme');
  });

  it('saves a renamed organization', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);
    await waitFor(() => expect(screen.getByTestId('org-name')).toHaveValue('Acme Inc.'));
    const input = screen.getByTestId('org-name');
    await user.clear(input);
    await user.type(input, 'Acme Co.');
    await user.click(screen.getByTestId('org-general-save'));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(ACME_ID, { name: 'Acme Co.' }),
    );
  });

  it('disables editing without the manage permission', async () => {
    setCanManage(false);
    renderWithProviders(<OrganizationGeneralPanel />);
    await waitFor(() => expect(screen.getByTestId('org-name')).toBeDisabled());
    expect(screen.queryByTestId('org-general-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('org-logo-upload')).not.toBeInTheDocument();
  });

  it('uploads a logo through the storage flow (FE-33)', async () => {
    uploadLogoMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);
    await screen.findByTestId('org-logo-preview');
    const file = new File(['logo-bytes'], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('org-logo-input'), file);
    await waitFor(() =>
      expect(uploadLogoMock).toHaveBeenCalledWith({ file, organizationId: ACME_ID }),
    );
    // The rename PATCH must not be dragged into a logo change.
    expect(updateMock).not.toHaveBeenCalled();
  });

  // core-be refuses anything outside png/jpeg/webp — SVG included — so the client refuses it
  // first rather than spending a presign round trip to be told no.
  it('refuses a content type core-be would reject, without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);
    await screen.findByTestId('org-logo-preview');
    await user.upload(
      screen.getByTestId('org-logo-input'),
      new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
    );
    expect(uploadLogoMock).not.toHaveBeenCalled();
  });

  it('removes an existing logo (FE-33)', async () => {
    fetchPagesMock.mockResolvedValue([
      orgRow({ logo_url: 'data:image/png;base64,AAAA' }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);
    const remove = await screen.findByTestId('org-logo-remove');
    await user.click(remove);
    await waitFor(() => expect(removeLogoMock).toHaveBeenCalled());
    expect(updateMock).not.toHaveBeenCalled();
  });

  // ── SET-27: the wait is covered end to end ───────────────────────────────

  it('says it is working for the whole upload, not just part of it', async () => {
    // Regression: the busy state used to cover only the request, leaving the FileReader
    // window in front of it looking like nothing had happened. There is no reader any more —
    // the single mutation spans presign, storage write, confirm and attach — so one pending
    // flag now covers the entire wait the user experiences.
    let finishUpload: (() => void) | undefined;
    uploadLogoMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
    );

    setCanManage(true);
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);

    const input = await screen.findByTestId('org-logo-input');
    await user.upload(
      input,
      new File(['x'.repeat(2048)], 'logo.png', { type: 'image/png' }),
    );

    const upload = await screen.findByTestId('org-logo-upload');
    await waitFor(() => expect(upload).toHaveAttribute('aria-busy', 'true'));
    expect(upload).toHaveTextContent(copy(SETTINGS_KEYS.panels.general.uploading));
    expect(upload).toBeDisabled();

    await act(async () => {
      finishUpload?.();
    });
    await waitFor(() => expect(upload).not.toBeDisabled());
  });
});
