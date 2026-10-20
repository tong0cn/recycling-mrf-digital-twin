import {
  CAPACITY,
  DEFAULTS,
  EQUIPMENT_IDS,
  MANUAL_BATCH,
  MATERIALS,
  PARAMETER_LIMITS,
  ROUTES,
  SMALL_CAPACITY,
  STEP,
  STOCK_IDS,
  type EquipmentId,
  type Grade,
  type Parameter,
  type RouteId,
  type StockId,
} from './process';

export interface Unit {
  id: number;
  grade: Grade;
  stage: 'moving' | 'stored' | 'carried' | 'press' | 'baled';
  route: RouteId;
  progress: number;
  stock: StockId | null;
}
export interface Bale {
  id: number;
  grade: Grade;
  count: number;
  at: number;
}
export interface Job {
  source: StockId;
  grade: Grade;
  units: number[];
  released: number;
  phase: 'MANUAL_TRANSFER' | 'DISCHARGING' | 'CONVEYING' | 'COMPRESSING' | 'EJECTING';
  elapsed: number;
}
export interface ActualState {
  step: number;
  time: number;
  units: Unit[];
  bales: Bale[];
  stocks: Record<StockId, number[]>;
  ready: Partial<Record<StockId, number>>;
  job: Job | null;
  nextFeed: number;
  nextPet: number;
  nextMisc: number;
  settings: typeof DEFAULTS;
  power: Record<EquipmentId, boolean>;
  events: { time: number; text: string }[];
  motion: Record<EquipmentId, number>;
  armReturn: { grade: 'GREEN' | 'BROWN'; progress: number } | null;
}
interface Command {
  step: number;
  key: Parameter | EquipmentId;
  value: number | boolean;
}
const SEQUENCE: Grade[] = [
  '3A',
  'BIG_WHITE',
  'MIXED',
  '3A',
  'GREEN',
  'SMALL_WHITE',
  '3A',
  'MIXED',
  'FLOWER',
  '3A',
  'BROWN',
  '3A',
  'OIL',
  'MIXED',
  '3A',
  'GREEN',
  'CAN',
  '3A',
  'MIXED',
  '3A',
];
const isPet = (grade: Grade) => ['3A', 'MIXED', 'GREEN', 'BROWN'].includes(grade);

