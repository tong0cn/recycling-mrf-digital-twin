import type { Material, SimState } from '../src/types';
import { ALL_MATERIALS } from '../src/types';
import { SHIFT } from '../src/simulation/data';

/**
 * Packages already accepted into the plant. Units still on an inbound truck are physically on
 * site but are not yet booked as received, so they are excluded from the mass balance.
 */
export const onSite = (state: SimState): number =>
  state.units.filter((unit) => unit.stage !== 'SHIPPED' && unit.stage !== 'TRUCK').length;

export const sum = (record: Record<Material, number>): number =>
  ALL_MATERIALS.reduce((total, material) => total + record[material], 0);

/** Everything that must be true for a shift to end with a clean, loopable plant. */
export function cycleClosureReport(state: SimState): string[] {
  const problems: string[] = [];
  const notShipped = state.units.filter((unit) => unit.stage !== 'SHIPPED');
  if (notShipped.length) {
    problems.push(`未出货物料 ${notShipped.length} 件：${notShipped.map((unit) => `${unit.id}:${unit.origin}@${unit.stage}`).join(', ')}`);
  }
  const openBales = state.bales.filter((bale) => bale.status !== 'SHIPPED');
  if (openBales.length) {
    problems.push(`未出厂打包块 ${openBales.length} 个：${openBales.map((bale) => `${bale.id}:${bale.material}/${bale.status}`).join(', ')}`);
  }
  for (const [id, silo] of Object.entries(state.silos)) {
    if (silo.units !== 0) problems.push(`${id} 仍有 ${silo.units} 包`);
    if (silo.baling !== null) problems.push(`${id} 仍在压制`);
  }
  if (state.storage.cardboardUnits !== 0) problems.push(`纸板存储区仍有 ${state.storage.cardboardUnits} 包`);
  if (state.storage.miscUnits !== 0) problems.push(`杂项存储区仍有 ${state.storage.miscUnits} 包`);
  for (const forklift of Object.values(state.forklifts)) {
    if (forklift.status !== 'IDLE') problems.push(`${forklift.id} 状态为 ${forklift.status}`);
    if (forklift.cargoUnitIds.length || forklift.cargoBaleIds.length) problems.push(`${forklift.id} 仍载有货物`);
    if (Math.hypot(forklift.x - forklift.startX, forklift.z - forklift.startZ) > 0.05) {
      problems.push(`${forklift.id} 未回到起始位 (${forklift.x.toFixed(1)}, ${forklift.z.toFixed(1)})`);
    }
  }
  const openJobs = state.jobs.filter((job) => job.status !== 'DONE');
  if (openJobs.length) problems.push(`未完成任务 ${openJobs.map((job) => `${job.id}/${job.status}`).join(', ')}`);
  if (state.aisle.occupant !== null) problems.push(`主通道仍被 ${state.aisle.occupant} 占用`);
  if (state.arm.phase !== 'IDLE' || state.arm.queue.length) problems.push(`机械臂未复位（${state.arm.phase}，队列 ${state.arm.queue.length}）`);
  for (const truck of Object.values(state.trucks)) {
    if (truck.status !== 'OFF_SITE') problems.push(`${truck.id} 状态为 ${truck.status}`);
  }
  if (sum(state.ledger.received) !== sum(state.ledger.shipped)) {
    problems.push(`台账不平衡：进 ${sum(state.ledger.received)} / 出 ${sum(state.ledger.shipped)}`);
  }
  for (const material of ALL_MATERIALS) {
    if (state.ledger.lost[material] !== 0) problems.push(`${material} 有 ${state.ledger.lost[material]} 包丢失`);
  }
  return problems;
}

export const FINAL_STEP = Math.round(SHIFT.DURATION / SHIFT.STEP) - 1;
