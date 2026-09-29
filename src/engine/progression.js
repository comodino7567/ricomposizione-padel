import { diffDays } from './dates.js';
import { roundTo } from './math.js';

export function incrementFor(exercise, rules) {
  if (typeof exercise.incrementKg === 'number') return exercise.incrementKg;
  return rules.progression.defaultIncrementKg[exercise.loadType] ?? 0;
}

export function workingSets(entry) {
  return (entry?.sets || []).filter((s) => !s.exploratory);
}

// Working load of a logged entry = the load of its last working set.
export function loadOf(entry) {
  const ws = workingSets(entry);
  return ws.length ? ws[ws.length - 1].weightKg : null;
}

// For assisted exercises the number stored is the assistance: less is better.
function isHeavier(a, b, loadType) {
  return loadType === 'assisted' ? a < b : a > b;
}

/**
 * History of one exercise, oldest first:
 * [{ date, dayId, deload, prescribed, sets }]
 * Entries from the same program day are preferred (same slot, same rep range);
 * other days are used only when this slot has no history.
 */
export function exerciseHistory(sessions, exerciseId, dayId, beforeDate) {
  const all = [];
  for (const s of sessions) {
    if (beforeDate && s.date >= beforeDate) continue;
    for (const e of s.entries || []) {
      if (e.exerciseId !== exerciseId || !(e.sets || []).length) continue;
      all.push({ date: s.date, dayId: s.programDayId, deload: !!s.deload, prescribed: e.prescribed, sets: e.sets });
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  const same = all.filter((h) => h.dayId === dayId);
  return same.length ? same : all;
}

function countBelowMin(entry, fallback) {
  const min = entry.prescribed?.repMin ?? fallback.repMin;
  return workingSets(entry).filter((s) => s.reps < min).length;
}

export function lastIncreaseDate(working, loadType) {
  for (let i = working.length - 1; i > 0; i--) {
    const cur = loadOf(working[i]);
    const prev = loadOf(working[i - 1]);
    if (cur != null && prev != null && isHeavier(cur, prev, loadType)) return working[i].date;
  }
  return null;
}

/**
 * Double progression. Returns the target for the next session:
 * { weightKg, action, reason, targetReps? }
 * action: firstTime | start | increase | hold | reduce | addRep | holdInterval
 */
export function nextTarget({ exercise, prescribed, history, rules, today }) {
  const p = rules.progression;
  const inc = incrementFor(exercise, rules);
  const loadType = exercise.loadType;
  const working = history.filter((h) => !h.deload && workingSets(h).length);

  if (!working.length) {
    const exploratory = history.flatMap((h) => h.sets.filter((s) => s.exploratory));
    if (exploratory.length) {
      return { weightKg: exploratory[exploratory.length - 1].weightKg, action: 'start', reason: 'Carico dalla serie esplorativa' };
    }
    const anyLoad = history.length ? loadOf(history[history.length - 1]) : null;
    if (anyLoad != null) return { weightKg: anyLoad, action: 'hold', reason: 'Ultimo carico usato (scarico)' };
    return { weightKg: null, action: 'firstTime', reason: 'Prima seduta: inserisci il carico o usa "trova il carico"' };
  }

  const last = working[working.length - 1];
  const lastLoad = loadOf(last);
  const pr = { ...snapshotFallback(prescribed), ...(last.prescribed || {}) };

  // Stall: 2 consecutive sessions at the same load with >= 2 sets below the rep minimum.
  const n = p.failureConsecutiveSessions;
  if (working.length >= n) {
    const recent = working.slice(-n);
    const allFailed = recent.every((h) => countBelowMin(h, pr) >= p.failureMinSetsBelowMin);
    const sameLoad = recent.every((h) => loadOf(h) === lastLoad);
    if (allFailed && sameLoad) {
      let weightKg;
      if (loadType === 'assisted') {
        weightKg = lastLoad + (inc || 5);
      } else {
        weightKg = roundTo(lastLoad * (1 - p.failureReductionPct / 100), inc || 0.5);
        if (weightKg >= lastLoad && lastLoad > 0) weightKg = Math.max(0, roundTo(lastLoad - (inc || 0.5), 0.01));
      }
      return {
        weightKg,
        action: 'reduce',
        reason: `${n} sedute con almeno ${p.failureMinSetsBelowMin} serie sotto il minimo: carico −${p.failureReductionPct}% e si ricostruisce`,
      };
    }
  }

  const ws = workingSets(last);
  const enoughSets = !p.requireAllPrescribedSets || ws.length >= pr.sets;
  const allAtTop = ws.every((s) => s.reps >= pr.repMax && (s.rpe == null || s.rpe <= pr.rpeMax));

  if (enoughSets && allAtTop) {
    if (exercise.minDaysBetweenIncrements) {
      const lastInc = lastIncreaseDate(working, loadType);
      if (lastInc && today && diffDays(today, lastInc) < exercise.minDaysBetweenIncrements) {
        return {
          weightKg: lastLoad,
          action: 'holdInterval',
          reason: `Range completato, ma l'ultimo aumento è del ${lastInc}: massimo un aumento ogni ${exercise.minDaysBetweenIncrements} giorni`,
        };
      }
    }
    if (loadType === 'assisted') {
      if (lastLoad > 0) {
        return { weightKg: Math.max(0, roundTo(lastLoad - inc, 0.01)), action: 'increase', reason: `Range completato: un livello di assistenza in meno (−${inc} kg)` };
      }
      const best = Math.max(...ws.map((s) => s.reps));
      return { weightKg: 0, action: 'addRep', targetReps: best + 1, reason: 'Range completato senza assistenza: +1 ripetizione' };
    }
    if (!inc) {
      const best = Math.max(...ws.map((s) => s.reps));
      return { weightKg: lastLoad, action: 'addRep', targetReps: best + 1, reason: 'Range completato: +1 ripetizione' };
    }
    return {
      weightKg: roundTo(lastLoad + inc, 0.01),
      action: 'increase',
      reason: `Tutte le serie a ${pr.repMax} rip. con RPE ≤ ${pr.rpeMax}: +${inc} kg`,
    };
  }

  return { weightKg: lastLoad, action: 'hold', reason: `Stesso carico: punta a ${pr.repMax} rip. in tutte le serie` };
}

function snapshotFallback(prescribed) {
  if (!prescribed) return {};
  if ('repMin' in prescribed) return prescribed;
  return {
    sets: prescribed.sets,
    repMin: prescribed.repRange.min,
    repMax: prescribed.repRange.max,
    rpeMin: prescribed.rpeTarget.min,
    rpeMax: prescribed.rpeTarget.max,
  };
}

// First set at the top of the range with RPE <= 7: raise the load from set 2.
export function earlyRaiseSuggestion({ set, prescribed, exercise, rules, isDeload }) {
  if (isDeload || !set || set.exploratory) return null;
  const pr = snapshotFallback(prescribed);
  if (set.reps >= pr.repMax && typeof set.rpe === 'number' && set.rpe <= rules.progression.earlyRaiseMaxRpe) {
    const inc = incrementFor(exercise, rules);
    if (!inc) return null;
    if (exercise.loadType === 'assisted') {
      if (!(set.weightKg > 0)) return null;
      const w = Math.max(0, roundTo(set.weightKg - inc, 0.01));
      return { weightKg: w, message: `Prima serie facile (RPE ${set.rpe}): riduci l'assistenza a ${w} kg dalla seconda serie` };
    }
    const w = roundTo(set.weightKg + inc, 0.01);
    return { weightKg: w, message: `Prima serie facile (RPE ${set.rpe}): alza a ${w} kg dalla seconda serie` };
  }
  return null;
}

// Default reps shown for a set before logging.
export function defaultReps(target, prescribed, lastEntry, setIndex) {
  const pr = snapshotFallback(prescribed);
  if (pr.unit === 'm' || pr.repMin === pr.repMax) return pr.repMin;
  if (target?.action === 'addRep' && target.targetReps) return target.targetReps;
  if (target?.action === 'hold' && lastEntry) {
    const s = workingSets(lastEntry)[setIndex];
    if (s) return Math.min(Math.max(s.reps, pr.repMin), pr.repMax);
  }
  return pr.repMin;
}
