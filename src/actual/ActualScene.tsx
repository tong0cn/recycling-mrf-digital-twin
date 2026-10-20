import {
  Component,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { ActualSimulation, openGate } from './engine';
import {
  CAPACITY,
  EQUIPMENT,
  MANUAL_PATH,
  MATERIALS,
  ROUTES,
  SMALL_GRADES,
  along,
  center,
  smallPosition,
  type EquipmentId,
  type Point,
} from './process';
import cad from './cad-layout.json';
import { batchPlant } from './cad';

export type CameraView = 'overview' | 'top' | 'focus';
interface Props {
  simulation: ActualSimulation;
  selected: EquipmentId;
  onSelect: (id: EquipmentId) => void;
  xray: boolean;
  paths: boolean;
  shell: boolean;
  view: CameraView;
}
function routeColor(id: string) {
  return id === 'air3A' || id === 'discharge3A'
    ? MATERIALS['3A'].color
    : id.includes('Mixed')
      ? MATERIALS.MIXED.color
      : id.includes('Misc') || id.includes('manual')
        ? '#e9bf75'
        : '#5adcb0';
}

function Plant({
  selected,
  onSelect,
  xray,
  shell,
  onLoad,
}: Pick<Props, 'selected' | 'onSelect' | 'xray' | 'shell'> & { onLoad: (text: string) => void }) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const roots = useRef(new Map<string, THREE.Object3D>());
  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Group | null = null;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      new URL('./actual-assets/plant-review.glb', document.baseURI).href,
      (gltf) => {
        loaded = gltf.scene;
        if (cancelled) return;
        let batched: THREE.Group;
        try {
          batched = batchPlant(gltf.scene);
        } catch {
          onLoad('CAD 解析失败，请检查本地模型；仿真与面板仍可操作。');
          return;
        }
        loaded = batched;
        // Materials are cloned per equipment instance; the original animation shares no objects.
        batched.traverse((object) => {
          if (!/^E\d{2}$/.test(object.name)) return;
          roots.current.set(object.name, object);
          const materials = new Map<string, THREE.MeshStandardMaterial>();
          object.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            const originals = Array.isArray(child.material) ? child.material : [child.material];
            const copies = originals.map((original) => {
              if (!materials.has(original.uuid)) materials.set(original.uuid, original.clone());
              return materials.get(original.uuid)!;
            });
            child.material = Array.isArray(child.material) ? copies : copies[0];
          });
        });
        setModel(batched);
        onLoad('已加载真实 CAD · 17 个设备已对应');
      },
      (progress) => {
        if (!cancelled && progress.total)
          onLoad(`正在加载真实 CAD ${Math.round((progress.loaded / progress.total) * 100)}%`);
      },
      () => {
        if (!cancelled)
          onLoad('CAD 加载失败，请检查 actual-assets/plant-review.glb；仿真与数据面板仍可使用。');
      },
    );
    return () => {
      cancelled = true;
      if (loaded)
        loaded.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) =>
              material.dispose(),
            );
          }
        });
    };
  }, [onLoad]);
  useEffect(() => {
    if (!model) return;
    for (const [id, root] of roots.current) {
      root.visible = id !== 'E01' || shell;
      const stock = ['E02', 'E03', 'E04', 'E05'].includes(id);
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.transparent = xray && id !== 'E01';
          material.opacity = xray && id !== 'E01' ? (stock ? 0.16 : 0.78) : 1;
          material.depthWrite = !material.transparent;
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.set(id === selected ? '#1a6354' : '#000000');
            material.emissiveIntensity = 0.32;
            material.roughness = Math.max(0.45, material.roughness);
          }
        }
      });
    }
  }, [model, xray, shell, selected]);
  if (!model) return null;
  return (
    <primitive
      object={model}
      onClick={(event: { object: THREE.Object3D; stopPropagation: () => void }) => {
        let object: THREE.Object3D | null = event.object;
        while (object && !(object.name in EQUIPMENT)) object = object.parent;
        if (object) {
          event.stopPropagation();
          onSelect(object.name as EquipmentId);
        }
      }}
    />
  );
}

