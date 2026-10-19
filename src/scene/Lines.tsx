import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import type { DeviceId, SiloId, SimState, ViewMode } from '../types';
import { MATERIAL_META, SILO_CONFIG } from '../simulation/data';
import { PLANT, PLASTIC_BELTS, SCALE, SILO_POINTS, TEXTILE_BELTS } from '../spatial/layout';
import { useSimulation } from '../simulation/context';
import { deviceStatus } from '../simulation/readouts';
import { Bar, BoltRow, Cabinet, Ladder, Legs, Louver, Motor, Pallet, Pipe, Rod, Slab, StatusLamp } from './kit';
import { surface } from './materials';
import { PALETTE } from './palette';
import { DeviceShell, beltMesh } from './parts';

interface LineProps {
  state: SimState;
  selected: DeviceId | null;
  onSelect: (id: DeviceId | null) => void;
  viewMode: ViewMode;
}

const SILO_IDS: SiloId[] = ['SILO_PET', 'SILO_HDPE', 'SILO_COTTON', 'SILO_POLYESTER', 'SILO_BLEND'];

/**
 * 输送机：带面 + 侧挡边 + 头尾滚筒 + 托辊 + 支腿 + 驱动电机 + 头部导料板。
 * 带面变换来自 `beltMesh`，与仿真的行程、物料高度同源，所以物料永远压在带面上。
 */
function ConveyorBelt({
  from,
  to,
  fromY,
  toY,
  width,
  motor = true,
  legs = true,
}: {
  from: { x: number; z: number };
  to: { x: number; z: number };
  fromY: number;
  toY: number;
  width: number;
  motor?: boolean;
  legs?: boolean;
}) {
  const belt = beltMesh(from, to, fromY, toY, width);
  const rollerCount = Math.max(2, Math.round(belt.length / 1.3));
  const legCount = Math.max(2, Math.round(belt.length / 2.6));

  return (
    <group position={belt.position} rotation={[0, belt.yaw, 0]}>
      <group rotation={[belt.pitch, 0, 0]}>
        {/* 带面：橡胶带 */}
        <Slab size={[width, 0.1, belt.length]} radius={0.02} color={PALETTE.rubberBelt} kind="rubber" />
        {/* 两侧挡边 */}
        {[-1, 1].map((side) => (
          <Slab
            key={side}
            size={[0.07, 0.24, belt.length]}
            radius={0.02}
            position={[(side * width) / 2 - side * 0.02, 0.13, 0]}
            color={PALETTE.steelBlue}
            kind="steelPainted"
          />
        ))}
        {/* 机架纵梁 */}
        {[-1, 1].map((side) => (
          <Rod
            key={`rail${side}`}
            radius={0.045}
            length={belt.length}
            axis="z"
            position={[(side * (width + 0.14)) / 2, -0.1, 0]}
            color={PALETTE.steelDark}
            kind="steel"
            castShadow={false}
          />
        ))}
        {/* 托辊 */}
        {Array.from({ length: rollerCount }, (_, index) => {
          const z = -belt.length / 2 + (belt.length * (index + 0.5)) / rollerCount;
          return (
            <Rod
              key={`roller${index}`}
              radius={0.055}
              length={width + 0.1}
              axis="x"
              position={[0, -0.1, z]}
              color={PALETTE.alu}
              kind="aluminium"
              castShadow={false}
            />
          );
        })}
        {/* 头尾滚筒 */}
        {[-1, 1].map((end) => (
          <Rod
            key={`pulley${end}`}
            radius={0.13}
            length={width + 0.16}
            axis="x"
            position={[0, -0.02, (end * belt.length) / 2]}
            color={PALETTE.alu}
            kind="aluminium"
            castShadow={false}
          />
        ))}
        {/* 支腿：从带面下沿垂直落地。倾斜带上每条腿按各自的带面高度取长度，
            否则斜带会整段悬空（以前把腿关掉了，爬坡机看着像浮在空中）。 */}
        {legs &&
          Array.from({ length: legCount }, (_, index) => {
            const z = -belt.length / 2 + (belt.length * (index + 0.5)) / legCount;
            const deckY = belt.position[1] - Math.sin(belt.pitch) * z;
            const legHeight = Math.max(0.3, deckY - 0.14);
            return (
              <group key={`leg${index}`} position={[0, -0.14, z]}>
                {[-1, 1].map((side) => (
                  <Rod
                    key={side}
                    radius={0.055}
                    length={legHeight}
                    position={[(side * (width + 0.12)) / 2, -legHeight / 2, 0]}
                    color={PALETTE.steelDark}
                    kind="steel"
                    castShadow={false}
                  />
                ))}
                <Bar
                  from={[-(width + 0.12) / 2, -legHeight * 0.55, 0]}
                  to={[(width + 0.12) / 2, -legHeight * 0.55, 0]}
                  thickness={0.045}
                  color={PALETTE.steelDark}
                  castShadow={false}
                />
                <Slab
                  size={[(width + 0.3) / 1, 0.05, 0.16]}
                  radius={0}
                  position={[0, -legHeight + 0.02, 0]}
                  color={PALETTE.steelDark}
                  kind="steel"
                  castShadow={false}
                />
              </group>
            );
          })}
        {/* 驱动电机（放在机头一侧） */}
        {motor && (
          <Motor
            radius={0.15}
            length={0.4}
            axis="x"
            position={[(width + 0.42) / 2, -0.02, belt.length / 2 - 0.5]}
            color={PALETTE.machineBodyDark}
          />
        )}
        {/* 头部导料板：把物料收进料仓 */}
        <Slab
          size={[width - 0.1, 0.5, 0.03]}
          radius={0.02}
          position={[0, -0.22, belt.length / 2 + 0.16]}
          rotation={[0.6, 0, 0]}
          color={PALETTE.steelBlue}
          kind="steelPainted"
          castShadow={false}
        />
      </group>
    </group>
  );
}