function empty(): ActualState {
  return {
    step: 0,
    time: 0,
    units: [],
    bales: [],
    stocks: Object.fromEntries(STOCK_IDS.map((id) => [id, [] as number[]])) as Record<StockId, number[]>,
    ready: {},
    job: null,
    nextFeed: 0.5,
    nextPet: 0,
    nextMisc: 0,
    settings: { ...DEFAULTS },
    power: Object.fromEntries(EQUIPMENT_IDS.map((id) => [id, true])) as Record<EquipmentId, boolean>,
    events: [],
    motion: Object.fromEntries(EQUIPMENT_IDS.map((id) => [id, 0])) as Record<EquipmentId, number>,
    armReturn: null,
  };
}
function event(state: ActualState, text: string) {
  state.events.push({ time: state.time, text });
  if (state.events.length > 50) state.events.shift();
}
function enter(unit: Unit, route: RouteId) {
  unit.stage = 'moving';
  unit.route = route;
  unit.progress = 0;
  unit.stock = null;
}
export function routeCapacity(route: RouteId) {
  return ROUTES[route].mode === 'robot' ? 1 : ROUTES[route].mode === 'air' ? 12 : 18;
}
function canEnter(state: ActualState, route: RouteId) {
  if (ROUTES[route].mode === 'robot')
    return (
      !state.armReturn &&
      !state.units.some((unit) => unit.stage === 'moving' && ROUTES[unit.route].mode === 'robot')
    );
  return (
    state.units.filter((unit) => unit.stage === 'moving' && unit.route === route).length <
    routeCapacity(route)
  );
}
function store(state: ActualState, unit: Unit, stock: StockId): boolean {
  const limit = stock.startsWith('E') ? CAPACITY : SMALL_CAPACITY;
  if (state.stocks[stock].length >= limit) return false;
  state.stocks[stock].push(unit.id);
  unit.stage = 'stored';
  unit.stock = stock;
  return true;
}
function arrived(state: ActualState, unit: Unit) {
  const next = (route: RouteId) => {
    if (canEnter(state, route)) enter(unit, route);
  };
  switch (unit.route) {
    case 'feed':
      next('sort1');
      break;
    case 'sort1':
      next(isPet(unit.grade) ? 'airPet' : 'airMisc');
      break;
    case 'airPet':
      store(state, unit, 'E02');
      break;
    case 'airMisc':
      store(state, unit, 'E03');
      break;
    case 'screw':
      next('delabel');
      break;
    case 'delabel':
      next('incline2');
      break;
    case 'incline2':
      next('sort2');
      break;
    case 'sort2':
      next(unit.grade === '3A' ? 'air3A' : 'robotBelt');
      break;
    case 'air3A':
      store(state, unit, 'E04');
      break;
    case 'robotBelt':
      next(unit.grade === 'GREEN' ? 'robotGreen' : unit.grade === 'BROWN' ? 'robotBrown' : 'airMixed');
      break;
    case 'robotGreen':
    case 'robotBrown': {
      const grade = unit.route === 'robotGreen' ? 'GREEN' : 'BROWN';
      if (store(state, unit, grade)) state.armReturn = { grade, progress: 0 };
      break;
    }
    case 'airMixed':
      store(state, unit, 'E05');
      break;
    case 'manualIncline':
      next('manualSort');
      break;
    case 'manualSort':
      if (unit.grade !== '3A' && unit.grade !== 'MIXED') store(state, unit, unit.grade);
      break;
    case 'discharge3A':
    case 'dischargeMixed':
      next('chain');
      break;
    case 'chain':
      unit.stage = 'press';
      break;
  }
}
function updateReady(state: ActualState) {
  for (const source of STOCK_IDS) {
    if (source === 'E02' || source === 'E03') continue;
    const threshold = source === 'E04' || source === 'E05' ? state.settings.threshold : MANUAL_BATCH;
    if (state.stocks[source].length < threshold) delete state.ready[source];
    else if (state.ready[source] === undefined) state.ready[source] = state.step;
  }
}
function dispatchBaler(state: ActualState) {
  if (state.job || !state.power.E13 || !state.power.E10 || !state.power.E08) return;
  const source = STOCK_IDS.filter(
    (id) => state.ready[id] !== undefined && (!id.startsWith('E') || state.power[id as EquipmentId]),
  ).sort((a, b) => state.ready[a]! - state.ready[b]!)[0];
  if (!source) return;
  const manual = source !== 'E04' && source !== 'E05';
  const units = state.stocks[source].slice(0, manual ? MANUAL_BATCH : state.settings.threshold);
  // A remaining batch joins the back of the queue; never retain the dispatched request's age.
  delete state.ready[source];
  state.job = {
    source,
    grade: state.units[units[0]].grade,
    units,
    released: 0,
    phase: manual ? 'MANUAL_TRANSFER' : 'DISCHARGING',
    elapsed: 0,
  };
  if (manual) {
    state.stocks[source].splice(0, units.length);
    units.forEach((id) => {
      state.units[id].stage = 'carried';
      state.units[id].stock = null;
    });
  }
  event(state, `${manual ? '人工转运' : '料仓放料'}：${MATERIALS[state.job.grade].name}，${units.length} 批`);
}
function stepJob(state: ActualState) {
  const job = state.job;
  if (!job || !state.power.E13 || !state.power.E10 || !state.power.E08) return;
  if ((job.source === 'E04' || job.source === 'E05') && !state.power[job.source]) return;
  job.elapsed += STEP;
  switch (job.phase) {
    case 'MANUAL_TRANSFER':
      if (job.elapsed >= 14) {
        job.units.forEach((id, index) => {
          enter(state.units[id], 'chain');
          state.units[id].progress = -index * 0.035;
        });
        job.released = job.units.length;
        job.phase = 'CONVEYING';
        job.elapsed = 0;
      }
      break;
    case 'DISCHARGING':
      while (job.released < job.units.length && job.released * 0.2 <= job.elapsed) {
        const route = job.source === 'E04' ? 'discharge3A' : 'dischargeMixed';
        if (!canEnter(state, route)) break;
        const id = job.units[job.released++];
        state.stocks[job.source].splice(state.stocks[job.source].indexOf(id), 1);
        enter(state.units[id], route);
      }
      if (job.released === job.units.length) {
        job.phase = 'CONVEYING';
        job.elapsed = 0;
      }
      break;
    case 'CONVEYING':
      if (job.units.every((id) => state.units[id].stage === 'press')) {
        job.phase = 'COMPRESSING';
        job.elapsed = 0;
      }
      break;
    case 'COMPRESSING':
      if (job.elapsed >= 6) {
        job.phase = 'EJECTING';
        job.elapsed = 0;
      }
      break;
    case 'EJECTING':
      if (job.elapsed >= 3) {
        state.bales.push({
          id: state.bales.length,
          grade: job.grade,
          count: job.units.length,
          at: state.time,
        });
        job.units.forEach((id) => {
          state.units[id].stage = 'baled';
        });
        event(state, `打包完成：${MATERIALS[job.grade].name}，${job.units.length} 批`);
        state.job = null;
      }
  }
}
function stepOnce(state: ActualState) {
  if (state.armReturn && state.power.E15) {
    state.armReturn.progress += (STEP * state.settings.robotSpeed) / 0.8;
    if (state.armReturn.progress >= 1) state.armReturn = null;
  }
  if (state.power.E06 && canEnter(state, 'feed') && state.time + 1e-8 >= state.nextFeed) {
    const id = state.units.length;
    state.units.push({
      id,
      grade: SEQUENCE[id % SEQUENCE.length],
      stage: 'moving',
      route: 'feed',
      progress: 0,
      stock: null,
    });
    state.nextFeed = state.time + 60 / state.settings.feedRate;
  }
  // Fixed-order transport and finite receiving stocks create deterministic backpressure.
  for (const unit of state.units) {
    if (unit.stage !== 'moving') continue;
    const route = ROUTES[unit.route];
    if (!state.power[route.device]) continue;
    const speed =
      route.mode === 'robot'
        ? state.settings.robotSpeed
        : route.mode === 'air'
          ? 1
          : state.settings.beltSpeed;
    unit.progress = Math.min(1, unit.progress + (STEP * speed) / route.seconds);
    if (unit.progress >= 1 - 1e-9) arrived(state, unit);
  }
  for (const [stock, route, key] of [
    ['E02', 'screw', 'nextPet'],
    ['E03', 'manualIncline', 'nextMisc'],
  ] as const) {
    if (
      state.stocks[stock].length &&
      canEnter(state, route) &&
      state.time >= state[key] &&
      state.power[ROUTES[route].device] &&
      state.power[stock]
    ) {
      const id = state.stocks[stock].shift()!;
      enter(state.units[id], route);
      state[key] = state.time + 0.65;
    }
  }
  updateReady(state);
  dispatchBaler(state);
  stepJob(state);
  updateReady(state);
  for (const id of EQUIPMENT_IDS) {
    if (
      state.power[id] &&
      (state.units.some(
        (unit) => unit.stage === 'moving' && unit.progress < 1 && ROUTES[unit.route].device === id,
      ) ||
        (id === 'E15' && state.armReturn) ||
        (id === 'E13' && state.job))
    )
      state.motion[id] += STEP;
  }
}

