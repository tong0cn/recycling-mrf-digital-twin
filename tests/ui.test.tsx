import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SHIFT } from '../src/simulation/data';
import { stateAtStep } from '../src/simulation';
import { settingsAt } from '../src/simulation/runtime';
import { computeMetrics, describeDevice, deviceStatus } from '../src/simulation/readouts';
import type { DeviceId } from '../src/types';
import Dashboard from '../src/ui/Dashboard';
import DeviceList, { GROUP_LABEL } from '../src/ui/DeviceList';
import EquipmentPanel from '../src/ui/EquipmentPanel';
import Timeline from '../src/ui/Timeline';
import { TIMELINE_MILESTONES, layoutMilestoneLabels } from '../src/ui/Timeline';
import TopBar from '../src/ui/TopBar';

afterEach(cleanup);

const state = stateAtStep(1200, []);
const settings = settingsAt([], 1200);
const metrics = computeMetrics(state, 0);

const baseTopBar = {
  timeInShift: 40,
  duration: SHIFT.DURATION,
  cycle: 0,
  playing: true,
  speed: 1,
  speeds: [1, 2, 4],
  viewMode: 'xray' as const,
  interventionMode: false,
  emergencyStop: false,
  metrics,
  onTogglePlay: () => {},
  onSpeed: () => {},
  onReset: () => {},
  onToggleView: () => {},
  onToggleIntervention: () => {},
};

describe('顶栏', () => {
  it('展示关键指标，并把播放、倍速、复位、视角与干预都接出来', () => {
    const onTogglePlay = vi.fn();
    const onSpeed = vi.fn();
    const onReset = vi.fn();
    const onToggleView = vi.fn();
    const onToggleIntervention = vi.fn();
    render(
      <TopBar
        {...baseTopBar}
        onReset={onReset}
        onSpeed={onSpeed}
        onToggleIntervention={onToggleIntervention}
        onTogglePlay={onTogglePlay}
        onToggleView={onToggleView}
      />,
    );
    expect(screen.getByText('当日进料')).toBeDefined();
    expect(screen.getByText('回收率')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    fireEvent.click(screen.getByRole('button', { name: '2×' }));
    fireEvent.click(screen.getByRole('button', { name: '复位' }));
    fireEvent.click(screen.getByRole('button', { name: '显示屋顶' }));
    fireEvent.click(screen.getByRole('button', { name: '干预模式' }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(onSpeed).toHaveBeenCalledWith(2);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onToggleView).toHaveBeenCalledTimes(1);
    expect(onToggleIntervention).toHaveBeenCalledTimes(1);
  });

  it('紧急停机时给出明确提示', () => {
    render(<TopBar {...baseTopBar} emergencyStop />);
    expect(screen.getByRole('status').textContent).toContain('紧急停机');
  });
});

describe('设备列表', () => {
  const items = [
    { id: 'SORTER_1' as DeviceId, name: '光选机 #1', group: 'plastic' as const, process: '近红外识别 + 气吹分选（PET）', status: 'RUNNING' as const, statusLabel: '运行中' },
    { id: 'ROBOT_ARM' as DeviceId, name: '机械臂分选流水线', group: 'textile' as const, process: '视觉定位 + 机械臂抓取', status: 'IDLE' as const, statusLabel: '待机' },
  ];

  it('按产线分组，并按关键字过滤', () => {
    const { rerender } = render(<DeviceList items={items} onQuery={() => {}} onSelect={() => {}} query="" selected={null} />);
    expect(screen.getByRole('heading', { name: GROUP_LABEL.plastic })).toBeDefined();
    expect(screen.getByRole('heading', { name: GROUP_LABEL.textile })).toBeDefined();
    rerender(<DeviceList items={[]} onQuery={() => {}} onSelect={() => {}} query="不存在" selected={null} />);
    expect(screen.getByText('没有匹配的设备。')).toBeDefined();
  });

  it('点击列表项选中设备，再点一次取消选中', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<DeviceList items={items} onQuery={() => {}} onSelect={onSelect} query="" selected={null} />);
    fireEvent.click(screen.getByRole('button', { name: /光选机 #1/ }));
    expect(onSelect).toHaveBeenCalledWith('SORTER_1');
    rerender(<DeviceList items={items} onQuery={() => {}} onSelect={onSelect} query="" selected="SORTER_1" />);
    fireEvent.click(screen.getByRole('button', { name: /光选机 #1/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('搜索框把输入交回上层', () => {
    const onQuery = vi.fn();
    render(<DeviceList items={items} onQuery={onQuery} onSelect={() => {}} query="" selected={null} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '机械臂' } });
    expect(onQuery).toHaveBeenCalledWith('机械臂');
  });
});

describe('设备详情与干预分层', () => {
  const report = describeDevice(state, 'SORTER_1', settings);
  const baseProps = {
    report,
    settings,
    anomalies: state.anomalies,
    commands: [],
    onControl: () => {},
    onToggleAnomaly: () => {},
    onClearInterventions: () => {},
  };

  it('默认只读：未开启干预模式时控制项不可操作', () => {
    render(<EquipmentPanel {...baseProps} interventionMode={false} />);
    const legend = screen.getByText(/模拟控制/);
    expect(legend.textContent).toContain('需开启干预模式');
    const fieldset = legend.closest('fieldset') as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  it('开启干预模式后可以改参数，并把命令交回上层', () => {
    const onControl = vi.fn();
    render(<EquipmentPanel {...baseProps} interventionMode onControl={onControl} />);
    const fieldset = screen.getByText(/模拟控制/).closest('fieldset') as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(false);
    const slider = screen.getAllByRole('slider')[0] as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(onControl).toHaveBeenCalledWith('sorter1Threshold', 'SORTER_1', 0.8);
  });

  it('异常演示开关可切换并回传', () => {
    const onToggleAnomaly = vi.fn();
    render(<EquipmentPanel {...baseProps} interventionMode={false} onToggleAnomaly={onToggleAnomaly} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /光选误判/ }));
    expect(onToggleAnomaly).toHaveBeenCalledWith('missort', true);
  });

  it('没有选中设备时给出引导文案，且有干预记录时能清除', () => {
    const onClearInterventions = vi.fn();
    const { rerender } = render(<EquipmentPanel {...baseProps} interventionMode={false} onClearInterventions={onClearInterventions} report={null} />);
    expect(screen.getByText(/点击一台设备/)).toBeDefined();
    rerender(
      <EquipmentPanel
        {...baseProps}
        commands={[{ at: 12, device: 'CONVEYOR', key: 'beltSpeed', value: 1.4 }]}
        interventionMode
        onClearInterventions={onClearInterventions}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '清除全部干预' }));
    expect(onClearInterventions).toHaveBeenCalledTimes(1);
  });
});

describe('生产看板', () => {
  it('展示分品类进出存与料仓水位，点击料仓可跳到对应设备', () => {
    const onSelect = vi.fn();
    render(<Dashboard cycle={0} metrics={metrics} onSelect={onSelect} state={state} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('PET')).toBeDefined();
    expect(within(table).getByText('杂项')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /PET/ }));
    expect(onSelect).toHaveBeenCalledWith('SILO_PET');
  });

  it('没有任何搬运任务时给出空状态', () => {
    const quiet = { ...state, jobs: [], bales: [] };
    render(<Dashboard cycle={0} metrics={computeMetrics(quiet, 0)} onSelect={() => {}} state={quiet} />);
    expect(screen.getByText('当前没有进行中的搬运任务。')).toBeDefined();
  });

  it('设备状态读数在任何时刻都能计算', () => {
    const later = stateAtStep(3000, []);
    expect(deviceStatus(later, 'ROBOT_ARM')).toBeTruthy();
  });
});