/** 料仓：筒体 + 加强环 + 锥底 + 支腿 + 爬梯 + 料位灯带 + 顶部除尘与进料管。 */
function Silo({ id, state, selected, onSelect }: { id: SiloId; state: SimState; selected: DeviceId | null; onSelect: (id: DeviceId) => void }) {
  const silo = state.silos[id];
  const material = SILO_CONFIG[id].material;
  const color = MATERIAL_META[material].color;
  const point = SILO_POINTS[id];
  const fill = useRef<Mesh>(null);
  const strip = useRef<Mesh>(null);
  const radius = 0.62;
  const height = 2.1;
  const ratio = silo.capacity ? silo.units / silo.capacity : 0;
  const status = deviceStatus(state, id);

  useFrame(() => {
    const level = Math.max(0.001, ratio);
    if (fill.current) {
      // 料位柱跟随仿真存量，弹簧式逼近避免跳变。
      fill.current.scale.y += (level - fill.current.scale.y) * 0.25;
    }
    if (strip.current) {
      strip.current.scale.y += (level - strip.current.scale.y) * 0.25;
      strip.current.position.y = 0.12 + ((height - 0.24) * strip.current.scale.y) / 2;
    }
  });

  return (
    <DeviceShell selected={selected === id} onSelect={() => onSelect(id)} size={[1.7, height + 1.3, 1.7]} position={[point.x, 0, point.z]}>
      {/* 支腿与底环 */}
      <Legs width={1.1} depth={1.1} height={0.42} color={PALETTE.steelDark} thickness={0.075} brace />
      <Rod radius={0.68} length={0.06} axis="y" position={[0, 0.42, 0]} color={PALETTE.steelDark} kind="steel" castShadow={false} />
      {/* 锥底 */}
      <mesh position={[0, 0.66, 0]} castShadow>
        <cylinderGeometry args={[radius, 0.26, 0.42, 20, 1, true]} />
        <meshStandardMaterial {...surface('steelPainted', PALETTE.steelBlue)} />
      </mesh>
      {/* 筒体（半透明，能看到内部物料） */}
      <mesh position={[0, 0.87 + height / 2, 0]}>
        <cylinderGeometry args={[radius, radius, height, 22, 1, true]} />
        <meshStandardMaterial {...surface('glass', '#7d98a6', { opacity: 0.3, side: 2 })} />
      </mesh>
      {/* 加强环 */}
      {[0.25, 0.62, 0.95].map((ratioY) => (
        <mesh key={`ring${ratioY}`} position={[0, 0.87 + height * ratioY, 0]} castShadow={false}>
          <torusGeometry args={[radius + 0.02, 0.035, 6, 24]} />
          <meshStandardMaterial {...surface('steel', PALETTE.steel)} />
        </mesh>
      ))}
      {/* 内部料位柱 */}
      <mesh ref={fill} position={[0, 0.9, 0]} scale={[1, 0.001, 1]}>
        <cylinderGeometry args={[radius - 0.07, radius - 0.07, height - 0.18, 20]} />
        <meshStandardMaterial {...surface('plastic', color)} />
      </mesh>
      {/* 外侧料位灯带：数字孪生式的液位指示 */}
      <mesh ref={strip} position={[radius + 0.05, 0.12, 0]} scale={[1, 0.001, 1]}>
        <boxGeometry args={[0.06, height - 0.24, 0.11]} />
        <meshStandardMaterial {...surface('lamp', color, { emissive: color, emissiveIntensity: 1.9 })} />
      </mesh>
      <Slab size={[0.1, height - 0.18, 0.16]} radius={0} position={[radius + 0.05, 0.87 + height / 2 - 0.06, 0]} color={PALETTE.panelFace} kind="plastic" castShadow={false} />
      {/* 顶部封头、除尘器与进料弯管 */}
      <Slab size={[0.98, 0.08, 0.98]} radius={0.03} position={[0, 0.87 + height, 0]} color={PALETTE.steelBlue} kind="steelPainted" castShadow={false} />
      <Slab size={[0.5, 0.36, 0.5]} radius={0.04} position={[0.24, 0.87 + height + 0.24, 0.2]} color={PALETTE.machineTrim} kind="steelPainted" castShadow={false} />
      <Louver width={0.4} height={0.24} slats={4} position={[0.24, 0.87 + height + 0.24, 0.46]} color={PALETTE.steelDark} />
      <Pipe from={[-radius - 0.5, 0.87 + height + 0.5, 0]} to={[-0.1, 0.87 + height + 0.06, 0]} radius={0.13} color={PALETTE.alu} kind="aluminium" />
      {/* 侧面爬梯与人孔 */}
      <Ladder height={height - 0.2} width={0.34} position={[-radius - 0.12, 0.9, 0.18]} rotation={[0, Math.PI / 2, 0]} />
      <Rod radius={0.13} length={0.05} axis="z" position={[0.1, 1.5, radius + 0.02]} color={PALETTE.alu} kind="aluminium" castShadow={false} />
      <BoltRow count={5} spacing={0.1} position={[0.1, 1.5, radius + 0.06]} rotation={[0, 0, Math.PI / 2]} radius={0.02} />
      {/* 支腿上的称重传感器 */}
      <Slab size={[0.18, 0.1, 0.18]} radius={0.02} position={[0.55, 0.16, 0.55]} color={PALETTE.safetyYellow} kind="steelPainted" castShadow={false} />
      <StatusLamp status={status} position={[radius + 0.05, 0.87 + height + 0.1, 0.2]} rotation={[0, 0, 0]} />
    </DeviceShell>
  );
}

