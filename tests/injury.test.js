import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates.js';
import { applyPainToRehab, injuryState, pendingFollowUps } from '../src/engine/injury.js';
import { buildDayPlan } from '../src/engine/plan.js';
import { baseSettings, clone, program, rules } from './helpers.js';

const log = (date, dayType, pain, over24h = false) => ({ date, dayType, programDayId: dayType, groinPain0to10: pain, groinPainOver24h: over24h, status: 'done', entries: [] });
const state = (sessions, date, extra) => injuryState({ sessions, date, rules, settings: baseSettings(extra) });

describe('pain flags', () => {
  it('pain >= 4 removes the explosive work from the next Lower and reduces the next padel', () => {
    const sessions = [log('2026-10-03', 'padelMatch', 4)];
    const s = state(sessions, '2026-10-07');
    expect(s.lowerSwapActive).toBe(true);
    expect(s.padelReducedActive).toBe(true);

    const plan = buildDayPlan({ program, rules, settings: baseSettings(), date: '2026-10-07', sessions });
    const skipped = plan.blocks.filter((b) => b.skippedForInjury).map((b) => b.id);
    expect(skipped).toEqual(['L1', 'L2', 'L3']);
    expect(plan.alerts.some((a) => a.text.includes('esplosivo'))).toBe(true);

    const padel = buildDayPlan({ program, rules, settings: baseSettings(), date: '2026-10-06', sessions });
    expect(padel.padel).toMatchObject({ reduced: true, durationMaxMin: 60 });
  });

  it('a squat in the Lower day is still swapped for the leg press', () => {
    const p = clone(program);
    p.days.find((d) => d.id === 'lower').blocks[3].exerciseId = 'squat_bb';
    const plan = buildDayPlan({ program: p, rules, settings: baseSettings(), date: '2026-10-07', sessions: [log('2026-10-03', 'padelMatch', 4)] });
    expect(plan.blocks[3].exerciseId).toBe('leg_press');
  });

  it('without flags the explosive work is there', () => {
    const plan = buildDayPlan({ program, rules, settings: baseSettings(), date: '2026-10-07', sessions: [] });
    expect(plan.blocks.some((b) => b.skippedForInjury)).toBe(false);
  });

  it('pain lasting > 24h also flags, even when low', () => {
    expect(state([log('2026-10-03', 'padelMatch', 2, true)], '2026-10-07').lowerSwapActive).toBe(true);
  });

  it('pain 3 without > 24h does not flag', () => {
    expect(state([log('2026-10-03', 'padelMatch', 3)], '2026-10-07').lowerSwapActive).toBe(false);
  });

  it('the adjustment applies only to the next session of that kind', () => {
    const sessions = [log('2026-10-03', 'padelMatch', 5), log('2026-10-07', 'lower', 1)];
    const s = state(sessions, '2026-10-14');
    expect(s.lowerSwapActive).toBe(false);
    expect(s.padelReducedActive).toBe(true); // no padel logged yet after the flag
  });

  it('a flag logged today does not change today', () => {
    expect(state([log('2026-10-07', 'lower', 6)], '2026-10-07').lowerSwapActive).toBe(false);
  });
});

describe('physiotherapist alert', () => {
  it('pain >= 5 twice within 14 days', () => {
    const sessions = [log('2026-09-26', 'padelMatch', 5), log('2026-10-03', 'padelMatch', 6)];
    expect(state(sessions, '2026-10-04').physioAlert).toBe(true);
  });
  it('twice but more than 14 days apart: no alert', () => {
    const sessions = [log('2026-09-12', 'padelMatch', 5), log('2026-10-03', 'padelMatch', 6)];
    expect(state(sessions, '2026-10-04').physioAlert).toBe(false);
  });
});

