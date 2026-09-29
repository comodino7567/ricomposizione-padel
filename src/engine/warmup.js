import { roundTo } from './math.js';

// Ramp-up sets for the first exercise of a gym day: empty bar ×8, 50% ×5, 70% ×3, 85% ×1.
// The empty bar set only applies to barbell exercises.
export function rampSets(workingKg, exercise, rules) {
  const cfg = rules.warmupRamp;
  const isBarbell = exercise?.loadType === 'barbell';
  const step = isBarbell ? cfg.roundToKg : exercise?.incrementKg || cfg.roundToKg;
  const out = [];
  for (const s of cfg.sets) {
    if (s.emptyBar) {
      if (isBarbell) out.push({ label: s.label || 'Bilanciere vuoto', weightKg: cfg.emptyBarKg, reps: s.reps });
      continue;
    }
    let w = workingKg > 0 ? roundTo((workingKg * s.pct) / 100, step) : null;
    if (w != null && isBarbell) w = Math.max(w, cfg.emptyBarKg);
    out.push({ label: `${s.pct}%`, pct: s.pct, weightKg: w, reps: s.reps });
  }
  return out;
}