describe('时间轴', () => {
  it('拖动进度条把目标时刻交回上层', () => {
    const onScrub = vi.fn();
    render(<Timeline duration={SHIFT.DURATION} eventLog={['0012.0s 测试事件']} onScrub={onScrub} playing timeInShift={12} />);
    fireEvent.change(screen.getByRole('slider', { name: /拖动查看/ }), { target: { value: '88' } });
    expect(onScrub).toHaveBeenCalledWith(88);
  });

  it('事件流显示最近发生在前面', () => {
    render(
      <Timeline
        duration={SHIFT.DURATION}
        eventLog={['0004.5s 卸货', '0015.0s 投料', '0022.5s 第二包']}
        onScrub={() => {}}
        playing={false}
        timeInShift={30}
      />,
    );
    const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(items[0]).toContain('第二包');
    expect(screen.getByText(/已暂停/)).toBeDefined();
  });

  it('里程碑可以直接跳到该时刻', () => {
    const onScrub = vi.fn();
    render(<Timeline duration={SHIFT.DURATION} eventLog={[]} onScrub={onScrub} playing timeInShift={0} />);
    const milestone = TIMELINE_MILESTONES.find((item) => item.label === '首件打包');
    expect(milestone).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '首件打包' }));
    expect(onScrub).toHaveBeenCalledWith(milestone?.at);
  });

  // 浏览器视觉验收发现 15/20/24 s 三个里程碑的标签会叠成一团（1440 px 下仅相距 24–31 px 而标签宽 62 px），
  // 现在改为按导轨实测宽度贪心错行；这条测试把「同排标签不压字」锁住，并覆盖窄屏与宽屏两端。
  it('里程碑标签在任何导轨宽度下都不会互相压字', () => {
    for (const trackWidth of [325, 563, 687, 774]) {
      const spans = layoutMilestoneLabels(TIMELINE_MILESTONES, SHIFT.DURATION, trackWidth);
      expect(spans).toHaveLength(TIMELINE_MILESTONES.length);
      const rows = new Map<number, { label: string; left: number; right: number }[]>();
      TIMELINE_MILESTONES.forEach((milestone, index) => {
        const placed = rows.get(spans[index].row) ?? [];
        placed.push({ label: milestone.label, left: spans[index].left, right: spans[index].right });
        rows.set(spans[index].row, placed);
      });
      for (const placed of rows.values()) {
        placed.sort((a, b) => a.left - b.left);
        for (let i = 1; i < placed.length; i += 1) {
          expect(
            placed[i].left,
            `${placed[i - 1].label} 与 ${placed[i].label} 在 ${trackWidth} px 导轨上压字`,
          ).toBeGreaterThanOrEqual(placed[i - 1].right);
        }
      }
      // 15 / 20 / 24 s 三个里程碑必须被拆到不同行，否则单行必然叠字。
      const crowded = TIMELINE_MILESTONES.map((milestone, index) => ({ at: milestone.at, row: spans[index].row })).filter(
        (item) => item.at >= 15 && item.at <= 24,
      );
      expect(new Set(crowded.map((item) => item.row)).size, `${trackWidth} px`).toBe(crowded.length);
    }
  });
});
