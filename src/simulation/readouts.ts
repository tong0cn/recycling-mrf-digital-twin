import type {
  DeviceId,
  DeviceReadout,
  DeviceReport,
  DeviceStatus,
  Material,
  Metrics,
  SimSettings,
  SimState,
  UnitStage,
} from '../types';
import { ALL_MATERIALS, SORTABLE_GRADES } from '../types';
import {
  DEVICE_CONTROLS,
  DEVICE_FLOW,
  DEVICE_SPEC_BY_ID,
  DEVICE_SPECS,
  FORKLIFT_BY_DEVICE,
  INBOUND_PLAN,
  MATERIAL_META,
  NUMBER_DEFAULTS,
  SHIFT,
  SILO_CONFIG,
  TRUCK_BY_DEVICE,
} from './data';
import { clamp01, zeroByMaterial } from './runtime';

const STATUS_LABEL: Record<DeviceStatus, string> = {
  RUNNING: '运行中',
  WAITING: '等待物料',
  IDLE: '待机',
  WARNING: '报警',
  STOPPED: '已停机',
};

const hasStage = (state: SimState, stages: UnitStage[]): boolean =>
  state.units.some((unit) => stages.includes(unit.stage));

const countStage = (state: SimState, stages: UnitStage[]): number =>
  state.units.filter((unit) => stages.includes(unit.stage)).length;

const round = (value: number, digits = 1): string => value.toFixed(digits);

const BALER_SOURCE: Record<string, 'BALER_PLASTIC' | 'BALER_TEXTILE' | 'BALER_CARDBOARD'> = {
  SILO_PET: 'BALER_PLASTIC',
  SILO_HDPE: 'BALER_PLASTIC',
  SILO_COTTON: 'BALER_TEXTILE',
  SILO_POLYESTER: 'BALER_TEXTILE',
  SILO_BLEND: 'BALER_TEXTILE',
  BALER_CARDBOARD: 'BALER_CARDBOARD',
};

const isPressing = (state: SimState, baler: 'BALER_PLASTIC' | 'BALER_TEXTILE' | 'BALER_CARDBOARD'): boolean =>
  state.bales.some((bale) => bale.status === 'PRESSING' && BALER_SOURCE[bale.source] === baler);

