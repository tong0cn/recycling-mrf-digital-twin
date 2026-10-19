import type {
  Bale,
  Forklift,
  ForkliftId,
  MaterialUnit,
  Point,
  SiloId,
  SimState,
  TransportJob,
  TruckId,
} from '../types';
import { FORKLIFT_IDS, FORKLIFT_OFFSET, HANDLING, SHIFT } from './data';
import {
  pointAlong,
  polylineLength,
  routePoints,
  SCALE,
  travelsInAisle,
  TRUCK_PARKING,
  WAYPOINTS,
} from '../spatial/layout';
import type { WaypointId } from '../types';
import { logEvent, unitMassOf } from './runtime';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function placeTruck(state: SimState, id: TruckId, progress: number): void {
  const truck = state.trucks[id];
  const parking = TRUCK_PARKING[id];
  truck.progress = progress;
  truck.x = lerp(parking.dock.x, parking.x, 1 - progress);
  truck.z = lerp(parking.dock.z, parking.z, 1 - progress);
}

const TRUCK_CARGO: Record<'TRUCK_A' | 'TRUCK_B', (unit: MaterialUnit) => boolean> = {
  TRUCK_A: (unit) => unit.kind === 'PLASTIC' || unit.kind === 'TEXTILE',
  TRUCK_B: (unit) => unit.kind === 'BULK',
};

function scheduleSegment(start: number, end: number, index: number, count: number): number {
  return start + ((end - start) * index) / Math.max(1, count);
}

/** Release unloaded packages from a truck into the staging area, following the shift schedule. */
function releaseCargo(state: SimState, id: 'TRUCK_A' | 'TRUCK_B'): void {
  const schedule = SHIFT[id];
  const cargo = state.units.filter(TRUCK_CARGO[id]);
  const split = id === 'TRUCK_A' ? SHIFT.TRUCK_A.plasticsDone : (SHIFT.TRUCK_B.unloadFrom + SHIFT.TRUCK_B.unloadTo) / 2;
  const releaseTimes = cargo.map((_unit, index) => {
    const firstHalf = id === 'TRUCK_A'
      ? index < 6
      : index < 2;
    return firstHalf
      ? scheduleSegment(schedule.unloadFrom, split, index, id === 'TRUCK_A' ? 6 : 2)
      : scheduleSegment(split, schedule.unloadTo, id === 'TRUCK_A' ? index - 6 : index - 2, id === 'TRUCK_A' ? 6 : 2);
  });
  while (state.released[id] < cargo.length && releaseTimes[state.released[id]] <= state.time) {
    const unit = cargo[state.released[id]];
    unit.stage = 'STAGING';
    unit.s = 0;
    unit.carrier = null;
    state.ledger.received[unit.material] += 1;
    state.ledger.receivedMassT += unitMassOf(unit);
    state.trucks[id].onboard -= 1;
    state.released[id] += 1;
    logEvent(state, `${state.trucks[id].label} 卸货：${unit.origin} 来料包入场`);
  }
  state.trucks[id].loadLabel = state.trucks[id].onboard > 0 ? `待卸货 ${state.trucks[id].onboard} 包` : '已卸空';
}

