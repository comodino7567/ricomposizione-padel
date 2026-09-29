import { addDays, diffDays } from './dates.js';

export const PAIN_DAY_TYPES = ['padelTech', 'padelMatch', 'lower'];
export const PADEL_TYPES = ['padelTech', 'padelMatch'];

export function painLogs(sessions) {
  return sessions
    .filter((s) => PAIN_DAY_TYPES.includes(s.dayType) && typeof s.groinPain0to10 === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function isFlagLog(log, rules) {
  const r = rules.injury;
  return log.groinPain0to10 >= r.painFlagMin || (r.over24hFlags && log.groinPainOver24h === true);
}

// Every one of the last `weeks` 7-day windows (ending on `date`) has at least one
// log and all logs satisfy `ok`.
export function weeksSatisfy(logs, date, weeks, ok) {
  for (let i = 0; i < weeks; i++) {
    const to = addDays(date, -7 * i);
    const from = addDays(to, -6);
    const inWindow = logs.filter((l) => l.date >= from && l.date <= to);
    if (!inWindow.length || !inWindow.every(ok)) return false;
  }
  return true;
}

/**
 * Injury state for a given date (the day being planned).
 * A flag (pain >= 4 or pain lasting > 24h) logged before `date` modifies the next
 * Lower session (squat → leg press) and the next padel session (60', no lateral work)
 * until a session of that kind has been logged after the flag.
 */
export function injuryState({ sessions, date, rules, settings }) {
  const r = rules.injury;
  const logs = painLogs(sessions);
  const past = logs.filter((l) => l.date < date);
  let lastFlag = null;
  for (const l of past) if (isFlagLog(l, rules)) lastFlag = l;

  let lowerSwapActive = false;
  let padelReducedActive = false;
  if (lastFlag) {
    const after = sessions.filter((s) => s.date > lastFlag.date && s.date < date);
    lowerSwapActive = !after.some((s) => s.dayType === 'lower');
    padelReducedActive = !after.some((s) => PADEL_TYPES.includes(s.dayType));
  }

  const windowStart = addDays(date, -(r.physioWindowDays - 1));
  const severe = logs.filter((l) => l.date >= windowStart && l.date <= date && l.groinPain0to10 >= r.physioPainMin);
  const physioAlert = severe.length >= r.physioCount;

  const clearWeeks = settings.injuryClearWeeks || r.clearWeeks;
  const painFree = weeksSatisfy(logs, date, clearWeeks, (l) => l.groinPain0to10 === 0 && l.groinPainOver24h !== true);
  const unlockProposal = painFree && !settings.injuryUnlocked;

  const step = settings.adductorStep || 1;
  const maxStep = 3;
  const daysAtStep = settings.adductorStepSince ? diffDays(date, settings.adductorStepSince) + 1 : Infinity;
  const advanceOk = weeksSatisfy(
    logs,
    date,
    r.rehabAdvanceWeeks,
    (l) => l.groinPain0to10 <= r.rehabAdvancePainMax && l.groinPainOver24h !== true,
  );
  const rehabAdvance = step < maxStep && daysAtStep >= r.rehabAdvanceWeeks * 7 && advanceOk;

  return {
    lastFlag,
    lowerSwapActive,
    padelReducedActive,
    physioAlert,
    severeCount: severe.length,
    painFree,
    unlockProposal,
    rehabAdvance,
    rehabAdvanceTo: rehabAdvance ? step + 1 : null,
    maxRecentPain: logs.filter((l) => l.date >= addDays(date, -6) && l.date <= date).reduce((m, l) => Math.max(m, l.groinPain0to10), 0),
  };
}

// Applied when a pain score is saved: above the rehab threshold, go back one step.
export function applyPainToRehab(settings, painScore, date, rules) {
  const step = settings.adductorStep || 1;
  if (painScore > rules.injury.rehabMaxPain && step > 1) {
    return {
      settings: {
        ...settings,
        adductorStep: step - 1,
        adductorStepSince: date,
        adductorStepHistory: [...(settings.adductorStepHistory || []), { date, step: step - 1, reason: `dolore ${painScore}/10` }],
      },
      changed: true,
      message: `Dolore ${painScore}/10: blocco riabilitazione tornato allo step ${step - 1}`,
    };
  }
  if (painScore > rules.injury.rehabMaxPain) {
    return { settings, changed: false, message: `Dolore ${painScore}/10: il blocco riabilitazione resta allo step 1` };
  }
  return { settings, changed: false, message: null };
}

// Sessions with a pain score whose "> 24h" answer is still pending.
export function pendingFollowUps(sessions, date, rules) {
  const from = addDays(date, -rules.injury.followUpDays);
  return painLogs(sessions).filter((l) => l.groinPainOver24h == null && l.date >= from && l.date < date);
}

export function isExerciseBlocked(exercise, settings) {
  return !!exercise?.blockedByInjury && !settings.injuryUnlocked;
}
