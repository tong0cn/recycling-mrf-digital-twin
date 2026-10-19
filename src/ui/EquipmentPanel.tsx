import type { Anomalies, AnomalyKey, DeviceId, DeviceReport, SimSettings, TimedCommand } from '../types';
import { DEVICE_ABBR, DEVICE_SPEC_BY_ID } from '../simulation/data';

export interface EquipmentPanelProps {
  report: DeviceReport | null;
  settings: SimSettings;
  interventionMode: boolean;
  anomalies: Anomalies;
  commands: readonly TimedCommand[];
  onControl: (key: string, device: DeviceId | 'SYSTEM', value: number, flag?: boolean) => void;
  onToggleAnomaly: (key: AnomalyKey, value: boolean) => void;
  onClearInterventions: () => void;
}

const ANOMALIES: { key: AnomalyKey; label: string; hint: string }[] = [
  { key: 'missort', label: '光选误判', hint: '识别成功率下降，更多瓶料与织物进入尾料' },
  { key: 'siloOverflowWarning', label: '料仓满溢预警', hint: '报警线提前一包：达到容量前 1 包即报警，关闭时只在满仓后报警' },
  { key: 'emergencyStop', label: '紧急停机', hint: '分拣线与搬运立即停止，门岗计划照常，班末清场保证循环不残留' },
];

/** Upstream / downstream are shown with the same Chinese names the list uses. */
const names = (ids: DeviceId[]): string =>
  ids.length ? ids.map((id) => DEVICE_SPEC_BY_ID[id]?.name ?? id).join(' → ') : '无（本工序为端点）';

export default function EquipmentPanel({
  report,
  settings,
  interventionMode,
  anomalies,
  commands,
  onControl,
  onToggleAnomaly,
  onClearInterventions,
}: EquipmentPanelProps) {
  return (
    <section className="panel equipment-panel" aria-label="设备详情与模拟控制">
      <div className="panel-head">
        <h2>设备详情</h2>
        {report && (
          <span className={`status-pill status-${report.status.toLowerCase()}`}>{report.statusLabel}</span>
        )}
      </div>

      {!report && <p className="muted">从左侧列表或三维场景中点击一台设备，查看状态、读数与上下游关系。</p>}

      {report && (
        <>
          <div className="equipment-title">
            <h3>{report.spec.name}</h3>
            <p className="muted">
              编号 {DEVICE_ABBR[report.id]} · {report.spec.nameEn} · {report.spec.process}
            </p>
          </div>

          <dl className="readouts">
            {report.readouts.map((readout) => (
              <div key={readout.label} className={readout.tone ? `tone-${readout.tone}` : undefined}>
                <dt>{readout.label}</dt>
                <dd>{readout.value}</dd>
              </div>
            ))}
          </dl>

          <p className="equipment-note">{report.stateNote}</p>

          <div className="flow">
            <div>
              <h4>上游</h4>
              <p>{names(report.upstream)}</p>
            </div>
            <div>
              <h4>下游</h4>
              <p>{names(report.downstream)}</p>
            </div>
          </div>

          {report.controls.length > 0 && (
            <fieldset className="controls" disabled={!interventionMode}>
              <legend>模拟控制{interventionMode ? '' : '（需开启干预模式）'}</legend>
              {report.controls.map((control) => {
                const value = settings.numbers[control.key] ?? control.default;
                return (
                  <label key={control.key} className="control">
                    <span>
                      {control.label}
                      <em>
                        {value}
                        {control.unit ? ` ${control.unit}` : ''}
                      </em>
                    </span>
                    <input
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={value}
                      onChange={(event) => onControl(control.key, report.id, Number(event.target.value))}
                    />
                    <small className="muted">{control.description}</small>
                  </label>
                );
              })}
            </fieldset>
          )}
        </>
      )}

      <fieldset className="anomalies">
        <legend>异常演示开关</legend>
        {ANOMALIES.map((item) => (
          <label key={item.key} className="switch">
            <input
              type="checkbox"
              checked={anomalies[item.key]}
              onChange={(event) => onToggleAnomaly(item.key, event.target.checked)}
            />
            <span>
              {item.label}
              <small className="muted">{item.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="intervention-log">
        <h4>干预记录（{commands.length}）</h4>
        {commands.length === 0 ? (
          <p className="muted">尚未干预，演示按默认参数运行。</p>
        ) : (
          <>
            <ul>
              {commands.map((command, index) => (
                <li key={`${command.at}-${command.key}-${index}`}>
                  {command.at.toFixed(1)}s · {command.device} · {command.key} = {command.value}
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClearInterventions}>
              清除全部干预
            </button>
          </>
        )}
      </div>

      <p className="boundary">{report ? report.boundary : '所有读数与状态均为本地仿真值。'}</p>
    </section>
  );
}
