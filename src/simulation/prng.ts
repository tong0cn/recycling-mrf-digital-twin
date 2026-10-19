/**
 * Deterministic PRNG. The whole demo must be reproducible from (shift time, intervention log),
 * so no code path may call Math.random().
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash so a decision depends only on its own seed material. */
export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const part of parts) {
    h ^= Math.imul(part | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
  }
  return h >>> 0;
}

/** Deterministic 0..1 draw for one (unit, decision point, salt) triple. */
export function draw(seed: number, unitId: number, salt: number): number {
  return mulberry32(hashSeed(seed, unitId, salt))();
}
