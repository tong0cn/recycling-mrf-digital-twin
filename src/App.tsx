import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnomalyKey, CameraMode, DeviceId, DeviceStatus, SimSettings, ViewMode } from './types';
import { Simulation, STEPS_PER_SHIFT } from './simulation';
import { SimulationContext } from './simulation/context';
import { DEVICE_ABBR, DEVICE_SPECS, SHIFT } from './simulation/data';
import { settingsAt } from './simulation/runtime';
import { computeMetrics, describeDevice, deviceStatus } from './simulation/readouts';
import MrfScene from './scene/MrfScene';
import type { DeviceListItem } from './ui/DeviceList';
import DeviceList from './ui/DeviceList';
import Dashboard from './ui/Dashboard';
import EquipmentPanel from './ui/EquipmentPanel';
import Timeline from './ui/Timeline';
import TopBar from './ui/TopBar';

const SPEEDS = [1, 2, 4];
/** Panels refresh at roughly 8 Hz: fast enough to feel live, cheap enough for a client demo. */
const UI_INTERVAL = 0.12;

const STATUS_LABEL: Record<DeviceStatus, string> = {
  RUNNING: '运行中',
  WAITING: '等待',
  IDLE: '待机',
  WARNING: '报警',
  STOPPED: '已停机',
};

export default function App() {
  const simulationRef = useRef<Simulation | null>(null);
  if (!simulationRef.current) simulationRef.current = new Simulation();
  const simulation = simulationRef.current;

  const [, setUiTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<DeviceId | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('xray');
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview');
  const [interventionMode, setInterventionMode] = useState(false);
  const [query, setQuery] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);

  const refresh = useCallback(() => setUiTick((value) => value + 1), []);

  // Respect the viewer's reduced-motion preference by starting paused. Environments without
  // matchMedia (older browsers, jsdom in tests) simply keep the default playing state.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReducedMotion(media.matches);
      if (media.matches) setPlaying(false);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  // One animation frame drives the plant clock. A hidden tab neither advances nor catches up.
  useEffect(() => {
    let handle = 0;
    let last = performance.now();
    let uiClock = 0;
    const tick = (now: number) => {
      handle = requestAnimationFrame(tick);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playing && !document.hidden) {
        simulation.advanceBy(delta * speed);
        uiClock += delta;
        if (uiClock >= UI_INTERVAL) {
          uiClock = 0;
          refresh();
        }
      }
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, simulation, refresh]);

  const state = simulation.current;
  const localStep = simulation.currentStep % STEPS_PER_SHIFT;
  const settings: SimSettings = settingsAt(simulation.commands, localStep);
  const metrics = computeMetrics(state, simulation.completedCycles);
  const report = selected ? describeDevice(state, selected, settings) : null;

  const keyword = query.trim().toLowerCase();
  const deviceItems: DeviceListItem[] = DEVICE_SPECS.filter((spec) =>
    keyword ? `${spec.name} ${spec.nameEn} ${spec.process}`.toLowerCase().includes(keyword) : true,
  ).map((spec) => {
    const status = deviceStatus(state, spec.id);
    return {
      id: spec.id,
      name: spec.name,
      abbr: DEVICE_ABBR[spec.id],
      group: spec.group,
      process: spec.process,
      status,
      statusLabel: STATUS_LABEL[status],
    };
  });

  const applyControl = useCallback(
    (key: string, device: DeviceId | 'SYSTEM', value: number, flag = false) => {
      simulation.addCommand({ at: simulation.timeInShift, device, key, value, flag });
      refresh();
    },
    [simulation, refresh],
  );

  const toggleAnomaly = useCallback(
    (key: AnomalyKey, value: boolean) => applyControl(key, 'SYSTEM', value ? 1 : 0, true),
    [applyControl],
  );

  const clearInterventions = useCallback(() => {
    simulation.clearCommands();
    refresh();
  }, [simulation, refresh]);

  const resetShift = useCallback(() => {
    simulation.reset();
    refresh();
  }, [simulation, refresh]);

  const scrub = useCallback(
    (seconds: number) => {
      simulation.seekToTime(seconds);
      refresh();
    },
    [simulation, refresh],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === 'r' || event.key === 'R') {
        resetShift();
      } else if (event.key === 'Escape') {
        setSelected(null);
      } else if (SPEEDS.includes(Number(event.key))) {
        setSpeed(Number(event.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetShift]);

  return (
    <SimulationContext.Provider value={simulation}>
      <div className={`app-shell${reducedMotion ? ' reduce-motion' : ''}`}>
        <TopBar
          cycle={simulation.completedCycles}
          duration={SHIFT.DURATION}
          emergencyStop={state.anomalies.emergencyStop}
          interventionMode={interventionMode}
          metrics={metrics}
          onReset={resetShift}
          onSpeed={setSpeed}
          onToggleIntervention={() => setInterventionMode((value) => !value)}
          onTogglePlay={() => setPlaying((value) => !value)}
          onToggleView={() => setViewMode((value) => (value === 'xray' ? 'enclosed' : 'xray'))}
          playing={playing}
          speed={speed}
          speeds={SPEEDS}
          timeInShift={simulation.timeInShift}
          viewMode={viewMode}
        />
        <main className="app-body">
          <DeviceList
            items={deviceItems}
            onQuery={setQuery}
            onSelect={setSelected}
            query={query}
            selected={selected}
          />
          <section className="app-stage" aria-label="分拣中心三维场景">
            <MrfScene
              cameraMode={cameraMode}
              onCameraMode={setCameraMode}
              onSelect={setSelected}
              reducedMotion={reducedMotion}
              selected={selected}
              viewMode={viewMode}
            />
            <Timeline
              duration={SHIFT.DURATION}
              eventLog={state.events}
              onScrub={scrub}
              playing={playing}
              timeInShift={simulation.timeInShift}
            />
          </section>
          <div className="app-side">
            <EquipmentPanel
              anomalies={state.anomalies}
              commands={simulation.commands}
              interventionMode={interventionMode}
              onClearInterventions={clearInterventions}
              onControl={applyControl}
              onToggleAnomaly={toggleAnomaly}
              report={report}
              settings={settings}
            />
            <Dashboard
              cycle={simulation.completedCycles}
              metrics={metrics}
              onSelect={setSelected}
              state={state}
            />
          </div>
        </main>
      </div>
    </SimulationContext.Provider>
  );
}
