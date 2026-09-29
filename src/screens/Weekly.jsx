import { useState } from 'preact/hooks';
import { db } from '../db.js';
import { addDays, formatDateIT, mondayOf, todayISO } from '../engine/dates.js';
import { toCSV } from '../engine/csv.js';
import { injuryState } from '../engine/injury.js';
import { blockWeekFor } from '../engine/prescription.js';
import { applyDecision, proposeDecisions, weekSummary } from '../engine/weekly.js';
import { useApp, useLive } from '../hooks.js';
import { download, fmtKg, fmtNum, NumInput, Stat } from '../components/ui.jsx';

function withManual(summary, stored) {
  const m = stored?.manual || {};
  return {
    ...summary,
    avgSleepH: summary.avgSleepH ?? m.avgSleepH ?? null,
    restingHR: summary.restingHR ?? m.restingHR ?? null,
  };
}

export function Weekly() {
  const { program, rules, settings, updateSettings, toast } = useApp();
  const sessions = useLive(() => db.sessions.toArray(), [], null);
  const metrics = useLive(() => db.bodyMetrics.toArray(), [], null);
  const checks = useLive(() => db.weeklyChecks.toArray(), [], null);
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [manual, setManual] = useState({});
  if (!sessions || !metrics || !checks) return <p class="muted">Caricamento…</p>;

  const stored = checks.find((c) => c.weekStart === weekStart);
  const sunday = addDays(weekStart, 6);
  const blockWeek = blockWeekFor(settings, weekStart, rules);
  const summaryOf = (ws) => withManual(weekSummary({ weekStart: ws, sessions, metrics, program }), checks.find((c) => c.weekStart === ws));
  const summary = withManual(summaryOf(weekStart), { manual: { ...(stored?.manual || {}), ...manual } });
  const previous = [1, 2, 3, 4].map((i) => summaryOf(addDays(weekStart, -7 * i)));
  const injury = injuryState({ sessions, date: sunday, rules, settings });
  const { decisions, nutrition } = proposeDecisions({ weekStart, summary, previous, metrics, injury, settings, rules, blockWeek });
  const confirmed = new Set((stored?.confirmedDecisions || []).map((d) => d.id));
  const dismissed = new Set(stored?.dismissedDecisions || []);
  const isNutritionWeek = blockWeek % rules.nutrition.checkEveryWeeks === 0;

  async function persist(extra = {}) {
    const row = {
      weekStart,
      avgWeightKg: summary.avgWeightKg,
      waistCm: summary.waistCm,
      avgSleepH: summary.avgSleepH,
      restingHR: summary.restingHR,
      sessionsDone: summary.sessionsDone,
      maxGroinPain: summary.maxGroinPain,
      exercisesProgressed: summary.exercisesProgressed,
      proposedDecisions: decisions,
      confirmedDecisions: stored?.confirmedDecisions || [],
      dismissedDecisions: stored?.dismissedDecisions || [],
      manual: { ...(stored?.manual || {}), ...manual },
      blockWeek,
      savedAt: new Date().toISOString(),
      ...extra,
    };
    await db.weeklyChecks.put(row);
    return row;
  }

  async function confirmDecision(d) {
    await updateSettings((s) => applyDecision(s, d, todayISO()));
    await persist({ confirmedDecisions: [...(stored?.confirmedDecisions || []), { ...d, confirmedAt: new Date().toISOString() }] });
    toast('Decisione confermata');
  }

  async function dismiss(d) {
    await persist({ dismissedDecisions: [...(stored?.dismissedDecisions || []), d.id] });
  }

  async function exportReport() {
    const row = await persist();
    download(`check-${weekStart}.json`, JSON.stringify(row, null, 2));
  }

  return (
    <div>
      <header class="topbar no-print">
        <button class="btn small ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Settimana precedente">‹</button>
        <div class="grow center">
          <h1>Check settimanale</h1>
          <div class="sub">{formatDateIT(weekStart)} – {formatDateIT(sunday)} · sett. {blockWeek}/6</div>
        </div>
        <button class="btn small ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Settimana successiva">›</button>
      </header>
      <div class="print-only">
        <h1>Check settimanale {formatDateIT(weekStart)} – {formatDateIT(sunday)}</h1>
        <p>Settimana {blockWeek} di 6</p>
      </div>

      <div class="card">
        <h3>Riepilogo</h3>
        <div class="stats" style={{ marginTop: 8 }}>
          <Stat k="Peso medio" v={summary.avgWeightKg != null ? `${fmtNum(summary.avgWeightKg)} kg` : '—'} />
          {isNutritionWeek && <Stat k="Vita" v={summary.waistCm != null ? `${fmtNum(summary.waistCm)} cm` : '—'} />}
          <Stat k="Sonno medio" v={summary.avgSleepH != null ? `${fmtNum(summary.avgSleepH)} h` : '—'} />
          <Stat k="FC a riposo" v={summary.restingHR != null ? fmtNum(summary.restingHR, 0) : '—'} />
          <Stat k="Sedute fatte" v={`${summary.sessionsDone}/7`} />
          <Stat k="Dolore inguine max" v={summary.maxGroinPain != null ? `${summary.maxGroinPain}/10` : '—'} />
        </div>
        {(summary.avgSleepH == null || summary.restingHR == null) && (
          <div class="grid2 no-print" style={{ marginTop: 10 }}>
            {summary.avgSleepH == null && <label class="field"><span>Sonno medio (manuale)</span><NumInput value={manual.avgSleepH} onChange={(v) => setManual((m) => ({ ...m, avgSleepH: v }))} /></label>}
            {summary.restingHR == null && <label class="field"><span>FC riposo (manuale)</span><NumInput value={manual.restingHR} onChange={(v) => setManual((m) => ({ ...m, restingHR: v }))} /></label>}
          </div>
        )}
        <h3 style={{ marginTop: 12 }}>Esercizi progrediti ({summary.exercisesProgressed.length})</h3>
        {summary.exercisesProgressed.length ? (
          <ul class="small">
            {summary.exercisesProgressed.map((e) => (
              <li key={e.exerciseId}>{e.name}: {fmtKg(e.from)} → {fmtKg(e.to)} kg</li>
            ))}
          </ul>
        ) : (
          <p class="small muted">Nessuno questa settimana.</p>
        )}
      </div>

      <div class="card">
        <h3>Decisioni proposte</h3>
        {nutrition && nutrition.status !== 'working' && !nutrition.deltaKcal && <p class="small muted">Nutrizione: {nutrition.message}</p>}
        {!isNutritionWeek && <p class="tiny muted">Check peso/vita non previsto questa settimana (ogni {rules.nutrition.checkEveryWeeks}).</p>}
        {decisions.length === 0 && <p class="small muted">Nessuna modifica proposta.</p>}
        {decisions.map((d) => (
          <div key={d.id} class={`alert ${d.type === 'info' ? 'good' : d.type === 'suspendPadel' ? 'danger' : 'warn'}`}>
            <div class="grow">
              <div class="small">{d.message}</div>
              {confirmed.has(d.id) && <div class="tiny" style={{ color: 'var(--good)' }}>✓ confermata</div>}
              {dismissed.has(d.id) && <div class="tiny muted">ignorata</div>}
            </div>
            {d.type !== 'info' && !confirmed.has(d.id) && !dismissed.has(d.id) && (
              <div class="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button class="btn small primary" onClick={() => confirmDecision(d)}>Conferma</button>
                <button class="btn small ghost" onClick={() => dismiss(d)}>Ignora</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div class="row wrap no-print">
        <button class="btn primary" onClick={async () => { await persist(); toast('Check salvato'); }}>Salva check</button>
        <button class="btn" onClick={() => window.print()}>Stampa report</button>
        <button class="btn" onClick={exportReport}>Esporta JSON</button>
        <button class="btn" onClick={() => download('weekly-checks.csv', toCSV(checks), 'text/csv')}>CSV storico</button>
      </div>

      {checks.length > 0 && (
        <div class="card no-print">
          <h3>Storico check</h3>
          <table>
            <thead><tr><th>Settimana</th><th class="r">Peso</th><th class="r">Sonno</th><th class="r">FC</th><th class="r">Sedute</th><th class="r">Dolore</th></tr></thead>
            <tbody>
              {[...checks].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).map((c) => (
                <tr key={c.weekStart} onClick={() => setWeekStart(c.weekStart)} style={{ cursor: 'pointer' }}>
                  <td>{c.weekStart}{c.seed ? <span class="seed-mark"> esempio</span> : null}</td>
                  <td class="r num">{c.avgWeightKg ?? ''}</td>
                  <td class="r num">{c.avgSleepH ?? ''}</td>
                  <td class="r num">{c.restingHR ?? ''}</td>
                  <td class="r num">{c.sessionsDone}</td>
                  <td class="r num">{c.maxGroinPain ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
