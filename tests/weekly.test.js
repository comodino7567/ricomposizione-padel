import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates.js';
import { applyDecision, proposeDecisions, weekSummary } from '../src/engine/weekly.js';
import { buildDayPlan } from '../src/engine/plan.js';
import { validateProgram, validateRules } from '../src/engine/validate.js';
import { baseSettings, clone, program, rules } from './helpers.js';

const WEEK = '2026-10-19';

function weekMetrics(weekStart, { sleep, hr, weight = 89 }) {
  return Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), weightKg: weight, sleepH: sleep, restingHR: hr }));
}

const propose = (summary, previous, extra = {}) =>
  proposeDecisions({ weekStart: WEEK, summary, previous, metrics: [], injury: null, settings: baseSettings(), rules, blockWeek: 1, ...extra }).decisions;

describe('weekly summary', () => {
  it('computes averages, sessions and max pain', () => {
    const sessions = [
      { date: '2026-10-19', programDayId: 'upperA', dayType: 'upperA', status: 'done', entries: [] },
      { date: '2026-10-20', programDayId: 'padelTue', dayType: 'padelTech', status: 'done', groinPain0to10: 2, entries: [] },
      { date: '2026-10-24', programDayId: 'match', dayType: 'padelMatch', status: 'done', groinPain0to10: 3, entries: [] },
      { date: '2026-10-25', programDayId: 'upperC', dayType: 'upperC', status: 'inProgress', entries: [] },
    ];
    const s = weekSummary({ weekStart: WEEK, sessions, metrics: weekMetrics(WEEK, { sleep: 7, hr: 55 }), program });
    expect(s).toMatchObject({ avgWeightKg: 89, avgSleepH: 7, restingHR: 55, sessionsDone: 3, maxGroinPain: 3 });
  });

  it('lists exercises that progressed', () => {
    const e = (w) => [{ exerciseId: 'bench_bb', sets: [{ weightKg: w, reps: 5, rpe: 8 }] }];
    const sessions = [
      { date: '2026-10-12', programDayId: 'upperA', entries: e(60), status: 'done' },
      { date: '2026-10-19', programDayId: 'upperA', entries: e(62.5), status: 'done' },
    ];
    const s = weekSummary({ weekStart: WEEK, sessions, metrics: [], program });
    expect(s.exercisesProgressed).toEqual([{ exerciseId: 'bench_bb', name: 'Panca piana bilanciere', from: 60, to: 62.5 }]);
  });
});

describe('weekly rules', () => {
  it('sleep < 6.5 h for 2 consecutive weeks: propose removing Upper C next week', () => {
    const d = propose({ avgSleepH: 6.2 }, [{ avgSleepH: 6.4 }]);
    expect(d.find((x) => x.type === 'skipUpperC')).toMatchObject({ weekStart: '2026-10-26' });
  });

  it('sleep low for only 1 week: nothing', () => {
    expect(propose({ avgSleepH: 6.2 }, [{ avgSleepH: 7 }]).some((x) => x.type === 'skipUpperC')).toBe(false);
  });

  it('resting HR >= 4-week average + 5: RPE −1 next week', () => {
    const prev = [{ restingHR: 55 }, { restingHR: 56 }, { restingHR: 54 }, { restingHR: 55 }];
    expect(propose({ restingHR: 60 }, prev).find((x) => x.type === 'rpeDelta')).toMatchObject({ delta: -1, weekStart: '2026-10-26' });
    expect(propose({ restingHR: 59 }, prev).some((x) => x.type === 'rpeDelta')).toBe(false);
  });

  it('nutrition is evaluated only every 2 weeks', () => {
    const metrics = Array.from({ length: 28 }, (_, i) => ({ date: addDays('2026-10-25', -27 + i), weightKg: i < 14 ? 89 : 87.6 }));
    const odd = proposeDecisions({ weekStart: WEEK, summary: {}, previous: [], metrics, injury: null, settings: baseSettings(), rules, blockWeek: 3 });
    const even = proposeDecisions({ weekStart: WEEK, summary: {}, previous: [], metrics, injury: null, settings: baseSettings(), rules, blockWeek: 4 });
    expect(odd.nutrition).toBeNull();
    expect(even.decisions.find((x) => x.type === 'kcalAdjust')).toMatchObject({ delta: 150 });
  });

  it('injury proposals are forwarded', () => {
    const d = propose({}, [], { injury: { physioAlert: true, unlockProposal: true, rehabAdvance: true, rehabAdvanceTo: 2 } });
    expect(d.map((x) => x.type)).toEqual(['suspendPadel', 'unlockInjury', 'adductorStepUp']);
  });
});

describe('confirmed decisions', () => {
  it('kcal adjustment moves both targets', () => {
    const s = applyDecision(baseSettings({ kcalTargetGym: 2850, kcalTargetPadel: 2600 }), { type: 'kcalAdjust', delta: -150 }, WEEK);
    expect(s).toMatchObject({ kcalTargetGym: 2700, kcalTargetPadel: 2450, kcalAdjustment: -150 });
  });

  it('RPE −1 and skip Upper C are applied to the plan of that week', () => {
    let s = applyDecision(baseSettings(), { type: 'rpeDelta', weekStart: '2026-10-26' }, WEEK);
    s = applyDecision(s, { type: 'skipUpperC', weekStart: '2026-10-26' }, WEEK);
    const mon = buildDayPlan({ program, rules, settings: s, date: '2026-10-26', sessions: [] });
    expect(mon.blocks[0].rpeTarget).toEqual({ min: 7, max: 7 });
    const sun = buildDayPlan({ program, rules, settings: s, date: '2026-11-01', sessions: [] });
    expect(sun.skipped).toBe(true);
    expect(sun.blocks).toHaveLength(0);
  });

  it('unlock and rehab step up', () => {
    expect(applyDecision(baseSettings(), { type: 'unlockInjury' }, WEEK).injuryUnlocked).toBe(true);
    expect(applyDecision(baseSettings(), { type: 'adductorStepUp', to: 2 }, WEEK)).toMatchObject({ adductorStep: 2, adductorStepSince: WEEK });
  });
});

describe('config validation', () => {
  it('shipped program.json and rules.json are valid', () => {
    expect(validateProgram(program)).toEqual([]);
    expect(validateRules(rules, program)).toEqual([]);
  });

  it('detects broken references', () => {
    const p = clone(program);
    p.days[0].blocks[0].exerciseId = 'nope';
    p.days[0].blocks[1].repRange = { min: 10, max: 5 };
    expect(validateProgram(p).length).toBe(2);
    const r = clone(rules);
    r.volumeRamp.additions['2'][0].blockId = 'Z9';
    delete r.nutrition.proteinPerKg;
    expect(validateRules(r, program).length).toBe(2);
  });
});