describe('unlock after 4 pain-free weeks', () => {
  const zeros = (end, weeks) => Array.from({ length: weeks * 2 }, (_, i) => log(addDays(end, -i * 3.5 | 0), 'padelTech', 0));

  it('proposes unlocking after 4 consecutive weeks at 0', () => {
    expect(state(zeros('2026-10-25', 4), '2026-10-25').unlockProposal).toBe(true);
  });
  it('a single non-zero log in the window prevents it', () => {
    const s = [...zeros('2026-10-25', 4), log('2026-10-10', 'lower', 1)];
    expect(state(s, '2026-10-25').unlockProposal).toBe(false);
  });
  it('a week without logs prevents it', () => {
    const s = zeros('2026-10-25', 4).filter((l) => !(l.date >= '2026-10-05' && l.date <= '2026-10-11'));
    expect(state(s, '2026-10-25').unlockProposal).toBe(false);
  });
  it('not proposed again once unlocked', () => {
    expect(state(zeros('2026-10-25', 4), '2026-10-25', { injuryUnlocked: true }).unlockProposal).toBe(false);
  });
  it('blocked exercises cannot be chosen as substitutes until unlocked', () => {
    const blocked = program.exercises.filter((e) => e.blockedByInjury).map((e) => e.id);
    expect(blocked).toEqual(['lateral_lunge', 'sumo_deadlift', 'lateral_bounds', 'adductor_machine_heavy', 'hanging_leg_raise', 'adductor_static_stretch']);
  });
});

describe('rehab steps', () => {
  it('pain > 3 goes back one step', () => {
    const r = applyPainToRehab(baseSettings({ adductorStep: 2 }), 4, '2026-10-07', rules);
    expect(r.settings.adductorStep).toBe(1);
    expect(r.changed).toBe(true);
  });
  it('pain 3 keeps the step', () => {
    expect(applyPainToRehab(baseSettings({ adductorStep: 2 }), 3, '2026-10-07', rules).settings.adductorStep).toBe(2);
  });
  it('step 1 stays at 1', () => {
    expect(applyPainToRehab(baseSettings({ adductorStep: 1 }), 6, '2026-10-07', rules).settings.adductorStep).toBe(1);
  });
  it('advance proposed after 2 weeks at 0-2/10 on the current step', () => {
    const sessions = [log('2026-09-30', 'lower', 1), log('2026-10-03', 'padelMatch', 2), log('2026-10-07', 'lower', 0), log('2026-10-10', 'padelMatch', 2)];
    const s = state(sessions, '2026-10-11', { adductorStep: 1, adductorStepSince: '2026-09-28' });
    expect(s.rehabAdvance).toBe(true);
    expect(s.rehabAdvanceTo).toBe(2);
  });
  it('no advance if the step started less than 2 weeks ago', () => {
    const sessions = [log('2026-09-30', 'lower', 1), log('2026-10-07', 'lower', 0)];
    expect(state(sessions, '2026-10-11', { adductorStepSince: '2026-10-05' }).rehabAdvance).toBe(false);
  });
  it('no advance with pain 3', () => {
    const sessions = [log('2026-09-30', 'lower', 3), log('2026-10-07', 'lower', 0)];
    expect(state(sessions, '2026-10-11').rehabAdvance).toBe(false);
  });
  it('rehab block shows the current step', () => {
    const plan = buildDayPlan({ program, rules, settings: baseSettings({ adductorStep: 2 }), date: '2026-09-30', sessions: [] });
    expect(plan.blocks.find((b) => b.kind === 'rehab').rehab.step).toBe(2);
  });
});

describe('explosive progression follows the rehab step', () => {
  const note = (extra) => buildDayPlan({ program, rules, settings: baseSettings(extra), date: '2026-10-07', sessions: [] }).blocks.find((b) => b.id === 'L2').stepNote;
  it('shows the note for the current step', () => {
    expect(note({ adductorStep: 1 })).toMatch(/^Step 1/);
    expect(note({ adductorStep: 3 })).toMatch(/^Step 3/);
    expect(note({ adductorStep: 3, injuryUnlocked: true })).toMatch(/laterali/);
  });
});

describe('follow-up question (> 24h)', () => {
  it('lists recent pain logs without the > 24h answer', () => {
    const sessions = [{ ...log('2026-10-03', 'padelMatch', 2), groinPainOver24h: null }];
    expect(pendingFollowUps(sessions, '2026-10-04', rules)).toHaveLength(1);
    expect(pendingFollowUps(sessions, '2026-10-10', rules)).toHaveLength(0);
  });
});
