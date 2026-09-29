import Dexie from 'dexie';
import { mondayOf, todayISO } from './engine/dates.js';

export const db = new Dexie('ricomposizione');

db.version(1).stores({
  sessions: '++id, date, programDayId, &[date+programDayId]',
  bodyMetrics: 'date',
  nutrition: 'date',
  weeklyChecks: 'weekStart',
  kv: 'key',
});

export const DATA_TABLES = ['sessions', 'bodyMetrics', 'nutrition', 'weeklyChecks'];

export function defaultSettings(today = todayISO()) {
  return {
    phase: 1,
    blockStartDate: mondayOf(today),
    blockWeek: 1,
    maintenanceKcal: null,
    kcalAdjustment: 0,
    kcalTargetGym: null,
    kcalTargetPadel: null,
    proteinTargetG: 185,
    heightCm: 186,
    sex: 'M',
    age: 23,
    startWeightKg: 89,
    startBodyFatPct: 20,
    adductorStep: 1,
    adductorStepSince: today,
    adductorStepHistory: [],
    injuryClearWeeks: 4,
    injuryUnlocked: false,
    substitutions: {},
    modifiers: { rpeDeltaWeeks: [], skipUpperCWeeks: [], padelSuspendedWeeks: [] },
    soundOn: true,
  };
}

export async function getSettings() {
  const row = await db.kv.get('settings');
  return { ...defaultSettings(), ...(row?.value || {}) };
}

export async function saveSettings(settings) {
  await db.kv.put({ key: 'settings', value: settings });
  return settings;
}

export async function patchSettings(patch) {
  const s = await getSettings();
  return saveSettings({ ...s, ...patch });
}

export async function getSessionFor(date, programDayId) {
  return db.sessions.where('[date+programDayId]').equals([date, programDayId]).first();
}

// Upsert keyed by date + program day.
export async function saveSession(session) {
  const existing = await getSessionFor(session.date, session.programDayId);
  const row = { ...existing, ...session, updatedAt: new Date().toISOString() };
  if (existing) row.id = existing.id;
  row.id = await db.sessions.put(row);
  return row;
}

export async function upsertByDate(table, date, patch) {
  const existing = await db[table].get(date);
  const row = { ...existing, ...patch, date };
  if (existing?.seed && !patch.seed) delete row.seed; // real data overrides sample rows
  await db[table].put(row);
  return row;
}

export async function exportAll() {
  const out = { app: 'ricomposizione-padel', schema: 1, exportedAt: new Date().toISOString(), tables: {} };
  for (const t of [...DATA_TABLES, 'kv']) out.tables[t] = await db[t].toArray();
  return out;
}

export function validateBackup(data) {
  if (!data || data.app !== 'ricomposizione-padel' || !data.tables) return 'Il file non è un backup di questa app';
  for (const t of DATA_TABLES) if (data.tables[t] && !Array.isArray(data.tables[t])) return `Tabella ${t} non valida`;
  return null;
}

// Replaces all data with the backup content.
export async function importAll(data) {
  const err = validateBackup(data);
  if (err) throw new Error(err);
  await db.transaction('rw', [...DATA_TABLES, 'kv'].map((t) => db[t]), async () => {
    for (const t of [...DATA_TABLES, 'kv']) {
      await db[t].clear();
      if (data.tables[t]?.length) await db[t].bulkPut(data.tables[t]);
    }
  });
}

export async function deleteSeedData() {
  let n = 0;
  await db.transaction('rw', DATA_TABLES.map((t) => db[t]), async () => {
    for (const t of DATA_TABLES) n += await db[t].filter((r) => r.seed === true).delete();
  });
  return n;
}

export async function countSeedData() {
  let n = 0;
  for (const t of DATA_TABLES) n += await db[t].filter((r) => r.seed === true).count();
  return n;
}
