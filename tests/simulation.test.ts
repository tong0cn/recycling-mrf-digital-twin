import { describe, expect, it } from 'vitest';
import type { Material, SimState, TimedCommand } from '../src/types';
import { ALL_MATERIALS, SORTABLE_GRADES } from '../src/types';
import { SHIFT, SILO_CONFIG } from '../src/simulation/data';
import { STEPS_PER_SHIFT, Simulation, stateAtStep } from '../src/simulation';
import { AISLE } from '../src/spatial/layout';

const LAST_STEP = STEPS_PER_SHIFT - 1;

/** Walk one whole shift through the driving clock, exactly as the UI does. */
function eachStep(visitor: (state: SimState, step: number) => void, steps: number = STEPS_PER_SHIFT): void {
  const simulation = new Simulation();
  for (let index = 0; index < steps; index += 1) {
    simulation.advanceBy(SHIFT.STEP);
    visitor(simulation.current, simulation.currentStep);
  }
}

/**
 * Packages already accepted into the plant. Units still on an inbound truck are physically on
 * site but are not yet booked as received, so they are excluded from the mass balance.
 */
const onSite = (state: SimState): number =>
  state.units.filter((unit) => unit.stage !== 'SHIPPED' && unit.stage !== 'TRUCK').length;

const sum = (record: Record<Material, number>): number =>
  ALL_MATERIALS.reduce((total, material) => total + record[material], 0);

function cycleClosureReport(state: SimState): string[] {
  const problems: string[] = [];
  const notShipped = state.units.filter((unit) => unit.stage !== 'SHIPPED');
  if (notShipped.length) {
    problems.push(`未出货物料 ${notShipped.length} 件：${notShipped.map((unit) => `${unit.id}:${unit.origin}@${unit.stage}`).join(', ')}`);
  }
  const stillPressing = state.bales.filter((bale) => bale.status === 'PRESSING' || bale.status === 'READY' || bale.status === 'CARRIED' || bale.status === 'AT_DOCK' || bale.status === 'LOADED');
  if (stillPressing.length) {
    problems.push(`未出厂打包块 ${stillPressing.length} 个：${stillPressing.map((bale) => `${bale.id}:${bale.material}/${bale.status}`).join(', ')}`);
  }
  for (const [id, silo] of Object.entries(state.silos)) {
    if (silo.units !== 0) problems.push(`${id} 仍有 ${silo.units} 包`);
    if (silo.baling !== null) problems.push(`${id} 仍在压制`);
  }
  if (state.storage.cardboardUnits !== 0) problems.push(`纸板存储区仍有 ${state.storage.cardboardUnits} 包`);
  if (state.storage.miscUnits !== 0) problems.push(`杂项存储区仍有 ${state.storage.miscUnits} 包`);
  for (const forklift of Object.values(state.forklifts)) {
    if (forklift.status !== 'IDLE') problems.push(`${forklift.id} 状态为 ${forklift.status}`);
    if (Math.hypot(forklift.x - forklift.startX, forklift.z - forklift.startZ) > 0.05) {
      problems.push(`${forklift.id} 未回到起始位 (${forklift.x.toFixed(1)}, ${forklift.z.toFixed(1)})`);
    }
  }
  const queued = state.jobs.filter((job) => job.status !== 'DONE');
  if (queued.length) problems.push(`未完成任务 ${queued.map((job) => `${job.id}/${job.status}`).join(', ')}`);
  if (state.aisle.occupant !== null) problems.push(`主通道仍被 ${state.aisle.occupant} 占用`);
  if (state.arm.phase !== 'IDLE' || state.arm.queue.length) problems.push(`机械臂未复位（${state.arm.phase}，队列 ${state.arm.queue.length}）`);
  if (sum(state.ledger.received) !== sum(state.ledger.shipped)) {
    problems.push(`台账不平衡：进 ${sum(state.ledger.received)} / 出 ${sum(state.ledger.shipped)}`);
  }
  return problems;
}

describe('物料守恒', () => {
  it('收到的每一包物料，要么在厂内，要么已随打包块或回程车辆出厂', () => {
    eachStep((state) => {
      expect(sum(state.ledger.received)).toBe(sum(state.ledger.shipped) + onSite(state));
      expect(state.ledger.lost).toEqual({ PET: 0, HDPE: 0, COTTON: 0, POLYESTER: 0, BLEND: 0, CARDBOARD: 0, MISC: 0 });
    });
  });

  it('一个班次结束时全部物料都已出厂，且质量台账前后一致', () => {
    const state = stateAtStep(LAST_STEP, []);
    expect(onSite(state)).toBe(0);
    expect(state.ledger.received).toEqual({ PET: 3, HDPE: 3, COTTON: 2, POLYESTER: 2, BLEND: 2, CARDBOARD: 2, MISC: 2 });
    expect(state.ledger.shipped).toEqual(state.ledger.received);
    expect(state.ledger.shippedMassT).toBeCloseTo(state.ledger.receivedMassT, 6);
  });
});