export function deviceStatus(state: SimState, id: DeviceId): DeviceStatus {
  if (state.anomalies.emergencyStop) return 'STOPPED';
  switch (id) {
    case 'VIB_FEEDER':
      if (countStage(state, ['HOPPER']) > 0) return state.time <= SHIFT.FEED_DONE_AT ? 'RUNNING' : 'WAITING';
      return state.time < SHIFT.TRUCK_A.unloadTo ? 'WAITING' : 'IDLE';
    case 'INCLINE':
      return hasStage(state, ['INCLINE']) ? 'RUNNING' : countStage(state, ['HOPPER']) > 0 ? 'WAITING' : 'IDLE';
    case 'SORTER_1':
      return hasStage(state, ['SORTER_1', 'PASS_1']) ? 'RUNNING' : 'IDLE';
    case 'SORTER_2':
      return hasStage(state, ['SORTER_2', 'PASS_2']) ? 'RUNNING' : 'IDLE';
    case 'CONVEYOR':
      return hasStage(state, ['PASS_1', 'PASS_2', 'LANE_PET', 'LANE_HDPE', 'LANE_TAIL']) ? 'RUNNING' : 'IDLE';
    case 'SPREADER':
      return hasStage(state, ['SPREADER', 'SPREAD_BUFFER']) ? 'RUNNING' : 'IDLE';
    case 'HYPERSPEC':
      return hasStage(state, ['HYPERSPEC']) ? 'RUNNING' : 'IDLE';
    case 'ROBOT_ARM': {
      if (state.arm.phase !== 'IDLE' || state.arm.queue.length > 0) return 'RUNNING';
      return hasStage(state, ['LANE_COTTON', 'LANE_POLYESTER', 'LANE_BLEND']) ? 'WAITING' : 'IDLE';
    }
    case 'SILO_PET':
    case 'SILO_HDPE':
    case 'SILO_COTTON':
    case 'SILO_POLYESTER':
    case 'SILO_BLEND': {
      const silo = state.silos[id];
      // The overflow-warning switch raises the alarm one package before the bin is actually full,
      // which is what gives the operator time to act on it.
      const warningLine = state.anomalies.siloOverflowWarning ? silo.capacity - 1 : silo.capacity;
      if (silo.overflowUnits > 0 || silo.units >= warningLine) return 'WARNING';
      if (silo.baling !== null || silo.units > 0) return 'RUNNING';
      return 'IDLE';
    }
    case 'BALER_PLASTIC':
      return isPressing(state, 'BALER_PLASTIC') ? 'RUNNING' : 'IDLE';
    case 'BALER_TEXTILE':
      return isPressing(state, 'BALER_TEXTILE') ? 'RUNNING' : 'IDLE';
    case 'BALER_CARDBOARD':
      return isPressing(state, 'BALER_CARDBOARD') ? 'RUNNING' : 'IDLE';
    case 'STORAGE_CARDBOARD':
      return state.storage.cardboardUnits > 0 ? 'RUNNING' : 'IDLE';
    case 'STORAGE_MISC':
      return state.storage.miscUnits > 0 ? 'RUNNING' : 'IDLE';
    case 'SCALE': {
      const truck = state.trucks.TRUCK_C;
      return truck.status === 'LEAVING' && truck.weighed ? 'RUNNING' : 'IDLE';
    }
    case 'TRUCK_A':
    case 'TRUCK_B':
    case 'TRUCK_C': {
      const key = TRUCK_BY_DEVICE[id];
      if (!key) return 'IDLE';
      const truck = state.trucks[key];
      if (truck.status === 'OFF_SITE') return 'IDLE';
      if (truck.status === 'UNLOADING' || truck.status === 'LOADING') return 'RUNNING';
      return 'WAITING';
    }
    case 'FORKLIFT_1':
    case 'FORKLIFT_2': {
      const key = FORKLIFT_BY_DEVICE[id];
      if (!key) return 'IDLE';
      const forklift = state.forklifts[key];
      if (forklift.status === 'IDLE') return 'IDLE';
      if (forklift.status === 'WAITING_AISLE') return 'WAITING';
      return 'RUNNING';
    }
    default:
      return 'IDLE';
  }
}

function siloReadouts(state: SimState, id: 'SILO_PET' | 'SILO_HDPE' | 'SILO_COTTON' | 'SILO_POLYESTER' | 'SILO_BLEND'): DeviceReadout[] {
  const silo = state.silos[id];
  const fallbackThreshold = SILO_CONFIG[id].threshold;
  const warningLine = state.anomalies.siloOverflowWarning ? silo.capacity - 1 : silo.capacity;
  return [
    { label: '当前存量', value: `${silo.units} / ${silo.capacity} 包`, tone: silo.units >= warningLine ? 'warn' : 'normal' },
    { label: '打包阈值', value: `${silo.threshold || fallbackThreshold} 包` },
    { label: '预警线', value: `${warningLine} 包${state.anomalies.siloOverflowWarning ? '（满溢预警已开启）' : ''}` },
    { label: '打包状态', value: silo.baling === null ? (silo.units >= silo.threshold ? '等待打包' : '未触发') : `压制中 ${round(silo.baling)}s`, tone: silo.baling === null ? 'normal' : 'good' },
    { label: '本班次打包', value: `${silo.balesProduced} 个` },
    { label: '满仓转入杂项', value: `${silo.overflowUnits} 包`, tone: silo.overflowUnits > 0 ? 'warn' : 'normal' },
  ];
}

