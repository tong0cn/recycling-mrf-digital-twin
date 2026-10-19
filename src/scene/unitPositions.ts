import type { Bale, MaterialUnit, Point, SimState } from '../types';
import { BELT_LENGTHS, PLANT, PLASTIC_BELTS, TEXTILE_BELTS, dist } from '../spatial/layout';

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Yaw so flat textile packages lie along the belt direction. */
  rotY: number;
  visible: boolean;
}

const HIDDEN: Pose = { x: 0, y: -10, z: 0, rotY: 0, visible: false };

const RAMP_Y = 0.16;

const SILO_POSITION: Record<string, Point & { y: number }> = {
  COTTON: { ...PLANT.siloCotton, y: 2.4 },
  POLYESTER: { ...PLANT.siloPolyester, y: 2.4 },
  BLEND: { ...PLANT.siloBlend, y: 2.4 },
};

function alongBelt(from: Point, to: Point, fromY: number, toY: number, s: number, slot = 0): Pose {
  const length = dist(from, to) || 1;
  const t = Math.min(1, Math.max(0, s / length));
  // Two packages can share one belt (the three textile grades share the pick belt), so they are
  // separated across the belt width instead of being drawn on top of each other.
  const lateral = ((slot % 3) - 1) * 0.17;
  const perpX = -(to.z - from.z) / length;
  const perpZ = (to.x - from.x) / length;
  return {
    x: from.x + (to.x - from.x) * t + perpX * lateral,
    y: fromY + (toY - fromY) * t + RAMP_Y + (slot % 3) * 0.05,
    z: from.z + (to.z - from.z) * t + perpZ * lateral,
    rotY: Math.atan2(to.x - from.x, to.z - from.z),
    visible: true,
  };
}

/** Staging bay layout: a few rows so packages do not pile up on one spot. */
function stagingPose(index: number): Pose {
  const column = index % 3;
  const row = Math.floor(index / 3) % 3;
  return {
    x: PLANT.staging.x - 2.1 + column * 2.1,
    y: 0.24 + RAMP_Y + Math.floor(index / 9) * 0.28,
    z: PLANT.staging.z - 1 + row * 1,
    rotY: 0,
    visible: true,
  };
}

function storedPose(zone: { x: number; z: number }, index: number): Pose {
  const column = index % 2;
  return {
    x: zone.x - 0.8 + column * 1.6,
    y: 0.24 + RAMP_Y + Math.floor(index / 2) * 0.26,
    z: zone.z + 0.2,
    rotY: 0,
    visible: true,
  };
}

/**
 * Where a material package is drawn. Positions come from the same layout the simulation uses,
 * so the animation can never disagree with the simulated progress `s`.
 */
