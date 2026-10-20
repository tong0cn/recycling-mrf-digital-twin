import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../src/actual/ActualScene', () => ({ default: () => <div>实际 CAD 场景</div> }));
import ActualApp from '../src/actual/ActualApp';
afterEach(cleanup);

describe('独立实际产线入口', () => {
  it('选择确认设备、停用、恢复、聚焦与时间轴相互联动', () => {
    render(<ActualApp />);
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    fireEvent.change(screen.getByLabelText('选择实际设备'), { target: { value: 'E11' } });
    expect(screen.getByRole('heading', { name: /E11.*螺旋上料机/ })).toBeDefined();
    expect(screen.getByRole('button', { name: '聚焦设备' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: '模拟设备启用' }));
    expect(screen.getByText('已停用')).toBeDefined();
    fireEvent.change(screen.getByLabelText('实际产线时间轴'), { target: { value: '100' } });
    expect(screen.getByTestId('received-count').textContent).not.toBe('0批');
    expect(screen.getByTestId('baled-count').textContent).toBe('0批 / 0 包');
    fireEvent.click(screen.getByRole('button', { name: '重置实际产线' }));
    expect(screen.getByRole('checkbox', { name: '模拟设备启用' })).toHaveProperty('checked', true);
    expect(screen.getByTestId('received-count').textContent).toBe('0批');
  });

  it('3A 与杂色 PET 显示正确，时间轴保留终点库存，原演示有独立链接', () => {
    render(<ActualApp />);
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByRole('link', { name: /原演示/ }).getAttribute('href')).toBe('./index.html');
    fireEvent.change(screen.getByLabelText('选择实际设备'), { target: { value: 'E05' } });
    expect(screen.getByRole('heading', { name: /E05.*杂色 PET/ })).toBeDefined();
    fireEvent.change(screen.getByLabelText('实际产线时间轴'), { target: { value: '360' } });
    expect(screen.getByRole('button', { name: '重播' })).toBeDefined();
    expect(Number(screen.getByTestId('received-count').textContent?.replace('批', ''))).toBeGreaterThan(0);
    expect(screen.getByText('在制物料', { exact: true })).toBeDefined();
  });
});
