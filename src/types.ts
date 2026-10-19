/**
 * Shared domain types for the recycling MRF digital twin.
 * Kept free of three.js and React so the simulation core stays unit-testable in Node.
 */

export type PlasticGrade = 'PET' | 'HDPE';
export type TextileGrade = 'COTTON' | 'POLYESTER' | 'BLEND';
export type SortableGrade = PlasticGrade | TextileGrade;
export type Material = SortableGrade | 'CARDBOARD' | 'MISC';
export type UnitKind = 'PLASTIC' | 'TEXTILE' | 'BULK';

export const SORTABLE_GRADES: SortableGrade[] = ['PET', 'HDPE', 'COTTON', 'POLYESTER', 'BLEND'];
export const ALL_MATERIALS: Material[] = [...SORTABLE_GRADES, 'CARDBOARD', 'MISC'];

export type SiloId = 'SILO_PET' | 'SILO_HDPE' | 'SILO_COTTON' | 'SILO_POLYESTER' | 'SILO_BLEND';

export type DeviceId =
  | 'VIB_FEEDER'
  | 'INCLINE'
  | 'SORTER_1'
  | 'SORTER_2'
  | 'CONVEYOR'
  | 'SILO_PET'
  | 'SILO_HDPE'
  | 'BALER_PLASTIC'
  | 'SPREADER'
  | 'HYPERSPEC'
  | 'ROBOT_ARM'
  | 'SILO_COTTON'
  | 'SILO_POLYESTER'
  | 'SILO_BLEND'
  | 'BALER_TEXTILE'
  | 'BALER_CARDBOARD'
  | 'STORAGE_CARDBOARD'
  | 'STORAGE_MISC'
  | 'SCALE'
  | 'TRUCK_A'
  | 'TRUCK_B'
  | 'TRUCK_C'
  | 'FORKLIFT_1'
  | 'FORKLIFT_2';

export type LineGroup = 'plastic' | 'textile' | 'storage' | 'logistics';
export type DeviceKind = 'machine' | 'silo' | 'baler' | 'zone' | 'truck' | 'forklift';
export type DeviceStatus = 'RUNNING' | 'WAITING' | 'IDLE' | 'WARNING' | 'STOPPED';

/** Presentation modes owned by the app shell and consumed by the 3D scene. */
export type ViewMode = 'xray' | 'enclosed';
export type CameraMode = 'overview' | 'focus' | 'free';
export type AnomalyKey = keyof Anomalies;

/** Plain 2D plant coordinate (X across the hall, Z across the aisle). */
export interface Point {
  x: number;
  z: number;
}

/** Forklift stops. Mirrors the anchors in spatial/layout.ts. */
export type WaypointId =
  | 'DOCK_IN_1'
  | 'DOCK_IN_2'
  | 'STAGING'
  | 'VIB_FEEDER'
  | 'SPREADER'
  | 'BALER_PLASTIC'
  | 'BALER_TEXTILE'
  | 'BALER_CARDBOARD'
  | 'STORAGE_CARDBOARD'
  | 'STORAGE_MISC'
  | 'OUTBOUND_STAGE'
  | 'DOCK_OUT';

export interface DeviceSpec {
  id: DeviceId;
  name: string;
  nameEn: string;
  group: LineGroup;
  kind: DeviceKind;
  /** 真实对应工艺名称，用于客户展示时的术语对齐。 */
  process: string;
  responsibility: string;
}

/** Conveyor stages a material unit can occupy inside the two sorting lines. */
export type UnitStage =
  | 'TRUCK'
  | 'STAGING'
  | 'CARRIED'
  | 'HOPPER'
  | 'SPREAD_BUFFER'
  | 'INCLINE'
  | 'SORTER_1'
  | 'PASS_1'
  | 'SORTER_2'
  | 'PASS_2'
  | 'LANE_PET'
  | 'LANE_HDPE'
  | 'LANE_TAIL'
  | 'SPREADER'
  | 'HYPERSPEC'
  | 'LANE_COTTON'
  | 'LANE_POLYESTER'
  | 'LANE_BLEND'
  | 'ARM_PICK'
  | 'ARM_CARRY'
  | 'IN_SILO'
  | 'IN_BALE'
  | 'WAITING_EXPORT'
  | 'STORED_CARDBOARD'
  | 'STORED_MISC'
  | 'SHIPPED';

