import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Location = {
  location_id: string;
  display_name: string;
  latitude: number;
  longitude: number;
};

type TrafficRecord = {
  month: string;
  day_of_week: string;
  hour: number;
  location_id: string;
  avg_count: number;
};

type MarkerRecord = TrafficRecord & {
  location: Location;
};

type TrendPoint = {
  month: string;
  monthLabel: string;
  shortMonthLabel: string;
  avgCount: number | null;
  movingAverage: number | null;
};

type WeeklyComparisonPoint = {
  dayOfWeek: string;
  hour: number;
  label: string;
  firstCount: number | null;
  secondCount: number | null;
};

type SummaryTableRow = {
  locationId: string;
  locationName: string;
  currentAverage: number | null;
  oneYearChange: number | null;
  preCovidChange: number | null;
};

type Coordinate = [number, number];

type Street = {
  name: string;
  kind: "primary" | "secondary" | "lane" | "waterfront";
  points: Coordinate[];
};

type BasemapRoad = Street & {
  id: string;
};

type BasemapBuilding = {
  id: string;
  points: Coordinate[];
};

type BasemapData = {
  buildings: BasemapBuilding[];
  roads: BasemapRoad[];
};

type Point = {
  x: number;
  y: number;
};

type FlowAnimationTiming = {
  particleCount: number;
  spawnInterval: number;
  cycleDuration: number;
};

type FlowPath = {
  distance: number;
  start: Point;
  middle: Point;
  end: Point;
};

type FlowParticle = {
  key: string;
  path: string;
  staticPoint: Point;
  duration: number;
  begin: number;
  activeKeyTime: number;
};

const DATA_URLS = {
  locations: `${import.meta.env.BASE_URL}data/locations.json`,
  counts: `${import.meta.env.BASE_URL}data/foottraffic-month-hour-weekday.json`,
  basemap: `${import.meta.env.BASE_URL}data/cbd-basemap.json`,
};

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const HOURS_OF_DAY = Array.from({ length: 24 }, (_, hour) => hour);

