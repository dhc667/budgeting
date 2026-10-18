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
import type { CategoryAmount } from "./report-math";

// After Cashew's: an icon on each slice wide enough to hold one, the chosen slice pulled out with
// its share beside its icon, and a faint ring around the hole. The list below it is how a keyboard
// chooses a slice.
export function CategoryPie({
  slices: amounts,
  chosen,
  onChoose,
}: {
  slices: readonly CategoryAmount[];
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const slices = amounts.filter(({ share }) => share > 0);
  const isChosen = (index: number) => slices[index]?.id === chosen;

  function choose(index: number) {
    const slice = slices[index];
    if (slice) onChoose(slice.id);
  }

  return (
    <ChartFrame className="aspect-[10/11] max-h-[28rem]">
      <PieChart aria-label={t("reports.byCategory.chart")} accessibilityLayer={false}>
        <Pie
          data={slices}
          dataKey="share"
          nameKey="name"
          startAngle={45}
          endAngle={-315}
          innerRadius={percentOf(size.hole)}
          outerRadius={percentOf(1)}
          stroke="var(--chart-background)"
          strokeWidth={2}
          rootTabIndex={-1}
          className="cursor-pointer"
          shape={(props: PieSectorShapeProps) => (
            <Sector
              {...props}
              fill={swatchFill[slices[props.index]?.color ?? "slate"]}
              fillOpacity={isChosen(props.index) ? 0.8 : 0.5}
              outerRadius={props.outerRadius + (isChosen(props.index) ? size.pulledOut : 0)}
            />
          )}
          label={({ index, cx, cy, midAngle = 0, outerRadius }: PieLabelRenderProps) => {
            const slice = slices[index];
            if (!slice) return null;
            const pulledOut = isChosen(index);
            if (!pulledOut && slice.share < size.iconFrom) return null;
            const radius = (outerRadius + (pulledOut ? size.pulledOut : 0)) * size.iconAt;
            return (
              <Badge
                slice={slice}
                at={onCircle(cx, cy, radius, midAngle)}
                shareAbove={Math.sin((midAngle * Math.PI) / 180) > 0}
                chosen={pulledOut}
                onClick={() => onChoose(slice.id)}
              />
            );
          }}
          labelLine={false}
          onClick={(_, index) => choose(index)}
          {...noAnimation}
        />
        <Pie
          data={[{ ring: 1 }]}
          dataKey="ring"
          innerRadius={percentOf(size.hole)}
          outerRadius={percentOf(size.ring)}
          fill="var(--chart-background)"
          fillOpacity={0.2}
          stroke="none"
          rootTabIndex={-1}
          className="pointer-events-none"
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
  slice: CategoryAmount;
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
      <circle r={size.icon} fill={fill} stroke="var(--chart-background)" strokeWidth={3} />
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
            fill="var(--chart-background)"
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

// Of the largest circle the chart holds.
function percentOf(radius: number): string {
  return `${radius * size.radius * 100}%`;
}

function shareWidth(share: string): number {
  return share.length * 6 + 10;
}

// The frame is taller than wide, leaving room above and below the pie for a pulled-out slice's
// share. The hole and the ring around it are Cashew's, as fractions of the radius.
const size = {
  radius: 0.8,
  hole: 0.4,
  ring: 0.525,
  pulledOut: 8,
  iconAt: 0.98,
  iconFrom: 0.05,
  icon: 16,
  shareOffset: 30,
  shareHeight: 18,
};
