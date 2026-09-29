import { useEffect, useState } from 'preact/hooks';

// 62.5 → "62,5", 61.25 → "61,25", 60 → "60"
export function fmtKg(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

export function fmtNum(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(digits).replace('.', ',');
}

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="row between" style={{ marginBottom: 10 }}>
          <h2>{title}</h2>
          <button class="btn small ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Check({ checked, onChange, children }) {
  return (
    <label class={`check ${checked ? 'done' : ''}`}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Stat({ k, v, sub }) {
  return (
    <div class="stat">
      <div class="v">{v}</div>
      <div class="k">{k}</div>
      {sub && <div class="tiny muted">{sub}</div>}
    </div>
  );
}

export function Meter({ value, target, label }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      {label && (
        <div class="row between small">
          <span>{label}</span>
          <span class="num muted">
            {Math.round(value || 0)} / {target ? Math.round(target) : '—'}
          </span>
        </div>
      )}
      <div class={`meter ${target && value > target * 1.05 ? 'over' : ''}`}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Numeric input that keeps a local string while typing (supports comma decimals).
export function NumInput({ value, onChange, step = 'any', placeholder, ...rest }) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    const parsed = parseNum(text);
    if (parsed !== value) setText(value == null ? '' : String(value).replace('.', ','));
  }, [value]);
  return (
    <input
      type="text"
      inputmode="decimal"
      value={text}
      placeholder={placeholder}
      step={step}
      onInput={(e) => {
        setText(e.currentTarget.value);
        onChange(parseNum(e.currentTarget.value));
      }}
      {...rest}
    />
  );
}

export function parseNum(s) {
  if (s == null || s === '') return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function PainPicker({ value, onChange }) {
  return (
    <div class="chips" role="radiogroup" aria-label="Dolore inguine 0-10">
      {Array.from({ length: 11 }, (_, i) => (
        <button
          key={i}
          class={`chip small ${value === i ? 'on' : ''}`}
          style={i >= 4 && value !== i ? { borderColor: 'var(--warn)' } : undefined}
          onClick={() => onChange(i)}
          role="radio"
          aria-checked={value === i}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
