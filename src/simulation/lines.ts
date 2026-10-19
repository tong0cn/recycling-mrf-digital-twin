import type { MaterialUnit, SiloId, SimSettings, SimState, SortableGrade, UnitStage } from '../types';
import { BELT_LENGTHS } from '../spatial/layout';
import { MATERIAL_META, SEED, SHIFT, SILO_CONFIG } from './data';
import { draw } from './prng';
import { devicePowered, hyperspectralEfficiency, logEvent, sorterEfficiency, unitMassOf } from './runtime';

const BALER_OF: Partial<Record<SortableGrade, 'BALER_PLASTIC' | 'BALER_TEXTILE'>> = {
  PET: 'BALER_PLASTIC',
  HDPE: 'BALER_PLASTIC',
  COTTON: 'BALER_TEXTILE',
  POLYESTER: 'BALER_TEXTILE',
  BLEND: 'BALER_TEXTILE',
};

const CYCLE_KEY = { BALER_PLASTIC: 'baleCyclePlastic', BALER_TEXTILE: 'baleCycleTextile', BALER_CARDBOARD: 'baleCycleCardboard' } as const;

/** Advance a unit by one step and report whether it reached the end of its belt. */
function moveAndCheck(unit: MaterialUnit, length: number, speed: number): boolean {
  unit.s += speed * SHIFT.STEP;
  return unit.s >= length;
}

function enterStage(unit: MaterialUnit, stage: UnitStage): void {
  unit.stage = stage;
  unit.s = 0;
}

function puff(state: SimState, device: 'SORTER_1' | 'SORTER_2'): void {
  state.puffs.push({ device, id: state.puffs.length + 1, life: 0.6 });
}

/** A silo only accepts its own grade; a full silo diverts the package to the miscellaneous area. */
function depositToSilo(state: SimState, unit: MaterialUnit, siloId: SiloId): void {
  const silo = state.silos[siloId];
  if (silo.units >= silo.capacity) {
    silo.overflowUnits += 1;
    unit.material = 'MISC';
    unit.stage = 'STORED_MISC';
    state.storage.miscUnits += 1;
    logEvent(state, `${MATERIAL_META[silo.material].short} 料仓已满，转入杂项存储`);
    return;
  }
  silo.units += 1;
  unit.stage = 'IN_SILO';
  unit.s = 0;
}

/**
 * Feed interval for a line that must finish loading by `deadline`: it never runs slower than the
 * configured rate, and it compresses the interval as the deadline approaches so a lowered rate can
 * no longer leave packages stranded in the buffer when the shift ends.
 */
function feedInterval(rate: number, pending: number, time: number, deadline: number): number {
  const nominal = 60 / Math.max(1, rate);
  if (pending <= 0) return nominal;
  const budget = Math.max(0, deadline - time);
  return Math.min(nominal, budget / pending);
}

/** Vibrating feeder + incline + two optical sorters + transfer belts. */
export function stepPlasticLine(state: SimState, settings: SimSettings): void {
  const speed = devicePowered(settings, 'CONVEYOR') ? settings.numbers.beltSpeed : 0;

  if (devicePowered(settings, 'VIB_FEEDER') && state.time >= state.nextFeedAt) {
    const waiting = state.units.filter((unit) => unit.stage === 'HOPPER');
    if (waiting.length) {
      enterStage(waiting[0], 'INCLINE');
      state.fedPlastic += 1;
      state.nextFeedAt = state.time + feedInterval(settings.numbers.vibFeedRate, waiting.length - 1, state.time, SHIFT.FEED_DONE_AT);
      logEvent(state, `震动上料机投料：第 ${state.fedPlastic} 包（${MATERIAL_META[waiting[0].origin].short}）`);
    } else {
      state.nextFeedAt = state.time + 0.5;
    }
  }

  const petEfficiency = sorterEfficiency(settings, 'SORTER_1');
  const hdpeEfficiency = sorterEfficiency(settings, 'SORTER_2');

  for (const unit of state.units) {
    switch (unit.stage) {
      case 'INCLINE':
        if (devicePowered(settings, 'INCLINE') && moveAndCheck(unit, BELT_LENGTHS.incline, speed)) enterStage(unit, 'SORTER_1');
        break;
      case 'SORTER_1':
        if (devicePowered(settings, 'SORTER_1') && moveAndCheck(unit, BELT_LENGTHS.sorter1, speed)) {
          // PET must be rejected before the HDPE stage, otherwise HDPE would never be reached.
          if (unit.origin === 'PET' && draw(SEED, unit.id, 11) < petEfficiency) {
            unit.decided = 'PET';
            enterStage(unit, 'LANE_PET');
            puff(state, 'SORTER_1');
          } else {
            enterStage(unit, 'PASS_1');
          }
        }
        break;
      case 'PASS_1':
        if (moveAndCheck(unit, BELT_LENGTHS.pass1, speed)) enterStage(unit, 'SORTER_2');
        break;
      case 'SORTER_2':
        if (devicePowered(settings, 'SORTER_2') && moveAndCheck(unit, BELT_LENGTHS.sorter2, speed)) {
          if (unit.origin === 'HDPE' && draw(SEED, unit.id, 23) < hdpeEfficiency) {
            unit.decided = 'HDPE';
            enterStage(unit, 'LANE_HDPE');
            puff(state, 'SORTER_2');
          } else {
            enterStage(unit, 'PASS_2');
          }
        }
        break;
      case 'PASS_2':
        if (moveAndCheck(unit, BELT_LENGTHS.pass2, speed)) enterStage(unit, 'LANE_TAIL');
        break;
      case 'LANE_PET':
        if (moveAndCheck(unit, BELT_LENGTHS.lanePet, speed)) depositToSilo(state, unit, 'SILO_PET');
        break;
      case 'LANE_HDPE':
        if (moveAndCheck(unit, BELT_LENGTHS.laneHdpe, speed)) depositToSilo(state, unit, 'SILO_HDPE');
        break;
      case 'LANE_TAIL':
        if (moveAndCheck(unit, BELT_LENGTHS.laneTail, speed)) {
          unit.material = 'MISC';
          unit.stage = 'STORED_MISC';
          state.storage.miscUnits += 1;
          logEvent(state, `光选尾料转入杂项存储（原 ${MATERIAL_META[unit.origin].short}）`);
        }
        break;
      default:
        break;
    }
  }
}

