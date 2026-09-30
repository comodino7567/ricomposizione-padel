import { describe, expect, it } from 'vitest';
import { blockWeekFor, plannedVolume, prescribeDay, techniqueForSet } from '../src/engine/prescription.js';
import { baseSettings, program, rules } from './helpers.js';

const setsOf = (dayId, week) => Object.fromEntries(prescribeDay(program, rules, dayId, week).blocks.map((b) => [b.id, b.sets]));

describe('weekly volume ramp', () => {
  it('week 1 matches the program table', () => {
    expect(plannedVolume(program, rules, 1)).toEqual({
      chest: 12, back: 16, sideDelts: 12, rearDelts: 6, biceps: 8, triceps: 8, traps: 6, quads: 3, hamsGlutes: 6, calves: 3,
    });
  });

  it('week 5 reaches chest 16, back 20, laterals 16, biceps 10, triceps 10', () => {
    const v = plannedVolume(program, rules, 5);
    expect(v).toMatchObject({ chest: 16, back: 20, sideDelts: 16, biceps: 10, triceps: 10 });
    expect(v).toMatchObject({ rearDelts: 6, traps: 6, quads: 3, hamsGlutes: 6, calves: 3 });
  });

  it('+1 chest/back/laterals per week from week 2 to 5', () => {
    const weeks = [1, 2, 3, 4, 5].map((w) => plannedVolume(program, rules, w));
    for (let i = 1; i < 5; i++) {
      expect(weeks[i].chest - weeks[i - 1].chest).toBe(1);
      expect(weeks[i].back - weeks[i - 1].back).toBe(1);
      expect(weeks[i].sideDelts - weeks[i - 1].sideDelts).toBe(1);
      expect(weeks[i].biceps + weeks[i].triceps - weeks[i - 1].biceps - weeks[i - 1].triceps).toBe(1);
    }
  });

  it('day rotation: week 2 Upper A, week 3 Upper B, week 4 Upper C, week 5 Upper A', () => {
    expect(setsOf('upperA', 2)).toMatchObject({ A3: 4, A4: 4, A5: 5, A7: 4, A8: 3 });
    expect(setsOf('upperB', 3)).toMatchObject({ B3: 4, B4: 4, B5: 5, B8: 4, B7: 3 });
    expect(setsOf('upperC', 4)).toMatchObject({ C1: 3, C2: 3, C3: 5 });
    expect(setsOf('upperB', 4)).toMatchObject({ B7: 4 });
    expect(setsOf('upperA', 5)).toMatchObject({ A3: 5, A4: 5, A5: 6, A7: 4, A8: 4 });
  });
});

describe('deload (week 6)', () => {
  const a6 = prescribeDay(program, rules, 'upperA', 6);

  it('half the sets rounded up, RPE 6-7, no techniques', () => {
    const byId = Object.fromEntries(a6.blocks.map((b) => [b.id, b]));
    expect(byId.A1.sets).toBe(2); // 4 → 2
    expect(byId.A3.sets).toBe(3); // 5 → 3
    expect(byId.A5.sets).toBe(3); // 6 → 3
    expect(byId.A9.sets).toBe(2); // 3 → 2
    for (const b of a6.blocks) {
      expect(b.rpeTarget).toEqual({ min: 6, max: 7 });
      expect(b.technique).toBe('none');
    }
    expect(a6.isDeload).toBe(true);
  });

  it('Upper C becomes walk only', () => {
    const c6 = prescribeDay(program, rules, 'upperC', 6);
    expect(c6.walkOnly).toBe(true);
    expect(c6.blocks).toHaveLength(0);
  });

  it('after week 6 the block restarts from week 1', () => {
    const s = baseSettings({ blockStartDate: '2026-09-28' });
    expect(blockWeekFor(s, '2026-09-29', rules)).toBe(1);
    expect(blockWeekFor(s, '2026-11-08', rules)).toBe(6);
    expect(blockWeekFor(s, '2026-11-09', rules)).toBe(1);
  });
});

describe('techniques and modifiers', () => {
  it('technique applies to the last N sets', () => {
    const c3 = prescribeDay(program, rules, 'upperC', 1).blocks.find((b) => b.id === 'C3');
    expect([0, 1, 2, 3].map((i) => techniqueForSet(c3, i))).toEqual(['none', 'none', 'dropset', 'dropset']);
    const a3 = prescribeDay(program, rules, 'upperA', 2).blocks.find((b) => b.id === 'A3');
    expect([0, 1, 2, 3].map((i) => techniqueForSet(a3, i))).toEqual(['none', 'none', 'none', 'amrapLast']);
  });

  it('RPE -1 modifier lowers every target', () => {
    const a = prescribeDay(program, rules, 'upperA', 1, { rpeDelta: -1 });
    expect(a.blocks.find((b) => b.id === 'A1').rpeTarget).toEqual({ min: 7, max: 7 });
  });
});