export function stepTrucks(state: SimState): void {
  const time = state.time;

  for (const id of ['TRUCK_A', 'TRUCK_B'] as const) {
    const truck = state.trucks[id];
    const schedule = SHIFT[id];
    if (time < schedule.arriveFrom) {
      truck.status = 'OFF_SITE';
      placeTruck(state, id, 0);
    } else if (time < schedule.dockAt) {
      truck.status = 'APPROACHING';
      placeTruck(state, id, (time - schedule.arriveFrom) / (schedule.dockAt - schedule.arriveFrom));
    } else if (time < schedule.unloadFrom) {
      truck.status = 'DOCKED';
      placeTruck(state, id, 1);
    } else if (time < schedule.unloadTo) {
      truck.status = 'UNLOADING';
      placeTruck(state, id, 1);
      releaseCargo(state, id);
    } else if (time < schedule.leaveFrom) {
      truck.status = 'DOCKED';
      placeTruck(state, id, 1);
    } else if (time < schedule.offSiteAt) {
      truck.status = 'LEAVING';
      placeTruck(state, id, 1 - (time - schedule.leaveFrom) / (schedule.offSiteAt - schedule.leaveFrom));
      if (id === 'TRUCK_B') shipExportPackages(state);
    } else {
      truck.status = 'OFF_SITE';
      placeTruck(state, id, 0);
    }
  }

  const outbound = state.trucks.TRUCK_C;
  const schedule = SHIFT.TRUCK_C;
  if (time < schedule.arriveFrom) {
    outbound.status = 'OFF_SITE';
    placeTruck(state, 'TRUCK_C', 0);
    outbound.weighed = false;
  } else if (time < schedule.dockAt) {
    outbound.status = 'APPROACHING';
    placeTruck(state, 'TRUCK_C', (time - schedule.arriveFrom) / (schedule.dockAt - schedule.arriveFrom));
  } else if (time < schedule.leaveFrom) {
    outbound.status = time >= schedule.loadFrom ? 'LOADING' : 'DOCKED';
    placeTruck(state, 'TRUCK_C', 1);
    sweepDockedBales(state);
  } else if (time < schedule.offSiteAt) {
    outbound.status = 'LEAVING';
    placeTruck(state, 'TRUCK_C', 1 - (time - schedule.leaveFrom) / (schedule.offSiteAt - schedule.leaveFrom));
    shipLoadedBales(state);
    outbound.weighed = outbound.z < SCALE.z;
  } else {
    outbound.status = 'OFF_SITE';
    placeTruck(state, 'TRUCK_C', 0);
    outbound.weighed = false;
  }
}

/** Bales already waiting on the dock are lifted onto the outbound truck as it opens for loading. */
function sweepDockedBales(state: SimState): void {
  for (const bale of state.bales) {
    if (bale.status !== 'AT_DOCK') continue;
    bale.status = 'LOADED';
    state.trucks.TRUCK_C.onboard += 1;
    logEvent(state, `${bale.material} 打包块装上出货货车`);
  }
  state.trucks.TRUCK_C.loadLabel = state.trucks.TRUCK_C.onboard > 0
    ? `已装 ${state.trucks.TRUCK_C.onboard} 个打包块`
    : '等待装货';
}

function shipLoadedBales(state: SimState): void {
  shipBales(state, (bale) => bale.status === 'LOADED');
  const outbound = state.trucks.TRUCK_C;
  outbound.onboard = 0;
  outbound.loadLabel = '已出货离场';
}

/** Miscellaneous packages ride back out on the transfer truck B. */
function shipExportPackages(state: SimState): void {
  for (const unit of state.units) {
    if (unit.stage !== 'WAITING_EXPORT') continue;
    shipUnit(state, unit);
  }
  const truck = state.trucks.TRUCK_B;
  truck.onboard = 0;
  truck.loadLabel = '回程装走杂项后离场';
}

/**
 * End-of-shift presentation sweep. With default settings the plant is already empty well before
 * this time; when an intervention has throttled the lines, anything still inside is booked out so
 * the cyclic playback never starts a new shift with leftovers. Incoming trucks are never shipped
 * from here, because material still on a truck has not been received yet.
 */
