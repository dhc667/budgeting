import { ArrowLeftRight, ChartPie, House, type LucideIcon, Wallet } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon };

export const navItems: NavItem[] = [
  { to: "/", label: "Home", icon: House },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/reports", label: "Reports", icon: ChartPie },
];
