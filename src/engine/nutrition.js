import { addDays, diffDays } from './dates.js';
import { mean, round1 } from './math.js';
import { dayForDate } from './prescription.js';

export function dayKind(program, rules, date) {
  const day = dayForDate(program, date);
  return day && rules.nutrition.padelDayTypes.includes(day.type) ? 'padel' : 'gym';
}

// Average of the tracked setup days, proposed as maintenance kcal.
export function maintenanceFromDays(days, rules) {
  const valid = days.filter((d) => d && d.kcal > 0);
  if (valid.length < rules.nutrition.setupDays) return null;
  const step = rules.nutrition.maintenanceRoundKcal || 10;
  return Math.round(mean(valid.map((d) => d.kcal)) / step) * step;
}

// Weekly average delta is computed on the program's week (padel days vs gym days).
export function kcalTargets(maintenanceKcal, rules, program) {
  const n = rules.nutrition;
  const gym = maintenanceKcal + n.gymDayDeltaKcal;
  const padel = maintenanceKcal + n.padelDayDeltaKcal;
  const padelDays = program ? program.days.filter((d) => n.padelDayTypes.includes(d.type)).length : 3;
  const weeklyAvgDelta = ((7 - padelDays) * n.gymDayDeltaKcal + padelDays * n.padelDayDeltaKcal) / 7;
  return { gym, padel, weeklyAvgDelta: Math.round(weeklyAvgDelta) };
}

export function proteinTarget(weightKg, rules) {
  const n = rules.nutrition;
  if (!(weightKg > 0)) return null;
  return Math.round((weightKg * n.proteinPerKg) / n.proteinRoundG) * n.proteinRoundG;
}

function avgWeight(metrics, from, to) {
  const w = metrics.filter((m) => m.weightKg && m.date >= from && m.date <= to).map((m) => m.weightKg);
  return { avg: mean(w), count: w.length };
}

// Waist measurement closest to `ref` within the tolerance window.
export function waistNear(metrics, ref, toleranceDays) {
  let best = null;
  for (const m of metrics) {
    if (!m.waistCm) continue;
    const d = Math.abs(diffDays(m.date, ref));
    if (d > toleranceDays) continue;
    if (!best || d < best.d || (d === best.d && m.date > best.m.date)) best = { m, d };
  }
  return best ? best.m.waistCm : null;
}

/**
 * Biweekly nutrition check (Sunday):
 * weight average of last 2 weeks vs the 2 before, and waist change.
 * status: insufficientData | increase | decrease | working | noChange
 */
export function evaluateNutrition({ metrics, date, rules }) {
  const n = rules.nutrition;
  const recent = avgWeight(metrics, addDays(date, -13), date);
  const previous = avgWeight(metrics, addDays(date, -27), addDays(date, -14));
  const tol = n.waistToleranceDays;
  const waistNow = waistNear(metrics, date, tol);
  const waist2 = waistNear(metrics, addDays(date, -14), tol);
  const waist4 = waistNear(metrics, addDays(date, -28), tol);
  const waistChange2w = waistNow != null && waist2 != null ? round1(waistNow - waist2) : null;
  const waistChange4w = waistNow != null && waist4 != null ? round1(waistNow - waist4) : null;

  const base = { recentAvgKg: recent.avg, previousAvgKg: previous.avg, waistChange2w, waistChange4w, deltaKcal: 0 };

  if (recent.count < n.minWeighInsPerWindow || previous.count < n.minWeighInsPerWindow) {
    return { ...base, status: 'insufficientData', weeklyDeltaKg: null, message: `Servono almeno ${n.minWeighInsPerWindow} pesate in ciascuna delle due finestre di 2 settimane` };
  }

  const weeklyDeltaKg = Math.round(((recent.avg - previous.avg) / 2) * 100) / 100;
  const res = { ...base, weeklyDeltaKg };
  const fmt = (x) => `${x > 0 ? '+' : ''}${x.toFixed(2).replace('.', ',')} kg/settimana`;
  const waistDropping = waistChange2w != null && waistChange2w <= -n.waistDropCm;

  if (weeklyDeltaKg < -n.lossTooFastKgPerWeek) {
    return { ...res, status: 'increase', deltaKcal: n.adjustKcal, message: `Peso in calo troppo rapido (${fmt(weeklyDeltaKg)}): proposta +${n.adjustKcal} kcal` };
  }
  if (weeklyDeltaKg > n.gainTooFastKgPerWeek && !waistDropping) {
    const w = waistChange2w == null ? ' (vita non misurata)' : '';
    return { ...res, status: 'decrease', deltaKcal: -n.adjustKcal, message: `Peso in aumento (${fmt(weeklyDeltaKg)}) con vita che non scende${w}: proposta −${n.adjustKcal} kcal` };
  }
  if (Math.abs(weeklyDeltaKg) <= n.stableKgPerWeek) {
    if (waistDropping) {
      return { ...res, status: 'working', message: `Peso stabile e vita in calo di ${Math.abs(waistChange2w)} cm: sta funzionando, nessuna modifica` };
    }
    if (waistChange4w != null && Math.abs(waistChange4w) < n.waistDropCm) {
      return { ...res, status: 'decrease', deltaKcal: -n.adjustKcal, message: `Peso e vita stabili da ${n.stableWeeks} settimane: proposta −${n.adjustKcal} kcal` };
    }
  }
  return { ...res, status: 'noChange', message: 'Nessuna modifica' };
}
