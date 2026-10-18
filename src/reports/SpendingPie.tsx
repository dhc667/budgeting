import { createElement } from "react";
import { useTranslation } from "react-i18next";
import {
  Pie,
  PieChart,
  type PieLabelRenderProps,
  type PieSectorShapeProps,
  Sector,
} from "recharts";
import { iconFor } from "../categories/icons";
import { swatchFill } from "../colors/colors";
import { useFormat } from "../format/use-format";
import { ChartFrame } from "./ChartFrame";
import { noAnimation } from "./chart-style";
import type { CategorySpending } from "./report-math";

// After Cashew's: an icon on each slice wide enough to hold one, and the chosen slice pulled out
// with its share beside its icon. The list beside it is how a keyboard chooses a slice.
export function SpendingPie({
  categories,
  selected,
  onSelect,
}: {
  categories: readonly CategorySpending[];
  selected: string | null;
  onSelect: (categoryId: string) => void;
}) {
  const { t } = useTranslation();
  const slices = categories.filter(({ share }) => share > 0);
  const isSelected = (index: number) => slices[index]?.categoryId === selected;

  function select(index: number) {
    const slice = slices[index];
    if (slice) onSelect(slice.categoryId);
  }

  return (
    <ChartFrame height={size.height}>
      <PieChart aria-label={t("reports.spending.chart")}>
        <Pie
          data={slices}
          dataKey="share"
          nameKey="name"
          startAngle={45}
          endAngle={-315}
          outerRadius={size.radius}
          stroke="var(--chart-surface)"
          strokeWidth={2}
          rootTabIndex={-1}
          className="cursor-pointer"
          shape={(props: PieSectorShapeProps) => (
            <Sector
              {...props}
              fill={swatchFill[slices[props.index]?.color ?? "slate"]}
              fillOpacity={isSelected(props.index) ? 0.8 : 0.5}
              outerRadius={props.outerRadius + (isSelected(props.index) ? size.pulledOut : 0)}
            />
          )}
          label={({ index, cx, cy, midAngle = 0, outerRadius }: PieLabelRenderProps) => {
            const slice = slices[index];
            if (!slice) return null;
            const chosen = isSelected(index);
            if (!chosen && slice.share < size.iconFrom) return null;
            const radius = (outerRadius + (chosen ? size.pulledOut : 0)) * size.iconAt;
            return (
              <Badge
                slice={slice}
                at={onCircle(cx, cy, radius, midAngle)}
                shareAbove={Math.sin((midAngle * Math.PI) / 180) > 0}
                chosen={chosen}
                onClick={() => onSelect(slice.categoryId)}
              />
            );
          }}
          labelLine={false}
          onClick={(_, index) => select(index)}
          {...noAnimation}
        />
      </PieChart>
    </ChartFrame>
  );
}

function Badge({
  slice,
  at,
  shareAbove,
  chosen,
  onClick,
}: {
  slice: CategorySpending;
  at: { x: number; y: number };
  shareAbove: boolean;
  chosen: boolean;
  onClick: () => void;
}) {
  const format = useFormat();
  const share = format.percent(slice.share);
  const fill = swatchFill[slice.color];

  return (
    <g
      className="cursor-pointer motion-safe:transition-transform"
      style={{ transform: `translate(${at.x}px, ${at.y}px) scale(${chosen ? 1.3 : 1})` }}
      onClick={onClick}
    >
      <circle r={size.icon} fill={fill} stroke="var(--chart-surface)" strokeWidth={3} />
      {createElement(iconFor(slice.icon), {
        x: -size.icon / 2,
        y: -size.icon / 2,
        width: size.icon,
        height: size.icon,
        color: "white",
      })}
      {chosen && (
        <g transform={`translate(0 ${(shareAbove ? -1 : 1) * size.shareOffset})`}>
          <rect
            x={-shareWidth(share) / 2}
            y={-size.shareHeight / 2}
            width={shareWidth(share)}
            height={size.shareHeight}
            rx={5}
            fill="var(--chart-surface)"
            stroke={fill}
            strokeWidth={1.5}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--chart-text)"
            fontSize={10}
            fontWeight="bold"
          >
            {share}
          </text>
        </g>
      )}
    </g>
  );
}

// Angles as Recharts gives them: in degrees, anticlockwise from three o'clock.
function onCircle(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy - radius * Math.sin(radians) };
}

function shareWidth(share: string): number {
  return share.length * 6 + 10;
}

// The height leaves room above and below the pie for a pulled-out slice's icon and share.
const size = {
  height: 320,
  radius: 100,
  pulledOut: 8,
  iconAt: 0.98,
  iconFrom: 0.05,
  icon: 16,
  shareOffset: 30,
  shareHeight: 18,
};
