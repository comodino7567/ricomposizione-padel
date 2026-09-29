function cell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  return lines.join('\r\n');
}

// One row per logged set: the most useful shape for spreadsheets.
export function sessionsToSetRows(sessions, program) {
  const names = Object.fromEntries(program.exercises.map((e) => [e.id, e.name]));
  const rows = [];
  for (const s of sessions) {
    for (const e of s.entries || []) {
      (e.sets || []).forEach((set, i) => {
        rows.push({
          date: s.date,
          programDayId: s.programDayId,
          blockWeek: s.blockWeek,
          deload: !!s.deload,
          exerciseId: e.exerciseId,
          exerciseName: names[e.exerciseId] || e.exerciseId,
          set: i + 1,
          weightKg: set.weightKg,
          reps: set.reps,
          rpe: set.rpe,
          exploratory: !!set.exploratory,
          technique: set.technique || '',
          dropReps: set.dropReps ?? '',
          miniSets: set.miniSets ? set.miniSets.join('+') : '',
          seed: !!s.seed,
        });
      });
    }
  }
  return rows;
}