function forkliftReadouts(state: SimState, id: 'FORKLIFT_1' | 'FORKLIFT_2'): DeviceReadout[] {
  const key = FORKLIFT_BY_DEVICE[id];
  if (!key) return [];
  const forklift = state.forklifts[key];
  const job = state.jobs.find((candidate) => candidate.id === forklift.jobId) ?? null;
  const label: Record<string, string> = {
    IDLE: '待命', TRAVEL_EMPTY: '空载行驶', LOADING: '装货中', TRAVEL_LOADED: '满载行驶',
    UNLOADING: '卸货中', WAITING_AISLE: '等待主通道',
  };
  return [
    { label: '作业状态', value: label[forklift.status] ?? forklift.status },
    { label: '当前任务', value: job ? job.label : '无', tone: job ? 'good' : 'normal' },
    { label: '载货', value: forklift.cargoLabel },
    { label: '本班次趟数', value: `${forklift.trips} 趟` },
    { label: '主通道', value: state.aisle.occupant === forklift.id ? '占用中' : '未占用' },
  ];
}

function truckReadouts(state: SimState, id: 'TRUCK_A' | 'TRUCK_B' | 'TRUCK_C'): DeviceReadout[] {
  const truck = state.trucks[id];
  const label: Record<string, string> = {
    OFF_SITE: '在途/未到场', APPROACHING: '正在进场', DOCKED: '月台停靠', UNLOADING: '卸货中',
    LOADING: '装货中', LEAVING: '离场中',
  };
  return [
    { label: '车辆状态', value: label[truck.status] ?? truck.status },
    { label: '车上货物', value: truck.loadLabel },
    { label: '剩余件数', value: `${truck.onboard} 件` },
    { label: '过磅', value: truck.weighed ? '已过磅' : '未过磅', tone: truck.weighed ? 'good' : 'normal' },
    { label: '月台', value: id === 'TRUCK_C' ? '出货月台 03' : id === 'TRUCK_A' ? '进货月台 01' : '进货月台 02' },
  ];
}

