import { useEffect, useState } from 'preact/hooks';
import { clearOverride, saveOverride } from '../config.js';
import { countSeedData, db, DATA_TABLES, deleteSeedData, exportAll, importAll } from '../db.js';
import { mondayOf, todayISO } from '../engine/dates.js';
import { sessionsToSetRows, toCSV } from '../engine/csv.js';
import { validateProgram, validateRules } from '../engine/validate.js';
import { useApp } from '../hooks.js';
import { Check, download, NumInput } from '../components/ui.jsx';

async function csvFiles(program) {
  const sessions = await db.sessions.toArray();
  const metrics = await db.bodyMetrics.toArray();
  return {
    'serie.csv': toCSV(sessionsToSetRows(sessions, program)),
    'sedute.csv': toCSV(
      sessions.map(({ entries, ...s }) => ({ ...s, exercises: (entries || []).length, sets: (entries || []).reduce((a, e) => a + e.sets.length, 0) })),
    ),
    'misure.csv': toCSV(metrics.map(({ photos, ...m }) => ({ ...m, photos: (photos || []).map((p) => p.view).join('|') }))),
    'nutrizione.csv': toCSV(await db.nutrition.toArray()),
    'check-settimanali.csv': toCSV(await db.weeklyChecks.toArray()),
  };
}