function Bottles({ simulation }: Pick<Props, 'simulation'>) {
  const body = useRef<THREE.InstancedMesh>(null),
    neck = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D()),
    color = useRef(new THREE.Color()),
    direction = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  useFrame(() => {
    if (!body.current || !neck.current) return;
    let index = 0;
    for (const unit of simulation.current.units) {
      if (unit.stage !== 'moving' || index >= 2048) continue;
      const route = ROUTES[unit.route],
        p = along(route.points, unit.progress);
      const before = along(route.points, Math.max(0, unit.progress - 0.01));
      const after = along(route.points, Math.min(1, unit.progress + 0.01));
      direction.current.set(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
      if (direction.current.lengthSq() < 0.00001) direction.current.set(1, 0, 0);
      direction.current.normalize();
      const spread = ((unit.id % 3) - 1) * (route.mode === 'air' ? 0.04 : 0.15);
      p[0] += direction.current.z * spread;
      p[2] -= direction.current.x * spread;
      if (route.mode === 'screw') {
        p[0] += Math.cos(unit.progress * 28) * 0.08;
        p[1] += Math.sin(unit.progress * 28) * 0.08;
      }
      dummy.current.position.set(...p);
      dummy.current.quaternion.setFromUnitVectors(up.current, direction.current);
      dummy.current.updateMatrix();
      body.current.setMatrixAt(index, dummy.current.matrix);
      dummy.current.position.addScaledVector(direction.current, 0.23);
      dummy.current.updateMatrix();
      neck.current.setMatrixAt(index, dummy.current.matrix);
      color.current.set(MATERIALS[unit.grade].color);
      body.current.setColorAt(index, color.current);
      neck.current.setColorAt(index, color.current);
      index += 1;
    }
    for (const mesh of [body.current, neck.current]) {
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });
  return (
    <>
      <instancedMesh ref={body} args={[undefined, undefined, 2048]} frustumCulled={false} renderOrder={4}>
        <capsuleGeometry args={[0.115, 0.24, 3, 8]} />
        <meshStandardMaterial roughness={0.25} metalness={0.06} emissive="#ffffff" emissiveIntensity={0.15} />
      </instancedMesh>
      <instancedMesh ref={neck} args={[undefined, undefined, 2048]} frustumCulled={false} renderOrder={4}>
        <cylinderGeometry args={[0.045, 0.07, 0.12, 6]} />
        <meshStandardMaterial roughness={0.3} />
      </instancedMesh>
    </>
  );
}

const SILOS = ['E02', 'E03', 'E04', 'E05'] as const;
function SiloContents({ simulation, onSelect }: Pick<Props, 'simulation' | 'onSelect'>) {
  const fills = useRef(new Map<string, THREE.Mesh>()),
    gates = useRef(new Map<string, THREE.Mesh>());
  useFrame(() => {
    const state = simulation.current;
    for (const id of SILOS) {
      const mesh = fills.current.get(id),
        gate = gates.current.get(id);
      const amount = state.stocks[id].length,
        p = center(id);
      if (mesh) {
        const height = Math.max(0.04, (amount / CAPACITY) * 3.7);
        mesh.scale.y = height;
        mesh.position.set(p[0], 2.85 + height / 2, p[2]);
        mesh.visible = amount > 0;
      }
      if (gate) gate.position.x = p[0] + (openGate(state) === id ? 0.7 : 0);
    }
  });
  return (
    <>
      {SILOS.map((id) => {
        const p = center(id),
          color =
            id === 'E04'
              ? MATERIALS['3A'].color
              : id === 'E05'
                ? MATERIALS.MIXED.color
                : id === 'E03'
                  ? '#e7bd73'
                  : '#6cdcb2';
        return (
          <group key={id}>
            <mesh
              ref={(node) => {
                if (node) fills.current.set(id, node);
              }}
              renderOrder={2}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(id);
              }}
            >
              <boxGeometry args={[3.35, 1, 3.35]} />
              <meshStandardMaterial color={color} transparent opacity={0.8} roughness={0.9} />
            </mesh>
            {(id === 'E04' || id === 'E05') && (
              <mesh
                ref={(node) => {
                  if (node) gates.current.set(id, node);
                }}
                position={[p[0], 2.24, 11.3]}
                renderOrder={3}
              >
                <boxGeometry args={[1, 0.08, 0.8]} />
                <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

function DeltaRobot({ simulation }: Pick<Props, 'simulation'>) {
  const bars = useRef<(THREE.Mesh | null)[]>([]),
    gripper = useRef<THREE.Mesh>(null);
  const start = useRef(new THREE.Vector3()),
    end = useRef(new THREE.Vector3()),
    direction = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  useFrame(() => {
    const unit = simulation.current.units.find(
      (unit) => unit.stage === 'moving' && (unit.route === 'robotGreen' || unit.route === 'robotBrown'),
    );
    const returning = simulation.current.armReturn;
    const drop = returning ? smallPosition(returning.grade) : null;
    const point: Point = unit
      ? along(ROUTES[unit.route].points, unit.progress)
      : returning && drop
        ? along(
            [
              [drop[0], 1.9, drop[2]],
              [drop[0], 2.9, 5.9],
              [-4.475, 2.35, 5.329],
            ],
            returning.progress,
          )
        : [-4.475, 2.35, 5.329];
    end.current.set(...point);
    if (gripper.current) gripper.current.position.copy(end.current);
    bars.current.forEach((bar, index) => {
      if (!bar) return;
      const angle = (index * Math.PI * 2) / 3;
      start.current.set(-4.475 + Math.cos(angle) * 0.7, 3.45, 5.329 + Math.sin(angle) * 0.7);
      direction.current.copy(end.current).sub(start.current);
      bar.position.copy(start.current).add(end.current).multiplyScalar(0.5);
      bar.scale.y = direction.current.length();
      bar.quaternion.setFromUnitVectors(up.current, direction.current.normalize());
    });
  });
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(node) => {
            bars.current[i] = node;
          }}
          renderOrder={3}
        >
          <cylinderGeometry args={[0.035, 0.035, 1, 6]} />
          <meshStandardMaterial color="#62d9b2" metalness={0.55} roughness={0.3} />
        </mesh>
      ))}
      <mesh ref={gripper} renderOrder={4}>
        <boxGeometry args={[0.3, 0.1, 0.28]} />
        <meshStandardMaterial color="#163c38" />
      </mesh>
    </group>
  );
}

function Worker({ position, simulation }: { position: Point; simulation: ActualSimulation }) {
  const arm = useRef<THREE.Group>(null);
  useFrame(() => {
    if (arm.current) arm.current.rotation.z = Math.sin(simulation.current.motion.E14 * 3) * 0.5;
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.17, 10, 8]} />
        <meshStandardMaterial color="#e2c4aa" />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[0.4, 0.58, 0.26]} />
        <meshStandardMaterial color="#dfaa53" />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.14, 0.7, 0.16]} />
          <meshStandardMaterial color="#3b5262" />
        </mesh>
      ))}
      <group ref={arm} position={[0.24, 1.15, 0]}>
        <mesh position={[0.2, -0.1, 0]} rotation={[0, 0, -0.9]}>
          <boxGeometry args={[0.12, 0.52, 0.12]} />
          <meshStandardMaterial color="#e2c4aa" />
        </mesh>
      </group>
    </group>
  );
}