export function describeDevice(state: SimState, id: DeviceId, settings?: SimSettings): DeviceReport {
  const spec = DEVICE_SPEC_BY_ID[id];
  const status = deviceStatus(state, id);
  // Fall back to the declared default so a readout can never disagree with the control panel.
  const number = (key: string): string => {
    const value = settings?.numbers[key] ?? NUMBER_DEFAULTS[key] ?? 0;
    return round(value, Number.isInteger(value) ? 0 : 2);
  };
  let readouts: DeviceReadout[] = [];
  let stateNote = '';

  switch (id) {
    case 'VIB_FEEDER':
      readouts = [
        { label: '料斗待投', value: `${countStage(state, ['HOPPER'])} 包` },
        { label: '累计投料', value: `${state.fedPlastic} 包` },
        { label: '给料节拍', value: `${number('vibFeedRate')} 包/分` },
      ];
      stateNote = '把压缩的瓶料包打散，按设定速率投料；速率过高会在爬坡机上叠料。';
      break;
    case 'INCLINE':
      readouts = [
        { label: '带上瓶料', value: `${countStage(state, ['INCLINE'])} 包` },
        { label: '抬升高度', value: '0.93 m' },
        { label: '料层', value: countStage(state, ['INCLINE']) > 2 ? '偏厚' : '单层', tone: countStage(state, ['INCLINE']) > 2 ? 'warn' : 'good' },
      ];
      stateNote = '抬升并拉开料层，使瓶体以单层进入光选区。';
      break;
    case 'SORTER_1':
    case 'SORTER_2': {
      const grade = id === 'SORTER_1' ? 'PET' : 'HDPE';
      const puffs = state.puffs.filter((puff) => puff.device === id).length;
      readouts = [
        { label: '识别材质', value: MATERIAL_META[grade].short },
        { label: '瞬时气吹', value: puffs > 0 ? '正在喷射' : '待触发', tone: puffs > 0 ? 'good' : 'normal' },
        { label: '已识别入仓', value: `${grade === 'PET' ? state.silos.SILO_PET.units : state.silos.SILO_HDPE.units} 包` },
        { label: '识别阈值', value: `${number(id === 'SORTER_1' ? 'sorter1Threshold' : 'sorter2Threshold')}` },
        { label: '气吹压力', value: `${number(id === 'SORTER_1' ? 'airPressure1' : 'airPressure2')} bar` },
        { label: '串联次序', value: id === 'SORTER_1' ? '第 1 级（先分出 PET）' : '第 2 级（再分出 HDPE）' },
      ];
      stateNote = id === 'SORTER_1'
        ? '先分出 PET，未命中的物料继续向后；次序不可颠倒，否则 HDPE 无法被第二级识别。'
        : '对通过第一级的物料再分出 HDPE；仍未被吹出的物料成为尾料进入杂项区。';
      break;
    }
    case 'CONVEYOR':
      readouts = [
        { label: '在带物料', value: `${countStage(state, ['PASS_1', 'PASS_2', 'LANE_PET', 'LANE_HDPE', 'LANE_TAIL'])} 包` },
        { label: 'PET 支线', value: `${countStage(state, ['LANE_PET'])} 包` },
        { label: 'HDPE 支线', value: `${countStage(state, ['LANE_HDPE'])} 包` },
        { label: '尾料支线', value: `${countStage(state, ['LANE_TAIL'])} 包` },
        { label: '带速', value: `${number('beltSpeed')} m/s` },
      ];
      stateNote = '把三路物料分别送入对应料仓；带速决定全线节拍。';
      break;
    case 'SILO_PET':
    case 'SILO_HDPE':
    case 'SILO_COTTON':
    case 'SILO_POLYESTER':
    case 'SILO_BLEND':
      readouts = siloReadouts(state, id);
      stateNote = '料仓只接收本仓材质；达到阈值即请求打包，满仓时物料转入杂项存储。';
      break;
    case 'BALER_PLASTIC':
    case 'BALER_TEXTILE':
    case 'BALER_CARDBOARD': {
      const own = state.bales.filter((bale) => BALER_SOURCE[bale.source] === id);
      const pressing = own.find((bale) => bale.status === 'PRESSING');
      readouts = [
        { label: '压制状态', value: pressing ? `压制中，剩余 ${round(pressing.pressRemaining)}s` : '待机', tone: pressing ? 'good' : 'normal' },
        { label: '本班次出包', value: `${own.filter((bale) => bale.status !== 'PRESSING').length} 个` },
        { label: '待搬运', value: `${own.filter((bale) => bale.status === 'READY').length} 个` },
        { label: '已装车', value: `${own.filter((bale) => bale.status === 'LOADED' || bale.status === 'SHIPPED').length} 个` },
        { label: '服务料仓', value: id === 'BALER_PLASTIC' ? 'PET / HDPE' : id === 'BALER_TEXTILE' ? '棉 / 涤纶 / 混纺（共用）' : '纸板存储区' },
        {
          label: '压制周期',
          value: `${number(id === 'BALER_PLASTIC' ? 'baleCyclePlastic' : id === 'BALER_TEXTILE' ? 'baleCycleTextile' : 'baleCycleCardboard')} s`,
        },
      ];
      stateNote = id === 'BALER_TEXTILE'
        ? '三个纺织料仓共用这一台打包机，按料仓就绪顺序轮流压制。'
        : '每次压制消耗料仓当前全部存量，形成一个打包块。';
      break;
    }
    case 'SPREADER':
      readouts = [
        { label: '待铺料', value: `${countStage(state, ['SPREAD_BUFFER'])} 包` },
        { label: '累计铺料', value: `${state.fedTextile} 包` },
        { label: '摊铺宽度', value: '1.05 m' },
        { label: '铺料速率', value: `${number('spreadRate')} 包/分` },
      ];
      stateNote = '把成包纺织品摊成单层，便于高光谱逐件识别。';
      break;
    case 'HYPERSPEC':
      readouts = [
        { label: '识别中', value: `${countStage(state, ['HYPERSPEC'])} 包` },
        { label: '已识别待抓取', value: `${countStage(state, ['LANE_COTTON', 'LANE_POLYESTER', 'LANE_BLEND'])} 包` },
        { label: '本班次存入杂项', value: `${state.storage.miscUnits} 包` },
        { label: '识别材质', value: '棉 / 涤纶 / 混纺' },
        { label: '材质识别阈值', value: `${number('hyperspecThreshold')}` },
      ];
      stateNote = '按材质给出目标料仓；无法识别的物料进入尾料口转杂项。';
      break;
    case 'ROBOT_ARM': {
      const phaseLabel: Record<string, string> = {
        IDLE: '待取件', SWING_TO_PICK: '移动到取件位', GRAB: '抓取中', SWING_TO_SILO: '转运到料仓', RELEASE: '投放中',
      };
      readouts = [
        { label: '当前动作', value: phaseLabel[state.arm.phase] ?? state.arm.phase, tone: state.arm.phase === 'IDLE' ? 'normal' : 'good' },
        { label: '排队待抓', value: `${state.arm.queue.length} 件` },
        { label: '目标料仓', value: state.arm.target ? MATERIAL_META[state.arm.target].short : '—' },
        { label: '本班次抓取', value: `${state.arm.cycles} 件` },
        { label: '抓取节拍', value: `${number('armCycle')} s/件` },
      ];
      stateNote = '单臂串行作业，抓取节拍是纺织品线的主要瓶颈。';
      break;
    }
    case 'STORAGE_CARDBOARD':
      readouts = [
        { label: '纸板存量', value: `${state.storage.cardboardUnits} 包` },
        { label: '纸板包', value: `${state.bales.filter((bale) => bale.source === 'BALER_CARDBOARD').length} 个` },
        { label: '已转运', value: `${state.bales.filter((bale) => bale.material === 'CARDBOARD' && (bale.status === 'LOADED' || bale.status === 'SHIPPED')).length} 个` },
      ];
      stateNote = '纸板不进分拣线，只在此堆存、打包与转运。';
      break;
    case 'STORAGE_MISC':
      readouts = [
        { label: '杂项存量', value: `${state.storage.miscUnits} 包` },
        { label: '其中光选尾料', value: `${state.units.filter((unit) => unit.stage === 'STORED_MISC' && unit.origin !== 'MISC').length} 包` },
        { label: '待回程装车', value: `${state.units.filter((unit) => unit.stage === 'WAITING_EXPORT').length} 包` },
      ];
      stateNote = '存放杂项来料，以及光选尾料和高光谱无法识别的物料。';
      break;
    case 'SCALE':
      readouts = [
        { label: '地磅状态', value: state.trucks.TRUCK_C.weighed ? '正在过磅' : '空闲' },
        { label: '最近称重', value: state.trucks.TRUCK_C.weighed ? `${round(state.ledger.shippedMassT, 2)} t` : '—' },
        { label: '量程', value: '0–60 t（演示）' },
      ];
      stateNote = '出货车辆离场前过磅，出货量以此计入台账。';
      break;
    case 'TRUCK_A':
    case 'TRUCK_B':
    case 'TRUCK_C':
      readouts = truckReadouts(state, id);
      stateNote = id === 'TRUCK_C' ? '装完全部成品打包块后过磅离场。' : '卸完来料后停靠等待或离场，转运车辆还要装走回程货物。';
      break;
    case 'FORKLIFT_1':
    case 'FORKLIFT_2':
      readouts = forkliftReadouts(state, id);
      stateNote = '跨区搬运必须通过单行主通道，同一时刻只允许一台叉车占用。';
      break;
    default:
      readouts = [];
  }

  return {
    id,
    spec,
    status,
    statusLabel: STATUS_LABEL[status],
    readouts,
    upstream: DEVICE_FLOW[id].upstream,
    downstream: DEVICE_FLOW[id].downstream,
    controls: DEVICE_CONTROLS[id] ?? [],
    boundary: '状态与读数均为本地仿真值，不接 PLC、称重或 MES；控制项为演示干预，不代表设备真实指令。',
    stateNote,
  };
}

