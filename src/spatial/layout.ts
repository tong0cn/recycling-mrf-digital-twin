import type { WaypointId } from '../types';

/**
 * Single source of truth for plant geometry. The simulation derives conveyor lengths and
 * forklift routes from these anchors, and the 3D scene builds the same belts from them, so the
 * animated position of a material unit always matches its simulated progress.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface BeltSegment {
  id: string;
  from: Vec2;
  to: Vec2;
  /** Deck height above the floor at each end, in metres. */
  fromY: number;
  toY: number;
  width: number;
}

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.z - a.z);

export const FACTORY = {
  minX: -20,
  maxX: 20,
  minZ: -12.5,
  maxZ: 13.2,
  wallHeight: 2.8,
  roofY: 6.6,
  slabY: 0,
} as const;

/** Single-lane main aisle: only one forklift may occupy it at a time. */
export const AISLE = { z: 4.2, halfWidth: 1.7 } as const;

export const DOCKS = {
  IN_1: { x: -14, z: -17.0 },
  IN_2: { x: -7, z: -17.0 },
  OUT: { x: 7.5, z: -17.0 },
} as const;

/** Truck parking outside the gates, used for the approach / leave animation. */
export const TRUCK_PARKING: Record<'TRUCK_A' | 'TRUCK_B' | 'TRUCK_C', { x: number; z: number; dock: Vec2 }> = {
  TRUCK_A: { x: DOCKS.IN_1.x, z: -27, dock: DOCKS.IN_1 },
  TRUCK_B: { x: DOCKS.IN_2.x, z: -27, dock: DOCKS.IN_2 },
  TRUCK_C: { x: DOCKS.OUT.x, z: -27, dock: DOCKS.OUT },
};

/** 地磅摆在出货车道正中：货车进出场都会压过它。 */
export const SCALE = { x: DOCKS.OUT.x, z: -20.2 } as const;

/**
 * 设备坐标（x, z）。两条线都是「西 → 东」单向流动，彼此不交叉：
 * 塑料瓶线在 z ≈ −1.8 的设备带、料仓与打包机落在地带南侧（z ≈ 0.9）；
 * 纺织线在 z ≈ 8.4 的设备带、三个料仓落在更南的 z ≈ 11.8。
 * 中间 z = 4.2 是唯一一条主通道，任何设备包围盒都不得侵入 2.5…5.9。
 */
export const PLANT = {
  staging: { x: -11.6, z: -8.8, w: 6.0, d: 2.6 },
  vibFeeder: { x: -16.2, z: -1.8 },
  sorter1: { x: -8.4, z: -1.8 },
  sorter2: { x: -4.0, z: -1.8 },
  tailDrop: { x: 0.6, z: -1.8 },
  siloPet: { x: -8.4, z: 0.9 },
  siloHdpe: { x: -4.0, z: 0.9 },
  balerPlastic: { x: 2.8, z: 0.9 },
  spreader: { x: -15.0, z: 8.4 },
  hyperspec: { x: -10.9, z: 8.4 },
  arm: { x: -4.3, z: 9.35 },
  siloCotton: { x: -7.4, z: 11.8 },
  siloPolyester: { x: -4.4, z: 11.8 },
  siloBlend: { x: -1.4, z: 11.8 },
  balerTextile: { x: 3.0, z: 8.4 },
  storageCardboard: { x: 14.0, z: 0.3, w: 5, d: 4 },
  balerCardboard: { x: 9.6, z: 0.9 },
  storageMisc: { x: 14.0, z: 8.6, w: 5, d: 4 },
  outboundStage: { x: 6.2, z: -8.8, w: 4.4, d: 2.6 },
  /** Weighbridge deck, placed on the outbound lane the trucks pass over. */
  checkpoint: { x: SCALE.x, z: SCALE.z },
} as const;

/** Silo anchors, keyed by the simulation's silo ids. */
export const SILO_POINTS: Record<'SILO_PET' | 'SILO_HDPE' | 'SILO_COTTON' | 'SILO_POLYESTER' | 'SILO_BLEND', Vec2> = {
  SILO_PET: PLANT.siloPet,
  SILO_HDPE: PLANT.siloHdpe,
  SILO_COTTON: PLANT.siloCotton,
  SILO_POLYESTER: PLANT.siloPolyester,
  SILO_BLEND: PLANT.siloBlend,
};

const bp = (id: string, from: Vec2, to: Vec2, fromY: number, toY: number, width = 0.62): BeltSegment =>
  ({ id, from, to, fromY, toY, width });

