import type {
  Anomalies,
  DeviceId,
  Forklift,
  ForkliftId,
  Ledger,
  Material,
  MaterialUnit,
  Silo,
  SiloId,
  SimSettings,
  SimState,
  TimedCommand,
  Truck,
  TruckId,
} from '../types';
import { ALL_MATERIALS } from '../types';
import { FLAG_DEFAULTS, FORKLIFT_START_ID, INBOUND_PLAN, MATERIAL_META, NUMBER_DEFAULTS, SHIFT, SILO_CONFIG, TRUCK_MANIFEST } from './data';
import { TRUCK_PARKING } from '../spatial/layout';

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const clamp01 = (value: number): number => clamp(value, 0, 1);

export function zeroByMaterial(): Record<Material, number> {
  return Object.fromEntries(ALL_MATERIALS.map((material) => [material, 0])) as Record<Material, number>;
}

export function defaultSettings(): SimSettings {
  return { numbers: { ...NUMBER_DEFAULTS }, flags: { ...FLAG_DEFAULTS } };
}

/** A command is a recorded intervention; the log is the only way the demo state can be changed. */
export function applyCommand(settings: SimSettings, command: TimedCommand): SimSettings {
  if (command.flag) settings.flags[command.key] = Boolean(command.value);
  else settings.numbers[command.key] = command.value;
  return settings;
}

/**
 * First step at which a command recorded at `time` takes effect. The epsilon keeps a command
 * recorded exactly at a step boundary (the clock only ever reports whole steps) on that step,
 * instead of slipping to the next one through a floating point rounding artefact.
 */
export const stepOfTime = (time: number): number => Math.max(0, Math.ceil(time / SHIFT.STEP - 1e-9));

export function settingsAt(log: readonly TimedCommand[], step: number): SimSettings {
  const settings = defaultSettings();
  for (const command of log) if (stepOfTime(command.at) <= step) applyCommand(settings, command);
  return settings;
}

export const devicePowered = (settings: SimSettings, device: DeviceId): boolean =>
  !settings.flags.emergencyStop && settings.flags[`power:${device}`] !== false;

const efficiencyOf = (threshold: number, pressure: number, settings: SimSettings): number => {
  const base = threshold * (settings.numbers.efficiencyFloor + settings.numbers.efficiencyPerBar * pressure);
  return clamp01(base * (settings.flags.missort ? 0.65 : 1));
};

export const sorterEfficiency = (settings: SimSettings, sorter: 'SORTER_1' | 'SORTER_2'): number =>
  sorter === 'SORTER_1'
    ? efficiencyOf(settings.numbers.sorter1Threshold, settings.numbers.airPressure1, settings)
    : efficiencyOf(settings.numbers.sorter2Threshold, settings.numbers.airPressure2, settings);

export const hyperspectralEfficiency = (settings: SimSettings): number =>
  clamp01(settings.numbers.hyperspecThreshold * (settings.flags.missort ? 0.7 : 1));

export function createSilos(settings: SimSettings): Record<SiloId, Silo> {
  return Object.fromEntries(
    (Object.keys(SILO_CONFIG) as SiloId[]).map((id) => [
      id,
      {
        id,
        material: SILO_CONFIG[id].material,
        units: 0,
        capacity: SILO_CONFIG[id].capacity,
        threshold: settings.numbers[`threshold:${id}`] ?? SILO_CONFIG[id].threshold,
        baling: null,
        balesProduced: 0,
        overflowUnits: 0,
      } satisfies Silo,
    ]),
  ) as Record<SiloId, Silo>;
}

export const siloOfGrade = (grade: string): SiloId | null =>
  (((Object.keys(SILO_CONFIG) as SiloId[]).find((id) => SILO_CONFIG[id].material === grade)) ?? null);

export function createForklifts(): Record<ForkliftId, Forklift> {
  const entries = (Object.keys(FORKLIFT_START_ID) as ForkliftId[]).map((id) => {
    const forklift: Forklift = {
      id,
      status: 'IDLE',
      jobId: null,
      progress: 0,
      x: FORKLIFT_START_ID[id].x,
      z: FORKLIFT_START_ID[id].z,
      cargoLabel: '空载',
      trips: 0,
      startX: FORKLIFT_START_ID[id].x,
      startZ: FORKLIFT_START_ID[id].z,
      route: [{ x: FORKLIFT_START_ID[id].x, z: FORKLIFT_START_ID[id].z }],
      travelled: 0,
      leg: null,
      loaded: false,
      cargoUnitIds: [],
      cargoBaleIds: [],
      dwell: 0,
      returning: false,
    };
    return [id, forklift] as const;
  });
  return Object.fromEntries(entries) as Record<ForkliftId, Forklift>;
}

