import { describe, expect, it } from 'vitest';
import { e1rm } from '../src/engine/e1rm.js';
import { defaultReps, earlyRaiseSuggestion, exerciseHistory, nextTarget } from '../src/engine/progression.js';
import { rampSets } from '../src/engine/warmup.js';
import { block, ex, hist, rules } from './helpers.js';

const bench = ex('bench_bb');
const benchBlock = block('upperA', 'A1'); // 4 × 5-8 @ 8
const target = (exercise, b, history, today = '2026-10-05') => nextTarget({ exercise, prescribed: b, history, rules, today });

describe('double progression', () => {
  it('first session asks for a load', () => {
    const t = target(bench, benchBlock, []);
    expect(t.action).toBe('firstTime');
    expect(t.weightKg).toBeNull();
  });

  it('exploratory set gives the starting load but does not count for progression', () => {
    const h = [hist('2026-09-28', benchBlock, [[60, 8, 6]], { exploratory: true })];
    const t = target(bench, benchBlock, h);
    expect(t.action).toBe('start');
    expect(t.weightKg).toBe(60);
  });

  it('all sets at the top of the range with RPE <= target: +2.5 kg on barbell', () => {
    const h = [hist('2026-09-28', benchBlock, [[60, 8, 7], [60, 8, 7.5], [60, 8, 8], [60, 8, 8]])];
    const t = target(bench, benchBlock, h);
    expect(t.action).toBe('increase');
    expect(t.weightKg).toBe(62.5);
  });

  it('RPE above target on one set: hold', () => {
    const h = [hist('2026-09-28', benchBlock, [[60, 8, 7], [60, 8, 8], [60, 8, 8], [60, 8, 9]])];
    expect(target(bench, benchBlock, h).action).toBe('hold');
  });

  it('one set below the top of the range: hold at the last load', () => {
    const h = [hist('2026-09-28', benchBlock, [[60, 8, 8], [60, 8, 8], [60, 7, 8], [60, 6, 8]])];
    const t = target(bench, benchBlock, h);
    expect(t.action).toBe('hold');
    expect(t.weightKg).toBe(60);
  });

  it('fewer sets than prescribed does not progress', () => {
    const h = [hist('2026-09-28', benchBlock, [[60, 8, 7], [60, 8, 7], [60, 8, 7]])];
    expect(target(bench, benchBlock, h).action).toBe('hold');
  });

  it('dumbbells progress by 2 kg per hand', () => {
    const b = block('upperA', 'A3');
    const h = [hist('2026-09-28', b, [[22, 12, 8], [22, 12, 9], [22, 14, 9]])];
    expect(target(ex('incline_db'), b, h).weightKg).toBe(24);
  });

  it('machines use the exercise increment', () => {
    const b = block('upperA', 'A4');
    const h = [hist('2026-09-28', b, [[50, 12, 9], [50, 12, 9], [50, 12, 9]])];
    expect(target(ex('lat_pulldown_wide'), b, h).weightKg).toBe(52.5);
  });

  it('2 consecutive sessions with >= 2 sets below minimum: -10% rounded to the increment', () => {
    const h = [
      hist('2026-09-21', benchBlock, [[70, 5, 9], [70, 4, 10], [70, 4, 10], [70, 3, 10]]),
      hist('2026-09-28', benchBlock, [[70, 5, 9], [70, 5, 10], [70, 4, 10], [70, 4, 10]]),
    ];
    const t = target(bench, benchBlock, h);
    expect(t.action).toBe('reduce');
    expect(t.weightKg).toBe(62.5); // 63 → nearest 2.5
  });

  it('a single bad session does not reduce', () => {
    const h = [
      hist('2026-09-21', benchBlock, [[70, 6, 9], [70, 5, 9], [70, 5, 9], [70, 5, 9]]),
      hist('2026-09-28', benchBlock, [[70, 5, 9], [70, 4, 10], [70, 4, 10], [70, 3, 10]]),
    ];
    expect(target(bench, benchBlock, h).action).toBe('hold');
  });

  it('failures at different loads do not reduce twice', () => {
    const h = [
      hist('2026-09-14', benchBlock, [[70, 4, 10], [70, 4, 10], [70, 3, 10], [70, 3, 10]]),
      hist('2026-09-21', benchBlock, [[70, 4, 10], [70, 4, 10], [70, 3, 10], [70, 3, 10]]),
      hist('2026-09-28', benchBlock, [[62.5, 4, 10], [62.5, 4, 10], [62.5, 4, 10], [62.5, 4, 10]]),
    ];
    expect(target(bench, benchBlock, h).action).toBe('hold');
  });

  it('deload sessions are ignored for progression', () => {
    const h = [
      hist('2026-09-21', benchBlock, [[60, 8, 8], [60, 8, 8], [60, 8, 8], [60, 8, 8]]),
      hist('2026-09-28', benchBlock, [[60, 5, 6], [60, 5, 6]], { deload: true }),
    ];
    const t = target(bench, benchBlock, h);
    expect(t.action).toBe('increase');
    expect(t.weightKg).toBe(62.5);
  });

  it('assisted pull-ups: one assistance level less', () => {
    const b = block('upperB', 'B2');
    const h = [hist('2026-09-24', b, [[20, 10, 8], [20, 10, 9], [20, 10, 9], [20, 10, 9]], { dayId: 'upperB' })];
    const t = target(ex('pullup'), b, h);
    expect(t.action).toBe('increase');
    expect(t.weightKg).toBe(15);
  });

  it('pull-ups without assistance: +1 rep', () => {
    const b = block('upperB', 'B2');
    const h = [hist('2026-09-24', b, [[0, 10, 8], [0, 10, 9], [0, 10, 9], [0, 10, 9]], { dayId: 'upperB' })];
    const t = target(ex('pullup'), b, h);
    expect(t.action).toBe('addRep');
    expect(t.targetReps).toBe(11);
  });

  it('assisted stall adds assistance', () => {
    const b = block('upperB', 'B2');
    const h = [
      hist('2026-09-17', b, [[10, 5, 10], [10, 4, 10], [10, 4, 10], [10, 3, 10]], { dayId: 'upperB' }),
      hist('2026-09-24', b, [[10, 5, 10], [10, 4, 10], [10, 4, 10], [10, 3, 10]], { dayId: 'upperB' }),
    ];
    expect(target(ex('pullup'), b, h)).toMatchObject({ action: 'reduce', weightKg: 15 });
  });

  it('neck: at most +1.25 kg every 2 weeks', () => {
    const b = block('upperC', 'C5');
    const neck = ex('neck_flex_ext');
    const top = (w) => [[w, 20, 7], [w, 20, 7]];
    const h = [hist('2026-09-20', b, top(5), { dayId: 'upperC' }), hist('2026-09-27', b, top(6.25), { dayId: 'upperC' })];
    const t = target(neck, b, h, '2026-10-04');
    expect(t.action).toBe('holdInterval');
    expect(t.weightKg).toBe(6.25);
    const later = target(neck, b, h, '2026-10-11');
    expect(later).toMatchObject({ action: 'increase', weightKg: 7.5 });
  });
});

