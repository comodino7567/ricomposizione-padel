import { useEffect, useMemo, useState } from 'preact/hooks';
import { db, saveSession } from '../db.js';
import { addDays, formatDateIT, mondayOf, todayISO, weekday } from '../engine/dates.js';
import { applyPainToRehab, pendingFollowUps, PADEL_TYPES } from '../engine/injury.js';
import { buildDayPlan } from '../engine/plan.js';
import { applyDecision } from '../engine/weekly.js';
import { hashParam, useApp, useLive } from '../hooks.js';
import { mutateSession } from '../session.js';
import { ExerciseCard } from '../components/ExerciseCard.jsx';
import { Check, fmtKg, NumInput, PainPicker } from '../components/ui.jsx';

export function latestWeight(metrics) {
  const w = (metrics || []).filter((m) => m.weightKg).sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].weightKg : null;
}

export function useDayPlan(date) {
  const { program, rules, settings } = useApp();
  const sessions = useLive(() => db.sessions.toArray(), [], null);
  const metrics = useLive(() => db.bodyMetrics.toArray(), [], null);
  const plan = useMemo(() => {
    if (!sessions || !metrics) return null;
    return buildDayPlan({ program, rules, settings, date, sessions, bodyWeightKg: latestWeight(metrics) || settings.startWeightKg });
  }, [sessions, metrics, settings, program, rules, date]);
  return { plan, sessions, metrics };
}

