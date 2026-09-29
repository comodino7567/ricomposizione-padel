import { useEffect, useState } from 'preact/hooks';
import { db, upsertByDate } from '../db.js';
import { compositionSeries } from '../engine/bodyfat.js';
import { diffDays, formatDateIT, todayISO } from '../engine/dates.js';
import { movingAverage } from '../engine/math.js';
import { useApp, useLive } from '../hooks.js';
import { resizeImage } from '../photos.js';
import { LineChart } from '../components/LineChart.jsx';
import { fmtNum, NumInput, Stat } from '../components/ui.jsx';

const CIRCS = [
  ['waistCm', 'Vita (ombelico)'],
  ['neckCm', 'Collo'],
  ['shouldersCm', 'Spalle'],
  ['chestCm', 'Petto'],
  ['armFlexedCm', 'Braccio contratto'],
  ['thighCm', 'Coscia'],
];
const VIEWS = [
  ['front', 'Fronte'],
  ['side', 'Lato'],
  ['back', 'Dietro'],
];

export function Measures() {
  const { settings, toast } = useApp();
  const metrics = useLive(() => db.bodyMetrics.orderBy('date').toArray(), [], []);
  const [date, setDate] = useState(todayISO());
  const current = metrics.find((m) => m.date === date) || { date };
  const [form, setForm] = useState(current);
  useEffect(() => setForm(metrics.find((m) => m.date === date) || { date }), [date, metrics.length]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  async function save(keys) {
    const patch = Object.fromEntries(keys.map((k) => [k, form[k] ?? null]));
    await upsertByDate('bodyMetrics', date, patch);
    toast('Misure salvate');
  }

  async function addPhoto(view, file) {
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      const photos = (current.photos || []).filter((p) => p.view !== view);
      await upsertByDate('bodyMetrics', date, { photos: [...photos, { view, dataUrl }] });
      toast('Foto salvata');
    } catch (e) {
      toast(e.message);
    }
  }

  async function removePhoto(view) {
    await upsertByDate('bodyMetrics', date, { photos: (current.photos || []).filter((p) => p.view !== view) });
  }

  const weights = metrics.filter((m) => m.weightKg).map((m) => ({ date: m.date, value: m.weightKg }));
  const recent = weights.filter((w) => diffDays(todayISO(), w.date) <= 120);
  const avg = movingAverage(recent, 7, diffDays);
  const comp = compositionSeries(metrics, settings.heightCm);
  const lastComp = comp[comp.length - 1];
  const firstComp = comp[0];
  const waists = metrics.filter((m) => m.waistCm).map((m) => ({ x: m.date, y: m.waistCm }));
  const lastAvg = avg.length ? avg[avg.length - 1].value : null;

  return (
    <div>
      <header class="topbar">
        <div class="grow">
          <h1>Misure</h1>
          <div class="sub">Peso a digiuno, circonferenze, foto</div>
        </div>
        <input type="date" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} style={{ width: 150 }} />
      </header>

      <div class="card">
        <h3>Mattina · {formatDateIT(date)}</h3>
        <div class="grid3" style={{ marginTop: 8 }}>
          <label class="field"><span>Peso kg</span><NumInput value={form.weightKg} onChange={set('weightKg')} /></label>
          <label class="field"><span>Sonno h</span><NumInput value={form.sleepH} onChange={set('sleepH')} /></label>
          <label class="field"><span>FC riposo</span><NumInput value={form.restingHR} onChange={set('restingHR')} /></label>
        </div>
        <button class="btn primary block" style={{ marginTop: 10 }} onClick={() => save(['weightKg', 'sleepH', 'restingHR'])}>Salva</button>
      </div>

      <div class="card">
        <div class="row between">
          <h3>Peso</h3>
          <span class="small muted num">media 7 gg: {lastAvg ? `${fmtNum(lastAvg)} kg` : '—'}</span>
        </div>
        <LineChart
          series={[
            { name: 'Pesata', color: 'var(--muted)', points: recent.map((w) => ({ x: w.date, y: w.value })), dots: true, line: false },
            { name: 'Media mobile 7 gg', color: 'var(--series-1)', points: avg.map((w) => ({ x: w.date, y: Math.round(w.value * 10) / 10 })) },
          ]}
          yFormat={(v) => fmtNum(v)}
          unit=" kg"
        />
      </div>

      <div class="card">
        <h3>Massa grassa stimata (US Navy)</h3>
        {lastComp ? (
          <>
            <div class="stats" style={{ marginTop: 8 }}>
              <Stat k="Grasso" v={`${fmtNum(lastComp.bodyFatPct)}%`} sub={firstComp !== lastComp ? `${lastComp.bodyFatPct - firstComp.bodyFatPct >= 0 ? '+' : ''}${fmtNum(lastComp.bodyFatPct - firstComp.bodyFatPct)} pt` : null} />
              <Stat k="Massa grassa" v={`${fmtNum(lastComp.fatKg)} kg`} sub={firstComp !== lastComp ? `${fmtNum(lastComp.fatKg - firstComp.fatKg)} kg` : null} />
              <Stat k="Massa magra" v={`${fmtNum(lastComp.leanKg)} kg`} sub={firstComp !== lastComp ? `${lastComp.leanKg - firstComp.leanKg >= 0 ? '+' : ''}${fmtNum(lastComp.leanKg - firstComp.leanKg)} kg` : null} />
            </div>
            {comp.length > 1 && (
              <>
                <div class="lbl">Grasso %</div>
                <LineChart series={[{ name: 'Grasso %', color: 'var(--series-2)', points: comp.map((c) => ({ x: c.date, y: Math.round(c.bodyFatPct * 10) / 10 })), dots: true }]} height={130} yFormat={(v) => fmtNum(v)} unit="%" />
                <div class="lbl">Massa magra kg</div>
                <LineChart series={[{ name: 'Massa magra', color: 'var(--series-3)', points: comp.map((c) => ({ x: c.date, y: Math.round(c.leanKg * 10) / 10 })), dots: true }]} height={130} yFormat={(v) => fmtNum(v)} unit=" kg" />
              </>
            )}
            <p class="tiny muted">Stima dalla formula US Navy con altezza {settings.heightCm} cm, vita e collo. Utile per il trend, non come valore assoluto.</p>
          </>
        ) : (
          <p class="small muted">Inserisci vita e collo per la stima (partenza: circa {settings.startBodyFatPct}%).</p>
        )}
      </div>

      <div class="card">
        <h3>Circonferenze · {formatDateIT(date)}</h3>
        <p class="tiny muted">Ogni 2 settimane, la domenica mattina, sempre nello stesso punto.</p>
        <div class="grid2" style={{ marginTop: 8 }}>
          {CIRCS.map(([k, l]) => (
            <label key={k} class="field"><span>{l} cm</span><NumInput value={form[k]} onChange={set(k)} /></label>
          ))}
        </div>
        <button class="btn primary block" style={{ marginTop: 10 }} onClick={() => save(CIRCS.map(([k]) => k))}>Salva circonferenze</button>
        {waists.length > 1 && (
          <>
            <div class="lbl">Vita cm</div>
            <LineChart series={[{ name: 'Vita', color: 'var(--series-1)', points: waists, dots: true }]} height={130} yFormat={(v) => fmtNum(v)} unit=" cm" />
          </>
        )}
      </div>

      <div class="card">
        <h3>Foto · {formatDateIT(date)}</h3>
        <div class="grid3" style={{ marginTop: 8 }}>
          {VIEWS.map(([v, l]) => {
            const p = current.photos?.find((x) => x.view === v);
            return (
              <div key={v}>
                <div class="lbl">{l}</div>
                {p ? (
                  <>
                    <img src={p.dataUrl} alt={l} style={{ width: '100%', borderRadius: 8, aspectRatio: '3/4', objectFit: 'cover' }} />
                    <button class="btn small ghost block" onClick={() => removePhoto(v)}>Rimuovi</button>
                  </>
                ) : (
                  <label class="btn small block">
                    + foto
                    <input type="file" accept="image/*" capture="environment" class="hidden" onChange={(e) => addPhoto(v, e.currentTarget.files[0])} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <PhotoCompare metrics={metrics} />

      <div class="card">
        <h3>Storico</h3>
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th>Data</th><th class="r">Peso</th><th class="r">Vita</th><th class="r">Sonno</th><th class="r">FC</th></tr>
            </thead>
            <tbody>
              {[...metrics].reverse().slice(0, 30).map((m) => (
                <tr key={m.date} onClick={() => setDate(m.date)} style={{ cursor: 'pointer' }}>
                  <td>{m.date}{m.seed ? <span class="seed-mark"> esempio</span> : null}</td>
                  <td class="r num">{m.weightKg ?? ''}</td>
                  <td class="r num">{m.waistCm ?? ''}</td>
                  <td class="r num">{m.sleepH ?? ''}</td>
                  <td class="r num">{m.restingHR ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PhotoCompare({ metrics }) {
  const withPhotos = metrics.filter((m) => m.photos?.length);
  const [view, setView] = useState('front');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  if (withPhotos.length < 1) return null;
  const dates = withPhotos.map((m) => m.date);
  const da = a || dates[0];
  const dbb = b || dates[dates.length - 1];
  const photo = (d) => withPhotos.find((m) => m.date === d)?.photos.find((p) => p.view === view);
  return (
    <div class="card">
      <h3>Confronto foto</h3>
      <div class="tabs" style={{ margin: '8px 0' }}>
        {VIEWS.map(([v, l]) => (
          <button key={v} class={`btn small ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>
      <div class="grid2">
        <select value={da} onChange={(e) => setA(e.currentTarget.value)}>{dates.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={dbb} onChange={(e) => setB(e.currentTarget.value)}>{dates.map((d) => <option key={d}>{d}</option>)}</select>
      </div>
      <div class="photos" style={{ marginTop: 8 }}>
        {[da, dbb].map((d, i) => {
          const p = photo(d);
          return p ? <img key={i} src={p.dataUrl} alt={`${view} ${d}`} /> : <div key={i} class="center small muted" style={{ padding: 30 }}>Nessuna foto</div>;
        })}
      </div>
    </div>
  );
}
