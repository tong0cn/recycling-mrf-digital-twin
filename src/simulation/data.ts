import type {
  ControlSpec,
  DeviceId,
  DeviceSpec,
  ForkliftId,
  Material,
  SiloId,
  SortableGrade,
} from '../types';
import { SORTABLE_GRADES } from '../types';
import { FORKLIFT_START } from '../spatial/layout';

/** Fixed seed: every sort decision in the demo is reproducible from the shift timeline. */
export const SEED = 20261016;

/**
 * One demonstration unit means one received material package. Every package mass below is a
 * plausible real value; the demo only moves a handful of packages per shift so that the whole
 * flow can be watched end to end, which is why the per-shift tonnage is small. See README.
 */
export const MATERIAL_META: Record<Material, { label: string; short: string; color: string; unitMassT: number }> = {
  PET: { label: 'PET 瓶片（聚对苯二甲酸乙二醇酯）', short: 'PET', color: '#4aa8e0', unitMassT: 0.15 },
  HDPE: { label: 'HDPE 瓶料（高密度聚乙烯）', short: 'HDPE', color: '#46c08a', unitMassT: 0.15 },
  COTTON: { label: '棉织物', short: '棉', color: '#e2d3ac', unitMassT: 0.08 },
  POLYESTER: { label: '涤纶织物', short: '涤纶', color: '#a98fe0', unitMassT: 0.08 },
  BLEND: { label: '混纺织物', short: '混纺', color: '#e0a83f', unitMassT: 0.08 },
  CARDBOARD: { label: '纸板', short: '纸板', color: '#c08a4a', unitMassT: 0.25 },
  MISC: { label: '杂项（尾料与不可识别物）', short: '杂项', color: '#7d8c94', unitMassT: 0.2 },
};

export const SILO_CONFIG: Record<SiloId, { material: SortableGrade; capacity: number; threshold: number }> = {
  SILO_PET: { material: 'PET', capacity: 6, threshold: 3 },
  SILO_HDPE: { material: 'HDPE', capacity: 6, threshold: 3 },
  SILO_COTTON: { material: 'COTTON', capacity: 4, threshold: 2 },
  SILO_POLYESTER: { material: 'POLYESTER', capacity: 4, threshold: 2 },
  SILO_BLEND: { material: 'BLEND', capacity: 4, threshold: 2 },
};

/** Inbound packages of one shift. Fixed ids keep the demonstration predictable and closed. */
export const INBOUND_PLAN = {
  plastic: [
    { id: 1, material: 'PET' as Material },
    { id: 2, material: 'PET' as Material },
    { id: 3, material: 'PET' as Material },
    { id: 4, material: 'HDPE' as Material },
    { id: 5, material: 'HDPE' as Material },
    { id: 6, material: 'HDPE' as Material },
  ],
  textile: [
    { id: 101, material: 'COTTON' as Material },
    { id: 102, material: 'COTTON' as Material },
    { id: 103, material: 'POLYESTER' as Material },
    { id: 104, material: 'POLYESTER' as Material },
    { id: 105, material: 'BLEND' as Material },
    { id: 106, material: 'BLEND' as Material },
  ],
  cardboard: [
    { id: 201, material: 'CARDBOARD' as Material },
    { id: 202, material: 'CARDBOARD' as Material },
  ],
  misc: [
    { id: 301, material: 'MISC' as Material },
    { id: 302, material: 'MISC' as Material },
  ],
};

/**
 * One shift is a closed loop: every scheduled arrival, departure and flush completes inside
 * SHIFT.DURATION, and the plant returns to its initial state so the next cycle starts identical.
 */
export const SHIFT = {
  DURATION: 130,
  STEP: 1 / 30,
  KEYFRAME_STEPS: 150,
  RETURN_HOME_AT: 110,
  FLUSH_BALING_AT: 96,
  /** Feeding is scheduled to finish by this time, so the lines always drain before the shift ends. */
  FEED_DONE_AT: 70,
  SPREAD_DONE_AT: 70,
  /**
   * Presentation sweep: from here on, anything still in the plant is booked out so the loop can
   * restart without leftovers. With default settings the plant is already empty before this time;
   * see docs/VALIDATION.md.
   */
  FINAL_SWEEP_AT: 118,
  MISC_RETURN_JOB_AT: 72,
  TRUCK_A: { arriveFrom: 0, dockAt: 3, unloadFrom: 4.5, plasticsDone: 9, unloadTo: 13, leaveFrom: 15, offSiteAt: 20 },
  TRUCK_B: { arriveFrom: 22, dockAt: 25, unloadFrom: 26.5, unloadTo: 36, loadFrom: 60, leaveFrom: 108, offSiteAt: 114 },
  TRUCK_C: { arriveFrom: 38, dockAt: 41, loadFrom: 42, leaveFrom: 118, offSiteAt: 124.5 },
} as const;