/** Plastic line: feeder → incline → sorter 1 → sorter 2 → tail, with two air-puff lanes. */
export const PLASTIC_BELTS = {
  incline: bp('incline', { x: -14.6, z: -1.8 }, { x: -9.4, z: -1.8 }, 0.92, 1.85),
  sorter1: bp('sorter1', { x: -9.4, z: -1.8 }, { x: -7.4, z: -1.8 }, 1.85, 1.85, 1.1),
  pass1: bp('pass1', { x: -7.4, z: -1.8 }, { x: -4.8, z: -1.8 }, 1.85, 1.72),
  sorter2: bp('sorter2', { x: -4.8, z: -1.8 }, { x: -3.2, z: -1.8 }, 1.72, 1.72, 1.1),
  pass2: bp('pass2', { x: -3.2, z: -1.8 }, { x: -0.8, z: -1.8 }, 1.72, 1.6),
  lanePet: bp('lanePet', { x: -8.4, z: -1.6 }, { x: -8.4, z: 0.02 }, 1.85, 2.1),
  laneHdpe: bp('laneHdpe', { x: -4.0, z: -1.6 }, { x: -4.0, z: 0.02 }, 1.72, 2.1),
  laneTail: bp('laneTail', { x: -0.8, z: -1.8 }, { x: 0.6, z: -1.8 }, 1.6, 1.2),
} as const;

/** Textile line: spreader → hyperspectral sorter → pick belt, plus a reject chute. */
export const TEXTILE_BELTS = {
  spreader: bp('spreader', { x: -17.4, z: 8.4 }, { x: -12.6, z: 8.4 }, 0.86, 0.86, 1.05),
  hyperspec: bp('hyperspec', { x: -12.6, z: 8.4 }, { x: -9.2, z: 8.4 }, 0.92, 0.92, 1.05),
  pickBelt: bp('pickBelt', { x: -9.2, z: 8.4 }, { x: -4.6, z: 8.4 }, 0.92, 0.92, 0.8),
  reject: bp('reject', { x: -10.4, z: 8.4 }, { x: -10.4, z: 10.6 }, 1.05, 0.7),
} as const;

export const BELT_LENGTHS = {
  incline: dist(PLASTIC_BELTS.incline.from, PLASTIC_BELTS.incline.to),
  sorter1: dist(PLASTIC_BELTS.sorter1.from, PLASTIC_BELTS.sorter1.to),
  pass1: dist(PLASTIC_BELTS.pass1.from, PLASTIC_BELTS.pass1.to),
  sorter2: dist(PLASTIC_BELTS.sorter2.from, PLASTIC_BELTS.sorter2.to),
  pass2: dist(PLASTIC_BELTS.pass2.from, PLASTIC_BELTS.pass2.to),
  lanePet: dist(PLASTIC_BELTS.lanePet.from, PLASTIC_BELTS.lanePet.to),
  laneHdpe: dist(PLASTIC_BELTS.laneHdpe.from, PLASTIC_BELTS.laneHdpe.to),
  laneTail: dist(PLASTIC_BELTS.laneTail.from, PLASTIC_BELTS.laneTail.to),
  spreader: dist(TEXTILE_BELTS.spreader.from, TEXTILE_BELTS.spreader.to),
  hyperspec: dist(TEXTILE_BELTS.hyperspec.from, TEXTILE_BELTS.hyperspec.to),
  pickBelt: dist(TEXTILE_BELTS.pickBelt.from, TEXTILE_BELTS.pickBelt.to),
  reject: dist(TEXTILE_BELTS.reject.from, TEXTILE_BELTS.reject.to),
} as const;

export const WAYPOINTS: Record<WaypointId, Vec2> = {
  DOCK_IN_1: { x: -14, z: -11.0 },
  DOCK_IN_2: { x: -7, z: -11.0 },
  STAGING: { x: -11.6, z: -6.5 },
  VIB_FEEDER: { x: -16.2, z: -3.9 },
  SPREADER: { x: -15.0, z: 6.6 },
  /** 打包机出包导轨朝西，叉车在导轨末端取包，不在机身里。 */
  BALER_PLASTIC: { x: -0.4, z: 0.7 },
  BALER_TEXTILE: { x: 0.2, z: 8.4 },
  BALER_CARDBOARD: { x: 6.6, z: 0.7 },
  /** 存储区工位在垛位前方，不在垛位中心。 */
  STORAGE_CARDBOARD: { x: 14.0, z: -2.6 },
  STORAGE_MISC: { x: 14.0, z: 6.6 },
  OUTBOUND_STAGE: { x: 6.2, z: -6.5 },
  DOCK_OUT: { x: 7.5, z: -11.0 },
};

