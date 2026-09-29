import { useEffect, useState } from 'preact/hooks';
import { loadConfig } from './config.js';
import { db, defaultSettings, saveSettings } from './db.js';
import { todayISO } from './engine/dates.js';
import { blockWeekFor } from './engine/prescription.js';
import { AppContext, useHashRoute, useLive } from './hooks.js';
import { RestTimer } from './components/timer.jsx';
import { Today } from './screens/Today.jsx';
import { ProgramScreen } from './screens/Program.jsx';
import { Measures } from './screens/Measures.jsx';
import { Nutrition } from './screens/Nutrition.jsx';
import { Weekly } from './screens/Weekly.jsx';
import { Progress } from './screens/Progress.jsx';
import { SettingsScreen } from './screens/Settings.jsx';
import { PrintToday } from './screens/PrintToday.jsx';

const ICONS = {
  oggi: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  programma: 'M4 5h16M4 12h16M4 19h10',
  misure: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  nutrizione: 'M12 21c-4 0-7-3-7-8 0-4 3-6 5-6 1 0 1.5.5 2 .5s1-.5 2-.5c2 0 5 2 5 6 0 5-3 8-7 8zM12 7c0-2 1-4 3-4',
  check: 'M4 12l5 5L20 6',
  progressi: 'M5 20V10M12 20V4M19 20v-7',
  impostazioni: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
};

const TABS = [
  ['oggi', 'Oggi'],
  ['programma', 'Programma'],
  ['misure', 'Misure'],
  ['nutrizione', 'Cibo'],
  ['check', 'Check'],
  ['progressi', 'Progressi'],
  ['impostazioni', 'Altro'],
];

export function App() {
  const route = useHashRoute();
  const [config, setConfig] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  // null = no settings saved yet; undefined = still loading.
  const stored = useLive(() => db.kv.get('settings').then((r) => r || null), [], undefined);
  const settings = stored === undefined ? null : { ...defaultSettings(), ...(stored?.value || {}) };

  const reload = async () => setConfig(await loadConfig());
  useEffect(() => {
    reload();
  }, []);

  // Keep settings.blockWeek in sync with the calendar (it is derived from blockStartDate).
  useEffect(() => {
    if (!settings || !config?.rules || config.fatal.length) return;
    const week = blockWeekFor(settings, todayISO(), config.rules);
    if (!stored || settings.blockWeek !== week) saveSettings({ ...settings, blockWeek: week });
  }, [stored, config]);

  const toast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 3500);
  };

  const updateSettings = async (patchOrFn) => {
    const cur = { ...defaultSettings(), ...((await db.kv.get('settings'))?.value || {}) };
    const next = typeof patchOrFn === 'function' ? patchOrFn(cur) : { ...cur, ...patchOrFn };
    await saveSettings(next);
    return next;
  };

  if (!config || !settings) return <div class="app"><p class="muted" style={{ paddingTop: 40 }}>Caricamento…</p></div>;

  if (config.fatal.length) {
    return (
      <div class="app">
        <div class="card">
          <h2>Configurazione non valida</h2>
          <ul class="small">{config.fatal.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
          <p class="small muted">Correggi program.json / rules.json oppure ripristina i file originali.</p>
          <SettingsScreen.ConfigReset onDone={reload} />
        </div>
      </div>
    );
  }

  const ctx = { program: config.program, rules: config.rules, config, settings, updateSettings, reload, toast };
  const Screen = {
    oggi: Today,
    programma: ProgramScreen,
    misure: Measures,
    nutrizione: Nutrition,
    check: Weekly,
    progressi: Progress,
    impostazioni: SettingsScreen,
    stampa: PrintToday,
  }[route] || Today;

  return (
    <AppContext.Provider value={ctx}>
      <div class="app">
        {config.warnings.map((w) => (
          <div key={w} class="alert warn no-print">{w}</div>
        ))}
        <Screen />
      </div>
      <RestTimer soundOn={settings.soundOn} />
      {toastMsg && <div class="toast" role="status">{toastMsg}</div>}
      <nav class="nav" aria-label="Sezioni">
        {TABS.map(([id, label]) => (
          <a key={id} href={`#/${id}`} class={route === id || (route === 'stampa' && id === 'oggi') ? 'active' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d={ICONS[id]} />
            </svg>
            {label}
          </a>
        ))}
      </nav>
    </AppContext.Provider>
  );
}
