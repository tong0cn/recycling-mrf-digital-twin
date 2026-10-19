import type { MeshStandardMaterialParameters } from 'three';

/**
 * 表面类型 → PBR 参数。颜色一律从 `palette.ts` 取，这里只描述「这是什么材质」。
 *
 * 用法：`<meshStandardMaterial {...surface('steel', PALETTE.steel)} />`
 *
 * 之所以不返回材质实例而是返回参数对象，是为了保留 R3F 的元素生命周期
 * （共享实例在卸载时会被误释放），同时让全场景的粗糙度/金属度有唯一口径。
 */
export type SurfaceKind =
  | 'concrete'
  | 'floorPaint'
  | 'steel'
  | 'steelPainted'
  | 'aluminium'
  | 'rubber'
  | 'plastic'
  | 'glass'
  | 'wood'
  | 'cardboard'
  | 'fabric'
  | 'lamp'
  | 'screen';

const SURFACE: Record<SurfaceKind, Omit<MeshStandardMaterialParameters, 'color'>> = {
  /* 地坪与土建 */
  concrete: { roughness: 0.93, metalness: 0.02, envMapIntensity: 0.45 },
  floorPaint: { roughness: 0.6, metalness: 0.03, envMapIntensity: 0.7 },
  /* 金属 */
  steel: { roughness: 0.44, metalness: 0.82, envMapIntensity: 1.15 },
  steelPainted: { roughness: 0.5, metalness: 0.2, envMapIntensity: 0.9 },
  aluminium: { roughness: 0.26, metalness: 0.9, envMapIntensity: 1.3 },
  /* 软硬材料 */
  rubber: { roughness: 0.88, metalness: 0, envMapIntensity: 0.4 },
  plastic: { roughness: 0.54, metalness: 0.05, envMapIntensity: 0.8 },
  glass: { roughness: 0.12, metalness: 0.08, envMapIntensity: 1.4, transparent: true, opacity: 0.42 },
  wood: { roughness: 0.78, metalness: 0, envMapIntensity: 0.5 },
  cardboard: { roughness: 0.92, metalness: 0, envMapIntensity: 0.3 },
  fabric: { roughness: 0.96, metalness: 0, envMapIntensity: 0.28 },
  /* 灯具与屏幕：自发光不参与光照计算，靠 Bloom 出光晕 */
  lamp: { roughness: 0.4, metalness: 0, emissiveIntensity: 1.6 },
  screen: { roughness: 0.3, metalness: 0.1, emissiveIntensity: 0.9 },
};

export function surface(
  kind: SurfaceKind,
  color: string,
  overrides: MeshStandardMaterialParameters = {},
): MeshStandardMaterialParameters {
  return { ...SURFACE[kind], color, ...overrides };
}

/** 自发光件：亮到 Bloom 阈值以上才会起光晕，因此强度默认给足。 */
export function glow(color: string, emissiveIntensity = 1.8): MeshStandardMaterialParameters {
  return { color, emissive: color, emissiveIntensity, roughness: 0.35, metalness: 0, toneMapped: false };
}