export const FORKLIFT_START: Record<'FL1' | 'FL2', Vec2> = {
  FL1: { x: -12.6, z: -4.6 },
  // Kept clear of the single-lane aisle band so a parked vehicle never holds the mutex.
  FL2: { x: -12.6, z: 1.4 },
};

const AISLE_EPSILON = 1;

const northOfAisle = (p: Vec2): boolean => p.z <= AISLE.z - AISLE_EPSILON;
const southOfAisle = (p: Vec2): boolean => p.z >= AISLE.z + AISLE_EPSILON;

/**
 * Forklift route between two stops. Trips that stay on one side of the plant travel directly;
 * trips that cross the plant go through the single-lane aisle, which is what the mutual
 * exclusion rule in the simulation protects.
 */
export function routePoints(from: Vec2, to: Vec2): Vec2[] {
  const sameSide = (northOfAisle(from) && northOfAisle(to)) || (southOfAisle(from) && southOfAisle(to));
  if (sameSide) return [from, to];
  const points: Vec2[] = [from];
  const sourceOnAisle = Math.abs(from.z - AISLE.z) <= AISLE_EPSILON;
  const targetOnAisle = Math.abs(to.z - AISLE.z) <= AISLE_EPSILON;
  if (!sourceOnAisle) points.push({ x: from.x, z: AISLE.z });
  if (!targetOnAisle || points.length === 1) points.push({ x: to.x, z: AISLE.z });
  points.push(to);
  // Collapse duplicates produced by degenerate legs.
  return points.filter((point, index) => index === 0 || dist(point, points[index - 1]) > 1e-6);
}

export function polylineLength(points: Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += dist(points[index - 1], points[index]);
  return total;
}

/** Position at a travelled distance along a polyline, clamped to the end. */
export function pointAlong(points: Vec2[], travelled: number): Vec2 {
  let remaining = travelled;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const leg = dist(a, b);
    if (leg <= 1e-6) continue;
    if (remaining <= leg) {
      const t = remaining / leg;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remaining -= leg;
  }
  return points[points.length - 1];
}

/** True when the travelled distance of a route is inside the single-lane aisle. */
export function travelsInAisle(points: Vec2[], travelled: number): boolean {
  const position = pointAlong(points, travelled);
  return Math.abs(position.z - AISLE.z) <= AISLE.halfWidth;
}

export const SEGMENT_LIST = [  ['incline', PLASTIC_BELTS.incline],
  ['sorter1', PLASTIC_BELTS.sorter1],
  ['pass1', PLASTIC_BELTS.pass1],
  ['sorter2', PLASTIC_BELTS.sorter2],
  ['pass2', PLASTIC_BELTS.pass2],
  ['lanePet', PLASTIC_BELTS.lanePet],
  ['laneHdpe', PLASTIC_BELTS.laneHdpe],
  ['laneTail', PLASTIC_BELTS.laneTail],
  ['spreader', TEXTILE_BELTS.spreader],
  ['hyperspec', TEXTILE_BELTS.hyperspec],
  ['pickBelt', TEXTILE_BELTS.pickBelt],
  ['reject', TEXTILE_BELTS.reject],
] as const;

/** Resolve a stage to the belt segment its unit is travelling on. */
export const STAGE_BELT: Partial<Record<string, BeltSegment>> = {
  INCLINE: PLASTIC_BELTS.incline,
  SORTER_1: PLASTIC_BELTS.sorter1,
  PASS_1: PLASTIC_BELTS.pass1,
  SORTER_2: PLASTIC_BELTS.sorter2,
  PASS_2: PLASTIC_BELTS.pass2,
  LANE_PET: PLASTIC_BELTS.lanePet,
  LANE_HDPE: PLASTIC_BELTS.laneHdpe,
  SPREADER: TEXTILE_BELTS.spreader,
  HYPERSPEC: TEXTILE_BELTS.hyperspec,
  LANE_COTTON: TEXTILE_BELTS.pickBelt,
  LANE_POLYESTER: TEXTILE_BELTS.pickBelt,
  LANE_BLEND: TEXTILE_BELTS.pickBelt,
  ARM_PICK: TEXTILE_BELTS.pickBelt,
};
