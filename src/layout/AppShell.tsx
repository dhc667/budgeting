import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { useProfile } from "../profile/profile-queries";
import { Avatar } from "../ui/Avatar";
import { navItems } from "./navigation";

// Desktop gets a sidebar; phones get a top bar, a bottom tab bar and a floating add button.
export function AppShell() {
  return (
    <div className="min-h-dvh md:flex">
      <Sidebar />
      <MobileTopBar />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-8">
        <Outlet />
      </main>
      <AddTransactionFab />
      <MobileTabBar />
    </div>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-zinc-200 bg-white p-4 md:flex dark:border-zinc-800 dark:bg-zinc-900">
      <Brand />
      <AddTransactionButton />
      <nav className="flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end className={sidebarLinkClass}>
            <Icon className="size-5" />
            {label(t)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <ProfileLink showName />
      </div>
    </aside>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex h-14 items-center">
        <Brand />
      </div>
      <ProfileLink />
    </header>
  );
}

function MobileTabBar() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-800 dark:bg-zinc-900">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end className={tabLinkClass}>
          <Icon className="size-6" />
          {label(t)}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7" />
      Budgeting
    </span>
  );
}

function ProfileLink({ showName = false }: { showName?: boolean }) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  return (
    <NavLink
      to="/profile"
      className={showName ? sidebarLinkClass : "rounded-full"}
      aria-label={t("nav.profile")}
    >
      <Avatar name={profile?.display_name ?? ""} />
      {showName && <span className="truncate">{profile?.display_name}</span>}
    </NavLink>
  );
}

function AddTransactionButton() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled
      title={t("nav.comingSoon")}
      className="flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 font-medium text-white disabled:opacity-60"
    >
      <Plus className="size-5" />
      {t("nav.addTransaction")}
    </button>
  );
}

function AddTransactionFab() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled
      title={t("nav.comingSoon")}
      aria-label={t("nav.addTransaction")}
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex size-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg disabled:opacity-60 md:hidden"
    >
      <Plus className="size-7" />
    </button>
  );
}

function sidebarLinkClass({ isActive }: { isActive: boolean }) {
  return `flex h-11 items-center gap-3 rounded-lg px-3 font-medium ${
    isActive
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;
}

function tabLinkClass({ isActive }: { isActive: boolean }) {
  return `flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
    isActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"
  }`;
}
