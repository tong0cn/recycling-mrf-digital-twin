import type { DeviceId, Metrics, SimState } from '../types';
import { SEVEN_DAY_TREND, SILO_CONFIG, MATERIAL_META } from '../simulation/data';

export interface DashboardProps {
  metrics: Metrics;
  state: SimState;
  cycle: number;
  onSelect: (id: DeviceId | null) => void;
}

const SOURCE_DEVICE: Record<string, DeviceId> = {
  SILO_PET: 'SILO_PET',
  SILO_HDPE: 'SILO_HDPE',
  SILO_COTTON: 'SILO_COTTON',
  SILO_POLYESTER: 'SILO_POLYESTER',
  SILO_BLEND: 'SILO_BLEND',
};

const TREND_WIDTH = 300;
const TREND_HEIGHT = 92;

/** Fixed-scale bar chart for the demo week. Rendered as plain SVG: no chart dependency. */
function TrendChart() {
  const peak = Math.max(...SEVEN_DAY_TREND.map((day) => Math.max(day.receivedT, day.shippedT))) * 1.15;
  const slot = TREND_WIDTH / SEVEN_DAY_TREND.length;
  const barWidth = slot * 0.28;
  return (
    <figure className="trend">
      <figcaption>
        近 7 日进出货量（t）<span className="muted">演示数据</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT + 14}`}
        role="img"
        aria-label={`近 7 日进出货量演示数据：${SEVEN_DAY_TREND.map((day) => `${day.day} 进 ${day.receivedT} 吨、出 ${day.shippedT} 吨`).join('；')}`}
      >
        {[0.25, 0.5, 0.75, 1].map((line) => (
          <line
            key={line}
            x1={0}
            x2={TREND_WIDTH}
            y1={TREND_HEIGHT - TREND_HEIGHT * line}
            y2={TREND_HEIGHT - TREND_HEIGHT * line}
            stroke="#2b3f4a"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        ))}
        {SEVEN_DAY_TREND.map((day, index) => {
          const receivedHeight = (day.receivedT / peak) * TREND_HEIGHT;
          const shippedHeight = (day.shippedT / peak) * TREND_HEIGHT;
          const x = index * slot + slot / 2;
          return (
            <g key={day.day}>
              <rect x={x - barWidth - 1} y={TREND_HEIGHT - receivedHeight} width={barWidth} height={receivedHeight} fill="#4aa8e0" rx={1} />
              <rect x={x + 1} y={TREND_HEIGHT - shippedHeight} width={barWidth} height={shippedHeight} fill="#3fbf8b" rx={1} />
              <text x={x} y={TREND_HEIGHT + 11} textAnchor="middle" fontSize="9" fill="#8fa3ad">
                {day.day}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="trend-legend">
        <span>
          <i style={{ background: '#4aa8e0' }} />
          进料
        </span>
        <span>
          <i style={{ background: '#3fbf8b' }} />
          出货
        </span>
      </p>
    </figure>
  );
}

export default function Dashboard({ metrics, state, onSelect }: DashboardProps) {
  const activeJobs = state.jobs.filter((job) => job.status === 'ACTIVE');
  const balesWaiting = state.bales.filter((bale) => bale.status === 'READY' || bale.status === 'AT_DOCK');

  return (
    <section className="panel dashboard" aria-label="生产数据看板">
      <div className="panel-head">
        <h2>生产看板</h2>
        <span className="muted">本班次数据（模拟）</span>
      </div>

      <table className="material-table">
        <caption className="sr-only">分品类进出存</caption>
        <thead>
          <tr>
            <th scope="col">品类</th>
            <th scope="col">进料</th>
            <th scope="col">出货</th>
            <th scope="col">在厂</th>
          </tr>
        </thead>
        <tbody>
          {metrics.byMaterial.map((row) => (
            <tr key={row.material}>
              <th scope="row">{row.label}</th>
              <td>{row.received}</td>
              <td>{row.shipped}</td>
              <td>{row.onSite}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">合计</th>
            <td>{metrics.receivedUnits}</td>
            <td>{metrics.shippedUnits}</td>
            <td>{metrics.onSiteUnits}</td>
          </tr>
        </tfoot>
      </table>

      <div className="silo-levels">
        <h4>料仓水位</h4>
        {(Object.keys(SILO_CONFIG) as (keyof typeof SILO_CONFIG)[]).map((id) => {
          const silo = state.silos[id];
          const ratio = silo.capacity ? silo.units / silo.capacity : 0;
          return (
            <button key={id} type="button" className="silo-row" onClick={() => onSelect(SOURCE_DEVICE[id])}>
              {/* 与看板表格、场景图例统一用短名，完整牌号留在 title 里，避免窄栏被英文长名截断。 */}
              <span className="silo-name" title={silo.material}>
                {MATERIAL_META[silo.material].short}
              </span>
              <span className="silo-track" role="img" aria-label={`${silo.units} / ${silo.capacity} 包`}>
                <span className="silo-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
                <span className="silo-threshold" style={{ left: `${Math.round((silo.threshold / silo.capacity) * 100)}%` }} />
              </span>
              <span className="silo-value">
                {silo.units}/{silo.capacity}
              </span>
            </button>
          );
        })}
      </div>

      <div className="task-list">
        <h4>搬运任务</h4>
        {activeJobs.length === 0 && balesWaiting.length === 0 ? (
          <p className="muted">当前没有进行中的搬运任务。</p>
        ) : (
          <ul>
            {activeJobs.map((job) => (
              <li key={job.id}>
                <span className="dot status-running" aria-hidden="true" />
                {job.vehicle ?? '—'} · {job.label}
              </li>
            ))}
            {balesWaiting.map((bale) => (
              <li key={`bale-${bale.id}`}>
                <span className="dot status-waiting" aria-hidden="true" />
                待搬运 · {bale.material} 打包块 {bale.massT.toFixed(2)} t
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="mini-stats">
        <div>
          <dt>本班次打包</dt>
          <dd>{metrics.balesProduced} 个</dd>
        </div>
        <div>
          <dt>叉车趟数</dt>
          <dd>{metrics.forkliftTrips}</dd>
        </div>
        <div>
          <dt>在厂车辆</dt>
          <dd>{metrics.truckTrips}</dd>
        </div>
        <div>
          <dt>在厂物料</dt>
          <dd>{metrics.onSiteUnits} 包</dd>
        </div>
        <div>
          <dt>转入杂项</dt>
          <dd className={metrics.tailUnits > 0 ? 'tone-warn' : undefined}>{metrics.tailUnits} 包</dd>
        </div>
        <div>
          <dt>丢失计数</dt>
          <dd>{metrics.lostUnits} 包</dd>
        </div>
      </dl>

      <TrendChart />
      <p className="boundary">
        以上进出货量按 1 个演示物料单元折算为真实料包质量（塑料 0.15 t、纺织 0.08 t、纸板 0.25 t、杂项 0.2 t），
        每班两轮。演示规模只用于在一次班次内完整呈现全流程，真实分拣中心的日处理量远高于此。
      </p>
    </section>
  );
}
