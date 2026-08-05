import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

export const MEMBERS_TABLE_NS = I18N_NAMESPACES.layout;

export const MEMBERS_TABLE_KEYS = {
  rolePlaceholder: 'app.membersTable.rolePlaceholder',
  searchPlaceholder: 'app.membersTable.searchPlaceholder',
  actionsAria: 'app.membersTable.actionsAria',
  changeRole: 'app.membersTable.changeRole',
  suspend: 'app.membersTable.suspend',
  reactivate: 'app.membersTable.reactivate',
  remove: 'app.membersTable.remove',
  removeTitle: 'app.membersTable.removeTitle',
  removeDescription: 'app.membersTable.removeDescription',
  cancel: 'app.membersTable.cancel',
  confirmRemove: 'app.membersTable.confirmRemove',
} as const;