/** Spreading conveyor + hyperspectral sorter + pick belt. */
export function stepTextileLine(state: SimState, settings: SimSettings): void {
  const speed = devicePowered(settings, 'CONVEYOR') ? settings.numbers.beltSpeed : 0;
  const efficiency = hyperspectralEfficiency(settings);

  if (devicePowered(settings, 'SPREADER') && state.time >= state.nextSpreadAt) {
    const waiting = state.units.filter((unit) => unit.stage === 'SPREAD_BUFFER');
    if (waiting.length) {
      enterStage(waiting[0], 'SPREADER');
      state.fedTextile += 1;
      state.nextSpreadAt = state.time + feedInterval(settings.numbers.spreadRate, waiting.length - 1, state.time, SHIFT.SPREAD_DONE_AT);
      logEvent(state, `上料平铺机构投料：第 ${state.fedTextile} 包（${MATERIAL_META[waiting[0].origin].short}）`);
    } else {
      state.nextSpreadAt = state.time + 0.5;
    }
  }

  for (const unit of state.units) {
    switch (unit.stage) {
      case 'SPREADER':
        if (moveAndCheck(unit, BELT_LENGTHS.spreader, speed)) enterStage(unit, 'HYPERSPEC');
        break;
      case 'HYPERSPEC':
        if (devicePowered(settings, 'HYPERSPEC') && moveAndCheck(unit, BELT_LENGTHS.hyperspec, speed)) {
          if (draw(SEED, unit.id, 37) < efficiency) {
            const grade = unit.origin as SortableGrade;
            unit.decided = grade;
            enterStage(unit, grade === 'COTTON' ? 'LANE_COTTON' : grade === 'POLYESTER' ? 'LANE_POLYESTER' : 'LANE_BLEND');
          } else {
            unit.material = 'MISC';
            unit.stage = 'STORED_MISC';
            state.storage.miscUnits += 1;
            logEvent(state, `高光谱未能识别，转入杂项（${MATERIAL_META[unit.origin].short}）`);
          }
        }
        break;
      case 'LANE_COTTON':
      case 'LANE_POLYESTER':
      case 'LANE_BLEND':
        if (moveAndCheck(unit, BELT_LENGTHS.pickBelt, speed)) {
          unit.stage = 'ARM_PICK';
          unit.s = 0;
          state.arm.queue.push(unit.id);
        }
        break;
      default:
        break;
    }
  }
}

/** Single robotic arm: one package per cycle, dropping it into the bin of its identified grade. */
export function stepArm(state: SimState, settings: SimSettings): void {
  const arm = state.arm;
  const cycle = settings.numbers.armCycle;
  const durations: Record<string, number> = {
    SWING_TO_PICK: cycle * 0.28,
    GRAB: cycle * 0.16,
    SWING_TO_SILO: cycle * 0.34,
    RELEASE: cycle * 0.22,
  };

  if (arm.phase === 'IDLE') {
    if (!devicePowered(settings, 'ROBOT_ARM')) return;
    const nextId = arm.queue.shift();
    if (nextId === undefined) return;
    const unit = state.units.find((candidate) => candidate.id === nextId);
    if (!unit || unit.stage !== 'ARM_PICK') return;
    arm.unitId = nextId;
    arm.target = unit.decided;
    arm.phase = 'SWING_TO_PICK';
    arm.phaseElapsed = 0;
    return;
  }

  arm.phaseElapsed += SHIFT.STEP;
  if (arm.phaseElapsed < (durations[arm.phase] ?? 0.1)) return;
  arm.phaseElapsed = 0;

  const unit = state.units.find((candidate) => candidate.id === arm.unitId);
  switch (arm.phase) {
    case 'SWING_TO_PICK':
      arm.phase = 'GRAB';
      break;
    case 'GRAB':
      if (unit) {
        unit.stage = 'ARM_CARRY';
        unit.carrier = 'ARM';
      }
      arm.phase = 'SWING_TO_SILO';
      break;
    case 'SWING_TO_SILO':
      arm.phase = 'RELEASE';
      break;
    case 'RELEASE': {
      const grade = unit?.decided ?? null;
      if (unit && grade) {
        const siloId = (Object.keys(SILO_CONFIG) as SiloId[]).find((id) => SILO_CONFIG[id].material === grade);
        if (siloId) depositToSilo(state, unit, siloId);
      }
      if (unit) unit.carrier = null;
      arm.unitId = null;
      arm.target = null;
      arm.cycles += 1;
      arm.phase = 'IDLE';
      break;
    }
    default:
      arm.phase = 'IDLE';
  }
}

