export function roundTo(value, step) {
  if (!step) return Math.round(value * 100) / 100;
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

export function mean(values) {
  const v = values.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// Trailing moving average over `days` calendar days (points sorted by date).
export function movingAverage(points, days, diffDays) {
  return points.map((p, i) => {
    const window = [];
    for (let j = i; j >= 0; j--) {
      if (diffDays(p.date, points[j].date) >= days) break;
      window.push(points[j].value);
    }
    return { date: p.date, value: mean(window) };
  });
}