function SmallStocks({ simulation }: Pick<Props, 'simulation'>) {
  const fills = useRef(new Map<string, THREE.Mesh>());
  useFrame(() => {
    for (const grade of SMALL_GRADES) {
      const mesh = fills.current.get(grade);
      if (mesh) mesh.scale.y = Math.max(0.03, (simulation.current.stocks[grade].length / 24) * 0.5);
    }
  });
  return (
    <>
      {SMALL_GRADES.map((grade) => {
        const p = smallPosition(grade);
        return (
          <group key={grade} position={p}>
            <mesh position={[0, 0.28, 0]}>
              <boxGeometry args={[0.66, 0.56, 0.6]} />
              <meshStandardMaterial color="#53727e" wireframe />
            </mesh>
            <mesh
              ref={(node) => {
                if (node) fills.current.set(grade, node);
              }}
              position={[0, 0.12, 0]}
            >
              <boxGeometry args={[0.6, 1, 0.54]} />
              <meshStandardMaterial color={MATERIALS[grade].color} />
            </mesh>
          </group>
        );
      })}
      {[-4.8, -3.3, -1.9].map((z) => (
        <Worker key={z} position={[-4.25, 3.25, z]} simulation={simulation} />
      ))}
    </>
  );
}

function Packing({ simulation }: Pick<Props, 'simulation'>) {
  const platen = useRef<THREE.Mesh>(null),
    bales = useRef<THREE.InstancedMesh>(null),
    cart = useRef<THREE.Group>(null);
  const dummy = useRef(new THREE.Object3D()),
    color = useRef(new THREE.Color());
  useFrame(() => {
    const state = simulation.current,
      job = state.job;
    if (platen.current) {
      platen.current.visible = job?.phase === 'COMPRESSING';
      platen.current.position.x =
        0.8 - (job?.phase === 'COMPRESSING' ? Math.sin((job.elapsed / 6) * Math.PI) * 1.4 : 0);
    }
    if (cart.current) {
      cart.current.visible = job?.phase === 'MANUAL_TRANSFER';
      if (job?.phase === 'MANUAL_TRANSFER')
        cart.current.position.set(...along(MANUAL_PATH, job.elapsed / 14));
    }
    if (!bales.current) return;
    const visible = state.bales.slice(-24);
    visible.forEach((bale, index) => {
      const progress = Math.min(1, (state.time - bale.at) / 2);
      dummy.current.position.set(
        -5 + progress * (-1.2 - (index % 3)),
        1.6 + Math.floor(index / 6) * 0.7 * progress,
        1.85 + Math.floor((index % 6) / 3) * 1.1 * progress,
      );
      dummy.current.updateMatrix();
      bales.current!.setMatrixAt(index, dummy.current.matrix);
      color.current.set(MATERIALS[bale.grade].color);
      bales.current!.setColorAt(index, color.current);
    });
    bales.current.count = visible.length;
    bales.current.instanceMatrix.needsUpdate = true;
    if (bales.current.instanceColor) bales.current.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <mesh ref={platen} position={[0.8, 2.1, 1.84]} renderOrder={3}>
        <boxGeometry args={[0.2, 1.2, 1.2]} />
        <meshStandardMaterial color="#5bdec0" metalness={0.5} />
      </mesh>
      <instancedMesh ref={bales} args={[undefined, undefined, 24]} frustumCulled={false}>
        <boxGeometry args={[0.9, 0.65, 0.85]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <group ref={cart}>
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[0.9, 0.15, 1.2]} />
          <meshStandardMaterial color="#334e5d" />
        </mesh>
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[0.75, 0.7, 0.9]} />
          <meshStandardMaterial color="#dcb269" />
        </mesh>
        <Worker position={[-0.7, 0, 0]} simulation={simulation} />
      </group>
    </>
  );
}

