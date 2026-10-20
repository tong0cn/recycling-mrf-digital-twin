import mapping from '../../scripts/cad-process.json';
import cad from './cad-layout.json';

export const EQUIPMENT = mapping.equipment;
export type EquipmentId = keyof typeof EQUIPMENT;
export type Point = [number, number, number];
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as EquipmentId[];
export const GRADES = [
  '3A',
  'MIXED',
  'GREEN',
  'BROWN',
  'BIG_WHITE',
  'SMALL_WHITE',
  'FLOWER',
  'OIL',
  'CAN',
] as const;
export type Grade = (typeof GRADES)[number];
export const MATERIALS: Record<Grade, { name: string; color: string }> = {
  '3A': { name: '3A', color: '#7fe4f0' },
  MIXED: { name: '杂色 PET', color: '#b998e8' },
  GREEN: { name: '绿瓶', color: '#50cf91' },
  BROWN: { name: '棕瓶', color: '#d58f54' },
  BIG_WHITE: { name: '大白', color: '#e8eef2' },
  SMALL_WHITE: { name: '小白', color: '#aebbc7' },
  FLOWER: { name: '花乙', color: '#e89baa' },
  OIL: { name: '油壶', color: '#e9c368' },
  CAN: { name: '易拉罐', color: '#8ca6b5' },
};
export type SmallGrade = Exclude<Grade, '3A' | 'MIXED'>;
export const SMALL_GRADES = GRADES.filter(
  (grade): grade is SmallGrade => grade !== '3A' && grade !== 'MIXED',
);
export type StockId = 'E02' | 'E03' | 'E04' | 'E05' | SmallGrade;
export const STOCK_IDS: StockId[] = ['E02', 'E03', 'E04', 'E05', ...SMALL_GRADES];
export const CAPACITY = 72;
export const SMALL_CAPACITY = 24;
export const MANUAL_BATCH = 6;
export const STEP = 0.1;
export const HORIZON = 360;
export const DEFAULTS = { feedRate: 120, beltSpeed: 1, threshold: 18, robotSpeed: 1 };
export type Parameter = keyof typeof DEFAULTS;
export const PARAMETER_LIMITS: Record<Parameter, [number, number]> = {
  feedRate: [30, 240],
  beltSpeed: [0.5, 2],
  threshold: [6, 48],
  robotSpeed: [0.5, 2],
};
export function center(id: EquipmentId): Point {
  const point = cad[id].center;
  return [point[0], point[1], point[2]];
}
export function smallPosition(grade: SmallGrade): Point {
  if (grade === 'GREEN') return [-5.8, 1.2, 6.8];
  if (grade === 'BROWN') return [-4.5, 1.2, 6.8];
  const index = Math.max(0, SMALL_GRADES.indexOf(grade) - 2);
  return [-4.7 + index * 0.8, 3.25, -1.15];
}
export const ROUTES = {
  feed: {
    device: 'E06',
    seconds: 4,
    mode: 'belt',
    points: [
      [8.1, 1.9, -11.34],
      [4.8, 2.7, -11.34],
    ],
  },
  sort1: {
    device: 'E17',
    seconds: 4,
    mode: 'belt',
    points: [
      [4.8, 2.7, -11.34],
      [0.25, 2.7, -11.34],
    ],
  },
  airPet: {
    device: 'E17',
    seconds: 5,
    mode: 'air',
    points: [
      [0.25, 2.7, -11.34],
      [0.4, 3.2, -9.14],
      [0.4, 7.35, -9.14],
      [-6, 7.35, -9.14],
      [-7.415, 6.8, -10.985],
    ],
  },
  airMisc: {
    device: 'E17',
    seconds: 4,
    mode: 'air',
    points: [
      [0.25, 2.7, -11.34],
      [1.3, 3.2, -10.4],
      [1.3, 7.35, -9.15],
      [-1.8, 7.35, -9.15],
      [-3.275, 6.8, -10.985],
    ],
  },
  screw: {
    device: 'E11',
    seconds: 6,
    mode: 'screw',
    points: [
      [-7.415, 2.25, -9.5],
      [-7.415, 2.3, -9],
      [-7.415, 4.2, -5.8],
      [-8.05, 3.35, -5.4],
    ],
  },
  delabel: {
    device: 'E12',
    seconds: 7,
    mode: 'belt',
    points: [
      [-8.05, 3.35, -5.4],
      [-8.05, 2.2, -1.1],
    ],
  },
  incline2: {
    device: 'E09',
    seconds: 4,
    mode: 'belt',
    points: [
      [-8.05, 2.2, -1.1],
      [-7.87, 2.7, 1.5],
    ],
  },
  sort2: {
    device: 'E18',
    seconds: 5,
    mode: 'belt',
    points: [
      [-7.87, 2.7, 1.5],
      [-7.87, 2.7, 5.4],
    ],
  },
  air3A: {
    device: 'E18',
    seconds: 5,
    mode: 'air',
    points: [
      [-7.87, 2.7, 5.4],
      [-6.3, 3.3, 6.1],
      [-6.3, 7.35, 6.1],
      [-6.3, 7.35, 8.9],
      [-7.18, 6.8, 10.02],
    ],
  },
  robotBelt: {
    device: 'E16',
    seconds: 4,
    mode: 'belt',
    points: [
      [-7.87, 2.2, 5.28],
      [-4.5, 2.2, 5.28],
    ],
  },
  robotGreen: {
    device: 'E15',
    seconds: 1.8,
    mode: 'robot',
    points: [
      [-4.5, 2.2, 5.28],
      [-5.8, 2.85, 6.1],
      [-5.8, 1.9, 6.8],
    ],
  },
  robotBrown: {
    device: 'E15',
    seconds: 1.8,
    mode: 'robot',
    points: [
      [-4.5, 2.2, 5.28],
      [-4.5, 2.85, 6.1],
      [-4.5, 1.9, 6.8],
    ],
  },
  airMixed: {
    device: 'E16',
    seconds: 6,
    mode: 'air',
    points: [
      [-4.5, 2.2, 5.28],
      [-3.1, 2.2, 5.28],
      [-3.1, 3.2, 6.9],
      [-3.1, 7.35, 7.1],
      [-3.1, 7.35, 9],
      [-3.04, 6.8, 10.02],
    ],
  },
  manualIncline: {
    device: 'E07',
    seconds: 5,
    mode: 'belt',
    points: [
      [-3.275, 2.25, -9.2],
      [-3.275, 3.65, -5.7],
    ],
  },
  manualSort: {
    device: 'E14',
    seconds: 7,
    mode: 'belt',
    points: [
      [-3.275, 3.65, -5.7],
      [-3.275, 3.65, -1.3],
    ],
  },
  discharge3A: {
    device: 'E08',
    seconds: 5,
    mode: 'belt',
    points: [
      [-7.18, 2.3, 11.3],
      [-7.18, 2.05, 11.3],
      [0.8, 2.05, 11.3],
      [2.14, 0.8, 11.8],
    ],
  },
  dischargeMixed: {
    device: 'E08',
    seconds: 4,
    mode: 'belt',
    points: [
      [-3.04, 2.3, 11.3],
      [-3.04, 2.05, 11.3],
      [0.8, 2.05, 11.3],
      [2.14, 0.8, 11.8],
    ],
  },
  chain: {
    device: 'E10',
    seconds: 6,
    mode: 'belt',
    points: [
      [2.14, 0.8, 11.8],
      [2.14, 3.6, 3],
      [2.14, 3.5, 1.85],
    ],
  },
} satisfies Record<string, { device: EquipmentId; seconds: number; mode: string; points: Point[] }>;
export type RouteId = keyof typeof ROUTES;
export const MANUAL_PATH: Point[] = [
  [0.5, 1.2, -2.7],
  [6.5, 1.2, -2.7],
  [6.5, 1.2, 12.8],
  [2.14, 1.2, 12.8],
];

/** Arc-length interpolation keeps speed stable across bends, shared by scene and tests. */
export function along(points: readonly Point[], progress: number): Point {
  const lengths = points
    .slice(1)
    .map((p, index) => Math.hypot(...p.map((v, axis) => v - points[index][axis])));
  let distance = Math.max(0, Math.min(1, progress)) * lengths.reduce((sum, n) => sum + n, 0);
  for (let index = 0; index < lengths.length; index += 1) {
    if (distance <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] ? Math.min(1, distance / lengths[index]) : 0;
      return points[index].map((value, axis) => value + (points[index + 1][axis] - value) * t) as Point;
    }
    distance -= lengths[index];
  }
  return [...points[0]];
}