export function finalSweep(state: SimState): void {
  // Runs once: repeating it every step would keep pulling vehicles back out of the return-home leg.
  if (state.time < SHIFT.FINAL_SWEEP_AT || state.swept) return;
  state.swept = true;
  let moved = 0;
  for (const bale of state.bales) {
    if (bale.status === 'SHIPPED') continue;
    bale.status = 'SHIPPED';
    bale.carrier = null;
    for (const unitId of bale.unitIds) {
      const unit = state.units.find((candidate) => candidate.id === unitId);
      if (unit && shipUnit(state, unit)) moved += 1;
    }
  }
  for (const unit of state.units) {
    if (unit.stage === 'TRUCK') continue;
    if (shipUnit(state, unit)) moved += 1;
  }
  for (const siloId of Object.keys(state.silos) as SiloId[]) {
    state.silos[siloId].units = 0;
    state.silos[siloId].baling = null;
  }
  state.storage.cardboardUnits = 0;
  state.storage.miscUnits = 0;
  state.arm.phase = 'IDLE';
  state.arm.phaseElapsed = 0;
  state.arm.unitId = null;
  state.arm.target = null;
  state.arm.queue.length = 0;
  // Nothing new is dispatched once the plant has been swept for the end of the shift.
  for (const job of state.jobs) job.status = 'DONE';
  for (const forklift of Object.values(state.forklifts)) {
    if (state.aisle.occupant === forklift.id) state.aisle.occupant = null;
    forklift.status = 'IDLE';
    forklift.jobId = null;
    forklift.leg = null;
    forklift.loaded = false;
    forklift.cargoLabel = '空载';
    forklift.cargoUnitIds = [];
    forklift.cargoBaleIds = [];
    forklift.dwell = 0;
    // Cleared so the return-home leg can be planned again from the current position.
    forklift.returning = false;
    // A stopped plant cannot drive home, and a vehicle too far away to make it before the loop
    // restarts is parked in its bay directly. With default settings both vehicles are already home.
    const remaining = SHIFT.DURATION - state.time;
    const distance = Math.hypot(forklift.x - forklift.startX, forklift.z - forklift.startZ);
    if (state.anomalies.emergencyStop || distance > remaining * HANDLING.returnSpeed) {
      forklift.x = forklift.startX;
      forklift.z = forklift.startZ;
      forklift.route = [{ x: forklift.startX, z: forklift.startZ }];
      forklift.travelled = 0;
      forklift.progress = 0;
    }
  }
  if (moved) logEvent(state, `班末清场：${moved} 包剩余物料已计入出场`);
}

const BALER_WAYPOINT: Record<string, WaypointId> = {
  SILO_PET: 'BALER_PLASTIC',
  SILO_HDPE: 'BALER_PLASTIC',
  SILO_COTTON: 'BALER_TEXTILE',
  SILO_POLYESTER: 'BALER_TEXTILE',
  SILO_BLEND: 'BALER_TEXTILE',
  BALER_CARDBOARD: 'BALER_CARDBOARD',
};

function addJob(state: SimState, job: Omit<TransportJob, 'status' | 'vehicle' | 'startedAt'>): void {
  if (state.jobs.some((existing) => existing.id === job.id)) return;
  state.jobs.push({ ...job, status: 'QUEUED', vehicle: null, startedAt: null });
}

/** Job creation is driven by the plant state, so interventions change the transport plan too. */
function createJobs(state: SimState): void {
  if (state.swept) return;
  const stagedUnits = (kind: MaterialUnit['kind']) =>
    state.units.filter((unit) => unit.stage === 'STAGING' && unit.kind === kind).map((unit) => unit.id);

  if (state.released.TRUCK_A >= 6) {
    addJob(state, {
      id: 'J-PLASTIC-IN', unitIds: stagedUnits('PLASTIC'), baleIds: [], label: '塑料来料包上线',
      from: 'STAGING', to: 'VIB_FEEDER', preferred: 'FL1', enqueuedAt: state.time,
    });
  }
  if (state.released.TRUCK_A >= 12) {
    addJob(state, {
      id: 'J-TEXTILE-IN', unitIds: stagedUnits('TEXTILE'), baleIds: [], label: '纺织来料包上线',
      from: 'STAGING', to: 'SPREADER', preferred: 'FL2', enqueuedAt: state.time,
    });
  }
  const stagedBulk = (material: 'CARDBOARD' | 'MISC') =>
    state.units.filter((unit) => unit.stage === 'STAGING' && unit.origin === material).map((unit) => unit.id);
  if (state.released.TRUCK_B >= 2) {
    addJob(state, {
      id: 'J-CARDBOARD-IN', unitIds: stagedBulk('CARDBOARD'), baleIds: [], label: '纸板入库',
      from: 'STAGING', to: 'STORAGE_CARDBOARD', preferred: 'FL1', enqueuedAt: state.time,
    });
  }
  if (state.released.TRUCK_B >= 4) {
    addJob(state, {
      id: 'J-MISC-IN', unitIds: stagedBulk('MISC'), baleIds: [], label: '杂项入库',
      from: 'STAGING', to: 'STORAGE_MISC', preferred: 'FL1', enqueuedAt: state.time,
    });
  }
  // Miscellaneous packages ride back out on truck B. The job collects whatever is in the storage
  // area when the vehicle arrives, so tail produced later in the shift is carried out as well.
  const miscJobs = state.jobs.filter((job) => job.id.startsWith('J-MISC-OUT'));
  if (
    state.time >= SHIFT.MISC_RETURN_JOB_AT
    && state.units.some((unit) => unit.stage === 'STORED_MISC')
    && !miscJobs.some((job) => job.status !== 'DONE')
  ) {
    addJob(state, {
      id: `J-MISC-OUT-${miscJobs.length + 1}`,
      unitIds: [], baleIds: [], label: '杂项回程装车', from: 'STORAGE_MISC', to: 'DOCK_IN_2', preferred: 'FL2',
      enqueuedAt: state.time, dynamic: true,
    });
  }
  for (const bale of state.bales) {
    if (bale.status !== 'READY') continue;
    addJob(state, {
      id: `J-BALE-${bale.id}`, unitIds: [], baleIds: [bale.id], label: `${bale.material} 打包块出库`,
      from: BALER_WAYPOINT[bale.source] ?? 'BALER_PLASTIC', to: 'DOCK_OUT', preferred: 'FL1',
      enqueuedAt: state.time,
    });
  }
}

