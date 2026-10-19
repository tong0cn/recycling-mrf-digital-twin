import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { DeviceId, SimState, TruckId } from '../types';
import { MATERIAL_META } from '../simulation/data';
import { useSimulation } from '../simulation/context';
import { pointAlong } from '../spatial/layout';
import { Bar, BoltRow, Pipe, Rod, Slab } from './kit';
import { glow, surface } from './materials';
import { PALETTE } from './palette';
import { DeviceShell } from './parts';
import { balePose, unitPose } from './unitPositions';

const TRUCK_DEVICE: Record<TruckId, DeviceId> = {
  TRUCK_A: 'TRUCK_A',
  TRUCK_B: 'TRUCK_B',
  TRUCK_C: 'TRUCK_C',
};

const FORKLIFT_DEVICE = { FL1: 'FORKLIFT_1', FL2: 'FORKLIFT_2' } as const;

/** 六个车轮（三轴货车）：[x, y, z]。 */
const WHEEL_POSITIONS: [number, number, number][] = [
  [-1.15, 0.52, 2.6],
  [1.15, 0.52, 2.6],
  [-1.15, 0.52, -0.6],
  [1.15, 0.52, -0.6],
  [-1.15, 0.52, -2.6],
  [1.15, 0.52, -2.6],
];

interface VehicleProps {
  selected: DeviceId | null;
  onSelect: (id: DeviceId) => void;
}