const BALER_OF_BALE = (source: string): DeviceId =>
  source === 'BALER_CARDBOARD' ? 'BALER_CARDBOARD' : source === 'SILO_PET' || source === 'SILO_HDPE' ? 'BALER_PLASTIC' : 'BALER_TEXTILE';

/** 打包机：压缩室 + 料斗 + 液压站 + 油管 + 操作柜 + 安全门 + 出包导轨。 */
function Baler({
  device,
  position,
  color,
  state,
}: {
  device: DeviceId;
  position: { x: number; z: number };
  color: string;
  state: SimState;
}) {
  const plunger = useRef<Group>(null);
  const pressing = state.bales.some((bale) => bale.status === 'PRESSING' && BALER_OF_BALE(bale.source) === device);
  const status = deviceStatus(state, device);

  useFrame(() => {
    if (!plunger.current) return;
    const target = pressing ? 0.2 : 0.6;
    plunger.current.position.x += (target - plunger.current.position.x) * 0.12;
  });

  return (
    <group position={[position.x, 0, position.z]}>
      {/* 底座 */}
      <Slab size={[1.7, 0.12, 1.7]} radius={0.03} position={[0, 0.06, -0.3]} color={PALETTE.steelDark} kind="steelPainted" />
      {/* 压缩室 */}
      <Slab size={[1.5, 0.9, 1.5]} radius={0.05} position={[0, 0.57, -0.3]} color={PALETTE.machineBodyDark} kind="steelPainted" />
      {/* 压缩室外的加强筋 */}
      {[-0.55, 0.55].map((z) => (
        <Slab key={z} size={[1.56, 0.1, 0.09]} radius={0} position={[0, 0.57, z - 0.3]} color={PALETTE.machineTrim} kind="steelPainted" castShadow={false} />
      ))}
      <BoltRow count={5} spacing={0.22} position={[0, 0.16, 0.46]} radius={0.024} />
      {/* 顶部料斗（四片斜板围成） */}
      {[
        { pos: [0, 1.12, 0.42] as [number, number, number], rot: [0.5, 0, 0] as [number, number, number], size: [1.3, 0.5, 0.04] as [number, number, number] },
        { pos: [0, 1.12, -1.02] as [number, number, number], rot: [-0.5, 0, 0] as [number, number, number], size: [1.3, 0.5, 0.04] as [number, number, number] },
        { pos: [0.68, 1.12, -0.3] as [number, number, number], rot: [0, 0, -0.5] as [number, number, number], size: [0.04, 0.5, 1.1] as [number, number, number] },
        { pos: [-0.68, 1.12, -0.3] as [number, number, number], rot: [0, 0, 0.5] as [number, number, number], size: [0.04, 0.5, 1.1] as [number, number, number] },
      ].map((panel, index) => (
        <Slab key={index} size={panel.size} radius={0.02} position={panel.pos} rotation={panel.rot} color={PALETTE.steelBlue} kind="steelPainted" />
      ))}
      {/* 顶盖 */}
      <Slab size={[1.6, 0.12, 1.6]} radius={0.03} position={[0, 1.05, -0.3]} color={color} kind="steelPainted" />
      {/* 液压推头（随压制动画横移） */}
      <group ref={plunger} position={[0.62, 0.57, -0.3]}>
        <Slab size={[0.16, 0.62, 1.1]} radius={0.02} color={PALETTE.alu} kind="aluminium" />
        <Rod radius={0.07} length={0.5} axis="x" position={[0.32, 0, 0]} color={PALETTE.steel} kind="steel" castShadow={false} />
      </group>
      {/* 液压站：油箱 + 电机 + 压力表 */}
      <Rod radius={0.26} length={0.5} axis="y" position={[-1.05, 0.35, 0.55]} color={PALETTE.machineBody} kind="steelPainted" />
      <Motor radius={0.13} length={0.32} axis="y" position={[-1.05, 0.78, 0.55]} color={PALETTE.machineBodyDark} />
      <Rod radius={0.09} length={0.05} axis="z" position={[-1.05, 0.62, 0.82]} color={PALETTE.stripeWhite} kind="steelPainted" castShadow={false} />
      <Pipe from={[-1.05, 0.66, 0.66]} to={[-0.62, 0.95, 0.2]} radius={0.045} color={PALETTE.steelDark} />
      <Pipe from={[-0.8, 0.35, 0.62]} to={[-0.5, 0.5, 0.35]} radius={0.035} color={PALETTE.steelDark} />
      {/* 操作柜 */}
      <Cabinet size={[0.6, 1.35, 0.42]} position={[1.16, 0.7, 0.5]} rotation={[0, -0.35, 0]} />
      <StatusLamp status={status} position={[1.16, 1.55, 0.5]} rotation={[0, -0.35, 0]} />
      {/* 安全门与出包导轨 */}
      <Slab size={[0.05, 0.8, 1.2]} radius={0.02} position={[0.78, 0.6, -0.3]} color={PALETTE.safetyYellow} kind="steelPainted" />
      {[-0.28, 0.28].map((offset) => (
        <Bar key={offset} from={[-0.76, 0.22, -0.3 + offset]} to={[-2.2, 0.18, -0.3 + offset]} thickness={0.08} color={PALETTE.steel} kind="steel" castShadow={false} />
      ))}
    </group>
  );
}

