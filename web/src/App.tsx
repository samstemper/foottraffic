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
const FLOW_DOT_RADIUS = 3.6;
const FLOW_ANCHOR_RADIUS = 7.2;
const FLOW_MAX_PARTICLES_PER_LOCATION = 40;
const FLOW_MIN_SPAWN_INTERVAL_SECONDS = 0.08;
const FLOW_MIN_CYCLE_DURATION_SECONDS = 0.8;
const FLOW_MAX_CYCLE_DURATION_SECONDS = 30;
const FLOW_EDGE_OPACITY = 0.04;
const FLOW_PEAK_OPACITY = 0.72;
const FLOW_STATIC_OPACITY = 0.42;
const CHART_WIDTH = 960;
const CHART_HEIGHT = 420;
const CHART_PADDING = {
  top: 28,
  right: 24,
  bottom: 52,
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

const STREETS: Street[] = [
  {
    name: "Quay Street",
    kind: "waterfront",
    points: [
      [174.7595, -36.8437],
      [174.771, -36.8437],
    ],
  },
  {
    name: "Customs Street",
    kind: "primary",
    points: [
      [174.7594, -36.8451],
      [174.7707, -36.8451],
    ],
  },
  {
    name: "Fanshawe Street",
    kind: "secondary",
    points: [
      [174.7591, -36.8444],
      [174.7645, -36.8444],
    ],
  },
  {
    name: "Beach Road",
    kind: "secondary",
    points: [
      [174.7676, -36.8445],
      [174.7711, -36.8445],
    ],
  },
  {
    name: "Swanson Street",
    kind: "lane",
    points: [
      [174.761, -36.8458],
      [174.7678, -36.8458],
    ],
  },
  {
    name: "Wyndham Street",
    kind: "lane",
    points: [
      [174.7602, -36.8474],
      [174.7672, -36.8474],
    ],
  },
  {
    name: "Durham Street",
    kind: "lane",
    points: [
      [174.7628, -36.8484],
      [174.767, -36.8484],
    ],
  },
  {
    name: "Vulcan Lane",
    kind: "lane",
    points: [
      [174.7657, -36.8476],
      [174.7674, -36.8476],
    ],
  },
  {
    name: "Shortland Street",
    kind: "secondary",
    points: [
      [174.7622, -36.8467],
      [174.7703, -36.8467],
    ],
  },
  {
    name: "Victoria Street",
    kind: "primary",
    points: [
      [174.7591, -36.8492],
      [174.769, -36.8492],
    ],
  },
  {
    name: "Wellesley Street",
    kind: "primary",
    points: [
      [174.759, -36.8522],
      [174.7684, -36.8522],
    ],
  },
  {
    name: "Mayoral Drive",
    kind: "secondary",
    points: [
      [174.7589, -36.8539],
      [174.7678, -36.8539],
    ],
  },
  {
    name: "Wakefield Street",
    kind: "secondary",
    points: [
      [174.7612, -36.8549],
      [174.7682, -36.8549],
    ],
  },
  {
    name: "Cook Street",
    kind: "secondary",
    points: [
      [174.7589, -36.8559],
      [174.7644, -36.8559],
    ],
  },
  {
    name: "Karangahape Road",
    kind: "primary",
    points: [
      [174.7589, -36.8577],
      [174.7668, -36.8577],
    ],
  },
  {
    name: "Queen Street",
    kind: "primary",
    points: [
      [174.7658, -36.8435],
      [174.7658, -36.8583],
    ],
  },
  {
    name: "High Street",
    kind: "secondary",
    points: [
      [174.7668, -36.844],
      [174.7668, -36.851],
    ],
  },
  {
    name: "Albert Street",
    kind: "secondary",
    points: [
      [174.7621, -36.8435],
      [174.7621, -36.8562],
    ],
  },
  {
    name: "Nelson Street",
    kind: "secondary",
    points: [
      [174.7596, -36.8437],
      [174.7596, -36.8569],
    ],
  },
  {
    name: "Federal Street",
    kind: "secondary",
    points: [
      [174.763, -36.8442],
      [174.763, -36.8507],
    ],
  },
  {
    name: "Elliott Street",
    kind: "lane",
    points: [
      [174.7642, -36.8474],
      [174.7642, -36.8525],
    ],
  },
  {
    name: "Lorne Street",
    kind: "lane",
    points: [
      [174.7669, -36.8486],
      [174.7669, -36.8545],
    ],
  },
  {
    name: "Kitchener Street",
    kind: "lane",
    points: [
      [174.7678, -36.8472],
      [174.7678, -36.8522],
    ],
  },
  {
    name: "Princes Street",
    kind: "secondary",
    points: [
      [174.7689, -36.847],
      [174.7689, -36.8542],
    ],
  },
  {
    name: "Commerce Street",
    kind: "secondary",
    points: [
      [174.7681, -36.8437],
      [174.7681, -36.8484],
    ],
  },
  {
    name: "Fort Street",
    kind: "lane",
    points: [
      [174.7634, -36.8459],
      [174.7693, -36.8459],
    ],
  },
  {
    name: "Darby Street",
    kind: "lane",
    points: [
      [174.7631, -36.8498],
      [174.7654, -36.8498],
    ],
  },
  {
    name: "Hobson Street",
    kind: "secondary",
    points: [
      [174.7605, -36.8448],
      [174.7605, -36.8568],
    ],
  },
  {
    name: "Sale Street",
    kind: "lane",
    points: [
      [174.7612, -36.8438],
      [174.7612, -36.8469],
    ],
  },
  {
    name: "Greys Avenue",
    kind: "lane",
    points: [
      [174.7628, -36.8521],
      [174.7628, -36.8576],
    ],
  },
  {
    name: "Pitt Street",
    kind: "secondary",
    points: [
      [174.7609, -36.8543],
      [174.7609, -36.8583],
    ],
  },
  {
    name: "Symonds Street",
    kind: "secondary",
    points: [
      [174.7691, -36.8521],
      [174.7691, -36.8582],
    ],
  },
  {
    name: "Anzac Avenue",
    kind: "secondary",
    points: [
      [174.7696, -36.8446],
      [174.7696, -36.855],
    ],
  },
];

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

  const fallbackRoads = useMemo<BasemapRoad[]>(
    () =>
      STREETS.map((street) => ({
        ...street,
        id: street.name,
      })),
    [],
  );

  const mapRoads = basemap?.roads.length ? basemap.roads : fallbackRoads;
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
            <div className="north-indicator" aria-hidden="true">
              <span>N</span>
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

      <section className="summary-panel" aria-labelledby="summary-title">
        <div className="panel-header">
          <div>
            <h2 id="summary-title">
              Current 6-month averages at {formatHour(selectedTableHour)}
            </h2>
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
            Current values use the 6 months ending {latestMonth ? formatMonth(latestMonth) : "the latest month"}.
            One-year and pre-COVID changes compare against the equivalent 6-month windows ending{" "}
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
