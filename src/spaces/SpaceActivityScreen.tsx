import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { Subscreen } from "../ui/Subscreen";
import { ActivityList } from "./ActivityList";
import { spaceName } from "./space";
import { useSpaceActivity, useSpaces } from "./space-queries";
import { SpaceNotFound } from "./SpaceScreen";

export function SpaceActivityScreen() {
  const { t } = useTranslation();
  const { spaceId } = useParams();
  const { data: spaces } = useSpaces();
  if (!spaces) return null;
  const space = spaces.find(({ id }) => id === spaceId);
  if (!space) return <SpaceNotFound />;

  return (
    <Subscreen
      back={{ to: `/spaces/${space.id}`, place: spaceName(space, t) }}
      title={t("activity.title")}
    >
      <SpaceActivity spaceId={space.id} />
    </Subscreen>
  );
}

function SpaceActivity({ spaceId }: { spaceId: string }) {
  const { data: activity } = useSpaceActivity(spaceId);
  return <ActivityList activity={activity} />;
}
