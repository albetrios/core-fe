import { type ColumnDef, useTable } from '@tanstack/react-table';
import { useMemo } from 'react';

import type { BillingInvoice } from '@/shared/api/billing-contracts.ts';
import {
  DataTable,
  type DataTableFeatures,
  dataTableFeatures,
} from '@/shared/components/DataTable/index.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { useBillingInvoices } from '@/shared/hooks/useBillingInvoices/index.ts';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';

function invoiceStatusVariant(status: BillingInvoice['status']) {
  if (status === 'paid') return 'secondary' as const;
  if (status === 'open' || status === 'uncollectible') return 'destructive' as const;
  return 'outline' as const;
}

function InvoicesTable({ invoices }: { invoices: BillingInvoice[] }) {
  const { formatCurrency, formatDate } = useLocaleFormat();

  const columns = useMemo<ColumnDef<DataTableFeatures, BillingInvoice>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Date',
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: 'due',
        header: 'Due',
        cell: ({ row }) =>
          row.original.dueDate ? formatDate(row.original.dueDate) : '—',
      },
      {
        id: 'total',
        header: 'Total',
        cell: ({ row }) => formatCurrency(row.original.amountDue, row.original.currency),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={invoiceStatusVariant(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const url = row.original.hostedInvoiceUrl ?? row.original.invoicePdfUrl ?? null;
          if (!url) return <span className="text-muted-foreground text-sm">—</span>;
          return (
            <Button variant="ghost" size="sm" asChild data-testid="billing-invoice-view">
              <a href={url} target="_blank" rel="noopener noreferrer">
                View invoice
              </a>
            </Button>
          );
        },
      },
    ],
    [formatCurrency, formatDate],
  );

  const table = useTable({
    features: dataTableFeatures,
    data: invoices,
    columns,
  });

  return (
    <div data-testid="billing-invoices-table">
      <DataTable table={table} emptyMessage="No invoices yet." />
    </div>
  );
}

/** Invoice history for the active team workspace. */
export function BillingInvoicesTable({ enabled = true }: { enabled?: boolean }) {
  const query = useBillingInvoices(enabled);

  // Hide when disabled (no subscription): the query is disabled too, and a
  // disabled query reports `isPending`, which would strand the card on a
  // permanent loading skeleton.
  if (!enabled) return null;

  return (
    <Card data-testid="billing-invoices-card">
      <CardHeader>
        <CardTitle className="text-base">Invoices</CardTitle>
        <CardDescription>
          Date, due date, amount, and status from your billing provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryBoundary
          query={query}
          errorMessage="Couldn't load invoices. Please try again."
        >
          {(invoices) => <InvoicesTable invoices={invoices} />}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
