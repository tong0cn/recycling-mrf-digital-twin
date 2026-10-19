import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import { AISLE, DOCKS, FACTORY, PLANT } from '../spatial/layout';
import { Bar, BoltRow, Louver, Rail, Rod, Slab, Truss, type Vec3 } from './kit';
import { glow } from './materials';
import { PALETTE } from './palette';
import { concreteFloor, corrugatedPanel, epoxyFloor, hazardStripe, textDecal } from './textures';

export interface FactoryProps {
  xray: boolean;
  /** Clicking floor or wall clears the current selection. */
  onBackground: () => void;
}

const ZONES: { key: string; x: number; z: number; w: number; d: number; label: string }[] = [
  { key: 'staging', x: PLANT.staging.x, z: PLANT.staging.z, w: PLANT.staging.w, d: PLANT.staging.d, label: '原料缓存区' },
  { key: 'cardboard', x: PLANT.storageCardboard.x, z: PLANT.storageCardboard.z, w: PLANT.storageCardboard.w, d: PLANT.storageCardboard.d, label: '纸板存储区' },
  { key: 'misc', x: PLANT.storageMisc.x, z: PLANT.storageMisc.z, w: PLANT.storageMisc.w, d: PLANT.storageMisc.d, label: '杂项存储区' },
  { key: 'outbound', x: PLANT.outboundStage.x, z: PLANT.outboundStage.z, w: PLANT.outboundStage.w, d: PLANT.outboundStage.d, label: '成品缓存区' },
];

const DOCK_LIST: { key: string; x: number; z: number; label: string }[] = [
  { key: 'in1', x: DOCKS.IN_1.x, z: DOCKS.IN_1.z, label: '进货月台 01' },
  { key: 'in2', x: DOCKS.IN_2.x, z: DOCKS.IN_2.z, label: '进货月台 02' },
  { key: 'out', x: DOCKS.OUT.x, z: DOCKS.OUT.z, label: '出货月台 03' },
];

/**
 * 厂房外壳、地面做法与分区。
 *
 * 相较最初的「地板 + 四面墙」版本，这里补齐了让画面读起来像实体工厂的部分：
 * 沙盘底座、混凝土地坪与环氧通道划线、分区色块、钢柱、屋面桁架与檩条采光带、
 * 三组卷帘门与卸货雨棚、防撞柱、防护栏杆、月台标识板与吊顶灯带。
 * 墙面板缝与肋条只在屋顶实体时出现，透视模式下把画面让给设备与物料。
 */
