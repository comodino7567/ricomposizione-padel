import { useState } from 'preact/hooks';
import { db } from '../db.js';
import { bestE1rmOfSets, effectiveLoad } from '../engine/e1rm.js';
import { exerciseById } from '../engine/prescription.js';
import { workingSets } from '../engine/progression.js';
import { sessionVolume } from '../engine/volume.js';
import { useApp, useLive } from '../hooks.js';
import { LineChart } from '../components/LineChart.jsx';
import { fmtKg, fmtNum } from '../components/ui.jsx';
import { latestWeight } from './Today.jsx';

// Per-exercise series: best e1RM and tonnage per session, plus personal records.
export function exerciseStats(sessions, exercise, bodyWeightKg) {
  const points = [];
  let bestE1rm = null;
  let heaviest = null;
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.entries || []) {
      if (e.exerciseId !== exercise.id) continue;
      const ws = workingSets(e);
      if (!ws.length) continue;
      const v = bestE1rmOfSets(ws, exercise.loadType, bodyWeightKg);
      points.push({ date: s.date, e1rm: v, volume: sessionVolume(e), sets: ws.length });
      if (v != null && (!bestE1rm || v > bestE1rm.value)) bestE1rm = { value: v, date: s.date };
      for (const set of ws) {
        const load = effectiveLoad(set, exercise.loadType, bodyWeightKg);
        if (load != null && (!heaviest || load > heaviest.load || (load === heaviest.load && set.reps > heaviest.reps))) {
          heaviest = { load, reps: set.reps, date: s.date, weightKg: set.weightKg };
        }
      }
    }
  }
  return { points, bestE1rm, heaviest };
}

export function Progress() {
  const { program } = useApp();
  const sessions = useLive(() => db.sessions.toArray(), [], []);
  const metrics = useLive(() => db.bodyMetrics.toArray(), [], []);
  const bw = latestWeight(metrics);
  const used = [...new Set(sessions.flatMap((s) => (s.entries || []).filter((e) => workingSets(e).length).map((e) => e.exerciseId)))];
  const exercises = program.exercises.filter((e) => used.includes(e.id));
  const [sel, setSel] = useState(null);
  const current = exerciseById(program, sel) || exercises[0];

  if (!exercises.length) {
    return (
      <div>
        <header class="topbar"><h1>Progressi</h1></header>
        <p class="muted">Registra qualche seduta per vedere e1RM, volume e record.</p>
      </div>
    );
  }

  const st = exerciseStats(sessions, current, bw);
  const all = exercises.map((e) => ({ e, st: exerciseStats(sessions, e, bw) }));

  return (
    <div>
      <header class="topbar">
        <div class="grow">
          <h1>Progressi</h1>
          <div class="sub">e1RM = carico × (1 + (rip. + RIR) / 30)</div>
        </div>
      </header>

      <select value={current.id} onChange={(e) => setSel(e.currentTarget.value)}>
        {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      <div class="card">
        <div class="row between">
          <h3>e1RM stimato</h3>
          <span class="small muted num">{st.bestE1rm ? `record ${fmtNum(st.bestE1rm.value)} kg` : ''}</span>
        </div>
        {current.loadType === 'assisted' && <p class="tiny muted">Trazioni: carico effettivo = peso corporeo ({bw ?? '?'} kg) − assistenza.</p>}
        <LineChart series={[{ name: 'e1RM', color: 'var(--series-1)', points: st.points.map((p) => ({ x: p.date, y: p.e1rm != null ? Math.round(p.e1rm * 10) / 10 : null })), dots: true }]} yFormat={(v) => fmtNum(v, 0)} unit=" kg" />
      </div>

      <div class="card">
        <h3>Volume per seduta (kg × rip.)</h3>
        <LineChart series={[{ name: 'Volume', color: 'var(--series-3)', points: st.points.map((p) => ({ x: p.date, y: Math.round(p.volume) })), dots: true }]} height={140} yFormat={(v) => Math.round(v)} unit=" kg" />
        <div class="scroll-x">
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Data</th><th class="r">Serie</th><th class="r">e1RM</th><th class="r">Volume</th></tr></thead>
            <tbody>
              {[...st.points].reverse().slice(0, 12).map((p) => (
                <tr key={p.date}><td>{p.date}</td><td class="r num">{p.sets}</td><td class="r num">{p.e1rm ? fmtNum(p.e1rm) : '—'}</td><td class="r num">{Math.round(p.volume)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3>Record personali</h3>
        <div class="scroll-x">
          <table>
            <thead><tr><th>Esercizio</th><th class="r">e1RM</th><th class="r">Serie più pesante</th></tr></thead>
            <tbody>
              {all.map(({ e, st: s }) => (
                <tr key={e.id} onClick={() => setSel(e.id)} style={{ cursor: 'pointer' }}>
                  <td>{e.name}</td>
                  <td class="r num">{s.bestE1rm ? fmtNum(s.bestE1rm.value) : '—'}</td>
                  <td class="r num">
                    {s.heaviest ? (e.loadType === 'assisted' ? `ass. ${fmtKg(s.heaviest.weightKg)} × ${s.heaviest.reps}` : `${fmtKg(s.heaviest.load)} × ${s.heaviest.reps}`) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