export interface ShiftTotals {
  received: Record<Material, number>;
  receivedMassT: number;
}

/** Per-shift manifest totals. A closed shift ships exactly what it received. */
export function shiftTotals(): ShiftTotals {
  const received = zeroByMaterial();
  let mass = 0;
  for (const entry of [
    ...INBOUND_PLAN.plastic,
    ...INBOUND_PLAN.textile,
    ...INBOUND_PLAN.cardboard,
    ...INBOUND_PLAN.misc,
  ]) {
    received[entry.material] += 1;
    mass += MATERIAL_META[entry.material].unitMassT;
  }
  return { received, receivedMassT: mass };
}

export function computeMetrics(state: SimState, completedCycles: number): Metrics {
  const shift = shiftTotals();
  const received = zeroByMaterial();
  const shippedByOrigin = zeroByMaterial();
  const reclaimed = zeroByMaterial();
  for (const material of ALL_MATERIALS) {
    received[material] = shift.received[material] * completedCycles + state.ledger.received[material];
    shippedByOrigin[material] = shift.received[material] * completedCycles + state.ledger.shippedByOrigin[material];
    reclaimed[material] = shift.received[material] * completedCycles + state.ledger.shipped[material];
  }
  const sortableReceived = SORTABLE_GRADES.reduce((sum, grade) => sum + received[grade], 0);
  // Recovery means the package actually left as a sorted grade, so tail that left as MISC does not
  // count towards it even though it was received as PET or HDPE.
  const sortableReclaimed = SORTABLE_GRADES.reduce((sum, grade) => sum + reclaimed[grade], 0);
  const onSiteOf = (material: Material): number =>
    state.units.filter((unit) => unit.stage !== 'SHIPPED' && unit.stage !== 'TRUCK' && unit.origin === material).length;
  const deviceIds = DEVICE_SPECS.filter((spec) => spec.kind !== 'zone').map((spec) => spec.id);

  return {
    receivedMassT: shift.receivedMassT * completedCycles + state.ledger.receivedMassT,
    shippedMassT: shift.receivedMassT * completedCycles + state.ledger.shippedMassT,
    receivedUnits: Object.values(received).reduce((sum, value) => sum + value, 0),
    shippedUnits: Object.values(shippedByOrigin).reduce((sum, value) => sum + value, 0),
    onSiteUnits: ALL_MATERIALS.reduce((sum, material) => sum + onSiteOf(material), 0),
    lostUnits: Object.values(state.ledger.lost).reduce((sum, value) => sum + value, 0),
    tailUnits: state.units.filter((unit) => unit.origin !== unit.material).length,
    recoveryRate: sortableReceived === 0 ? 0 : clamp01(sortableReclaimed / sortableReceived),
    runningDevices: deviceIds.filter((id) => deviceStatus(state, id) === 'RUNNING').length,
    totalDevices: deviceIds.length,
    balesProduced: state.bales.length,
    truckTrips: Object.values(state.trucks).filter((truck) => truck.status !== 'OFF_SITE').length,
    forkliftTrips: state.forklifts.FL1.trips + state.forklifts.FL2.trips,
    shiftProgress: clamp01(state.time / SHIFT.DURATION),
    byMaterial: ALL_MATERIALS.map((material) => ({
      material,
      label: MATERIAL_META[material].short,
      received: received[material],
      shipped: shippedByOrigin[material],
      onSite: onSiteOf(material),
    })),
  };
}
