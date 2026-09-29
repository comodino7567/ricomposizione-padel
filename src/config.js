import { db } from './db.js';
import { validateProgram, validateRules } from './engine/validate.js';

async function fetchJSON(name) {
  const res = await fetch(`./${name}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Loads program.json and rules.json from the site (cached offline by the service
 * worker). An override edited in the app (stored in IndexedDB) wins if valid.
 */
export async function loadConfig() {
  const warnings = [];
  let fileProgram = null;
  let fileRules = null;
  try {
    [fileProgram, fileRules] = await Promise.all([fetchJSON('program.json'), fetchJSON('rules.json')]);
  } catch (e) {
    warnings.push(`Impossibile leggere i file di configurazione: ${e.message}`);
  }
  const progOverride = (await db.kv.get('programOverride'))?.value;
  const rulesOverride = (await db.kv.get('rulesOverride'))?.value;

  let program = fileProgram;
  let programSource = 'file';
  if (progOverride) {
    const errs = validateProgram(progOverride);
    if (errs.length) warnings.push(`program.json modificato nell'app non valido, uso il file: ${errs[0]}`);
    else {
      program = progOverride;
      programSource = 'app';
    }
  }
  let rules = fileRules;
  let rulesSource = 'file';
  if (rulesOverride) {
    const errs = validateRules(rulesOverride, program);
    if (errs.length) warnings.push(`rules.json modificato nell'app non valido, uso il file: ${errs[0]}`);
    else {
      rules = rulesOverride;
      rulesSource = 'app';
    }
  }

  const fatal = [];
  if (!program) fatal.push('program.json non disponibile');
  else fatal.push(...validateProgram(program).map((e) => `program.json: ${e}`));
  if (!rules) fatal.push('rules.json non disponibile');
  else if (program) fatal.push(...validateRules(rules, program).map((e) => `rules.json: ${e}`));

  return { program, rules, programSource, rulesSource, warnings, fatal, fileProgram, fileRules };
}

export async function saveOverride(kind, value) {
  const errs = kind === 'program' ? validateProgram(value) : validateRules(value, (await loadConfig()).program);
  if (errs.length) return errs;
  await db.kv.put({ key: `${kind}Override`, value });
  return [];
}

export async function clearOverride(kind) {
  await db.kv.delete(`${kind}Override`);
}
