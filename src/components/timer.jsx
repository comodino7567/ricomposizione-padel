import { useEffect, useState } from 'preact/hooks';

// Rest timer: a module-level store so it survives screen changes.
// Based on an absolute end time, so it stays correct after the phone sleeps.
let state = { endAt: null, total: 0, label: '', fired: false };
const listeners = new Set();
let audioCtx = null;

function emit() {
  for (const l of listeners) l(state);
}

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((d) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + d);
      o.stop(t + d + 0.2);
    });
  } catch {
    /* audio not available */
  }
}

export function startRest(seconds, label = '') {
  // Creating the audio context inside the tap handler unlocks sound on iOS.
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* ignore */
  }
  state = { endAt: Date.now() + seconds * 1000, total: seconds, label, fired: false };
  emit();
}

export function stopRest() {
  state = { endAt: null, total: 0, label: '', fired: false };
  emit();
}

function addRest(seconds) {
  if (!state.endAt) return;
  state = { ...state, endAt: state.endAt + seconds * 1000, total: state.total + seconds, fired: false };
  emit();
}

export function RestTimer({ soundOn = true }) {
  const [s, setS] = useState(state);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    listeners.add(setS);
    return () => listeners.delete(setS);
  }, []);

  useEffect(() => {
    if (!s.endAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [s.endAt]);

  useEffect(() => {
    if (!s.endAt || s.fired) return;
    if (now >= s.endAt) {
      state = { ...state, fired: true };
      emit();
      if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]);
      if (soundOn) beep();
      setTimeout(() => {
        if (state.fired && Date.now() - state.endAt > 9000) stopRest();
      }, 10000);
    }
  }, [now, s]);

  if (!s.endAt) return null;
  const left = Math.max(0, Math.ceil((s.endAt - now) / 1000));
  const done = left === 0;
  const pct = s.total ? Math.min(100, ((s.total - left) / s.total) * 100) : 100;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div class={`timer ${done ? 'done' : ''}`} role="timer" aria-live="polite">
      <div class="inner">
        <div class="grow">
          <div class="row between">
            <span class="time">{done ? 'Via!' : `${mm}:${ss}`}</span>
            <span class="small muted">{done ? 'Recupero finito' : `Recupero · ${s.label}`}</span>
          </div>
          <div class="bar">
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
        {!done && (
          <button class="btn small" onClick={() => addRest(15)}>
            +15"
          </button>
        )}
        <button class="btn small" onClick={stopRest}>
          {done ? 'OK' : 'Salta'}
        </button>
      </div>
    </div>
  );
}