const movingStatus = (forklift: Forklift): Forklift['status'] =>
  forklift.loaded ? 'TRAVEL_LOADED' : 'TRAVEL_EMPTY';

function startRoute(forklift: Forklift, from: Point, to: Point): void {
  const route = routePoints(from, to);
  forklift.route = route;
  forklift.travelled = 0;
  forklift.x = from.x;
  forklift.z = from.z;
}

/** Stand-off position for a waypoint, so two vehicles never share the exact same spot. */
function stationFor(forkliftId: ForkliftId, waypoint: WaypointId): Point {
  const base = WAYPOINTS[waypoint];
  const offset = FORKLIFT_OFFSET[forkliftId];
  return { x: base.x + offset.x, z: base.z + offset.z };
}

/** Which stage a dynamic job collects from at each pickup point. */
const PICKUP_STAGE: Partial<Record<WaypointId, MaterialUnit['stage']>> = {
  STAGING: 'STAGING',
  STORAGE_MISC: 'STORED_MISC',
  STORAGE_CARDBOARD: 'STORED_CARDBOARD',
};

/** Resolve the packages to pick up. A dynamic job takes whatever waits at the pickup point. */
function pickupCargo(state: SimState, job: TransportJob): { units: MaterialUnit[]; bales: Bale[] } {
  const stage = job.dynamic ? PICKUP_STAGE[job.from] : undefined;
  const units = (stage
    ? state.units.filter((unit) => unit.stage === stage)
    : state.units.filter((unit) => job.unitIds.includes(unit.id))
  ).filter((unit) => unit.stage !== 'SHIPPED');
  return { units, bales: state.bales.filter((bale) => job.baleIds.includes(bale.id) && bale.status !== 'SHIPPED') };
}

/** Resolve the packages a vehicle is carrying, by what it recorded when it loaded them. */
function carriedCargo(state: SimState, forklift: Forklift): { units: MaterialUnit[]; bales: Bale[] } {
  return {
    units: state.units.filter((unit) => forklift.cargoUnitIds.includes(unit.id) && unit.stage !== 'SHIPPED'),
    bales: state.bales.filter((bale) => forklift.cargoBaleIds.includes(bale.id) && bale.status !== 'SHIPPED'),
  };
}

/**
 * Book one package out of the plant. Idempotent: a package that already left is never counted a
 * second time, which is what keeps the mass ledger exact when several paths could ship it.
 */
