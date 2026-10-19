import type { DeviceId, DeviceStatus, LineGroup } from '../types';

export interface DeviceListItem {
  id: DeviceId;
  name: string;
  /** English equipment code, shown in the row so the list maps onto a real plant tag list. */
  abbr: string;
  group: LineGroup;
  process: string;
  status: DeviceStatus;
  statusLabel: string;
}

export interface DeviceListProps {
  items: DeviceListItem[];
  selected: DeviceId | null;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (id: DeviceId | null) => void;
}

export const GROUP_LABEL: Record<LineGroup, string> = {
  plastic: '塑料瓶分拣线',
  textile: '纺织品分拣线',
  storage: '纸板 / 杂项存储',
  logistics: '车辆与叉车',
};

const GROUP_ORDER: LineGroup[] = ['plastic', 'textile', 'storage', 'logistics'];

export default function DeviceList({ items, selected, query, onQuery, onSelect }: DeviceListProps) {
  return (
    <aside className="panel device-list" aria-label="设备与车辆列表">
      <div className="panel-head">
        <h2>设备与车辆</h2>
        <span className="muted">{items.length} 项</span>
      </div>
      <label className="search">
        <span className="sr-only">搜索设备</span>
        <input
          type="search"
          placeholder="搜索设备、编号或工艺"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <div className="device-groups">
        {GROUP_ORDER.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          return (
            <section key={group} className="device-group">
              <h3>{GROUP_LABEL[group]}</h3>
              <ul>
                {groupItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`device-row${selected === item.id ? ' is-selected' : ''}`}
                      aria-pressed={selected === item.id}
                      onClick={() => onSelect(selected === item.id ? null : item.id)}
                    >
                      <span className={`dot status-${item.status.toLowerCase()}`} aria-hidden="true" />
                      <span className="device-name">
                        {item.name}
                        <em className="device-code">{item.abbr}</em>
                      </span>
                      <span className="device-status">{item.statusLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {items.length === 0 && <p className="muted">没有匹配的设备。</p>}
      </div>
    </aside>
  );
}
