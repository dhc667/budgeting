import type { TFunction } from "i18next";
import { ArrowLeftRight, ChartPie, House, type LucideIcon, Wallet } from "lucide-react";

export type NavItem = { to: string; label: (t: TFunction) => string; icon: LucideIcon };

export const navItems: NavItem[] = [
  { to: "/", label: (t) => t("nav.home"), icon: House },
  { to: "/transactions", label: (t) => t("nav.transactions"), icon: ArrowLeftRight },
  { to: "/budgets", label: (t) => t("nav.budgets"), icon: Wallet },
  { to: "/reports", label: (t) => t("nav.reports"), icon: ChartPie },
];
