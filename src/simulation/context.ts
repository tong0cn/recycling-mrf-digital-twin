import { createContext, useContext } from 'react';
import type { Simulation } from './index';

/**
 * The demo clock lives outside React state on purpose: the 3D scene reads it inside its own
 * animation frame, and only the panels re-render on a slow tick, so scrubbing 130 s of plant
 * animation never costs a React render per frame.
 */
export const SimulationContext = createContext<Simulation | null>(null);

export function useSimulation(): Simulation {
  const simulation = useContext(SimulationContext);
  if (!simulation) throw new Error('SimulationContext is missing');
  return simulation;
}