describe('料仓与打包', () => {
  it('料仓存量始终在容量范围内', () => {
    eachStep((state) => {
      for (const [id, silo] of Object.entries(state.silos)) {
        expect(silo.units, `${id} @ ${state.time.toFixed(1)}s`).toBeGreaterThanOrEqual(0);
        expect(silo.units, `${id} @ ${state.time.toFixed(1)}s`).toBeLessThanOrEqual(SILO_CONFIG[silo.id].capacity);
      }
    });
  });

  it('打包只在料仓达到阈值或班末清仓时启动，且启动时确实持有足够的料', () => {
    // Tracked by bale id: the clock wraps to a fresh plant on the last step of the shift.
    const seen = new Set<number>();
    eachStep((state) => {
      for (const bale of state.bales) {
        if (seen.has(bale.id)) continue;
        seen.add(bale.id);
        const source = bale.source === 'BALER_CARDBOARD' ? null : bale.source;
        const threshold = source ? state.silos[source].threshold : 2;
        const flush = state.time >= SHIFT.FLUSH_BALING_AT;
        // A bale takes every package currently in its bin, so its own size is the trigger amount.
        expect(
          bale.unitIds.length >= threshold || flush,
          `${bale.material} 打包时取了 ${bale.unitIds.length} 包 / 阈值 ${threshold} @ ${state.time.toFixed(1)}s`,
        ).toBe(true);
        expect(bale.unitIds.length).toBeGreaterThan(0);
      }
    });
    expect(seen.size).toBe(6);
  });

  it('打包块数量与阈值一致：默认参数下一个班次出 6 个包', () => {
    const state = stateAtStep(LAST_STEP, []);
    expect(state.bales.length).toBe(6);
    const byMaterial = state.bales.map((bale) => bale.material).sort();
    expect(byMaterial).toEqual(['BLEND', 'CARDBOARD', 'COTTON', 'HDPE', 'PET', 'POLYESTER']);
    for (const bale of state.bales) expect(bale.status).toBe('SHIPPED');
  });
});

describe('光选次序与材质归属', () => {
  it('PET 必须先于 HDPE 被分出：任何进 PET 料仓的物料都只可能是 PET', () => {
    eachStep((state) => {
      const inPet = state.units.filter((unit) => unit.stage === 'IN_SILO' && unit.material === 'PET');
      for (const unit of inPet) expect(unit.origin).toBe('PET');
      const inHdpe = state.units.filter((unit) => unit.stage === 'IN_SILO' && unit.material === 'HDPE');
      for (const unit of inHdpe) expect(unit.origin).toBe('HDPE');
    });
  });

  it('默认参数下两种瓶料全部被识别，尾料为零，杂项以散包形式随回程车辆出厂', () => {
    const state = stateAtStep(LAST_STEP, []);
    const petBale = state.bales.find((bale) => bale.material === 'PET');
    const hdpeBale = state.bales.find((bale) => bale.material === 'HDPE');
    expect(petBale?.unitIds.length).toBe(3);
    expect(hdpeBale?.unitIds.length).toBe(3);
    // Nothing was reclassified: no package left the plant under a different grade than it arrived.
    expect(state.units.every((unit) => unit.origin === unit.material)).toBe(true);
    expect(state.ledger.shipped.MISC).toBe(2);
    expect(state.bales.some((bale) => bale.material === 'MISC')).toBe(false);
  });

  it('降低识别阈值或气吹压力会把瓶料推入尾料，而不是凭空消失', () => {
    const log: TimedCommand[] = [
      { at: 20, device: 'SORTER_1', key: 'airPressure1', value: 2 },
      { at: 20, device: 'SORTER_2', key: 'airPressure2', value: 2 },
    ];
    const state = stateAtStep(LAST_STEP, log);
    // More MISC leaves the plant than the two miscellaneous packages that arrived.
    expect(state.ledger.shipped.MISC).toBeGreaterThan(2);
    // The reclassified packages are still accounted for: nothing vanished and nothing stayed.
    expect(state.units.filter((unit) => unit.origin !== unit.material).length).toBeGreaterThan(0);
    expect(sum(state.ledger.shipped)).toBe(sum(state.ledger.received));
    expect(onSite(state)).toBe(0);
  });
});

describe('叉车与主通道', () => {
  it('单行主通道同一时刻最多只有一台叉车进入', () => {
    eachStep((state) => {
      const inside = Object.values(state.forklifts).filter(
        (forklift) => forklift.status !== 'IDLE' && Math.abs(forklift.z - AISLE.z) <= AISLE.halfWidth + 1e-6,
      );
      expect(inside.length).toBeLessThanOrEqual(1);
    });
  });

  it('确实发生过等待主通道，说明互斥规则被真实触发而不是闲置', () => {
    let waits = 0;
    eachStep((state) => {
      for (const forklift of Object.values(state.forklifts)) if (forklift.status === 'WAITING_AISLE') waits += 1;
    });
    expect(waits).toBeGreaterThan(0);
  });

  it('两台叉车永不同时停留在同一位置', () => {
    eachStep((state) => {
      const [first, second] = [state.forklifts.FL1, state.forklifts.FL2];
      if (first.status === 'IDLE' && second.status === 'IDLE') return;
      expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThan(0.4);
    });
  });

  it('一个班次内两台叉车完成全部搬运且回到起始位', () => {
    const state = stateAtStep(LAST_STEP, []);
    expect(state.forklifts.FL1.trips + state.forklifts.FL2.trips).toBeGreaterThanOrEqual(11);
    expect(cycleClosureReport(state)).toEqual([]);
  });
});

