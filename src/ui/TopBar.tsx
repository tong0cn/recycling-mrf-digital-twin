import type { Metrics } from '../types';
import type { ViewMode } from '../types';

export interface TopBarProps {
  timeInShift: number;
  duration: number;
  cycle: number;
  playing: boolean;
  speed: number;
  speeds: number[];
  viewMode: ViewMode;
  interventionMode: boolean;
  emergencyStop: boolean;
  metrics: Metrics;
  onTogglePlay: () => void;
  onSpeed: (speed: number) => void;
  onReset: () => void;
  onToggleView: () => void;
  onToggleIntervention: () => void;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export default function TopBar({
  timeInShift,
  duration,
  cycle,
  playing,
  speed,
  speeds,
  viewMode,
  interventionMode,
  emergencyStop,
  metrics,
  onTogglePlay,
  onSpeed,
  onReset,
  onToggleView,
  onToggleIntervention,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="brand">
        <strong>RELOOP MRF</strong>
        <span className="muted">可回收物分拣中心数字孪生 · 概念演示</span>
      </div>

      <dl className="kpi-row">
        <div>
          <dt>当日进料</dt>
          <dd>{metrics.receivedMassT.toFixed(2)} t</dd>
        </div>
        <div>
          <dt>当日出货</dt>
          <dd>{metrics.shippedMassT.toFixed(2)} t</dd>
        </div>
        <div>
          <dt>回收率</dt>
          <dd>{percent(metrics.recoveryRate)}</dd>
        </div>
        <div>
          <dt>运行设备</dt>
          <dd>
            {metrics.runningDevices}/{metrics.totalDevices}
          </dd>
        </div>
        <div>
          <dt>班次进度</dt>
          <dd>{percent(metrics.shiftProgress)}</dd>
        </div>
      </dl>

      <div className="top-controls">
        <button type="button" className="primary" onClick={onTogglePlay}>
          {playing ? '暂停' : '继续'}
        </button>
        <div className="speed-group" role="group" aria-label="播放倍速">
          {speeds.map((value) => (
            <button
              key={value}
              type="button"
              className={speed === value ? 'is-active' : ''}
              aria-pressed={speed === value}
              onClick={() => onSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
        <button type="button" onClick={onReset}>
          复位
        </button>
        <button type="button" onClick={onToggleView}>
          {viewMode === 'xray' ? '显示屋顶' : '透视厂房'}
        </button>
        <button
          type="button"
          className={interventionMode ? 'is-active' : ''}
          aria-pressed={interventionMode}
          onClick={onToggleIntervention}
          title="默认只读；开启后才允许修改设备参数"
        >
          干预模式
        </button>
        <span className="clock" aria-live="polite">
          {timeInShift.toFixed(1)}s / {duration}s · 第 {cycle + 1} 班次
        </span>
      </div>

      {emergencyStop && (
        <p className="banner danger" role="status">
          紧急停机已启用：分拣线与搬运已停止，车辆仍按门岗计划进出。
        </p>
      )}
    </header>
  );
}
