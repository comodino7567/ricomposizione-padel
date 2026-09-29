import { diffDays, mondayOf, weekday } from './dates.js';

export function findDay(program, dayId) {
  return program.days.find((d) => d.id === dayId) || null;
}

export function dayForDate(program, date) {
  return program.days.find((d) => d.weekday === weekday(date)) || null;
}

export function exerciseById(program, id) {
  return program.exercises.find((e) => e.id === id) || null;
}

// Week of the current block (1..lengthWeeks), counted from settings.blockStartDate.
export function blockWeekFor(settings, date, rules) {
  const len = rules.block.lengthWeeks;
  if (!settings.blockStartDate) return settings.blockWeek || 1;
  const weeks = Math.floor(diffDays(mondayOf(date), mondayOf(settings.blockStartDate)) / 7);
  if (weeks < 0) return 1;
  return (weeks % len) + 1;
}

export function blockNumberFor(settings, date, rules) {
  if (!settings.blockStartDate) return 1;
  const weeks = Math.floor(diffDays(mondayOf(date), mondayOf(settings.blockStartDate)) / 7);
  return weeks < 0 ? 1 : Math.floor(weeks / rules.block.lengthWeeks) + 1;
}

// Cumulative sets added by the volume ramp to one block up to `blockWeek`
// (the ramp stops the week before the deload).
export function extraSetsFor(rules, dayId, blockId, blockWeek) {
  const lastRampWeek = rules.block.deloadWeek - 1;
  const upTo = Math.min(blockWeek, lastRampWeek);
  let n = 0;
  for (const [week, list] of Object.entries(rules.volumeRamp.additions || {})) {
    if (Number(week) <= upTo) {
      n += list.filter((a) => a.dayId === dayId && a.blockId === blockId).length;
    }
  }
  return n;
}

function prescribeBlock(block, day, rules, blockWeek, isDeload, rpeDelta) {
  if (block.kind === 'rehab') return { ...block };
  if (isDeload) {
    const peak = block.sets + extraSetsFor(rules, day.id, block.id, rules.deload.baseWeek);
    return {
      ...block,
      baseSets: block.sets,
      sets: Math.ceil(peak * rules.deload.setsFactor),
      rpeTarget: { ...rules.deload.rpeTarget },
      technique: rules.deload.removeTechniques ? 'none' : block.technique,
      techniqueSets: rules.deload.removeTechniques ? 0 : block.techniqueSets,
      deload: true,
    };
  }
  const rpe = block.rpeTarget;
  return {
    ...block,
    baseSets: block.sets,
    sets: block.sets + extraSetsFor(rules, day.id, block.id, blockWeek),
    rpeTarget: rpeDelta ? { min: rpe.min + rpeDelta, max: rpe.max + rpeDelta } : { ...rpe },
    deload: false,
  };
}

export function prescribeDay(program, rules, dayId, blockWeek, { rpeDelta = 0 } = {}) {
  const day = findDay(program, dayId);
  if (!day) throw new Error(`Giorno sconosciuto: ${dayId}`);
  const isDeload = blockWeek === rules.block.deloadWeek;
  const walkOnly = isDeload && (rules.deload.walkOnlyDays || []).includes(day.type);
  const blocks = walkOnly
    ? []
    : day.blocks.map((b) => prescribeBlock(b, day, rules, blockWeek, isDeload, isDeload ? 0 : rpeDelta));
  return { day, dayId, blockWeek, isDeload, walkOnly, blocks, rpeDelta: isDeload ? 0 : rpeDelta };
}

// Technique applied to a given set (0-based) of a prescribed block.
export function techniqueForSet(block, setIndex) {
  const t = block.technique || 'none';
  if (t === 'none') return 'none';
  const count = t === 'amrapLast' ? 1 : block.techniqueSets || 1;
  return setIndex >= block.sets - count ? t : 'none';
}

export function snapshotPrescription(block) {
  return {
    sets: block.sets,
    repMin: block.repRange.min,
    repMax: block.repRange.max,
    rpeMin: block.rpeTarget.min,
    rpeMax: block.rpeTarget.max,
    technique: block.technique || 'none',
    techniqueSets: block.techniqueSets || 0,
    restSec: block.restSec,
    unit: block.unit || 'reps',
    perSide: !!block.perSide,
    deload: !!block.deload,
  };
}

// Weekly planned sets per tracked muscle group (primary muscles only).
export function plannedVolume(program, rules, blockWeek, { substitutions = {}, skipDays = [] } = {}) {
  const out = Object.fromEntries(program.trackedMuscleGroups.map((g) => [g, 0]));
  for (const day of program.days) {
    if (!day.blocks.length || skipDays.includes(day.id)) continue;
    const plan = prescribeDay(program, rules, day.id, blockWeek);
    for (const b of plan.blocks) {
      if (b.kind === 'rehab') continue;
      const ex = exerciseById(program, substitutions[b.id] || b.exerciseId);
      for (const g of ex?.muscleGroups.primary || []) {
        if (g in out) out[g] += b.sets;
      }
    }
  }
  return out;
}

export function rehabStep(program, step) {
  const steps = program.rehab?.steps || [];
  return steps.find((s) => s.step === step) || steps[0] || null;
}