describe('确定性', () => {
  it('同一步数必然得到完全相同的状态', () => {
    for (const step of [0, 1, 300, 1500, LAST_STEP]) {
      expect(stateAtStep(step, [])).toEqual(stateAtStep(step, []));
    }
  });

  it('暂停不改变轨迹：分多次推进与一次推进结果一致', () => {
    const straight = new Simulation();
    straight.advanceBy(40);
    const paused = new Simulation();
    for (let index = 0; index < 40; index += 1) {
      paused.advanceBy(0.5);
      paused.advanceBy(0.5);
      paused.advanceBy(0);
    }
    expect(paused.current).toEqual(straight.current);
  });

  it('倍速不改变轨迹：1 倍速逐帧与 4 倍速推进到同一时刻结果一致', () => {
    const normal = new Simulation();
    for (let index = 0; index < 60 * 30; index += 1) normal.advanceBy(SHIFT.STEP);
    const fast = new Simulation();
    for (let index = 0; index < 15 * 30; index += 1) fast.advanceBy(SHIFT.STEP * 4);
    expect(fast.currentStep).toBe(normal.currentStep);
    expect(fast.current).toEqual(normal.current);
  });

  it('拖动时间轴回到过去再前进，结果与直进一致', () => {
    const reference = stateAtStep(1200, []);
    const simulation = new Simulation();
    simulation.advanceBy(60);
    simulation.seekToTime(10);
    simulation.seekToTime(40);
    simulation.advanceBy(0);
    expect(simulation.current).toEqual(reference);
  });

  it('重置后回到同一轨迹起点', () => {
    const simulation = new Simulation();
    simulation.advanceBy(30);
    simulation.reset();
    expect(simulation.currentStep).toBe(0);
    expect(simulation.current).toEqual(stateAtStep(0, []));
  });

  it('干预按记录时刻生效，重放结果一致', () => {
    const log: TimedCommand[] = [
      { at: 12, device: 'CONVEYOR', key: 'beltSpeed', value: 1.4 },
      { at: 30, device: 'ROBOT_ARM', key: 'armCycle', value: 1.6 },
    ];
    const first = stateAtStep(2000, log);
    const second = stateAtStep(2000, log);
    expect(first).toEqual(second);
    const withoutLog = stateAtStep(2000, []);
    expect(first).not.toEqual(withoutLog);

    const simulation = new Simulation();
    simulation.addCommand(log[0]);
    simulation.addCommand(log[1]);
    simulation.advanceBy(2000 * SHIFT.STEP);
    expect(simulation.current).toEqual(first);
  });
});

describe('周期闭合', () => {
  it('一个班次结束时厂内回到初始物理状态，循环可无缝衔接', () => {
    const state = stateAtStep(LAST_STEP, []);
    expect(cycleClosureReport(state)).toEqual([]);
  });

  it('第二个班次与第一个班次在同一时刻状态完全一致', () => {
    const simulation = new Simulation();
    simulation.advanceBy(SHIFT.DURATION + 30);
    expect(simulation.completedCycles).toBe(1);
    // `cycle` is the running cycle counter; the physical plant state must restart identically.
    expect({ ...simulation.current, cycle: 0 }).toEqual(stateAtStep(Math.round(30 / SHIFT.STEP), []));
  });

  it('一个班次进厂 16 包，与来料清单一致', () => {
    const state = stateAtStep(LAST_STEP, []);
    expect(sum(state.ledger.received)).toBe(16);
    expect(sum(state.ledger.shipped)).toBe(16);
  });
});

describe('指标与设备读数', () => {
  it('默认参数下回收率为 100%，运行设备数不超过总数', async () => {
    const { computeMetrics } = await import('../src/simulation/readouts');
    const state = stateAtStep(LAST_STEP, []);
    const metrics = computeMetrics(state, 0);
    expect(metrics.recoveryRate).toBeCloseTo(1, 3);
    expect(metrics.runningDevices).toBeLessThanOrEqual(metrics.totalDevices);
    expect(metrics.byMaterial.map((row) => row.material)).toEqual([...SORTABLE_GRADES, 'CARDBOARD', 'MISC']);
  });

  it('每台设备都能给出报告、状态与上下游关系', async () => {
    const { describeDevice } = await import('../src/simulation/readouts');
    const { DEVICE_SPECS } = await import('../src/simulation/data');
    const state = stateAtStep(LAST_STEP, []);
    for (const spec of DEVICE_SPECS) {
      const report = describeDevice(state, spec.id);
      expect(report.readouts.length, spec.id).toBeGreaterThan(0);
      expect(report.statusLabel.length, spec.id).toBeGreaterThan(0);
      expect(report.boundary.length, spec.id).toBeGreaterThan(0);
    }
  });
});
