import type { DeviceId, Point } from '../types';
import { DOCKS, PLANT, SILO_POINTS, WAYPOINTS } from '../spatial/layout';

/** Camera focus anchor for each selectable object. */
export const DEVICE_ANCHORS: Record<DeviceId, [number, number, number]> = {
  VIB_FEEDER: [PLANT.vibFeeder.x, 1.2, PLANT.vibFeeder.z],
  INCLINE: [(PLANT.vibFeeder.x + PLANT.sorter1.x) / 2, 1.4, PLANT.vibFeeder.z],
  SORTER_1: [PLANT.sorter1.x, 1.6, PLANT.sorter1.z],
  SORTER_2: [PLANT.sorter2.x, 1.6, PLANT.sorter2.z],
  CONVEYOR: [(PLANT.sorter1.x + PLANT.tailDrop.x) / 2, 1.4, PLANT.sorter1.z],
  SILO_PET: [SILO_POINTS.SILO_PET.x, 1.1, SILO_POINTS.SILO_PET.z],
  SILO_HDPE: [SILO_POINTS.SILO_HDPE.x, 1.1, SILO_POINTS.SILO_HDPE.z],
  SILO_COTTON: [SILO_POINTS.SILO_COTTON.x, 1.1, SILO_POINTS.SILO_COTTON.z],
  SILO_POLYESTER: [SILO_POINTS.SILO_POLYESTER.x, 1.1, SILO_POINTS.SILO_POLYESTER.z],
  SILO_BLEND: [SILO_POINTS.SILO_BLEND.x, 1.1, SILO_POINTS.SILO_BLEND.z],
  BALER_PLASTIC: [PLANT.balerPlastic.x, 0.8, PLANT.balerPlastic.z],
  BALER_TEXTILE: [PLANT.balerTextile.x, 0.8, PLANT.balerTextile.z],
  BALER_CARDBOARD: [PLANT.balerCardboard.x, 0.8, PLANT.balerCardboard.z],
  SPREADER: [(PLANT.spreader.x + PLANT.hyperspec.x) / 2, 1, PLANT.spreader.z],
  HYPERSPEC: [PLANT.hyperspec.x - 1, 1.2, PLANT.hyperspec.z],
  ROBOT_ARM: [PLANT.arm.x, 1.6, PLANT.arm.z],
  STORAGE_CARDBOARD: [PLANT.storageCardboard.x, 0.8, PLANT.storageCardboard.z],
  STORAGE_MISC: [PLANT.storageMisc.x, 0.8, PLANT.storageMisc.z],
  SCALE: [PLANT.checkpoint.x, 0.5, PLANT.checkpoint.z],
  TRUCK_A: [DOCKS.IN_1.x, 1.5, DOCKS.IN_1.z + 2.4],
  TRUCK_B: [DOCKS.IN_2.x, 1.5, DOCKS.IN_2.z + 2.4],
  TRUCK_C: [DOCKS.OUT.x, 1.5, DOCKS.OUT.z + 2.4],
  FORKLIFT_1: [WAYPOINTS.STAGING.x, 1, WAYPOINTS.STAGING.z],
  FORKLIFT_2: [WAYPOINTS.SPREADER.x, 1, WAYPOINTS.SPREADER.z],
};

/** Third-person offset used when the camera focuses on one object. */
export const FOCUS_OFFSET: Point & { y: number } = { x: 6, y: 6, z: 6 };
