/**
 * Single icon surface for app code. Every icon import goes through here
 * (enforced by eslint no-restricted-imports), so the icon library is swappable
 * at runtime: each export is a thin wrapper that renders the active library's
 * version (Lucide default, Tabler/Phosphor lazy-loaded) and falls back to Lucide
 * until the chosen set's chunk arrives. Vendored shadcn primitives
 * (components/ui) import lucide directly and always stay Lucide.
 */
import {
  AlertCircle as LuAlertCircle,
  AlertTriangle as LuAlertTriangle,
  ArrowDown as LuArrowDown,
  ArrowUp as LuArrowUp,
  Bell as LuBell,
  BellOff as LuBellOff,
  Boxes as LuBoxes,
  Building2 as LuBuilding,
  CalendarDays as LuCalendarDays,
  Check as LuCheck,
  CheckCircle2 as LuCheckCircle,
  ChevronLeft as LuChevronLeft,
  ChevronRight as LuChevronRight,
  ChevronsLeft as LuChevronsLeft,
  ChevronsRight as LuChevronsRight,
  ChevronsUpDown as LuChevronsUpDown,
  Copy as LuCopy,
  CreditCard as LuCreditCard,
  Download as LuDownload,
  Eye as LuEye,
  EyeOff as LuEyeOff,
  Fingerprint as LuFingerprint,
  GitBranch as LuGitBranch,
  Globe as LuGlobe,
  Languages as LuLanguages,
  Laptop as LuLaptop,
  LayoutDashboard as LuLayoutDashboard,
  Loader2 as LuLoader,
  LogOut as LuLogOut,
  Mail as LuMail,
  Menu as LuMenu,
  Minus as LuMinus,
  Monitor as LuMonitor,
  MonitorSmartphone as LuMonitorSmartphone,
  Moon as LuMoon,
  MoreHorizontal as LuMoreHorizontal,
  Palette as LuPalette,
  Plug as LuPlug,
  Plus as LuPlus,
  Rocket as LuRocket,
  RotateCw as LuRotateCw,
  Search as LuSearch,
  Settings as LuSettings,
  Shield as LuShield,
  ShieldAlert as LuShieldAlert,
  ShieldCheck as LuShieldCheck,
  SlidersHorizontal as LuSlidersHorizontal,
  Smartphone as LuSmartphone,
  Sparkles as LuSparkles,
  Sun as LuSun,
  Trash2 as LuTrash,
  TriangleAlert as LuTriangleAlert,
  User as LuUser,
  UserCog as LuUserCog,
  UserPlus as LuUserPlus,
  Users as LuUsers,
  X as LuX,
  XCircle as LuXCircle,
  Zap as LuZap,
} from 'lucide-react';
import { createElement } from 'react';

import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

// lucide-react 1.0 removed brand icons — the GitHub mark is vendored locally.
import { GithubMark as LuGithub } from './github-mark.tsx';
import type { IconName } from './icon-names.ts';
import { useIconSet } from './icon-registry.ts';
import type { AppIcon, IconProps } from './icon-types.ts';

/**
 * A swappable icon: renders the active library's version, Lucide as fallback.
 *
 * The Lucide component is passed in, not looked up by name in a map: a lookup
 * keeps every icon in the map live the moment any one icon renders, so icons
 * nothing imports still shipped. Marked side-effect free so a bundler drops the
 * export (and its Lucide icon) when nothing imports it.
 */
/* @__NO_SIDE_EFFECTS__ */
function makeIcon(name: IconName, lucide: AppIcon): AppIcon {
  function Icon(props: IconProps) {
    const lib = useThemeStore((s) => s.iconLibrary);
    const set = useIconSet(lib);
    const Component = set?.[name] ?? lucide;
    return createElement(Component, props);
  }
  Icon.displayName = name;
  return Icon;
}

export type { AppIcon, IconProps } from './icon-types.ts';
/** Alias for {@link AppIcon} — the type used by `icon` props across the app. */
export type LucideIcon = AppIcon;

