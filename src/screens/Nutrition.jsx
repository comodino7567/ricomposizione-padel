import { useEffect, useState } from 'preact/hooks';
import { db, upsertByDate } from '../db.js';
import { diffDays, formatDateIT, todayISO } from '../engine/dates.js';
import { dayKind, evaluateNutrition, kcalTargets, maintenanceFromDays, proteinTarget } from '../engine/nutrition.js';
import { applyDecision } from '../engine/weekly.js';
import { useApp, useLive } from '../hooks.js';
import { LineChart } from '../components/LineChart.jsx';
import { Check, fmtNum, Meter, NumInput } from '../components/ui.jsx';
import { latestWeight } from './Today.jsx';

export function Nutrition() {
  const { program, rules, settings, updateSettings, toast } = useApp();
  const rows = useLive(() => db.nutrition.orderBy('date').toArray(), [], []);
  const metrics = useLive(() => db.bodyMetrics.toArray(), [], []);
  const [date, setDate] = useState(todayISO());
  const current = rows.find((r) => r.date === date) || { date };
  const [form, setForm] = useState(current);
  useEffect(() => setForm(rows.find((r) => r.date === date) || { date }), [date, rows.length]);

  const n = rules.nutrition;
  const kind = dayKind(program, rules, date);
  const weight = latestWeight(metrics) || settings.startWeightKg;
  const protein = proteinTarget(weight, rules);
  const kcal = kind === 'padel' ? settings.kcalTargetPadel : settings.kcalTargetGym;
  const carbExtraG = Math.round((n.gymDayDeltaKcal - n.padelDayDeltaKcal) / 4);

  useEffect(() => {
    if (protein && protein !== settings.proteinTargetG) updateSettings({ proteinTargetG: protein });
  }, [protein]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  async function save() {
    const { kcal: k, proteinG, carbsG, fatG, creatineTaken, steps } = form;
    await upsertByDate('nutrition', date, { kcal: k ?? null, proteinG: proteinG ?? null, carbsG: carbsG ?? null, fatG: fatG ?? null, creatineTaken: !!creatineTaken, steps: steps ?? null });
    toast('Salvato');
  }
  async function toggleCreatine(v) {
    setForm((f) => ({ ...f, creatineTaken: v }));
    await upsertByDate('nutrition', date, { creatineTaken: v });
  }

  const last28 = rows.filter((r) => diffDays(todayISO(), r.date) <= 28 && r.kcal);
  const preview = evaluateNutrition({ metrics, date: todayISO(), rules });

  return (
    <div>
      <header class="topbar">
        <div class="grow">
          <h1>Nutrizione</h1>
          <div class="sub">{formatDateIT(date, true)} · giorno {kind === 'padel' ? 'padel' : 'palestra'}</div>
        </div>
        <input type="date" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} style={{ width: 150 }} />
      </header>

      {settings.maintenanceKcal == null ? (
        <MaintenanceSetup rows={rows} />
      ) : (
        <div class="card">
          <div class="row between">
            <div>
              <div class="tiny muted">Target di oggi</div>
              <div class="big num">{kcal} kcal</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div class="tiny muted">Proteine</div>
              <div class="big num">{protein} g</div>
            </div>
          </div>
          <p class="tiny muted">
            Mantenimento {settings.maintenanceKcal}{settings.kcalAdjustment ? ` (${settings.kcalAdjustment > 0 ? '+' : ''}${settings.kcalAdjustment} da check)` : ''} · palestra {settings.kcalTargetGym} · padel {settings.kcalTargetPadel}
            {kind === 'gym' ? ` · oggi circa +${carbExtraG} g di carboidrati rispetto ai giorni padel` : ''}
          </p>
        </div>
      )}

      <div class="card">
        <h3>Inserimento rapido</h3>
        <div class="grid2" style={{ marginTop: 8 }}>
          <label class="field"><span>Kcal</span><NumInput value={form.kcal} onChange={set('kcal')} /></label>
          <label class="field"><span>Proteine g</span><NumInput value={form.proteinG} onChange={set('proteinG')} /></label>
          <label class="field"><span>Carboidrati g</span><NumInput value={form.carbsG} onChange={set('carbsG')} /></label>
          <label class="field"><span>Grassi g</span><NumInput value={form.fatG} onChange={set('fatG')} /></label>
          <label class="field"><span>Passi</span><NumInput value={form.steps} onChange={set('steps')} /></label>
          <div style={{ alignSelf: 'end' }}>
            <Check checked={form.creatineTaken} onChange={toggleCreatine}>Creatina {n.creatineG} g</Check>
          </div>
        </div>
        <button class="btn primary block" style={{ marginTop: 10 }} onClick={save}>Salva</button>
        <div class="stack" style={{ marginTop: 12 }}>
          <Meter label="Kcal" value={form.kcal || 0} target={kcal} />
          <Meter label="Proteine g" value={form.proteinG || 0} target={protein} />
          <Meter label={`Passi (target ${n.stepsTarget.min}-${n.stepsTarget.max})`} value={form.steps || 0} target={n.stepsTarget.min} />
        </div>
      </div>

      <div class="card">
        <h3>Andamento 4 settimane</h3>
        <div class="lbl">Kcal</div>
        <LineChart series={[{ name: 'Kcal', color: 'var(--series-1)', points: last28.map((r) => ({ x: r.date, y: r.kcal })), dots: true }]} height={140} />
        <div class="lbl">Proteine g</div>
        <LineChart series={[{ name: 'Proteine', color: 'var(--series-3)', points: last28.filter((r) => r.proteinG).map((r) => ({ x: r.date, y: r.proteinG })), dots: true }]} height={120} />
        <p class="small muted">
          Creatina presa {last28.filter((r) => r.creatineTaken).length}/{Math.min(28, rows.filter((r) => diffDays(todayISO(), r.date) <= 28).length)} giorni registrati
        </p>
      </div>

      <div class="card">
        <h3>Check peso e vita (anteprima)</h3>
        <p class="small">{preview.message}</p>
        {preview.weeklyDeltaKg != null && (
          <p class="tiny muted">
            Media ultime 2 settimane {fmtNum(preview.recentAvgKg)} kg contro {fmtNum(preview.previousAvgKg)} kg ({fmtNum(preview.weeklyDeltaKg, 2)} kg/settimana)
            {preview.waistChange2w != null ? ` · vita ${preview.waistChange2w > 0 ? '+' : ''}${fmtNum(preview.waistChange2w)} cm in 2 settimane` : ''}
          </p>
        )}
        <p class="tiny muted">Le proposte di modifica arrivano nel check della domenica, ogni 2 settimane, e le confermi tu.</p>
      </div>

      {settings.maintenanceKcal != null && (
        <details class="card">
          <summary><h3>Rifai il setup del mantenimento</h3></summary>
          <MaintenanceSetup rows={rows} />
        </details>
      )}
    </div>
  );
}

