import { mondayOf } from './dates.js';
import { injuryState, isExerciseBlocked, PADEL_TYPES } from './injury.js';
import { blockNumberFor, blockWeekFor, dayForDate, exerciseById, findDay, prescribeDay, rehabStep, snapshotPrescription } from './prescription.js';
import { defaultReps, exerciseHistory, nextTarget } from './progression.js';
import { rampSets } from './warmup.js';

export function weekModifiers(settings, date, rules) {
  const ws = mondayOf(date);
  const m = settings.modifiers || {};
  return {
    rpeDelta: (m.rpeDeltaWeeks || []).includes(ws) ? -rules.weekly.rpeReduction : 0,
    skipUpperC: (m.skipUpperCWeeks || []).includes(ws),
    padelSuspended: (m.padelSuspendedWeeks || []).includes(ws),
  };
}

// Exercise used for a block: user substitution (if allowed), then injury swap.
export function resolveExercise(block, program, settings, rules, injury, dayType) {
  let exerciseId = block.exerciseId;
  let substitutedFrom = null;
  let injurySwap = null;
  const sub = settings.substitutions?.[block.id];
  if (sub) {
    const base = exerciseById(program, block.exerciseId);
    const subEx = exerciseById(program, sub);
    if (base?.substitutes.includes(sub) && subEx && !isExerciseBlocked(subEx, settings)) {
      exerciseId = sub;
      substitutedFrom = block.exerciseId;
    }
  }
  const swap = rules.injury.lowerSwap;
  if (dayType === 'lower' && injury?.lowerSwapActive && block.exerciseId === swap.from) {
    injurySwap = { from: exerciseId, to: swap.to };
    exerciseId = swap.to;
  }
  return { exerciseId, substitutedFrom, injurySwap };
}

/**
 * Full plan for a date: prescription (ramp/deload/modifiers), substitutions,
 * injury adjustments and progression targets from history.
 */
export function buildDayPlan({ program, rules, settings, date, sessions, dayId, bodyWeightKg }) {
  const day = dayId ? findDay(program, dayId) : dayForDate(program, date);
  if (!day) return null;
  const blockWeek = blockWeekFor(settings, date, rules);
  const blockNumber = blockNumberFor(settings, date, rules);
  const mods = weekModifiers(settings, date, rules);
  const pres = prescribeDay(program, rules, day.id, blockWeek, { rpeDelta: mods.rpeDelta });
  const injury = injuryState({ sessions, date, rules, settings });
  const alerts = [];

  if (pres.isDeload) alerts.push({ level: 'info', text: `Settimana ${blockWeek}: scarico. Metà delle serie, RPE 6-7, nessuna tecnica di intensità.` });
  if (mods.rpeDelta) alerts.push({ level: 'warn', text: `Frequenza a riposo alta: RPE target ${mods.rpeDelta} su tutto questa settimana.` });
  if (injury.physioAlert) alerts.push({ level: 'danger', text: 'Dolore ≥ 5 due volte nelle ultime 2 settimane: prenota una valutazione con un fisioterapista sportivo.' });

  const skipped = day.type === 'upperC' && mods.skipUpperC;
  if (skipped) alerts.push({ level: 'warn', text: 'Upper C tolta questa settimana (sonno insufficiente). Solo camminata.' });

  const isPadel = PADEL_TYPES.includes(day.type);
  let padel = null;
  if (isPadel) {
    const reduced = injury.padelReducedActive;
    padel = {
      suspended: mods.padelSuspended,
      reduced,
      durationMaxMin: reduced ? rules.injury.padelReducedMin : day.durationMin?.max,
      durationMinMin: reduced ? Math.min(rules.injury.padelReducedMin, day.durationMin?.min ?? 60) : day.durationMin?.min,
    };
    if (mods.padelSuspended) alerts.push({ level: 'danger', text: 'Padel sospeso questa settimana (decisione confermata nel check).' });
    if (reduced) alerts.push({ level: 'warn', text: `Inguine: seduta padel ridotta a ${rules.injury.padelReducedMin}' senza esercizi laterali.` });
  }
  if (day.type === 'lower' && injury.lowerSwapActive) {
    alerts.push({ level: 'warn', text: 'Inguine: oggi lo squat è sostituito dalla leg press e il blocco riabilitazione non avanza.' });
  }

  const blocks = (skipped ? [] : pres.blocks).map((b) => {
    if (b.kind === 'rehab') {
      return { ...b, rehab: rehabStep(program, settings.adductorStep || 1), maxPain: program.rehab?.maxPain };
    }
    const { exerciseId, substitutedFrom, injurySwap } = resolveExercise(b, program, settings, rules, injury, day.type);
    const exercise = exerciseById(program, exerciseId);
    const history = exerciseHistory(sessions, exerciseId, day.id, date);
    const target = nextTarget({ exercise, prescribed: b, history, rules, today: date });
    const lastEntry = history.length ? history[history.length - 1] : null;
    const reps = Array.from({ length: b.sets }, (_, i) => defaultReps(target, b, lastEntry, i));
    return {
      ...b,
      exerciseId,
      exercise,
      substitutedFrom,
      injurySwap,
      target,
      defaultReps: reps,
      lastEntry,
      prescribed: snapshotPrescription(b),
    };
  });

  let ramp = null;
  if (day.rampFirstExercise) {
    const first = blocks.find((b) => b.kind !== 'rehab');
    if (first) ramp = { exercise: first.exercise, sets: rampSets(first.target.weightKg, first.exercise, rules) };
  }

  return {
    date,
    day,
    blockWeek,
    blockNumber,
    isDeload: pres.isDeload,
    walkOnly: pres.walkOnly || skipped,
    skipped,
    blocks,
    ramp,
    padel,
    injury,
    alerts,
    modifiers: mods,
    bodyWeightKg,
  };
}