export const AlertCircle = makeIcon('AlertCircle', LuAlertCircle);
export const AlertTriangle = makeIcon('AlertTriangle', LuAlertTriangle);
export const ArrowDown = makeIcon('ArrowDown', LuArrowDown);
export const ArrowUp = makeIcon('ArrowUp', LuArrowUp);
export const Bell = makeIcon('Bell', LuBell);
export const BellOff = makeIcon('BellOff', LuBellOff);
export const Boxes = makeIcon('Boxes', LuBoxes);
export const Building = makeIcon('Building', LuBuilding);
export const CalendarDays = makeIcon('CalendarDays', LuCalendarDays);
export const Check = makeIcon('Check', LuCheck);
export const CheckCircle = makeIcon('CheckCircle', LuCheckCircle);
export const ChevronLeft = makeIcon('ChevronLeft', LuChevronLeft);
export const ChevronRight = makeIcon('ChevronRight', LuChevronRight);
export const ChevronsLeft = makeIcon('ChevronsLeft', LuChevronsLeft);
export const ChevronsRight = makeIcon('ChevronsRight', LuChevronsRight);
export const ChevronsUpDown = makeIcon('ChevronsUpDown', LuChevronsUpDown);
export const Copy = makeIcon('Copy', LuCopy);
export const CreditCard = makeIcon('CreditCard', LuCreditCard);
export const Download = makeIcon('Download', LuDownload);
export const Eye = makeIcon('Eye', LuEye);
export const EyeOff = makeIcon('EyeOff', LuEyeOff);
export const Fingerprint = makeIcon('Fingerprint', LuFingerprint);
export const GitBranch = makeIcon('GitBranch', LuGitBranch);
export const Github = makeIcon('Github', LuGithub);
export const Globe = makeIcon('Globe', LuGlobe);
export const Laptop = makeIcon('Laptop', LuLaptop);
export const Languages = makeIcon('Languages', LuLanguages);
export const LayoutDashboard = makeIcon('LayoutDashboard', LuLayoutDashboard);
export const Loader = makeIcon('Loader', LuLoader);
export const LogOut = makeIcon('LogOut', LuLogOut);
export const Mail = makeIcon('Mail', LuMail);
export const Menu = makeIcon('Menu', LuMenu);
export const Minus = makeIcon('Minus', LuMinus);
export const Monitor = makeIcon('Monitor', LuMonitor);
export const MonitorSmartphone = makeIcon('MonitorSmartphone', LuMonitorSmartphone);
export const Moon = makeIcon('Moon', LuMoon);
export const MoreHorizontal = makeIcon('MoreHorizontal', LuMoreHorizontal);
export const Palette = makeIcon('Palette', LuPalette);
export const Plus = makeIcon('Plus', LuPlus);
export const Plug = makeIcon('Plug', LuPlug);
export const Rocket = makeIcon('Rocket', LuRocket);
export const RotateCw = makeIcon('RotateCw', LuRotateCw);
export const Search = makeIcon('Search', LuSearch);
export const Settings = makeIcon('Settings', LuSettings);
export const ShieldAlert = makeIcon('ShieldAlert', LuShieldAlert);
export const Shield = makeIcon('Shield', LuShield);
export const ShieldCheck = makeIcon('ShieldCheck', LuShieldCheck);
export const SlidersHorizontal = makeIcon('SlidersHorizontal', LuSlidersHorizontal);
export const Smartphone = makeIcon('Smartphone', LuSmartphone);
export const Sparkles = makeIcon('Sparkles', LuSparkles);
export const Sun = makeIcon('Sun', LuSun);
export const Trash = makeIcon('Trash', LuTrash);
export const TriangleAlert = makeIcon('TriangleAlert', LuTriangleAlert);
export const User = makeIcon('User', LuUser);
export const UserCog = makeIcon('UserCog', LuUserCog);
export const UserPlus = makeIcon('UserPlus', LuUserPlus);
export const Users = makeIcon('Users', LuUsers);
export const X = makeIcon('X', LuX);
export const XCircle = makeIcon('XCircle', LuXCircle);
export const Zap = makeIcon('Zap', LuZap);
