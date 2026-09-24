import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils.ts';
import type { Notification } from '@/shared/api/notification-contracts.ts';
import { EmptyState } from '@/shared/components/EmptyState/index.ts';
import { FormattedDate } from '@/shared/components/FormattedDate/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import { settingsHash } from '@/shared/components/SettingsModal/settings-hash-grammar.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '@/shared/hooks/useNotifications/index.ts';
import {
  Bell,
  BellOff,
  Settings,
  ShieldCheck,
  UserPlus,
  Zap,
} from '@/shared/icons/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';

/** Category → glyph, so the inbox is scannable at a glance. */
function CategoryIcon({
  category,
  className,
}: {
  category: Notification['category'];
  className: string;
}) {
  if (category === 'member') return <UserPlus className={className} />;
  if (category === 'billing') return <Zap className={className} />;
  if (category === 'security') return <ShieldCheck className={className} />;
  return <Bell className={className} />;
}

/** Mark-all-read header action — hidden entirely when the inbox is empty. */
function MarkAllReadButton({
  count,
  unread,
  pending,
  onMarkAll,
}: {
  count: number;
  unread: number;
  pending: boolean;
  onMarkAll: () => void;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  if (count === 0) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      disabled={unread === 0 || pending}
      onClick={onMarkAll}
      data-testid="notification-mark-all"
    >
      {t(LAYOUT_KEYS.app.notifications.markAllRead)}
    </Button>
  );
}

/** The bell's unread count — nothing at zero, capped at "9+". */
function UnreadBadge({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <span
      data-slot="pill"
      className="bg-primary text-primary-foreground absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
      data-testid="notification-badge"
    >
      {unread > 9 ? '9+' : unread}
    </span>
  );
}

/** One inbox row: category glyph (tinted while unread), title, body and relative time. */
function NotificationRow({
  item,
  onClick,
}: {
  item: Notification;
  onClick: (item: Notification) => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-slot="menu-item"
        onClick={() => onClick(item)}
        className={cn(
          'flex w-full min-w-0 items-start gap-3 px-4 py-3 text-start transition-colors',
          'hover:bg-muted/50 focus-visible:bg-muted/50 outline-none',
          !item.isRead && 'bg-muted/30',
        )}
        data-testid={`notification-${item.id}`}
      >
        <span
          data-slot="icon-chip"
          className={cn(
            'flex size-9 shrink-0 items-center justify-center',
            item.isRead ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
          )}
          aria-hidden="true"
        >
          <CategoryIcon category={item.category} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {item.title}
            </span>
            {item.isRead ? null : (
              <span
                className="bg-primary size-1.5 shrink-0 rounded-full"
                aria-hidden="true"
              />
            )}
          </span>
          <span className="text-muted-foreground line-clamp-2 block text-xs">
            {item.body}
          </span>
          <span className="text-muted-foreground/70 mt-1 block text-[11px]">
            <FormattedDate value={item.createdAt} relative />
          </span>
        </span>
      </button>
    </li>
  );
}

/** The popover's scrolling body: loading, error (with retry), empty, or the list. */
function NotificationInbox({
  items,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onItemClick,
}: {
  items: Notification[] | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onItemClick: (item: Notification) => void;
}) {
  const { t } = useTranslation(LAYOUT_NS);
  return (
    <div className="max-h-[24rem] overflow-y-auto overscroll-contain">
      {isLoading ? (
        <div className="space-y-2 p-3" data-testid="notifications-loading">
          {['a', 'b', 'c'].map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <div className="p-4" data-testid="notifications-query-error">
          <RetryError
            message={t(LAYOUT_KEYS.app.notifications.loadError)}
            onRetry={onRetry}
            isRetrying={isFetching}
          />
        </div>
      ) : null}

      {items && items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<BellOff />}
            title={t(LAYOUT_KEYS.app.notifications.emptyTitle)}
            description={t(LAYOUT_KEYS.app.notifications.emptyDescription)}
          />
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="divide-border divide-y" data-testid="notifications-list">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} onClick={onItemClick} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Notification center — header bell with an unread badge that opens a **popover**
 * inbox. Each row carries a category glyph (tinted while unread), title, body, and
 * locale-formatted time; unread rows mark themselves read on click. Data: useNotifications.
 */
export function NotificationCenter({
  surface = 'default',
  popoverSide,
  popoverAlign = 'end',
}: {
  /** Tinted shell the bell trigger sits on (e.g. icon rail). */
  surface?: 'default' | 'sidebar';
  /** Popover side — `right` when the trigger is in a narrow left rail. */
  popoverSide?: 'top' | 'right' | 'bottom' | 'left';
  popoverAlign?: 'start' | 'center' | 'end';
}) {
  const { t } = useTranslation(LAYOUT_NS);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const {
    data: items,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useNotifications({
    isInboxOpen: open,
  });
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  // One row, one PATCH. `markRead.isPending` is React state and is shared by
  // every row anyway, so it can neither stop a double-click on one row nor
  // allow a legitimate click on another. The ref is per id and flips
  // synchronously (agent-os/rules/resilient-interactions section 1).
  const markingRef = useRef(new Set<string>());

  function handleItemClick(item: Notification) {
    if (item.isRead || markingRef.current.has(item.id)) return;
    markingRef.current.add(item.id);
    markRead.mutate(item.id, {
      onSettled: () => markingRef.current.delete(item.id),
    });
  }

  const triggerSurfaceClass =
    surface === 'sidebar'
      ? 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', triggerSurfaceClass)}
          aria-label={
            unread > 0
              ? t(LAYOUT_KEYS.app.notifications.ariaWithUnread, { count: unread })
              : t(LAYOUT_KEYS.app.notifications.ariaDefault)
          }
          data-testid="notification-bell"
        >
          <Bell className="h-4 w-4" />
          <UnreadBadge unread={unread} />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={popoverAlign}
        side={popoverSide}
        sideOffset={8}
        collisionPadding={8}
        className="w-[22rem] overflow-hidden p-0"
        data-testid="notification-popover"
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-sm font-semibold">
              {t(LAYOUT_KEYS.app.notifications.title)}
            </p>
            {unread > 0 ? (
              <span
                data-slot="pill"
                className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              >
                {t(LAYOUT_KEYS.app.notifications.newBadge, { count: unread })}
              </span>
            ) : null}
          </div>
          <MarkAllReadButton
            count={items?.length ?? 0}
            unread={unread}
            pending={markAll.isPending}
            onMarkAll={() => markAll.mutate()}
          />
        </div>

        <NotificationInbox
          items={items}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          onRetry={() => {
            void refetch();
          }}
          onItemClick={handleItemClick}
        />

        {items && items.length > 0 ? (
          <button
            type="button"
            data-slot="menu-item"
            onClick={() => {
              setOpen(false);
              void navigate({ to: '.', hash: settingsHash('account', 'notifications') });
            }}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs font-medium transition-colors outline-none"
            data-testid="notification-settings-link"
          >
            <Settings className="size-3.5" aria-hidden="true" />
            {t(LAYOUT_KEYS.app.notifications.settingsLink)}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
