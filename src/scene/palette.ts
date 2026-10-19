/**
 * 场景美术色板 —— 全场景唯一的色彩事实源。
 *
 * 视觉方向为「程序化微缩沙盘」：明亮的混凝土地坪 + 浅色彩钢瓦厂房作底，
 * 设备用高饱和蓝配安全黄/橙点缀，自发光只留给指示灯、屏幕与少量灯罩。
 * 任何场景文件都不应再出现散落的十六进制字面量；新增颜色一律先加到这张表里。
 *
 * 2026-10-19 按客户反馈「再明亮一些、颜色鲜艳一些」整体提亮并提高饱和度：
 * 地坪/墙板/屋面回到浅色（p50 目标 ≈0.55），设备蓝、安全黄/橙、四种物料的
 * 分选色都加了饱和，靠「深色底座 + 深色机架」而不是「整体压暗」来维持层次。
 */
export const PALETTE = {
  /* ---------- 厂房与地面 ---------- */
  /** 车间地坪：浅暖灰混凝土 */
  hallFloor: '#b9c1c5',
  /** 车间地坪的磨损深色（贴图/局部叠加用） */
  hallFloorDark: '#9aa3a8',
  /** 主通道环氧地坪 */
  aisle: '#9fb0ba',
  /** 通道划线（安全黄） */
  aisleLine: '#f2c22f',
  /** 装卸货地坪 */
  apron: '#abb2b5',
  /** 功能分区地坪色块 */
  zonePlate: '#9daaa3',
  /** 沙盘底座侧面：压深，沙盘才像摆在暗色台面上的实物 */
  plinthSide: '#59646b',
  /** 沙盘底座顶面（跑边） */
  plinthTop: '#8e989d',
  /** 园区前场（货车停靠与地磅所在的场地） */
  yard: '#9ba3a6',

  /* ---------- 厂房外壳 ---------- */
  /** 墙板彩钢瓦（浅色板面） */
  wallPanel: '#d5dbde',
  /** 墙板凹缝/暗面 */
  wallPanelDark: '#b2bcc1',
  /** 墙面竖向肋条 */
  wallRib: '#a5b0b6',
  /** 钢柱 */
  column: '#c6cfd4',
  /** 屋面与钢结构（桁架、檩条、立柱撑） */
  structure: '#7d888f',
  /** 屋面板 */
  roofDeck: '#a9b3b9',
  /** 屋面立缝（压型钢板接缝） */
  roofSeam: '#8f9aa0',
  /** 屋面檩条 / 桁架 */
  roofRib: '#a3adb3',
  /** 屋面采光带 */
  roofLight: '#f2fafd',
  /** 卷帘门帘片 */
  doorRoll: '#a4aeb4',
  /** 门框 / 雨棚骨架 */
  doorFrame: '#79848a',
  /** 卸货雨棚顶 */
  canopy: '#c3ccd1',

  /* ---------- 金属与设备 ---------- */
  /** 镀锌钢（支架、护栏、梯子） */
  steel: '#d2dbe0',
  /** 深色钢材（机架、支腿） */
  steelDark: '#55636c',
  /** 蓝灰钢（输送机机架） */
  steelBlue: '#5d8ba6',
  /** 铝 / 不锈钢（滚筒、护罩） */
  alu: '#e2eaee',
  /** 设备主机身（饱和蓝漆面） */
  machineBody: '#3f7fa3',
  /** 设备深色机身 */
  machineBodyDark: '#2f6584',
  /** 设备亮色饰边 */
  machineTrim: '#bcd2dd',
  /** 控制柜面板 */
  panelFace: '#31414b',
  /** 橡胶（皮带、轮胎、密封） */
  rubber: '#2f353a',
  /** 皮带带面 */
  rubberBelt: '#3d464b',
  /** 塑料件（瓶片、料包外壳） */
  plastic: '#eef4f7',
  /** 玻璃 / 观察窗 */
  glass: '#a6cadb',

  /* ---------- 安全与标线 ---------- */
  safetyYellow: '#f5c62d',
  safetyOrange: '#ef8a2c',
  warningRed: '#e0563c',
  stripeWhite: '#f5f9fb',
  /** 防护栏杆 */
  guard: '#f0c437',
  /** 防撞柱 / 缓冲块 */
  bollard: '#e6b028',

  /* ---------- 自发光 ---------- */
  lampWarm: '#ffdca8',
  lampCool: '#e8f6ff',
  ledRun: '#3fd98c',
  ledWait: '#ffc23f',
  ledIdle: '#93a4ad',
  ledAlarm: '#ff6a4d',
  screen: '#4fdcd6',

  /* ---------- 环境 ---------- */
  /** 背景 / 雾（同色才有空气感）。比地坪深一档，沙盘边缘才能从背景里分离出来。 */
  background: '#9fb2bd',
  fogLight: '#9fb2bd',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** 设备状态灯配色：与看板里的状态文案一一对应。 */
export const STATUS_LED = {
  RUNNING: PALETTE.ledRun,
  WAITING: PALETTE.ledWait,
  IDLE: PALETTE.ledIdle,
  WARNING: PALETTE.ledAlarm,
  STOPPED: PALETTE.warningRed,
} as const;
