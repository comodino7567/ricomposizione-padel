import { db } from '../db.js';
import { addDays, formatDateIT, mondayOf, todayISO, weekdayName } from '../engine/dates.js';
import { isExerciseBlocked } from '../engine/injury.js';
import { weekModifiers } from '../engine/plan.js';
import { blockNumberFor, blockWeekFor, exerciseById, plannedVolume, prescribeDay } from '../engine/prescription.js';
import { loggedVolume } from '../engine/volume.js';
import { useApp, useLive } from '../hooks.js';
import { Meter } from '../components/ui.jsx';

export function ProgramScreen() {
  const { program, rules, settings, updateSettings, toast } = useApp();
  const sessions = useLive(() => db.sessions.toArray(), [], []);
  const today = todayISO();
  const week = blockWeekFor(settings, today, rules);
  const blockNo = blockNumberFor(settings, today, rules);
  const ws = mondayOf(today);
  const mods = weekModifiers(settings, today, rules);
  const blockStart = addDays(ws, -(week - 1) * 7);
  const planned = plannedVolume(program, rules, week, { substitutions: settings.substitutions, skipDays: mods.skipUpperC ? ['upperC'] : [] });
  const logged = loggedVolume(sessions, program, ws);
  const blocked = program.exercises.filter((e) => e.blockedByInjury);
  const step = settings.adductorStep || 1;

  async function setWeek(w) {
    await updateSettings({ blockStartDate: addDays(ws, -(w - 1) * 7), blockWeek: w });
    toast(`Settimana ${w} di ${rules.block.lengthWeeks}`);
  }

  async function setSub(blockId, id) {
    await updateSettings((s) => {
      const subs = { ...(s.substitutions || {}) };
      if (!id) delete subs[blockId];
      else subs[blockId] = id;
      return { ...s, substitutions: subs };
    });
  }

  async function setStep(n) {
    if (!confirm(`Impostare manualmente lo step ${n} della riabilitazione?`)) return;
    await updateSettings((s) => ({
      ...s,
      adductorStep: n,
      adductorStepSince: today,
      adductorStepHistory: [...(s.adductorStepHistory || []), { date: today, step: n, reason: 'manuale' }],
    }));
  }

  return (
    <div>
      <header class="topbar">
        <div class="grow">
          <h1>Programma</h1>
          <div class="sub">Fase {settings.phase} · ricomposizione · blocco {blockNo}</div>
        </div>
      </header>

      <div class="card">
        <div class="row between">
          <div>
            <div class="big">Settimana {week} di {rules.block.lengthWeeks}</div>
            <div class="small muted">Blocco iniziato il {formatDateIT(blockStart)}{week === rules.block.deloadWeek ? ' · settimana di scarico' : ''}</div>
          </div>
        </div>
        <div class="lbl">Cambia settimana corrente</div>
        <div class="chips">
          {Array.from({ length: rules.block.lengthWeeks }, (_, i) => i + 1).map((w) => (
            <button key={w} class={`chip ${w === week ? 'on' : ''}`} onClick={() => setWeek(w)}>{w}</button>
          ))}
        </div>
      </div>

      <div class="card">
        <h2>Volume settimanale</h2>
        <p class="tiny muted">Serie dirette per gruppo: registrate questa settimana contro target della settimana {week}.</p>
        <div class="stack" style={{ marginTop: 8 }}>
          {program.trackedMuscleGroups.map((g) => (
            <Meter key={g} label={program.muscleGroupLabels[g]} value={logged[g]} target={planned[g]} />
          ))}
        </div>
      </div>

      <h2 style={{ margin: '18px 0 4px' }}>Settimana tipo</h2>
      {program.days.map((day) => {
        const p = prescribeDay(program, rules, day.id, week, { rpeDelta: mods.rpeDelta });
        const date = addDays(ws, day.weekday - 1);
        return (
          <details key={day.id} class="card">
            <summary>
              <div class="row between">
                <div>
                  <div class="tiny muted">{weekdayName(day.weekday)}</div>
                  <h3>{day.name}</h3>
                  <div class="small muted">{day.subtitle}</div>
                </div>
                <a class="btn small" href={date === today ? '#/oggi' : `#/oggi?d=${date}`} onClick={(e) => e.stopPropagation()}>Apri</a>
              </div>
            </summary>
            {p.walkOnly && <p class="alert info">Scarico: solo camminata.</p>}
            {p.blocks.length > 0 && (
              <div class="scroll-x" style={{ marginTop: 8 }}>
                <table>
                  <thead>
                    <tr><th>#</th><th>Esercizio</th><th class="r">Serie</th><th class="r">Rip.</th><th class="r">RPE</th><th class="r">Rec.</th></tr>
                  </thead>
                  <tbody>
                    {p.blocks.map((b) => {
                      if (b.kind === 'rehab') {
                        return (
                          <tr key={b.id}><td>{b.id}</td><td colspan="5">Riabilitazione inguine · step {step}</td></tr>
                        );
                      }
                      const base = exerciseById(program, b.exerciseId);
                      const chosen = settings.substitutions?.[b.id] || '';
                      return (
                        <tr key={b.id}>
                          <td>{b.id}</td>
                          <td>
                            {base.substitutes.length ? (
                              <select value={chosen} onChange={(e) => setSub(b.id, e.currentTarget.value)} style={{ minHeight: 34, padding: '4px 6px' }}>
                                <option value="">{base.name}</option>
                                {base.substitutes.map((id) => {
                                  const s = exerciseById(program, id);
                                  return <option key={id} value={id} disabled={isExerciseBlocked(s, settings)}>→ {s.name}</option>;
                                })}
                              </select>
                            ) : (
                              base.name
                            )}
                            {b.technique && b.technique !== 'none' && <div class="tiny muted">{program.techniques[b.technique].label}</div>}
                          </td>
                          <td class="r num">{b.sets}{b.sets !== b.baseSets ? <span class="tiny muted"> ({b.baseSets})</span> : null}</td>
                          <td class="r num">{b.repRange.min === b.repRange.max ? b.repRange.min : `${b.repRange.min}-${b.repRange.max}`}{b.unit === 'm' ? ' m' : b.unit === 's' ? '"' : ''}</td>
                          <td class="r num">{!b.rpeTarget ? '—' : b.rpeTarget.min === b.rpeTarget.max ? b.rpeTarget.min : `${b.rpeTarget.min}-${b.rpeTarget.max}`}</td>
                          <td class="r num">{b.restSec}"</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {day.checklist && (
              <ul class="small">{day.checklist.map((c) => <li key={c.id}>{c.text}</li>)}</ul>
            )}
            {day.extras && <ul class="small">{day.extras.map((c) => <li key={c.id}>{c.text}</li>)}</ul>}
          </details>
        );
      })}

      <div class="card">
        <h2>Inguine</h2>
        <div class="row wrap" style={{ marginTop: 6 }}>
          <span class={`badge ${settings.injuryUnlocked ? 'good' : 'warn'}`}>{settings.injuryUnlocked ? `Sbloccato dal ${formatDateIT(settings.injuryUnlockedAt || today)}` : 'Esercizi bloccati'}</span>
          <span class="badge">Step riabilitazione {step} dal {formatDateIT(settings.adductorStepSince || today)}</span>
        </div>
        <h3 style={{ marginTop: 12 }}>Esercizi bloccati</h3>
        <p class="tiny muted">Bloccati finché l'inguine non è a 0/10 per {settings.injuryClearWeeks} settimane consecutive. L'app propone lo sblocco, confermi tu.</p>
        <ul class="small">
          {blocked.map((e) => (
            <li key={e.id}>{isExerciseBlocked(e, settings) ? '🔒' : '✓'} {e.name}</li>
          ))}
        </ul>
        <h3 style={{ marginTop: 12 }}>Step riabilitazione</h3>
        {program.rehab.steps.map((s) => (
          <div key={s.step} class={`card tight ${s.step === step ? '' : 'muted'}`} style={s.step === step ? { borderColor: 'var(--accent)' } : undefined}>
            <div class="row between">
              <b>{s.label}</b>
              {s.step !== step && <button class="btn small ghost" onClick={() => setStep(s.step)}>Imposta</button>}
            </div>
            <ul class="small">
              {s.items.map((i) => (
                <li key={i.id}>{i.name}: {i.sets}×{i.holdSec ? `${i.holdSec}"` : i.reps}{i.perSide ? ' per lato' : ''}</li>
              ))}
            </ul>
          </div>
        ))}
        {(settings.adductorStepHistory || []).length > 0 && (
          <p class="tiny muted">Storico: {settings.adductorStepHistory.map((h) => `${h.date} → step ${h.step} (${h.reason})`).join(' · ')}</p>
        )}
      </div>

      <div class="card">
        <h2>Tecniche</h2>
        {Object.entries(program.techniques).filter(([k]) => k !== 'none').map(([k, t]) => (
          <p key={k} class="small"><b>{t.label}:</b> {t.description}</p>
        ))}
      </div>
    </div>
  );
}
