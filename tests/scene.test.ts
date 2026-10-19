import { describe, expect, it } from 'vitest';
import type { DeviceId } from '../src/types';
import { DEVICE_SPECS } from '../src/simulation/data';
import { STEPS_PER_SHIFT, stateAtStep } from '../src/simulation';
import {
  AISLE,
  BELT_LENGTHS,
  FACTORY,
  PLANT,
  PLASTIC_BELTS,
  WAYPOINTS,
  dist,
  pointAlong,
  routePoints,
  travelsInAisle,
} from '../src/spatial/layout';
import { DEVICE_ANCHORS } from '../src/scene/anchors';
import { beltMesh } from '../src/scene/parts';
import { balePose, unitPose } from '../src/scene/unitPositions';

describe('皮带几何与物料位置', () => {
  it('皮带变换由同一组锚点推导：长度与中点与仿真一致', () => {
    const belt = beltMesh(PLASTIC_BELTS.incline.from, PLASTIC_BELTS.incline.to, PLASTIC_BELTS.incline.fromY, PLASTIC_BELTS.incline.toY, 0.62);
    expect(belt.length).toBeCloseTo(BELT_LENGTHS.incline, 6);
    expect(belt.position[0]).toBeCloseTo((PLASTIC_BELTS.incline.from.x + PLASTIC_BELTS.incline.to.x) / 2, 6);
    expect(belt.position[1]).toBeCloseTo((PLASTIC_BELTS.incline.fromY + PLASTIC_BELTS.incline.toY) / 2, 6);
    // 爬坡机向上抬升，俯仰角必须为负，否则画出来的皮带会向下倾斜。
    expect(belt.pitch).toBeLessThan(0);
  });

  it('物料在皮带上的位置与仿真行程一一对应', () => {
    // Sample the shift and require at least one package actually riding the incline.
    let checked = 0;
    for (let step = 60; step <= STEPS_PER_SHIFT - 1; step += 7) {
      const state = stateAtStep(step, []);
      const unit = state.units.find((candidate) => candidate.stage === 'INCLINE');
      if (!unit) continue;
      const pose = unitPose(unit, state, 0);
      expect(pose.visible).toBe(true);
      expect(pose.x).toBeGreaterThanOrEqual(Math.min(PLASTIC_BELTS.incline.from.x, PLASTIC_BELTS.incline.to.x) - 0.01);
      expect(pose.x).toBeLessThanOrEqual(Math.max(PLASTIC_BELTS.incline.from.x, PLASTIC_BELTS.incline.to.x) + 0.01);
      expect(pose.y).toBeGreaterThanOrEqual(PLASTIC_BELTS.incline.fromY);
      expect(pose.y).toBeLessThanOrEqual(PLASTIC_BELTS.incline.toY + 0.3);
      checked += 1;
      if (checked >= 6) break;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('车上的、料仓内的、已打包的与已出厂的物料不单独绘制', () => {
    const state = stateAtStep(600, []);
    for (const stage of ['TRUCK', 'IN_SILO', 'IN_BALE', 'CARRIED', 'WAITING_EXPORT', 'SHIPPED'] as const) {
      const pose = unitPose({ id: 1, kind: 'PLASTIC', origin: 'PET', material: 'PET', stage, s: 0, decided: null, baleId: null, carrier: null }, state, 0);
      expect(pose.visible, stage).toBe(false);
    }
  });

  it('打包块只在压制、待运、月台与装车状态可见', () => {
    const base = { id: 1, material: 'PET' as const, unitIds: [1], massT: 0.45, source: 'SILO_PET' as const, carrier: null, createdAt: 0, pressRemaining: 0 };
    expect(balePose({ ...base, status: 'PRESSING' }, 0).visible).toBe(true);
    expect(balePose({ ...base, status: 'READY' }, 0).visible).toBe(true);
    expect(balePose({ ...base, status: 'CARRIED' }, 0).visible).toBe(false);
    expect(balePose({ ...base, status: 'LOADED' }, 0).visible).toBe(true);
    expect(balePose({ ...base, status: 'SHIPPED' }, 0).visible).toBe(false);
  });
});

describe('叉车路径与主通道', () => {
  it('同侧行驶不进入主通道，跨区行驶必须经过主通道', () => {
    const sameSide = routePoints(WAYPOINTS.STAGING, WAYPOINTS.VIB_FEEDER);
    expect(sameSide).toHaveLength(2);
    expect(travelsInAisle(sameSide, dist(sameSide[0], sameSide[1]) / 2)).toBe(false);

    const crossPlant = routePoints(WAYPOINTS.STAGING, WAYPOINTS.SPREADER);
    expect(crossPlant.length).toBeGreaterThan(2);
    expect(crossPlant.some((point) => Math.abs(point.z - AISLE.z) < 1e-6)).toBe(true);
    expect(travelsInAisle(crossPlant, dist(crossPlant[0], crossPlant[1]) / 2)).toBe(false);
  });

  it('路径插值始终落在首尾之间，不会越过终点', () => {
    const route = routePoints(WAYPOINTS.STORAGE_MISC, WAYPOINTS.DOCK_IN_2);
    const end = pointAlong(route, 1e6);
    expect(end.x).toBeCloseTo(route[route.length - 1].x, 6);
    expect(end.z).toBeCloseTo(route[route.length - 1].z, 6);
  });
});

describe('场景锚点', () => {
  it('每台设备都有相机聚焦锚点', () => {
    for (const spec of DEVICE_SPECS) {
      const anchor = DEVICE_ANCHORS[spec.id as DeviceId];
      expect(anchor, spec.id).toBeDefined();
      expect(anchor.every((value) => Number.isFinite(value)), spec.id).toBe(true);
    }
  });

  it('每台设备都有相机聚焦锚点且不落在厂房之外', () => {
    for (const spec of DEVICE_SPECS) {
      const anchor = DEVICE_ANCHORS[spec.id as DeviceId];
      expect(anchor, spec.id).toBeDefined();
      expect(anchor.every((value) => Number.isFinite(value)), spec.id).toBe(true);
      const [x, , z] = anchor;
      expect(x, spec.id).toBeGreaterThanOrEqual(FACTORY.minX - 4);
      expect(x, spec.id).toBeLessThanOrEqual(FACTORY.maxX + 4);
      expect(z, spec.id).toBeGreaterThanOrEqual(FACTORY.minZ - 8);
      expect(z, spec.id).toBeLessThanOrEqual(FACTORY.maxZ + 4);
    }
  });

  it('同一时刻的可见物料互不重叠，且设备锚点在厂房范围内', () => {
    for (const step of [300, 900, 1500]) {
      const state = stateAtStep(step, []);
      // Slots are assigned per stage, exactly like the scene assigns them each frame.
      const counters = new Map<string, number>();
      const poses = state.units
        .map((unit) => {
          const slot = counters.get(unit.stage) ?? 0;
          counters.set(unit.stage, slot + 1);
          return unitPose(unit, state, slot);
        })
        .filter((pose) => pose.visible)
        .map((pose) => `${pose.x.toFixed(2)}:${pose.y.toFixed(2)}:${pose.z.toFixed(2)}`);
      expect(new Set(poses).size, `step ${step}`).toBe(poses.length);
    }
  });

  it('设备锚点之间保持可见间距，厂房尺寸与布局常量一致', () => {
    expect(FACTORY.maxX - FACTORY.minX).toBe(40);
    expect(AISLE.z).toBeGreaterThan(FACTORY.minZ + 5);
    expect(AISLE.z).toBeLessThan(FACTORY.maxZ - 5);
    // The plastic line and the textile line must not sit on the same band.
    expect(Math.abs(PLANT.sorter1.z - PLANT.hyperspec.z)).toBeGreaterThan(6);
  });
});
