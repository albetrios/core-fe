import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Member } from '@/shared/api/organization-contracts.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { MembersTable } from './MembersTable.tsx';

const MEMBERS: Member[] = [
  {
    id: 'm_1',
    userId: 'u_1',
    name: 'Ada Lovelace',
    email: 'ada@acme.test',
    role: 'owner',
    status: 'active',
    joinedAt: '2025-01-12T09:00:00.000Z',
  },
];

function member(index: number, overrides: Partial<Member> = {}): Member {
  return {
    id: `m_${index}`,
    userId: `u_${index}`,
    // Zero-padded so lexicographic order matches numeric order, letting the
    // sorting assertions below name an exact expected first row.
    name: `Member ${String(index).padStart(2, '0')}`,
    email: `member${index}@acme.test`,
    role: 'member',
    status: 'active',
    joinedAt: '2025-01-12T09:00:00.000Z',
    ...overrides,
  };
}

/** Row names in render order, excluding the header row. */
function renderedNames(): string[] {
  const rows = screen.getAllByRole('row').slice(1);
  return rows
    .map((row) => within(row).queryByText(/^Member \d\d$/)?.textContent ?? '')
    .filter(Boolean);
}

describe('MembersTable', () => {
  it('renders members with search and export', async () => {
    renderWithProviders(<MembersTable members={MEMBERS} />);
    expect(await screen.findByTestId('members-table')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByTestId('members-export')).toBeInTheDocument();
    expect(screen.getByTestId('members-role-filter')).toBeInTheDocument();
  });

  it('shows an empty message when there are no members', async () => {
    renderWithProviders(<MembersTable members={[]} />);
    expect(await screen.findByText('No members found.')).toBeInTheDocument();
  });

  // TanStack Table v9 makes every feature opt-in via the shared
  // `dataTableFeatures` set. A feature omitted there still type-checks at the
  // call site but dies at runtime, so each registered feature is exercised
  // through the UI rather than asserted structurally.
  describe('table features', () => {
    it('sorts rows when a column header sort action is chosen', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1), member(2), member(3)]} />);

      await screen.findByTestId('members-table');
      expect(renderedNames()[0]).toBe('Member 01');

      await user.click(screen.getByRole('button', { name: /member/i }));
      await user.click(await screen.findByRole('menuitem', { name: /desc/i }));

      expect(renderedNames()[0]).toBe('Member 03');
    });

    it('filters rows through the search input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1), member(2), member(3)]} />);

      await screen.findByTestId('members-table');
      expect(renderedNames()).toHaveLength(3);

      await user.type(screen.getByPlaceholderText(/search/i), 'Member 02');

      expect(renderedNames()).toEqual(['Member 02']);
    });

    it('paginates when rows exceed the default page size', async () => {
      const user = userEvent.setup();
      const many = Array.from({ length: 12 }, (_, i) => member(i + 1));
      renderWithProviders(<MembersTable members={many} />);

      await screen.findByTestId('members-table');
      // Default page size is 10, so 12 members split 10 + 2.
      expect(renderedNames()).toHaveLength(10);
      expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /next page/i }));

      expect(renderedNames()).toEqual(['Member 11', 'Member 12']);
    });

    it('tracks row selection from the select-all checkbox', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MembersTable members={[member(1), member(2)]} />);

      await screen.findByTestId('members-table');
      await user.click(screen.getByRole('checkbox', { name: /select all/i }));

      expect(screen.getByText(/2 of 2 row\(s\) selected/i)).toBeInTheDocument();
    });
  });
});