/** 机械臂：底座 + 两级臂 + 腕部 + 双指夹爪 + 线缆包。 */
function RobotArm({ state }: { state: SimState }) {
  const boom = useRef<Group>(null);
  const wrist = useRef<Group>(null);
  const arm = state.arm;
  useFrame(() => {
    if (boom.current) {
      const target = arm.phase === 'SWING_TO_SILO' || arm.phase === 'RELEASE' ? -0.9 : 0.55;
      boom.current.rotation.y += (target - boom.current.rotation.y) * 0.14;
    }
    if (wrist.current) {
      const target = arm.phase === 'GRAB' ? 0.5 : 0.75;
      wrist.current.rotation.z += (target - wrist.current.rotation.z) * 0.18;
    }
  });
  return (
    <group>
      <Rod radius={0.42} length={0.12} axis="y" position={[0, 0.06, 0]} color={PALETTE.steelDark} kind="steel" />
      <Rod radius={0.3} length={0.5} axis="y" position={[0, 0.37, 0]} color={PALETTE.machineBody} kind="steelPainted" />
      <BoltRow count={6} spacing={0.16} position={[0, 0.12, 0.3]} radius={0.026} />
      <Slab size={[0.5, 0.42, 0.36]} radius={0.04} position={[0, 0.62, 0]} color={PALETTE.machineBodyDark} kind="steelPainted" />
      <group ref={boom} position={[0, 0.6, 0]}>
        {/* 肩关节 */}
        <Rod radius={0.14} length={0.34} axis="z" position={[0, 0.12, 0]} color={PALETTE.alu} kind="aluminium" />
        {/* 第一级臂 */}
        <Slab size={[0.24, 1.7, 0.24]} radius={0.05} position={[0, 0.98, 0]} color={PALETTE.machineTrim} kind="steelPainted" />
        <Bar from={[-0.2, 0.3, 0]} to={[0.2, 1.6, 0]} thickness={0.05} color={PALETTE.steelDark} castShadow={false} />
        <Bar from={[0.2, 0.3, 0]} to={[-0.2, 1.6, 0]} thickness={0.05} color={PALETTE.steelDark} castShadow={false} />
        <group ref={wrist} position={[0, 1.8, 0]}>
          {/* 肘关节 */}
          <Rod radius={0.12} length={0.3} axis="z" position={[0, 0, 0]} color={PALETTE.alu} kind="aluminium" />
          {/* 第二级臂 */}
          <Slab size={[0.2, 0.2, 0.8]} radius={0.04} position={[0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]} color={PALETTE.machineTrim} kind="steelPainted" />
          {/* 腕部与夹爪 */}
          <Slab size={[0.26, 0.24, 0.26]} radius={0.04} position={[0.86, -0.04, 0]} color={PALETTE.machineBodyDark} kind="steelPainted" />
          {[-1, 1].map((side) => (
            <Slab
              key={side}
              size={[0.06, 0.34, 0.14]}
              radius={0.02}
              position={[0.98, -0.26, side * 0.12]}
              color={PALETTE.safetyYellow}
              kind="steelPainted"
            />
          ))}
          <Rod radius={0.05} length={0.24} axis="x" position={[0.86, -0.24, 0]} color={PALETTE.alu} kind="aluminium" castShadow={false} />
          {/* 线缆包 */}
          <Pipe from={[0.3, 0.06, 0.12]} to={[0.8, -0.2, 0.12]} radius={0.035} color="#22282c" kind="rubber" castShadow={false} />
          <Pipe from={[0.3, 0.06, -0.12]} to={[0.8, -0.2, -0.12]} radius={0.035} color="#22282c" kind="rubber" castShadow={false} />
        </group>
      </group>
      {/* 控制柜 */}
      <Cabinet size={[0.55, 1.2, 0.4]} position={[-0.95, 0.6, 0.35]} screen={false} />
    </group>
  );
}