/** 车轮：轮胎 + 轮辋 + 一圈螺栓。 */
function Wheel({
  position,
  radius = 0.52,
  width = 0.36,
  bolts = 6,
}: {
  position: [number, number, number];
  radius?: number;
  width?: number;
  bolts?: number;
}) {
  return (
    <group position={position}>
      <Rod radius={radius} length={width} axis="x" color="#1b2126" kind="rubber" segments={18} />
      <Rod radius={radius * 0.62} length={width + 0.03} axis="x" color={PALETTE.alu} kind="aluminium" segments={16} castShadow={false} />
      <Rod radius={radius * 0.2} length={width + 0.06} axis="x" color={PALETTE.steelDark} kind="steel" segments={12} castShadow={false} />
      {Array.from({ length: bolts }, (_, index) => {
        const angle = (index / bolts) * Math.PI * 2;
        return (
          <mesh
            key={index}
            position={[width / 2 + 0.02, Math.cos(angle) * radius * 0.42, Math.sin(angle) * radius * 0.42]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow={false}
          >
            <cylinderGeometry args={[0.028, 0.028, 0.03, 6]} />
            <meshStandardMaterial {...surface('steel', PALETTE.steel)} />
          </mesh>
        );
      })}
    </group>
  );
}

/** 厢式货车：驾驶室 + 导流罩 + 车厢（带波纹肋与后门）+ 底盘 + 六轮 + 灯组。 */
function TruckMesh({ id, selected, onSelect }: VehicleProps & { id: TruckId }) {
  const group = useRef<Group>(null);
  const device = TRUCK_DEVICE[id];
  const simulation = useSimulation();

  useFrame(() => {
    if (!group.current) return;
    const truck = simulation.current.trucks[id];
    // Trucks wait outside the gates, so an off-site vehicle is simply not drawn.
    group.current.visible = truck.status !== 'OFF_SITE';
    group.current.position.set(truck.x, 0, truck.z);
  });

  const paint = id === 'TRUCK_C' ? PALETTE.plastic : '#dfe5e9';

  return (
    <group ref={group}>
      <DeviceShell selected={selected === device} onSelect={() => onSelect(device)} size={[2.6, 3.6, 9]} position={[0, 0, 0]}>
        {/* 底盘大梁 */}
        {[-1, 1].map((side) => (
          <Slab key={side} size={[0.14, 0.24, 8.6]} radius={0.02} position={[side * 0.92, 0.74, 0.2]} color={PALETTE.steelDark} kind="steel" />
        ))}
        {/* 驾驶室 */}
        <Slab size={[2.4, 2.1, 2.2]} radius={0.09} position={[0, 1.62, 3.3]} color={paint} kind="steelPainted" />
        {/* 前挡风与侧窗 */}
        <Slab size={[2.1, 0.95, 0.08]} radius={0.02} position={[0, 2.05, 4.36]} rotation={[-0.12, 0, 0]} color={PALETTE.glass} kind="glass" opacity={0.72} castShadow={false} />
        {[-1, 1].map((side) => (
          <Slab key={side} size={[0.06, 0.62, 1.1]} radius={0.02} position={[side * 1.19, 1.98, 3.5]} color={PALETTE.glass} kind="glass" opacity={0.6} castShadow={false} />
        ))}
        {/* 前脸：格栅、保险杠、雾灯 */}
        <Slab size={[2.06, 0.62, 0.08]} radius={0.02} position={[0, 1.22, 4.4]} color={PALETTE.panelFace} kind="steelPainted" castShadow={false} />
        <Slab size={[2.42, 0.3, 0.26]} radius={0.04} position={[0, 0.72, 4.42]} color={PALETTE.steelDark} kind="steelPainted" />
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.9, 0.98, 4.42]} castShadow={false}>
            <boxGeometry args={[0.34, 0.2, 0.06]} />
            <meshStandardMaterial {...glow(PALETTE.lampWarm, 1.6)} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`fog${side}`} position={[side * 1.02, 0.74, 4.5]} castShadow={false}>
            <boxGeometry args={[0.2, 0.12, 0.05]} />
            <meshStandardMaterial {...glow(PALETTE.lampCool, 1.4)} />
          </mesh>
        ))}
        {/* 后视镜 */}
        {[-1, 1].map((side) => (
          <group key={`mirror${side}`} position={[side * 1.34, 2.15, 4.1]}>
            <Bar from={[0, 0, 0]} to={[side * 0.14, 0.2, -0.1]} thickness={0.035} color={PALETTE.steelDark} castShadow={false} />
            <Slab size={[0.06, 0.4, 0.16]} radius={0.02} position={[side * 0.16, 0.22, -0.1]} color={PALETTE.panelFace} kind="plastic" castShadow={false} />
          </group>
        ))}
        {/* 导流罩 */}
        <Slab size={[2.2, 0.5, 1.3]} radius={0.08} position={[0, 2.88, 2.9]} color={paint} kind="steelPainted" castShadow={false} />
        {/* 排气管与油箱 */}
        <Rod radius={0.07} length={1.5} axis="y" position={[1.28, 1.5, 2.05]} color={PALETTE.alu} kind="aluminium" castShadow={false} />
        <Rod radius={0.28} length={1.1} axis="z" position={[-1.32, 0.78, 1.2]} color={PALETTE.alu} kind="aluminium" />
        {/* 车厢 */}
        <Slab size={[2.5, 2.6, 6.2]} radius={0.07} position={[0, 1.92, -0.9]} color={id === 'TRUCK_C' ? '#cdd4d8' : '#c3ccd2'} kind="steelPainted" />
        {/* 车厢波纹肋 */}
        {Array.from({ length: 7 }, (_, index) => {
          const z = 1.8 - index * 0.9;
          return [-1, 1].map((side) => (
            <Slab key={`${side}-${index}`} size={[0.06, 2.4, 0.14]} radius={0} position={[side * 1.26, 1.92, z]} color={PALETTE.wallPanelDark} kind="steelPainted" castShadow={false} />
          ));
        })}
        {/* 后门与锁杆 */}
        <Slab size={[2.44, 2.44, 0.08]} radius={0.03} position={[0, 1.92, -4.04]} color={id === 'TRUCK_C' ? '#c1c9ce' : '#b7c0c6'} kind="steelPainted" />
        {[-0.62, 0, 0.62].map((x) => (
          <Rod key={x} radius={0.035} length={2.3} axis="y" position={[x, 1.92, -4.1]} color={PALETTE.steel} kind="steel" castShadow={false} />
        ))}
        {/* 侧裙与尾部反光条 */}
        <Slab size={[0.1, 0.5, 5.4]} radius={0.02} position={[0, 0.85, -1.4]} color={PALETTE.safetyYellow} kind="steelPainted" castShadow={false} />
        {[-0.72, 0.72].map((x) => (
          <mesh key={x} position={[x, 1.18, -4.06]} castShadow={false}>
            <boxGeometry args={[0.34, 0.22, 0.06]} />
            <meshStandardMaterial color={PALETTE.warningRed} emissive={PALETTE.warningRed} emissiveIntensity={1.2} roughness={0.4} toneMapped={false} />
          </mesh>
        ))}
        {/* 挡泥板 */}
        {[-1, 1].map((side) => (
          <Slab key={`flap${side}`} size={[0.4, 0.5, 0.05]} radius={0.02} position={[side * 1.15, 0.35, -3.1]} color={PALETTE.rubber} kind="rubber" castShadow={false} />
        ))}
        {/* 车轮 */}
        {WHEEL_POSITIONS.map((position, index) => (
          <Wheel key={index} position={position} />
        ))}
      </DeviceShell>
    </group>
  );
}

