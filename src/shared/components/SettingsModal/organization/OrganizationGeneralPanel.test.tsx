import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

const { listMock, updateMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  updateMock: vi.fn(),
}));
vi.mock('@/shared/tenancy/my-organizations.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listMyOrganizations: listMock, updateOrganization: updateMock };
});
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

import { OrganizationGeneralPanel } from './OrganizationGeneralPanel.tsx';

function setCanManage(value: boolean) {
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.test', role: 'user' },
    isAuthenticated: true,
  });
  useOrganizationStore.setState({
    organizationId: 'org_acme',
    organizationType: value ? 'TEAM' : 'PERSONAL',
    permissions: value ? ['membership:manage'] : [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue([
    { id: 'org_acme', name: 'Acme Inc.', slug: 'acme', status: 'active' },
  ]);
  updateMock.mockResolvedValue({
    id: 'org_acme',
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
      expect(updateMock).toHaveBeenCalledWith('org_acme', { name: 'Acme Co.' }),
    );
  });

  it('disables editing without the manage permission', async () => {
    setCanManage(false);
    renderWithProviders(<OrganizationGeneralPanel />);
    await waitFor(() => expect(screen.getByTestId('org-name')).toBeDisabled());
    expect(screen.queryByTestId('org-general-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('org-logo-upload')).not.toBeInTheDocument();
  });

  it('uploads a logo as a data URL (FE-33)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);
    await screen.findByTestId('org-logo-preview');
    const file = new File(['logo-bytes'], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('org-logo-input'), file);
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        'org_acme',
        expect.objectContaining({ logoUrl: expect.stringContaining('data:image/png') }),
      ),
    );
  });

  it('removes an existing logo (FE-33)', async () => {
    listMock.mockResolvedValue([
      {
        id: 'org_acme',
        name: 'Acme Inc.',
        slug: 'acme',
        status: 'active',
        logoUrl: 'data:image/png;base64,AAAA',
      },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);
    const remove = await screen.findByTestId('org-logo-remove');
    await user.click(remove);
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('org_acme', { logoUrl: null }),
    );
  });

  // ── SET-27: reading the file is part of the upload ───────────────────────

  it('says it is working while the file is being read', async () => {
    // Regression: `disabled={update.isPending}` covered the request but not the
    // FileReader window in front of it, so picking a large logo looked like
    // nothing had happened. A controlled reader holds that window open.
    const readerCtl: { finish?: () => void } = {};
    class ControlledFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        readerCtl.finish = () => {
          this.result = 'data:image/png;base64,AAAA';
          this.onload?.();
        };
      }
    }
    vi.stubGlobal('FileReader', ControlledFileReader);

    setCanManage(true);
    const user = userEvent.setup();
    renderWithProviders(<OrganizationGeneralPanel />);

    const input = await screen.findByTestId('org-logo-input');
    await user.upload(
      input,
      new File(['x'.repeat(2048)], 'logo.png', { type: 'image/png' }),
    );

    // Still reading: the button says so, and cannot be pressed again.
    const upload = screen.getByTestId('org-logo-upload');
    expect(upload).toHaveAttribute('aria-busy', 'true');
    expect(upload).toHaveTextContent(/uploading/i);
    expect(upload).toBeDisabled();

    await act(async () => readerCtl.finish?.());
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