/** 震动上料机：料斗 + 弹簧支腿 + 振动电机 + 振动送料槽（随给料速率抖动）。 */
function VibratingFeeder({ state, selected, onSelect, viewMode }: LineProps) {
  const tray = useRef<Group>(null);
  const simulation = useSimulation();
  const status = deviceStatus(state, 'VIB_FEEDER');
  useFrame(() => {
    if (!tray.current) return;
    const amplitude = viewMode === 'xray' ? 0.012 : 0.014;
    tray.current.position.y = Math.sin(simulation.timeInShift * 22) * amplitude;
  });
  return (
    <DeviceShell selected={selected === 'VIB_FEEDER'} onSelect={() => onSelect('VIB_FEEDER')} size={[2.1, 2.3, 2]} position={[PLANT.vibFeeder.x, 0, PLANT.vibFeeder.z]}>
      {/* 料斗：四片斜板 */}
      {[
        { pos: [0, 0.95, -0.72] as [number, number, number], rot: [-0.42, 0, 0] as [number, number, number], size: [1.5, 0.9, 0.05] as [number, number, number] },
        { pos: [0, 0.95, 0.72] as [number, number, number], rot: [0.42, 0, 0] as [number, number, number], size: [1.5, 0.9, 0.05] as [number, number, number] },
        { pos: [0.78, 0.95, 0] as [number, number, number], rot: [0, 0, 0.42] as [number, number, number], size: [0.05, 0.9, 1.3] as [number, number, number] },
        { pos: [-0.78, 0.95, 0] as [number, number, number], rot: [0, 0, -0.42] as [number, number, number], size: [0.05, 0.9, 1.3] as [number, number, number] },
      ].map((panel, index) => (
        <Slab key={index} size={panel.size} radius={0.02} position={panel.pos} rotation={panel.rot} color={PALETTE.machineBody} kind="steelPainted" />
      ))}
      {/* 料斗下沿与出料口 */}
      <Slab size={[1.1, 0.1, 1.1]} radius={0.02} position={[0, 0.5, 0]} color={PALETTE.machineBodyDark} kind="steelPainted" />
      {/* 机座 */}
      <Slab size={[1.3, 0.34, 1.4]} radius={0.05} position={[0, 0.28, 0]} color={PALETTE.machineBodyDark} kind="steelPainted" />
      {/* 弹簧支腿 */}
      {[
        [-0.55, -0.6],
        [0.55, -0.6],
        [-0.55, 0.6],
        [0.55, 0.6],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <Rod radius={0.075} length={0.22} axis="y" position={[0, 0.11, 0]} color={PALETTE.alu} kind="aluminium" castShadow={false} />
          <Rod radius={0.1} length={0.05} axis="y" position={[0, 0.05, 0]} color={PALETTE.steelDark} kind="steel" castShadow={false} />
        </group>
      ))}
      {/* 振动电机 */}
      <Motor radius={0.12} length={0.28} axis="z" position={[0.7, 0.3, 0]} color={PALETTE.machineBodyDark} />
      {/* 振动送料槽（动画） */}
      <group ref={tray} position={[1.05, 0.52, 0]}>
        <Slab size={[1.5, 0.16, 1.3]} radius={0.02} color={PALETTE.steelBlue} kind="steelPainted" />
        {[-1, 1].map((side) => (
          <Slab key={side} size={[1.5, 0.26, 0.06]} radius={0.02} position={[0, 0.16, (side * 1.3) / 2 - side * 0.03]} color={PALETTE.machineTrim} kind="steelPainted" castShadow={false} />
        ))}
      </group>
      <Cabinet size={[0.5, 1.15, 0.36]} position={[-0.95, 0.58, 0.5]} screen={false} />
      <StatusLamp status={status} position={[-0.95, 1.28, 0.5]} />
    </DeviceShell>
  );
}