export function SettingsScreen() {
  const { program, rules, config, settings, updateSettings, reload, toast } = useApp();
  const [seedCount, setSeedCount] = useState(0);
  const refreshSeed = () => countSeedData().then(setSeedCount);
  useEffect(() => {
    refreshSeed();
  }, []);

  const set = (k) => (v) => updateSettings({ [k]: v });

  async function doExport() {
    const data = await exportAll();
    download(`ricomposizione-backup-${todayISO()}.json`, JSON.stringify(data));
  }

  async function doImport(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('Importare il backup? Tutti i dati attuali verranno sostituiti.')) return;
      await importAll(data);
      await reload();
      refreshSeed();
      toast('Backup importato');
    } catch (e) {
      toast(`Import fallito: ${e.message}`);
    }
  }

  async function exportCsv(name) {
    const files = await csvFiles(program);
    const list = name ? [[name, files[name]]] : Object.entries(files);
    for (const [f, content] of list) {
      download(f, `﻿${content}`, 'text/csv;charset=utf-8');
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async function resetPhase() {
    if (!confirm('Ripartire dalla settimana 1 del blocco (da questo lunedì)? Lo storico resta.')) return;
    await updateSettings({ blockStartDate: mondayOf(todayISO()), blockWeek: 1 });
    toast('Fase ripartita dalla settimana 1');
  }

  async function loadSeed() {
    const { loadSeed: load } = await import('../seed.js');
    const n = await load(program, rules, settings);
    refreshSeed();
    toast(`Caricati ${n} record di esempio`);
  }

  async function removeSeed() {
    if (!confirm('Cancellare tutti i dati di esempio?')) return;
    const n = await deleteSeedData();
    refreshSeed();
    toast(`Cancellati ${n} record di esempio`);
  }

  async function wipeAll() {
    if (!confirm('Cancellare TUTTI i dati (sedute, misure, nutrizione, check)? Fai prima un export.')) return;
    if (!confirm('Sicuro? Operazione irreversibile.')) return;
    for (const t of DATA_TABLES) await db[t].clear();
    refreshSeed();
    toast('Dati cancellati');
  }

  return (
    <div>
      <header class="topbar">
        <div class="grow">
          <h1>Altro</h1>
          <div class="sub">Profilo, dati, configurazione</div>
        </div>
      </header>

      <div class="card">
        <h3>Profilo</h3>
        <div class="grid2" style={{ marginTop: 8 }}>
          <label class="field"><span>Altezza cm</span><NumInput value={settings.heightCm} onChange={set('heightCm')} /></label>
          <label class="field"><span>Età</span><NumInput value={settings.age} onChange={set('age')} /></label>
          <label class="field"><span>Peso iniziale kg</span><NumInput value={settings.startWeightKg} onChange={set('startWeightKg')} /></label>
          <label class="field"><span>Grasso iniziale stimato %</span><NumInput value={settings.startBodyFatPct} onChange={set('startBodyFatPct')} /></label>
          <label class="field"><span>Settimane a 0/10 per sblocco</span><NumInput value={settings.injuryClearWeeks} onChange={set('injuryClearWeeks')} /></label>
        </div>
        <Check checked={settings.soundOn} onChange={set('soundOn')}>Suono a fine recupero</Check>
      </div>

      <div class="card">
        <h3>Fase</h3>
        <p class="small muted">Fase {settings.phase} · settimana {settings.blockWeek} di {rules.block.lengthWeeks} · blocco dal {settings.blockStartDate}</p>
        <div class="row wrap">
          <button class="btn" onClick={resetPhase}>Reset fase (settimana 1)</button>
          <a class="btn" href="#/stampa">Stampa seduta di oggi (A4)</a>
        </div>
      </div>

      <div class="card">
        <h3>Dati</h3>
        <p class="small muted">Tutto resta sul telefono (IndexedDB). Esporta un backup ogni tanto.</p>
        <div class="row wrap">
          <button class="btn primary" onClick={doExport}>Esporta JSON</button>
          <label class="btn">
            Importa JSON
            <input type="file" accept="application/json,.json" class="hidden" onChange={(e) => doImport(e.currentTarget.files[0])} />
          </label>
          <button class="btn" onClick={() => exportCsv()}>Esporta CSV (tutte)</button>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary class="small muted">CSV singoli</summary>
          <div class="row wrap" style={{ marginTop: 6 }}>
            {['serie.csv', 'sedute.csv', 'misure.csv', 'nutrizione.csv', 'check-settimanali.csv'].map((f) => (
              <button key={f} class="btn small" onClick={() => exportCsv(f)}>{f}</button>
            ))}
          </div>
        </details>
      </div>

      <div class="card">
        <h3>Dati di esempio</h3>
        <p class="small muted">{seedCount ? `${seedCount} record di esempio presenti (marcati "esempio").` : 'Nessun dato di esempio.'}</p>
        <div class="row wrap">
          <button class="btn" onClick={loadSeed}>Carica 3 settimane di esempio</button>
          <button class="btn danger" onClick={removeSeed} disabled={!seedCount}>Cancella dati di esempio</button>
        </div>
      </div>

      <ConfigEditor kind="program" title="program.json" value={program} source={config.programSource} fileValue={config.fileProgram} />
      <ConfigEditor kind="rules" title="rules.json" value={rules} source={config.rulesSource} fileValue={config.fileRules} />

      <div class="card">
        <h3>Zona pericolosa</h3>
        <button class="btn danger" onClick={wipeAll}>Cancella tutti i dati</button>
      </div>
      <p class="tiny muted center">Nessun server, nessun account, nessuna telemetria.</p>
    </div>
  );
}

function ConfigEditor({ kind, title, value, source, fileValue }) {
  const { program, reload, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    if (open) setText(JSON.stringify(value, null, 2));
  }, [open, value]);

  function check() {
    try {
      const v = JSON.parse(text);
      const errs = kind === 'program' ? validateProgram(v) : validateRules(v, program);
      setErrors(errs.length ? errs : ['✓ Valido']);
      return errs.length ? null : v;
    } catch (e) {
      setErrors([`JSON non valido: ${e.message}`]);
      return null;
    }
  }

  async function save() {
    const v = check();
    if (!v) return;
    const errs = await saveOverride(kind, v);
    if (errs.length) return setErrors(errs);
    await reload();
    toast(`${title} salvato nell'app`);
  }

  async function restore() {
    if (!confirm(`Tornare al ${title} originale del sito? Le modifiche fatte nell'app si perdono.`)) return;
    await clearOverride(kind);
    await reload();
    setText(JSON.stringify(fileValue, null, 2));
    toast(`${title} ripristinato dal file`);
  }

  return (
    <details class="card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary class="row between">
        <h3>Editor {title}</h3>
        <span class={`badge ${source === 'app' ? 'warn' : ''}`}>{source === 'app' ? 'modificato nell\'app' : 'da file'}</span>
      </summary>
      {open && (
        <>
          <p class="tiny muted">
            Il file sul sito ({title}) resta la base: qui salvi una versione modificata sul telefono. Puoi anche modificare il file nel repository e ripubblicare, poi premere "Ricarica".
          </p>
          <textarea value={text} onInput={(e) => setText(e.currentTarget.value)} style={{ minHeight: 320 }} spellcheck={false} />
          {errors.length > 0 && (
            <ul class="small" style={{ color: errors[0].startsWith('✓') ? 'var(--good)' : 'var(--danger)' }}>
              {errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div class="row wrap" style={{ marginTop: 8 }}>
            <button class="btn" onClick={check}>Valida</button>
            <button class="btn primary" onClick={save}>Salva</button>
            <button class="btn" onClick={restore}>Ripristina file</button>
            <button class="btn" onClick={async () => { await reload(); toast('Configurazione ricaricata'); }}>Ricarica</button>
            <button class="btn" onClick={() => download(title, JSON.stringify(value, null, 2))}>Scarica</button>
          </div>
        </>
      )}
    </details>
  );
}

// Used when the loaded configuration is invalid.
SettingsScreen.ConfigReset = function ConfigReset({ onDone }) {
  return (
    <button
      class="btn"
      onClick={async () => {
        await clearOverride('program');
        await clearOverride('rules');
        onDone();
      }}
    >
      Ripristina i file originali
    </button>
  );
};
