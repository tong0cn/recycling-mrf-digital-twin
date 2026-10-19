import type { ReactNode } from 'react';
import type { Point } from '../types';
import { dist } from '../spatial/layout';

export interface BeltMeshGeometry {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  length: number;
}

/**
 * Belt transform derived from the same two anchors the simulation uses for travel distance and
 * for the unit ramp height, so drawn packages always sit on the drawn belt.
 */
export function beltMesh(from: Point, to: Point, fromY: number, toY: number, width: number): BeltMeshGeometry & { width: number } {
  const run = Math.hypot(to.x - from.x, to.z - from.z);
  return {
    position: [(from.x + to.x) / 2, (fromY + toY) / 2, (from.z + to.z) / 2],
    yaw: Math.atan2(to.x - from.x, to.z - from.z),
    pitch: -Math.atan2(toY - fromY, run || 1),
    length: dist(from, to),
    width,
  };
}

export interface DeviceShellProps {
  selected: boolean;
  onSelect: () => void;
  /** Full bounding size [width, height, depth] used for pick highlighting. */
  size: [number, number, number];
  position: [number, number, number];
  children: ReactNode;
}

/** Click target plus the selection outline used to link the list, the scene and the panel. */
export function DeviceShell({ selected, onSelect, size, position, children }: DeviceShellProps) {
  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {children}
      {selected && (
        <mesh position={[0, size[1] / 2, 0]}>
          <boxGeometry args={size} />
          <meshBasicMaterial color="#f1b85c" wireframe transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}