/** 塑料瓶线、纺织线、料仓、打包机与两条线的辅助设备。 */
export default function Lines({ state, selected, onSelect, viewMode }: LineProps) {
  return (
    <group>
      {/* --- 塑料瓶分拣线 --- */}
      <VibratingFeeder state={state} selected={selected} onSelect={onSelect} viewMode={viewMode} />

      <DeviceShell
        selected={selected === 'INCLINE'}
        onSelect={() => onSelect('INCLINE')}
        size={[5.2, 2.4, 1.2]}
        position={[(PLASTIC_BELTS.incline.from.x + PLASTIC_BELTS.incline.to.x) / 2, 0, PLASTIC_BELTS.incline.from.z]}
      >
        <group position={[12, 0, 1.8]}>
          <ConveyorBelt {...PLASTIC_BELTS.incline} legs />
        </group>
      </DeviceShell>

      {(['SORTER_1', 'SORTER_2'] as const).map((id) => {
        const belt = id === 'SORTER_1' ? PLASTIC_BELTS.sorter1 : PLASTIC_BELTS.sorter2;
        const grade = id === 'SORTER_1' ? 'PET' : 'HDPE';
        const active = state.puffs.some((puff) => puff.device === id);
        const status = deviceStatus(state, id);
        return (
          <DeviceShell key={id} selected={selected === id} onSelect={() => onSelect(id)} size={[2.4, 2.8, 1.8]} position={[(belt.from.x + belt.to.x) / 2, 0, belt.from.z]}>
            {/* 皮带用世界坐标建，必须抵消 DeviceShell 的位移，否则整条带会被平移一次 */}
            <group position={[-((belt.from.x + belt.to.x) / 2), 0, -belt.from.z]}>
              <ConveyorBelt {...belt} />
            </group>
            {/* 光选相机罩（带观察窗与遮光罩） */}
            <Rod radius={0.09} length={0.9} axis="y" position={[-0.5, belt.fromY + 0.75, 0]} color={PALETTE.steelDark} kind="steel" castShadow={false} />
            <Slab size={[1.5, 0.44, 0.9]} radius={0.05} position={[0, belt.fromY + 1.2, 0]} color={PALETTE.panelFace} kind="steelPainted" />
            <Slab size={[1.1, 0.3, 0.03]} radius={0.02} position={[0, belt.fromY + 1.2, 0.47]} color={PALETTE.glass} kind="glass" opacity={0.5} castShadow={false} />
            <BoltRow count={4} spacing={0.32} position={[0, belt.fromY + 1.42, 0.3]} radius={0.02} />
            {/* 气吹阀排：喷气时发光 */}
            <Slab size={[1.4, 0.1, 0.14]} radius={0.02} position={[0, belt.fromY + 0.82, 0]} color={active ? PALETTE.safetyYellow : PALETTE.steelBlue} kind="steelPainted" castShadow={false} />
            {Array.from({ length: 7 }, (_, index) => (
              <Rod
                key={index}
                radius={0.022}
                length={0.1}
                axis="y"
                position={[-0.54 + index * 0.18, belt.fromY + 0.74, 0]}
                color={active ? PALETTE.lampWarm : PALETTE.alu}
                kind="aluminium"
                castShadow={false}
              />
            ))}
            {/* 分选标识罩：颜色对应被分出的材质 */}
            <Slab size={[1.5, 0.12, 0.86]} radius={0.04} position={[0, belt.fromY + 1.48, 0]} color={MATERIAL_META[grade].color} kind="steelPainted" castShadow={false} />
            {/* 剔料斗与尾料口 */}
            <Slab size={[0.5, 0.4, 0.06]} radius={0.02} position={[0.72, belt.fromY + 0.2, 0]} rotation={[0, 0, -0.5]} color={PALETTE.machineTrim} kind="steelPainted" castShadow={false} />
            <Cabinet size={[0.5, 1.25, 0.38]} position={[-1.05, 0.62, 0.62]} />
            <StatusLamp status={status} position={[-1.05, 1.4, 0.62]} />
          </DeviceShell>
        );
      })}

      <DeviceShell selected={selected === 'CONVEYOR'} onSelect={() => onSelect('CONVEYOR')} size={[10.6, 2.2, 3.4]} position={[-4.4, 0, -0.9]}>
        {/* 五段皮带同样是世界坐标，用一层负位移把 DeviceShell 的偏移抵消掉 */}
        <group position={[4.4, 0, 0.9]}>
          <ConveyorBelt {...PLASTIC_BELTS.pass1} legs />
          <ConveyorBelt {...PLASTIC_BELTS.pass2} legs />
          <ConveyorBelt {...PLASTIC_BELTS.lanePet} motor={false} legs />
          <ConveyorBelt {...PLASTIC_BELTS.laneHdpe} motor={false} legs />
          <ConveyorBelt {...PLASTIC_BELTS.laneTail} motor={false} legs />
        </group>
      </DeviceShell>

      {SILO_IDS.map((id) => (
        <Silo key={id} id={id} state={state} selected={selected} onSelect={onSelect} />
      ))}

      <DeviceShell selected={selected === 'BALER_PLASTIC'} onSelect={() => onSelect('BALER_PLASTIC')} size={[2, 1.4, 2]} position={[PLANT.balerPlastic.x, 0, PLANT.balerPlastic.z]}>
        <Baler device="BALER_PLASTIC" position={{ x: 0, z: 0 }} color={PALETTE.machineTrim} state={state} />
      </DeviceShell>

      {/* --- 纺织品分拣线 --- */}
      <DeviceShell selected={selected === 'SPREADER'} onSelect={() => onSelect('SPREADER')} size={[5.2, 1.8, 1.6]} position={[PLANT.spreader.x, 0, PLANT.spreader.z]}>
        <group position={[15, 0, -8.4]}>
          <ConveyorBelt {...TEXTILE_BELTS.spreader} legs />
        </group>
        {/* 平铺辊与压料辊 */}
        <Rod radius={0.16} length={1.5} axis="x" position={[0, 1.02, 0.4]} color={PALETTE.alu} kind="aluminium" />
        <Rod radius={0.1} length={1.4} axis="x" position={[0, 1.16, -0.35]} color={PALETTE.steelBlue} kind="steelPainted" />
      </DeviceShell>

      <DeviceShell selected={selected === 'HYPERSPEC'} onSelect={() => onSelect('HYPERSPEC')} size={[4, 2.4, 1.8]} position={[PLANT.hyperspec.x, 0, PLANT.hyperspec.z]}>
        <group position={[10.9, 0, -8.4]}>
          <ConveyorBelt {...TEXTILE_BELTS.hyperspec} legs />
        </group>
        {/* 高光谱检测门架 + 光源箱 */}
        {[-1, 1].map((side) => (
          <Rod key={side} radius={0.075} length={1.9} axis="y" position={[side * 0.85, 1.1, 0]} color={PALETTE.steelDark} kind="steel" />
        ))}
        <Slab size={[2.2, 0.34, 1.1]} radius={0.04} position={[0, 2.02, 0]} color={PALETTE.panelFace} kind="steelPainted" />
        <Slab size={[1.9, 0.1, 0.9]} radius={0.02} position={[0, 1.82, 0]} color={PALETTE.steelBlue} kind="steelPainted" castShadow={false} />
        {[-0.7, 0.7].map((x) => (
          <mesh key={x} position={[x, 1.74, 0]} castShadow={false}>
            <boxGeometry args={[0.5, 0.06, 0.7]} />
            <meshStandardMaterial {...surface('lamp', PALETTE.lampCool, { emissive: PALETTE.lampCool, emissiveIntensity: 1.7 })} />
          </mesh>
        ))}
        <Cabinet size={[0.55, 1.3, 0.4]} position={[1.5, 0.65, 0.7]} />
        <StatusLamp status={deviceStatus(state, 'HYPERSPEC')} position={[1.5, 1.45, 0.7]} />
      </DeviceShell>

      <DeviceShell
        selected={selected === 'ROBOT_ARM'}
        onSelect={() => onSelect('ROBOT_ARM')}
        size={[5.2, 2.8, 1.4]}
        position={[(TEXTILE_BELTS.pickBelt.from.x + TEXTILE_BELTS.pickBelt.to.x) / 2, 0, TEXTILE_BELTS.pickBelt.from.z]}
      >
        <group position={[6.9, 0, -8.4]}>
          <ConveyorBelt {...TEXTILE_BELTS.pickBelt} legs />
        </group>
      </DeviceShell>
      <DeviceShell selected={selected === 'ROBOT_ARM'} onSelect={() => onSelect('ROBOT_ARM')} size={[1.6, 2.6, 1.6]} position={[PLANT.arm.x, 0, PLANT.arm.z]}>
        <RobotArm state={state} />
      </DeviceShell>

      <DeviceShell selected={selected === 'BALER_TEXTILE'} onSelect={() => onSelect('BALER_TEXTILE')} size={[2, 1.4, 2]} position={[PLANT.balerTextile.x, 0, PLANT.balerTextile.z]}>
        <Baler device="BALER_TEXTILE" position={{ x: 0, z: 0 }} color={PALETTE.safetyOrange} state={state} />
      </DeviceShell>

      {/* --- 存储与地磅 --- */}
      <DeviceShell selected={selected === 'BALER_CARDBOARD'} onSelect={() => onSelect('BALER_CARDBOARD')} size={[2, 1.4, 2]} position={[PLANT.balerCardboard.x, 0, PLANT.balerCardboard.z]}>
        <Baler device="BALER_CARDBOARD" position={{ x: 0, z: 0 }} color={PALETTE.safetyOrange} state={state} />
      </DeviceShell>

      <DeviceShell selected={selected === 'STORAGE_CARDBOARD'} onSelect={() => onSelect('STORAGE_CARDBOARD')} size={[3.4, 2, 3]} position={[PLANT.storageCardboard.x, 0, PLANT.storageCardboard.z]}>
        {/* 纸板堆垛：木托盘 + 两层纸板包 */}
        {[
          [0, 0, 0],
          [0.1, 0, 0.12],
        ].map((offset, index) => (
          <group key={index} position={[offset[0], index * 0.78, offset[2]]}>
            {index === 0 && <Pallet size={[1.5, 0.14, 1.4]} position={[0, 0.07, 0]} />}
            <Slab size={[1.35, 0.62, 1.2]} radius={0.05} position={[0, 0.44, 0]} color="#b98a52" kind="cardboard" />
            <Bar from={[-0.7, 0.44, 0]} to={[0.7, 0.44, 0]} thickness={0.02} color="#8a6a3a" castShadow={false} />
          </group>
        ))}
      </DeviceShell>

      <DeviceShell selected={selected === 'STORAGE_MISC'} onSelect={() => onSelect('STORAGE_MISC')} size={[3.4, 2, 3]} position={[PLANT.storageMisc.x, 0, PLANT.storageMisc.z]}>
        {/* 杂项：几个不同尺寸的料箱堆在一起 */}
        {[
          { pos: [-0.62, 0.3, -0.5] as [number, number, number], size: [0.9, 0.6, 0.8] as [number, number, number], color: PALETTE.steelBlue },
          { pos: [0.45, 0.28, -0.62] as [number, number, number], size: [0.8, 0.56, 0.9] as [number, number, number], color: PALETTE.machineBody },
          { pos: [-0.3, 0.25, 0.55] as [number, number, number], size: [1.0, 0.5, 0.7] as [number, number, number], color: PALETTE.steelDark },
          { pos: [0.5, 0.24, 0.5] as [number, number, number], size: [0.7, 0.48, 0.7] as [number, number, number], color: PALETTE.machineBodyDark },
        ].map((box, index) => (
          <group key={index} position={box.pos}>
            <Slab size={box.size} radius={0.03} color={box.color} kind="steelPainted" />
            <Slab
              size={[box.size[0] * 1.02, 0.05, box.size[2] * 1.02]}
              radius={0.01}
              position={[0, box.size[1] / 2 - 0.02, 0]}
              color={PALETTE.machineTrim}
              kind="steelPainted"
              castShadow={false}
            />
          </group>
        ))}
      </DeviceShell>

      <DeviceShell selected={selected === 'SCALE'} onSelect={() => onSelect('SCALE')} size={[4.4, 0.7, 3.6]} position={[SCALE.x, 0, SCALE.z]}>
        {/* 地磅：磅台 + 两侧引坡 + 挡轮条 + 仪表柜 */}
        <Slab size={[3.6, 0.2, 2.6]} radius={0.02} position={[0, 0.1, 0]} color={PALETTE.steel} kind="steel" />
        <Slab size={[3.6, 0.03, 2.4]} radius={0} position={[0, 0.22, 0]} color={PALETTE.panelFace} kind="steelPainted" castShadow={false} />
        {[-1, 1].map((side) => (
          <Slab
            key={side}
            size={[0.5, 0.06, 2.4]}
            radius={0}
            position={[side * 1.9, 0.06, 0]}
            rotation={[0, 0, side * -0.25]}
            color={PALETTE.steelDark}
            kind="steelPainted"
            castShadow={false}
          />
        ))}
        {[-1, 1].map((side) => (
          <Rod key={`kerb${side}`} radius={0.05} length={2.6} axis="z" position={[side * 1.7, 0.26, 0]} color={PALETTE.safetyYellow} kind="steelPainted" castShadow={false} />
        ))}
        <Cabinet size={[0.5, 1.1, 0.4]} position={[2.4, 0.55, 1.3]} rotation={[0, -0.6, 0]} />
        <StatusLamp status={deviceStatus(state, 'SCALE')} position={[2.4, 1.28, 1.3]} rotation={[0, -0.6, 0]} />
      </DeviceShell>
    </group>
  );
}
