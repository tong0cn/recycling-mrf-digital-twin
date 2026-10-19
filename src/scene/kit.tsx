import type { ReactNode } from 'react';
import { RoundedBox } from '@react-three/drei';
import { Euler, Quaternion, Vector3, type Texture } from 'three';
import { surface, glow, type SurfaceKind } from './materials';
import { PALETTE, STATUS_LED } from './palette';

/**
 * 构件原语库 —— 用最少的代码堆出足够的构件密度。
 *
 * 设计取舍：
 * - 大的外观件用 `Slab`（drei RoundedBox，倒角边缘能吃到高光，是「精致」的关键）；
 * - 小的螺栓、栏杆、斜撑一律用普通盒/柱，避免 RoundedBox 为每个小件新建几何；
 * - 每个原语都能选材质种类（`kind`），颜色只从 `palette.ts` 取。
 */

export type Vec3 = [number, number, number];

export interface PartProps {
  position?: Vec3;
  rotation?: Vec3;
  color?: string;
  kind?: SurfaceKind;
  /** 小构件建议关掉，影子贴图会便宜很多 */
  castShadow?: boolean;
  receiveShadow?: boolean;
  opacity?: number;
  /** 程序化贴图（来自 textures.ts）。倒角件不贴图，避免 UV 被挤出几何拉伸。 */
  map?: Texture | null;
  children?: ReactNode;
}

function materialProps(kind: SurfaceKind, color: string, opacity?: number, map?: Texture | null) {
  return surface(kind, color, {
    ...(opacity === undefined ? {} : { transparent: opacity < 1, opacity }),
    ...(map ? { map } : {}),
  });
}

export interface SlabProps extends PartProps {
  /** [宽, 高, 深] */
  size: Vec3;
  /** 倒角半径，0 表示锐角盒 */
  radius?: number;
  smoothness?: number;
}

/** 倒角板/箱：厂房地面、设备外壳、面板都用它。 */
export function Slab({
  size,
  radius = 0.035,
  smoothness = 2,
  position = [0, 0, 0],
  rotation,
  color = PALETTE.steel,
  kind = 'steelPainted',
  castShadow = true,
  receiveShadow = true,
  opacity,
  map,
  children,
}: SlabProps) {
  // 倒角不能超过最短边的一半，否则几何会自交。
  const safeRadius = Math.max(0, Math.min(radius, Math.min(...size) / 2 - 0.002));
  const material = materialProps(kind, color, opacity, map);
  if (safeRadius > 0.002) {
    return (
      <RoundedBox
        args={size}
        radius={safeRadius}
        smoothness={smoothness}
        position={position}
        rotation={rotation}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      >
        <meshStandardMaterial {...material} />
        {children}
      </RoundedBox>
    );
  }
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={size} />
      <meshStandardMaterial {...material} />
      {children}
    </mesh>
  );
}

export interface RodProps extends PartProps {
  radius?: number;
  /** 长度，沿 axis 方向 */
  length: number;
  axis?: 'x' | 'y' | 'z';
  segments?: number;
}

const AXIS_ROTATION: Record<'x' | 'y' | 'z', Vec3> = {
  y: [0, 0, 0],
  x: [0, 0, Math.PI / 2],
  z: [Math.PI / 2, 0, 0],
};

/** 圆柱：滚筒、支腿、立柱、油管。 */
export function Rod({
  radius = 0.05,
  length,
  axis = 'y',
  position = [0, 0, 0],
  rotation,
  color = PALETTE.steel,
  kind = 'steel',
  castShadow = true,
  receiveShadow = true,
  segments = 14,
  opacity,
  map,
}: RodProps) {
  return (
    <mesh position={position} rotation={rotation ?? AXIS_ROTATION[axis]} castShadow={castShadow} receiveShadow={receiveShadow}>
      <cylinderGeometry args={[radius, radius, length, segments]} />
      <meshStandardMaterial {...materialProps(kind, color, opacity, map)} />
    </mesh>
  );
}

/** 轴心沿 Y 的圆盘（轮子、法兰、滚筒端盖）。 */
export function Disc({ radius, thickness = 0.06, ...rest }: { radius: number; thickness?: number } & PartProps) {
  return <Rod radius={radius} length={thickness} axis="y" {...rest} />;
}

