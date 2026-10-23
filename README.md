# 🎅 Secret Santa tra amici

Applicazione web gratuita per organizzare il Secret Santa: l'organizzatore aggiunge i partecipanti (con foto) oppure
condivide un **link d'iscrizione** nel gruppo,
imposta le esclusioni, fa l'estrazione in segreto, la verifica e la pubblica quando vuole. Ogni partecipante
riceve un **link personale** e scopre, con una piccola animazione, chi deve sorprendere e la sua fotografia.

- **Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage) · Vercel Hobby
- **Costo:** 0 € con i piani gratuiti di Supabase e Vercel; nessun dominio a pagamento; email automatiche facoltative.
- **Lingua:** interfaccia interamente in italiano, responsive (smartphone, tablet, desktop).

---

## Indice

1. [Funzionalità](#funzionalità)
2. [Come funziona la sicurezza](#come-funziona-la-sicurezza)
3. [Avvio in locale](#avvio-in-locale)
4. [Test e controlli](#test-e-controlli)
5. [Creare il progetto Supabase (cloud)](#creare-il-progetto-supabase-cloud)
6. [Account degli organizzatori](#account-degli-organizzatori)
7. [Pubblicare su Vercel](#pubblicare-su-vercel)
8. [Variabili d'ambiente](#variabili-dambiente)
9. [Guida all'uso: organizzare un'estrazione](#guida-alluso-organizzare-unestrazione)
10. [Email: invio automatico e invio manuale](#email-invio-automatico-e-invio-manuale)
11. [Limiti dei piani gratuiti](#limiti-dei-piani-gratuiti)
12. [Struttura del progetto](#struttura-del-progetto)

---

## Funzionalità

**Organizzatore (area `/admin`, protetta da Supabase Auth)**

- **Account personale** creato dal sito (`/admin/registrati`, email e password, gratis): ogni organizzatore vede e gestisce
  **solo i propri eventi**. Dalla pagina *Account* si cambia la password o si elimina l'account con tutti i suoi eventi.
- Più eventi, ognuno con nome, budget, data dello scambio e messaggio per i partecipanti.
- Partecipanti: aggiunta, modifica di nome/email/foto, immagine predefinita natalizia, eliminazione (solo prima dell'estrazione).
- **Link d'iscrizione** da mandare nel gruppo (es. WhatsApp): ognuno si iscrive da solo con nome, email e foto facoltativa
  e riceve subito per email il proprio link personale. Si apre, si chiude e si rigenera dall'evento; si chiude da solo con l'estrazione.
- **Foto di copertina** dell'evento, mostrata a tutti nella pagina d'iscrizione e nei link personali.
- Fotografie: caricamento con ridimensionamento automatico nel browser (max 800 px) e verifica del formato reale sul server.
- Esclusioni in una direzione (A → B) o in entrambe (A ↔ B), con indicatore di fattibilità e diagnosi del problema.
- Estrazione con algoritmo affidabile (matching bipartito + backtracking): nessuno regala a sé stesso, ognuno regala e riceve
  esattamente una volta, tutte le esclusioni rispettate. Se non esiste una soluzione non viene salvato nulla.
- Tabella privata degli abbinamenti (chi regala, a chi, stato della pubblicazione).
- Stati `DRAFT` (In preparazione) → `DRAWN` (Estratto, segreto) → `PUBLISHED` (Pubblicato) → `CLOSED` (Chiuso).
- Rifare l'estrazione prima della pubblicazione; annullamento sicuro di un'estrazione pubblicata (va digitato il nome dell'evento).
- Inviti: link personale, messaggio pronto da copiare, apertura diretta di WhatsApp o dell'app email, rigenerazione del link,
  invio automatico via SMTP (facoltativo). Stato di ogni partecipante: invito copiato/inviato, link aperto, risultato visto.

**Iscrizione (pagina `/iscrizione#<token>`)**

- Copertina e dettagli dell'evento, modulo con nome, email (obbligatoria: serve per ricevere il link) e foto facoltativa.
- Dopo l'iscrizione: link personale a schermo e, se l'invio automatico è configurato, anche via email.

**Partecipante (pagina `/p#<token>`)**

- Benvenuto con il proprio nome, copertina e dettagli dell'evento.
- Finché l'estrazione non è fatta può modificare da solo nome, immagine e foto ("I tuoi dati"); l'email la cambia solo l'organizzatore.
- Banner "Pensieri sul donare": citazioni autentiche (con fonte) di politici, generali, avvocati e funzionari che col Natale
  c'entrano poco, più qualche battuta di personaggi dichiaratamente immaginari. Il pulsante "Un'altra citazione" ne pesca un'altra.
- Prima della pubblicazione: *"L'estrazione è pronta, ma Babbo Natale non ha ancora dato il via libera. Torna più tardi!"*
- Dopo la pubblicazione: pulsante per aprire il pacco regalo animato, poi foto e nome della persona assegnata.

---

## Come funziona la sicurezza

| Aspetto | Soluzione |
| --- | --- |
| Area organizzatore | Login Supabase Auth (email + password); chiunque può creare un account dal sito. Ogni pagina e ogni server action verifica il JWT. |
| Database | Row Level Security su tutte le tabelle: ogni organizzatore legge e modifica **solo i propri eventi** (e i relativi partecipanti, token, esclusioni, abbinamenti e foto), controllato nel database con `owns_event()`, non dall'app. Il ruolo anonimo non ha alcun privilegio sulle tabelle. |
| Limiti anti-abuso | Registrazione aperta, quindi: massimo 20 eventi per organizzatore e 100 partecipanti per evento (imposti dal database), più i limiti di frequenza di Supabase Auth su registrazioni e accessi. |
| Stato ed estrazione | Lo stato dell'evento, i token e gli abbinamenti **non** sono modificabili direttamente (permessi per colonna). Si cambiano solo con funzioni PostgreSQL transazionali (`save_draw`, `publish_event`, `close_event`, `reset_draw`) che rivalidano tutto e usano lock di riga contro le race condition. |
| Modifiche pericolose | Dopo l'estrazione, trigger nel database impediscono di aggiungere/eliminare partecipanti o esclusioni finché l'estrazione non viene annullata. |
| Partecipanti | Accedono solo tramite le funzioni `participant_status` e `participant_reveal`, che richiedono il token e **non restituiscono il destinatario prima della pubblicazione**. Il risultato non viene mai inviato al browser per poi essere nascosto: viene chiesto al server solo quando si preme "Scopri". |
| Link d'iscrizione | Token separato (256 bit) che permette **solo** di iscriversi all'evento in preparazione: non mostra gli altri partecipanti, le loro email o i loro link. L'iscrizione restituisce solo il link del nuovo iscritto; un'email già iscritta riceve un messaggio, mai il link di qualcun altro. Massimo 100 partecipanti per evento. |
| Token | 32 byte casuali (256 bit) generati da PostgreSQL, non indovinabili né derivabili da ID. Stanno nel frammento dell'URL (`/p#token`), quindi non arrivano nei log HTTP né negli header Referer; il server li riceve solo nel corpo di una richiesta POST e non li registra mai nei log. |
| Chiavi | L'app usa solo la chiave **pubblica** (publishable/anon). La chiave `service_role`/secret **non serve** e non va configurata. |
| Foto | Bucket Storage pubblico in sola lettura con nomi casuali non indovinabili; solo JPEG/PNG/WebP fino a 2 MB. Elenco dei file, sovrascrittura e cancellazione riservati all'organizzatore dell'evento. Chi si iscrive (ruolo anonimo) può solo **aggiungere** file `<evento>/<uuid>.<ext>` nella cartella di un evento in preparazione; il database accetta come foto solo file esistenti di quell'evento, non usati da altri. |
| Errori | Messaggi in italiano senza dettagli interni; nei log solo codice e messaggio dell'errore. |
| Header | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `nosniff`, `noindex` su `/admin`, `/p` e `/iscrizione`. |

> ⚠️ **Il link personale è come una chiave:** chiunque lo possieda può vedere il risultato di quella persona. Non è
> equivalente a un account con password. Invia ogni link solo al diretto interessato; se un link finisce nelle mani
> sbagliate usa **"Rigenera link"** (il vecchio smette di funzionare) e invia il nuovo invito.
>
> I token sono salvati in chiaro in una tabella leggibile solo dall'organizzatore dell'evento, così l'organizzatore può copiare di
> nuovo l'invito quando serve.

---

## Avvio in locale

**Requisiti:** Node.js ≥ 20.9 (testato con Node 24), npm, Docker Desktop (per Supabase locale).

```bash
# 1. Dipendenze
npm install

# 2. Supabase locale (Postgres, Auth, Storage, Mailpit) — la prima volta scarica le immagini Docker
npm run db:start
npm run db:reset          # applica le migrazioni e il seed di prova

# 3. Variabili d'ambiente
cp .env.example .env.local
```

Compila `.env.local` con i valori stampati da `npx supabase status`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY mostrata da supabase status>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Email di prova verso Mailpit (interfaccia: http://127.0.0.1:54324)
SMTP_HOST=127.0.0.1
SMTP_PORT=54325
SMTP_SECURE=false
SMTP_FROM="Secret Santa <santa@example.com>"
```

```bash
# 4. Avvio
npm run dev               # http://localhost:3000
```

**Account del seed locale** (solo per lo sviluppo, non esistono nel cloud):

| Utente | Password | Ruolo |
| --- | --- | --- |
| `admin@example.com` | `password-locale-123` | organizzatore, proprietario dell'evento demo |
| `utente@example.com` | `password-locale-123` | secondo organizzatore senza eventi (per i test di isolamento) |

Il seed crea anche l'evento dimostrativo *"Natale tra amici (demo)"* con 5 partecipanti ed esclusioni.
Le email inviate in locale si leggono in Mailpit: <http://127.0.0.1:54324>.

---

## Test e controlli

| Comando | Cosa verifica | Requisiti |
| --- | --- | --- |
| `npm run lint` | ESLint | — |
| `npm run typecheck` | TypeScript (con i tipi delle rotte generati da Next) | — |
| `npm test` | Test unitari: algoritmo, validazione, inviti, errori, server action con DB simulato (protezione, input, errori del database, dati mancanti) | — |
| `npm run test:integration` | Test sul database reale: RLS, permessi, vincoli, funzioni, stati, concorrenza, storage | Supabase locale avviato |
| `npm run test:e2e` | Test end-to-end Playwright (desktop + smartphone): flusso completo, protezione admin, rivelazione, email via Mailpit | Supabase locale + `npx playwright install chromium` |
| `npm run build` | Build di produzione | — |
| `npm run check` | lint + typecheck + test unitari + build | — |

> I test di integrazione ed E2E creano eventi di prova nel database locale. Per ripartire da zero: `npm run db:reset`.

---

## Creare il progetto Supabase (cloud)

1. Crea un account gratuito su <https://supabase.com> e un nuovo progetto (piano **Free**). Scegli una regione vicina
   (es. Frankfurt / `eu-central-1`) e annota la password del database.
2. **Applica le migrazioni** — scegli uno dei due metodi:
   - *Con la CLI (consigliato):*
     ```bash
     npx supabase login
     npx supabase link --project-ref <ref-del-progetto>   # il ref è nell'URL della dashboard
     npx supabase db push                                  # applica supabase/migrations/*.sql (non il seed)
     ```
   - *Dalla dashboard:* SQL Editor → incolla ed esegui, **una alla volta e in quest'ordine**, i file di
     `supabase/migrations/`: `20261021120000_secret_santa_schema.sql`, `20261023120000_signup_link.sql`,
     `20261024120000_organizer_accounts.sql`.
3. **Registrazioni:** Authentication → Sign In / Providers → **attiva** *"Allow new users to sign up"* e, nella sezione
   *Email*, **disattiva** *"Confirm email"*: gli organizzatori creano l'account dal sito e possono usarlo subito
   (il mittente email predefinito di Supabase scrive solo ai membri del progetto, quindi le email di conferma non
   arriverebbero agli altri).
4. **Chiavi:** Project Settings → API Keys → copia la **Publishable key** (o la chiave legacy *anon*) e il **Project URL**.
   Non copiare la *secret key* / *service_role*: non serve.
5. Il bucket `photos` e le sue policy vengono creati dalla migrazione: non serve configurare lo Storage a mano.

## Account degli organizzatori

- Chiunque crea il proprio account da `https://<tuo-sito>/admin/registrati` (link anche dalla home e dal login) e vede
  solo i propri eventi. Non serve più aggiungere nessuno alla tabella `admins` (resta solo per compatibilità).
- **Password dimenticata:** non c'è il recupero via email. Chi gestisce il progetto Supabase può reimpostarla da
  Authentication → Users → (utente) → *Reset password* / *Send password recovery* oppure eliminare l'utente.
- **Cambio password ed eliminazione dell'account:** dalla pagina *Account* dell'area organizzatore. Eliminando l'account
  si cancellano anche tutti i suoi eventi e le foto.
- Gli eventi creati prima dell'introduzione degli account restano del primo utente presente nella tabella `admins`.

---

## Pubblicare su Vercel

1. Metti il progetto su un repository Git (GitHub, GitLab o Bitbucket):
   ```bash
   git init && git add . && git commit -m "Secret Santa"
   # crea il repository remoto e fai push
   ```
   `.env.local` è escluso da `.gitignore`: nessuna credenziale finisce nel repository.
2. Su <https://vercel.com> (piano **Hobby**, gratuito) → *Add New → Project* → importa il repository.
   Framework rilevato automaticamente: Next.js. Nessuna configurazione di build da cambiare.
3. In *Environment Variables* aggiungi (ambiente **Production**):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = l'URL di produzione, es. `https://secret-santa-tuonome.vercel.app`
     (puoi impostarlo dopo il primo deploy, quando conosci l'URL, e poi rifare il deploy)
   - facoltative: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
4. *Deploy*. Il sito sarà su `https://<nome-progetto>.vercel.app` — nessun dominio a pagamento necessario.
5. In alternativa senza Git: `npx vercel` e poi `npx vercel --prod` (configura le variabili con `npx vercel env add`).

> Le variabili `NEXT_PUBLIC_*` vengono incorporate durante la build: se le cambi, rifai il deploy.
> I deploy di *anteprima* di Vercel sono protetti da login Vercel per impostazione predefinita: condividi con i
> partecipanti solo l'URL di **produzione** (quello in `NEXT_PUBLIC_SITE_URL`).

**Aggiornare un sito già pubblicato.** Se un aggiornamento aggiunge un file in `supabase/migrations/`, eseguilo
nell'SQL Editor di Supabase **prima** del `git push`: altrimenti la nuova versione del sito cercherebbe tabelle o
funzioni che non esistono ancora. Dopo ogni deploy ricarica le pagine dell'area admin rimaste aperte.

---

## Variabili d'ambiente

Vedi [`.env.example`](.env.example).

| Variabile | Obbligatoria | Descrizione |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sì | URL del progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sì | Chiave pubblica (publishable o anon legacy) |
| `NEXT_PUBLIC_SITE_URL` | consigliata | URL pubblico usato nei link personali |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | no | Invio automatico delle email. Senza `SMTP_HOST` e `SMTP_FROM` l'invio automatico è disattivato |
| `CRON_SECRET` | consigliata | Stringa casuale lunga (es. 32+ caratteri). Vercel la invia al cron e `/api/keepalive` accetta solo quelle chiamate. Senza, l'endpoint resta pubblico (è innocuo: esegue solo una query vuota) |

---

## Guida all'uso: organizzare un'estrazione

1. **Crea l'evento** da `/admin`: nome, budget, data, messaggio facoltativo.
2. **Aggiungi i partecipanti** (almeno 3): a mano, oppure apri *Link di iscrizione*, premi *Copia messaggio per il gruppo*
   (o *Apri WhatsApp*) e lascia che ognuno si iscriva da solo. Chi si iscrive compare subito nella lista.
   Facoltativo: carica una *Foto di copertina* per l'evento.
3. **Carica le fotografie:** su ogni partecipante → *Modifica* → *Carica una nuova foto* (JPEG, PNG o WebP; viene
   ridimensionata automaticamente). Senza foto viene mostrata l'immagine natalizia scelta.
4. **Imposta le esclusioni:** *Chi regala… / …non può regalare a*, con la casella "entrambe le direzioni" per le coppie.
   Il riquadro *Estrazione* indica subito se esiste una soluzione o quale gruppo di persone causa il problema.
5. **Invia gli inviti** (anche prima dell'estrazione): fino alla pubblicazione i partecipanti vedono solo il messaggio
   di attesa. Vedi la sezione successiva.
6. **Genera l'estrazione:** i risultati restano segreti. Puoi controllarli in *Verifica abbinamenti (privato)*,
   rifarla o annullarla. Attenzione: se partecipi anche tu, quella pagina ti rivela tutto!
7. **Pubblica** quando vuoi: da quel momento ognuno, con il proprio link, scopre il destinatario.
8. Segui chi ha già aperto il link e chi ha scoperto il destinatario nella lista dei partecipanti.
9. **Chiudi l'evento** dopo lo scambio dei regali.

Se dopo la pubblicazione devi cambiare qualcosa (es. una persona si ritira), apri *Procedura sicura* nel riquadro
*Estrazione*, digita il nome dell'evento per confermare, modifica i partecipanti e rifai estrazione e pubblicazione,
avvisando tutti.

---

## Email: invio automatico e invio manuale

### Invio manuale (sempre disponibile, nessuna configurazione)

Su ogni partecipante premi **✉️ Invito**:

- **Copia messaggio** – testo pronto con il solo link personale di quella persona, da incollare dove vuoi;
- **Copia solo il link**;
- **Apri WhatsApp** – apre WhatsApp (web o app) con il messaggio già scritto: scegli tu il contatto;
- **Apri app email** – apre il tuo programma di posta con oggetto e testo compilati.

Esempio di messaggio:

> Ciao Mario! 🎅 Quest'anno partecipi al nostro Secret Santa "Natale tra amici". Apri il tuo link personale per
> scoprire chi dovrai sorprendere con il tuo regalo: https://…/p#…

Il risultato dell'estrazione non è **mai** incluso nei messaggi e ogni messaggio contiene un solo link.

### Invio automatico (facoltativo, SMTP gratuito)

Configura le variabili `SMTP_*`. Compariranno i pulsanti *Invia email automatica* (singolo) e *Invia a chi manca*
(un'email separata per ogni partecipante che ha un indirizzo e non l'ha ancora ricevuta). Opzioni gratuite:

| Servizio | Configurazione | Limiti indicativi (verificali prima dell'uso) |
| --- | --- | --- |
| **Gmail** | Attiva la verifica in due passaggi, crea una *password per le app*; `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`/`SMTP_FROM` = il tuo indirizzo Gmail | circa 500 destinatari al giorno per account personali |
| **Brevo** | Account gratuito, mittente verificato, credenziali SMTP da *SMTP & API*; `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587` | 300 email al giorno sul piano gratuito |

Servizi come Resend richiedono un dominio verificato per scrivere a indirizzi qualsiasi: per questo l'app usa SMTP
generico. Se l'invio fallisce, l'app lo segnala e non segna l'invito come inviato: usa l'invio manuale.

---

## Limiti dei piani gratuiti

Verificati a ottobre 2026 sulle pagine ufficiali ([Supabase pricing](https://supabase.com/pricing),
[Vercel Hobby](https://vercel.com/docs/plans/hobby)); possono cambiare, ricontrollali prima del deploy.

**Supabase Free**

- 500 MB di database, 1 GB di storage file, 5 GB di traffico in uscita al mese, 50.000 utenti attivi al mese,
  file fino a 50 MB (l'app limita le foto a 2 MB).
- Massimo **2 progetti attivi** gratuiti.
- ⏸️ **Il progetto va in pausa dopo 1 settimana di inattività.** I dati restano, ma l'app smette di funzionare
  (login e link mostrano "servizio non disponibile") finché non lo riattivi da Supabase Dashboard → *Restore project*.
  **Prevenzione automatica:** `vercel.json` programma un cron di Vercel che ogni giorno alle 7:00 UTC chiama
  `/api/keepalive`, che esegue una query sul database (senza leggere dati): così il progetto non resta mai una
  settimana senza attività. I cron girano solo sul deploy di **produzione**; si controllano in Vercel → progetto →
  *Settings → Cron Jobs*. Se il progetto fosse già in pausa il cron non lo riattiva: va ripristinato a mano.

**Vercel Hobby**

- Gratuito, **solo per uso personale e non commerciale**.
- 100 GB di traffico, 1 milione di invocazioni di funzioni, 4 ore di CPU attiva al mese: ampiamente sufficienti per un
  gruppo di amici. Se si supera un limite bisogna attendere 30 giorni.
- 100 deploy al giorno, log runtime conservati per 1 ora. L'ottimizzazione immagini di Vercel è disattivata, quindi non
  consuma la relativa quota.

**Cosa richiede configurazioni esterne**

| Funzionalità | Serve | Senza configurazione |
| --- | --- | --- |
| App online | Account Supabase + Vercel (gratuiti) | Funziona solo in locale |
| Area organizzatore | Registrazioni attive in Supabase (*Allow new users to sign up*, senza *Confirm email*) | Possono accedere solo gli utenti creati a mano nella dashboard |
| Email automatiche | Credenziali SMTP (Gmail/Brevo gratuite) | Invio manuale (copia/WhatsApp/app email) |

---

## Struttura del progetto

```
supabase/
  migrations/…_secret_santa_schema.sql   schema, RLS, permessi, trigger, funzioni, storage
  seed.sql                                dati di prova SOLO per il locale
  config.toml                             configurazione Supabase locale
src/
  app/
    page.tsx                              pagina iniziale
    p/page.tsx                            pagina del partecipante (/p#token)
    admin/login, admin/registrati         accesso e creazione dell'account organizzatore
    admin/(area)/…                        area protetta: eventi, dettaglio, abbinamenti, account
  components/                             UI (tema, pulsanti, dialog, toast) e componenti admin/partecipante
  lib/
    draw/algorithm.ts                     algoritmo di estrazione e diagnosi
    actions/*.ts                          server action (admin, inviti, partecipante)
    auth.ts, data.ts, validation.ts, errors.ts, invite.ts, email.ts, env.ts, site.ts
    supabase/                             client server/pubblico e tipi generati del database
  proxy.ts                                refresh della sessione e redirect al login per /admin
tests/
  unit/        integration/        e2e/
TASKS.md                                  piano di lavoro e stato delle attività
```

Per rigenerare i tipi TypeScript del database dopo una modifica dello schema:
`npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`.