export default function Factory({ xray, onBackground }: FactoryProps) {
  const width = FACTORY.maxX - FACTORY.minX;
  const depth = FACTORY.maxZ - FACTORY.minZ;
  const centerX = (FACTORY.minX + FACTORY.maxX) / 2;
  const centerZ = (FACTORY.minZ + FACTORY.maxZ) / 2;
  const wallOpacity = xray ? 0.14 : 0.96;
  const wallTop = FACTORY.roofY;

  /* 钢柱：四周等距布置，透视模式下也保留，作为厂房尺度的参照。 */
  const columnStep = 6.5;
  const columnCount = Math.max(2, Math.round(width / columnStep));
  const columns: Vec3[] = [
    ...Array.from({ length: columnCount + 1 }, (_, index): Vec3 => [FACTORY.minX + (width * index) / columnCount, 0, FACTORY.minZ]),
    ...Array.from({ length: columnCount + 1 }, (_, index): Vec3 => [FACTORY.minX + (width * index) / columnCount, 0, FACTORY.maxZ]),
  ];

  /* 墙板竖向肋条：只在长边做，短边靠贴图表现，省下几十个 mesh。 */
  const ribStep = 2.5;
  const ribCount = Math.round(width / ribStep);
  const ribs: Vec3[] = [
    ...Array.from({ length: ribCount + 1 }, (_, index): Vec3 => [FACTORY.minX + (width * index) / ribCount, 0, FACTORY.minZ]),
    ...Array.from({ length: ribCount + 1 }, (_, index): Vec3 => [FACTORY.minX + (width * index) / ribCount, 0, FACTORY.maxZ]),
  ];

  /* 程序化贴图：地面按 4 m 一铺、通道按 1 m、墙板按 16 肋一张，全部运行时画好并缓存。 */
  const maps = useMemo(
    () => ({
      floor: concreteFloor(Math.round(width / 4), Math.round(depth / 4)),
      aisle: epoxyFloor(Math.round(width / 3), 1),
      apron: concreteFloor(Math.round(width / 5), 1),
      wallLong: corrugatedPanel(Math.round(width / 2.6), Math.max(1, Math.round(wallTop / 4))),
      wallShort: corrugatedPanel(Math.round(depth / 2.6), Math.max(1, Math.round(wallTop / 4))),
      hazard: hazardStripe(4, 1),
      plinth: concreteFloor(Math.round((width + 2.4) / 4), Math.round((depth + 2.4) / 4)),
      zone: (label: string) => textDecal(label, { color: '#5d666b', fontScale: 0.5, ratio: Math.max(3, label.length * 0.62) }),
      sign: textDecal('RELOOP MRF', { color: '#f5c62d', fontScale: 0.62, ratio: 8 }),
    }),
    [width, depth, wallTop],
  );

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onBackground();
      }}
    >
      {/* ---------- 沙盘底座：让整座工厂像放在台面上的模型 ---------- */}
      <Slab
        size={[width + 2.4, 0.7, depth + 2.4]}
        radius={0}
        position={[centerX, -0.55, centerZ]}
        color={PALETTE.plinthSide}
        kind="concrete"
        map={maps.plinth}
        castShadow={false}
      />
      <Slab
        size={[width + 1.4, 0.06, depth + 1.4]}
        radius={0.08}
        position={[centerX, -0.18, centerZ]}
        color={PALETTE.plinthTop}
        kind="concrete"
        castShadow={false}
      />

      {/* ---------- 园区前场：货车停靠、倒车与地磅都在这里，不再挤进厂房 ---------- */}
      <Slab
        size={[width + 2.4, 0.62, 19.4]}
        radius={0}
        position={[centerX, -0.37, FACTORY.minZ - 9.0]}
        color={PALETTE.yard}
        kind="concrete"
        map={maps.plinth}
        castShadow={false}
        receiveShadow
      />
      {/* 车道中心虚线：进出各一条，接到三个月台 */}
      {[DOCKS.IN_1.x, DOCKS.IN_2.x, DOCKS.OUT.x].map((x) =>
        Array.from({ length: 7 }, (_, index) => (
          <Slab
            key={`lane${x}-${index}`}
            size={[0.16, 0.02, 1.1]}
            radius={0}
            position={[x, -0.05, FACTORY.minZ - 1.6 - index * 2.3]}
            color={PALETTE.aisleLine}
            kind="floorPaint"
            castShadow={false}
          />
        )),
      )}

      {/* ---------- 地坪 ---------- */}
      <Slab
        size={[width, 0.24, depth]}
        radius={0}
        position={[centerX, -0.12, centerZ]}
        color={PALETTE.hallFloor}
        kind="concrete"
        map={maps.floor}
        receiveShadow
        castShadow={false}
      />
      {/* 主通道：环氧地坪 + 两侧安全黄划线 */}
      <Slab
        size={[width - 0.6, 0.02, AISLE.halfWidth * 2]}
        radius={0}
        position={[centerX, 0.012, AISLE.z]}
        color={PALETTE.aisle}
        kind="floorPaint"
        map={maps.aisle}
        receiveShadow
        castShadow={false}
      />
      {[-1, 1].map((side) => (
        <Slab
          key={`aisle-line${side}`}
          size={[width - 0.6, 0.012, 0.1]}
          radius={0}
          position={[centerX, 0.026, AISLE.z + side * (AISLE.halfWidth - 0.07)]}
          color={PALETTE.aisleLine}
          kind="floorPaint"
          receiveShadow
          castShadow={false}
        />
      ))}
      {/* 装卸货地坪：深一号的混凝土 + 门口斑马线 */}
      <Slab
        size={[width - 1.2, 0.02, 3.4]}
        radius={0}
        position={[centerX, 0.011, FACTORY.minZ + 1.7]}
        color={PALETTE.apron}
        kind="concrete"
        map={maps.apron}
        receiveShadow
        castShadow={false}
      />
      {DOCK_LIST.map((dock) =>
        Array.from({ length: 5 }, (_, index) => (
          <Slab
            key={`${dock.key}-stripe${index}`}
            size={[0.42, 0.012, 1.5]}
            radius={0}
            position={[dock.x - 1.2 + index * 0.62, 0.028, FACTORY.minZ + 1.5]}
            rotation={[0, 0.42, 0]}
            color={PALETTE.stripeWhite}
            kind="floorPaint"
            receiveShadow
            castShadow={false}
          />
        )),
      )}

      {/* ---------- 功能分区色块 ---------- */}
      {ZONES.map((zone) => (
        <group key={zone.key} position={[zone.x, 0, zone.z]}>
          <Slab
            size={[zone.w, 0.016, zone.d]}
            radius={0}
            position={[0, 0.014, 0]}
            color={PALETTE.zonePlate}
            kind="concrete"
            receiveShadow
            castShadow={false}
          />
          {[
            { size: [zone.w, 0.01, 0.07] as Vec3, pos: [0, 0.026, zone.d / 2 - 0.035] as Vec3 },
            { size: [zone.w, 0.01, 0.07] as Vec3, pos: [0, 0.026, -zone.d / 2 + 0.035] as Vec3 },
            { size: [0.07, 0.01, zone.d] as Vec3, pos: [zone.w / 2 - 0.035, 0.026, 0] as Vec3 },
            { size: [0.07, 0.01, zone.d] as Vec3, pos: [-zone.w / 2 + 0.035, 0.026, 0] as Vec3 },
          ].map((edge, index) => (
            <Slab
              key={index}
              size={edge.size}
              radius={0}
              position={edge.pos}
              color={PALETTE.aisleLine}
              kind="floorPaint"
              receiveShadow
              castShadow={false}
            />
          ))}
          {/* 地面分区名：像真实车间一样刷在地上；悬浮标签只在透视模式下显示，
              否则实体屋顶会让它们浮在屋面上。 */}
          {xray && (
            <Html position={[0, 0.24, zone.d / 2 - 0.2]} center distanceFactor={22} className="zone-label">
              <span>{zone.label}</span>
            </Html>
          )}
          {/* 地面分区名：像真实车间一样刷在地上 */}
          <mesh position={[0, 0.024, -zone.d / 2 + 0.75]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
            <planeGeometry args={[zone.w * 0.62, zone.w * 0.19]} />
            <meshStandardMaterial map={maps.zone(zone.label)} transparent opacity={0.72} roughness={0.9} depthWrite={false} />
          </mesh>
        </group>
      ))}

      {/* ---------- 钢柱 ---------- */}
      {columns.map((position, index) => (
        <group key={`col${index}`} position={[position[0], 0, position[2]]}>
          <Rod radius={0.16} length={wallTop} position={[0, wallTop / 2, 0]} color={PALETTE.column} kind="steelPainted" />
          <Slab size={[0.5, 0.16, 0.5]} radius={0.03} position={[0, 0.08, 0]} color={PALETTE.steelDark} kind="steelPainted" />
          <Slab size={[0.44, 0.22, 0.44]} radius={0.03} position={[0, wallTop - 0.5, 0]} color={PALETTE.steelDark} kind="steelPainted" castShadow={false} />
          <BoltRow count={4} spacing={0.16} position={[0, wallTop - 0.3, 0.23]} radius={0.028} />
        </group>
      ))}

      {/* ---------- 墙板（透视模式下淡出） ---------- */}
      <group>
        <Slab
          size={[width, wallTop, 0.24]}
          radius={0}
          position={[centerX, wallTop / 2, FACTORY.minZ]}
          color={PALETTE.wallPanel}
          kind="steelPainted"
          map={maps.wallLong}
          opacity={wallOpacity}
          castShadow={!xray}
        />
        <Slab
          size={[width, wallTop, 0.24]}
          radius={0}
          position={[centerX, wallTop / 2, FACTORY.maxZ]}
          color={PALETTE.wallPanel}
          kind="steelPainted"
          map={maps.wallLong}
          opacity={wallOpacity}
          castShadow={!xray}
        />
        <Slab
          size={[0.24, wallTop, depth]}
          radius={0}
          position={[FACTORY.minX, wallTop / 2, centerZ]}
          color={PALETTE.wallPanelDark}
          kind="steelPainted"
          map={maps.wallShort}
          opacity={wallOpacity}
          castShadow={!xray}
        />
        <Slab
          size={[0.24, wallTop, depth]}
          radius={0}
          position={[FACTORY.maxX, wallTop / 2, centerZ]}
          color={PALETTE.wallPanelDark}
          kind="steelPainted"
          map={maps.wallShort}
          opacity={wallOpacity}
          castShadow={!xray}
        />
        {/* 墙板横向板缝与竖向肋条：透视模式下省掉，避免和柱子一起织成一张网 */}
        {!xray && (
          <group>
            {[0.34, 0.62, 0.86].map((ratio) => (
              <group key={ratio}>
                <Slab
                  size={[width, 0.07, 0.3]}
                  radius={0}
                  position={[centerX, wallTop * ratio, FACTORY.minZ]}
                  color={PALETTE.wallPanelDark}
                  kind="steelPainted"
                  castShadow={false}
                />
                <Slab
                  size={[width, 0.07, 0.3]}
                  radius={0}
                  position={[centerX, wallTop * ratio, FACTORY.maxZ]}
                  color={PALETTE.wallPanelDark}
                  kind="steelPainted"
                  castShadow={false}
                />
              </group>
            ))}
            {ribs.map((position, index) => (
              <Rod
                key={`rib${index}`}
                radius={0.045}
                length={wallTop}
                position={[position[0], wallTop / 2, position[2] + (position[2] < 0 ? 0.14 : -0.14)]}
                color={PALETTE.wallRib}
                kind="steelPainted"
                castShadow={false}
              />
            ))}
          </group>
        )}
      </group>

      {/* ---------- 屋面结构：桁架 + 檩条（只在屋顶实体时出现，透视模式下把画面让给设备） ---------- */}
      {!xray && (
        <group>
          {Array.from({ length: 5 }, (_, index) => (
            <group key={`truss${index}`} position={[centerX, FACTORY.roofY - 0.98, FACTORY.minZ + (depth * (index + 0.5)) / 5]}>
              <Truss span={width} height={0.9} bays={6} thickness={0.09} color={PALETTE.structure} />
            </group>
          ))}
          {Array.from({ length: 6 }, (_, index) => {
            const x = FACTORY.minX + (width * index) / 5;
            return (
              <Bar
                key={`purlin${index}`}
                from={[x, FACTORY.roofY - 0.05, FACTORY.minZ]}
                to={[x, FACTORY.roofY - 0.05, FACTORY.maxZ]}
                thickness={0.1}
                color={PALETTE.structure}
                castShadow={false}
              />
            );
          })}
          {/* 两道采光带 */}
          {[-1, 1].map((side) => (
            <Slab
              key={`skylight${side}`}
              size={[4.2, 0.06, depth - 1.2]}
              radius={0.02}
              position={[centerX + side * 8, FACTORY.roofY + 0.03, centerZ]}
              color={PALETTE.roofLight}
              kind="plastic"
              opacity={0.62}
              castShadow={false}
            />
          ))}
          <Slab
            size={[width + 0.5, 0.2, depth + 0.5]}
            radius={0}
            position={[centerX, FACTORY.roofY + 0.14, centerZ]}
            color={PALETTE.roofDeck}
            kind="steelPainted"
            castShadow={false}
          />
          {/* 屋面立缝：一排细条，让屋顶不再是块白板 */}
          {Array.from({ length: 13 }, (_, index) => (
            <Slab
              key={`seam${index}`}
              size={[0.1, 0.06, depth + 0.4]}
              radius={0}
              position={[FACTORY.minX + (width * index) / 12, FACTORY.roofY + 0.26, centerZ]}
              color={PALETTE.roofSeam}
              kind="steelPainted"
              castShadow={false}
            />
          ))}
        </group>
      )}

      {/* 灯具下方的局部补光：不投影，所以很便宜，但能让设备顶部有暖亮面。
          强度刻意压得低——补光一强，主光投下的阴影就被冲平了。
          吊顶灯带的实体几何已按要求移除（横在视线上挡设备），只留这层看不见的补光。 */}
      {[-11, 0, 11].map((x) => (
        <pointLight
          key={`fill${x}`}
          color={PALETTE.lampWarm}
          intensity={7}
          distance={16}
          decay={2}
          position={[x, FACTORY.roofY - 1.7, centerZ]}
        />
      ))}

      {/* ---------- 卷帘门与卸货雨棚 ---------- */}
      {DOCK_LIST.map((dock) => (
        <group key={`${dock.key}-door`} position={[dock.x, 0, FACTORY.minZ]}>
          {/* 门洞边框（贴在墙上，略向外凸） */}
          {[-1, 1].map((side) => (
            <Slab
              key={side}
              size={[0.16, 4.1, 0.3]}
              radius={0}
              position={[side * 1.78, 2.05, -0.02]}
              color={PALETTE.doorFrame}
              kind="steelPainted"
              castShadow={!xray}
            />
          ))}
          <Slab size={[3.72, 0.18, 0.3]} radius={0} position={[0, 4.18, -0.02]} color={PALETTE.doorFrame} kind="steelPainted" castShadow={!xray} />
          {/* 帘片：一排横向薄板，透视模式下淡出 */}
          <group position={[0, 0, -0.04]}>
            {Array.from({ length: 12 }, (_, index) => (
              <Slab
                key={index}
                size={[3.5, 0.29, 0.1]}
                radius={0}
                position={[0, 0.2 + index * 0.325, 0]}
                color={index % 2 === 0 ? PALETTE.doorRoll : PALETTE.wallPanelDark}
                kind="steelPainted"
                opacity={wallOpacity}
                castShadow={!xray}
                receiveShadow={false}
              />
            ))}
          </group>
          {/* 雨棚 */}
          <Slab
            size={[4.6, 0.16, 2.4]}
            radius={0.04}
            position={[0, 4.75, -1.3]}
            color={PALETTE.canopy}
            kind="steelPainted"
            castShadow={!xray}
          />
          {[-1, 1].map((side) => (
            <Bar key={`brace${side}`} from={[side * 1.9, 4.6, -0.1]} to={[side * 1.9, 2.4, -2.2]} thickness={0.12} color={PALETTE.doorFrame} kind="steelPainted" />
          ))}
          {/* 门楣灯 */}
          <mesh position={[0, 4.5, -0.4]} rotation={[Math.PI / 2.6, 0, 0]} castShadow={false}>
            <boxGeometry args={[2.6, 0.07, 0.16]} />
            <meshStandardMaterial {...glow(PALETTE.lampWarm, 2.2)} />
          </mesh>
          {/* 防撞柱 */}
          {[-1, 1].map((side) => (
            <group key={`bollard${side}`} position={[side * 2.3, 0, -0.6]}>
              <Rod radius={0.13} length={0.9} position={[0, 0.45, 0]} color={PALETTE.bollard} kind="steelPainted" />
              <Rod radius={0.1} length={0.5} position={[0, 0.5, 0]} color={PALETTE.stripeWhite} kind="steelPainted" castShadow={false} />
            </group>
          ))}
        </group>
      ))}

      {/* ---------- 防护栏杆 ----------
          原来沿主通道南侧有一道 38 m 长的通栏栏杆，叉车要跨越时唯一的缺口又被两台打包机挡死，
          实际效果是「把厂房切成两半 + 叉车从栏杆里穿过去」。这里改为只在不需要跨越的位置做短栏杆。 */}
      <Rail from={[FACTORY.minX + 2, 0, AISLE.z + AISLE.halfWidth + 0.7]} to={[-9, 0, AISLE.z + AISLE.halfWidth + 0.7]} height={1.05} posts={4} />
      <Rail from={[3, 0, AISLE.z + AISLE.halfWidth + 0.7]} to={[9.4, 0, AISLE.z + AISLE.halfWidth + 0.7]} height={1.05} posts={3} />
      <Rail
        from={[PLANT.outboundStage.x - PLANT.outboundStage.w / 2 - 0.6, 0, PLANT.outboundStage.z - PLANT.outboundStage.d / 2 - 0.4]}
        to={[PLANT.outboundStage.x + PLANT.outboundStage.w / 2 + 0.6, 0, PLANT.outboundStage.z - PLANT.outboundStage.d / 2 - 0.4]}
        height={1.05}
        posts={4}
      />

      {/* ---------- 月台门楣标识板 ---------- */}
      {DOCK_LIST.map((dock) => (
        <group key={`${dock.key}-sign`} position={[dock.x, 5.0, FACTORY.minZ - 0.16]}>
          <Slab size={[1.9, 0.5, 0.08]} radius={0.03} color="#1f2a30" kind="plastic" castShadow={false} />
          <Slab size={[1.78, 0.4, 0.03]} radius={0} position={[0, 0, 0.05]} color={PALETTE.safetyYellow} kind="floorPaint" castShadow={false} />
          {xray && (
            <Html position={[0, 0, 0.12]} center distanceFactor={26}>
              <span className="zone-label dock-label">{dock.label}</span>
            </Html>
          )}
        </group>
      ))}

      {/* ---------- 墙面通风格栅：给大墙面加细节 ---------- */}
      <Louver width={2.2} height={1.0} slats={6} position={[FACTORY.minX + 0.16, 4.4, centerZ - 4]} rotation={[0, Math.PI / 2, 0]} />
      <Louver width={2.2} height={1.0} slats={6} position={[FACTORY.maxX - 0.16, 4.4, centerZ + 3]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ---------- 长边厂牌：实体屋顶模式下也能一眼认出这是哪座厂房（透视模式隐藏，避免浮在半空） ---------- */}
      {!xray && (
        <group position={[2.0, 4.9, FACTORY.maxZ + 0.16]}>
          <Slab size={[9.6, 1.6, 0.1]} radius={0.04} color={PALETTE.panelFace} kind="plastic" castShadow={false} />
          <mesh position={[0, 0, 0.07]}>
            <planeGeometry args={[8.6, 1.05]} />
            <meshStandardMaterial map={maps.sign} transparent roughness={0.6} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