export function createTrucks(): Record<TruckId, Truck> {
  const manifest: Record<TruckId, number> = {
    TRUCK_A: INBOUND_PLAN.plastic.length + INBOUND_PLAN.textile.length,
    TRUCK_B: INBOUND_PLAN.cardboard.length + INBOUND_PLAN.misc.length,
    TRUCK_C: 0,
  };
  return Object.fromEntries(
    (Object.keys(TRUCK_MANIFEST) as TruckId[]).map((id) => [
      id,
      {
        id,
        role: id === 'TRUCK_A' ? 'INBOUND_PRIMARY' : id === 'TRUCK_B' ? 'INBOUND_BULK' : 'OUTBOUND',
        label: TRUCK_MANIFEST[id].label,
        status: 'OFF_SITE',
        progress: 0,
        x: TRUCK_PARKING[id].x,
        z: TRUCK_PARKING[id].z,
        onboard: manifest[id],
        loadLabel: manifest[id] > 0 ? `待卸货 ${manifest[id]} 包` : '空载',
        weighed: false,
      } satisfies Truck,
    ]),
  ) as Record<TruckId, Truck>;
}

/** Package mass always follows the material it was received as, so the ledger stays exact. */
export const unitMassOf = (unit: MaterialUnit): number => MATERIAL_META[unit.origin].unitMassT;

export function createLedger(): Ledger {
  return {
    received: zeroByMaterial(),
    shipped: zeroByMaterial(),
    shippedByOrigin: zeroByMaterial(),
    lost: zeroByMaterial(),
    receivedMassT: 0,
    shippedMassT: 0,
  };
}

export function createAnomalies(): Anomalies {
  return { missort: false, siloOverflowWarning: false, emergencyStop: false };
}

/** Every received package starts on its inbound truck. */
export function createUnits(): MaterialUnit[] {
  const fromPlan = (entries: { id: number; material: Material }[], kind: MaterialUnit['kind']): MaterialUnit[] =>
    entries.map((entry) => ({
      id: entry.id,
      kind,
      origin: entry.material,
      material: entry.material,
      stage: 'TRUCK' as const,
      s: 0,
      decided: null,
      baleId: null,
      carrier: null,
    }));
  return [
    ...fromPlan(INBOUND_PLAN.plastic, 'PLASTIC'),
    ...fromPlan(INBOUND_PLAN.textile, 'TEXTILE'),
    ...fromPlan(INBOUND_PLAN.cardboard, 'BULK'),
    ...fromPlan(INBOUND_PLAN.misc, 'BULK'),
  ];
}

export const unitsOfTruck = (units: MaterialUnit[], truck: TruckId): MaterialUnit[] =>
  units.filter((unit) =>
    truck === 'TRUCK_A' ? unit.kind === 'PLASTIC' || unit.kind === 'TEXTILE' : unit.kind === 'BULK',
  );

export function emptyState(): SimState {
  const settings = defaultSettings();
  return {
    step: 0,
    time: 0,
    cycle: 0,
    units: createUnits(),
    bales: [],
    silos: createSilos(settings),
    forklifts: createForklifts(),
    trucks: createTrucks(),
    arm: { phase: 'IDLE', phaseElapsed: 0, unitId: null, target: null, queue: [], cycles: 0 },
    puffs: [],
    jobs: [],
    aisle: { occupant: null },
    storage: { cardboardUnits: 0, miscUnits: 0 },
    ledger: createLedger(),
    anomalies: createAnomalies(),
    released: { TRUCK_A: 0, TRUCK_B: 0 },
    swept: false,
    fedPlastic: 0,
    fedTextile: 0,
    nextFeedAt: 0,
    nextSpreadAt: 0,
    nextUnitId: 0,
    nextBaleId: 1,
    events: [],
  };
}

/**
 * Mirror the anomaly switches into the state. This runs on every step *and* on every seek, so a
 * switch toggled while the clock is paused immediately shows up in statuses, banners and readouts.
 */
export function syncAnomalies(state: SimState, settings: SimSettings): void {
  state.anomalies.missort = settings.flags.missort === true;
  state.anomalies.siloOverflowWarning = settings.flags.siloOverflowWarning === true;
  state.anomalies.emergencyStop = settings.flags.emergencyStop === true;
}

export function logEvent(state: SimState, message: string): void {
  const stamp = state.time.toFixed(1).padStart(5, '0');
  state.events.push(`${stamp}s ${message}`);
  if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
}

/** Units physically still inside the plant, used by the mass balance check. */
export const onSiteUnitCount = (state: SimState): number =>
  state.units.filter((unit) => unit.stage !== 'SHIPPED').length;

export const receivedUnitCount = (state: SimState): number =>
  Object.values(state.ledger.received).reduce((sum, value) => sum + value, 0);

export const shippedUnitCount = (state: SimState): number =>
  Object.values(state.ledger.shipped).reduce((sum, value) => sum + value, 0);

export function unitsInStage(state: SimState, stages: MaterialUnit['stage'][]): MaterialUnit[] {
  return state.units.filter((unit) => stages.includes(unit.stage));
}

/** Deep copy of plain simulation data, used for keyframes and test snapshots. */
export function snapshot(state: SimState): SimState {
  return structuredClone(state);
}
