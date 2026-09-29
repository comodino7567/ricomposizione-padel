# Ricomposizione + padel

App personale (PWA, funziona offline) per gestire palestra, padel e ricomposizione corporea.
Contiene il programma di Fase 1, registra ogni serie dal telefono e applica da sola le regole di
progressione, volume, scarico, nutrizione e infortunio. Ogni giorno mostra la seduta con i carichi
target già calcolati dallo storico.

- Nessun server, nessun account, nessuna telemetria: i dati restano sul telefono (IndexedDB).
- Il programma è in `public/program.json`, le regole numeriche in `public/rules.json`: si modificano
  a mano, oppure dall'app (Altro → Editor).

## Avvio in locale

Serve Node.js 20 o successivo.

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm test           # test unitari (Vitest)
npm run validate   # controlla program.json e rules.json dopo una modifica a mano
npm run build      # crea la cartella dist/ da pubblicare
npm run preview    # prova la build su http://localhost:4173
```

## Pubblicazione

Il service worker (che serve per l'uso offline) funziona solo in HTTPS, quindi l'app va pubblicata.
Entrambe le opzioni sotto sono gratuite.

### GitHub Pages (consigliato)

1. Crea un repository su GitHub e fai il push di questo progetto sul branch `main`.
2. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. A ogni push su `main` il workflow `.github/workflows/deploy.yml` valida la configurazione, esegue i
   test, fa la build e pubblica `dist/`. L'indirizzo sarà `https://<utente>.github.io/<repository>/`.

Il sito usa percorsi relativi, quindi funziona anche in una sottocartella.

### Vercel

1. Su vercel.com: **Add New → Project**, importa il repository (framework "Vite", già configurato da
   `vercel.json`).
2. In alternativa, da terminale: `npx vercel --prod`.

Prima di pubblicare puoi fare un controllo completo con `npm run deploy:check`.

## Installazione sul telefono

Apri l'indirizzo pubblicato **una volta con la rete**: l'app si salva sul telefono e da quel momento
funziona anche senza connessione.

### iPhone (Safari)

1. Apri l'indirizzo con **Safari** (non con altri browser).
2. Tocca **Condividi** (il quadrato con la freccia in su).
3. Scegli **Aggiungi alla schermata Home** e poi **Aggiungi**.
4. Apri l'app dall'icona nella Home: si apre a schermo intero e funziona offline.

Note per iPhone:
- Safari può cancellare i dati dei siti non usati per molte settimane. Usa l'app dall'icona nella Home
  e fai un **Esporta JSON** ogni tanto (Altro → Dati).
- iOS non supporta la vibrazione dai siti web: a fine recupero suona un segnale acustico (attiva la
  suoneria).

### Android (Chrome)

1. Apri l'indirizzo con **Chrome**.
2. Tocca il banner **Installa app**, oppure menu **⋮ → Installa app** (o **Aggiungi a schermata Home**).
3. Apri l'app dall'icona: funziona offline, con vibrazione e suono a fine recupero.

### Aggiornamenti

Dopo un nuovo deploy l'app scarica la nuova versione in background: chiudila e riaprila (a volte
servono due aperture). I dati non si perdono.

## Uso

| Schermata | Cosa fa |
|---|---|
| **Oggi** | Seduta del giorno: riscaldamento, serie di avvicinamento, esercizi con carico target, range, RPE e tecnica. Per registrare una serie basta **Salva serie** (valori già compilati); per cambiare ripetizioni e RPE bastano altri 2 tocchi. Poi parte il timer di recupero. Nei giorni di padel e partite: checklist, dolore all'inguine e sensazioni. Con **‹ ›** ti sposti tra i giorni. |
| **Programma** | Settimana X di 6, volume per gruppo muscolare (fatto contro target), settimana tipo, sostituzioni, esercizi bloccati e step di riabilitazione. |
| **Misure** | Peso a digiuno, sonno e FC a riposo ogni mattina; circonferenze; foto (fronte, lato, dietro) con confronto tra due date; massa grassa US Navy. |
| **Cibo** | Target del giorno (palestra o padel), inserimento rapido di kcal, macro, creatina e passi, setup del mantenimento su 4 giorni. |
| **Check** | Check della domenica: riepilogo della settimana, decisioni proposte da confermare con un tocco, stampa ed export. |
| **Progressi** | e1RM, volume e record personali per esercizio. |
| **Altro** | Export e import JSON, CSV, stampa A4, reset della fase, editor di program.json e rules.json, dati di esempio. |

**Stampa A4:** su Oggi tocca **Stampa**, poi **Stampa / PDF**.

**Dati di esempio:** con il database vuoto, Oggi propone di caricare 3 settimane di esempio. Sono
marcati "esempio" e si cancellano da **Altro → Cancella dati di esempio**. Nell'esempio l'ultima
partita ha dolore 4/10, quindi compaiono gli avvisi inguine (padel ridotto, squat sostituito):
spariscono quando cancelli l'esempio.

## Modificare programma e regole

- **Dal repository:** modifica `public/program.json` o `public/rules.json`, esegui `npm run validate`
  e ripubblica. Nell'app, **Altro → Editor → Ricarica**.
- **Dall'app:** **Altro → Editor program.json / rules.json**, poi Valida e Salva. La versione modificata
  resta sul telefono, e **Ripristina file** torna a quella pubblicata. Una configurazione non valida
  non viene mai salvata: l'app mostra l'errore.

Cosa c'è nei file:

- `program.json`: esercizi (gruppi muscolari, attrezzo, tipo di carico, incremento, sostituti,
  `blockedByInjury`), riscaldamenti, i 3 step di riabilitazione, i 7 giorni con i blocchi (serie, range,
  RPE, recupero, tecnica, note), le definizioni delle tecniche.
- `rules.json`: durata del blocco e settimana di scarico, soglie di progressione, rampa del volume
  (serie aggiunte per settimana, giorno ed esercizio), scarico, nutrizione, infortunio, check
  settimanale.

## Struttura del codice

```
public/program.json, public/rules.json   configurazione modificabile
src/engine/        motore delle regole (funzioni pure, testate)
  progression.js   doppia progressione, stallo −10%, aumento dalla 2ª serie, default
  prescription.js  rampa del volume, scarico, tecniche, settimana del blocco
  plan.js          piano del giorno: sostituzioni, infortunio, target, modificatori
  injury.js        dolore, avvisi, sblocco, step di riabilitazione
  nutrition.js     mantenimento, target, proteine, check ogni 2 settimane
  weekly.js        riepilogo settimanale, decisioni proposte e loro applicazione
  bodyfat.js, e1rm.js, warmup.js, volume.js, validate.js, csv.js
src/screens/       schermate (Preact)
src/db.js          IndexedDB (Dexie), export/import
src/seed.js        dati di esempio (generati con il motore vero)
tests/             test Vitest
```
