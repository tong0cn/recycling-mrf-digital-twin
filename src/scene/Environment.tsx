import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface EnvironmentProps {
  /** 环境光强度：这是金属/塑料产生层次的关键，暗了发闷、亮了发灰。 */
  intensity?: number;
}

/**
 * 程序化 IBL：用 three 自带 examples 的 RoomEnvironment（纯代码搭出来的房间几何）经
 * PMREM 预卷积成环境贴图，挂到 `scene.environment`。
 *
 * 这一步不需要任何 HDR 文件或在线资源，但能让 `metalness` 真正有东西可反射 ——
 * 缺了它，金属与塑料在画面上长得一模一样，这是「廉价感」最大的来源。
 */
export default function Environment({ intensity = 0.45 }: EnvironmentProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (typeof gl?.getRenderTarget !== 'function') return;
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    let target: ReturnType<PMREMGenerator['fromScene']> | null = null;
    try {
      target = generator.fromScene(room, 0.04);
      scene.environment = target.texture;
      scene.environmentIntensity = intensity;
    } catch {
      // 环境贴图只是增强项；生成失败时保持纯灯光渲染，不影响其余画面与交互。
      return;
    }
    return () => {
      scene.environment = null;
      target?.dispose();
      generator.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
}