const MAP_BOUNDS = {
  minLon: 174.75995,
  maxLon: 174.76985,
  minLat: -36.85815,
  maxLat: -36.84285,
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 760;
const FLOW_PATH_LENGTH = 112;
const FLOW_DOT_SPEED = 42;
const FLOW_SIMULATED_SECONDS_PER_REAL_SECOND = 5;
const FLOW_REAL_SECONDS_PER_TRAFFIC_MINUTE = 60 / FLOW_SIMULATED_SECONDS_PER_REAL_SECOND;
const FLOW_MAX_TRAVEL_SECONDS = (FLOW_PATH_LENGTH + 72) / FLOW_DOT_SPEED;
const FLOW_DOT_RADIUS = 5;
const FLOW_ANCHOR_RADIUS = 8;
const FLOW_MAX_PARTICLES_PER_LOCATION = 40;
const FLOW_MIN_SPAWN_INTERVAL_SECONDS = 0.08;
const FLOW_MIN_CYCLE_DURATION_SECONDS = 0.8;
const FLOW_MAX_CYCLE_DURATION_SECONDS = 30;
const FLOW_EDGE_OPACITY = 0;
const FLOW_PEAK_OPACITY = 0.88;
const FLOW_STATIC_OPACITY = 0.58;
const CHART_WIDTH = 960;
const CHART_HEIGHT = 420;
const CHART_PADDING = {
  top: 28,
  right: 24,
  bottom: 52,
  left: 72,
};
const WEEKLY_CHART_PADDING = {
  top: 36,
  right: 24,
  bottom: 72,
  left: 72,
};
const MOVING_AVERAGE_MONTHS = 6;
const MIN_CONSECUTIVE_MONTHS_FOR_AVERAGE = 6;
const PRE_COVID_CUTOFF_MONTH = "2020-03";
const MAP_PADDING = 28;
const METERS_PER_DEGREE_LATITUDE = 111_320;
const MAP_VERTICAL_SCALE = 0.42;
const CENTER_LATITUDE = (MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2;
const METERS_PER_DEGREE_LONGITUDE =
  METERS_PER_DEGREE_LATITUDE * Math.cos((CENTER_LATITUDE * Math.PI) / 180);
const PROJECTED_BOUNDS = {
  width: (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) * METERS_PER_DEGREE_LONGITUDE,
  height: (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * METERS_PER_DEGREE_LATITUDE * MAP_VERTICAL_SCALE,
};
const MAP_ROTATION_RADIANS = 0;
const MAP_ZOOM = 0.98;
const MAP_CENTER = {
  x: PROJECTED_BOUNDS.width / 2,
  y: PROJECTED_BOUNDS.height / 2,
};
const ROTATED_MAP_CORNERS = [
  [0, 0],
  [PROJECTED_BOUNDS.width, 0],
  [PROJECTED_BOUNDS.width, PROJECTED_BOUNDS.height],
  [0, PROJECTED_BOUNDS.height],
].map(([x, y]) => rotateMapPoint(x, y));
const ROTATED_BOUNDS = {
  minX: Math.min(...ROTATED_MAP_CORNERS.map((point) => point.x)),
  maxX: Math.max(...ROTATED_MAP_CORNERS.map((point) => point.x)),
  minY: Math.min(...ROTATED_MAP_CORNERS.map((point) => point.y)),
  maxY: Math.max(...ROTATED_MAP_CORNERS.map((point) => point.y)),
};
const MAP_SCALE = Math.min(
  (MAP_WIDTH - MAP_PADDING * 2) / (ROTATED_BOUNDS.maxX - ROTATED_BOUNDS.minX),
  (MAP_HEIGHT - MAP_PADDING * 2) / (ROTATED_BOUNDS.maxY - ROTATED_BOUNDS.minY),
) * MAP_ZOOM;
const MAP_OFFSET = {
  x: (MAP_WIDTH - (ROTATED_BOUNDS.maxX - ROTATED_BOUNDS.minX) * MAP_SCALE) / 2,
  y: (MAP_HEIGHT - (ROTATED_BOUNDS.maxY - ROTATED_BOUNDS.minY) * MAP_SCALE) / 2,
};

function rotateMapPoint(x: number, y: number) {
  const centeredX = x - MAP_CENTER.x;
  const centeredY = y - MAP_CENTER.y;
  const cos = Math.cos(MAP_ROTATION_RADIANS);
  const sin = Math.sin(MAP_ROTATION_RADIANS);

  return {
    x: centeredX * cos - centeredY * sin,
    y: centeredX * sin + centeredY * cos,
  };
}

function projectCoordinate([lon, lat]: Coordinate) {
  const projectedX = (lon - MAP_BOUNDS.minLon) * METERS_PER_DEGREE_LONGITUDE;
  const projectedY = (MAP_BOUNDS.maxLat - lat) * METERS_PER_DEGREE_LATITUDE * MAP_VERTICAL_SCALE;
  const rotated = rotateMapPoint(projectedX, projectedY);

  return {
    x: MAP_OFFSET.x + (rotated.x - ROTATED_BOUNDS.minX) * MAP_SCALE,
    y: MAP_OFFSET.y + (rotated.y - ROTATED_BOUNDS.minY) * MAP_SCALE,
  };
}

function streetPath(points: Coordinate[]) {
  return points
    .map((point, index) => {
      const { x, y } = projectCoordinate(point);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function polygonPoints(points: Coordinate[]) {
  return points
    .map((point) => {
      const { x, y } = projectCoordinate(point);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function closestPointOnSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);

  return {
    point: {
      x: start.x + dx * t,
      y: start.y + dy * t,
    },
    dx,
    dy,
  };
}

function hashNoise(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}

function nearestStreetFlow(point: Point, roads: Street[]) {
  let best = {
    distanceSquared: Number.POSITIVE_INFINITY,
    dx: 1,
    dy: 0,
  };

  roads.forEach((street) => {
    street.points.slice(0, -1).forEach((coordinate, index) => {
      const start = projectCoordinate(coordinate);
      const end = projectCoordinate(street.points[index + 1]);
      const candidate = closestPointOnSegment(point, start, end);
      const xDistance = point.x - candidate.point.x;
      const yDistance = point.y - candidate.point.y;
      const distanceSquared = xDistance * xDistance + yDistance * yDistance;

      if (distanceSquared < best.distanceSquared) {
        best = {
          distanceSquared,
          dx: candidate.dx,
          dy: candidate.dy,
        };
      }
    });
  });

  const magnitude = Math.hypot(best.dx, best.dy) || 1;
  const unitX = best.dx / magnitude;
  const unitY = best.dy / magnitude;

  return { unitX, unitY };
}

function flowPath(point: Point, length: number, seed: string, roads: Street[], reverse = false) {
  const { unitX, unitY } = nearestStreetFlow(point, roads);
  const perpendicularX = -unitY;
  const perpendicularY = unitX;
  const startSideNoise = hashNoise(`${seed}:start-side`) * 20;
  const endSideNoise = hashNoise(`${seed}:end-side`) * 20;
  const startAxisNoise = hashNoise(`${seed}:start-axis`) * 16;
  const endAxisNoise = hashNoise(`${seed}:end-axis`) * 16;
  const startVerticalNoise = hashNoise(`${seed}:start-y`) * 14;
  const endVerticalNoise = hashNoise(`${seed}:end-y`) * 14;

  const start = {
    x: point.x - unitX * length * 0.5 + perpendicularX * startSideNoise - unitX * startAxisNoise,
    y:
      point.y -
      unitY * length * 0.5 +
      perpendicularY * startSideNoise -
      unitY * startAxisNoise +
      startVerticalNoise,
  };
  const end = {
    x: point.x + unitX * length * 0.5 + perpendicularX * endSideNoise + unitX * endAxisNoise,
    y:
      point.y +
      unitY * length * 0.5 +
      perpendicularY * endSideNoise +
      unitY * endAxisNoise +
      endVerticalNoise,
  };

  const [pathStart, pathEnd] = reverse ? [end, start] : [start, end];
  const pathDistance =
    Math.hypot(point.x - pathStart.x, point.y - pathStart.y) +
    Math.hypot(pathEnd.x - point.x, pathEnd.y - point.y);

  return {
    distance: pathDistance,
    start: pathStart,
    middle: point,
    end: pathEnd,
  };
}

function flowAnimationTiming(avgCount: number): FlowAnimationTiming | null {
  const pedestriansPerSecond =
    (avgCount / 3600) * FLOW_SIMULATED_SECONDS_PER_REAL_SECOND;

  if (!Number.isFinite(pedestriansPerSecond) || pedestriansPerSecond <= 0) {
    return null;
  }

  const rawParticleCount = Math.ceil(pedestriansPerSecond * FLOW_MAX_TRAVEL_SECONDS);
  const particleCount = clamp(rawParticleCount, 1, FLOW_MAX_PARTICLES_PER_LOCATION);
  const rawSpawnInterval = 1 / pedestriansPerSecond;
  const rawCycleDuration = rawSpawnInterval * particleCount;

  if (
    !Number.isFinite(rawSpawnInterval) ||
    rawSpawnInterval <= 0 ||
    !Number.isFinite(rawCycleDuration) ||
    rawCycleDuration <= 0
  ) {
    return null;
  }

  return {
    particleCount,
    spawnInterval: clamp(
      rawSpawnInterval,
      FLOW_MIN_SPAWN_INTERVAL_SECONDS,
      FLOW_MAX_CYCLE_DURATION_SECONDS,
    ),
    cycleDuration: clamp(
      rawCycleDuration,
      FLOW_MIN_CYCLE_DURATION_SECONDS,
      FLOW_MAX_CYCLE_DURATION_SECONDS,
    ),
  };
}

function flowPathD(path: FlowPath) {
  return [
    `M ${path.start.x.toFixed(1)} ${path.start.y.toFixed(1)}`,
    `L ${path.middle.x.toFixed(1)} ${path.middle.y.toFixed(1)}`,
    `L ${path.end.x.toFixed(1)} ${path.end.y.toFixed(1)}`,
  ].join(" ");
}

function pointBetween(start: Point, end: Point, progress: number): Point {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function distanceBetween(start: Point, end: Point) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function pointAlongFlowPath(path: FlowPath, progress: number): Point {
  const firstSegmentDistance = distanceBetween(path.start, path.middle);
  const secondSegmentDistance = distanceBetween(path.middle, path.end);
  const targetDistance = path.distance * clamp(progress, 0, 1);

  if (targetDistance <= firstSegmentDistance || secondSegmentDistance === 0) {
    return pointBetween(
      path.start,
      path.middle,
      firstSegmentDistance === 0 ? 1 : targetDistance / firstSegmentDistance,
    );
  }

  return pointBetween(
    path.middle,
    path.end,
    (targetDistance - firstSegmentDistance) / secondSegmentDistance,
  );
}

function flowMotionTiming(path: FlowPath, animationTiming: FlowAnimationTiming) {
  const flowDuration = path.distance / FLOW_DOT_SPEED;
  const activeKeyTime = clamp(flowDuration / animationTiming.cycleDuration, 0.001, 0.998);

  return {
    duration: animationTiming.cycleDuration,
    activeKeyTime,
  };
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NZ", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1));
}

function formatShortMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NZ", {
    month: "short",
    year: "2-digit",
  }).format(new Date(year, month - 1));
}

function formatHour(hour: number) {
  if (hour === 0) {
    return "12am";
  }
  if (hour === 12) {
    return "12pm";
  }
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function sortDaysOfWeek(days: string[]) {
  return [...days].sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCount(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(value);
}

function formatPercentChange(value: number | null) {
  if (value === null) {
    return "Not enough data";
  }

  return new Intl.NumberFormat("en-NZ", {
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
    style: "percent",
  }).format(value);
}

function rollingAverageForMonth(
  months: string[],
  countByMonth: Map<string, number>,
  endMonth: string | undefined,
) {
  if (!endMonth) {
    return null;
  }

  const endIndex = months.indexOf(endMonth);
  if (endIndex < MIN_CONSECUTIVE_MONTHS_FOR_AVERAGE - 1) {
    return null;
  }

  const windowMonths = months.slice(endIndex - MOVING_AVERAGE_MONTHS + 1, endIndex + 1);
  const windowValues = windowMonths.map((month) => countByMonth.get(month));

  if (
    windowMonths.length !== MOVING_AVERAGE_MONTHS ||
    windowValues.some((value) => value === undefined)
  ) {
    return null;
  }

  return (windowValues as number[]).reduce((total, value) => total + value, 0) / windowValues.length;
}

function percentChange(current: number | null, comparison: number | null) {
  if (current === null || comparison === null || comparison === 0) {
    return null;
  }

  return (current - comparison) / comparison;
}

function sameMonthPreviousYear(months: string[], currentMonth: string | undefined) {
  if (!currentMonth) {
    return undefined;
  }

  const [year, month] = currentMonth.split("-").map(Number);
  const targetMonth = `${year - 1}-${String(month).padStart(2, "0")}`;
  return months.includes(targetMonth) ? targetMonth : undefined;
}

function equivalentPreCovidMonth(months: string[], currentMonth: string | undefined) {
  if (!currentMonth) {
    return undefined;
  }

  const monthNumber = currentMonth.slice(5);
  return months
    .filter((month) => month < PRE_COVID_CUTOFF_MONTH && month.endsWith(`-${monthNumber}`))
    .at(-1);
}

function chartX(index: number, total: number) {
  const drawableWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  if (total <= 1) {
    return CHART_PADDING.left + drawableWidth / 2;
  }
  return CHART_PADDING.left + (index / (total - 1)) * drawableWidth;
}

function chartY(value: number, maxValue: number) {
  const drawableHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const scale = maxValue > 0 ? value / maxValue : 0;
  return CHART_HEIGHT - CHART_PADDING.bottom - scale * drawableHeight;
}

function weeklyChartX(index: number, total: number) {
  const drawableWidth = CHART_WIDTH - WEEKLY_CHART_PADDING.left - WEEKLY_CHART_PADDING.right;
  if (total <= 1) {
    return WEEKLY_CHART_PADDING.left + drawableWidth / 2;
  }
  return WEEKLY_CHART_PADDING.left + (index / (total - 1)) * drawableWidth;
}

function weeklyChartY(value: number, maxValue: number) {
  const drawableHeight = CHART_HEIGHT - WEEKLY_CHART_PADDING.top - WEEKLY_CHART_PADDING.bottom;
  const scale = maxValue > 0 ? value / maxValue : 0;
  return CHART_HEIGHT - WEEKLY_CHART_PADDING.bottom - scale * drawableHeight;
}

function weeklyLineSegments(
  points: WeeklyComparisonPoint[],
  key: "firstCount" | "secondCount",
  yMax: number,
) {
  const lineSegments: string[] = [];
  let currentSegment: string[] = [];

  points.forEach((point, index) => {
    const value = point[key];
    if (value === null) {
      if (currentSegment.length > 0) {
        lineSegments.push(currentSegment.join(" "));
        currentSegment = [];
      }
      return;
    }

    currentSegment.push(
      `${weeklyChartX(index, points.length).toFixed(1)},${weeklyChartY(value, yMax).toFixed(1)}`,
    );
  });

  if (currentSegment.length > 0) {
    lineSegments.push(currentSegment.join(" "));
  }

  return lineSegments;
}

function NativeTrendChart({ points }: { points: TrendPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const availablePoints = points.filter(
    (point): point is TrendPoint & { avgCount: number } => point.avgCount !== null,
  );
  const movingAverageValues = points
    .map((point) => point.movingAverage)
    .filter((value): value is number => value !== null);
  const maxValue = Math.max(
    ...availablePoints.map((point) => point.avgCount),
    ...movingAverageValues,
    1,
  );
  const yMax = Math.ceil((maxValue * 1.1) / 100) * 100 || 100;
  const yTicks = [0, yMax / 2, yMax];
  const lineSegments: string[] = [];
  let currentSegment: string[] = [];

  points.forEach((point, index) => {
    if (point.movingAverage === null) {
      if (currentSegment.length > 0) {
        lineSegments.push(currentSegment.join(" "));
        currentSegment = [];
      }
      return;
    }

    currentSegment.push(
      `${chartX(index, points.length).toFixed(1)},${chartY(point.movingAverage, yMax).toFixed(1)}`,
    );
  });

  if (currentSegment.length > 0) {
    lineSegments.push(currentSegment.join(" "));
  }

  const xTickStep = Math.max(1, Math.ceil(points.length / 8));
  const hoveredPoint =
    hoveredIndex !== null && points[hoveredIndex]?.avgCount !== null
      ? (points[hoveredIndex] as TrendPoint & { avgCount: number })
      : null;
  const tooltipWidth = 210;
  const tooltipHeight = 70;
  const tooltipX =
    hoveredIndex !== null
      ? clamp(
          chartX(hoveredIndex, points.length) + 12,
          CHART_PADDING.left,
          CHART_WIDTH - CHART_PADDING.right - tooltipWidth,
        )
      : CHART_PADDING.left;
  const tooltipY =
    hoveredPoint && hoveredIndex !== null
      ? clamp(
          chartY(hoveredPoint.avgCount, yMax) - tooltipHeight - 14,
          CHART_PADDING.top,
          CHART_HEIGHT - CHART_PADDING.bottom - tooltipHeight,
        )
      : CHART_PADDING.top;

  return (
    <svg
      className="trend-svg"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label="Raw monthly pedestrian count trend"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <rect className="chart-background" width={CHART_WIDTH} height={CHART_HEIGHT} rx="22" />
      {yTicks.map((tick) => {
        const y = chartY(tick, yMax);
        return (
          <g key={tick} className="chart-gridline">
            <line x1={CHART_PADDING.left} x2={CHART_WIDTH - CHART_PADDING.right} y1={y} y2={y} />
            <text x={CHART_PADDING.left - 14} y={y + 4} textAnchor="end">
              {formatCompactCount(tick)}
            </text>
          </g>
        );
      })}
      {lineSegments.map((linePoints, index) => (
        <polyline key={index} className="moving-average-line" points={linePoints} />
      ))}
      <text
        className="chart-axis-label"
        x={18}
        y={CHART_HEIGHT / 2}
        textAnchor="middle"
        transform={`rotate(-90 18 ${CHART_HEIGHT / 2})`}
      >
        Pedestrian counts
      </text>
      {points.map((point, index) => {
        if (index % xTickStep !== 0 && index !== points.length - 1) {
          return null;
        }
        const x = chartX(index, points.length);
        return (
          <g key={point.month} className="chart-x-tick">
            <line
              x1={x}
              x2={x}
              y1={CHART_HEIGHT - CHART_PADDING.bottom}
              y2={CHART_HEIGHT - CHART_PADDING.bottom + 6}
            />
            <text x={x} y={CHART_HEIGHT - CHART_PADDING.bottom + 25} textAnchor="middle">
              {point.shortMonthLabel}
            </text>
          </g>
        );
      })}
      {points.map((point, index) =>
        point.avgCount === null ? null : (
          <circle
            key={`${point.month}-point`}
            className="trend-point"
            cx={chartX(index, points.length)}
            cy={chartY(point.avgCount, yMax)}
            r="4"
          >
            <title>
              {point.monthLabel}: {formatCount(point.avgCount)} average pedestrians
            </title>
          </circle>
        ),
      )}
      {points.map((point, index) => (
        <rect
          key={`${point.month}-hover-zone`}
          className="chart-hover-zone"
          x={
            index === 0
              ? CHART_PADDING.left
              : (chartX(index - 1, points.length) + chartX(index, points.length)) / 2
          }
          y={CHART_PADDING.top}
          width={
            index === points.length - 1
              ? CHART_WIDTH -
                CHART_PADDING.right -
                (chartX(index - 1, points.length) + chartX(index, points.length)) / 2
              : (chartX(index + 1, points.length) - chartX(Math.max(0, index - 1), points.length)) /
                2
          }
          height={CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom}
          onMouseEnter={() => setHoveredIndex(index)}
          onFocus={() => setHoveredIndex(index)}
        />
      ))}
      {hoveredPoint ? (
        <g className="chart-hover" onMouseLeave={() => setHoveredIndex(null)}>
          {hoveredIndex !== null ? (
            <line
              className="chart-hover-line"
              x1={chartX(hoveredIndex, points.length)}
              x2={chartX(hoveredIndex, points.length)}
              y1={CHART_PADDING.top}
              y2={CHART_HEIGHT - CHART_PADDING.bottom}
            />
          ) : null}
          <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="12" />
          <text x={tooltipX + 12} y={tooltipY + 22}>
            {hoveredPoint.monthLabel}
          </text>
          <text x={tooltipX + 12} y={tooltipY + 42}>
            Raw: {formatCount(hoveredPoint.avgCount)} pedestrians
          </text>
          <text x={tooltipX + 12} y={tooltipY + 60}>
            6-mo avg:{" "}
            {hoveredPoint.movingAverage === null
              ? "not enough data"
              : `${formatCount(hoveredPoint.movingAverage)} pedestrians`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function NativeWeeklyComparisonChart({
  points,
  firstMonthLabel,
  secondMonthLabel,
}: {
  points: WeeklyComparisonPoint[];
  firstMonthLabel: string;
  secondMonthLabel: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = points.flatMap((point) =>
    [point.firstCount, point.secondCount].filter((value): value is number => value !== null),
  );
  const maxValue = Math.max(...values, 1);
  const yMax = Math.ceil((maxValue * 1.1) / 100) * 100 || 100;
  const yTicks = [0, yMax / 2, yMax];
  const firstLineSegments = weeklyLineSegments(points, "firstCount", yMax);
  const secondLineSegments = weeklyLineSegments(points, "secondCount", yMax);
  const xTicks = [
    ...DAYS_OF_WEEK.map((dayOfWeek) => ({
      label: `${dayOfWeek.slice(0, 3)} ${formatHour(0)}`,
      index: points.findIndex((point) => point.dayOfWeek === dayOfWeek && point.hour === 0),
    })),
    {
      label: `Sun ${formatHour(23)}`,
      index: points.length - 1,
    },
  ].filter((tick) => tick.index >= 0);
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];
  const tooltipWidth = 250;
  const tooltipHeight = 82;
  const tooltipX =
    hoveredIndex !== null
      ? clamp(
          weeklyChartX(hoveredIndex, points.length) + 12,
          WEEKLY_CHART_PADDING.left,
          CHART_WIDTH - WEEKLY_CHART_PADDING.right - tooltipWidth,
        )
      : WEEKLY_CHART_PADDING.left;
  const hoveredMaxValue = hoveredPoint
    ? Math.max(hoveredPoint.firstCount ?? 0, hoveredPoint.secondCount ?? 0)
    : 0;
  const tooltipY = hoveredPoint
    ? clamp(
        weeklyChartY(hoveredMaxValue, yMax) - tooltipHeight - 14,
        WEEKLY_CHART_PADDING.top,
        CHART_HEIGHT - WEEKLY_CHART_PADDING.bottom - tooltipHeight,
      )
    : WEEKLY_CHART_PADDING.top;

  return (
    <svg
      className="trend-svg"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={`Hourly week pedestrian counts comparing ${firstMonthLabel} and ${secondMonthLabel}`}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <rect className="chart-background" width={CHART_WIDTH} height={CHART_HEIGHT} rx="22" />
      {yTicks.map((tick) => {
        const y = weeklyChartY(tick, yMax);
        return (
          <g key={tick} className="chart-gridline">
            <line
              x1={WEEKLY_CHART_PADDING.left}
              x2={CHART_WIDTH - WEEKLY_CHART_PADDING.right}
              y1={y}
              y2={y}
            />
            <text x={WEEKLY_CHART_PADDING.left - 14} y={y + 4} textAnchor="end">
              {formatCompactCount(tick)}
            </text>
          </g>
        );
      })}
      {xTicks.map((tick) => {
        const x = weeklyChartX(tick.index, points.length);
        return (
          <g key={`${tick.label}-${tick.index}`} className="chart-x-tick">
            <line
              x1={x}
              x2={x}
              y1={CHART_HEIGHT - WEEKLY_CHART_PADDING.bottom}
              y2={CHART_HEIGHT - WEEKLY_CHART_PADDING.bottom + 6}
            />
            <text x={x} y={CHART_HEIGHT - WEEKLY_CHART_PADDING.bottom + 25} textAnchor="middle">
              {tick.label}
            </text>
          </g>
        );
      })}
      <text
        className="chart-axis-label"
        x={CHART_WIDTH / 2}
        y={CHART_HEIGHT - 18}
        textAnchor="middle"
      >
        Hour of week
      </text>
      <text
        className="chart-axis-label"
        x={18}
        y={CHART_HEIGHT / 2}
        textAnchor="middle"
        transform={`rotate(-90 18 ${CHART_HEIGHT / 2})`}
      >
        Pedestrian counts
      </text>
      {firstLineSegments.map((linePoints, index) => (
        <polyline
          key={`first-${index}`}
          className="weekly-comparison-line weekly-comparison-line-first"
          points={linePoints}
        />
      ))}
      {secondLineSegments.map((linePoints, index) => (
        <polyline
          key={`second-${index}`}
          className="weekly-comparison-line weekly-comparison-line-second"
          points={linePoints}
        />
      ))}
      {points.map((point, index) =>
        point.firstCount === null ? null : (
          <circle
            key={`${point.label}-first-point`}
            className="weekly-comparison-point weekly-comparison-point-first"
            cx={weeklyChartX(index, points.length)}
            cy={weeklyChartY(point.firstCount, yMax)}
            r="3.2"
          >
            <title>
              {firstMonthLabel}, {point.label}: {formatCount(point.firstCount)} pedestrians
            </title>
          </circle>
        ),
      )}
      {points.map((point, index) =>
        point.secondCount === null ? null : (
          <circle
            key={`${point.label}-second-point`}
            className="weekly-comparison-point weekly-comparison-point-second"
            cx={weeklyChartX(index, points.length)}
            cy={weeklyChartY(point.secondCount, yMax)}
            r="3.2"
          >
            <title>
              {secondMonthLabel}, {point.label}: {formatCount(point.secondCount)} pedestrians
            </title>
          </circle>
        ),
      )}
      {points.map((point, index) => (
        <rect
          key={`${point.label}-hover-zone`}
          className="chart-hover-zone"
          x={
            index === 0
              ? WEEKLY_CHART_PADDING.left
              : (weeklyChartX(index - 1, points.length) + weeklyChartX(index, points.length)) / 2
          }
          y={WEEKLY_CHART_PADDING.top}
          width={
            index === points.length - 1
              ? CHART_WIDTH -
                WEEKLY_CHART_PADDING.right -
                (weeklyChartX(index - 1, points.length) + weeklyChartX(index, points.length)) / 2
              : (weeklyChartX(index + 1, points.length) -
                  weeklyChartX(Math.max(0, index - 1), points.length)) /
                2
          }
          height={CHART_HEIGHT - WEEKLY_CHART_PADDING.top - WEEKLY_CHART_PADDING.bottom}
          onMouseEnter={() => setHoveredIndex(index)}
          onFocus={() => setHoveredIndex(index)}
        />
      ))}
      {hoveredPoint ? (
        <g className="chart-hover" onMouseLeave={() => setHoveredIndex(null)}>
          {hoveredIndex !== null ? (
            <line
              className="chart-hover-line"
              x1={weeklyChartX(hoveredIndex, points.length)}
              x2={weeklyChartX(hoveredIndex, points.length)}
              y1={WEEKLY_CHART_PADDING.top}
              y2={CHART_HEIGHT - WEEKLY_CHART_PADDING.bottom}
            />
          ) : null}
          <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="12" />
          <text x={tooltipX + 12} y={tooltipY + 22}>
            {hoveredPoint.label}
          </text>
          <text x={tooltipX + 12} y={tooltipY + 44}>
            {firstMonthLabel}:{" "}
            {hoveredPoint.firstCount === null
              ? "no data"
              : `${formatCount(hoveredPoint.firstCount)} pedestrians`}
          </text>
          <text x={tooltipX + 12} y={tooltipY + 64}>
            {secondMonthLabel}:{" "}
            {hoveredPoint.secondCount === null
              ? "no data"
              : `${formatCount(hoveredPoint.secondCount)} pedestrians`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function FlowStreams({
  visibleRecords,
  mapRoads,
}: {
  visibleRecords: MarkerRecord[];
  mapRoads: Street[];
}) {
  const streams = useMemo(
    () =>
      visibleRecords.map((record) => {
        const point = projectCoordinate([
          record.location.longitude,
          record.location.latitude,
        ]);
        const animationTiming = flowAnimationTiming(record.avg_count);
        const particles: FlowParticle[] = animationTiming
          ? Array.from({ length: animationTiming.particleCount }, (_, index) => {
              const motionPath = flowPath(
                point,
                FLOW_PATH_LENGTH,
                [
                  record.location_id,
                  record.month,
                  record.day_of_week,
                  record.hour,
                  index,
                ].join(":"),
                mapRoads,
                index % 2 === 1,
              );
              const { duration, activeKeyTime } = flowMotionTiming(motionPath, animationTiming);
              const staticProgress =
                animationTiming.particleCount === 1
                  ? 0.5
                  : index / (animationTiming.particleCount - 1);

              return {
                key: `${record.location_id}-${index}`,
                path: flowPathD(motionPath),
                staticPoint: pointAlongFlowPath(motionPath, staticProgress),
                duration,
                begin: -index * animationTiming.spawnInterval,
                activeKeyTime,
              };
            })
          : [];

        return {
          key: record.location_id,
          point,
          particles,
        };
      }),
    [mapRoads, visibleRecords],
  );

  return (
    <g className="flow-streams" aria-hidden="true">
      {streams.map((stream) => {
        return (
          <g key={stream.key}>
            {stream.particles.map((particle) => {
              const peakKeyTime = particle.activeKeyTime / 2;

              return (
                <g key={particle.key}>
                  <circle
                    className="flow-dot flow-dot-static"
                    cx={particle.staticPoint.x}
                    cy={particle.staticPoint.y}
                    r={FLOW_DOT_RADIUS}
                    opacity={FLOW_STATIC_OPACITY}
                  />
                  <circle
                    className="flow-dot flow-dot-motion"
                    r={FLOW_DOT_RADIUS}
                    opacity={FLOW_EDGE_OPACITY}
                  >
                    <animateMotion
                      path={particle.path}
                      dur={`${particle.duration}s`}
                      begin={`${particle.begin}s`}
                      keyPoints={`0;1;1`}
                      keyTimes={`0;${particle.activeKeyTime};1`}
                      calcMode="linear"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values={`${FLOW_EDGE_OPACITY};${FLOW_PEAK_OPACITY};${FLOW_EDGE_OPACITY};${FLOW_EDGE_OPACITY}`}
                      keyTimes={`0;${peakKeyTime};${particle.activeKeyTime};1`}
                      dur={`${particle.duration}s`}
                      begin={`${particle.begin}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              );
            })}
            <circle
              className="flow-anchor"
              cx={stream.point.x}
              cy={stream.point.y}
              r={FLOW_ANCHOR_RADIUS}
            />
          </g>
        );
      })}
    </g>
  );
}

function App() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [trafficRecords, setTrafficRecords] = useState<TrafficRecord[]>([]);
  const [basemap, setBasemap] = useState<BasemapData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedMapDayOfWeek, setSelectedMapDayOfWeek] = useState("");
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedTrendLocationId, setSelectedTrendLocationId] = useState("");
  const [selectedTrendDayOfWeek, setSelectedTrendDayOfWeek] = useState("");
  const [selectedTrendHour, setSelectedTrendHour] = useState(12);
  const [selectedComparisonLocationId, setSelectedComparisonLocationId] = useState("");
  const [selectedComparisonFirstMonth, setSelectedComparisonFirstMonth] = useState("");
  const [selectedComparisonSecondMonth, setSelectedComparisonSecondMonth] = useState("");
  const [selectedTableDayOfWeek, setSelectedTableDayOfWeek] = useState("");
  const [selectedTableHour, setSelectedTableHour] = useState(12);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [locationsResponse, countsResponse, basemapResponse] = await Promise.all([
          fetch(DATA_URLS.locations),
          fetch(DATA_URLS.counts),
          fetch(DATA_URLS.basemap),
        ]);

        if (!locationsResponse.ok || !countsResponse.ok || !basemapResponse.ok) {
          throw new Error("Generated data files could not be loaded.");
        }

        const [loadedLocations, loadedCounts, loadedBasemap] = (await Promise.all([
          locationsResponse.json(),
          countsResponse.json(),
          basemapResponse.json(),
        ])) as [Location[], TrafficRecord[], BasemapData];

        if (cancelled) {
          return;
        }

        const usableCounts = loadedCounts.filter((record) => record.avg_count !== 0);
        const months = [...new Set(usableCounts.map((record) => record.month))].sort();
        const daysOfWeek = sortDaysOfWeek([
          ...new Set(usableCounts.map((record) => record.day_of_week)),
        ]);
        const loadedHours = [...new Set(usableCounts.map((record) => record.hour))].sort(
          (a, b) => a - b,
        );

        setLocations(loadedLocations);
        setTrafficRecords(usableCounts);
        setBasemap(loadedBasemap);
        setSelectedMonth(months.at(-1) ?? "");
        setSelectedMapDayOfWeek(daysOfWeek[0] ?? "");
        setSelectedTrendLocationId(loadedLocations[0]?.location_id ?? "");
        setSelectedTrendDayOfWeek(daysOfWeek[0] ?? "");
        setSelectedComparisonLocationId(loadedLocations[0]?.location_id ?? "");
        setSelectedComparisonFirstMonth(
          equivalentPreCovidMonth(months, months.at(-1)) ?? months[0] ?? "",
        );
        setSelectedComparisonSecondMonth(months.at(-1) ?? "");
        setSelectedTableDayOfWeek(daysOfWeek[0] ?? "");
        setSelectedHour(loadedHours.includes(12) ? 12 : (loadedHours[0] ?? 0));
        setSelectedTrendHour(loadedHours.includes(12) ? 12 : (loadedHours[0] ?? 0));
        setSelectedTableHour(loadedHours.includes(12) ? 12 : (loadedHours[0] ?? 0));
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load map data.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const months = useMemo(
    () => [...new Set(trafficRecords.map((record) => record.month))].sort(),
    [trafficRecords],
  );

  const hours = useMemo(
    () => [...new Set(trafficRecords.map((record) => record.hour))].sort((a, b) => a - b),
    [trafficRecords],
  );

  const daysOfWeek = useMemo(
    () => sortDaysOfWeek([...new Set(trafficRecords.map((record) => record.day_of_week))]),
    [trafficRecords],
  );

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.location_id, location])),
    [locations],
  );

  const selectedTrendLocation = locationById.get(selectedTrendLocationId);
  const selectedComparisonLocation = locationById.get(selectedComparisonLocationId);
  const latestMonth = months.at(-1);
  const oneYearPriorMonth = sameMonthPreviousYear(months, latestMonth);
  const preCovidComparisonMonth = equivalentPreCovidMonth(months, latestMonth);

  const trendPoints = useMemo<TrendPoint[]>(() => {
    const countByMonth = new Map(
      trafficRecords
        .filter(
          (record) =>
            record.location_id === selectedTrendLocationId &&
            record.day_of_week === selectedTrendDayOfWeek &&
            record.hour === selectedTrendHour,
        )
        .map((record) => [record.month, record.avg_count]),
    );

    const rawPoints = months.map((month) => ({
      month,
      monthLabel: formatMonth(month),
      shortMonthLabel: formatShortMonth(month),
      avgCount: countByMonth.get(month) ?? null,
    }));

    return rawPoints.map((point, index) => {
      const recentPoints = rawPoints.slice(index - MIN_CONSECUTIVE_MONTHS_FOR_AVERAGE + 1, index + 1);
      const hasEnoughConsecutiveData =
        recentPoints.length === MIN_CONSECUTIVE_MONTHS_FOR_AVERAGE &&
        recentPoints.every((recentPoint) => recentPoint.avgCount !== null);

      if (!hasEnoughConsecutiveData) {
        return { ...point, movingAverage: null };
      }

      const windowValues = rawPoints
        .slice(Math.max(0, index - MOVING_AVERAGE_MONTHS + 1), index + 1)
        .map((windowPoint) => windowPoint.avgCount)
        .filter((value): value is number => value !== null);

      const movingAverage =
        windowValues.reduce((total, value) => total + value, 0) / windowValues.length;

      return { ...point, movingAverage };
    });
  }, [months, selectedTrendDayOfWeek, selectedTrendHour, selectedTrendLocationId, trafficRecords]);

  const availableTrendPointCount = trendPoints.filter((point) => point.avgCount !== null).length;

  const visibleRecords = useMemo<MarkerRecord[]>(() => {
    return trafficRecords
      .filter(
        (record) =>
          record.month === selectedMonth &&
          record.day_of_week === selectedMapDayOfWeek &&
          record.hour === selectedHour,
      )
      .map((record) => {
        const location = locationById.get(record.location_id);
        return location ? { ...record, location } : null;
      })
      .filter((record): record is MarkerRecord => record !== null);
  }, [locationById, selectedHour, selectedMapDayOfWeek, selectedMonth, trafficRecords]);

  const weeklyComparisonPoints = useMemo<WeeklyComparisonPoint[]>(() => {
    const countByMonthDayHour = new Map<string, number>();

    trafficRecords
      .filter(
        (record) =>
          record.location_id === selectedComparisonLocationId &&
          (record.month === selectedComparisonFirstMonth ||
            record.month === selectedComparisonSecondMonth),
      )
      .forEach((record) => {
        countByMonthDayHour.set(
          [record.month, record.day_of_week, record.hour].join("|"),
          record.avg_count,
        );
      });

    return DAYS_OF_WEEK.flatMap((dayOfWeek) =>
      HOURS_OF_DAY.map((hour) => ({
        dayOfWeek,
        hour,
        label: `${dayOfWeek} ${formatHour(hour)}`,
        firstCount:
          countByMonthDayHour.get([selectedComparisonFirstMonth, dayOfWeek, hour].join("|")) ??
          null,
        secondCount:
          countByMonthDayHour.get([selectedComparisonSecondMonth, dayOfWeek, hour].join("|")) ??
          null,
      })),
    );
  }, [
    selectedComparisonFirstMonth,
    selectedComparisonLocationId,
    selectedComparisonSecondMonth,
    trafficRecords,
  ]);

  const availableWeeklyComparisonPointCount = weeklyComparisonPoints.filter(
    (point) => point.firstCount !== null || point.secondCount !== null,
  ).length;

  const summaryTableRows = useMemo<SummaryTableRow[]>(() => {
    const countsByLocation = new Map<string, Map<string, number>>();

    trafficRecords
      .filter(
        (record) =>
          record.day_of_week === selectedTableDayOfWeek && record.hour === selectedTableHour,
      )
      .forEach((record) => {
        const countsByMonth = countsByLocation.get(record.location_id) ?? new Map<string, number>();
        countsByMonth.set(record.month, record.avg_count);
        countsByLocation.set(record.location_id, countsByMonth);
      });

    return locations
      .map((location) => {
        const countsByMonth = countsByLocation.get(location.location_id) ?? new Map<string, number>();
        const currentAverage = rollingAverageForMonth(months, countsByMonth, latestMonth);
        const oneYearPriorAverage = rollingAverageForMonth(months, countsByMonth, oneYearPriorMonth);
        const preCovidAverage = rollingAverageForMonth(
          months,
          countsByMonth,
          preCovidComparisonMonth,
        );

        return {
          locationId: location.location_id,
          locationName: location.display_name,
          currentAverage,
          oneYearChange: percentChange(currentAverage, oneYearPriorAverage),
          preCovidChange: percentChange(currentAverage, preCovidAverage),
        };
      })
      .sort((a, b) => {
        if (a.currentAverage === null && b.currentAverage === null) {
          return a.locationName.localeCompare(b.locationName);
        }
        if (a.currentAverage === null) {
          return 1;
        }
        if (b.currentAverage === null) {
          return -1;
        }
        return b.currentAverage - a.currentAverage;
      });
  }, [
    latestMonth,
    locations,
    months,
    oneYearPriorMonth,
    preCovidComparisonMonth,
    selectedTableDayOfWeek,
    selectedTableHour,
    trafficRecords,
  ]);

  const availableSummaryRowCount = summaryTableRows.filter(
    (row) => row.currentAverage !== null,
  ).length;

  const mapRoads = basemap?.roads ?? [];
  const mapBuildings = basemap?.buildings ?? [];

  const selectedLabel =
    selectedMonth && visibleRecords.length > 0
      ? `${formatMonth(selectedMonth)}, ${selectedMapDayOfWeek}, ${formatHour(selectedHour)}`
      : "Select a month, day, and hour";

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <h1 id="page-title">Foot traffic counts across Auckland CBD.</h1>
        <p>
          Explore average pedestrian activity by month, day of week, and hour. Pedestrian counts
          data sourced from{" "}
          <a href="https://www.hotcity.co.nz/city-centre/results-and-statistics/pedestrian-counts">
            Heart of the City
          </a>.
        </p>
      </section>

      <section className="map-panel" aria-labelledby="map-title">
        <div className="panel-header">
          <div>
            <h2 id="map-title">Auckland CBD at {selectedLabel}</h2>
          </div>
          <p className="map-summary" aria-live="polite">
            {isLoading
              ? "Loading generated pedestrian data..."
              : `${visibleRecords.length} locations visible`}
          </p>
        </div>

        <div className="controls" aria-label="Map filters">
          <label>
            <span>Month</span>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              disabled={isLoading || months.length === 0}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Day</span>
            <select
              value={selectedMapDayOfWeek}
              onChange={(event) => setSelectedMapDayOfWeek(event.target.value)}
              disabled={isLoading || daysOfWeek.length === 0}
            >
              {daysOfWeek.map((dayOfWeek) => (
                <option key={dayOfWeek} value={dayOfWeek}>
                  {dayOfWeek}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Hour</span>
            <select
              value={selectedHour}
              onChange={(event) => setSelectedHour(Number(event.target.value))}
              disabled={isLoading || hours.length === 0}
            >
              {hours.map((hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="map-rate-note">
          Dots are paced from the selected average hourly count and play at{" "}
          {FLOW_SIMULATED_SECONDS_PER_REAL_SECOND}x real time:{" "}
          {FLOW_REAL_SECONDS_PER_TRAFFIC_MINUTE} seconds on the map represents 1 minute of foot
          traffic.
        </p>

        {error ? (
          <div className="map-error" role="alert">
            {error}
          </div>
        ) : (
          <div className="map-frame">
            <svg
              className="street-map"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Stylized Auckland CBD street map for ${selectedLabel}`}
            >
              <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-paper" />
              <g className="building-layer" aria-hidden="true">
                {mapBuildings.map((building) => (
                  <polygon
                    key={building.id}
                    className="building-footprint"
                    points={polygonPoints(building.points)}
                  />
                ))}
              </g>
              <g className="street-layer" aria-hidden="true">
                {mapRoads.map((street) => (
                  <path
                    key={street.id}
                    className={`street street-${street.kind}`}
                    d={streetPath(street.points)}
                  />
                ))}
              </g>
              <FlowStreams visibleRecords={visibleRecords} mapRoads={mapRoads} />
            </svg>

            <div className="flow-layer" aria-label="Observed pedestrian locations">
              {visibleRecords.map((record) => {
                const { x, y } = projectCoordinate([
                  record.location.longitude,
                  record.location.latitude,
                ]);
                const tooltipId = [
                  "tooltip",
                  record.month,
                  record.day_of_week,
                  record.hour,
                  record.location_id,
                ].join("-");
                const tooltipClasses = [
                  "marker-tooltip",
                  y < 145 ? "marker-tooltip-below" : "",
                  x < 160 ? "marker-tooltip-right" : "",
                  x > MAP_WIDTH - 160 ? "marker-tooltip-left" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <button
                    key={record.location_id}
                    type="button"
                    className="flow-marker"
                    style={{
                      left: `${(x / MAP_WIDTH) * 100}%`,
                      top: `${(y / MAP_HEIGHT) * 100}%`,
                      "--flow-radius": "1.6rem",
                    } as CSSProperties}
                    aria-label={`${record.location.display_name}: ${formatCount(
                      record.avg_count,
                    )} average pedestrians on ${record.day_of_week} at ${formatHour(
                      record.hour,
                    )}.`}
                    aria-describedby={tooltipId}
                  >
                    <span className={tooltipClasses} id={tooltipId} role="tooltip">
                      <strong>{record.location.display_name}</strong>
                      <span>
                        {formatCount(record.avg_count)} avg pedestrians on {record.day_of_week} at{" "}
                        {formatHour(record.hour)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="chart-panel" aria-labelledby="trend-title">
        <div className="panel-header chart-header">
          <div>
            <h2 id="trend-title">
              {selectedTrendLocation?.display_name ?? "Select a location"} over time
            </h2>
          </div>
          <p className="map-summary" aria-live="polite">
            {availableTrendPointCount
              ? `${availableTrendPointCount} monthly points`
              : "No trend data for this selection"}
          </p>
        </div>

        <div className="controls chart-controls" aria-label="Trend chart filters">
          <label>
            <span>Location</span>
            <select
              value={selectedTrendLocationId}
              onChange={(event) => setSelectedTrendLocationId(event.target.value)}
              disabled={isLoading || locations.length === 0}
            >
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.display_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Day</span>
            <select
              value={selectedTrendDayOfWeek}
              onChange={(event) => setSelectedTrendDayOfWeek(event.target.value)}
              disabled={isLoading || daysOfWeek.length === 0}
            >
              {daysOfWeek.map((dayOfWeek) => (
                <option key={dayOfWeek} value={dayOfWeek}>
                  {dayOfWeek}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Hour</span>
            <select
              value={selectedTrendHour}
              onChange={(event) => setSelectedTrendHour(Number(event.target.value))}
              disabled={isLoading || hours.length === 0}
            >
              {hours.map((hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="chart-copy">
          <p>
            Dots show raw monthly average pedestrian counts for{" "}
            {selectedTrendDayOfWeek || "the selected day"} at {formatHour(selectedTrendHour)}. The
            line shows a trailing 6-month moving average where all 6 months are present.
          </p>
        </div>

        {availableTrendPointCount > 0 ? (
          <div className="chart-frame">
            <NativeTrendChart points={trendPoints} />
          </div>
        ) : (
          <div className="map-error" role="status">
            Choose a different location, day, or hour to see the raw count trend.
          </div>
        )}
      </section>

      <section className="summary-panel" aria-labelledby="comparison-title">
        <div className="panel-header">
          <div>
            <h2 id="comparison-title">
              {selectedComparisonLocation?.display_name ?? "Select a location"} by hour of week
            </h2>
          </div>
          <p className="map-summary" aria-live="polite">
            {availableWeeklyComparisonPointCount
              ? `${availableWeeklyComparisonPointCount} hourly points`
              : "No comparison data for this selection"}
          </p>
        </div>

        <div className="controls comparison-controls" aria-label="Weekly comparison filters">
          <label>
            <span>Location</span>
            <select
              value={selectedComparisonLocationId}
              onChange={(event) => setSelectedComparisonLocationId(event.target.value)}
              disabled={isLoading || locations.length === 0}
            >
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.display_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>First month</span>
            <select
              value={selectedComparisonFirstMonth}
              onChange={(event) => setSelectedComparisonFirstMonth(event.target.value)}
              disabled={isLoading || months.length === 0}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Second month</span>
            <select
              value={selectedComparisonSecondMonth}
              onChange={(event) => setSelectedComparisonSecondMonth(event.target.value)}
              disabled={isLoading || months.length === 0}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="chart-copy">
          <p>
            Compare raw average hourly pedestrian counts from Monday midnight through Sunday 11pm.
          </p>
        </div>

        {availableWeeklyComparisonPointCount > 0 ? (
          <>
            <div className="comparison-legend" aria-hidden="true">
              <span>
                <span className="legend-swatch legend-swatch-first" />
                {selectedComparisonFirstMonth
                  ? formatMonth(selectedComparisonFirstMonth)
                  : "First month"}
              </span>
              <span>
                <span className="legend-swatch legend-swatch-second" />
                {selectedComparisonSecondMonth
                  ? formatMonth(selectedComparisonSecondMonth)
                  : "Second month"}
              </span>
            </div>
            <div className="chart-frame">
              <NativeWeeklyComparisonChart
                points={weeklyComparisonPoints}
                firstMonthLabel={
                  selectedComparisonFirstMonth
                    ? formatMonth(selectedComparisonFirstMonth)
                    : "First month"
                }
                secondMonthLabel={
                  selectedComparisonSecondMonth
                    ? formatMonth(selectedComparisonSecondMonth)
                    : "Second month"
                }
              />
            </div>
          </>
        ) : (
          <div className="map-error" role="status">
            Choose a different location or month pair to compare the hourly week pattern.
          </div>
        )}
      </section>

      <section className="summary-panel" aria-labelledby="summary-title">
        <div className="panel-header">
          <div>
            <h2 id="summary-title">Current 6-month averages at {formatHour(selectedTableHour)}</h2>
          </div>
          <p className="map-summary" aria-live="polite">
            {availableSummaryRowCount
              ? `${availableSummaryRowCount} locations with current data`
              : "No table data for this selection"}
          </p>
        </div>

        <div className="controls table-controls" aria-label="Summary table filters">
          <label>
            <span>Day</span>
            <select
              value={selectedTableDayOfWeek}
              onChange={(event) => setSelectedTableDayOfWeek(event.target.value)}
              disabled={isLoading || daysOfWeek.length === 0}
            >
              {daysOfWeek.map((dayOfWeek) => (
                <option key={dayOfWeek} value={dayOfWeek}>
                  {dayOfWeek}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Hour</span>
            <select
              value={selectedTableHour}
              onChange={(event) => setSelectedTableHour(Number(event.target.value))}
              disabled={isLoading || hours.length === 0}
            >
              {hours.map((hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="chart-copy">
          <p>
            Current values use the 6 months ending{" "}
            {latestMonth ? formatMonth(latestMonth) : "the latest month"}. One-year and pre-COVID
            changes compare against the equivalent 6-month windows ending{" "}
            {oneYearPriorMonth ? formatMonth(oneYearPriorMonth) : "one year earlier"} and{" "}
            {preCovidComparisonMonth ? formatMonth(preCovidComparisonMonth) : "before COVID"}.
          </p>
        </div>

        <div className="table-frame">
          <table className="summary-table">
            <thead>
              <tr>
                <th scope="col">Location</th>
                <th scope="col">Current 6-month rolling average</th>
                <th scope="col">% Change since 1 year prior</th>
                <th scope="col">% Change vs pre-COVID</th>
              </tr>
            </thead>
            <tbody>
              {summaryTableRows.map((row) => (
                <tr key={row.locationId}>
                  <th scope="row">{row.locationName}</th>
                  <td>
                    {row.currentAverage === null
                      ? "Not enough data"
                      : formatCount(row.currentAverage)}
                  </td>
                  <td>{formatPercentChange(row.oneYearChange)}</td>
                  <td>{formatPercentChange(row.preCovidChange)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer className="site-footer">
        Made by <a href="https://samstemper.com">Sam Stemper</a>
      </footer>
    </main>
  );
}

export default App;