export const TRUCK_MANIFEST: Record<'TRUCK_A' | 'TRUCK_B' | 'TRUCK_C', { label: string; role: string; note: string }> = {
  TRUCK_A: { label: '进货货车 A-01', role: '塑料瓶 + 纺织品来料', note: '6 个塑料来料包 + 6 个纺织来料包' },
  TRUCK_B: { label: '转运货车 B-02', role: '纸板 + 杂项进出', note: '卸下 2 个纸板包与 2 个杂项包，回程装走杂项' },
  TRUCK_C: { label: '出货货车 C-03', role: '成品打包块出货', note: '装走全部成品打包块后过磅离场' },
};

export const DEVICE_SPECS: DeviceSpec[] = [
  {
    id: 'VIB_FEEDER', name: '震动上料机', nameEn: 'De-baler / Vibrating Feeder', group: 'plastic', kind: 'machine',
    process: '散包破包 + 振动给料',
    responsibility: '把压缩的塑料瓶料包打散，并以可控速率向爬坡机均匀给料。',
  },
  {
    id: 'INCLINE', name: '爬坡机', nameEn: 'Inclined Belt Conveyor', group: 'plastic', kind: 'machine',
    process: '倾斜带式输送（单层化）',
    responsibility: '把瓶料抬升到识别高度，并在爬升过程中拉开料层，使瓶体单层分布便于识别。',
  },
  {
    id: 'SORTER_1', name: '光选机 #1', nameEn: 'NIR Optical Sorter #1', group: 'plastic', kind: 'machine',
    process: '近红外识别 + 气吹分选（PET）',
    responsibility: '识别 PET 瓶并气吹打向 PET 支线；未命中的物料继续向后段输送。',
  },
  {
    id: 'SORTER_2', name: '光选机 #2', nameEn: 'NIR Optical Sorter #2', group: 'plastic', kind: 'machine',
    process: '近红外识别 + 气吹分选（HDPE）',
    responsibility: '对通过 #1 的物料识别 HDPE 并气吹打向 HDPE 支线；其余物料成为尾料。',
  },
  {
    id: 'CONVEYOR', name: '输送带', nameEn: 'Transfer Conveyor', group: 'plastic', kind: 'machine',
    process: '分流输送带',
    responsibility: '把 PET、HDPE 与尾料三路分别送入对应料仓，速度决定全线节拍。',
  },
  {
    id: 'SILO_PET', name: 'PET 料仓', nameEn: 'PET Storage Silo', group: 'plastic', kind: 'silo',
    process: '缓冲料仓',
    responsibility: '暂存已识别的 PET 瓶料，达到阈值后请求打包。',
  },
  {
    id: 'SILO_HDPE', name: 'HDPE 料仓', nameEn: 'HDPE Storage Silo', group: 'plastic', kind: 'silo',
    process: '缓冲料仓',
    responsibility: '暂存已识别的 HDPE 瓶料，达到阈值后请求打包。',
  },
  {
    id: 'BALER_PLASTIC', name: '压缩打包机', nameEn: 'Horizontal Baler', group: 'plastic', kind: 'baler',
    process: '卧式液压打包',
    responsibility: '把料仓送来的瓶料压成瓶砖，供叉车搬运出厂。',
  },
  {
    id: 'SPREADER', name: '上料平铺机构', nameEn: 'Spreading Conveyor', group: 'textile', kind: 'machine',
    process: '铺料展平',
    responsibility: '把成包的废旧纺织品在输送带上摊成单层，供高光谱设备逐件识别。',
  },
  {
    id: 'HYPERSPEC', name: '高光谱分选设备', nameEn: 'Hyperspectral Sorter', group: 'textile', kind: 'machine',
    process: '高光谱材质识别',
    responsibility: '按材质识别棉、涤纶与混纺并给出目标料仓，无法识别的物料进入尾料口。',
  },
  {
    id: 'ROBOT_ARM', name: '机械臂分选流水线', nameEn: 'Robotic Picking Line', group: 'textile', kind: 'machine',
    process: '视觉定位 + 机械臂抓取',
    responsibility: '按识别结果逐件抓取，投放到棉、涤纶、混纺三个料仓；节拍是纺织品线的主要瓶颈。',
  },
  {
    id: 'SILO_COTTON', name: '棉料仓', nameEn: 'Cotton Bin', group: 'textile', kind: 'silo',
    process: '缓冲料仓',
    responsibility: '暂存棉织物，达到阈值后请求打包。',
  },
  {
    id: 'SILO_POLYESTER', name: '涤纶料仓', nameEn: 'Polyester Bin', group: 'textile', kind: 'silo',
    process: '缓冲料仓',
    responsibility: '暂存涤纶织物，达到阈值后请求打包。',
  },
  {
    id: 'SILO_BLEND', name: '混纺料仓', nameEn: 'Blended Bin', group: 'textile', kind: 'silo',
    process: '缓冲料仓',
    responsibility: '暂存混纺织物，达到阈值后请求打包。',
  },
  {
    id: 'BALER_TEXTILE', name: '纺织打包机', nameEn: 'Textile Baler', group: 'textile', kind: 'baler',
    process: '液压打包（共用）',
    responsibility: '三个纺织料仓共用一台打包机，按料仓就绪顺序轮流打包。',
  },
  {
    id: 'BALER_CARDBOARD', name: '纸板打包机', nameEn: 'Cardboard Baler', group: 'storage', kind: 'baler',
    process: '液压打包',
    responsibility: '把入库纸板压成纸板包，等待随出货车辆转运。',
  },
  {
    id: 'STORAGE_CARDBOARD', name: '纸板存储区', nameEn: 'Cardboard Storage', group: 'storage', kind: 'zone',
    process: '平面堆垛区',
    responsibility: '纸板不进分拣线，只在此堆存并计入库存。',
  },
  {
    id: 'STORAGE_MISC', name: '杂项存储区', nameEn: 'Miscellaneous Storage', group: 'storage', kind: 'zone',
    process: '杂项暂存区',
    responsibility: '存放杂项来料，以及光选尾料和高光谱无法识别的物料。',
  },
  {
    id: 'SCALE', name: '地磅', nameEn: 'Weighbridge', group: 'storage', kind: 'machine',
    process: '整车称重',
    responsibility: '出货车辆离场前称重，出货量以此计入台账。',
  },
  {
    id: 'TRUCK_A', name: '进货货车 A-01', nameEn: 'Inbound Truck A', group: 'logistics', kind: 'truck',
    process: '来料运输',
    responsibility: '运来塑料瓶料包与纺织品包，卸到原料缓存区后离场。',
  },
  {
    id: 'TRUCK_B', name: '转运货车 B-02', nameEn: 'Transfer Truck B', group: 'logistics', kind: 'truck',
    process: '纸板杂项进出',
    responsibility: '卸下纸板与杂项并停靠等待，回程装走杂项与纸板包。',
  },
  {
    id: 'TRUCK_C', name: '出货货车 C-03', nameEn: 'Outbound Truck C', group: 'logistics', kind: 'truck',
    process: '成品出厂',
    responsibility: '在出货月台等候，装完全部成品打包块后过磅离场。',
  },
  {
    id: 'FORKLIFT_1', name: '叉车 FL-01', nameEn: 'Forklift FL-01', group: 'logistics', kind: 'forklift',
    process: '塑料区搬运',
    responsibility: '负责塑料来料上线、纸板杂项入库与塑料成品出库。',
  },
  {
    id: 'FORKLIFT_2', name: '叉车 FL-02', nameEn: 'Forklift FL-02', group: 'logistics', kind: 'forklift',
    process: '纺织区搬运',
    responsibility: '负责纺织来料上线与纺织成品出库，需通过单行主通道。',
  },
];