describe('home Lower: fixed dumbbells, bodyweight, quality work', () => {
  const split = block('lower', 'L4'); // 3 × 8-12, max 6 kg
  const splitEx = ex('split_squat_db');

  it('first session starts from the available load', () => {
    expect(target(splitEx, split, [])).toMatchObject({ action: 'start', weightKg: 6 });
  });

  it('range completed at the max available load: harder variant, same load', () => {
    const h = [hist('2026-09-30', split, [[6, 12, 8], [6, 12, 8], [6, 12, 8]], { dayId: 'lower' })];
    expect(target(splitEx, split, h)).toMatchObject({ action: 'variant', weightKg: 6 });
  });

  it('no early raise beyond the max available load', () => {
    expect(earlyRaiseSuggestion({ set: { weightKg: 6, reps: 12, rpe: 6 }, prescribed: split, exercise: splitEx, rules })).toBeNull();
  });

  it('stall at a fixed load suggests an easier variant, not −10%', () => {
    const h = [
      hist('2026-09-23', split, [[6, 6, 10], [6, 6, 10], [6, 5, 10]], { dayId: 'lower' }),
      hist('2026-09-30', split, [[6, 6, 10], [6, 6, 10], [6, 5, 10]], { dayId: 'lower' }),
    ];
    expect(target(splitEx, split, h)).toMatchObject({ action: 'reduce', weightKg: 6 });
  });

  it('jumps have no load progression', () => {
    const cmj = block('lower', 'L2');
    const h = [hist('2026-09-30', cmj, [[0, 3, null], [0, 3, null], [0, 3, null], [0, 3, null]], { dayId: 'lower' })];
    expect(target(ex('cmj_stick'), cmj, h)).toMatchObject({ action: 'quality', weightKg: null });
  });

  it('bodyweight exercises start without asking for a load; plank adds 5 seconds', () => {
    const plank = block('lower', 'L10');
    expect(target(ex('plank'), plank, [])).toMatchObject({ action: 'hold', weightKg: 0 });
    const h = [hist('2026-09-30', plank, [[0, 30, 8], [0, 30, 8], [0, 30, 8]], { dayId: 'lower' })];
    h[0].prescribed.unit = 's';
    expect(target(ex('plank'), plank, h)).toMatchObject({ action: 'addRep', targetReps: 35 });
  });
});