function balerBusy(state: SimState, baler: 'BALER_PLASTIC' | 'BALER_TEXTILE' | 'BALER_CARDBOARD'): boolean {
  return state.bales.some((bale) =>
    bale.status === 'PRESSING' && (baler === 'BALER_CARDBOARD' ? bale.source === 'BALER_CARDBOARD' : bale.source !== 'BALER_CARDBOARD' && BALER_OF[bale.material as SortableGrade] === baler),
  );
}

/**
 * Threshold baling. A bale takes every package currently in its bin, which keeps the mass
 * ledger exact: packages leave the bin and enter the press in the same step.
 */
export function stepSilos(state: SimState, settings: SimSettings): void {
  const flush = state.time >= SHIFT.FLUSH_BALING_AT;
  for (const siloId of Object.keys(state.silos) as SiloId[]) {
    const silo = state.silos[siloId];
    const threshold = settings.numbers[`threshold:${siloId}`] ?? SILO_CONFIG[siloId].threshold;
    silo.threshold = threshold;
    if (silo.baling !== null) continue;
    const required = flush ? 1 : threshold;
    if (silo.units < required) continue;
    const baler = BALER_OF[silo.material];
    if (!baler || !devicePowered(settings, baler) || balerBusy(state, baler)) continue;

    const batch = state.units.filter((unit) => unit.stage === 'IN_SILO' && unit.material === silo.material);
    const cycleSeconds = settings.numbers[CYCLE_KEY[baler]];
    const baleId = state.nextBaleId;
    state.nextBaleId += 1;
    state.bales.push({
      id: baleId,
      material: silo.material,
      unitIds: batch.map((unit) => unit.id),
      massT: batch.reduce((sum, unit) => sum + unitMassOf(unit), 0),
      source: siloId,
      status: 'PRESSING',
      carrier: null,
      createdAt: state.time,
      pressRemaining: cycleSeconds,
    });
    for (const unit of batch) {
      unit.stage = 'IN_BALE';
      unit.baleId = baleId;
      unit.s = 0;
    }
    silo.units = 0;
    silo.baling = cycleSeconds;
    silo.balesProduced += 1;
    logEvent(state, `${MATERIAL_META[silo.material].short} 料仓达阈值，开始打包（${batch.length} 包）`);
  }
}

/** Cardboard is baled straight out of the storage area, without joining a sorting line. */
export function stepCardboard(state: SimState, settings: SimSettings): void {
  if (state.storage.cardboardUnits < 2) return;
  if (!devicePowered(settings, 'BALER_CARDBOARD') || balerBusy(state, 'BALER_CARDBOARD')) return;
  const batch = state.units.filter((unit) => unit.stage === 'STORED_CARDBOARD').slice(0, 2);
  if (batch.length < 2) return;
  const cycleSeconds = settings.numbers.baleCycleCardboard;
  const baleId = state.nextBaleId;
  state.nextBaleId += 1;
  state.bales.push({
    id: baleId,
    material: 'CARDBOARD',
    unitIds: batch.map((unit) => unit.id),
    massT: batch.reduce((sum, unit) => sum + unitMassOf(unit), 0),
    source: 'BALER_CARDBOARD',
    status: 'PRESSING',
    carrier: null,
    createdAt: state.time,
    pressRemaining: cycleSeconds,
  });
  for (const unit of batch) {
    unit.stage = 'IN_BALE';
    unit.baleId = baleId;
    unit.s = 0;
  }
  state.storage.cardboardUnits -= batch.length;
  logEvent(state, '纸板打包机开始压制纸板包');
}

/** Press cycles finish and release a ready bale for the forklifts. */
export function stepBales(state: SimState): void {
  for (const bale of state.bales) {
    if (bale.status !== 'PRESSING') continue;
    bale.pressRemaining -= SHIFT.STEP;
    if (bale.pressRemaining > 0) continue;
    bale.pressRemaining = 0;
    bale.status = 'READY';
    const siloId = bale.source === 'BALER_CARDBOARD' ? null : (bale.source as SiloId);
    if (siloId) state.silos[siloId].baling = null;
    logEvent(state, `${MATERIAL_META[bale.material].short} 打包完成，等待叉车搬运`);
  }
}