export const DEVICE_SPEC_BY_ID: Record<DeviceId, DeviceSpec> = Object.fromEntries(
  DEVICE_SPECS.map((spec) => [spec.id, spec]),
) as Record<DeviceId, DeviceSpec>;

/** English equipment codes, shown next to the Chinese process name and the full English name. */
export const DEVICE_ABBR: Record<DeviceId, string> = {
  VIB_FEEDER: 'VGF',
  INCLINE: 'IBC',
  SORTER_1: 'NIR-1',
  SORTER_2: 'NIR-2',
  CONVEYOR: 'TCV',
  SILO_PET: 'SILO-PET',
  SILO_HDPE: 'SILO-HDPE',
  BALER_PLASTIC: 'BAL-P',
  SPREADER: 'SPR-CV',
  HYPERSPEC: 'HSI',
  ROBOT_ARM: 'RPL',
  SILO_COTTON: 'BIN-C',
  SILO_POLYESTER: 'BIN-P',
  SILO_BLEND: 'BIN-B',
  BALER_TEXTILE: 'BAL-T',
  BALER_CARDBOARD: 'BAL-CB',
  STORAGE_CARDBOARD: 'STG-CB',
  STORAGE_MISC: 'STG-MX',
  SCALE: 'WB',
  TRUCK_A: 'TRK-A',
  TRUCK_B: 'TRK-B',
  TRUCK_C: 'TRK-C',
  FORKLIFT_1: 'FL-01',
  FORKLIFT_2: 'FL-02',
};

