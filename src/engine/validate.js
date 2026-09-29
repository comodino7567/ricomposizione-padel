const LOAD_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'assisted', 'plate'];
const DAY_TYPES = ['upperA', 'lower', 'upperB', 'upperC', 'padelTech', 'padelMatch'];
const TECHNIQUES = ['none', 'dropset', 'myoreps', 'eccentric4s', 'amrapLast'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Returns a list of human-readable errors (empty = valid).
export function validateProgram(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['program.json non è un oggetto'];
  if (!Array.isArray(p.exercises)) errors.push('exercises deve essere un array');
  if (!Array.isArray(p.days)) errors.push('days deve essere un array');
  if (!Array.isArray(p.trackedMuscleGroups)) errors.push('trackedMuscleGroups deve essere un array');
  if (errors.length) return errors;

  const ids = new Set();
  for (const e of p.exercises) {
    const where = `esercizio "${e.id}"`;
    if (!e.id || typeof e.id !== 'string') errors.push('esercizio senza id');
    if (ids.has(e.id)) errors.push(`id duplicato: ${e.id}`);
    ids.add(e.id);
    if (!e.name) errors.push(`${where}: manca name`);
    if (!LOAD_TYPES.includes(e.loadType)) errors.push(`${where}: loadType non valido (${e.loadType})`);
    if (!isNum(e.incrementKg) || e.incrementKg < 0) errors.push(`${where}: incrementKg non valido`);
    if (!e.muscleGroups || !Array.isArray(e.muscleGroups.primary)) errors.push(`${where}: muscleGroups.primary mancante`);
    if (!Array.isArray(e.substitutes)) errors.push(`${where}: substitutes deve essere un array`);
  }
  for (const e of p.exercises) {
    for (const s of e.substitutes || []) if (!ids.has(s)) errors.push(`esercizio "${e.id}": sostituto sconosciuto ${s}`);
  }

  const weekdays = new Set();
  const dayIds = new Set();
  for (const d of p.days) {
    const where = `giorno "${d.id}"`;
    if (dayIds.has(d.id)) errors.push(`giorno duplicato: ${d.id}`);
    dayIds.add(d.id);
    if (!DAY_TYPES.includes(d.type)) errors.push(`${where}: type non valido (${d.type})`);
    if (!Number.isInteger(d.weekday) || d.weekday < 1 || d.weekday > 7) errors.push(`${where}: weekday deve essere 1-7`);
    if (weekdays.has(d.weekday)) errors.push(`${where}: weekday ${d.weekday} già usato`);
    weekdays.add(d.weekday);
    for (const w of d.warmup || []) if (!p.warmups?.[w]) errors.push(`${where}: riscaldamento sconosciuto ${w}`);
    if (!Array.isArray(d.blocks)) {
      errors.push(`${where}: blocks deve essere un array`);
      continue;
    }
    const blockIds = new Set();
    for (const b of d.blocks) {
      const bw = `${where}, blocco ${b.id}`;
      if (!b.id) errors.push(`${where}: blocco senza id`);
      if (blockIds.has(b.id)) errors.push(`${bw}: id duplicato`);
      blockIds.add(b.id);
      if (b.kind === 'rehab') continue;
      if (!ids.has(b.exerciseId)) errors.push(`${bw}: esercizio sconosciuto ${b.exerciseId}`);
      if (!Number.isInteger(b.sets) || b.sets < 1) errors.push(`${bw}: sets deve essere un intero ≥ 1`);
      if (!b.repRange || !isNum(b.repRange.min) || !isNum(b.repRange.max) || b.repRange.min > b.repRange.max) errors.push(`${bw}: repRange non valido`);
      if (!b.rpeTarget || !isNum(b.rpeTarget.min) || !isNum(b.rpeTarget.max) || b.rpeTarget.min > b.rpeTarget.max) errors.push(`${bw}: rpeTarget non valido`);
      if (!isNum(b.restSec)) errors.push(`${bw}: restSec mancante`);
      if (!TECHNIQUES.includes(b.technique || 'none')) errors.push(`${bw}: technique non valida (${b.technique})`);
    }
  }
  const steps = p.rehab?.steps;
  if (!Array.isArray(steps) || steps.length !== 3) errors.push('rehab.steps deve contenere 3 step');
  return errors;
}

const REQUIRED_RULES = [
  'block.lengthWeeks', 'block.deloadWeek',
  'progression.earlyRaiseMaxRpe', 'progression.failureConsecutiveSessions', 'progression.failureMinSetsBelowMin', 'progression.failureReductionPct',
  'warmupRamp.emptyBarKg', 'warmupRamp.roundToKg',
  'deload.setsFactor', 'deload.baseWeek', 'deload.rpeTarget.min', 'deload.rpeTarget.max',
  'nutrition.gymDayDeltaKcal', 'nutrition.padelDayDeltaKcal', 'nutrition.proteinPerKg', 'nutrition.proteinRoundG', 'nutrition.setupDays',
  'nutrition.checkEveryWeeks', 'nutrition.lossTooFastKgPerWeek', 'nutrition.gainTooFastKgPerWeek', 'nutrition.stableKgPerWeek',
  'nutrition.waistDropCm', 'nutrition.adjustKcal', 'nutrition.minWeighInsPerWindow', 'nutrition.waistToleranceDays',
  'injury.painFlagMin', 'injury.padelReducedMin', 'injury.physioPainMin', 'injury.physioCount', 'injury.physioWindowDays',
  'injury.clearWeeks', 'injury.rehabMaxPain', 'injury.rehabAdvancePainMax', 'injury.rehabAdvanceWeeks', 'injury.followUpDays',
  'weekly.sleepMinH', 'weekly.sleepConsecutiveWeeks', 'weekly.restingHrDeltaBpm', 'weekly.restingHrBaselineWeeks', 'weekly.rpeReduction',
];

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function validateRules(r, program) {
  if (!r || typeof r !== 'object') return ['rules.json non è un oggetto'];
  const errors = [];
  for (const path of REQUIRED_RULES) if (!isNum(getPath(r, path))) errors.push(`rules.${path} deve essere un numero`);
  if (!r.progression?.defaultIncrementKg) errors.push('rules.progression.defaultIncrementKg mancante');
  if (!Array.isArray(r.warmupRamp?.sets)) errors.push('rules.warmupRamp.sets deve essere un array');
  if (!r.volumeRamp?.additions || typeof r.volumeRamp.additions !== 'object') errors.push('rules.volumeRamp.additions mancante');
  if (!r.injury?.lowerSwap?.from || !r.injury?.lowerSwap?.to) errors.push('rules.injury.lowerSwap mancante');
  if (!program?.days || !r.volumeRamp?.additions || !r.injury?.lowerSwap) return errors;
  for (const [week, list] of Object.entries(r.volumeRamp.additions)) {
    for (const a of list) {
      const day = program.days.find((d) => d.id === a.dayId);
      if (!day) errors.push(`volumeRamp settimana ${week}: giorno sconosciuto ${a.dayId}`);
      else if (!day.blocks.some((b) => b.id === a.blockId)) errors.push(`volumeRamp settimana ${week}: blocco sconosciuto ${a.blockId}`);
    }
  }
  const ids = new Set(program.exercises.map((e) => e.id));
  for (const k of ['from', 'to']) if (!ids.has(r.injury.lowerSwap[k])) errors.push(`rules.injury.lowerSwap.${k}: esercizio sconosciuto`);
  return errors;
}
