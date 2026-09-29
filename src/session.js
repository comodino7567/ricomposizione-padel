import { getSessionFor, saveSession } from './db.js';

export function newSession(date, plan) {
  return {
    date,
    programDayId: plan.day.id,
    dayType: plan.day.type,
    blockWeek: plan.blockWeek,
    deload: plan.isDeload,
    status: 'inProgress',
    startedAt: new Date().toISOString(),
    entries: [],
    warmupDone: {},
    checklist: {},
    rehabDone: {},
  };
}

// Load-modify-save of the session for (date, program day).
export async function mutateSession(date, plan, fn) {
  const existing = await getSessionFor(date, plan.day.id);
  const draft = structuredClone(existing || newSession(date, plan));
  fn(draft);
  return saveSession(draft);
}

export function entryFor(session, block) {
  return session?.entries?.find((e) => e.blockId === block.id && e.exerciseId === block.exerciseId) || null;
}

export function upsertSet(draft, block, index, set) {
  let e = draft.entries.find((x) => x.blockId === block.id && x.exerciseId === block.exerciseId);
  if (!e) {
    e = { blockId: block.id, exerciseId: block.exerciseId, prescribed: block.prescribed, sets: [], notes: '' };
    draft.entries.push(e);
  }
  if (index < e.sets.length) e.sets[index] = set;
  else e.sets.push(set);
  if (!draft.firstSetAt) draft.firstSetAt = new Date().toISOString();
}

export function removeSet(draft, block, index) {
  const e = draft.entries.find((x) => x.blockId === block.id && x.exerciseId === block.exerciseId);
  if (!e) return;
  e.sets.splice(index, 1);
  if (!e.sets.length) draft.entries = draft.entries.filter((x) => x !== e);
}
