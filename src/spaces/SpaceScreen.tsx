import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { useSignedInUser } from "../auth/session";
import { displayNameOf, useUsers } from "../profile/profile-queries";
import { afterSuccess } from "../query-client";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { submitWith, textField } from "../ui/forms";
import { SelectField } from "../ui/SelectField";
import { ActivityList } from "./ActivityList";
import { isPrivate, nameErrorMessage, spaceName } from "./space";
import {
  type Space,
  useAddMember,
  useDeleteSpace,
  useRemoveMember,
  useRenameSpace,
  useSpaceActivity,
  useSpaces,
} from "./space-queries";

export function SpaceScreen() {
  const { t } = useTranslation();
  const { spaceId } = useParams();
  const { data: spaces } = useSpaces();
  if (!spaces) return null;
  const space = spaces.find(({ id }) => id === spaceId);
  if (!space) return <SpaceNotFound />;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{spaceName(space, t)}</h1>
      {isPrivate(space) ? (
        <p className="text-zinc-500">{t("spaces.privateExplained")}</p>
      ) : (
        <>
          <RenameForm space={space} />
          <MembersCard space={space} />
          <ActivityCard space={space} />
          <DeleteCard space={space} />
        </>
      )}
    </div>
  );
}

function SpaceNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState>{t("spaces.notFound")}</EmptyState>
      <Link to="/spaces" className="font-medium text-emerald-700 dark:text-emerald-400">
        {t("spaces.backToSpaces")}
      </Link>
    </div>
  );
}

function RenameForm({ space }: { space: Space }) {
  const { t } = useTranslation();
  const rename = useRenameSpace(space.id);
  return (
    <Card title={t("spaces.name")}>
      <form
        onSubmit={submitWith((form) => rename.mutate(textField(form, "name").trim()))}
        className="flex flex-col gap-4"
      >
        <Field label={t("spaces.name")} name="name" defaultValue={space.name ?? ""} required />
        {rename.error && <ErrorText>{nameErrorMessage(rename.error, t)}</ErrorText>}
        {rename.isSuccess && <p className="text-sm text-emerald-600">{t("spaces.saved")}</p>}
        <Button type="submit" disabled={rename.isPending} className="self-start">
          {t("spaces.rename")}
        </Button>
      </form>
    </Card>
  );
}

function MembersCard({ space }: { space: Space }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useSignedInUser();
  const { data: users = [] } = useUsers();
  const remove = useRemoveMember();
  const nameOf = (userId: string) => displayNameOf(users, userId) ?? "";
  const canLeave = space.members.length > 1;
  const leave = (membershipId: string) =>
    afterSuccess(remove.mutateAsync(membershipId), () => navigate("/spaces"));

  return (
    <Card title={t("spaces.members.title")}>
      <ul className="flex flex-col gap-2">
        {space.members.map((member) => (
          <li key={member.id} className="flex min-h-11 items-center gap-3">
            <Avatar name={nameOf(member.user_id)} />
            <span className="flex-1 truncate">
              {member.user_id === me.id
                ? t("spaces.members.you", { name: nameOf(member.user_id) })
                : nameOf(member.user_id)}
            </span>
            {member.user_id !== me.id ? (
              <Button
                variant="secondary"
                disabled={remove.isPending}
                onClick={() => remove.mutate(member.id)}
                aria-label={t("spaces.members.removeNamed", { name: nameOf(member.user_id) })}
              >
                {t("spaces.members.remove")}
              </Button>
            ) : (
              canLeave && (
                <Button
                  variant="secondary"
                  disabled={remove.isPending}
                  onClick={() => leave(member.id)}
                >
                  {t("spaces.members.leave")}
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      {!canLeave && <p className="text-sm text-zinc-500">{t("spaces.members.lastMember")}</p>}
      {remove.error && <ErrorText>{t("spaces.errors.saveFailed")}</ErrorText>}
      <AddMemberForm space={space} />
    </Card>
  );
}

function AddMemberForm({ space }: { space: Space }) {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const add = useAddMember(space.id);
  const outsiders = users.filter(({ id }) => !space.members.some(({ user_id }) => user_id === id));
  if (outsiders.length === 0) return null;

  return (
    <form
      onSubmit={submitWith((form) => add.mutate(textField(form, "user")))}
      className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
    >
      <SelectField label={t("spaces.members.add")} name="user">
        {outsiders.map((user) => (
          <option key={user.id} value={user.id}>
            {user.display_name}
          </option>
        ))}
      </SelectField>
      {add.error && <ErrorText>{t("spaces.errors.saveFailed")}</ErrorText>}
      <Button type="submit" variant="secondary" disabled={add.isPending} className="self-start">
        {t("spaces.members.addSubmit")}
      </Button>
    </form>
  );
}

function ActivityCard({ space }: { space: Space }) {
  const { t } = useTranslation();
  const { data: activity } = useSpaceActivity(space.id);
  return (
    <Card title={t("activity.title")}>
      <ActivityList activity={activity} />
    </Card>
  );
}

function DeleteCard({ space }: { space: Space }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const deleteSpace = useDeleteSpace(space.id);
  const confirm = () => afterSuccess(deleteSpace.mutateAsync(), () => navigate("/spaces"));

  return (
    <Card title={t("spaces.delete.title")}>
      <p className="text-sm text-zinc-500">{t("spaces.delete.explained")}</p>
      {deleteSpace.error && <ErrorText>{t("spaces.errors.deleteFailed")}</ErrorText>}
      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" disabled={deleteSpace.isPending} onClick={confirm}>
            {t("spaces.delete.confirm", { name: spaceName(space, t) })}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t("spaces.delete.cancel")}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
          {t("spaces.delete.submit")}
        </Button>
      )}
    </Card>
  );
}
