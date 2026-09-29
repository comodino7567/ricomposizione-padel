import { describe, expect, it } from 'vitest';
import { bodyComposition, navyBodyFatPct } from '../src/engine/bodyfat.js';
import { addDays } from '../src/engine/dates.js';
import { dayKind, evaluateNutrition, kcalTargets, maintenanceFromDays, proteinTarget } from '../src/engine/nutrition.js';
import { program, rules } from './helpers.js';

const SUNDAY = '2026-10-25';

// 28 days of weigh-ins: first 14 at `w0`, last 14 at `w1`; waist at -28, -14, 0.
function metrics(w0, w1, waists = [null, null, null]) {
  const out = [];
  for (let i = 27; i >= 0; i--) {
    const date = addDays(SUNDAY, -i);
    out.push({ date, weightKg: i >= 14 ? w0 : w1 });
  }
  const at = [-28, -14, 0];
  waists.forEach((w, k) => {
    if (w == null) return;
    const date = addDays(SUNDAY, at[k]);
    const m = out.find((x) => x.date === date);
    if (m) m.waistCm = w;
    else out.push({ date, waistCm: w });
  });
  return out;
}

const evalN = (m) => evaluateNutrition({ metrics: m, date: SUNDAY, rules });

describe('nutrition targets', () => {
  it('maintenance = average of 4 tracked days, rounded to 10', () => {
    expect(maintenanceFromDays([{ kcal: 2800 }, { kcal: 2950 }, { kcal: 3100 }, { kcal: 2735 }], rules)).toBe(2900);
    expect(maintenanceFromDays([{ kcal: 2800 }, { kcal: 2950 }], rules)).toBeNull();
  });

  it('gym day = maintenance − 50, padel day = maintenance − 300, weekly ≈ −150', () => {
    const t = kcalTargets(2900, rules, program);
    expect(t.gym).toBe(2850);
    expect(t.padel).toBe(2600);
    expect(t.weeklyAvgDelta).toBe(-157);
  });

  it('protein = 2.1 g/kg rounded to 5 g (89 kg → 185 g)', () => {
    expect(proteinTarget(89, rules)).toBe(185);
    expect(proteinTarget(92, rules)).toBe(195);
  });

  it('day kind follows the weekly schedule', () => {
    expect(dayKind(program, rules, '2026-09-28')).toBe('gym'); // Monday
    expect(dayKind(program, rules, '2026-09-29')).toBe('padel'); // Tuesday
    expect(dayKind(program, rules, '2026-10-03')).toBe('padel'); // Saturday
    expect(dayKind(program, rules, '2026-10-04')).toBe('gym'); // Sunday
  });
});

describe('biweekly nutrition check', () => {
  it('weight dropping faster than 0.5 kg/week: +150 kcal', () => {
    const r = evalN(metrics(89, 87.6));
    expect(r.weeklyDeltaKg).toBe(-0.7);
    expect(r).toMatchObject({ status: 'increase', deltaKcal: 150 });
  });

  it('weight rising > 0.3 kg/week with waist not dropping: −150 kcal', () => {
    const r = evalN(metrics(89, 90, [null, 92, 92]));
    expect(r).toMatchObject({ status: 'decrease', deltaKcal: -150 });
  });

  it('weight rising but waist dropping ≥ 1 cm: no change', () => {
    expect(evalN(metrics(89, 90, [null, 93, 91.5])).status).toBe('noChange');
  });

  it('stable weight and waist −1 cm: working', () => {
    const r = evalN(metrics(89, 89.2, [93, 92.5, 91.5]));
    expect(r).toMatchObject({ status: 'working', deltaKcal: 0 });
  });

  it('stable weight and stable waist for 4 weeks: −150 kcal', () => {
    const r = evalN(metrics(89, 89.1, [92, 92.2, 91.8]));
    expect(r).toMatchObject({ status: 'decrease', deltaKcal: -150 });
  });

  it('not enough weigh-ins: no proposal', () => {
    expect(evalN([{ date: SUNDAY, weightKg: 89 }]).status).toBe('insufficientData');
  });
});

describe('US Navy body fat', () => {
  it('matches the formula', () => {
    const expected = 495 / (1.0324 - 0.19077 * Math.log10(92 - 40) + 0.15456 * Math.log10(186)) - 450;
    expect(navyBodyFatPct(92, 40, 186)).toBeCloseTo(expected, 6);
    expect(navyBodyFatPct(92, 40, 186)).toBeCloseTo(18.85, 1);
  });

  it('fat and lean mass', () => {
    const c = bodyComposition(89, 20);
    expect(c.fatKg).toBeCloseTo(17.8, 5);
    expect(c.leanKg).toBeCloseTo(71.2, 5);
  });

  it('invalid measures return null', () => {
    expect(navyBodyFatPct(40, 40, 186)).toBeNull();
    expect(navyBodyFatPct(null, 40, 186)).toBeNull();
  });
});