export function shipUnit(state: SimState, unit: MaterialUnit): boolean {
  if (unit.stage === 'SHIPPED') return false;
  unit.stage = 'SHIPPED';
  unit.baleId = null;
  unit.carrier = null;
  unit.s = 0;
  state.ledger.shipped[unit.material] += 1;
  state.ledger.shippedByOrigin[unit.origin] += 1;
  state.ledger.shippedMassT += unitMassOf(unit);
  return true;
}

function shipBales(state: SimState, predicate: (bale: Bale) => boolean): void {
  for (const bale of state.bales) {
    if (bale.status === 'SHIPPED' || !predicate(bale)) continue;
    bale.status = 'SHIPPED';
    bale.carrier = null;
    for (const unitId of bale.unitIds) {
      const unit = state.units.find((candidate) => candidate.id === unitId);
      if (unit) shipUnit(state, unit);
    }
  }
}

function loadCargo(state: SimState, job: TransportJob, forkliftId: ForkliftId): void {
  const forklift = state.forklifts[forkliftId];
  const { units, bales } = pickupCargo(state, job);
  forklift.cargoUnitIds = units.map((unit) => unit.id);
  forklift.cargoBaleIds = bales.map((bale) => bale.id);
  for (const unit of units) {
    // Picking a package up out of a storage area must free its slot right away.
    if (unit.stage === 'STORED_MISC') state.storage.miscUnits -= 1;
    if (unit.stage === 'STORED_CARDBOARD') state.storage.cardboardUnits -= 1;
    unit.stage = 'CARRIED';
    unit.carrier = forkliftId;
  }
  for (const bale of bales) {
    bale.status = 'CARRIED';
    bale.carrier = forkliftId;
  }
  forklift.loaded = true;
  forklift.cargoLabel = `${units.length + bales.length} 件 · ${job.label}`;
}

/** Drop the carried cargo at the destination, wiring the plant state that the next stage reads. */
function unloadCargo(state: SimState, job: TransportJob, forkliftId: ForkliftId): void {
  const forklift = state.forklifts[forkliftId];
  const { units, bales } = carriedCargo(state, forklift);
  for (const unit of units) {
    unit.carrier = null;
    unit.s = 0;
    switch (job.to) {
      case 'VIB_FEEDER': unit.stage = 'HOPPER'; break;
      case 'SPREADER': unit.stage = 'SPREAD_BUFFER'; break;
      case 'STORAGE_CARDBOARD':
        unit.stage = 'STORED_CARDBOARD';
        state.storage.cardboardUnits += 1;
        break;
      case 'STORAGE_MISC':
        unit.stage = 'STORED_MISC';
        state.storage.miscUnits += 1;
        break;
      case 'DOCK_IN_2': unit.stage = 'WAITING_EXPORT'; break;
      default: unit.stage = 'STAGING';
    }
  }
  for (const bale of bales) {
    bale.carrier = null;
    bale.status = state.trucks.TRUCK_C.status === 'LOADING' ? 'LOADED' : 'AT_DOCK';
    if (bale.status === 'LOADED') {
      state.trucks.TRUCK_C.onboard += 1;
      state.trucks.TRUCK_C.loadLabel = `已装 ${state.trucks.TRUCK_C.onboard} 个打包块`;
      logEvent(state, `${bale.material} 打包块装上出货货车`);
    } else {
      logEvent(state, `${bale.material} 打包块已送至出货月台等待装车`);
    }
  }
  forklift.loaded = false;
  forklift.cargoLabel = '空载';
  forklift.cargoUnitIds = [];
  forklift.cargoBaleIds = [];
  logEvent(state, `${forklift.id} 完成搬运：${job.label}`);
}

export function stepJobs(state: SimState): void {
  createJobs(state);
  for (const forkliftId of FORKLIFT_IDS) {
    const forklift = state.forklifts[forkliftId];
    if (forklift.status !== 'IDLE' || forklift.jobId) continue;
    const queued = state.jobs.filter((job) => job.status === 'QUEUED');
    if (!queued.length) continue;
    const job = queued.find((candidate) => candidate.preferred === forkliftId) ?? queued[0];
    job.status = 'ACTIVE';
    job.vehicle = forkliftId;
    job.startedAt = state.time;
    forklift.jobId = job.id;
    forklift.leg = 'PICKUP';
    forklift.status = 'TRAVEL_EMPTY';
    forklift.trips += 1;
    startRoute(forklift, { x: forklift.x, z: forklift.z }, stationFor(forkliftId, job.from));
  }
}