function EquipmentMotion({ simulation }: Pick<Props, 'simulation'>) {
  const slats = useRef<THREE.InstancedMesh>(null),
    rotor = useRef<THREE.Group>(null),
    screw = useRef<THREE.Group>(null);
  const dummy = useRef(new THREE.Object3D());
  useFrame(() => {
    const state = simulation.current;
    if (rotor.current) rotor.current.rotation.z = state.motion.E12 * 5;
    if (screw.current) screw.current.rotation.z = state.motion.E11 * 7;
    if (!slats.current) return;
    let index = 0;
    for (const id of ['feed', 'manualIncline', 'incline2', 'chain', 'robotBelt'] as const) {
      const route = ROUTES[id],
        clock = state.motion[route.device];
      for (let slot = 0; slot < 12; slot += 1) {
        const progress = (slot / 12 + clock * 0.12) % 1;
        const p = along(route.points, progress),
          ahead = along(route.points, Math.min(1, progress + 0.01));
        dummy.current.position.set(p[0], p[1] - 0.18, p[2]);
        dummy.current.lookAt(ahead[0], ahead[1] - 0.18, ahead[2]);
        dummy.current.updateMatrix();
        slats.current.setMatrixAt(index++, dummy.current.matrix);
      }
    }
    slats.current.count = index;
    slats.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={slats} args={[undefined, undefined, 60]} frustumCulled={false} renderOrder={2}>
        <boxGeometry args={[0.58, 0.035, 0.08]} />
        <meshStandardMaterial color="#4b9f8a" transparent opacity={0.65} />
      </instancedMesh>
      <group position={[-8.05, 2.85, -3.3]}>
        <group ref={rotor}>
          <mesh>
            <torusGeometry args={[0.36, 0.025, 6, 20]} />
            <meshStandardMaterial color="#62dfb5" />
          </mesh>
          <mesh>
            <boxGeometry args={[0.68, 0.035, 0.035]} />
            <meshStandardMaterial color="#62dfb5" />
          </mesh>
        </group>
      </group>
      <group position={[-7.415, 3.2, -7.5]} rotation={[-0.54, 0, 0]}>
        <group ref={screw}>
          <mesh>
            <torusGeometry args={[0.2, 0.025, 6, 16]} />
            <meshStandardMaterial color="#62dfb5" />
          </mesh>
          <mesh>
            <boxGeometry args={[0.36, 0.025, 0.025]} />
            <meshStandardMaterial color="#62dfb5" />
          </mesh>
        </group>
      </group>
    </>
  );
}

function CameraRig({ selected, view }: Pick<Props, 'selected' | 'view'>) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null),
    clock = useRef(3);
  const desired = useRef(new THREE.Vector3()),
    target = useRef(new THREE.Vector3());
  const { camera, size } = useThree();
  useEffect(() => {
    const fit = Math.max(1, Math.min(1.5, size.height / Math.max(1, size.width)));
    target.current.set(-2.5, 2.5, -0.4);
    if (view === 'focus') {
      target.current.set(...center(selected));
      const b = cad[selected].bounds,
        span = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
      desired.current
        .copy(target.current)
        .add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(Math.max(9, span * 2.8) * fit));
    } else
      desired.current
        .copy(target.current)
        .add(
          view === 'top'
            ? new THREE.Vector3(0, 48 * fit, 0.01)
            : new THREE.Vector3(25 * fit, 25 * fit, 30 * fit),
        );
    clock.current = 0;
  }, [selected, view, size.width, size.height]);
  useFrame((_, delta) => {
    if (!controls.current || clock.current >= 2.8) return;
    clock.current += delta;
    const amount = 1 - Math.exp(-delta * 5);
    camera.position.lerp(desired.current, amount);
    controls.current.target.lerp(target.current, amount);
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      enableDamping
      minDistance={5}
      maxDistance={100}
      maxPolarAngle={Math.PI / 2.05}
      target={[-2.5, 2.5, -0.4]}
      onStart={() => {
        clock.current = 3;
      }}
    />
  );
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LabelProjector({
  simulation,
  selected,
  elements,
}: Pick<Props, 'simulation' | 'selected'> & { elements: RefObject<Map<string, HTMLElement>> }) {
  const { camera, size } = useThree();
  const vector = useRef(new THREE.Vector3());
  useFrame(() => {
    const occupied: { x: number; y: number }[] = [];
    for (const [id, element] of elements.current) {
      let point: Point;
      if (id === 'cart') {
        const job = simulation.current.job;
        element.hidden = job?.phase !== 'MANUAL_TRANSFER';
        if (element.hidden || !job) continue;
        point = along(MANUAL_PATH, job.elapsed / 14);
        point[1] += 2;
      } else if (SILOS.includes(id as (typeof SILOS)[number])) {
        point = center(id as EquipmentId);
        point[1] = 7.3;
        element.hidden = false;
      } else {
        const grade = SMALL_GRADES.find((grade) => grade === id);
        if (!grade) continue;
        element.hidden = !(
          (selected === 'E14' && !['GREEN', 'BROWN'].includes(grade)) ||
          (selected === 'E15' && ['GREEN', 'BROWN'].includes(grade))
        );
        if (element.hidden) continue;
        point = smallPosition(grade);
        point[1] += 0.9;
      }
      vector.current.set(...point).project(camera);
      if (
        vector.current.z < -1 ||
        vector.current.z > 1 ||
        Math.abs(vector.current.x) > 1.1 ||
        Math.abs(vector.current.y) > 1.1
      ) {
        element.hidden = true;
        continue;
      }
      const x = Math.max(55, Math.min(size.width - 55, ((vector.current.x + 1) / 2) * size.width));
      let y = Math.max(70, ((1 - vector.current.y) / 2) * size.height);
      while (occupied.some((p) => Math.abs(p.x - x) < 100 && Math.abs(p.y - y) < 25)) y -= 27;
      occupied.push({ x, y });
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    }
  });
  return null;
}

export default function ActualScene(props: Props) {
  const [loadState, setLoadState] = useState('正在加载真实 CAD…');
  const elements = useRef(new Map<string, HTMLElement>());
  return (
    <div className="actual-scene">
      <Canvas
        camera={{ position: [26.5, 31.5, 33.6], fov: 38, near: 0.1, far: 300 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        fallback={<p className="scene-error">浏览器不支持 WebGL；请使用设备列表和时间轴查看仿真。</p>}
      >
        <color attach="background" args={['#d3dce0']} />
        <hemisphereLight args={['#ffffff', '#758995', 2.2]} />
        <directionalLight position={[18, 30, 12]} intensity={2.7} color="#fff3df" />
        <directionalLight position={[-20, 12, -20]} intensity={0.7} color="#c4e3ff" />
        <SceneBoundary onError={() => setLoadState('三维画面暂不可用，仿真与面板仍可操作。')}>
          <Plant {...props} onLoad={setLoadState} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cad.E01.center[0], 1.16, cad.E01.center[2]]}>
            <planeGeometry
              args={[cad.E01.bounds[3] - cad.E01.bounds[0], cad.E01.bounds[5] - cad.E01.bounds[2]]}
            />
            <meshStandardMaterial color="#b9c8ce" roughness={0.95} />
          </mesh>
          <gridHelper
            args={[50, 50, '#8ea6b1', '#b0c0c8']}
            position={[cad.E01.center[0], 1.175, cad.E01.center[2]]}
          />
          {props.paths &&
            Object.entries(ROUTES).map(([id, route]) => (
              <Line
                key={id}
                points={route.points}
                color={routeColor(id)}
                lineWidth={1.6}
                transparent
                opacity={0.35}
                depthTest={false}
              />
            ))}
          <Bottles simulation={props.simulation} />
          <SiloContents {...props} />
          <DeltaRobot simulation={props.simulation} />
          <SmallStocks {...props} />
          <Packing simulation={props.simulation} />
          <EquipmentMotion simulation={props.simulation} />
          <CameraRig selected={props.selected} view={props.view} />
          <LabelProjector simulation={props.simulation} selected={props.selected} elements={elements} />
        </SceneBoundary>
      </Canvas>
      <div className="actual-projected-labels">
        {SILOS.map((id) => (
          <button
            key={id}
            ref={(node) => {
              if (node) elements.current.set(id, node);
              else elements.current.delete(id);
            }}
            className="silo-label"
            onClick={() => props.onSelect(id)}
          >
            <i
              style={{
                background:
                  id === 'E04'
                    ? MATERIALS['3A'].color
                    : id === 'E05'
                      ? MATERIALS.MIXED.color
                      : id === 'E03'
                        ? '#e7bd73'
                        : '#6cdcb2',
              }}
            />
            {id} · {id === 'E02' ? '三色中转' : id === 'E03' ? '杂瓶中转' : id === 'E04' ? '3A' : '杂色 PET'}
          </button>
        ))}
        {SMALL_GRADES.map((grade) => (
          <span
            key={grade}
            ref={(node) => {
              if (node) elements.current.set(grade, node);
              else elements.current.delete(grade);
            }}
            className="stock-label"
            hidden
          >
            {MATERIALS[grade].name}
          </span>
        ))}
        <span
          ref={(node) => {
            if (node) elements.current.set('cart', node);
            else elements.current.delete('cart');
          }}
          className="stock-label"
          hidden
        >
          人工转运至打包机
        </span>
      </div>
      <div className="model-status">
        <span />
        {loadState}
      </div>
      <div className="scene-instruction">拖动旋转 · 滚轮缩放 · 点击设备聚焦</div>
    </div>
  );
}
