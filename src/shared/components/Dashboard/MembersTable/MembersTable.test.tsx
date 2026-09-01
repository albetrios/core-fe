import { screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { Member } from '@/shared/api/organization-contracts.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { MembersTable } from './MembersTable.tsx';

const { useMembersMock, orgIdRef } = vi.hoisted(() => ({
  useMembersMock: vi.fn(),
  orgIdRef: { value: 'org_1' as string | null },
}));
vi.mock('@/shared/hooks/useMembers/index.ts', () => ({
  useMembers: useMembersMock,
}));
// The table reads the same store field `useMembers` gates its query on, so it
// can tell "no workspace" (query disabled, permanently pending) from "loading".
vi.mock('@/shared/store/useOrganizationStore/index.ts', () => ({
  useOrganizationStore: (selector: (s: { organizationId: string | null }) => unknown) =>
    selector({ organizationId: orgIdRef.value }),
}));

const MEMBERS: Member[] = [
  {
    id: 'mem_1',
    userId: 'usr_1',
    name: 'Sarah Walker',
    email: 'sarah@studio.test',
    role: 'owner',
    status: 'active',
    joinedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'mem_2',
    userId: 'usr_2',
    name: 'Jo Rivera',
    email: 'jo@studio.test',
    role: 'member',
    status: 'invited',
    joinedAt: '',
  },
];

function listResult(overrides: Partial<ReturnType<typeof baseResult>> = {}) {
  return { ...baseResult(), ...overrides };
}

function baseResult() {
  return {
    rows: MEMBERS,
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

describe('MembersTable', () => {
  beforeEach(() => {
    orgIdRef.value = 'org_1';
  });

  it('renders the REAL roster from useMembers — names, emails, count', async () => {
    // Regression: this table used to render a hardcoded 5-person fixture
    // ("Ava Chen" et al. @acme.test) in every org — a brand-new solo workspace
    // showed five fabricated teammates as if they were live members.
    useMembersMock.mockReturnValue(listResult());
    renderWithProviders(<MembersTable />);

    expect(await screen.findByTestId('dashboard-members-table')).toBeInTheDocument();
    expect(screen.getByText('Sarah Walker')).toBeInTheDocument();
    expect(screen.getByText('sarah@studio.test')).toBeInTheDocument();
    expect(screen.getByText('Jo Rivera')).toBeInTheDocument();
    expect(screen.getByText(/2 people/i)).toBeInTheDocument();
    // A member with no join date renders a placeholder, not "Invalid Date".
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('pluralizes the roster count (a solo org reads "1 person", not "1 people")', async () => {
    useMembersMock.mockReturnValue(listResult({ rows: [MEMBERS[0]] }));
    renderWithProviders(<MembersTable />);

    expect(await screen.findByText(/1 person in this workspace/i)).toBeInTheDocument();
  });

  it('shows a loading skeleton while the roster fetches', async () => {
    useMembersMock.mockReturnValue(listResult({ rows: [], isPending: true }));
    renderWithProviders(<MembersTable />);

    expect(await screen.findByTestId('dashboard-members-loading')).toBeInTheDocument();
    expect(screen.queryByText(/people in this workspace/i)).not.toBeInTheDocument();
  });

  it('shows an error message when the roster cannot load', async () => {
    useMembersMock.mockReturnValue(listResult({ rows: [], isError: true }));
    renderWithProviders(<MembersTable />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Sarah Walker')).not.toBeInTheDocument();
  });

  // Regression (DASH-1): `useMembers` disables its query when there is no active
  // org, and a DISABLED query in TanStack Query v5 reports `status: 'pending'`
  // forever. Gating the skeleton on `isPending` alone left three shimmering rows
  // on screen indefinitely — no data, no empty state, no error.
  it('shows a no-workspace state instead of a skeleton that never resolves', async () => {
    orgIdRef.value = null;
    useMembersMock.mockReturnValue(listResult({ rows: [], isPending: true }));
    renderWithProviders(<MembersTable />);

    expect(
      await screen.findByTestId('dashboard-members-no-workspace'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-members-loading')).not.toBeInTheDocument();
  });

  it('still shows the skeleton while a real fetch is in flight', async () => {
    orgIdRef.value = 'org_1';
    useMembersMock.mockReturnValue(listResult({ rows: [], isPending: true }));
    renderWithProviders(<MembersTable />);

    expect(await screen.findByTestId('dashboard-members-loading')).toBeInTheDocument();
    expect(
      screen.queryByTestId('dashboard-members-no-workspace'),
    ).not.toBeInTheDocument();
  });

  // An empty roster used to render a bare table header with nothing beneath it.
  it('shows an empty state rather than a header with no rows', async () => {
    useMembersMock.mockReturnValue(listResult({ rows: [] }));
    renderWithProviders(<MembersTable />);

    expect(await screen.findByTestId('dashboard-members-empty')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    useMembersMock.mockReturnValue(listResult());
    const { container } = renderWithProviders(<MembersTable />);
    await screen.findByTestId('dashboard-members-table');
    expect(await axe(container)).toHaveNoViolations();
  });
});