export function Today() {
  const { program, rules, settings, updateSettings, toast } = useApp();
  const [date, setDate] = useState(hashParam('d') || todayISO());
  useEffect(() => {
    const on = () => setDate(hashParam('d') || todayISO());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const { plan, sessions, metrics } = useDayPlan(date);
  if (!plan) return <p class="muted">Caricamento…</p>;

  const session = sessions.find((s) => s.date === date && s.programDayId === plan.day.id) || null;
  const go = (d) => (location.hash = d === todayISO() ? '#/oggi' : `#/oggi?d=${d}`);
  const isPadel = PADEL_TYPES.includes(plan.day.type);
  const empty = sessions.length === 0 && metrics.length === 0;
  const followUps = pendingFollowUps(sessions, todayISO(), rules);

  async function confirm(decision, msg) {
    await updateSettings((s) => applyDecision(s, decision, date));
    toast(msg);
  }

  async function loadSeed() {
    const { loadSeed: load } = await import('../seed.js');
    const n = await load(program, rules, settings);
    toast(`Caricati ${n} record di esempio`);
  }

  return (
    <div>
      <header class="topbar no-print">
        <button class="btn small ghost" onClick={() => go(addDays(date, -1))} aria-label="Giorno precedente">‹</button>
        <div class="grow center">
          <h1>{plan.day.name}</h1>
          <div class="sub">
            {formatDateIT(date, true)} · Sett. {plan.blockWeek}/6{plan.blockNumber > 1 ? ` · blocco ${plan.blockNumber}` : ''}
          </div>
        </div>
        <button class="btn small ghost" onClick={() => go(addDays(date, 1))} aria-label="Giorno successivo">›</button>
      </header>
      <div class="row between no-print">
        <span class="small muted">{plan.day.subtitle}</span>
        <span class="row">
          {date !== todayISO() && <button class="btn small" onClick={() => go(todayISO())}>Oggi</button>}
          {!isPadel && <a class="btn small" href={`#/stampa?d=${date}`}>Stampa</a>}
        </span>
      </div>

      {empty && (
        <div class="card">
          <h3>Benvenuto</h3>
          <p class="small">Nessun dato registrato. Puoi iniziare subito oppure caricare 3 settimane di dati di esempio (marcati e cancellabili da Altro).</p>
          <button class="btn" onClick={loadSeed}>Carica dati di esempio</button>
        </div>
      )}

      {followUps.map((f) => (
        <div key={f.id} class="card tight">
          <p class="small">
            Il dolore all'inguine dopo <b>{program.days.find((d) => d.id === f.programDayId)?.name}</b> del {formatDateIT(f.date)} ({f.groinPain0to10}/10) è durato più di 24 ore?
          </p>
          <div class="row">
            <button class="btn small danger" onClick={() => saveSession({ ...f, groinPainOver24h: true })}>Sì</button>
            <button class="btn small" onClick={() => saveSession({ ...f, groinPainOver24h: false })}>No</button>
          </div>
        </div>
      ))}

      {plan.alerts.map((a) => (
        <div key={a.text} class={`alert ${a.level}`}>{a.text}</div>
      ))}
      {plan.injury.physioAlert && !plan.modifiers.padelSuspended && (
        <div class="card tight">
          <p class="small">Proposta: sospendi il padel per una settimana.</p>
          <button class="btn small danger" onClick={() => confirm({ type: 'suspendPadel', weekStart: weekday(date) >= 6 ? addDays(mondayOf(date), 7) : mondayOf(date) }, 'Padel sospeso per una settimana')}>
            Conferma sospensione
          </button>
        </div>
      )}
      {plan.injury.unlockProposal && (
        <div class="alert good">
          <div class="grow">Inguine a 0/10 da {settings.injuryClearWeeks} settimane: puoi sbloccare gli esercizi bloccati e uno stretching moderato degli adduttori.</div>
          <button class="btn small primary" onClick={() => confirm({ type: 'unlockInjury' }, 'Esercizi sbloccati')}>Sblocca</button>
        </div>
      )}
      {plan.injury.rehabAdvance && (
        <div class="alert good">
          <div class="grow">Dolore 0-2/10 da 2 settimane: puoi passare allo step {plan.injury.rehabAdvanceTo} della riabilitazione.</div>
          <button class="btn small primary" onClick={() => confirm({ type: 'adductorStepUp', to: plan.injury.rehabAdvanceTo }, `Step ${plan.injury.rehabAdvanceTo} attivo`)}>Conferma</button>
        </div>
      )}

      {isPadel ? <PadelDay plan={plan} session={session} /> : <GymDay plan={plan} session={session} />}
    </div>
  );
}

function Warmup({ plan, session }) {
  const { program } = useApp();
  const items = (plan.day.warmup || []).flatMap((k) => program.warmups[k] || []);
  if (!items.length) return null;
  const done = session?.warmupDone || {};
  const count = items.filter((i) => done[i.id]).length;
  const toggle = (id, v) => mutateSession(plan.date, plan, (d) => (d.warmupDone = { ...d.warmupDone, [id]: v }));
  return (
    <details class="card" open={count < items.length}>
      <summary class="row between">
        <h3>{plan.day.warmupLabel || 'Riscaldamento'}</h3>
        <span class="badge">{count}/{items.length}</span>
      </summary>
      {items.map((i) => (
        <Check key={i.id} checked={done[i.id]} onChange={(v) => toggle(i.id, v)}>{i.text}</Check>
      ))}
    </details>
  );
}

function RampCard({ plan }) {
  if (!plan.ramp) return null;
  return (
    <div class="card tight">
      <h3>Serie di avvicinamento · {plan.ramp.exercise.name}</h3>
      <table>
        <tbody>
          {plan.ramp.sets.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td class="r num">{s.weightKg == null ? '—' : `${fmtKg(s.weightKg)} kg`}</td>
              <td class="r num">× {s.reps}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.ramp.sets.some((s) => s.weightKg == null) && <p class="tiny muted">Inserisci il carico di lavoro per calcolare le percentuali.</p>}
    </div>
  );
}

function RehabCard({ block, plan, session }) {
  const done = session?.rehabDone || {};
  const step = block.rehab;
  if (!step) return null;
  const toggle = (id, v) => mutateSession(plan.date, plan, (d) => (d.rehabDone = { ...d.rehabDone, [id]: v }));
  return (
    <div class="card">
      <div class="row wrap" style={{ gap: 6 }}>
        <span class="badge">{block.id}</span>
        <span class="badge warn">mai oltre {block.maxPain}/10</span>
        <span class="badge">{block.restSec}"</span>
      </div>
      <h3 style={{ marginTop: 6 }}>Riabilitazione inguine · {step.label}</h3>
      {step.items.map((i) => (
        <Check key={i.id} checked={done[i.id]} onChange={(v) => toggle(i.id, v)}>
          {i.name}: {i.sets}×{i.holdSec ? `${i.holdSec}"` : i.reps}{i.perSide ? ' per lato' : ''}
        </Check>
      ))}
      <p class="tiny muted">Si passa allo step successivo solo dopo 2 settimane con dolore 0-2/10. Dolore oltre 3/10: si torna allo step precedente.</p>
    </div>
  );
}

function GymDay({ plan, session }) {
  const extras = plan.day.extras || [];
  const blocks = plan.blocks;
  const lastExerciseIdx = blocks.map((b) => b.kind !== 'rehab').lastIndexOf(true);
  return (
    <div>
      {plan.walkOnly ? (
        <div class="alert info">{plan.skipped ? 'Upper C tolta questa settimana.' : 'Settimana di scarico: Upper C sostituita dalla sola camminata.'}</div>
      ) : (
        <>
          <Warmup plan={plan} session={session} />
          <RampCard plan={plan} />
        </>
      )}
      {blocks.map((b, i) =>
        b.kind === 'rehab' ? (
          <RehabCard key={b.id} block={b} plan={plan} session={session} />
        ) : (
          <ExerciseCard
            key={`${b.id}-${b.exerciseId}`}
            block={b}
            plan={plan}
            session={session}
            isLastBlock={i === lastExerciseIdx}
            nextInSuperset={b.supersetGroup && blocks[i + 1]?.supersetGroup === b.supersetGroup}
          />
        ),
      )}
      {extras.length > 0 && (
        <div class="card">
          {extras.map((x) => (
            <Check key={x.id} checked={session?.checklist?.[x.id]} onChange={(v) => mutateSession(plan.date, plan, (d) => (d.checklist = { ...d.checklist, [x.id]: v }))}>
              {x.text}
            </Check>
          ))}
        </div>
      )}
      <FinishCard plan={plan} session={session} askPain={plan.day.type === 'lower'} />
    </div>
  );
}

function PadelDay({ plan, session }) {
  const p = plan.padel;
  const extra = plan.day.optionalExtra;
  const check = session?.checklist || {};
  const toggle = (id, v) => mutateSession(plan.date, plan, (d) => (d.checklist = { ...d.checklist, [id]: v }));
  return (
    <div>
      {p.suspended && <div class="alert danger">Padel sospeso questa settimana. Registra comunque se giochi.</div>}
      <div class="card">
        <h3>{p.reduced ? `Durata massima ${p.durationMaxMin}'` : `Durata ${p.durationMinMin}-${p.durationMaxMin}'`}</h3>
        {(plan.day.rules || []).map((r) => <p key={r} class="small muted">• {r}</p>)}
        {p.reduced && <p class="small" style={{ color: 'var(--warn)' }}>• Oggi niente esercizi laterali, massimo {p.durationMaxMin}'.</p>}
      </div>
      <Warmup plan={plan} session={session} />
      <div class="card">
        <h3>Seduta</h3>
        {(plan.day.checklist || []).map((i) => (
          <Check key={i.id} checked={check[i.id]} onChange={(v) => toggle(i.id, v)}>
            {p.reduced && i.id === 'tech' ? `${p.durationMaxMin}' di tecnica senza esercizi laterali` : i.id === 'play' && p.reduced ? `${p.durationMaxMin}' di gioco` : i.text}
          </Check>
        ))}
      </div>
      {extra && (
        <div class="card">
          <h3>{extra.title}</h3>
          {extra.items.map((i) => (
            <Check key={i.id} checked={check[i.id]} onChange={(v) => toggle(i.id, v)}>{i.text}</Check>
          ))}
          <Check checked={session?.kbExtraDone} onChange={(v) => mutateSession(plan.date, plan, (d) => (d.kbExtraDone = v))}>
            <b>Extra kettlebell fatto</b>
          </Check>
        </div>
      )}
      <FinishCard plan={plan} session={session} askPain askSleep={plan.day.type === 'padelMatch'} />
    </div>
  );
}

function FinishCard({ plan, session, askPain, askSleep }) {
  const { rules, settings, updateSettings, toast } = useApp();
  const autoDuration = session?.firstSetAt ? Math.round((Date.now() - new Date(session.firstSetAt).getTime()) / 60000) : null;
  const [duration, setDuration] = useState(session?.durationMin ?? null);
  const [pain, setPain] = useState(session?.groinPain0to10 ?? null);
  const [over24, setOver24] = useState(session?.groinPainOver24h ?? null);
  const [feeling, setFeeling] = useState(session?.feeling1to10 ?? null);
  const [sleep, setSleep] = useState(session?.sleepH ?? null);
  const [notes, setNotes] = useState(session?.notes || '');
  useEffect(() => {
    setDuration(session?.durationMin ?? null);
    setPain(session?.groinPain0to10 ?? null);
    setOver24(session?.groinPainOver24h ?? null);
    setFeeling(session?.feeling1to10 ?? null);
    setSleep(session?.sleepH ?? null);
    setNotes(session?.notes || '');
  }, [session?.id, session?.updatedAt]);

  const done = session?.status === 'done';

  async function finish() {
    if (askPain && pain == null) {
      toast('Indica il dolore all\'inguine (0-10)');
      return;
    }
    const applyRehab = askPain && pain != null && !session?.rehabRegressionApplied;
    let rehabMsg = null;
    if (applyRehab) {
      const r = applyPainToRehab(settings, pain, plan.date, rules);
      if (r.changed) await updateSettings(r.settings);
      rehabMsg = r.message;
    }
    await mutateSession(plan.date, plan, (d) => {
      d.status = 'done';
      d.finishedAt = d.finishedAt || new Date().toISOString();
      d.durationMin = duration ?? autoDuration ?? d.durationMin ?? null;
      if (askPain) {
        d.groinPain0to10 = pain;
        d.groinPainOver24h = over24;
        if (applyRehab && pain > rules.injury.rehabMaxPain) d.rehabRegressionApplied = true;
      }
      d.feeling1to10 = feeling;
      if (askSleep) d.sleepH = sleep;
      d.notes = notes;
    });
    toast(rehabMsg || 'Seduta salvata');
  }

  return (
    <div class="card">
      <h3>{done ? 'Seduta registrata ✓' : 'Fine seduta'}</h3>
      <div class="grid2" style={{ marginTop: 8 }}>
        <label class="field">
          <span>Durata (min){autoDuration && !duration ? ` · auto ${autoDuration}` : ''}</span>
          <NumInput value={duration} onChange={setDuration} placeholder={autoDuration ? String(autoDuration) : 'min'} />
        </label>
        {askSleep && (
          <label class="field">
            <span>Sonno notte prima (h)</span>
            <NumInput value={sleep} onChange={setSleep} placeholder="h" />
          </label>
        )}
      </div>
      {askPain && (
        <>
          <div class="lbl">Dolore inguine a fine giornata (0-10)</div>
          <PainPicker value={pain} onChange={setPain} />
          <div class="lbl">Durato più di 24 ore?</div>
          <div class="row">
            {[[true, 'Sì'], [false, 'No'], [null, 'Non so ancora']].map(([v, l]) => (
              <button key={l} class={`btn small ${over24 === v ? 'primary' : ''}`} onClick={() => setOver24(v)}>{l}</button>
            ))}
          </div>
        </>
      )}
      <div class="lbl">Sensazioni (1-10)</div>
      <div class="chips">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} class={`chip small ${feeling === n ? 'on' : ''}`} onClick={() => setFeeling(n)}>{n}</button>
        ))}
      </div>
      <textarea value={notes} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Note della seduta" style={{ fontFamily: 'inherit', minHeight: 60, marginTop: 8 }} />
      <button class="btn primary block" style={{ marginTop: 10 }} onClick={finish}>{done ? 'Aggiorna' : 'Termina e salva'}</button>
    </div>
  );
}