export function unitPose(unit: MaterialUnit, state: SimState, beltSlot: number): Pose {
  switch (unit.stage) {
    case 'HOPPER':
      return { x: PLANT.vibFeeder.x + 0.2, y: 1.36 + beltSlot * 0.14, z: PLANT.vibFeeder.z, rotY: 0, visible: true };
    case 'SPREAD_BUFFER':
      return { x: PLANT.spreader.x - 0.2, y: 1.02 + beltSlot * 0.12, z: PLANT.spreader.z, rotY: 0, visible: true };
    case 'INCLINE':
      return alongBelt(PLASTIC_BELTS.incline.from, PLASTIC_BELTS.incline.to, PLASTIC_BELTS.incline.fromY, PLASTIC_BELTS.incline.toY, unit.s, beltSlot);
    case 'SORTER_1':
      return alongBelt(PLASTIC_BELTS.sorter1.from, PLASTIC_BELTS.sorter1.to, PLASTIC_BELTS.sorter1.fromY, PLASTIC_BELTS.sorter1.toY, unit.s, beltSlot);
    case 'PASS_1':
      return alongBelt(PLASTIC_BELTS.pass1.from, PLASTIC_BELTS.pass1.to, PLASTIC_BELTS.pass1.fromY, PLASTIC_BELTS.pass1.toY, unit.s, beltSlot);
    case 'SORTER_2':
      return alongBelt(PLASTIC_BELTS.sorter2.from, PLASTIC_BELTS.sorter2.to, PLASTIC_BELTS.sorter2.fromY, PLASTIC_BELTS.sorter2.toY, unit.s, beltSlot);
    case 'PASS_2':
      return alongBelt(PLASTIC_BELTS.pass2.from, PLASTIC_BELTS.pass2.to, PLASTIC_BELTS.pass2.fromY, PLASTIC_BELTS.pass2.toY, unit.s, beltSlot);
    case 'LANE_PET':
      return alongBelt(PLASTIC_BELTS.lanePet.from, PLASTIC_BELTS.lanePet.to, PLASTIC_BELTS.lanePet.fromY, PLASTIC_BELTS.lanePet.toY, unit.s, beltSlot);
    case 'LANE_HDPE':
      return alongBelt(PLASTIC_BELTS.laneHdpe.from, PLASTIC_BELTS.laneHdpe.to, PLASTIC_BELTS.laneHdpe.fromY, PLASTIC_BELTS.laneHdpe.toY, unit.s, beltSlot);
    case 'LANE_TAIL':
      return alongBelt(PLASTIC_BELTS.laneTail.from, PLASTIC_BELTS.laneTail.to, PLASTIC_BELTS.laneTail.fromY, PLASTIC_BELTS.laneTail.toY, unit.s, beltSlot);
    case 'SPREADER':
      return alongBelt(TEXTILE_BELTS.spreader.from, TEXTILE_BELTS.spreader.to, TEXTILE_BELTS.spreader.fromY, TEXTILE_BELTS.spreader.toY, unit.s, beltSlot);
    case 'HYPERSPEC':
      return alongBelt(TEXTILE_BELTS.hyperspec.from, TEXTILE_BELTS.hyperspec.to, TEXTILE_BELTS.hyperspec.fromY, TEXTILE_BELTS.hyperspec.toY, unit.s, beltSlot);
    case 'LANE_COTTON':
    case 'LANE_POLYESTER':
    case 'LANE_BLEND':
      return alongBelt(TEXTILE_BELTS.pickBelt.from, TEXTILE_BELTS.pickBelt.to, TEXTILE_BELTS.pickBelt.fromY, TEXTILE_BELTS.pickBelt.toY, unit.s, beltSlot);
    case 'ARM_PICK':
      return {
        x: PLANT.arm.x - 0.1 - beltSlot * 0.34,
        y: 1.08 + RAMP_Y,
        z: PLANT.arm.z + 0.3 + beltSlot * 0.22,
        rotY: 0,
        visible: true,
      };
    case 'ARM_CARRY': {
      const target = unit.decided ? SILO_POSITION[unit.decided] : null;
      const grip = { x: PLANT.arm.x - 0.2, y: 1.7, z: PLANT.arm.z + 0.4 };
      if (!target) return { ...grip, rotY: 0, visible: true };
      const arm = state.arm;
      // The package follows the arm: it only leaves the pick point on the way to the bin.
      const holdInPlace = arm.phase === 'SWING_TO_PICK' || arm.phase === 'GRAB';
      if (holdInPlace) return { ...grip, rotY: 0, visible: true };
      const total = Math.max(0.1, (SILO_ARM_TRAVEL[arm.phase] ?? 0.4));
      const t = Math.min(1, arm.phaseElapsed / total);
      return {
        x: grip.x + (target.x - grip.x) * t,
        y: grip.y + (target.y - grip.y) * t,
        z: grip.z + (target.z - grip.z) * t,
        rotY: 0,
        visible: true,
      };
    }
    case 'STAGING':
      return stagingPose(beltSlot);
    case 'STORED_CARDBOARD':
      return storedPose(PLANT.storageCardboard, beltSlot);
    case 'STORED_MISC':
      return storedPose(PLANT.storageMisc, beltSlot);
    default:
      // On a truck, inside a silo, inside a press, on the outbound truck or already shipped.
      return HIDDEN;
  }
}

const SILO_ARM_TRAVEL: Record<string, number> = { SWING_TO_SILO: 0.34, RELEASE: 0.22, GRAB: 0.16 };

/** Finished bales are drawn on the press, in the yard, or on the outbound truck. */
export function balePose(bale: Bale, index: number): Pose {
  const source = bale.source;
  const desk = source === 'SILO_PET' || source === 'SILO_HDPE'
    ? { x: PLANT.balerPlastic.x, y: 0.55, z: PLANT.balerPlastic.z - 0.55 }
    : source === 'BALER_CARDBOARD'
      ? { x: PLANT.balerCardboard.x, y: 0.5, z: PLANT.balerCardboard.z - 0.7 }
      : { x: PLANT.balerTextile.x, y: 0.5, z: PLANT.balerTextile.z - 0.7 };
  switch (bale.status) {
    case 'PRESSING':
      return { x: desk.x, y: desk.y, z: desk.z, rotY: 0, visible: true };
    case 'READY':
      return { x: desk.x + 0.9 + index * 0.3, y: desk.y, z: desk.z, rotY: 0, visible: true };
    case 'CARRIED':
      return HIDDEN;
    case 'AT_DOCK':
      return { x: PLANT.outboundStage.x - 1.2 + index * 0.7, y: 0.5, z: PLANT.outboundStage.z, rotY: 0, visible: true };
    case 'LOADED':
      return { x: PLANT.outboundStage.x - 1.2 + index * 0.7, y: 1.5, z: PLANT.outboundStage.z, rotY: 0, visible: true };
    default:
      return HIDDEN;
  }
}

export const BELT_SLOT_LENGTHS = BELT_LENGTHS;
