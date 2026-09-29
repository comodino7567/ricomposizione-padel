import { useEffect, useState } from 'preact/hooks';
import { isExerciseBlocked } from '../engine/injury.js';
import { exerciseById, techniqueForSet } from '../engine/prescription.js';
import { earlyRaiseSuggestion, incrementFor } from '../engine/progression.js';
import { roundTo } from '../engine/math.js';
import { useApp } from '../hooks.js';
import { entryFor, mutateSession, removeSet, upsertSet } from '../session.js';
import { startRest } from './timer.jsx';
import { fmtKg, NumInput, Sheet } from './ui.jsx';

const RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const ACTION_LABEL = {
  increase: ['accent', '↑ progressione'],
  reduce: ['warn', '↓ −10%'],
  hold: ['', '= stesso carico'],
  holdInterval: ['', '= attendi 2 settimane'],
  addRep: ['accent', '+1 rip.'],
  start: ['info', 'da esplorativa'],
  firstTime: ['info', 'prima volta'],
};

function rpeLabel(r) {
  return r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`;
}

function repChoices(block, technique) {
  if (block.unit === 'm') return [10, 15, 20, 25, 30, 35, 40];
  const lo = Math.max(1, block.repRange.min - 3);
  const hi = block.repRange.max + (technique === 'amrapLast' ? 8 : 3);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export function setSummary(s, block, loadType) {
  const unit = block.unit === 'm' ? ' m' : '';
  const w = loadType === 'assisted' ? (s.weightKg ? `ass. ${fmtKg(s.weightKg)} kg` : 'corpo libero') : `${fmtKg(s.weightKg)} kg`;
  const extra = [s.dropReps ? `drop ${s.dropReps}` : null, s.miniSets?.length ? `myo ${s.miniSets.join('+')}` : null].filter(Boolean).join(' · ');
  return `${w} × ${s.reps}${unit}${s.rpe != null ? ` @ ${String(s.rpe).replace('.', ',')}` : ''}${extra ? ` · ${extra}` : ''}`;
}

export function ExerciseCard({ block, plan, session, isLastBlock, nextInSuperset }) {
  const { program, rules, settings, updateSettings, toast } = useApp();
  const ex = block.exercise;
  const entry = entryFor(session, block);
  const sets = entry?.sets || [];
  const working = sets.filter((s) => !s.exploratory);
  const remaining = Math.max(0, block.sets - working.length);
  const [editIdx, setEditIdx] = useState(null); // index in `sets` being edited, or 'new'
  const [raise, setRaise] = useState(null);
  const [weightOverride, setWeightOverride] = useState(null);
  const [subOpen, setSubOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [notes, setNotes] = useState(entry?.notes || '');
  useEffect(() => setNotes(entry?.notes || ''), [entry?.notes]);

  const lastLogged = sets.length ? sets[sets.length - 1] : null;
  const nextTechnique = techniqueForSet(block, working.length);
  const defaults = {
    weightKg: weightOverride ?? lastLogged?.weightKg ?? block.target.weightKg ?? null,
    reps: block.defaultReps[working.length] ?? block.repRange.min,
    rpe: block.rpeTarget.max,
  };
  const techInfo = program.techniques[block.technique || 'none'];
  const [cls, actionText] = ACTION_LABEL[block.target.action] || ['', ''];

  async function save(index, set, isNew) {
    await mutateSession(plan.date, plan, (d) => upsertSet(d, block, index, set));
    setEditIdx(null);
    if (!isNew) return;
    const workingIndex = set.exploratory ? -1 : working.length;
    if (workingIndex === 0) {
      const s = earlyRaiseSuggestion({ set, prescribed: block.prescribed, exercise: ex, rules, isDeload: plan.isDeload });
      setRaise(s);
    }
    const finishedExercise = !set.exploratory && workingIndex + 1 >= block.sets;
    if (nextInSuperset && !finishedExercise) return; // superset: go straight to the paired exercise
    if (!(finishedExercise && isLastBlock)) startRest(block.restSec, ex.name);
  }

  async function del(index) {
    await mutateSession(plan.date, plan, (d) => removeSet(d, block, index));
    setEditIdx(null);
  }

  async function saveNotes() {
    await mutateSession(plan.date, plan, (d) => {
      let e = d.entries.find((x) => x.blockId === block.id && x.exerciseId === block.exerciseId);
      if (!e) {
        e = { blockId: block.id, exerciseId: block.exerciseId, prescribed: block.prescribed, sets: [], notes: '' };
        d.entries.push(e);
      }
      e.notes = notes;
    });
    toast('Note salvate');
  }

  async function substitute(id) {
    await updateSettings((s) => {
      const subs = { ...(s.substitutions || {}) };
      if (id === null) delete subs[block.id];
      else subs[block.id] = id;
      return { ...s, substitutions: subs };
    });
    setSubOpen(false);
  }

  const baseEx = exerciseById(program, block.substitutedFrom || block.injurySwap?.from || block.exerciseId);
  const subs = baseEx?.substitutes || [];
  const loadLabel = ex.loadType === 'assisted' ? 'Assistenza kg (0 = corpo libero)' : ex.loadType === 'dumbbell' ? 'Kg per mano' : 'Kg';

  return (
    <div class="card" id={`b-${block.id}`}>
      <div class="card-head">
        <div class="grow">
          <div class="row wrap" style={{ gap: 6 }}>
            <span class="badge">{block.id}</span>
            {block.supersetGroup && <span class="badge info">superset</span>}
            {block.technique && block.technique !== 'none' && (
              <button class="badge warn" onClick={() => setTechOpen(true)}>{techInfo?.label} ⓘ</button>
            )}
            {block.injurySwap && <span class="badge danger">inguine: al posto dello squat</span>}
            {block.substitutedFrom && <span class="badge info">sostituito</span>}
          </div>
          <h3 style={{ marginTop: 6 }}>{ex.name}</h3>
          <div class="small muted num">
            {block.sets} × {block.repRange.min === block.repRange.max ? block.repRange.min : `${block.repRange.min}-${block.repRange.max}`}
            {block.unit === 'm' ? ' m' : ''}
            {block.perSide ? ' per lato' : ''} · RPE {rpeLabel(block.rpeTarget)} · {block.restSec}"
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div class="big num">{block.target.weightKg == null ? '—' : fmtKg(block.target.weightKg)}</div>
          <div class="tiny muted">{ex.loadType === 'assisted' ? 'kg assist.' : ex.loadType === 'dumbbell' ? 'kg/mano' : 'kg'}</div>
        </div>
      </div>
      {actionText && (
        <div class="row small" style={{ gap: 6, marginBottom: 6 }}>
          <span class={`badge ${cls}`}>{actionText}</span>
          <span class="muted tiny">{block.target.reason}</span>
        </div>
      )}
      {block.notes && <p class="tiny muted">{block.notes}</p>}
      {raise && (
        <div class="alert good">
          <div class="grow">{raise.message}</div>
          <button class="btn small primary" onClick={() => { setWeightOverride(raise.weightKg); setRaise(null); }}>Applica</button>
          <button class="btn small ghost" onClick={() => setRaise(null)}>No</button>
        </div>
      )}

      <div>
        {sets.map((s, i) => (
          <div key={i}>
            <div class="set-row logged">
              <span class="idx">{s.exploratory ? 'E' : sets.slice(0, i + 1).filter((x) => !x.exploratory).length}</span>
              <span class="summary">{setSummary(s, block, ex.loadType)}</span>
              <button class="btn small ghost" onClick={() => setEditIdx(editIdx === i ? null : i)} aria-label="Modifica serie">✎</button>
            </div>
            {editIdx === i && (
              <SetEditor block={block} ex={ex} technique={s.technique || 'none'} initial={s} loadLabel={loadLabel} rules={rules}
                onSave={(v) => save(i, { ...s, ...v }, false)} onDelete={() => del(i)} onCancel={() => setEditIdx(null)} />
            )}
          </div>
        ))}
        {remaining > 0 && (
          <div>
            <div class="set-row">
              <span class="idx">{working.length + 1}</span>
              <span class="summary muted">
                {nextTechnique !== 'none' ? `${program.techniques[nextTechnique]?.label} · ` : ''}
                {remaining > 1 ? `ancora ${remaining} serie` : 'ultima serie'}
              </span>
              <span />
            </div>
            <SetEditor
              key={`new-${sets.length}-${defaults.weightKg}`}
              block={block} ex={ex} technique={nextTechnique} initial={defaults} loadLabel={loadLabel} rules={rules}
              allowExploratory={block.target.action === 'firstTime' || block.target.action === 'start'}
              onSave={(v) => save(sets.length, { ...v, technique: v.exploratory ? 'none' : nextTechnique, at: new Date().toISOString() }, true)}
            />
          </div>
        )}
        {remaining === 0 && editIdx !== 'new' && (
          <div class="row between" style={{ marginTop: 6 }}>
            <span class="small" style={{ color: 'var(--good)' }}>✓ Esercizio completato</span>
            <button class="btn small ghost" onClick={() => setEditIdx('new')}>+ serie extra</button>
          </div>
        )}
        {editIdx === 'new' && (
          <SetEditor block={block} ex={ex} technique="none" initial={defaults} loadLabel={loadLabel} rules={rules}
            onSave={(v) => save(sets.length, { ...v, technique: 'none', extra: true, at: new Date().toISOString() }, true)}
            onCancel={() => setEditIdx(null)} />
        )}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary class="small muted">Note, ultima seduta, sostituzione</summary>
        {block.lastEntry && (
          <p class="small muted">
            Ultima volta ({block.lastEntry.date}): {block.lastEntry.sets.map((s) => setSummary(s, block, ex.loadType)).join(' | ')}
          </p>
        )}
        <textarea value={notes} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Note esercizio" style={{ fontFamily: 'inherit', minHeight: 60 }} />
        <div class="row" style={{ marginTop: 6 }}>
          <button class="btn small" onClick={saveNotes}>Salva note</button>
          {subs.length > 0 && !block.injurySwap && <button class="btn small" onClick={() => setSubOpen(true)}>Sostituisci esercizio</button>}
        </div>
      </details>

      <Sheet open={subOpen} onClose={() => setSubOpen(false)} title="Sostituzione">
        <p class="small muted">La scelta vale per questo slot ({block.id}) finché non la cambi. Lo storico resta separato per esercizio.</p>
        <button class={`btn block ${!block.substitutedFrom ? 'primary' : ''}`} style={{ marginBottom: 8 }} onClick={() => substitute(null)}>
          {baseEx.name} (programma)
        </button>
        {subs.map((id) => {
          const s = exerciseById(program, id);
          const blocked = isExerciseBlocked(s, settings);
          return (
            <button key={id} class={`btn block ${block.exerciseId === id ? 'primary' : ''}`} style={{ marginBottom: 8 }} disabled={blocked} onClick={() => substitute(id)}>
              {s.name} {blocked ? '(bloccato)' : ''}
            </button>
          );
        })}
      </Sheet>
      <Sheet open={techOpen} onClose={() => setTechOpen(false)} title={techInfo?.label || ''}>
        <p>{techInfo?.description}</p>
      </Sheet>
    </div>
  );
}

// Editor with defaults preselected: "Salva" alone logs the set (1 tap);
// changing reps and RPE takes 2 more taps.
function SetEditor({ block, ex, technique, initial, loadLabel, rules, onSave, onDelete, onCancel, allowExploratory }) {
  const [weightKg, setWeight] = useState(initial.weightKg);
  const [reps, setReps] = useState(initial.reps);
  const [rpe, setRpe] = useState(initial.rpe);
  const [dropReps, setDropReps] = useState(initial.dropReps ?? null);
  const [myo, setMyo] = useState(initial.miniSets ? initial.miniSets.join('+') : '');
  const [exploratory, setExploratory] = useState(!!initial.exploratory);
  const inc = incrementFor(ex, rules) || 1;
  const choices = repChoices(block, technique);

  const bump = (dir) => setWeight((w) => Math.max(0, roundTo((w || 0) + dir * inc, 0.01)));
  const submit = () => {
    const miniSets = myo ? myo.split(/[+ ,]+/).map(Number).filter((n) => n > 0) : undefined;
    const v = { weightKg: weightKg ?? 0, reps, rpe, exploratory: exploratory || undefined };
    if (technique === 'dropset' && dropReps) v.dropReps = dropReps;
    if (technique === 'myoreps' && miniSets?.length) v.miniSets = miniSets;
    onSave(v);
  };

  return (
    <div class="editor">
      <div class="lbl">{loadLabel}</div>
      <div class="weight">
        <button class="btn" onClick={() => bump(-1)} aria-label="Meno">−</button>
        <NumInput value={weightKg} onChange={setWeight} placeholder="kg" aria-label={loadLabel} />
        <button class="btn" onClick={() => bump(1)} aria-label="Più">+</button>
      </div>
      <div class="lbl">{block.unit === 'm' ? 'Metri' : `Ripetizioni${block.perSide ? ' per lato' : ''}`}</div>
      <div class="chips">
        {choices.map((n) => (
          <button key={n} class={`chip ${reps === n ? 'on' : ''}`} onClick={() => setReps(n)}>{n}</button>
        ))}
      </div>
      <div class="lbl">RPE</div>
      <div class="chips">
        {RPES.map((n) => (
          <button key={n} class={`chip small ${rpe === n ? 'on' : ''}`} onClick={() => setRpe(n)}>{String(n).replace('.', ',')}</button>
        ))}
      </div>
      {technique === 'dropset' && (
        <>
          <div class="lbl">Ripetizioni del drop (−30%, facoltativo)</div>
          <div class="chips">
            {[3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
              <button key={n} class={`chip small ${dropReps === n ? 'on' : ''}`} onClick={() => setDropReps(dropReps === n ? null : n)}>{n}</button>
            ))}
          </div>
        </>
      )}
      {technique === 'myoreps' && (
        <>
          <div class="lbl">Mini-serie myo-reps (es. 4+3+3, facoltativo)</div>
          <input type="text" inputmode="numeric" value={myo} onInput={(e) => setMyo(e.currentTarget.value)} />
        </>
      )}
      {allowExploratory && (
        <label class="check small">
          <input type="checkbox" checked={exploratory} onChange={(e) => setExploratory(e.currentTarget.checked)} />
          <span>Trova il carico: serie esplorativa (non conta per la progressione)</span>
        </label>
      )}
      <div class="row">
        {onDelete && <button class="btn danger" onClick={onDelete}>Elimina</button>}
        {onCancel && <button class="btn ghost" onClick={onCancel}>Annulla</button>}
        <button class="btn primary save grow" style={{ marginTop: 0 }} onClick={submit} disabled={weightKg == null && ex.loadType !== 'bodyweight'}>
          {exploratory ? 'Salva esplorativa' : 'Salva serie'}
        </button>
      </div>
    </div>
  );
}