describe('early raise within the session', () => {
  it('first set at top of range with RPE <= 7 suggests +increment', () => {
    const s = earlyRaiseSuggestion({ set: { weightKg: 60, reps: 8, rpe: 7 }, prescribed: benchBlock, exercise: bench, rules });
    expect(s.weightKg).toBe(62.5);
  });
  it('no suggestion at RPE 8', () => {
    expect(earlyRaiseSuggestion({ set: { weightKg: 60, reps: 8, rpe: 8 }, prescribed: benchBlock, exercise: bench, rules })).toBeNull();
  });
  it('no suggestion during deload', () => {
    expect(earlyRaiseSuggestion({ set: { weightKg: 60, reps: 8, rpe: 6 }, prescribed: benchBlock, exercise: bench, rules, isDeload: true })).toBeNull();
  });
});

describe('defaults and history', () => {
  it('default reps: minimum after an increase, last reps when holding', () => {
    const last = hist('2026-09-28', benchBlock, [[60, 8, 8], [60, 7, 8], [60, 6, 9], [60, 6, 9]]);
    expect(defaultReps({ action: 'increase' }, benchBlock, last, 0)).toBe(5);
    expect(defaultReps({ action: 'hold' }, benchBlock, last, 1)).toBe(7);
  });

  it('history prefers the same program day and excludes the current date', () => {
    const sessions = [
      { date: '2026-09-21', programDayId: 'upperA', entries: [{ exerciseId: 'pushdown_rope', sets: [{ weightKg: 20, reps: 12 }] }] },
      { date: '2026-09-27', programDayId: 'upperC', entries: [{ exerciseId: 'pushdown_rope', sets: [{ weightKg: 25, reps: 12 }] }] },
      { date: '2026-09-28', programDayId: 'upperA', entries: [{ exerciseId: 'pushdown_rope', sets: [{ weightKg: 22.5, reps: 12 }] }] },
    ];
    const h = exerciseHistory(sessions, 'pushdown_rope', 'upperA', '2026-09-28');
    expect(h.map((x) => x.date)).toEqual(['2026-09-21']);
  });
});

describe('e1RM and ramp-up sets', () => {
  it('Epley corrected for RPE', () => {
    expect(e1rm(100, 5, 8)).toBeCloseTo(123.33, 2);
    expect(e1rm(100, 1, 10)).toBeCloseTo(103.33, 2);
  });
  it('ramp: empty bar ×8, 50/70/85% rounded to 2.5 kg', () => {
    const r = rampSets(80, bench, rules);
    expect(r.map((s) => [s.weightKg, s.reps])).toEqual([[20, 8], [40, 5], [55, 3], [67.5, 1]]);
  });
  it('ramp on a machine skips the empty bar', () => {
    const r = rampSets(40, ex('pec_deck'), rules);
    expect(r).toHaveLength(3);
    expect(r[0].weightKg).toBe(20);
  });
});
