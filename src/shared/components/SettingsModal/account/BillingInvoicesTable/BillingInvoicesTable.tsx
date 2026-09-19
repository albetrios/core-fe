import { type ColumnDef, useTable } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { BillingInvoice } from '@/shared/api/billing-contracts.ts';
import {
  DataTable,
  type DataTableFeatures,
  dataTableFeatures,
} from '@/shared/components/DataTable/index.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
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

const INVOICE_KEYS = SETTINGS_KEYS.panels.billing.invoices;

function invoiceStatusVariant(status: BillingInvoice['status']) {
  if (status === 'paid') return 'secondary' as const;
  if (status === 'open' || status === 'uncollectible') return 'destructive' as const;
  return 'outline' as const;
}

function InvoicesTable({ invoices }: { invoices: BillingInvoice[] }) {
  const { t } = useTranslation(SETTINGS_NS);
  const { formatCurrency, formatDate } = useLocaleFormat();

  const columns = useMemo<ColumnDef<DataTableFeatures, BillingInvoice>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: t(INVOICE_KEYS.columns.date),
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: 'due',
        header: t(INVOICE_KEYS.columns.due),
        cell: ({ row }) =>
          row.original.dueDate ? formatDate(row.original.dueDate) : '—',
      },
      {
        id: 'total',
        header: t(INVOICE_KEYS.columns.total),
        cell: ({ row }) => formatCurrency(row.original.amountDue, row.original.currency),
      },
      {
        accessorKey: 'status',
        header: t(INVOICE_KEYS.columns.status),
        cell: ({ row }) => (
          <Badge variant={invoiceStatusVariant(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: t(INVOICE_KEYS.columns.actions),
        cell: ({ row }) => {
          const url = row.original.hostedInvoiceUrl ?? row.original.invoicePdfUrl ?? null;
          if (!url) return <span className="text-muted-foreground text-sm">—</span>;
          return (
            <Button variant="ghost" size="sm" asChild data-testid="billing-invoice-view">
              <a href={url} target="_blank" rel="noopener noreferrer">
                {t(INVOICE_KEYS.view)}
              </a>
            </Button>
          );
        },
      },
    ],
    [formatCurrency, formatDate, t],
  );

  const table = useTable({
    features: dataTableFeatures,
    data: invoices,
    columns,
  });

  return (
    <div data-testid="billing-invoices-table">
      <DataTable table={table} emptyMessage={t(INVOICE_KEYS.empty)} />
    </div>
  );
}

/** Invoice history for the active team workspace. */
export function BillingInvoicesTable({ enabled = true }: { enabled?: boolean }) {
  const { t } = useTranslation(SETTINGS_NS);
  const query = useBillingInvoices(enabled);

  // Hide the whole card when there is no subscription to invoice against. The
  // guard is about the card, not about the query: QueryBoundary tells a disabled
  // query apart from a loading one by itself now (X-5).
  if (!enabled) return null;

  return (
    <Card data-testid="billing-invoices-card">
      <CardHeader>
        <CardTitle className="text-base">{t(INVOICE_KEYS.title)}</CardTitle>
        <CardDescription>{t(INVOICE_KEYS.description)}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryBoundary
          query={query}
          errorMessage={t(INVOICE_KEYS.loadFailed)}
          title={t(INVOICE_KEYS.title)}
        >
          {(invoices) => <InvoicesTable invoices={invoices} />}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
