import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw } from 'lucide-react';
import ActualScene, { type CameraView } from './ActualScene';
import { ActualSimulation, deviceStatus, openGate } from './engine';
import {
  CAPACITY,
  EQUIPMENT,
  EQUIPMENT_IDS,
  HORIZON,
  MATERIALS,
  PARAMETER_LIMITS,
  SMALL_GRADES,
  type EquipmentId,
  type Parameter,
} from './process';
import cad from './cad-layout.json';
import './actual.css';

const PHASE_NAMES = {
  MANUAL_TRANSFER: '人工转运',
  DISCHARGING: '料仓放料',
  CONVEYING: '输送供料',
  COMPRESSING: '压缩成型',
  EJECTING: '出包',
};
const PARAMETERS: { id: Parameter; label: string; unit: string; step: number }[] = [
  { id: 'feedRate', label: '上料节拍', unit: '批/min', step: 10 },
  { id: 'beltSpeed', label: '输送倍率', unit: '×', step: 0.1 },
  { id: 'threshold', label: '成品仓打包阈值', unit: '批', step: 1 },
  { id: 'robotSpeed', label: '机械手动作倍率', unit: '×', step: 0.1 },
];
const STOPS = [
  { time: 0, label: '上料' },
  { time: 35, label: '人工 / 脱标' },
  { time: 60, label: '二次分选' },
  { time: 100, label: '自动打包' },
  { time: 180, label: '持续运行' },
];
function formatTime(time: number) {
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`;
}

export default function ActualApp() {
  const ref = useRef<ActualSimulation | null>(null);
  if (!ref.current) ref.current = new ActualSimulation();
  const simulation = ref.current;
  const [, tick] = useState(0);
  const [playing, setPlaying] = useState(
    () =>
      !(
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ),
  );
  const [speed, setSpeed] = useState(1),
    [selected, setSelected] = useState<EquipmentId>('E17');
  const [view, setView] = useState<CameraView>('overview');
  const [xray, setXray] = useState(true),
    [paths, setPaths] = useState(true),
    [shell, setShell] = useState(false);
  const refresh = useCallback(() => tick((value) => value + 1), []);
  useEffect(() => {
    let handle = 0,
      last = performance.now(),
      uiTime = 0;
    const frame = (now: number) => {
      handle = requestAnimationFrame(frame);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!playing || document.hidden) return;
      simulation.advanceBy(Math.min(delta * speed, Math.max(0, HORIZON - simulation.current.time)));
      uiTime += delta;
      if (uiTime >= 0.12) {
        refresh();
        uiTime = 0;
      }
      if (simulation.current.time >= HORIZON) {
        setPlaying(false);
        refresh();
      }
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, simulation, refresh]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest?.('input,select,textarea,button')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const selectDevice = useCallback((id: EquipmentId) => {
    setSelected(id);
    setView('focus');
  }, []);
  const seek = (time: number) => {
    simulation.seek(time);
    setPlaying(false);
    refresh();
  };
  const state = simulation.current,
    status = deviceStatus(state, selected);
  const baled = state.bales.reduce((sum, bale) => sum + bale.count, 0),
    inProcess = state.units.length - baled;
  const job = state.job;
  const gate = openGate(state) ? `${openGate(state)} 开启` : '两仓关闭';
  const play = () => {
    if (!playing && state.time >= HORIZON) simulation.seek(0);
    setPlaying((value) => !value);
    refresh();
  };

  return (
    <div className="actual-app">
      <header className="actual-header">
        <div className="actual-brand">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <div>
            <span className="eyebrow">RELOOP / TONGXIANG</span>
            <h1>
              桐乡分拣线<span>实际设备运行动画</span>
            </h1>
          </div>
        </div>
        <div className="header-context">
          <span className="live-dot" />
          工艺模拟
          <a href="./index.html" target="_blank" rel="noreferrer">
            原演示 <ArrowUpRight size={14} />
          </a>
        </div>
      </header>

      <section className="actual-metrics" aria-label="产线模拟统计">
        <div>
          <span>累计上料</span>
          <strong data-testid="received-count">
            {state.units.length}
            <small>批</small>
          </strong>
        </div>
        <div>
          <span>已打包</span>
          <strong data-testid="baled-count">
            {baled}
            <small>批 / {state.bales.length} 包</small>
          </strong>
        </div>
        <div>
          <span>在制物料</span>
          <strong>
            {inProcess}
            <small>批</small>
          </strong>
        </div>
        <p>
          <i />
          {job ? `${MATERIALS[job.grade].name} · ${PHASE_NAMES[job.phase]}` : '共用打包机等待供料'}
        </p>
      </section>

      <main className="actual-workspace">
        <section className="actual-stage" aria-label="实际产线三维动画">
          <ActualScene
            simulation={simulation}
            selected={selected}
            onSelect={selectDevice}
            xray={xray}
            paths={paths}
            shell={shell}
            view={view}
          />
          <div className="actual-view-tools" aria-label="三维视图控制">
            <div>
              {(
                [
                  ['overview', '全线'],
                  ['top', '俯视'],
                  ['focus', '聚焦设备'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div>
              <button aria-pressed={xray} onClick={() => setXray((value) => !value)}>
                工艺透视
              </button>
              <button aria-pressed={paths} onClick={() => setPaths((value) => !value)}>
                流向
              </button>
              <button aria-pressed={shell} onClick={() => setShell((value) => !value)}>
                厂房
              </button>
            </div>
          </div>
          <div className="material-legend">
            {(['3A', 'MIXED', 'GREEN', 'BROWN'] as const).map((grade) => (
              <span key={grade}>
                <i style={{ background: MATERIALS[grade].color }} />
                {MATERIALS[grade].name}
              </span>
            ))}
            <span>
              <i style={{ background: '#e9bf75' }} />
              人工分拣支路
            </span>
          </div>
        </section>

        <aside className="actual-inspector" aria-label="实际设备详情与工艺控制">
          <section className="equipment-detail">
            <div className="section-heading">
              <span>设备详情</span>
              <span className={state.power[selected] ? 'device-state' : 'device-state stopped'}>
                {status}
              </span>
            </div>
            <label className="sr-only" htmlFor="actual-device">
              选择实际设备
            </label>
            <select
              id="actual-device"
              value={selected}
              onChange={(event) => selectDevice(event.target.value as EquipmentId)}
            >
              {EQUIPMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {id} · {EQUIPMENT[id]}
                </option>
              ))}
            </select>
            <h2>
              <span>{selected}</span>
              {EQUIPMENT[selected]}
            </h2>
            <p className="cad-name">CAD 原名：{cad[selected].name}</p>
            <label className="power-switch">
              <span>模拟设备启用</span>
              <input
                type="checkbox"
                checked={state.power[selected]}
                onChange={(event) => {
                  simulation.setPower(selected, event.target.checked);
                  refresh();
                }}
              />
            </label>
          </section>

          <section className="silo-panel" aria-label="四个料仓库存">
            <div className="section-heading">
              <span>料仓存量</span>
              <small>模拟批次</small>
            </div>
            {(['E02', 'E03', 'E04', 'E05'] as const).map((id) => {
              const count = state.stocks[id].length,
                color =
                  id === 'E04'
                    ? MATERIALS['3A'].color
                    : id === 'E05'
                      ? MATERIALS.MIXED.color
                      : id === 'E03'
                        ? '#e9bf75'
                        : '#5bd7ac';
              return (
                <button
                  className={`silo-row ${selected === id ? 'selected' : ''}`}
                  key={id}
                  onClick={() => selectDevice(id)}
                  aria-label={`${id} ${EQUIPMENT[id]} ${count}批`}
                >
                  <span>
                    {id} ·{' '}
                    {id === 'E02'
                      ? '三色中转'
                      : id === 'E03'
                        ? '杂瓶中转'
                        : id === 'E04'
                          ? '3A 成品'
                          : '杂色 PET 成品'}
                  </span>
                  <strong>
                    {count}
                    <small> / {CAPACITY}</small>
                  </strong>
                  <span className="stock-track">
                    <i style={{ width: `${(count / CAPACITY) * 100}%`, background: color }} />
                    {(id === 'E04' || id === 'E05') && (
                      <b style={{ left: `${(state.settings.threshold / CAPACITY) * 100}%` }} />
                    )}
                  </span>
                </button>
              );
            })}
          </section>

          <section className="baler-panel" aria-label="共用打包资源">
            <div className="section-heading">
              <span>共用打包机</span>
              <small>E13</small>
            </div>
            <div className="packing-status">
              <i className={job ? 'on' : ''} />
              <strong>{job ? PHASE_NAMES[job.phase] : '待料'}</strong>
              <span>{job ? MATERIALS[job.grade].name : '—'}</span>
            </div>
            <p className="gate-status">
              仓门互锁 <span>{gate}</span>
            </p>
            <div className="packing-stages">
              {['供料', '压缩', '出包'].map((name, index) => (
                <span
                  key={name}
                  className={
                    job &&
                    (job.phase === 'EJECTING'
                      ? index === 2
                      : job.phase === 'COMPRESSING'
                        ? index === 1
                        : index === 0)
                      ? 'active'
                      : ''
                  }
                >
                  {name}
                </span>
              ))}
            </div>
          </section>

          <details className="small-stock-panel">
            <summary>
              独立小仓位{' '}
              <span>{SMALL_GRADES.reduce((sum, grade) => sum + state.stocks[grade].length, 0)} 批</span>
            </summary>
            <div>
              {SMALL_GRADES.map((grade) => (
                <p key={grade}>
                  <i style={{ background: MATERIALS[grade].color }} />
                  {MATERIALS[grade].name}
                  <strong>{state.stocks[grade].length}</strong>
                </p>
              ))}
            </div>
            <small>每 6 批申请人工转运，共用同一打包资源。</small>
          </details>

          <details className="actual-parameters">
            <summary>
              模拟参数 <span>可调整</span>
            </summary>
            {PARAMETERS.map((parameter) => (
              <label key={parameter.id}>
                <span>
                  {parameter.label}
                  <strong>
                    {state.settings[parameter.id].toFixed(parameter.step < 1 ? 1 : 0)} {parameter.unit}
                  </strong>
                </span>
                <input
                  type="range"
                  aria-label={parameter.label}
                  min={PARAMETER_LIMITS[parameter.id][0]}
                  max={PARAMETER_LIMITS[parameter.id][1]}
                  step={parameter.step}
                  value={state.settings[parameter.id]}
                  onChange={(event) => {
                    simulation.setParameter(parameter.id, Number(event.target.value));
                    refresh();
                  }}
                />
              </label>
            ))}
            <small>调整按当前时刻记录，拖回历史可重放。</small>
          </details>
          <div className="actual-events" aria-label="最近生产事件">
            {state.events
              .slice(-3)
              .reverse()
              .map((event, index) => (
                <p key={`${event.time}-${index}`}>
                  <time>{formatTime(event.time)}</time>
                  {event.text}
                </p>
              ))}
          </div>
          <details className="actual-disclaimer">
            <summary>模拟说明</summary>
            <p>
              设备几何与位置来自
              STEP。带速、比例、仓容和节拍为演示参数；每个可视瓶代表模拟批次。小仓位、人工转运路线及内部运动为示意，待现场校准。
            </p>
            <p>到达 6 分钟时暂停并保留在制物料，不执行班末强制清场。重播从起点开始，重置同时清除参数干预。</p>
          </details>
        </aside>
      </main>

      <footer className="actual-playback">
        <div className="playback-controls">
          <button
            className="play-button"
            onClick={play}
            aria-label={playing ? '暂停' : state.time >= HORIZON ? '重播' : '播放'}
          >
            {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </button>
          <button
            className="reset-button"
            aria-label="重置实际产线"
            onClick={() => {
              simulation.reset();
              setPlaying(false);
              refresh();
            }}
          >
            <RotateCcw size={17} />
          </button>
          <select
            aria-label="播放倍速"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {[1, 2, 4, 8].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
          <span className="playback-time">
            {formatTime(state.time)}
            <small> / {formatTime(HORIZON)}</small>
          </span>
        </div>
        <div className="actual-timeline">
          <label className="sr-only" htmlFor="actual-time">
            实际产线时间轴
          </label>
          <input
            id="actual-time"
            type="range"
            min={0}
            max={HORIZON}
            step={0.1}
            value={state.time}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <div className="actual-milestones">
            {STOPS.map((stop) => (
              <button
                key={stop.time}
                onClick={() => seek(stop.time)}
                style={{ left: `${(stop.time / HORIZON) * 100}%` }}
              >
                {stop.label}
              </button>
            ))}
          </div>
        </div>
        <span className="playback-note">
          真实布局
          <br />
          演示节拍
        </span>
      </footer>
    </div>
  );
}