const siloThresholdControls: ControlSpec[] = (['SILO_PET', 'SILO_HDPE', 'SILO_COTTON', 'SILO_POLYESTER', 'SILO_BLEND'] as SiloId[])
  .map((id) => ({
    key: `threshold:${id}`,
    label: `${SILO_CONFIG[id].material} 料仓打包阈值`,
    unit: '包',
    min: 1,
    max: SILO_CONFIG[id].capacity,
    step: 1,
    default: SILO_CONFIG[id].threshold,
    description: '料仓存量达到该值即请求打包；调高可减少打包次数，但占用仓位更多。',
  }));

export const DEVICE_CONTROLS: Partial<Record<DeviceId, ControlSpec[]>> = {
  VIB_FEEDER: [{
    key: 'vibFeedRate', label: '给料速率', unit: '包/分', min: 3, max: 12, step: 0.5, default: 8,
    description: '向爬坡机送入料包的速率；过高会造成料层叠加，过低会拉低全线产能。',
  }],
  CONVEYOR: [{
    key: 'beltSpeed', label: '带速', unit: 'm/s', min: 0.4, max: 1.6, step: 0.05, default: 1.1,
    description: '塑料线输送带速度，决定瓶料通过光选区的节拍。',
  }],
  SORTER_1: [
    {
      key: 'sorter1Threshold', label: '识别阈值', unit: '', min: 0.6, max: 1, step: 0.01, default: 0.98,
      description: '越高越严格；降低会增加漏吹，被漏吹的瓶料成为尾料。',
    },
    {
      key: 'airPressure1', label: '气吹压力', unit: 'bar', min: 2, max: 8, step: 0.1, default: 5,
      description: '压力不足会打不掉目标瓶料，压力过高会造成误吹。',
    },
  ],
  SORTER_2: [
    {
      key: 'sorter2Threshold', label: '识别阈值', unit: '', min: 0.6, max: 1, step: 0.01, default: 0.98,
      description: '越高越严格；降低会增加漏吹，被漏吹的瓶料成为尾料。',
    },
    {
      key: 'airPressure2', label: '气吹压力', unit: 'bar', min: 2, max: 8, step: 0.1, default: 5,
      description: '压力不足会打不掉目标瓶料，压力过高会造成误吹。',
    },
  ],
  BALER_PLASTIC: [{
    key: 'baleCyclePlastic', label: '打包周期', unit: 's', min: 3, max: 10, step: 0.5, default: 5,
    description: '一个瓶砖的压制周期，过长会让料仓积压。',
  }],
  SPREADER: [{
    key: 'spreadRate', label: '铺料速率', unit: '包/分', min: 3, max: 12, step: 0.5, default: 8,
    description: '纺织品上线速率；过快会让高光谱识别区出现叠料。',
  }],
  HYPERSPEC: [{
    key: 'hyperspecThreshold', label: '材质识别阈值', unit: '', min: 0.6, max: 1, step: 0.01, default: 0.97,
    description: '越高越严格；降低会使更多物料因无法识别而进入杂项尾料。',
  }],
  ROBOT_ARM: [{
    key: 'armCycle', label: '抓取节拍', unit: 's/件', min: 1.4, max: 5, step: 0.1, default: 2,
    description: '单件抓取投放的循环时间，是纺织品线的瓶颈参数。',
  }],
  BALER_TEXTILE: [{
    key: 'baleCycleTextile', label: '打包周期', unit: 's', min: 3, max: 10, step: 0.5, default: 4,
    description: '纺织料包的压制周期，三个料仓共用这一台设备。',
  }],
  BALER_CARDBOARD: [{
    key: 'baleCycleCardboard', label: '打包周期', unit: 's', min: 3, max: 10, step: 0.5, default: 5,
    description: '纸板包的压制周期。',
  }],
  SILO_PET: [siloThresholdControls[0]],
  SILO_HDPE: [siloThresholdControls[1]],
  SILO_COTTON: [siloThresholdControls[2]],
  SILO_POLYESTER: [siloThresholdControls[3]],
  SILO_BLEND: [siloThresholdControls[4]],
};

