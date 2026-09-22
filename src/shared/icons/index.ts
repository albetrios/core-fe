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

/** Default set — Lucide, in the main bundle (tree-shaken to these icons). */
const lucideIcons = {
  AlertCircle: LuAlertCircle,
  AlertTriangle: LuAlertTriangle,
  ArrowDown: LuArrowDown,
  ArrowUp: LuArrowUp,
  Bell: LuBell,
  BellOff: LuBellOff,
  Boxes: LuBoxes,
  Building: LuBuilding,
  CalendarDays: LuCalendarDays,
  Check: LuCheck,
  CheckCircle: LuCheckCircle,
  ChevronLeft: LuChevronLeft,
  ChevronRight: LuChevronRight,
  ChevronsLeft: LuChevronsLeft,
  ChevronsRight: LuChevronsRight,
  ChevronsUpDown: LuChevronsUpDown,
  Copy: LuCopy,
  CreditCard: LuCreditCard,
  Download: LuDownload,
  Eye: LuEye,
  EyeOff: LuEyeOff,
  Fingerprint: LuFingerprint,
  GitBranch: LuGitBranch,
  Github: LuGithub,
  Globe: LuGlobe,
  Laptop: LuLaptop,
  Languages: LuLanguages,
  LayoutDashboard: LuLayoutDashboard,
  Loader: LuLoader,
  LogOut: LuLogOut,
  Mail: LuMail,
  Menu: LuMenu,
  Minus: LuMinus,
  Monitor: LuMonitor,
  MonitorSmartphone: LuMonitorSmartphone,
  Moon: LuMoon,
  MoreHorizontal: LuMoreHorizontal,
  Palette: LuPalette,
  Plus: LuPlus,
  Plug: LuPlug,
  Rocket: LuRocket,
  RotateCw: LuRotateCw,
  Search: LuSearch,
  Settings: LuSettings,
  ShieldAlert: LuShieldAlert,
  Shield: LuShield,
  ShieldCheck: LuShieldCheck,
  SlidersHorizontal: LuSlidersHorizontal,
  Smartphone: LuSmartphone,
  Sparkles: LuSparkles,
  Sun: LuSun,
  Trash: LuTrash,
  TriangleAlert: LuTriangleAlert,
  User: LuUser,
  UserCog: LuUserCog,
  UserPlus: LuUserPlus,
  Users: LuUsers,
  X: LuX,
  XCircle: LuXCircle,
  Zap: LuZap,
} satisfies Record<IconName, AppIcon>;

/** A swappable icon: renders the active library's version, Lucide as fallback. */
function makeIcon(name: IconName): AppIcon {
  function Icon(props: IconProps) {
    const lib = useThemeStore((s) => s.iconLibrary);
    const set = useIconSet(lib);
    const Component = set?.[name] ?? lucideIcons[name];
    return createElement(Component, props);
  }
  Icon.displayName = name;
  return Icon;
}

export type { AppIcon, IconProps } from './icon-types.ts';
/** Alias for {@link AppIcon} — the type used by `icon` props across the app. */
export type LucideIcon = AppIcon;

export const AlertCircle = makeIcon('AlertCircle');
export const AlertTriangle = makeIcon('AlertTriangle');
export const ArrowDown = makeIcon('ArrowDown');
export const ArrowUp = makeIcon('ArrowUp');
export const Bell = makeIcon('Bell');
export const BellOff = makeIcon('BellOff');
export const Boxes = makeIcon('Boxes');
export const Building = makeIcon('Building');
export const CalendarDays = makeIcon('CalendarDays');
export const Check = makeIcon('Check');
export const CheckCircle = makeIcon('CheckCircle');
export const ChevronLeft = makeIcon('ChevronLeft');
export const ChevronRight = makeIcon('ChevronRight');
export const ChevronsLeft = makeIcon('ChevronsLeft');
export const ChevronsRight = makeIcon('ChevronsRight');
export const ChevronsUpDown = makeIcon('ChevronsUpDown');
export const Copy = makeIcon('Copy');
export const CreditCard = makeIcon('CreditCard');
export const Download = makeIcon('Download');
export const Eye = makeIcon('Eye');
export const EyeOff = makeIcon('EyeOff');
export const Fingerprint = makeIcon('Fingerprint');
export const GitBranch = makeIcon('GitBranch');
export const Github = makeIcon('Github');
export const Globe = makeIcon('Globe');
export const Laptop = makeIcon('Laptop');
export const Languages = makeIcon('Languages');
export const LayoutDashboard = makeIcon('LayoutDashboard');
export const Loader = makeIcon('Loader');
export const LogOut = makeIcon('LogOut');
export const Mail = makeIcon('Mail');
export const Menu = makeIcon('Menu');
export const Minus = makeIcon('Minus');
export const Monitor = makeIcon('Monitor');
export const MonitorSmartphone = makeIcon('MonitorSmartphone');
export const Moon = makeIcon('Moon');
export const MoreHorizontal = makeIcon('MoreHorizontal');
export const Palette = makeIcon('Palette');
export const Plus = makeIcon('Plus');
export const Plug = makeIcon('Plug');
export const Rocket = makeIcon('Rocket');
export const RotateCw = makeIcon('RotateCw');
export const Search = makeIcon('Search');
export const Settings = makeIcon('Settings');
export const ShieldAlert = makeIcon('ShieldAlert');
export const Shield = makeIcon('Shield');
export const ShieldCheck = makeIcon('ShieldCheck');
export const SlidersHorizontal = makeIcon('SlidersHorizontal');
export const Smartphone = makeIcon('Smartphone');
export const Sparkles = makeIcon('Sparkles');
export const Sun = makeIcon('Sun');
export const Trash = makeIcon('Trash');
export const TriangleAlert = makeIcon('TriangleAlert');
export const User = makeIcon('User');
export const UserCog = makeIcon('UserCog');
export const UserPlus = makeIcon('UserPlus');
export const Users = makeIcon('Users');
export const X = makeIcon('X');
export const XCircle = makeIcon('XCircle');
export const Zap = makeIcon('Zap');
