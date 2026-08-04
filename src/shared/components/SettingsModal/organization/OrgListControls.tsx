import { useTranslation } from 'react-i18next';

import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { Input } from '@/shared/components/ui/input.tsx';
import { Label } from '@/shared/components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import { Search } from '@/shared/icons/index.ts';

import { ORG_LIST_SORT_PRESETS, type OrgListSortPreset } from './org-list-sort.ts';

const SORT_LABEL_KEYS = SETTINGS_KEYS.panels.listSort;

const SORT_OPTION_LABELS = {
  nameAsc: SORT_LABEL_KEYS.nameAsc,
  nameDesc: SORT_LABEL_KEYS.nameDesc,
  newest: SORT_LABEL_KEYS.newest,
  oldest: SORT_LABEL_KEYS.oldest,
} as const satisfies Record<OrgListSortPreset, string>;

const SORT_OPTIONS = Object.keys(ORG_LIST_SORT_PRESETS) as OrgListSortPreset[];

interface OrgListControlsProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: OrgListSortPreset;
  onSortChange: (value: OrgListSortPreset) => void;
  searchPlaceholder: string;
  searchTestId: string;
  sortTestId: string;
}

/** Search + server-side sort toolbar for organization list panels. */
export function OrgListControls({
  search,
  onSearchChange,
  sort,
  onSortChange,
  searchPlaceholder,
  searchTestId,
  sortTestId,
}: OrgListControlsProps) {
  const { t } = useTranslation(SETTINGS_NS);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="relative max-w-sm flex-1">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="ps-9"
          data-testid={searchTestId}
        />
      </div>
      <div className="flex w-full flex-col gap-1.5 sm:w-48">
        <Label htmlFor={sortTestId} className="text-muted-foreground text-xs">
          {t(SORT_LABEL_KEYS.label)}
        </Label>
        <Select
          value={sort}
          onValueChange={(value) => onSortChange(value as OrgListSortPreset)}
        >
          <SelectTrigger
            id={sortTestId}
            data-testid={sortTestId}
            aria-label={t(SORT_LABEL_KEYS.label)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(SORT_OPTION_LABELS[option])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