/** 任意两点之间的圆管：油管、气管、斜拉杆。 */
export function Pipe({
  from,
  to,
  radius = 0.04,
  color = PALETTE.steel,
  kind = 'steel',
  castShadow = true,
}: {
  from: Vec3;
  to: Vec3;
  radius?: number;
  color?: string;
  kind?: SurfaceKind;
  castShadow?: boolean;
}) {
  const start = new Vector3(...from);
  const end = new Vector3(...to);
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 1e-4) return null;
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
  const euler = new Euler().setFromQuaternion(quaternion);
  return (
    <mesh position={[mid.x, mid.y, mid.z]} rotation={[euler.x, euler.y, euler.z]} castShadow={castShadow}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial {...surface(kind, color)} />
    </mesh>
  );
}

/** 任意两点之间的方管：桁架杆、斜撑、检修梯侧梁。 */
export function Bar({
  from,
  to,
  thickness = 0.08,
  color = PALETTE.steel,
  kind = 'steel',
  castShadow = true,
}: {
  from: Vec3;
  to: Vec3;
  thickness?: number;
  color?: string;
  kind?: SurfaceKind;
  castShadow?: boolean;
}) {
  const start = new Vector3(...from);
  const end = new Vector3(...to);
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 1e-4) return null;
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
  const euler = new Euler().setFromQuaternion(quaternion);
  return (
    <mesh position={[mid.x, mid.y, mid.z]} rotation={[euler.x, euler.y, euler.z]} castShadow={castShadow}>
      <boxGeometry args={[thickness, length, thickness]} />
      <meshStandardMaterial {...surface(kind, color)} />
    </mesh>
  );
}

/** 四条支腿（含底部横撑），设备落地的基本件。 */
export function Legs({
  width,
  depth,
  height,
  axis = 'y',
  color = PALETTE.steelDark,
  kind = 'steel',
  thickness = 0.07,
  brace = false,
}: {
  width: number;
  depth: number;
  height: number;
  axis?: 'y' | 'z';
  color?: string;
  kind?: SurfaceKind;
  thickness?: number;
  brace?: boolean;
}) {
  const size = axis === 'y' ? 0.075 : thickness;
  return (
    <group>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) =>
        axis === 'y' ? (
          <Rod
            key={`${sx}${sz}`}
            radius={size}
            length={height}
            position={[(sx * width) / 2, height / 2, (sz * depth) / 2]}
            color={color}
            kind={kind}
          />
        ) : (
          <Rod
            key={`${sx}${sz}`}
            radius={size}
            length={depth}
            axis="z"
            position={[(sx * width) / 2, height, (sz * depth) / 2]}
            color={color}
            kind={kind}
          />
        ),
      )}
      {brace &&
        [-1, 1].map((sz) => (
          <Bar
            key={`brace${sz}`}
            from={[-width / 2, height * 0.32, (sz * depth) / 2]}
            to={[width / 2, height * 0.32, (sz * depth) / 2]}
            thickness={thickness * 0.7}
            color={color}
            kind={kind}
          />
        ))}
    </group>
  );
}

/** 沿 X 或 Z 方向的防护栏杆：两道横杆 + 立柱。 */
export function Rail({
  from,
  to,
  height = 1.05,
  posts = 4,
  color = PALETTE.guard,
  kind = 'steelPainted',
}: {
  from: Vec3;
  to: Vec3;
  height?: number;
  posts?: number;
  color?: string;
  kind?: SurfaceKind;
}) {
  const start = new Vector3(...from);
  const end = new Vector3(...to);
  const dir = end.clone().sub(start);
  const length = dir.length();
  const angle = Math.atan2(dir.x, dir.z);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  return (
    <group position={[mid.x, 0, mid.z]} rotation={[0, angle, 0]}>
      {[height, height * 0.55].map((y) => (
        <Rod key={y} radius={0.032} length={length} axis="z" position={[0, y, 0]} color={color} kind={kind} />
      ))}
      {Array.from({ length: Math.max(2, posts) }, (_, index) => {
        const z = -length / 2 + (length * index) / (Math.max(2, posts) - 1);
        return <Rod key={index} radius={0.035} length={height} position={[0, height / 2, z]} color={color} kind={kind} />;
      })}
    </group>
  );
}

