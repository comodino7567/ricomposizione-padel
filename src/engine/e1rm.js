// Epley corrected for RPE: e1RM = load × (1 + (reps + RIR) / 30), RIR = 10 − RPE.
export function e1rm(weightKg, reps, rpe) {
  if (!(weightKg > 0) || !(reps > 0)) return null;
  const rir = typeof rpe === 'number' ? Math.max(0, 10 - rpe) : 0;
  return weightKg * (1 + (reps + rir) / 30);
}

// Actual load moved: assisted exercises subtract the assistance from body weight.
export function effectiveLoad(set, loadType, bodyWeightKg) {
  if (loadType === 'assisted') {
    if (!bodyWeightKg) return null;
    return Math.max(0, bodyWeightKg - (set.weightKg || 0));
  }
  if (loadType === 'bodyweight') return bodyWeightKg || null;
  return set.weightKg;
}

export function bestE1rmOfSets(sets, loadType, bodyWeightKg) {
  let best = null;
  for (const s of sets) {
    if (s.exploratory) continue;
    const load = effectiveLoad(s, loadType, bodyWeightKg);
    const v = e1rm(load, s.reps, s.rpe);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}
