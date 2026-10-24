import { useTranslation } from "react-i18next";
import { SelectField } from "../ui/SelectField";
import { spaceName } from "./space";
import type { Space } from "./space-queries";

type SpaceSelectProps = {
  label: string;
  spaces: Space[];
  value: string;
  onChange: (spaceId: string) => void;
};

// Only the spaces the space picker shows are offered. The only one shown is grayed out.
export function SpaceSelect({ label, spaces, value, onChange }: SpaceSelectProps) {
  const { t } = useTranslation();
  return (
    <SelectField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={spaces.length <= 1}
    >
      {spaces.map((space) => (
        <option key={space.id} value={space.id}>
          {spaceName(space, t)}
        </option>
      ))}
    </SelectField>
  );
}
