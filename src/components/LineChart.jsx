import { useMemo, useRef, useState } from 'preact/hooks';
import { diffDays, shortDateIT } from '../engine/dates.js';

const W = 340;
const PAD = { l: 38, r: 10, t: 12, b: 22 };

function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const start = Math.floor(min / step) * step;
  const out = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * Time-series line chart (dates on x). One y axis only.
 * series: [{ name, color, points: [{ x: 'YYYY-MM-DD', y }], dots, line, dashed }]
 */
export function LineChart({ series, height = 170, yFormat = (v) => v, unit = '' }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const all = series.flatMap((s) => s.points.filter((p) => p.y != null));

  const model = useMemo(() => {
    if (!all.length) return null;
    const dates = [...new Set(all.map((p) => p.x))].sort();
    const x0 = dates[0];
    const span = Math.max(1, diffDays(dates[dates.length - 1], x0));
    let ymin = Math.min(...all.map((p) => p.y));
    let ymax = Math.max(...all.map((p) => p.y));
    const pad = (ymax - ymin) * 0.1 || Math.abs(ymax) * 0.02 || 1;
    ymin -= pad;
    ymax += pad;
    const ticks = niceTicks(ymin, ymax);
    ymin = Math.min(ymin, ticks[0]);
    ymax = Math.max(ymax, ticks[ticks.length - 1]);
    const H = height;
    const sx = (d) => PAD.l + (diffDays(d, x0) / span) * (W - PAD.l - PAD.r);
    const sy = (v) => PAD.t + (1 - (v - ymin) / (ymax - ymin)) * (H - PAD.t - PAD.b);
    return { dates, sx, sy, ticks, H };
  }, [series, height]);

  if (!model) return <p class="muted small">Nessun dato ancora.</p>;
  const { dates, sx, sy, ticks, H } = model;

  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = null;
    for (const d of dates) {
      const dist = Math.abs(sx(d) - px);
      if (!best || dist < best.dist) best = { d, dist };
    }
    setHover(best?.d || null);
  };

  const hoverVals = hover
    ? series.map((s) => ({ s, p: s.points.find((p) => p.x === hover && p.y != null) })).filter((v) => v.p)
    : [];

  return (
    <div class="chart">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={series.map((s) => s.name).join(', ')}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" stroke-width="1" />
            <text x={PAD.l - 6} y={sy(t) + 4} text-anchor="end" font-size="10" fill="var(--muted)">
              {yFormat(t)}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} font-size="10" fill="var(--muted)">{shortDateIT(dates[0])}</text>
        {dates.length > 1 && (
          <text x={W - PAD.r} y={H - 6} text-anchor="end" font-size="10" fill="var(--muted)">
            {shortDateIT(dates[dates.length - 1])}
          </text>
        )}
        {series.map((s) => {
          const pts = s.points.filter((p) => p.y != null);
          const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
          return (
            <g key={s.name}>
              {s.line !== false && pts.length > 1 && (
                <path d={path} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={s.dashed ? '4 4' : undefined} />
              )}
              {(s.dots || pts.length === 1) &&
                pts.map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={s.color} stroke="var(--surface)" stroke-width="1.5" />)}
            </g>
          );
        })}
        {hover && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" stroke-width="1" />
            {hoverVals.map(({ s, p }) => (
              <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r="5" fill={s.color} stroke="var(--surface)" stroke-width="2" />
            ))}
          </g>
        )}
      </svg>
      {hover && hoverVals.length > 0 && (
        <div class="tip" style={{ left: `${(sx(hover) / W) * 100}%` }}>
          {shortDateIT(hover)} · {hoverVals.map(({ s, p }) => `${series.length > 1 ? `${s.name} ` : ''}${yFormat(p.y)}${unit}`).join(' · ')}
        </div>
      )}
      {series.length > 1 && (
        <div class="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