export const DEVICE_CONTROL_BY_KEY: Record<string, ControlSpec> = Object.fromEntries(
  Object.values(DEVICE_CONTROLS).flat().map((spec) => [spec.key, spec]),
);

export const NUMBER_DEFAULTS: Record<string, number> = Object.fromEntries([
  ...Object.values(DEVICE_CONTROLS).flat().map((spec) => [spec.key, spec.default] as const),
  ['efficiencyFloor', 0.55] as const,
  ['efficiencyPerBar', 0.09] as const,
]);

export const FLAG_DEFAULTS: Record<string, boolean> = {
  'power:VIB_FEEDER': true,
  'power:INCLINE': true,
  'power:SORTER_1': true,
  'power:SORTER_2': true,
  'power:CONVEYOR': true,
  'power:SPREADER': true,
  'power:HYPERSPEC': true,
  'power:ROBOT_ARM': true,
  'power:BALER_PLASTIC': true,
  'power:BALER_TEXTILE': true,
  'power:BALER_CARDBOARD': true,
  missort: false,
  siloOverflowWarning: false,
  emergencyStop: false,
};

/** Upstream / downstream relations, shown in the equipment panel. */
export const DEVICE_FLOW: Record<DeviceId, { upstream: DeviceId[]; downstream: DeviceId[] }> = {
  VIB_FEEDER: { upstream: ['FORKLIFT_1'], downstream: ['INCLINE'] },
  INCLINE: { upstream: ['VIB_FEEDER'], downstream: ['SORTER_1'] },
  SORTER_1: { upstream: ['INCLINE'], downstream: ['SILO_PET', 'SORTER_2'] },
  SORTER_2: { upstream: ['SORTER_1'], downstream: ['SILO_HDPE', 'STORAGE_MISC'] },
  CONVEYOR: { upstream: ['SORTER_1', 'SORTER_2'], downstream: ['SILO_PET', 'SILO_HDPE', 'STORAGE_MISC'] },
  SILO_PET: { upstream: ['CONVEYOR'], downstream: ['BALER_PLASTIC'] },
  SILO_HDPE: { upstream: ['CONVEYOR'], downstream: ['BALER_PLASTIC'] },
  BALER_PLASTIC: { upstream: ['SILO_PET', 'SILO_HDPE'], downstream: ['FORKLIFT_1'] },
  SPREADER: { upstream: ['FORKLIFT_2'], downstream: ['HYPERSPEC', 'SCALE'] },
  HYPERSPEC: { upstream: ['SPREADER'], downstream: ['ROBOT_ARM', 'STORAGE_MISC'] },
  ROBOT_ARM: { upstream: ['HYPERSPEC'], downstream: ['SILO_COTTON', 'SILO_POLYESTER', 'SILO_BLEND'] },
  SILO_COTTON: { upstream: ['ROBOT_ARM'], downstream: ['BALER_TEXTILE'] },
  SILO_POLYESTER: { upstream: ['ROBOT_ARM'], downstream: ['BALER_TEXTILE'] },
  SILO_BLEND: { upstream: ['ROBOT_ARM'], downstream: ['BALER_TEXTILE'] },
  BALER_TEXTILE: { upstream: ['SILO_COTTON', 'SILO_POLYESTER', 'SILO_BLEND'], downstream: ['FORKLIFT_2'] },
  BALER_CARDBOARD: { upstream: ['STORAGE_CARDBOARD'], downstream: ['FORKLIFT_1'] },
  STORAGE_CARDBOARD: { upstream: ['FORKLIFT_1'], downstream: ['BALER_CARDBOARD'] },
  STORAGE_MISC: { upstream: ['SORTER_2', 'HYPERSPEC', 'FORKLIFT_1'], downstream: ['FORKLIFT_1'] },
  SCALE: { upstream: ['TRUCK_C'], downstream: ['TRUCK_C'] },
  TRUCK_A: { upstream: [], downstream: ['FORKLIFT_1', 'FORKLIFT_2'] },
  TRUCK_B: { upstream: [], downstream: ['FORKLIFT_1'] },
  TRUCK_C: { upstream: ['FORKLIFT_1', 'FORKLIFT_2'], downstream: ['SCALE'] },
  FORKLIFT_1: { upstream: ['TRUCK_A', 'TRUCK_B', 'BALER_PLASTIC', 'BALER_CARDBOARD'], downstream: ['VIB_FEEDER', 'STORAGE_CARDBOARD', 'STORAGE_MISC', 'TRUCK_C'] },
  FORKLIFT_2: { upstream: ['TRUCK_A', 'BALER_TEXTILE'], downstream: ['SPREADER', 'TRUCK_C'] },
};