function MaintenanceSetup({ rows }) {
  const { program, rules, settings, updateSettings, toast } = useApp();
  const need = rules.nutrition.setupDays;
  const lastTracked = rows.filter((r) => r.kcal).slice(-need);
  const [days, setDays] = useState(Array.from({ length: need }, () => ({})));
  const [override, setOverride] = useState(null);
  const proposed = maintenanceFromDays(days, rules);
  const value = override ?? proposed;
  const t = value ? kcalTargets(value, rules, program) : null;

  const setDay = (i, k, v) => setDays((d) => d.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function confirm() {
    await updateSettings((s) => applyDecision(s, { type: 'setMaintenance', kcal: value, gym: t.gym, padel: t.padel }, todayISO()));
    toast(`Mantenimento ${value} kcal confermato`);
  }

  return (
    <div class="card">
      <h3>Setup mantenimento</h3>
      <p class="small muted">Inserisci {need} giorni tracciati: la media diventa la proposta di mantenimento, poi confermi o correggi.</p>
      {lastTracked.length >= need && (
        <button class="btn small" onClick={() => setDays(lastTracked.map((r) => ({ kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG })))}>
          Usa gli ultimi {need} giorni registrati
        </button>
      )}
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>#</th><th>Kcal</th><th>P</th><th>C</th><th>G</th></tr></thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {['kcal', 'proteinG', 'carbsG', 'fatG'].map((k) => (
                <td key={k}><NumInput value={d[k]} onChange={(v) => setDay(i, k, v)} style={{ minHeight: 36, padding: '4px 6px' }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {proposed && (
        <div style={{ marginTop: 10 }}>
          <p>Proposta: <b>{proposed} kcal</b> di mantenimento.</p>
          <label class="field"><span>Correggi (facoltativo)</span><NumInput value={override} onChange={setOverride} placeholder={String(proposed)} /></label>
          <p class="small muted">Palestra {t.gym} kcal · padel/partite {t.padel} kcal · media settimanale circa {t.weeklyAvgDelta} kcal/giorno</p>
          <button class="btn primary block" onClick={confirm}>Conferma {value} kcal</button>
        </div>
      )}
      {settings.maintenanceKcal != null && <p class="tiny muted">Attuale: {settings.maintenanceKcal} kcal.</p>}
    </div>
  );
}
