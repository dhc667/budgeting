import type { TFunction } from "i18next";
import type { PickerGroup, PickerOption } from "../ui/Picker";
import { spaceName } from "./space";
import type { Space } from "./space-queries";

// Names repeat from space to space, so with more than one offered each gets its own group.
export function bySpace<Item extends { space_id: string }>(
  spaces: Space[],
  items: Item[],
  t: TFunction,
  options: (inSpace: Item[]) => PickerOption[],
): PickerGroup[] {
  if (spaces.length <= 1) return [{ heading: null, options: options(items) }];
  return spaces
    .map((space) => ({
      heading: spaceName(space, t),
      options: options(items.filter(({ space_id }) => space_id === space.id)),
    }))
    .filter(({ options }) => options.length > 0);
}