/** Stages that mean the unit is physically still inside the plant. */
export const ON_SITE_STAGES: UnitStage[] = [
  'TRUCK', 'STAGING', 'CARRIED', 'HOPPER', 'SPREAD_BUFFER', 'INCLINE', 'SORTER_1', 'PASS_1', 'SORTER_2', 'PASS_2',
  'LANE_PET', 'LANE_HDPE', 'LANE_TAIL', 'SPREADER', 'HYPERSPEC', 'LANE_COTTON', 'LANE_POLYESTER', 'LANE_BLEND',
  'ARM_PICK', 'ARM_CARRY', 'IN_SILO', 'IN_BALE', 'WAITING_EXPORT', 'STORED_CARDBOARD', 'STORED_MISC',
];

export interface MaterialUnit {
  id: number;
  kind: UnitKind;
  /** Grade as received, kept for sorting-efficiency accounting. */
  origin: Material;
  /** Current grade; tail or unidentified units are reclassified as MISC. */
  material: Material;
  stage: UnitStage;
  /** Distance travelled inside the current conveyor segment, in metres. */
  s: number;
  /** Sort decision already applied at a sorter, so a unit is never re-decided. */
  decided: SortableGrade | null;
  baleId: number | null;
  carrier: ForkliftId | 'ARM' | null;
}

export interface Bale {
  id: number;
  material: Material;
  unitIds: number[];
  massT: number;
  source: SiloId | 'BALER_CARDBOARD';
  status: 'PRESSING' | 'READY' | 'CARRIED' | 'AT_DOCK' | 'LOADED' | 'SHIPPED';
  carrier: ForkliftId | null;
  createdAt: number;
  /** Seconds left in the press cycle; only meaningful while status is PRESSING. */
  pressRemaining: number;
}

export interface Silo {
  id: SiloId;
  material: SortableGrade;
  units: number;
  capacity: number;
  threshold: number;
  /** Remaining seconds of an in-progress bale cycle, null when idle. */
  baling: number | null;
  balesProduced: number;
  overflowUnits: number;
}

export type ForkliftId = 'FL1' | 'FL2';

export type ForkliftStatus =
  | 'IDLE'
  | 'TRAVEL_EMPTY'
  | 'LOADING'
  | 'TRAVEL_LOADED'
  | 'UNLOADING'
  | 'WAITING_AISLE';

export interface TransportJob {
  id: string;
  unitIds: number[];
  baleIds: number[];
  label: string;
  from: WaypointId;
  to: WaypointId;
  /** Preferred forklift, used to keep each vehicle in its own zone. */
  preferred: ForkliftId;
  enqueuedAt: number;
  status: 'QUEUED' | 'ACTIVE' | 'DONE';
  vehicle: ForkliftId | null;
  startedAt: number | null;
  /**
   * Collect whatever is waiting at the pickup point when the vehicle actually arrives, instead of
   * the package list captured when the job was created. Used by the return-collection job, so
   * optical tail produced later in the shift is still carried out.
   */
  dynamic?: boolean;
}

export interface Forklift {
  id: ForkliftId;
  status: ForkliftStatus;
  jobId: string | null;
  /** Progress 0..1 along the current route. */
  progress: number;
  x: number;
  z: number;
  cargoLabel: string;
  trips: number;
  startX: number;
  startZ: number;
  /** Remaining waypoints of the current route, starting at the current position. */
  route: Point[];
  travelled: number;
  leg: 'PICKUP' | 'DROPOFF' | null;
  loaded: boolean;
  /** What this vehicle is actually carrying, so loading and unloading always agree. */
  cargoUnitIds: number[];
  cargoBaleIds: number[];
  /** Remaining dwell seconds while loading or unloading. */
  dwell: number;
  returning: boolean;
}

export type TruckId = 'TRUCK_A' | 'TRUCK_B' | 'TRUCK_C';
export type TruckRole = 'INBOUND_PRIMARY' | 'INBOUND_BULK' | 'OUTBOUND';
export type TruckStatus = 'OFF_SITE' | 'APPROACHING' | 'DOCKED' | 'UNLOADING' | 'LOADING' | 'LEAVING';

