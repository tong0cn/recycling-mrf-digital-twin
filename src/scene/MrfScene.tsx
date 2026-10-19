import { Component, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import type { CameraMode, DeviceId, ViewMode } from '../types';
import { DEVICE_SPEC_BY_ID, MATERIAL_META } from '../simulation/data';
import { PLANT } from '../spatial/layout';
import { SORTABLE_GRADES } from '../types';
import { useSimulation } from '../simulation/context';
import Environment from './Environment';
import Factory from './Factory';
import Lines from './Lines';
import PostFX from './PostFX';
import Vehicles, { AirPuff } from './Vehicles';
import { PALETTE } from './palette';
import { DEVICE_ANCHORS, FOCUS_OFFSET } from './anchors';

export interface SceneProps {
  selected: DeviceId | null;
  onSelect: (id: DeviceId | null) => void;
  viewMode: ViewMode;
  cameraMode: CameraMode;
  onCameraMode: (mode: CameraMode) => void;
  reducedMotion: boolean;
}

const CAMERA_LABEL: Record<CameraMode, string> = {
  overview: '俯瞰全厂',
  focus: '跟随选中设备',
  free: '自由视角',
};

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

const OVERVIEW_POSITION = new Vector3(37, 32, 43);

interface RigProps {
  target: [number, number, number];
  pull: boolean;
  cameraMode: CameraMode;
}

/** Camera rig: the overview target is the plant centre, focus follows the selected object. */
function CameraRig({ target, pull, cameraMode }: RigProps) {
  const controls = useRef<any>(null);
  const { camera, size } = useThree();
  const desired = useRef(new Vector3(0, 0, 0));
  const lastKey = useRef('');
  const elapsed = useRef(0);
  const offset = useRef(new Vector3(FOCUS_OFFSET.x, FOCUS_OFFSET.y, FOCUS_OFFSET.z));
  // 竖屏（手机）下水平视角只有纵向的一半左右，按原距离取景会把厂房右侧切掉。
  // 这里按宽高比把全局视角整体拉远，横屏（宽高比 ≥ 1）保持原样不受影响。
  const fit = size.width > 0 && size.height > 0 ? Math.min(1.6, Math.max(1, 1 / (size.width / size.height))) : 1;
  const appliedFit = useRef(1);
  // 自由视角下相机由用户拖拽控制，本 hook 提前返回；回到俯瞰时必须重新起算动画窗口，
  // 否则 elapsed 还停在上一轮的终值，机位永远不会被拉回去。
  const prevMode = useRef(cameraMode);

  useFrame((_, delta) => {
    const control = controls.current;
    if (!control) return;
    if (cameraMode === 'free') {
      prevMode.current = cameraMode;
      return;
    }
    if (prevMode.current !== cameraMode) {
      prevMode.current = cameraMode;
      lastKey.current = '';
      elapsed.current = 0;
    }
    const key = `${cameraMode}:${target.join(',')}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      elapsed.current = 0;
      desired.current.set(target[0], target[1], target[2]);
    }
    elapsed.current += delta;
    control.target.lerp(desired.current, 0.1);
    if (cameraMode === 'overview' && elapsed.current < 3) {
      // 「俯瞰全厂」要真的把机位拉回去：只改视点会让相机停在上一个设备旁边，切回俯瞰时看到的仍是近景。
      camera.position.lerp(OVERVIEW_POSITION, 0.07);
    }
    if (pull && elapsed.current < 3) {
      // 机位从厂房中心的一侧斜看过去：设备在南半区就从北侧看、在东半区就从西侧看，
      // 否则相机会被推到墙外，正好被 0.32 m 的檐柱挡在画面正中间。
      const signX = desired.current.x > 0 ? -1 : 1;
      const signZ = desired.current.z > 2.5 ? -1 : 1;
      offset.current.set(FOCUS_OFFSET.x * signX, FOCUS_OFFSET.y, FOCUS_OFFSET.z * signZ);
      camera.position.lerp(desired.current.clone().add(offset.current), 0.07);
    }
    if (Math.abs(appliedFit.current - fit) > 0.01) {
      const view = camera.position.clone().sub(control.target);
      camera.position.copy(control.target).add(view.setLength(view.length() * (fit / appliedFit.current)));
      appliedFit.current = fit;
    }
    control.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={80}
      maxPolarAngle={Math.PI / 2.2}
      target={[0, 0, 0]}
    />
  );
}

function SceneContents({ selected, onSelect, viewMode, cameraMode, reducedMotion }: SceneProps) {
  const simulation = useSimulation();
  const state = simulation.current;
  // 取景中心略向南偏：园区前场（货车停靠与地磅）也算画面的一部分，但主体仍是厂房。
  const target: [number, number, number] = selected ? DEVICE_ANCHORS[selected] : [0, 0.4, -3.2];

  return (
    <>
      {/* 三点光：暖色主光负责投影与体积，冷色轮廓光把设备从浅色背景里分出来，暖补光填暗部。
          补光都刻意压低：只有主光投影，补光一强阴影就会被冲掉。 */}
      <hemisphereLight args={[PALETTE.lampCool, PALETTE.plinthSide, 0.24]} />
      <directionalLight
        castShadow
        color="#fff0d6"
        intensity={3.6}
        position={[26, 34, 20]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
      />
      <directionalLight color="#a8dcff" intensity={0.42} position={[-24, 18, -16]} />
      <directionalLight color="#ffd9a8" intensity={0.3} position={[8, 12, -26]} />
      <ambientLight intensity={0.1} />
      <Environment intensity={0.3} />

      <Factory onBackground={() => onSelect(null)} xray={viewMode === 'xray'} />
      <Lines state={state} selected={selected} onSelect={onSelect} viewMode={viewMode} />
      <Vehicles selected={selected} onSelect={onSelect} />

      <AirPuff device="SORTER_1" position={[PLANT.sorter1.x, 2.5, PLANT.sorter1.z]} reduced={reducedMotion} />
      <AirPuff device="SORTER_2" position={[PLANT.sorter2.x, 2.4, PLANT.sorter2.z]} reduced={reducedMotion} />

      {selected && viewMode === 'xray' && (
        <Html center position={[target[0], target[1] + 1.9, target[2]]} distanceFactor={22}>
          <span className="device-label">{DEVICE_SPEC_BY_ID[selected].name}</span>
        </Html>
      )}

      <CameraRig cameraMode={cameraMode} pull={cameraMode === 'focus'} target={target} />
    </>
  );
}

export default function MrfScene({ selected, onSelect, viewMode, cameraMode, onCameraMode, reducedMotion }: SceneProps) {
  const [failed, setFailed] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  return (
    <div className="scene-root">
      {!failed && (
        <Canvas
          camera={{ position: [37, 32, 43], fov: 38, near: 0.5, far: 300 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, powerPreference: 'high-performance', toneMappingExposure: 1.08 }}
          shadows="soft"
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            canvas.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              setContextLost(true);
            });
            canvas.addEventListener('webglcontextrestored', () => setContextLost(false));
          }}
        >
          <color attach="background" args={[PALETTE.background]} />
          <fogExp2 attach="fog" args={[PALETTE.fogLight, 0.0034]} />
          <SceneBoundary onError={() => setFailed(true)}>
            <SceneContents
              cameraMode={cameraMode}
              onCameraMode={onCameraMode}
              onSelect={onSelect}
              reducedMotion={reducedMotion}
              selected={selected}
              viewMode={viewMode}
            />
            {/* 后处理单独进边界：合成器初始化失败时仍保留纯灯光渲染。 */}
            <PostFX enabled />
          </SceneBoundary>
        </Canvas>
      )}

      <p className="scene-hint">拖动旋转 · 滚轮缩放 · 点击设备查看状态与读数</p>

      <div className="camera-buttons" role="group" aria-label="相机视角">
        {(Object.keys(CAMERA_LABEL) as CameraMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={cameraMode === mode ? 'is-active' : ''}
            aria-pressed={cameraMode === mode}
            onClick={() => onCameraMode(mode)}
            disabled={mode === 'focus' && !selected}
          >
            {CAMERA_LABEL[mode]}
          </button>
        ))}
      </div>

      <div className="scene-legend">
        {SORTABLE_GRADES.map((grade) => (
          <span key={grade}>
            <i style={{ background: MATERIAL_META[grade].color }} />
            {MATERIAL_META[grade].short}
          </span>
        ))}
        <span>
          <i style={{ background: MATERIAL_META.CARDBOARD.color }} />
          纸板
        </span>
        <span>
          <i style={{ background: MATERIAL_META.MISC.color }} />
          杂项
        </span>
      </div>

      {contextLost && (
        <div className="scene-overlay" role="status">
          <p>
            浏览器图形上下文中断，三维画面已暂停更新。仿真与看板数据仍在运行，
            恢复后画面会自动继续；若长时间不恢复，可刷新页面。
          </p>
        </div>
      )}

      {failed && (
        <div className="scene-overlay" role="alert">
          <p>
            三维场景初始化失败，可能是浏览器不支持 WebGL 或硬件加速被关闭。
            设备列表、状态读数与生产看板仍可正常使用；也可以刷新页面重试。
          </p>
        </div>
      )}
    </div>
  );
}
