// US Navy formula (men, cm):
// BF% = 495 / (1.0324 − 0.19077 × log10(waist − neck) + 0.15456 × log10(height)) − 450
export function navyBodyFatPct(waistCm, neckCm, heightCm) {
  if (!(waistCm > 0 && neckCm > 0 && heightCm > 0)) return null;
  if (waistCm <= neckCm) return null;
  const density = 1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm);
  return 495 / density - 450;
}

export function bodyComposition(weightKg, bodyFatPct) {
  if (!(weightKg > 0) || bodyFatPct == null) return null;
  const fatKg = (weightKg * bodyFatPct) / 100;
  return { bodyFatPct, fatKg, leanKg: weightKg - fatKg };
}

// Builds a composition series from body metrics: each entry with waist+neck
// uses the nearest weight on or before that date.
export function compositionSeries(metrics, heightCm) {
  const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  let lastWeight = null;
  for (const m of sorted) {
    if (m.weightKg) lastWeight = m.weightKg;
    if (m.waistCm && m.neckCm) {
      const pct = navyBodyFatPct(m.waistCm, m.neckCm, heightCm);
      const comp = bodyComposition(m.weightKg || lastWeight, pct);
      if (comp) out.push({ date: m.date, ...comp });
    }
  }
  return out;
}
