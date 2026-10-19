import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// The 3D layer needs WebGL, which jsdom cannot provide; the panels and the wiring are under test.
vi.mock('../src/scene/MrfScene', () => ({ default: () => null }));

import App from '../src/App';

afterEach(cleanup);

/** Mount the app with a frozen clock so assertions are stable. */
function mountApp() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '暂停' }));
}

const panel = () => screen.getByRole('region', { name: '设备详情与模拟控制' });
// The device list is an <aside>, so its implicit role is complementary rather than region.
const list = () => screen.getByRole('complementary', { name: '设备与车辆列表' });
const dashboard = () => screen.getByRole('region', { name: '生产数据看板' });
const controlFieldset = () => within(panel()).getByText(/模拟控制/).closest('fieldset') as HTMLFieldSetElement;

describe('整机联动', () => {
  it('列表选中设备会驱动详情面板，取消选中后回到引导文案', () => {
    mountApp();
    expect(within(panel()).getByText(/从左侧列表或三维场景中点击一台设备/)).toBeDefined();

    fireEvent.click(within(list()).getByRole('button', { name: /光选机 #1/ }));
    expect(within(panel()).getByRole('heading', { name: '光选机 #1' })).toBeDefined();
    expect(within(panel()).getByText(/编号 NIR-1/)).toBeDefined();
    // Upstream and downstream are shown with the same Chinese names as the list.
    expect(within(panel()).getByText('爬坡机')).toBeDefined();
    expect(within(list()).getByRole('button', { name: /光选机 #1/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(list()).getByRole('button', { name: /光选机 #1/ }));
    expect(within(panel()).getByText(/从左侧列表或三维场景中点击一台设备/)).toBeDefined();
  });

  it('干预模式开关决定控制区是否可编辑，改动会写入干预记录', () => {
    mountApp();
    fireEvent.click(within(list()).getByRole('button', { name: /光选机 #1/ }));
    expect(controlFieldset().disabled).toBe(true);
    expect(within(panel()).getByText('尚未干预，演示按默认参数运行。')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '干预模式' }));
    expect(controlFieldset().disabled).toBe(false);
    fireEvent.change(within(panel()).getAllByRole('slider')[0], { target: { value: '0.8' } });

    expect(within(panel()).getByRole('heading', { name: /干预记录/ }).textContent).toContain('（1）');
    expect(within(panel()).getByText(/sorter1Threshold/)).toBeDefined();

    fireEvent.click(within(panel()).getByRole('button', { name: '清除全部干预' }));
    expect(within(panel()).getByText('尚未干预，演示按默认参数运行。')).toBeDefined();
  });

  it('异常演示开关从面板一路传到顶栏与仿真状态', () => {
    mountApp();
    expect(screen.queryByText(/紧急停机已启用/)).toBeNull();
    fireEvent.click(within(panel()).getByRole('checkbox', { name: /紧急停机/ }));
    expect(screen.getByRole('status').textContent).toContain('紧急停机已启用');
    fireEvent.click(within(panel()).getByRole('checkbox', { name: /紧急停机/ }));
    expect(screen.queryByText(/紧急停机已启用/)).toBeNull();
  });

  it('拖动时间轴改变现场时刻，看板与时间轴同步', () => {
    mountApp();
    fireEvent.change(screen.getByRole('slider', { name: /拖动查看/ }), { target: { value: '80' } });
    expect(within(screen.getByRole('banner')).getByText(/80\.0s \/ 130s/)).toBeDefined();
    // At 80 s the plant is in full production, so the board reports material on site.
    expect(within(dashboard()).getByText('在厂物料')).toBeDefined();
  });

  it('空格键播放/暂停，Esc 取消选中', () => {
    mountApp();
    // The clock starts paused because the mount helper clicked 暂停.
    expect(screen.getByRole('button', { name: '继续' })).toBeDefined();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByRole('button', { name: '暂停' })).toBeDefined();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByRole('button', { name: '继续' })).toBeDefined();

    fireEvent.click(within(list()).getByRole('button', { name: /机械臂分选流水线/ }));
    expect(within(panel()).getByRole('heading', { name: '机械臂分选流水线' })).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(within(panel()).getByText(/从左侧列表或三维场景中点击一台设备/)).toBeDefined();
  });

  it('看板上的料仓水位可以跳到对应设备', () => {
    mountApp();
    fireEvent.click(within(dashboard()).getByRole('button', { name: /HDPE/ }));
    expect(within(panel()).getByRole('heading', { name: 'HDPE 料仓' })).toBeDefined();
  });

  it('设备列表带搜索框，过滤结果与面板互不影响', () => {
    mountApp();
    fireEvent.change(within(list()).getByRole('searchbox'), { target: { value: '打包' } });
    expect(within(list()).getByRole('button', { name: /压缩打包机/ })).toBeDefined();
    expect(within(list()).queryByRole('button', { name: /光选机 #1/ })).toBeNull();
  });
});
