import { addDays, inRange } from './dates.js';
import { exerciseById } from './prescription.js';
import { workingSets } from './progression.js';

// Working sets actually logged in a week per tracked muscle group (primary only).
export function loggedVolume(sessions, program, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const out = Object.fromEntries(program.trackedMuscleGroups.map((g) => [g, 0]));
  for (const s of sessions) {
    if (!inRange(s.date, weekStart, weekEnd)) continue;
    for (const e of s.entries || []) {
      const ex = exerciseById(program, e.exerciseId);
      const n = workingSets(e).length;
      for (const g of ex?.muscleGroups.primary || []) if (g in out) out[g] += n;
    }
  }
  return out;
}

// Tonnage and best e1RM per session for one exercise.
export function sessionVolume(entry) {
  return workingSets(entry).reduce((a, s) => a + (s.weightKg || 0) * (s.reps || 0), 0);
}
