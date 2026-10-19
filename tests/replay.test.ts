import { describe, expect, it } from 'vitest';
import type { SimState, TimedCommand } from '../src/types';
import { SHIFT } from '../src/simulation/data';
import { STEPS_PER_SHIFT, Simulation, stateAtStep } from '../src/simulation';
import { deviceStatus, computeMetrics } from '../src/simulation/readouts';
import { cycleClosureReport, FINAL_STEP, onSite, sum } from './closure';

const stepAt = (seconds: number): number => Math.round(seconds / SHIFT.STEP);

describe('班末清场只是兜底', () => {
  it('默认参数下，清场时刻之前现场就已经闭合，不需要任何兜底', () => {
    const state = stateAtStep(stepAt(SHIFT.FINAL_SWEEP_AT) - 1, []);
    // Everything has left except the packages inside the finished bales on the outbound truck,
    // which are booked out when that truck departs one step later.
    const onlyBaled = state.units.filter((unit) => unit.stage !== 'SHIPPED');
    expect(onlyBaled.every((unit) => unit.stage === 'IN_BALE')).toBe(true);
    expect(state.bales.every((bale) => bale.status === 'LOADED')).toBe(true);
    expect(state.storage).toEqual({ cardboardUnits: 0, miscUnits: 0 });
    expect(Object.values(state.silos).every((silo) => silo.units === 0 && silo.baling === null)).toBe(true);
    expect(Object.values(state.forklifts).every((forklift) => forklift.status === 'IDLE')).toBe(true);
    expect(state.jobs.every((job) => job.status === 'DONE')).toBe(true);
    // No sweep event may have been logged in the default run.
    expect(state.events.some((event) => event.includes('班末清场'))).toBe(false);
  });

  it('极端干预把产线拖慢后，班次仍然闭合，且清场确实介入了', () => {
    const sluggish: TimedCommand[] = [
      { at: 0, device: 'VIB_FEEDER', key: 'vibFeedRate', value: 3 },
      { at: 0, device: 'SPREADER', key: 'spreadRate', value: 3 },
      { at: 0, device: 'CONVEYOR', key: 'beltSpeed', value: 0.4 },
      { at: 0, device: 'ROBOT_ARM', key: 'armCycle', value: 5 },
    ];
    const state = stateAtStep(FINAL_STEP, log(sluggish));
    expect(cycleClosureReport(state)).toEqual([]);
    expect(sum(state.ledger.received)).toBe(sum(state.ledger.shipped));
    expect(onSite(state)).toBe(0);
  });

  it('紧急停机后产线冻结，但门岗计划继续，班次仍能收尾', () => {
    const stop: TimedCommand[] = [{ at: 12, device: 'SYSTEM', key: 'emergencyStop', value: 1, flag: true }];
    const frozen = stateAtStep(stepAt(40), log(stop));
    expect(deviceStatus(frozen, 'SORTER_1')).toBe('STOPPED');
    expect(frozen.units.some((unit) => ['INCLINE', 'SORTER_1', 'PASS_1', 'SORTER_2', 'PASS_2'].includes(unit.stage))).toBe(false);
    expect(frozen.trucks.TRUCK_B.status).not.toBe('OFF_SITE');

    const end = stateAtStep(FINAL_STEP, log(stop));
    expect(cycleClosureReport(end)).toEqual([]);
  });
});

function log(commands: TimedCommand[]): TimedCommand[] {
  return commands;
}

