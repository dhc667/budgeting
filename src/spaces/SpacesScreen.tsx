import type { TFunction } from "i18next";
import { ChevronRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BackLink } from "../ui/BackLink";
import { Card } from "../ui/Card";
import { isPrivate, spaceName } from "./space";
import { type Space, useSpaces } from "./space-queries";

export function SpacesScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/profile" place={t("profile.title")} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t("spaces.title")}</h1>
          <Link
            to="/spaces/new"
            className="flex h-11 items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400"
          >
            <Plus className="size-5" />
            {t("spaces.add")}
          </Link>
        </div>
      </header>
      <SpaceList />
    </div>
  );
}

function SpaceList() {
  const { t } = useTranslation();
  const { data: spaces = [] } = useSpaces();
  return (
    <Card title={t("spaces.yours")}>
      <ul className="-mx-2 flex flex-col">
        {spaces.map((space) => (
          <li key={space.id}>
            <Link
              to={`/spaces/${space.id}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="flex flex-col">
                <span className="font-medium">{spaceName(space, t)}</span>
                <span className="text-sm text-zinc-500">{membersSummary(space, t)}</span>
              </span>
              <ChevronRight className="size-5 text-zinc-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function membersSummary(space: Space, t: TFunction): string {
  if (isPrivate(space)) return t("spaces.onlyYou");
  return t("spaces.memberCount", { count: space.members.length });
}