/** 屋面桁架：上下弦 + 斜腹杆 + 竖杆，跨 X 方向、高 Y 方向。 */
export function Truss({
  span,
  height,
  bays = 8,
  thickness = 0.075,
  color = PALETTE.roofRib,
  kind = 'steel',
}: {
  span: number;
  height: number;
  bays?: number;
  thickness?: number;
  color?: string;
  kind?: SurfaceKind;
}) {
  const segments = Math.max(2, bays);
  const step = span / segments;
  const nodes: [number, number][] = Array.from({ length: segments + 1 }, (_, index) => [-span / 2 + step * index, 0]);
  return (
    <group>
      <Bar from={[nodes[0][0], 0, 0]} to={[nodes[segments][0], 0, 0]} thickness={thickness} color={color} kind={kind} />
      <Bar from={[nodes[0][0], height, 0]} to={[nodes[segments][0], height, 0]} thickness={thickness} color={color} kind={kind} />
      {nodes.slice(0, -1).map((node, index) => {
        const next = nodes[index + 1];
        const up = index % 2 === 0;
        return (
          <Bar
            key={index}
            from={[node[0], up ? height : 0, 0]}
            to={[next[0], up ? 0 : height, 0]}
            thickness={thickness * 0.62}
            color={color}
            kind={kind}
          />
        );
      })}
      {nodes
        .filter((_, index) => index % 2 === 1 && index < segments)
        .map((node, index) => (
          <Bar key={`v${index}`} from={[node[0], 0, 0]} to={[node[0], height, 0]} thickness={thickness * 0.55} color={color} kind={kind} />
        ))}
    </group>
  );
}

/** 百叶/散热格栅：一排倾斜薄片。 */
export function Louver({
  width,
  height,
  slats = 6,
  position,
  rotation,
  color = PALETTE.steelDark,
  kind = 'steel',
}: {
  width: number;
  height: number;
  slats?: number;
  position?: Vec3;
  rotation?: Vec3;
  color?: string;
  kind?: SurfaceKind;
}) {
  const count = Math.max(2, slats);
  const gap = height / count;
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: count }, (_, index) => (
        <Slab
          key={index}
          size={[width, gap * 0.55, 0.02]}
          radius={0}
          position={[0, -height / 2 + gap * (index + 0.5), 0]}
          rotation={[Math.PI / 5, 0, 0]}
          color={color}
          kind={kind}
          receiveShadow={false}
        />
      ))}
    </group>
  );
}

/** 一排螺栓/铆钉，用来给大面板加尺度参照。 */
export function BoltRow({
  count,
  spacing,
  position,
  rotation,
  radius = 0.022,
  color = PALETTE.alu,
}: {
  count: number;
  spacing: number;
  position?: Vec3;
  rotation?: Vec3;
  radius?: number;
  color?: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: Math.max(1, count) }, (_, index) => (
        <mesh key={index} position={[(index - (count - 1) / 2) * spacing, 0, 0]} castShadow={false}>
          <sphereGeometry args={[radius, 8, 6]} />
          <meshStandardMaterial {...surface('aluminium', color)} />
        </mesh>
      ))}
    </group>
  );
}

/** 电机：机身 + 散热筋 + 出轴。 */
export function Motor({
  radius = 0.16,
  length = 0.42,
  axis = 'x',
  position,
  rotation,
  color = PALETTE.machineBodyDark,
  kind = 'steelPainted',
}: {
  radius?: number;
  length?: number;
  axis?: 'x' | 'y' | 'z';
  position?: Vec3;
  rotation?: Vec3;
  color?: string;
  kind?: SurfaceKind;
}) {
  const fins = 8;
  return (
    <group position={position} rotation={rotation}>
      <Rod radius={radius} length={length} axis={axis} color={color} kind={kind} />
      {Array.from({ length: fins }, (_, index) => {
        const angle = (index / fins) * Math.PI * 2;
        const y = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (axis === 'x') return <Bar key={index} from={[-length / 2, y, z]} to={[length / 2, y, z]} thickness={0.022} color={color} kind={kind} castShadow={false} />;
        return null;
      })}
      <Rod radius={radius * 0.28} length={0.16} axis={axis === 'x' ? 'x' : 'y'} position={axis === 'x' ? [length / 2 + 0.07, 0, 0] : [0, length / 2 + 0.07, 0]} color={PALETTE.alu} kind="aluminium" />
    </group>
  );
}