/** Separate plant engine. Nothing imports or mutates the original demo's Simulation. */
export class ActualSimulation {
  current = empty();
  private accumulator = 0;
  private commands: Command[] = [];

  private apply() {
    for (const command of this.commands) {
      if (command.step > this.current.step) continue;
      if (command.key in DEFAULTS) this.current.settings[command.key as Parameter] = command.value as number;
      else this.current.power[command.key as EquipmentId] = command.value as boolean;
    }
  }
  advanceBy(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.accumulator += seconds;
    while (this.accumulator + 1e-9 >= STEP) {
      this.accumulator -= STEP;
      this.current.step += 1;
      this.current.time = this.current.step * STEP;
      this.apply();
      stepOnce(this.current);
    }
  }
  seek(seconds: number) {
    const target = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds / STEP)) : 0;
    this.current = empty();
    this.accumulator = 0;
    this.apply();
    for (let i = 0; i < target; i += 1) this.advanceBy(STEP);
  }
  setParameter(key: Parameter, value: number) {
    if (!Number.isFinite(value)) return;
    const [min, max] = PARAMETER_LIMITS[key];
    this.commands.push({ step: this.current.step, key, value: Math.min(max, Math.max(min, value)) });
    this.seek(this.current.time);
  }
  setPower(device: EquipmentId, powered: boolean) {
    this.commands.push({ step: this.current.step, key: device, value: powered });
    this.seek(this.current.time);
  }
  reset() {
    this.commands = [];
    this.current = empty();
    this.accumulator = 0;
  }
}

export function openGate(state: ActualState): 'E04' | 'E05' | null {
  const job = state.job;
  if (!job || job.phase !== 'DISCHARGING' || (job.source !== 'E04' && job.source !== 'E05')) return null;
  return state.power[job.source] && state.power.E08 && state.power.E10 && state.power.E13 ? job.source : null;
}

export function deviceStatus(state: ActualState, id: EquipmentId): string {
  if (!state.power[id]) return '已停用';
  if (id === 'E15' && state.armReturn) return '复位中';
  if (id === 'E13' && state.job)
    return state.job.phase === 'COMPRESSING'
      ? '压缩中'
      : state.job.phase === 'EJECTING'
        ? '出包中'
        : '等待供料';
  if (id === 'E04' || id === 'E05') {
    if (state.job?.source === id && state.job.phase === 'DISCHARGING')
      return openGate(state) === id ? '放料中' : '供料等待';
    return state.stocks[id].length >= state.settings.threshold ? '等待打包' : '积料中';
  }
  if (id === 'E02' || id === 'E03') return state.stocks[id].length ? '缓存供料' : '等待来料';
  const moving = state.units.filter((unit) => unit.stage === 'moving' && ROUTES[unit.route].device === id);
  return moving.some((unit) => unit.progress >= 1) ? '下游积料' : moving.length ? '运行中' : '等待来料';
}