export function stepForklifts(state: SimState): void {
  for (const forkliftId of FORKLIFT_IDS) {
    const forklift = state.forklifts[forkliftId];
    if (forklift.status === 'IDLE') continue;
    const job = state.jobs.find((candidate) => candidate.id === forklift.jobId) ?? null;

    if (forklift.status === 'LOADING' || forklift.status === 'UNLOADING') {
      forklift.dwell -= SHIFT.STEP;
      if (forklift.dwell > 0) continue;
      if (!job) {
        forklift.status = 'IDLE';
        forklift.leg = null;
        continue;
      }
      if (forklift.status === 'LOADING') {
        loadCargo(state, job, forkliftId);
        forklift.leg = 'DROPOFF';
        forklift.status = 'TRAVEL_LOADED';
        startRoute(forklift, { x: forklift.x, z: forklift.z }, stationFor(forkliftId, job.to));
      } else {
        unloadCargo(state, job, forkliftId);
        job.status = 'DONE';
        forklift.jobId = null;
        forklift.leg = null;
        forklift.status = 'IDLE';
        if (state.aisle.occupant === forkliftId) state.aisle.occupant = null;
      }
      continue;
    }

    const routeLength = polylineLength(forklift.route);
    const travelled =
      forklift.travelled + (forklift.returning ? HANDLING.returnSpeed : HANDLING.speed) * SHIFT.STEP;
    const clamped = Math.min(travelled, routeLength);
    const inside = travelsInAisle(forklift.route, clamped);
    if (inside && state.aisle.occupant !== null && state.aisle.occupant !== forkliftId) {
      forklift.status = 'WAITING_AISLE';
      continue;
    }
    if (inside) state.aisle.occupant = forkliftId;
    else if (state.aisle.occupant === forkliftId) state.aisle.occupant = null;

    forklift.travelled = clamped;
    forklift.progress = routeLength > 0 ? clamped / routeLength : 1;
    const position = pointAlong(forklift.route, clamped);
    forklift.x = position.x;
    forklift.z = position.z;
    if (forklift.status === 'WAITING_AISLE') forklift.status = forklift.returning ? 'TRAVEL_EMPTY' : movingStatus(forklift);

    if (clamped < routeLength) continue;
    // Transit-mutex held only while the vehicle is inside the aisle.
    if (state.aisle.occupant === forkliftId) state.aisle.occupant = null;
    if (forklift.returning) {
      forklift.returning = false;
      forklift.status = 'IDLE';
      continue;
    }
    if (forklift.leg === 'PICKUP') {
      forklift.status = 'LOADING';
      forklift.dwell = HANDLING.load;
    } else {
      forklift.status = 'UNLOADING';
      forklift.dwell = HANDLING.unload;
    }
  }
}

/** After the last transport, park the fleet back at its start bays so the loop restarts cleanly. */
export function stepReturnHome(state: SimState): void {
  for (const forkliftId of FORKLIFT_IDS) {
    const forklift = state.forklifts[forkliftId];
    if (forklift.status !== 'IDLE' || forklift.jobId || forklift.returning) continue;
    if (state.time < SHIFT.RETURN_HOME_AT) continue;
    const start = { x: forklift.startX, z: forklift.startZ };
    if (Math.hypot(forklift.x - start.x, forklift.z - start.z) < 0.05) continue;
    forklift.returning = true;
    forklift.leg = null;
    forklift.status = 'TRAVEL_EMPTY';
    startRoute(forklift, { x: forklift.x, z: forklift.z }, start);
  }
}

export function prunePuffs(state: SimState): void {
  for (const puff of state.puffs) puff.life -= SHIFT.STEP;
  state.puffs = state.puffs.filter((puff) => puff.life > 0);
}