export interface Truck {
  id: TruckId;
  role: TruckRole;
  label: string;
  status: TruckStatus;
  /** Approach / leave interpolation 0..1 (0 = parked outside, 1 = docked). */
  progress: number;
  x: number;
  z: number;
  /** Packages still on board, shown in the vehicle readout. */
  onboard: number;
  loadLabel: string;
  weighed: boolean;
}

export interface ArmState {
  phase: 'IDLE' | 'SWING_TO_PICK' | 'GRAB' | 'SWING_TO_SILO' | 'RELEASE';
  phaseElapsed: number;
  unitId: number | null;
  target: SortableGrade | null;
  queue: number[];
  cycles: number;
}

export interface AirPuff {
  id: number;
  device: 'SORTER_1' | 'SORTER_2';
  /** Remaining visual life in seconds. */
  life: number;
}

export interface Ledger {
  received: Record<Material, number>;
  /** Shipped counts by the grade the package left as (a mis-sorted bottle leaves as MISC). */
  shipped: Record<Material, number>;
  /** Shipped counts by the grade the package was received as; this is what keeps rows balanced. */
  shippedByOrigin: Record<Material, number>;
  lost: Record<Material, number>;
  receivedMassT: number;
  shippedMassT: number;
}

export interface Anomalies {
  missort: boolean;
  siloOverflowWarning: boolean;
  emergencyStop: boolean;
}

export interface SimState {
  /** Fixed steps elapsed inside the current shift. */
  step: number;
  time: number;
  cycle: number;
  units: MaterialUnit[];
  bales: Bale[];
  silos: Record<SiloId, Silo>;
  forklifts: Record<ForkliftId, Forklift>;
  trucks: Record<TruckId, Truck>;
  arm: ArmState;
  puffs: AirPuff[];
  jobs: TransportJob[];
  aisle: { occupant: ForkliftId | null };
  storage: { cardboardUnits: number; miscUnits: number };
  ledger: Ledger;
  anomalies: Anomalies;
  /** Packages released from each inbound truck so far this shift. */
  released: Record<'TRUCK_A' | 'TRUCK_B', number>;
  /** Set once the end-of-shift presentation sweep has run, so it never fights the return-home leg. */
  swept: boolean;
  /** Units fed into the plastic line and textile line so far this shift. */
  fedPlastic: number;
  fedTextile: number;
  nextFeedAt: number;
  nextSpreadAt: number;
  nextUnitId: number;
  nextBaleId: number;
  events: string[];
}

export interface ControlSpec {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  description: string;
}

export interface ControlCommand {
  key: string;
  device: DeviceId | 'SYSTEM';
  value: number;
  /** Truthy when the command only changes a boolean switch. */
  flag?: boolean;
}

export interface TimedCommand extends ControlCommand {
  /** Shift time in seconds at which the intervention takes effect. */
  at: number;
}

export interface SimSettings {
  numbers: Record<string, number>;
  flags: Record<string, boolean>;
}

export interface DeviceReadout {
  label: string;
  value: string;
  tone?: 'normal' | 'good' | 'warn' | 'bad';
}

export interface DeviceReport {
  id: DeviceId;
  spec: DeviceSpec;
  status: DeviceStatus;
  statusLabel: string;
  readouts: DeviceReadout[];
  upstream: DeviceId[];
  downstream: DeviceId[];
  controls: ControlSpec[];
  boundary: string;
  stateNote: string;
}

export interface Metrics {
  receivedMassT: number;
  shippedMassT: number;
  receivedUnits: number;
  shippedUnits: number;
  onSiteUnits: number;
  lostUnits: number;
  /** Packages that were reclassified into the miscellaneous stream this shift (optical tail). */
  tailUnits: number;
  recoveryRate: number;
  runningDevices: number;
  totalDevices: number;
  balesProduced: number;
  truckTrips: number;
  forkliftTrips: number;
  shiftProgress: number;
  byMaterial: { material: Material; label: string; received: number; shipped: number; onSite: number }[];
}
