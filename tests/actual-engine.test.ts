import { describe, expect, it } from 'vitest';
import { ActualSimulation, openGate, routeCapacity } from '../src/actual/engine';
import {
  CAPACITY,
  EQUIPMENT_IDS,
  MANUAL_BATCH,
  ROUTES,
  SMALL_CAPACITY,
  STEP,
  STOCK_IDS,
  along,
} from '../src/actual/process';

describe('实际产线：独立物料流程', () => {
  it('整段运行物料守恒、料仓不超容量、打包不混料且只有一套供料资源', () => {
    const sim = new ActualSimulation();
    const manualGrades = new Set<string>();
    for (let step = 0; step < 3600; step += 1) {
      sim.advanceBy(STEP);
      const state = sim.current;
      const stored = Object.values(state.stocks).flat();
      expect(new Set(stored).size).toBe(stored.length);
      expect(stored.length).toBe(state.units.filter((unit) => unit.stage === 'stored').length);
      for (const stock of STOCK_IDS) {
        expect(state.stocks[stock].length).toBeLessThanOrEqual(
          stock.startsWith('E') ? CAPACITY : SMALL_CAPACITY,
        );
        expect(
          state.stocks[stock].every(
            (id) => state.units[id].stock === stock && state.units[id].stage === 'stored',
          ),
        ).toBe(true);
      }
      expect(state.stocks.E04.every((id) => state.units[id].grade === '3A')).toBe(true);
      expect(state.stocks.E05.every((id) => state.units[id].grade === 'MIXED')).toBe(true);
      for (const route of Object.keys(ROUTES) as (keyof typeof ROUTES)[])
        expect(
          state.units.filter((unit) => unit.stage === 'moving' && unit.route === route).length,
        ).toBeLessThanOrEqual(routeCapacity(route));
      expect(
        state.units.filter((unit) => unit.stage === 'moving' && ROUTES[unit.route].mode === 'robot').length,
      ).toBeLessThanOrEqual(1);
      expect(state.bales.reduce((sum, bale) => sum + bale.count, 0)).toBe(
        state.units.filter((unit) => unit.stage === 'baled').length,
      );
      if (state.job) {
        const job = state.job;
        expect(job.units.every((id) => state.units[id].grade === job.grade)).toBe(true);
        expect(
          state.units.filter((unit) => unit.stage === 'press').every((unit) => job.units.includes(unit.id)),
        ).toBe(true);
        if (job.phase === 'MANUAL_TRANSFER') {
          expect(job.units).toHaveLength(MANUAL_BATCH);
          expect(job.units.every((id) => state.units[id].stage === 'carried')).toBe(true);
          manualGrades.add(job.grade);
        }
      }
    }
    expect(sim.current.bales.length).toBeGreaterThan(4);
    expect(manualGrades.size).toBeGreaterThan(0);
    expect(sim.current.units.some((unit) => unit.stage !== 'baled')).toBe(true);
  });

  it('固定步长推进、倍速分组与拖动回放得到同一状态', () => {
    const a = new ActualSimulation(),
      b = new ActualSimulation();
    for (let i = 0; i < 1000; i += 1) a.advanceBy(0.1);
    for (let i = 0; i < 250; i += 1) b.advanceBy(0.4);
    expect(a.current).toEqual(b.current);
    b.seek(30);
    b.seek(100);
    expect(a.current).toEqual(b.current);
    expect(a.current.bales.length).toBeGreaterThan(0);
  });

  it('停用螺旋上料机真实阻断 PET 后续处理，历史回放不提前应用干预', () => {
    const sim = new ActualSimulation();
    sim.seek(10);
    sim.setPower('E11', false);
    sim.seek(100);
    expect(sim.current.stocks.E02.length).toBeGreaterThan(0);
    expect(
      sim.current.units.some((unit) => ['screw', 'delabel', 'sort2', 'air3A'].includes(unit.route)),
    ).toBe(false);
    sim.seek(5);
    const clean = new ActualSimulation();
    clean.seek(5);
    expect(sim.current).toEqual(clean.current);
    sim.seek(100);
    sim.setPower('E11', true);
    sim.seek(160);
    expect(sim.current.units.some((unit) => unit.route === 'sort2' || unit.route === 'air3A')).toBe(true);
  });

  it('打包机停用时保留积料，恢复后继续工作，无班末强制清场', () => {
    const sim = new ActualSimulation();
    sim.setPower('E13', false);
    sim.seek(360);
    expect(sim.current.bales).toHaveLength(0);
    expect(sim.current.stocks.E04.length).toBe(CAPACITY);
    expect(sim.current.units.filter((unit) => unit.stage !== 'baled').length).toBe(sim.current.units.length);
    sim.setPower('E13', true);
    sim.seek(400);
    expect(sim.current.bales.length).toBeGreaterThan(0);
  });

  it('供料期间停止共用设备会关闭料仓出口，物料与运动时钟保持不变', () => {
    const sim = new ActualSimulation();
    while (!openGate(sim.current) && sim.current.time < 100) sim.advanceBy(STEP);
    expect(openGate(sim.current)).toBe('E04');
    sim.setPower('E08', false);
    const quantity = sim.current.stocks.E04.length,
      motion = sim.current.motion.E08;
    expect(openGate(sim.current)).toBeNull();
    sim.advanceBy(1);
    expect(sim.current.stocks.E04.length).toBeGreaterThanOrEqual(quantity);
    expect(sim.current.motion.E08).toBe(motion);
    sim.setPower('E08', true);
    expect(openGate(sim.current)).toBe('E04');
  });

  it('同一小仓位有两批积料时，第二批重新排队，不抢占已等待的其他品类', () => {
    const sim = new ActualSimulation();
    sim.current.nextFeed = Number.POSITIVE_INFINITY;
    sim.current.step = 10;
    sim.current.time = 1;
    for (let id = 0; id < 18; id += 1) {
      const grade = id < 12 ? 'GREEN' : 'BROWN';
      sim.current.units.push({
        id,
        grade,
        stage: 'stored',
        route: grade === 'GREEN' ? 'robotGreen' : 'robotBrown',
        progress: 1,
        stock: grade,
      });
      sim.current.stocks[grade].push(id);
    }
    sim.current.ready.GREEN = 0;
    sim.current.ready.BROWN = 1;
    sim.advanceBy(STEP);
    expect(sim.current.job?.source).toBe('GREEN');
    while (sim.current.bales.length === 0 && sim.current.time < 40) sim.advanceBy(STEP);
    sim.advanceBy(STEP);
    expect(sim.current.job?.source).toBe('BROWN');
  });

  it('参数按写入时刻重放并校验边界，重置清除全部干预', () => {
    const sim = new ActualSimulation();
    sim.seek(35);
    sim.setParameter('feedRate', 240);
    sim.setParameter('threshold', 6);
    sim.seek(180);
    const expected = structuredClone(sim.current);
    sim.seek(80);
    sim.seek(180);
    expect(sim.current).toEqual(expected);
    sim.seek(30);
    const clean = new ActualSimulation();
    clean.seek(30);
    expect(sim.current).toEqual(clean.current);
    sim.setParameter('threshold', 1000);
    expect(sim.current.settings.threshold).toBe(48);
    sim.reset();
    expect(sim.current).toEqual(new ActualSimulation().current);
  });

  it('全部设备路由对应已确认编号，弯道按实际长度插值且端点稳定', () => {
    for (const route of Object.values(ROUTES)) expect(EQUIPMENT_IDS).toContain(route.device);
    const points: [number, number, number][] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 6],
    ];
    expect(along(points, 0.5)).toEqual([2, 0, 2]);
    expect(along(points, -1)).toEqual(points[0]);
    expect(along(points, 2)).toEqual(points[2]);
  });
});
