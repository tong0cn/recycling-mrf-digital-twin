import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export interface TimelineProps {
  timeInShift: number;
  duration: number;
  playing: boolean;
  eventLog: readonly string[];
  onScrub: (seconds: number) => void;
}

/** Shift milestones, used as tick marks so a client can jump straight to a key step. */
const MILESTONES: { at: number; label: string }[] = [
  { at: 0, label: '进货车辆入场' },
  { at: 15, label: '塑料来料上线' },
  { at: 20, label: '首次光选分选' },
  { at: 24, label: '纺织来料上线' },
  { at: 39, label: '首件打包' },
  { at: 55, label: '首件成品装车' },
  { at: 108, label: '转运车离场' },
  { at: 118, label: '出货过磅' },
];

/** Exported so a test can hold these marks against the actual simulation. */
export const TIMELINE_MILESTONES = MILESTONES;

/** 一行标签的高度（px）与单字宽度估算（9px 字号下的中日韩字符约 9px 宽，再加左右内边距）。 */
const LABEL_ROW_HEIGHT = 13;
const LABEL_CHAR_WIDTH = 9;
const LABEL_PADDING = 10;
/** 同一行内两个标签之间至少留出的空隙（px）。 */
const LABEL_GAP = 6;
/** 时间轴宽度还未知时（首帧、无障碍环境）使用的保守估算宽度，宁可多占一行也不让标签叠字。 */
const FALLBACK_TRACK_WIDTH = 560;

export interface MilestoneLabelSpan {
  row: number;
  left: number;
  right: number;
}

/**
 * 把里程碑标签分配到若干行：同一行内任意两个标签的横向占位不重叠。
 * 15/20/24 s 三个里程碑在 130 s 的班次里相距不到 3%，单行排布必然互相压字，
 * 因此按“第一个放得下的行”贪心分配，行号再交给 CSS 做纵向错行。
 * 导出以便测试直接锁住「任何宽度下同排标签都不重叠」这条性质。
 */
export function layoutMilestoneLabels(
  marks: readonly { at: number; label: string }[],
  duration: number,
  trackWidth: number,
): MilestoneLabelSpan[] {
  const width = trackWidth > 0 ? trackWidth : FALLBACK_TRACK_WIDTH;
  const rowRightEdges: number[] = [];
  return marks.map((mark) => {
    const halfLabel = (mark.label.length * LABEL_CHAR_WIDTH + LABEL_PADDING) / 2;
    const center = duration > 0 ? (mark.at / duration) * width : 0;
    const left = center - halfLabel;
    let row = rowRightEdges.findIndex((rightEdge) => rightEdge + LABEL_GAP <= left);
    if (row === -1) row = rowRightEdges.length;
    rowRightEdges[row] = center + halfLabel;
    return { row, left, right: center + halfLabel };
  });
}

export default function Timeline({ timeInShift, duration, playing, eventLog, onScrub }: TimelineProps) {
  const latest = eventLog.slice(-6).reverse();
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // 标签错行依赖导轨的真实像素宽度，因此拿一次实测宽度，并在缩放时跟随。
  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    const measure = () => setTrackWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const labelSpans = layoutMilestoneLabels(MILESTONES, duration, trackWidth);
  const lastRow = labelSpans.reduce((max, span) => Math.max(max, span.row), 0);

  return (
    <section className="timeline" aria-label="班次时间轴">
      <div className="timeline-track" ref={trackRef} style={{ paddingBottom: 16 + lastRow * LABEL_ROW_HEIGHT }}>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={timeInShift}
          aria-label="拖动查看任意时刻的现场状态"
          onChange={(event) => onScrub(Number(event.target.value))}
        />
        {/* Interactive milestones stay in the accessibility tree: they are real jump buttons. */}
        <div className="timeline-marks">
          {MILESTONES.map((milestone, index) => (
            <button
              key={milestone.at}
              type="button"
              className="timeline-mark"
              style={
                {
                  left: `${(milestone.at / duration) * 100}%`,
                  top: labelSpans[index].row * LABEL_ROW_HEIGHT,
                  '--mark-lift': `${labelSpans[index].row * LABEL_ROW_HEIGHT}px`,
                } as CSSProperties
              }
              title={`${milestone.label}（${milestone.at}s）`}
              onClick={() => onScrub(milestone.at)}
            >
              <span>{milestone.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-foot">
        <span className="timeline-time">
          {timeInShift.toFixed(1)}s / {duration}s {playing ? '· 播放中' : '· 已暂停'}
        </span>
        <ol className="event-feed" aria-live="polite">
          {latest.map((event) => (
            <li key={event}>{event}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
