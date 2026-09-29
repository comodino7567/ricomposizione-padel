import { addDays, inRange } from './dates.js';
import { mean, round1 } from './math.js';
import { evaluateNutrition } from './nutrition.js';
import { exerciseById } from './prescription.js';
import { exerciseHistory, loadOf, workingSets } from './progression.js';

function isHeavier(a, b, loadType) {
  return loadType === 'assisted' ? a < b : a > b;
}

// Exercises that went up this week vs their previous session (heavier load,
// or same load with more total reps).
export function progressedExercises(sessions, program, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const out = [];
  const seen = new Set();
  for (const s of sessions) {
    if (!inRange(s.date, weekStart, weekEnd) || s.deload) continue;
    for (const e of s.entries || []) {
      const key = `${s.programDayId}:${e.exerciseId}`;
      if (seen.has(key) || !workingSets(e).length) continue;
      seen.add(key);
      const ex = exerciseById(program, e.exerciseId);
      const prevList = exerciseHistory(sessions, e.exerciseId, s.programDayId, s.date).filter((h) => !h.deload && workingSets(h).length);
      const prev = prevList[prevList.length - 1];
      if (!prev) continue;
      const cur = loadOf(e);
      const old = loadOf(prev);
      const reps = (x) => workingSets(x).reduce((a, b) => a + b.reps, 0);
      if (isHeavier(cur, old, ex?.loadType) || (cur === old && reps(e) > reps(prev))) {
        out.push({ exerciseId: e.exerciseId, name: ex?.name || e.exerciseId, from: old, to: cur });
      }
    }
  }
  return out;
}

export function weekSummary({ weekStart, sessions, metrics, program }) {
  const weekEnd = addDays(weekStart, 6);
  const wm = metrics.filter((m) => inRange(m.date, weekStart, weekEnd));
  const ws = sessions.filter((s) => inRange(s.date, weekStart, weekEnd) && s.status === 'done');
  const pains = ws.filter((s) => typeof s.groinPain0to10 === 'number').map((s) => s.groinPain0to10);
  const waists = wm.filter((m) => m.waistCm).sort((a, b) => a.date.localeCompare(b.date));
  const r = (v) => (v == null ? null : round1(v));
  return {
    weekStart,
    avgWeightKg: r(mean(wm.map((m) => m.weightKg))),
    waistCm: waists.length ? waists[waists.length - 1].waistCm : null,
    avgSleepH: r(mean(wm.map((m) => m.sleepH))),
    restingHR: r(mean(wm.map((m) => m.restingHR))),
    sessionsDone: new Set(ws.map((s) => s.date)).size,
    maxGroinPain: pains.length ? Math.max(...pains) : null,
    exercisesProgressed: progressedExercises(sessions, program, weekStart),
  };
}

/**
 * Decisions proposed by the Sunday check. Each one is confirmed by the user.
 * `previous` holds summaries of earlier weeks, most recent first.
 */
export function proposeDecisions({ weekStart, summary, previous, metrics, injury, settings, rules, blockWeek }) {
  const w = rules.weekly;
  const nextWeek = addDays(weekStart, 7);
  const sunday = addDays(weekStart, 6);
  const out = [];

  // Sleep < 6.5 h for 2 consecutive weeks.
  const sleepWeeks = [summary, ...previous].slice(0, w.sleepConsecutiveWeeks);
  if (sleepWeeks.length === w.sleepConsecutiveWeeks && sleepWeeks.every((s) => s?.avgSleepH != null && s.avgSleepH < w.sleepMinH)) {
    out.push({
      id: `skipUpperC-${nextWeek}`, type: 'skipUpperC', weekStart: nextWeek,
      message: `Sonno medio sotto ${w.sleepMinH} h per ${w.sleepConsecutiveWeeks} settimane: togli Upper C domenica prossima.`,
    });
  }

  // Resting HR >= baseline (last 4 weeks) + 5.
  const baseline = mean(previous.slice(0, w.restingHrBaselineWeeks).map((s) => s?.restingHR));
  if (summary.restingHR != null && baseline != null && summary.restingHR >= baseline + w.restingHrDeltaBpm) {
    out.push({
      id: `rpeDelta-${nextWeek}`, type: 'rpeDelta', weekStart: nextWeek, delta: -w.rpeReduction,
      message: `FC a riposo ${summary.restingHR} contro media ${round1(baseline)}: la prossima settimana RPE target −${w.rpeReduction} su tutto.`,
    });
  }

  // Nutrition every 2 weeks.
  let nutrition = null;
  if (blockWeek % rules.nutrition.checkEveryWeeks === 0) {
    nutrition = evaluateNutrition({ metrics, date: sunday, rules });
    if (nutrition.deltaKcal) {
      out.push({ id: `kcal-${weekStart}`, type: 'kcalAdjust', delta: nutrition.deltaKcal, message: nutrition.message });
    } else if (nutrition.status === 'working') {
      out.push({ id: `info-kcal-${weekStart}`, type: 'info', message: nutrition.message });
    }
  }

  if (injury?.physioAlert) {
    out.push({
      id: `suspendPadel-${nextWeek}`, type: 'suspendPadel', weekStart: nextWeek,
      message: 'Dolore ≥ 5 due volte in 2 settimane: prenota una valutazione con un fisioterapista sportivo. Proposta: sospendi il padel per una settimana.',
    });
  }
  if (injury?.unlockProposal) {
    out.push({
      id: `unlock-${weekStart}`, type: 'unlockInjury',
      message: `Inguine a 0/10 da ${settings.injuryClearWeeks || rules.injury.clearWeeks} settimane: sblocca gli esercizi bloccati e uno stretching moderato degli adduttori.`,
    });
  }
  if (injury?.rehabAdvance) {
    out.push({
      id: `rehab-${weekStart}`, type: 'adductorStepUp', to: injury.rehabAdvanceTo,
      message: `Dolore 0-2/10 da 2 settimane: passa allo step ${injury.rehabAdvanceTo} del blocco riabilitazione.`,
    });
  }
  return { decisions: out, nutrition };
}

// Pure settings update for a confirmed decision.
export function applyDecision(settings, decision, date) {
  const s = { ...settings, modifiers: { ...(settings.modifiers || {}) } };
  const push = (key, v) => {
    const list = s.modifiers[key] || [];
    s.modifiers[key] = list.includes(v) ? list : [...list, v];
  };
  switch (decision.type) {
    case 'kcalAdjust':
      s.kcalAdjustment = (s.kcalAdjustment || 0) + decision.delta;
      if (s.kcalTargetGym != null) s.kcalTargetGym += decision.delta;
      if (s.kcalTargetPadel != null) s.kcalTargetPadel += decision.delta;
      break;
    case 'setMaintenance':
      s.maintenanceKcal = decision.kcal;
      s.kcalAdjustment = 0;
      s.kcalTargetGym = decision.gym;
      s.kcalTargetPadel = decision.padel;
      break;
    case 'skipUpperC':
      push('skipUpperCWeeks', decision.weekStart);
      break;
    case 'rpeDelta':
      push('rpeDeltaWeeks', decision.weekStart);
      break;
    case 'suspendPadel':
      push('padelSuspendedWeeks', decision.weekStart);
      break;
    case 'unlockInjury':
      s.injuryUnlocked = true;
      s.injuryUnlockedAt = date;
      break;
    case 'adductorStepUp':
      s.adductorStep = decision.to;
      s.adductorStepSince = date;
      s.adductorStepHistory = [...(s.adductorStepHistory || []), { date, step: decision.to, reason: 'avanzamento confermato' }];
      break;
    default:
      break;
  }
  return s;
}
