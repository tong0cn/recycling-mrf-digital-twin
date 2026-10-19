import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { PALETTE } from './palette';

export interface PostFXProps {
  /** 关掉时完全跳过后处理，方便对照与低端设备降级。 */
  enabled: boolean;
}

/**
 * 轻量后处理：Bloom 只吃自发光件（指示灯、灯带、屏幕、灯罩），暗角把视线收回到厂房中心。
 * 阈值取得比普通表面亮度高，避免浅色地坪/墙板一起发光。
 */
export default function PostFX({ enabled }: PostFXProps) {
  if (!enabled) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.5} luminanceThreshold={0.82} luminanceSmoothing={0.22} mipmapBlur radius={0.62} />
      <Vignette offset={0.28} darkness={0.52} />
    </EffectComposer>
  );
}

export const POSTFX_BACKGROUND = PALETTE.background;