describe('干预的写入与重放', () => {
  it('在班次中途写入干预后，当前时刻的状态立即按新参数重算', () => {
    const simulation = new Simulation();
    simulation.advanceBy(40);
    simulation.addCommand({ at: simulation.timeInShift, device: 'CONVEYOR', key: 'beltSpeed', value: 1.5 });
    const expected = stateAtStep(simulation.currentStep % STEPS_PER_SHIFT, simulation.commands);
    expect(simulation.current).toEqual(expected);
  });

  it('干预真实改变后续轨迹，清除后回到默认轨迹', () => {
    const simulation = new Simulation();
    simulation.advanceBy(40);
    simulation.addCommand({ at: simulation.timeInShift, device: 'CONVEYOR', key: 'beltSpeed', value: 1.5 });
    simulation.advanceBy(12);
    const withIntervention = simulation.current;
    const defaults = stateAtStep(simulation.currentStep % STEPS_PER_SHIFT, []);
    expect(withIntervention).not.toEqual(defaults);

    simulation.clearCommands();
    expect(simulation.current).toEqual(defaults);
  });

  it('重放时干预按记录时刻生效：同一日志必然得到同一现场', () => {
    const commands: TimedCommand[] = [
      { at: 20, device: 'SORTER_1', key: 'sorter1Threshold', value: 0.7 },
      { at: 35, device: 'ROBOT_ARM', key: 'armCycle', value: 4.5 },
    ];
    expect(stateAtStep(stepAt(60), commands)).toEqual(stateAtStep(stepAt(60), commands));

    // Playing it live must land on exactly the same state as replaying it from the log.
    const simulation = new Simulation();
    for (const command of commands) {
      simulation.advanceBy(command.at - simulation.timeInShift);
      simulation.addCommand(command);
    }
    simulation.advanceBy(60 - simulation.timeInShift);
    expect(simulation.current).toEqual(stateAtStep(stepAt(60), commands));
  });

  it('拖到干预之前，历史状态与从未干预时一致', () => {
    const simulation = new Simulation();
    simulation.advanceBy(60);
    simulation.addCommand({ at: simulation.timeInShift, device: 'CONVEYOR', key: 'beltSpeed', value: 1.6 });
    simulation.seekToTime(20);
    expect(simulation.current).toEqual(stateAtStep(stepAt(20), simulation.commands));
    expect(simulation.current).toEqual(stateAtStep(stepAt(20), []));
  });
});

describe('报警与异常演示开关', () => {
  const withSiloLevel = (units: number, warning: boolean): SimState => {
    const state = stateAtStep(stepAt(20), []);
    state.silos.SILO_PET.units = units;
    state.anomalies.siloOverflowWarning = warning;
    return state;
  };

  it('料仓满溢预警开关把报警线提前一包', () => {
    expect(deviceStatus(withSiloLevel(4, false), 'SILO_PET')).toBe('RUNNING');
    expect(deviceStatus(withSiloLevel(5, false), 'SILO_PET')).toBe('RUNNING');
    expect(deviceStatus(withSiloLevel(6, false), 'SILO_PET')).toBe('WARNING');
    expect(deviceStatus(withSiloLevel(5, true), 'SILO_PET')).toBe('WARNING');
  });

  it('光选误判开关会降低回收率，尾料计入杂项', () => {
    const clean = stateAtStep(FINAL_STEP, []);
    const missorted = stateAtStep(FINAL_STEP, [{ at: 10, device: 'SYSTEM', key: 'missort', value: 1, flag: true }]);
    const cleanMetrics = computeMetrics(clean, 0);
    const missortedMetrics = computeMetrics(missorted, 0);
    expect(cleanMetrics.recoveryRate).toBeCloseTo(1, 3);
    expect(missortedMetrics.recoveryRate).toBeLessThan(cleanMetrics.recoveryRate);
    expect(missortedMetrics.tailUnits).toBeGreaterThan(0);
    expect(sum(missorted.ledger.received)).toBe(sum(missorted.ledger.shipped));
  });

  it('看板的每一行都自洽：进料 = 出货 + 在厂', () => {
    for (const step of [stepAt(30), stepAt(60), stepAt(100), FINAL_STEP]) {
      const metrics = computeMetrics(stateAtStep(step, []), 0);
      for (const row of metrics.byMaterial) {
        expect(row.received, `${row.label} @ ${step}`).toBe(row.shipped + row.onSite);
      }
      expect(metrics.receivedUnits).toBe(metrics.shippedUnits + metrics.onSiteUnits);
    }
  });

  it('在厂物料口径不包含仍在进货货车上、尚未收货的料包', () => {
    const metrics = computeMetrics(stateAtStep(1, []), 0);
    expect(metrics.receivedUnits).toBe(0);
    expect(metrics.onSiteUnits).toBe(0);
  });
});