export const SORTABLE_LABELS: Record<SortableGrade, string> = Object.fromEntries(
  SORTABLE_GRADES.map((grade) => [grade, MATERIAL_META[grade].short]),
) as Record<SortableGrade, string>;

export const FORKLIFT_IDS: ForkliftId[] = ['FL1', 'FL2'];export const FORKLIFT_START_ID = FORKLIFT_START;
export const FORKLIFT_DEVICE: Record<ForkliftId, DeviceId> = { FL1: 'FORKLIFT_1', FL2: 'FORKLIFT_2' };
export const FORKLIFT_BY_DEVICE: Partial<Record<DeviceId, ForkliftId>> = { FORKLIFT_1: 'FL1', FORKLIFT_2: 'FL2' };
export const TRUCK_DEVICE: Record<'TRUCK_A' | 'TRUCK_B' | 'TRUCK_C', DeviceId> = {
  TRUCK_A: 'TRUCK_A',
  TRUCK_B: 'TRUCK_B',
  TRUCK_C: 'TRUCK_C',
};
export const TRUCK_BY_DEVICE: Partial<Record<DeviceId, 'TRUCK_A' | 'TRUCK_B' | 'TRUCK_C'>> = {
  TRUCK_A: 'TRUCK_A',
  TRUCK_B: 'TRUCK_B',
  TRUCK_C: 'TRUCK_C',
};

/** Forklift dwell times, in seconds of simulation time.
 *  速度比最初版本高约 15%：重新排布后取放货点离月台更远，靠提速把整班时长压回原设计。 */
export const HANDLING = { load: 2, unload: 2, speed: 3.7, returnSpeed: 4.0 } as const;

/** Lateral stand-off so the two vehicles never occupy the same spot at a shared station. */
export const FORKLIFT_OFFSET: Record<ForkliftId, { x: number; z: number }> = {
  FL1: { x: -0.85, z: 0 },
  FL2: { x: 0.85, z: 0 },
};

/**
 * 近 7 日进出货量：固定写死的演示数据，按每班 2.28 t、每日两班折算并加入固定波动以便展示趋势。
 * 现场真实产能远高于这个演示规模，看板上必须标明这是模拟数据。
 */
export const SEVEN_DAY_TREND: { day: string; receivedT: number; shippedT: number }[] = [
  { day: 'D-6', receivedT: 4.36, shippedT: 4.12 },
  { day: 'D-5', receivedT: 4.71, shippedT: 4.48 },
  { day: 'D-4', receivedT: 4.18, shippedT: 4.05 },
  { day: 'D-3', receivedT: 4.92, shippedT: 4.63 },
  { day: 'D-2', receivedT: 4.55, shippedT: 4.4 },
  { day: 'D-1', receivedT: 4.63, shippedT: 4.51 },
  { day: '当日', receivedT: 4.56, shippedT: 4.28 },
];
