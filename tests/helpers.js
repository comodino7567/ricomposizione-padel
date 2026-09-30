import program from '../public/program.json';
import rules from '../public/rules.json';

export { program, rules };

export const clone = (x) => JSON.parse(JSON.stringify(x));

export function ex(id) {
  return program.exercises.find((e) => e.id === id);
}

export function block(dayId, blockId) {
  return program.days.find((d) => d.id === dayId).blocks.find((b) => b.id === blockId);
}

export function prescribed(b) {
  return {
    sets: b.sets,
    repMin: b.repRange.min,
    repMax: b.repRange.max,
    rpeMin: b.rpeTarget?.min ?? null,
    rpeMax: b.rpeTarget?.max ?? null,
    unit: b.unit || 'reps',
    progression: b.progression || 'double',
    maxLoadKg: b.maxLoadKg ?? null,
  };
}

// sets: [[weight, reps, rpe], ...]
export function hist(date, b, sets, extra = {}) {
  return {
    date,
    dayId: extra.dayId || 'upperA',
    deload: !!extra.deload,
    prescribed: prescribed(b),
    sets: sets.map(([weightKg, reps, rpe]) => ({ weightKg, reps, rpe, exploratory: !!extra.exploratory })),
  };
}

export function baseSettings(extra = {}) {
  return {
    blockStartDate: '2026-09-28',
    adductorStep: 1,
    adductorStepSince: '2026-09-28',
    injuryClearWeeks: 4,
    injuryUnlocked: false,
    substitutions: {},
    modifiers: {},
    heightCm: 186,
    ...extra,
  };
}