/** 叉车：车身 + 配重 + 座椅/方向盘 + 护顶架 + 门架与货叉 + 警示灯。 */
function ForkliftMesh({ id, selected, onSelect }: VehicleProps & { id: 'FL1' | 'FL2' }) {
  const group = useRef<Group>(null);
  const mast = useRef<Group>(null);
  const device = FORKLIFT_DEVICE[id];
  const simulation = useSimulation();

  useFrame(() => {
    if (!group.current) return;
    const forklift = simulation.current.forklifts[id];
    group.current.position.set(forklift.x, 0, forklift.z);
    // Face the direction of travel, taken from the very route the simulation is following.
    if (forklift.route.length > 1) {
      const ahead = pointAlong(forklift.route, forklift.travelled + 0.8);
      const angle = Math.atan2(ahead.x - forklift.x, ahead.z - forklift.z);
      if (Number.isFinite(angle) && (ahead.x !== forklift.x || ahead.z !== forklift.z)) {
        group.current.rotation.y += (angle - group.current.rotation.y) * 0.08;
      }
    }
    if (mast.current) {
      const lifting = forklift.status === 'LOADING' || forklift.status === 'UNLOADING';
      const target = lifting ? 0.25 : forklift.loaded ? 0.45 : 0.9;
      mast.current.position.y += (target - mast.current.position.y) * 0.08;
    }
  });

  const cargo = simulation.current.forklifts[id].cargoLabel;
  const loaded = simulation.current.forklifts[id].loaded;

  return (
    <group ref={group}>
      <DeviceShell selected={selected === device} onSelect={() => onSelect(device)} size={[1.6, 2.7, 3.2]} position={[0, 0, 0]}>
        {/* 车身与配重 */}
        <Slab size={[1.32, 0.92, 1.8]} radius={0.08} position={[0, 0.9, -0.3]} color={PALETTE.safetyYellow} kind="steelPainted" />
        <Slab size={[1.26, 0.78, 0.66]} radius={0.12} position={[0, 0.84, -1.42]} color={PALETTE.steelDark} kind="steelPainted" />
        <BoltRow count={4} spacing={0.24} position={[0, 0.6, -1.76]} radius={0.03} />
        {/* 踏板与侧向护板 */}
        <Slab size={[1.4, 0.1, 0.9]} radius={0.03} position={[0, 0.44, 0.2]} color={PALETTE.steelDark} kind="steelPainted" castShadow={false} />
        {/* 座椅与方向盘 */}
        <Slab size={[0.5, 0.16, 0.5]} radius={0.05} position={[0, 1.4, -0.62]} color={PALETTE.panelFace} kind="plastic" />
        <Slab size={[0.5, 0.5, 0.12]} radius={0.05} position={[0, 1.66, -0.86]} color={PALETTE.panelFace} kind="plastic" />
        <Rod radius={0.06} length={0.7} axis="y" position={[0, 1.5, -0.05]} rotation={[0.5, 0, 0]} color={PALETTE.steelDark} kind="steel" castShadow={false} />
        <mesh position={[0, 1.72, 0.18]} rotation={[1.1, 0, 0]} castShadow={false}>
          <torusGeometry args={[0.16, 0.03, 6, 16]} />
          <meshStandardMaterial color="#1e262b" roughness={0.6} />
        </mesh>
        {/* 护顶架 */}
        {[
          [-0.62, -1.02],
          [0.62, -1.02],
          [-0.62, 0.42],
          [0.62, 0.42],
        ].map(([x, z]) => (
          <Bar key={`${x}${z}`} from={[x, 1.36, z]} to={[x * 0.82, 2.34, z]} thickness={0.075} color={PALETTE.steelDark} kind="steel" castShadow={false} />
        ))}
        <Slab size={[1.5, 0.07, 1.7]} radius={0.03} position={[0, 2.36, -0.3]} color={PALETTE.steelDark} kind="steelPainted" />
        {[-1, 0, 1].map((x) => (
          <Slab key={x} size={[0.08, 0.05, 1.6]} radius={0} position={[x * 0.5, 2.32, -0.3]} color={PALETTE.steel} kind="steel" castShadow={false} />
        ))}
        {/* 警示灯 */}
        <Rod radius={0.045} length={0.14} axis="y" position={[0, 2.45, -1.0]} color={PALETTE.steelDark} kind="steel" castShadow={false} />
        <mesh position={[0, 2.56, -1.0]} castShadow={false}>
          <sphereGeometry args={[0.09, 12, 10]} />
          <meshStandardMaterial {...glow(PALETTE.lampWarm, 2.6)} />
        </mesh>
        {/* 门架与货叉 */}
        <group ref={mast} position={[0, 0.9, 1.05]}>
          {[-1, 1].map((side) => (
            <Bar key={side} from={[side * 0.62, -0.5, 0]} to={[side * 0.62, 1.15, 0]} thickness={0.11} color={PALETTE.steelDark} kind="steel" />
          ))}
          {[-0.5, 0.1, 0.7].map((y) => (
            <Bar key={y} from={[-0.62, y, 0]} to={[0.62, y, 0]} thickness={0.07} color={PALETTE.steel} kind="steel" castShadow={false} />
          ))}
          <Rod radius={0.07} length={1.3} axis="y" position={[0, 0.3, 0.16]} color={PALETTE.machineTrim} kind="steelPainted" castShadow={false} />
          {/* 举升链条 */}
          <Pipe from={[-0.5, 1.1, 0.1]} to={[-0.5, -0.35, 0.1]} radius={0.018} color={PALETTE.alu} kind="aluminium" castShadow={false} />
          {/* 货叉架与货叉 */}
          <Slab size={[1.3, 0.5, 0.08]} radius={0.03} position={[0, -0.62, 0.1]} color={PALETTE.steel} kind="steel" />
          {[-1, 1].map((side) => (
            <Slab key={`fork${side}`} size={[0.16, 0.06, 1.05]} radius={0.02} position={[side * 0.42, -0.84, 0.6]} color={PALETTE.alu} kind="aluminium" castShadow={false} />
          ))}
          {loaded && (
            <Slab size={[1.15, 0.58, 0.85]} radius={0.05} position={[0, -0.5, 0.55]} color="#8a6a3a" kind="cardboard" />
          )}
        </group>
        {/* 车轮：前大后小 */}
        <Wheel position={[-0.72, 0.42, 1.0]} radius={0.42} width={0.3} bolts={5} />
        <Wheel position={[0.72, 0.42, 1.0]} radius={0.42} width={0.3} bolts={5} />
        <Wheel position={[-0.62, 0.3, -1.05]} radius={0.3} width={0.24} bolts={4} />
        <Wheel position={[0.62, 0.3, -1.05]} radius={0.3} width={0.24} bolts={4} />
      </DeviceShell>
      {loaded && (
        <Slab size={[1.12, 0.54, 0.86]} radius={0.05} position={[0, 0.34, 1.45]} color="#8a6a3a" kind="cardboard" />
      )}
      {/* 顶灯指示载货状态 */}
      <mesh position={[0, 2.78, -0.75]} castShadow={false}>
        <boxGeometry args={[0.9, 0.16, 0.24]} />
        <meshStandardMaterial
          color={cargo === '空载' ? PALETTE.steelBlue : PALETTE.ledRun}
          emissive={cargo === '空载' ? '#000000' : PALETTE.ledRun}
          emissiveIntensity={cargo === '空载' ? 0 : 1.6}
          roughness={0.4}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Finished bales sitting on a press, in the yard or already loaded on the outbound truck. */
function BaleMeshes({ state }: { state: SimState }) {
  const refs = useRef<Map<number, Mesh>>(new Map());
  const simulation = useSimulation();

  useFrame(() => {
    const current = simulation.current;
    for (const bale of current.bales) {
      const mesh = refs.current.get(bale.id);
      if (!mesh) continue;
      const pose = balePose(bale, bale.id % 4);
      mesh.visible = pose.visible;
      mesh.position.set(pose.x, pose.y, pose.z);
    }
  });

  return (
    <>
      {state.bales.map((bale) => (
        <mesh
          key={bale.id}
          ref={(node) => {
            if (node) refs.current.set(bale.id, node);
            else refs.current.delete(bale.id);
          }}
          castShadow
        >
          {/* 打包块：主体压扁一点，外面两道打包带 —— 比裸盒子更像成品垛 */}
          <boxGeometry args={[0.95, 0.72, 0.85]} />
          <meshStandardMaterial color={MATERIAL_META[bale.material].color} roughness={0.72} metalness={0.05} envMapIntensity={0.7} />
        </mesh>
      ))}
    </>
  );
}

/** 打包块上的捆扎带：跟着块体一起走，单独画一组细条。 */
function BaleStraps({ state }: { state: SimState }) {
  const refs = useRef<Map<number, Group>>(new Map());
  const simulation = useSimulation();
  useFrame(() => {
    const current = simulation.current;
    for (const bale of current.bales) {
      const node = refs.current.get(bale.id);
      if (!node) continue;
      const pose = balePose(bale, bale.id % 4);
      node.visible = pose.visible;
      node.position.set(pose.x, pose.y, pose.z);
    }
  });
  return (
    <>
      {state.bales.map((bale) => (
        <group
          key={bale.id}
          ref={(node) => {
            if (node) refs.current.set(bale.id, node);
            else refs.current.delete(bale.id);
          }}
        >
          {[-0.26, 0.26].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow={false}>
              <boxGeometry args={[0.98, 0.76, 0.05]} />
              <meshStandardMaterial color="#2f3a40" roughness={0.5} metalness={0.35} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** Packages that are on the move are drawn here; ones inside a bin or a press are not. */
function MovingUnits({ state }: { state: SimState }) {
  const refs = useRef<Map<number, Group>>(new Map());
  const simulation = useSimulation();

  useFrame(() => {
    const current = simulation.current;
    const counters = new Map<string, number>();
    for (const unit of current.units) {
      const slot = counters.get(unit.stage) ?? 0;
      counters.set(unit.stage, slot + 1);
      const group = refs.current.get(unit.id);
      if (!group) continue;
      const pose = unitPose(unit, current, slot);
      group.visible = pose.visible;
      group.position.set(pose.x, pose.y, pose.z);
      group.rotation.y = pose.rotY;
    }
  });

  return (
    <>
      {state.units.map((unit) => (
        <group
          key={unit.id}
          ref={(node) => {
            if (node) refs.current.set(unit.id, node);
            else refs.current.delete(unit.id);
          }}
        >
          {unit.kind === 'PLASTIC' ? (
            /* 塑料瓶料包：压扁的捆包 + 两道捆扎带 */
            <group>
              <mesh castShadow>
                <cylinderGeometry args={[0.16, 0.18, 0.42, 12]} />
                <meshStandardMaterial color={MATERIAL_META[unit.origin].color} roughness={0.42} metalness={0.06} />
              </mesh>
              {[-0.11, 0.11].map((y) => (
                <mesh key={y} position={[0, y, 0]} castShadow={false}>
                  <cylinderGeometry args={[0.185, 0.185, 0.035, 12]} />
                  <meshStandardMaterial color="#333d43" roughness={0.6} />
                </mesh>
              ))}
            </group>
          ) : unit.kind === 'TEXTILE' ? (
            /* 纺织料包：软包 + 中缝 */
            <group>
              <mesh castShadow>
                <boxGeometry args={[0.62, 0.24, 0.52]} />
                <meshStandardMaterial color={MATERIAL_META[unit.origin].color} roughness={0.94} envMapIntensity={0.35} />
              </mesh>
              <mesh position={[0, 0.125, 0]} castShadow={false}>
                <boxGeometry args={[0.64, 0.02, 0.12]} />
                <meshStandardMaterial color="#6c767c" roughness={0.8} />
              </mesh>
            </group>
          ) : (
            /* 纸板/杂项：捆好的纸板垛 */
            <group>
              <mesh castShadow>
                <boxGeometry args={[0.6, 0.48, 0.5]} />
                <meshStandardMaterial color={MATERIAL_META[unit.origin].color} roughness={0.88} envMapIntensity={0.4} />
              </mesh>
              {[-0.22, 0.22].map((z) => (
                <mesh key={z} position={[0, 0, z]} castShadow={false}>
                  <boxGeometry args={[0.62, 0.5, 0.04]} />
                  <meshStandardMaterial color="#4a5459" roughness={0.6} />
                </mesh>
              ))}
            </group>
          )}
        </group>
      ))}
    </>
  );
}

export default function Vehicles({ selected, onSelect }: VehicleProps) {
  const simulation = useSimulation();
  return (
    <>
      {(['TRUCK_A', 'TRUCK_B', 'TRUCK_C'] as TruckId[]).map((id) => (
        <TruckMesh key={id} id={id} selected={selected} onSelect={onSelect} />
      ))}
      {(['FL1', 'FL2'] as const).map((id) => (
        <ForkliftMesh key={id} id={id} selected={selected} onSelect={onSelect} />
      ))}
      <BaleMeshes state={simulation.current} />
      <BaleStraps state={simulation.current} />
      <MovingUnits state={simulation.current} />
    </>
  );
}

export { MovingUnits, BaleMeshes };

export function AirPuff({ device, position, reduced }: { device: 'SORTER_1' | 'SORTER_2'; position: [number, number, number]; reduced: boolean }) {
  const cone = useRef<Mesh>(null);
  const intensity = useRef(0);
  const simulation = useSimulation();
  useFrame((_, delta) => {
    const active = simulation.current.puffs.some((puff) => puff.device === device);
    intensity.current = active ? 1 : Math.max(0, intensity.current - delta * 2.6);
    if (!cone.current) return;
    const value = reduced ? (active ? 0.6 : 0) : intensity.current;
    cone.current.scale.set(1, Math.max(0.001, value), 1);
    const material = cone.current.material as MeshStandardMaterial;
    material.opacity = value * 0.5;
    cone.current.visible = value > 0.02;
  });
  return (
    <mesh ref={cone} position={position} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[0.42, 0.7, 12, 1, true]} />
      <meshStandardMaterial color="#cfe9f5" emissive="#8fd0f0" emissiveIntensity={0.6} transparent opacity={0.45} side={2} />
    </mesh>
  );
}