/** 控制柜：柜体 + 门缝 + 屏幕 + 两颗指示灯。 */
export function Cabinet({
  size = [0.7, 1.5, 0.45],
  position,
  rotation,
  screen = true,
  color = PALETTE.panelFace,
  kind = 'steelPainted',
}: {
  size?: Vec3;
  position?: Vec3;
  rotation?: Vec3;
  screen?: boolean;
  color?: string;
  kind?: SurfaceKind;
}) {
  const [w, h, d] = size;
  return (
    <group position={position} rotation={rotation}>
      <Slab size={size} radius={0.03} color={color} kind={kind} />
      {[0.2, -0.2].map((offset) => (
        <Bar key={offset} from={[offset * w, -h / 2 + 0.02, d / 2]} to={[offset * w, h / 2 - 0.02, d / 2]} thickness={0.014} color={PALETTE.steelDark} kind="steelPainted" castShadow={false} />
      ))}
      <Slab size={[w * 0.62, h * 0.26, 0.03]} radius={0} position={[0, h * 0.24, d / 2 + 0.015]} color="#1d272c" kind="plastic" castShadow={false} />
      {screen && (
        <mesh position={[0, h * 0.24, d / 2 + 0.035]} castShadow={false}>
          <planeGeometry args={[w * 0.52, h * 0.19]} />
          <meshStandardMaterial {...glow(PALETTE.screen, 1.1)} />
        </mesh>
      )}
      <mesh position={[-w * 0.2, h * 0.06, d / 2 + 0.03]} castShadow={false}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial {...glow(PALETTE.ledRun, 2.2)} />
      </mesh>
      <mesh position={[-w * 0.05, h * 0.06, d / 2 + 0.03]} castShadow={false}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial {...glow(PALETTE.ledWait, 2.2)} />
      </mesh>
    </group>
  );
}

/** 设备状态灯：深色灯罩 + 会发光的灯芯，颜色随仿真状态变化。 */
export function StatusLamp({
  status,
  position,
  rotation,
  radius = 0.045,
  housing = true,
}: {
  status: keyof typeof STATUS_LED;
  position?: Vec3;
  rotation?: Vec3;
  radius?: number;
  housing?: boolean;
}) {
  const color = STATUS_LED[status];
  return (
    <group position={position} rotation={rotation}>
      {housing && <Rod radius={radius * 1.7} length={0.05} axis="z" color={PALETTE.panelFace} kind="steelPainted" castShadow={false} />}
      <mesh position={[0, 0, 0.03]} castShadow={false}>
        <sphereGeometry args={[radius, 10, 8]} />
        <meshStandardMaterial {...glow(color, 2.4)} />
      </mesh>
    </group>
  );
}

/** 检修梯：两侧边梁 + 踏棍。 */
export function Ladder({
  height,
  width = 0.42,
  position,
  rotation,
  color = PALETTE.steel,
}: {
  height: number;
  width?: number;
  position?: Vec3;
  rotation?: Vec3;
  color?: string;
}) {
  const rungs = Math.max(2, Math.round(height / 0.3));
  return (
    <group position={position} rotation={rotation}>
      {[-1, 1].map((side) => (
        <Bar key={side} from={[(side * width) / 2, 0, 0]} to={[(side * width) / 2, height, 0]} thickness={0.045} color={color} kind="steel" />
      ))}
      {Array.from({ length: rungs }, (_, index) => (
        <Rod key={index} radius={0.018} length={width} axis="x" position={[0, (height * (index + 1)) / (rungs + 1), 0]} color={color} kind="steel" castShadow={false} />
      ))}
    </group>
  );
}

/** 木托盘：3 根纵梁 + 5 块面板。 */
export function Pallet({
  size = [1.1, 0.14, 1.0],
  position,
  rotation,
}: {
  size?: Vec3;
  position?: Vec3;
  rotation?: Vec3;
}) {
  const [w, h, d] = size;
  const boards = 5;
  return (
    <group position={position} rotation={rotation}>
      {[-1, 0, 1].map((side) => (
        <Slab key={side} size={[w, h * 0.55, 0.09]} radius={0} position={[0, h * 0.27, (side * d) / 2.5]} color="#b9986a" kind="wood" />
      ))}
      {Array.from({ length: boards }, (_, index) => (
        <Slab
          key={index}
          size={[w, h * 0.28, d / (boards * 1.5)]}
          radius={0}
          position={[0, h * 0.82, -d / 2 + (d * (index + 0.5)) / boards]}
          color="#c8a878"
          kind="wood"
        />
      ))}
    </group>
  );
}
