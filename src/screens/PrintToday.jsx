import { formatDateIT, todayISO } from '../engine/dates.js';
import { PADEL_TYPES } from '../engine/injury.js';
import { hashParam, useApp } from '../hooks.js';
import { fmtKg } from '../components/ui.jsx';
import { useDayPlan } from './Today.jsx';

const range = (r) => (r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`);

export function PrintToday() {
  const { program } = useApp();
  const date = hashParam('d') || todayISO();
  const { plan } = useDayPlan(date);
  if (!plan) return <p class="muted">Caricamento…</p>;
  const warmup = (plan.day.warmup || []).flatMap((k) => program.warmups[k] || []);
  const maxSets = Math.max(0, ...plan.blocks.filter((b) => b.kind !== 'rehab').map((b) => b.sets));
  const isPadel = PADEL_TYPES.includes(plan.day.type);

  return (
    <div class="print-sheet">
      <div class="row no-print" style={{ padding: '12px 0' }}>
        <a class="btn" href={date === todayISO() ? '#/oggi' : `#/oggi?d=${date}`}>‹ Indietro</a>
        <button class="btn primary" onClick={() => window.print()}>Stampa / PDF</button>
      </div>
      <h1>{plan.day.name} — {formatDateIT(date, true)}</h1>
      <p class="small">
        Settimana {plan.blockWeek} di 6{plan.isDeload ? ' (scarico)' : ''} · {plan.day.subtitle}
      </p>
      {plan.alerts.map((a) => <p key={a.text} class="small"><b>⚠ {a.text}</b></p>)}

      {warmup.length > 0 && (
        <div class="card">
          <h3>Riscaldamento</h3>
          <div class="small">{warmup.map((w) => <span key={w.id} style={{ marginRight: 14, display: 'inline-block' }}>☐ {w.text}</span>)}</div>
        </div>
      )}

      {plan.ramp && (
        <div class="card">
          <h3>Avvicinamento · {plan.ramp.exercise.name}</h3>
          <p class="small">{plan.ramp.sets.map((s) => `${s.label}: ${s.weightKg == null ? '___' : fmtKg(s.weightKg)} kg × ${s.reps}`).join('   ·   ')}</p>
        </div>
      )}

      {isPadel ? (
        <div class="card">
          <h3>Padel</h3>
          <ul class="small">{(plan.day.checklist || []).map((c) => <li key={c.id}>☐ {c.text}</li>)}</ul>
          <p class="small">Dolore inguine 0-10: <span class="write-box" /> · durato &gt; 24h: ☐ sì ☐ no · sensazioni 1-10: <span class="write-box" /></p>
        </div>
      ) : (
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Esercizio</th>
                <th>Target</th>
                <th class="r">Carico</th>
                {Array.from({ length: maxSets }, (_, i) => <th key={i}>S{i + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {plan.blocks.map((b) =>
                b.kind === 'rehab' ? (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td colspan={3 + maxSets}>
                      <b>Riabilitazione inguine · {b.rehab?.label}</b> (mai oltre {b.maxPain}/10, rec. {b.restSec}"):{' '}
                      {b.rehab?.items.map((i) => `☐ ${i.name} ${i.sets}×${i.holdSec ? `${i.holdSec}"` : i.reps}${i.perSide ? '/lato' : ''}`).join('  ')}
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>
                      {b.exercise.name}
                      {b.technique && b.technique !== 'none' ? <div class="tiny">{program.techniques[b.technique].label}</div> : null}
                      {b.injurySwap ? <div class="tiny">al posto dello squat (inguine)</div> : null}
                    </td>
                    <td class="num small">
                      {b.sets}×{range(b.repRange)}{b.unit === 'm' ? ' m' : ''}{b.perSide ? '/lato' : ''} @{range(b.rpeTarget)} · {b.restSec}"
                    </td>
                    <td class="r num"><b>{b.target.weightKg == null ? '___' : fmtKg(b.target.weightKg)}</b></td>
                    {Array.from({ length: maxSets }, (_, i) => (
                      <td key={i} class="small">{i < b.sets ? <span class="write-box" /> : ''}</td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {plan.day.type === 'lower' && <p class="small" style={{ marginTop: 8 }}>Dolore inguine 0-10: <span class="write-box" /> · durato &gt; 24h: ☐ sì ☐ no</p>}
          {(plan.day.extras || []).map((x) => <p key={x.id} class="small">☐ {x.text}</p>)}
          <p class="small">Durata: <span class="write-box" /> min · sensazioni 1-10: <span class="write-box" /> · note: <span class="write-box" style={{ minWidth: '50%' }} /></p>
        </div>
      )}
      <p class="tiny">Tecniche: {Object.values(program.techniques).filter((t) => t.label).map((t) => `${t.label} — ${t.description}`).join(' | ')}</p>
    </div>
  );
}
