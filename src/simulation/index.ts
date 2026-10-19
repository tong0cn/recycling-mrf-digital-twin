import type { SimSettings, SimState, TimedCommand } from '../types';
import { SHIFT } from './data';
import { emptyState as createInitialState, settingsAt, snapshot, stepOfTime, syncAnomalies } from './runtime';
import { stepArm, stepBales, stepCardboard, stepPlasticLine, stepSilos, stepTextileLine } from './lines';
import { prunePuffs, stepForklifts, stepJobs, stepReturnHome, stepTrucks, finalSweep } from './logistics';

export const STEPS_PER_SHIFT = Math.round(SHIFT.DURATION / SHIFT.STEP);

/** One fixed simulation step. Everything downstream is a pure function of (step, intervention log). */
export function stepOnce(state: SimState, settings: SimSettings): void {
  syncAnomalies(state, settings);

  // Trucks keep their gate schedule during an emergency stop; the plant itself freezes.
  stepTrucks(state);
  // The end-of-shift sweep must run even when the plant is stopped, otherwise a stopped shift can
  // never hand an empty plant over to the next cycle.
  finalSweep(state);
  if (settings.flags.emergencyStop) {
    prunePuffs(state);
    return;
  }
  stepPlasticLine(state, settings);
  stepTextileLine(state, settings);
  stepArm(state, settings);
  stepSilos(state, settings);
  stepCardboard(state, settings);
  stepBales(state);
  stepJobs(state);
  stepForklifts(state);
  stepReturnHome(state);
  prunePuffs(state);
}

export interface Keyframe {
  step: number;
  state: SimState;
}

/** Replay a shift from the nearest valid keyframe. Used for scrubbing and for the tests. */
export function stateAtStep(stepInCycle: number, log: readonly TimedCommand[], cache?: Keyframe[]): SimState {
  const target = Math.max(0, Math.min(stepInCycle, STEPS_PER_SHIFT - 1));
  let state: SimState | null = null;
  // Step 0 is the initial state; a keyframe at step k already contains steps 1..k.
  let from = 1;
  if (cache && cache.length) {
    const usable = cache.filter((frame) => frame.step <= target);
    const best = usable[usable.length - 1];
    if (best) {
      state = snapshot(best.state);
      from = best.step + 1;
    }
  }
  if (!state) state = createInitialState();
  for (let step = from; step <= target; step += 1) {
    state.step = step;
    state.time = step * SHIFT.STEP;
    stepOnce(state, settingsAt(log, step));
    if (cache && step < target && step % SHIFT.KEYFRAME_STEPS === 0) cache.push({ step, state: snapshot(state) });
  }
  return state;
}

export function invalidatedCache(cache: Keyframe[], command: TimedCommand): Keyframe[] {
  const at = stepOfTime(command.at);
  return cache.filter((frame) => frame.step < at);
}

/**
 * Drives the demo clock. Steps are only ever advanced in whole DT units, so the state for a given
 * step is identical no matter how it was reached: pausing, speeding up or scrubbing cannot change
 * the trajectory, and an intervention is applied at its recorded shift time on every replay.
 */
export class Simulation {
  private log: TimedCommand[] = [];
  private cache: Keyframe[] = [];
  private state: SimState = createInitialState();
  private step = 0;
  private accumulator = 0;

  get current(): SimState {
    return this.state;
  }

  get currentStep(): number {
    return this.step;
  }

  get completedCycles(): number {
    return Math.floor(this.step / STEPS_PER_SHIFT);
  }

  get timeInShift(): number {
    return (this.step % STEPS_PER_SHIFT) * SHIFT.STEP;
  }

  get commands(): readonly TimedCommand[] {
    return this.log;
  }

  reset(): void {
    this.state = createInitialState();
    this.step = 0;
    this.accumulator = 0;
    this.cache = [];
  }

  /** Record an intervention and replay so the change is visible at the current shift time. */
  addCommand(command: TimedCommand): void {
    this.log = [...this.log, command].sort((a, b) => a.at - b.at);
    this.cache = invalidatedCache(this.cache, command);
    // The command takes effect on its own step, so the current step has to be recomputed rather
    // than kept: replaying from the last surviving keyframe is what makes live play, scrubbing and
    // replay agree exactly.
    this.replayCurrentStep();
  }

  clearCommands(): void {
    this.log = [];
    this.cache = [];
    this.replayCurrentStep();
  }

  private replayCurrentStep(): void {
    const target = this.step;
    this.state = stateAtStep(target % STEPS_PER_SHIFT, this.log, this.cache);
    this.step = target;
    this.state.cycle = this.completedCycles;
    syncAnomalies(this.state, settingsAt(this.log, target % STEPS_PER_SHIFT));
  }

  seekToStep(target: number): void {
    const clamped = Math.max(0, target);
    const local = clamped % STEPS_PER_SHIFT;
    const currentLocal = this.step % STEPS_PER_SHIFT;
    if (clamped < this.step || local < currentLocal) {
      this.state = stateAtStep(local, this.log, this.cache);
      this.step = clamped;
    } else {
      this.stepForward(local - currentLocal);
    }
    this.state.step = local;
    this.state.time = local * SHIFT.STEP;
    this.state.cycle = this.completedCycles;
    syncAnomalies(this.state, settingsAt(this.log, local));
  }

  seekToTime(seconds: number): void {
    this.seekToStep(Math.round(seconds / SHIFT.STEP));
  }

  advanceBy(seconds: number): void {
    this.accumulator += seconds / SHIFT.STEP;
    const whole = Math.floor(this.accumulator);
    if (whole <= 0) return;
    this.accumulator -= whole;
    this.stepForward(whole);
  }

  private stepForward(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const next = this.step + 1;
      const local = next % STEPS_PER_SHIFT;
      if (local === 0) {
        // Cycle boundary: the plant returns to its initial physical state, so the loop is seamless.
        this.state = createInitialState();
      } else {
        this.state.step = local;
        this.state.time = local * SHIFT.STEP;
        stepOnce(this.state, settingsAt(this.log, local));
        if (local % SHIFT.KEYFRAME_STEPS === 0) this.cache.push({ step: local, state: snapshot(this.state) });
      }
      this.step = next;
    }
    this.state.cycle = this.completedCycles;
    syncAnomalies(this.state, settingsAt(this.log, this.step % STEPS_PER_SHIFT));
  }
}
