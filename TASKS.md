# TASKS — Secret Santa

Piano di lavoro del progetto. Ogni task ha un ID, dipendenze, sotto-task, criteri di completamento verificabili e uno stato (`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`).
Lo stato viene aggiornato **solo dopo una verifica reale** (comando eseguito, test passato, controllo manuale documentato).

## Decisioni di architettura (sintesi)

- **Next.js 16 (App Router, TypeScript) + Tailwind CSS 4**, nessun backend separato.
- **Supabase**: PostgreSQL + Auth (solo amministratori) + Storage (foto, bucket pubblico con nomi casuali non indovinabili).
- **Nessuna chiave `service_role` necessaria**: le operazioni amministrative usano la sessione dell'admin + RLS; le operazioni dei partecipanti passano da funzioni PostgreSQL `SECURITY DEFINER` che richiedono il token personale.
- **Link personale** nel formato `https://<sito>/p#<token>`: il token (256 bit casuali) sta nel frammento dell'URL, quindi non finisce nei log HTTP né nell'header Referer; viene inviato al server solo nel corpo di una richiesta POST.
- **Rivelazione lato server**: il destinatario viene richiesto al server solo quando il partecipante preme "Rivela" e solo se l'evento è `PUBLISHED`/`CLOSED`.
- **Algoritmo**: verifica di fattibilità con matching bipartito (diagnosi via teorema di Hall) + backtracking casuale con euristica MRV; il database rivalida l'estrazione in una transazione atomica.
- **Email**: invio automatico opzionale via SMTP (gratuito con Gmail/Brevo, testato in locale con Mailpit); invito manuale (copia messaggio, WhatsApp, mailto) sempre disponibile.

---

## TASK-001 — Analisi requisiti e verifica piani gratuiti
- **Stato:** DONE
- **Dipendenze:** nessuna
- **Sotto-task:**
  - [DONE] Analizzare i requisiti del prompt e scegliere l'architettura.
  - [DONE] Verificare i limiti attuali di Supabase Free (pagina pricing, ottobre 2026).
  - [DONE] Verificare i limiti attuali di Vercel Hobby (docs, aggiornate 2026-09-14).
  - [DONE] Verificare disponibilità locale di Node, npm, Supabase CLI, Docker.
- **Criteri di completamento:** architettura documentata in questo file; limiti dei piani annotati per il README; strumenti locali verificati.

## TASK-002 — Scaffold del progetto Next.js
- **Stato:** DONE
- **Dipendenze:** TASK-001
- **Sotto-task:**
  - [DONE] Creare progetto Next.js + TypeScript + Tailwind + ESLint (App Router, `src/`).
  - [DONE] Aggiungere dipendenze minime: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `nodemailer`.
  - [DONE] Aggiungere dipendenze di sviluppo: `vitest`, `@playwright/test`, `supabase` CLI.
  - [DONE] Script npm: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `check`.
  - [DONE] `.gitignore` che esclude `.env*` tranne `.env.example`.
- **Criteri di completamento:** `npm run lint`, `npm run typecheck` e `npm run build` terminano senza errori sullo scaffold.

## TASK-003 — Supabase locale
- **Stato:** DONE
- **Dipendenze:** TASK-002
- **Sotto-task:**
  - [DONE] `supabase init` e configurazione `supabase/config.toml` (porte, Mailpit con SMTP esposto, signup disabilitato).
  - [DONE] Avvio dello stack locale (`supabase start`) con i soli servizi necessari.
- **Criteri di completamento:** `supabase status` mostra API, DB e Mailpit attivi.

## TASK-004 — Schema del database (migrazione)
- **Stato:** DONE
- **Dipendenze:** TASK-003
- **Sotto-task:**
  - [DONE] Enum `event_status` (`DRAFT`, `DRAWN`, `PUBLISHED`, `CLOSED`).
  - [DONE] Tabella `admins`.
  - [DONE] Tabella `events` (nome, descrizione, budget, data scambio, stato, timestamp di estrazione/pubblicazione/chiusura).
  - [DONE] Tabella `participants` (nome, email, avatar predefinito, foto, stato invito, apertura link, rivelazione).
  - [DONE] Tabella `invite_tokens` (token personale separato dai dati del partecipante).
  - [DONE] Tabella `exclusions` (direzionale, stessa evento garantito da FK composte).
  - [DONE] Tabella `assignments` (giver unico, receiver unico, niente auto-assegnazione).
  - [DONE] Vincoli di validazione (lunghezze, formato email, unicità nome/email per evento) e indici.
- **Criteri di completamento:** `supabase db reset` applica la migrazione senza errori; i vincoli sono verificati dai test di integrazione (TASK-022).

## TASK-005 — Row Level Security e permessi
- **Stato:** DONE
- **Dipendenze:** TASK-004
- **Sotto-task:**
  - [DONE] Funzione `is_admin()`.
  - [DONE] RLS attiva su tutte le tabelle; policy solo per amministratori.
  - [DONE] Revoca di tutti i privilegi su tabelle per `anon`.
  - [DONE] Permessi a livello di colonna: lo stato dell'evento e gli abbinamenti non sono modificabili direttamente.
- **Criteri di completamento:** i test di integrazione dimostrano che `anon` e un utente autenticato non admin non leggono né modificano nulla, e che l'admin non può cambiare lo stato saltando le funzioni.

## TASK-006 — Funzioni PostgreSQL atomiche e trigger di stato
- **Stato:** DONE
- **Dipendenze:** TASK-005
- **Sotto-task:**
  - [DONE] Trigger che genera il token d'invito alla creazione del partecipante.
  - [DONE] Trigger che bloccano aggiunta/eliminazione partecipanti ed esclusioni fuori da `DRAFT` (con lock sulla riga evento per evitare race condition).
  - [DONE] `save_draw(event_id, pairs)`: lock, rivalidazione completa (permutazione, no self, esclusioni, partecipanti correnti), salvataggio atomico, stato `DRAWN`.
  - [DONE] `publish_event`, `close_event`, `reset_draw` (con conferma tramite nome evento se già pubblicato).
  - [DONE] `regenerate_invite_token`.
  - [DONE] `participant_status(token)` e `participant_reveal(token)` per i partecipanti (nessun dato prima della pubblicazione).
- **Criteri di completamento:** test di integrazione su ogni funzione, inclusi i casi di errore e le transizioni di stato non consentite.

## TASK-007 — Storage per le fotografie
- **Stato:** DONE
- **Dipendenze:** TASK-005
- **Sotto-task:**
  - [DONE] Bucket `photos` (limite 2 MB, solo JPEG/PNG/WebP).
  - [DONE] Policy: solo admin può caricare/sostituire/eliminare.
- **Criteri di completamento:** test di integrazione: anon non può caricare; admin sì.

## TASK-008 — Seed locale
- **Stato:** DONE
- **Dipendenze:** TASK-004, TASK-005, TASK-006
- **Sotto-task:**
  - [DONE] Utente admin locale (`admin@example.com`) registrato in `admins`.
  - [DONE] Evento demo con partecipanti ed esclusioni.
- **Criteri di completamento:** dopo `supabase db reset` è possibile accedere con l'admin locale e vedere l'evento demo.

## TASK-009 — Algoritmo di estrazione
- **Stato:** DONE
- **Dipendenze:** TASK-002
- **Sotto-task:**
  - [DONE] Verifica di fattibilità (matching bipartito massimo).
  - [DONE] Diagnosi comprensibile (partecipante senza destinatari possibili, destinatario non raggiungibile, gruppo che viola la condizione di Hall, partecipanti insufficienti).
  - [DONE] Estrazione casuale con backtracking (MRV + forward checking) e generatore casuale crittografico.
  - [DONE] Funzione di validazione di un'estrazione.
  - [DONE] Test unitari: no self, unicità destinatari, esclusioni rispettate, soluzione valida trovata, nessuna soluzione riconosciuta, casualità (più risultati diversi), gruppi grandi.
- **Criteri di completamento:** `npm test` passa; l'algoritmo non restituisce mai un'estrazione invalida.

## TASK-010 — Validazione degli input
- **Stato:** DONE
- **Dipendenze:** TASK-002
- **Sotto-task:**
  - [DONE] Schemi `zod` per evento, partecipante, esclusione, token, conferma reset, file immagine.
  - [DONE] Stessi limiti applicati nel client (attributi HTML) e nel server (zod) e nel DB (check).
  - [DONE] Test unitari della validazione.
- **Criteri di completamento:** test passati per input validi e invalidi.

## TASK-011 — Client Supabase, configurazione e proxy di sessione
- **Stato:** DONE
- **Dipendenze:** TASK-002
- **Sotto-task:**
  - [DONE] Lettura e validazione delle variabili d'ambiente con messaggi chiari se mancanti.
  - [DONE] Client server (cookie) e client pubblico senza sessione.
  - [DONE] `proxy.ts` per il refresh della sessione sulle rotte `/admin`.
  - [DONE] Mappatura degli errori DB in messaggi italiani senza dettagli interni.
- **Criteri di completamento:** typecheck ok; test unitari della mappatura errori.

## TASK-012 — Autenticazione amministratore
- **Stato:** DONE
- **Dipendenze:** TASK-011, TASK-005
- **Sotto-task:**
  - [DONE] Pagina di login (email + password) con errori chiari.
  - [DONE] Logout.
  - [DONE] `requireAdmin()` usato da layout e da ogni server action amministrativa.
  - [DONE] Messaggio dedicato per utenti autenticati ma non amministratori.
- **Criteri di completamento:** E2E: `/admin` senza login reindirizza al login; login admin funziona; logout funziona.

## TASK-013 — Gestione eventi (admin)
- **Stato:** DONE
- **Dipendenze:** TASK-012
- **Sotto-task:**
  - [DONE] Lista eventi con stato e numero partecipanti.
  - [DONE] Creazione evento.
  - [DONE] Modifica dettagli evento (nome, descrizione, budget, data).
  - [DONE] Eliminazione evento con conferma.
- **Criteri di completamento:** E2E crea un evento e lo apre; eliminazione verificata.

## TASK-014 — Gestione partecipanti (admin)
- **Stato:** DONE
- **Dipendenze:** TASK-013, TASK-007
- **Sotto-task:**
  - [DONE] Aggiunta partecipante (nome, email opzionale, avatar predefinito).
  - [DONE] Modifica nome, email, avatar.
  - [DONE] Caricamento foto (ridimensionata nel browser, validata sul server) e rimozione foto.
  - [DONE] Eliminazione solo in `DRAFT` (con conferma).
  - [DONE] Stato di ogni partecipante (invito, link aperto, risultato visto).
- **Criteri di completamento:** E2E aggiunge, modifica ed elimina partecipanti e carica una foto.

## TASK-015 — Gestione esclusioni (admin)
- **Stato:** DONE
- **Dipendenze:** TASK-014
- **Sotto-task:**
  - [DONE] Aggiunta esclusione in una direzione o in entrambe.
  - [DONE] Elenco leggibile (A → B, A ↔ B) e rimozione.
  - [DONE] Indicatore di fattibilità aggiornato con diagnosi.
- **Criteri di completamento:** E2E aggiunge e rimuove esclusioni; con esclusioni impossibili l'indicatore mostra il problema.

## TASK-016 — Estrazione, verifica privata, pubblicazione, chiusura, annullamento
- **Stato:** DONE
- **Dipendenze:** TASK-009, TASK-015, TASK-006
- **Sotto-task:**
  - [DONE] Pulsante "Genera estrazione" (e "Rifai estrazione" in `DRAWN`) con conferma.
  - [DONE] Messaggio chiaro e nessun salvataggio se non esiste soluzione.
  - [DONE] Pagina privata degli abbinamenti (chi regala, a chi, stato pubblicazione).
  - [DONE] Pubblicazione, chiusura evento.
  - [DONE] Annullamento sicuro: semplice in `DRAWN`, con conferma digitando il nome dell'evento in `PUBLISHED`.
- **Criteri di completamento:** E2E percorre DRAFT → DRAWN → PUBLISHED → CLOSED e un annullamento.

## TASK-017 — Inviti manuali
- **Stato:** DONE
- **Dipendenze:** TASK-014
- **Sotto-task:**
  - [DONE] Generazione messaggio d'invito personalizzato (solo il link del destinatario, mai il risultato).
  - [DONE] Pulsanti: copia link, copia messaggio, apri WhatsApp (`wa.me`), apri email (`mailto:`).
  - [DONE] Segnalazione "invito copiato" nello stato del partecipante.
  - [DONE] Rigenerazione del link (invalida il precedente).
- **Criteri di completamento:** test unitari sul messaggio; E2E copia un invito e usa il link copiato.

## TASK-018 — Invio automatico email (opzionale, SMTP gratuito)
- **Stato:** DONE
- **Dipendenze:** TASK-017
- **Sotto-task:**
  - [DONE] Modulo SMTP con `nodemailer` attivo solo se le variabili sono configurate.
  - [DONE] Invio singolo e invio a tutti (uno per destinatario, mai link altrui).
  - [DONE] UI che indica chiaramente se l'invio automatico è disponibile.
  - [DONE] Test con Mailpit locale.
- **Criteri di completamento:** test verifica la ricezione in Mailpit con il solo link del destinatario; senza configurazione l'UI non dichiara invii.

## TASK-019 — Pagina del partecipante
- **Stato:** DONE
- **Dipendenze:** TASK-006, TASK-011
- **Sotto-task:**
  - [DONE] Lettura del token dal frammento URL e richiesta POST al server.
  - [DONE] Benvenuto con nome, messaggi per `DRAFT`, `DRAWN` (via libera non ancora dato), `PUBLISHED`, `CLOSED`.
  - [DONE] Pulsante "Rivela" che richiede il risultato al server solo in quel momento.
  - [DONE] Animazione di rivelazione (regalo che si apre) rispettosa di `prefers-reduced-motion`.
  - [DONE] Link non valido / mancante con messaggio chiaro.
- **Criteri di completamento:** E2E: prima della pubblicazione nessun dato del destinatario è nella risposta; dopo, il partecipante vede solo il proprio abbinamento.

## TASK-020 — Design e usabilità
- **Stato:** DONE
- **Dipendenze:** TASK-002
- **Sotto-task:**
  - [DONE] Tema natalizio (verde scuro, rosso, oro), tipografia, card arrotondate.
  - [DONE] Componenti: pulsanti, input, badge di stato, avatar/foto, dialog di conferma, toast.
  - [DONE] Stati di caricamento, errori (`error.tsx`), 404 (`not-found.tsx`).
  - [DONE] Layout responsive verificato su viewport mobile e desktop.
- **Criteri di completamento:** E2E su viewport mobile (390px) senza scroll orizzontale; screenshot verificati.

## TASK-021 — Test unitari delle server action
- **Stato:** DONE
- **Dipendenze:** TASK-012, TASK-016, TASK-019
- **Sotto-task:**
  - [DONE] Protezione: azioni admin rifiutate senza sessione o senza ruolo admin.
  - [DONE] Validazione input sulle azioni.
  - [DONE] Errori del database restituiti come messaggi generici, senza dettagli interni.
  - [DONE] Azioni partecipante con token malformato o mancante.
- **Criteri di completamento:** `npm test` passa.

## TASK-022 — Test di integrazione sul database locale
- **Stato:** DONE
- **Dipendenze:** TASK-006, TASK-007, TASK-008
- **Sotto-task:**
  - [DONE] RLS: anon e utente non admin bloccati su tutte le tabelle.
  - [DONE] Partecipante: nessun risultato prima della pubblicazione; solo il proprio dopo.
  - [DONE] `save_draw` rifiuta estrazioni invalide (self, duplicati, esclusioni, partecipanti mancanti).
  - [DONE] Trigger di stato e transizioni non consentite.
- **Criteri di completamento:** `npm run test:integration` passa contro Supabase locale.

## TASK-023 — Test end-to-end (Playwright)
- **Stato:** DONE
- **Dipendenze:** TASK-013 … TASK-020
- **Sotto-task:**
  - [DONE] Flusso completo admin → partecipante su desktop.
  - [DONE] Controlli su viewport mobile.
  - [DONE] Accesso non autorizzato alle pagine admin.
- **Criteri di completamento:** `npm run test:e2e` passa.

## TASK-024 — Revisione di sicurezza
- **Stato:** DONE
- **Dipendenze:** TASK-021, TASK-022, TASK-023
- **Sotto-task:**
  - [DONE] Nessuna chiave segreta nel bundle client (ricerca nel build).
  - [DONE] Header di sicurezza (frame, referrer, nosniff), `noindex` su pagine private.
  - [DONE] Nessun token nei log applicativi; errori senza dettagli interni.
  - [DONE] Revisione delle policy e delle funzioni `SECURITY DEFINER` (`search_path` vuoto, controlli admin).
- **Criteri di completamento:** controlli eseguiti e documentati; eventuali problemi corretti.

## TASK-025 — Documentazione
- **Stato:** DONE
- **Dipendenze:** tutte le funzionalità
- **Sotto-task:**
  - [DONE] `README.md` completo (installazione, locale, Supabase, migrazioni, env, primo admin, Vercel, foto, estrazione, condivisione link, invio manuale, limiti gratuiti, sicurezza dei link).
  - [DONE] `.env.example` con soli segnaposto.
- **Criteri di completamento:** ogni punto richiesto dal prompt è presente nel README; nessun segreto nel repository.

## TASK-026 — Controllo finale
- **Stato:** DONE
- **Dipendenze:** tutti i task implementabili
- **Sotto-task:**
  - [DONE] Rilettura dei requisiti e di questo file.
  - [DONE] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run build`.
  - [DONE] Verifica assenza di pulsanti finti / pagine vuote / funzionalità simulate.
- **Criteri di completamento:** tutti i comandi passano; stato dei task aggiornato sulla base delle verifiche.

## TASK-027 — Progetto Supabase in cloud
- **Stato:** DONE (migrazione iniziale) — vedi TASK-034 per la nuova migrazione
- **Dipendenze:** TASK-004 … TASK-008
- **Sotto-task:**
  - [DONE] Creazione progetto Supabase Free, migrazione iniziale applicata dall'utente nell'SQL Editor, primo admin creato.
- **Criteri di completamento:** progetto raggiungibile e migrazioni applicate. Richiede l'account Supabase dell'utente.
- **Verifica (2026-10-23):** l'utente accede all'area admin del sito pubblicato con il proprio account (sessione Supabase valida nelle intestazioni della richiesta condivise dall'utente).
- **Motivo del blocco iniziale:** serve l'account Supabase del proprietario (login interattivo, scelta di regione e password del DB). Le migrazioni sono pronte e verificate in locale con lo stesso Postgres 17; la procedura passo-passo è nel README (*Creare il progetto Supabase*, *Creare il primo amministratore*).

## TASK-028 — Deploy su Vercel Hobby
- **Stato:** DONE
- **Dipendenze:** TASK-027
- **Sotto-task:**
  - [DONE] Import del repository su Vercel, variabili d'ambiente, deploy di produzione, URL pubblico.
- **Criteri di completamento:** app raggiungibile all'URL `*.vercel.app`. Richiede l'account Vercel dell'utente.
- **Verifica (2026-10-23):** `https://secret-santa-rho-three.vercel.app/` risponde 200 (repository `Ruspavolante/secretSanta`).
- **Motivo del blocco iniziale:** dipende da TASK-027 e richiede l'account Vercel (e un repository Git remoto) del proprietario. `npm run build` passa; procedura nel README (*Pubblicare su Vercel*).

## TASK-029 — SMTP reale per l'invio automatico
- **Stato:** BLOCKED
- **Dipendenze:** TASK-018, TASK-028
- **Sotto-task:**
  - [BLOCKED] Configurare credenziali SMTP gratuite (es. Gmail con password per app) su Vercel.
- **Criteri di completamento:** un'email di prova arriva a un indirizzo reale. Richiede credenziali dell'utente.
- **Motivo del blocco:** servono credenziali SMTP personali (es. password per le app di Gmail). Alternativa gratuita già implementata e sempre attiva: invito manuale (copia messaggio, WhatsApp, app email). L'invio SMTP è verificato end-to-end in locale con Mailpit.

## TASK-030 — Iscrizione dal link di gruppo
- **Stato:** DONE
- **Dipendenze:** TASK-004 … TASK-019
- **Sotto-task:**
  - [DONE] Migrazione `20261023120000_signup_link.sql`: `signup_token`/`signup_open` sugli eventi, funzioni `set_signup_open`, `regenerate_signup_token` (solo admin), `signup_info`, `register_participant` (anon con token d'iscrizione; restituisce solo il token del nuovo iscritto; max 100 partecipanti; solo in `DRAFT`).
  - [DONE] Pagina pubblica `/iscrizione#<token>`: nome, email obbligatoria, foto facoltativa, immagine predefinita; messaggi per link non valido, iscrizioni chiuse, email o nome già usati (nessun reinvio di link altrui).
  - [DONE] Dopo l'iscrizione: link personale a schermo + email automatica (se SMTP è configurato) segnata come inviata.
  - [DONE] Riquadro admin "Link di iscrizione": apri/chiudi, copia messaggio per il gruppo, WhatsApp, rigenera.
- **Criteri di completamento:** iscrizione end-to-end con email in Mailpit; iscrizioni chiuse dopo l'estrazione; il token d'iscrizione non apre alcun link personale.

## TASK-031 — Modifica del profilo dal link personale
- **Stato:** DONE
- **Dipendenze:** TASK-030
- **Sotto-task:**
  - [DONE] Funzioni `participant_profile` e `participant_update_profile` (nome, immagine, foto; solo in `DRAFT`; l'email no).
  - [DONE] Caricamento foto come `anon` solo in `<evento>/<uuid>.<ext>` di eventi in `DRAFT` (policy `photos_anon_insert`, niente lettura/sovrascrittura/cancellazione); la foto deve esistere, stare nella cartella dell'evento e non essere usata da altri.
  - [DONE] Sezione "I tuoi dati" nella pagina `/p`; `deleteEvent` rimuove tutta la cartella dell'evento (anche le foto sostituite).
- **Criteri di completamento:** modifica visibile all'admin; bloccata dopo l'estrazione (test di integrazione ed E2E).

## TASK-032 — Foto di copertina dell'evento
- **Stato:** DONE
- **Dipendenze:** TASK-007
- **Sotto-task:**
  - [DONE] Colonna `cover_path` (`<evento>/cover-<id>.<ext>`, scrivibile solo dall'admin), esposta da `signup_info` e `participant_status`.
  - [DONE] Riquadro admin "Foto di copertina" (carica/sostituisci/rimuovi, ridimensionamento a 1600 px) e copertina in cima a `/iscrizione` e `/p`.
- **Criteri di completamento:** copertina visibile nelle pagine pubbliche; non utilizzabile come foto di un partecipante.

## TASK-033 — Banner di citazioni sul donare
- **Stato:** DONE
- **Sotto-task:**
  - [DONE] `src/lib/quotes.ts`: citazioni autentiche (con fonte) di politici, generali, avvocati e funzionari, anche cinesi; battute attribuite solo a personaggi dichiaratamente immaginari; commenti separati dal testo.
  - [DONE] Banner con citazione casuale e pulsante "Un'altra citazione" su `/iscrizione` e `/p`.
- **Criteri di completamento:** banner visibile su desktop e smartphone; il pulsante cambia sempre citazione (test unitario ed E2E).

## TASK-034 — Nuova migrazione e deploy in produzione
- **Stato:** BLOCKED
- **Dipendenze:** TASK-030 … TASK-033
- **Sotto-task:**
  - [BLOCKED] Eseguire `supabase/migrations/20261023120000_signup_link.sql` nell'SQL Editor del progetto Supabase.
  - [BLOCKED] `git push` su `main` (Vercel ridistribuisce) e prova di un'iscrizione sul sito pubblicato.
- **Motivo del blocco:** richiede l'accesso dell'utente a Supabase e il push sul repository personale. La migrazione va eseguita **prima** del push, altrimenti la nuova versione del sito chiama funzioni che non esistono ancora.

---

## Registro delle verifiche (controllo finale, 2026-10-21)

Eseguite su Windows 11, Node 24.15, Supabase CLI 2.121 (Postgres 17 locale in Docker), Chromium headless.

| Verifica | Comando | Esito |
| --- | --- | --- |
| Lint | `npm run lint` | ✅ nessun problema |
| Type-check | `npm run typecheck` | ✅ nessun errore |
| Test unitari (algoritmo, validazione, inviti, errori, server action, login) | `npm test` | ✅ 82/82 |
| Test di integrazione su Supabase locale (RLS, permessi, vincoli, funzioni, stati, concorrenza, storage) | `npm run test:integration` | ✅ 16/16 |
| Test E2E desktop + smartphone (flusso completo, protezione admin, rivelazione, email Mailpit) | `npm run test:e2e` | ✅ 10/10 (più un run completo da 11 prima della separazione dei progetti) |
| Build di produzione | `npm run build` | ✅ |
| Segreti nel bundle client (`.next/static`) | ricerca di `sb_secret`, `service_role`, `SMTP_*`, `nodemailer` | ✅ nessuna occorrenza |
| Token nei log del server di sviluppo | confronto con tutti i token del DB | ✅ 0 occorrenze |
| Privilegi funzioni SQL | `information_schema.routine_privileges` | ✅ `anon` esegue solo `participant_status` e `participant_reveal` |
| Funzioni `SECURITY DEFINER` | `pg_proc.proconfig` | ✅ tutte con `search_path=""` |
| Linter SQL | `supabase db lint` | ✅ nessun errore |
| Segnaposto / pulsanti finti | ricerca `TODO`, `href="#"`, handler vuoti | ✅ nessuno |

Problemi trovati e corretti durante le verifiche:
- `[auth.email] enable_signup=false` disattivava del tutto il login via email → disattivate solo le registrazioni (`[auth] enable_signup=false`).
- `participant_reveal` non registrava l'apertura del link se chiamata direttamente → ora aggiorna anche `opened_at`.
- Il `try/catch` di `getAdminStatus` intercettava l'errore interno di Next.js per il rendering dinamico → `unstable_rethrow`.
- I form con `<form action>` di React 19 si svuotavano anche in caso di errore → componente `ActionForm` che conserva i valori.
- Login con Supabase irraggiungibile/in pausa mostrava "password errata" → ora mostra "servizio non disponibile".

## Registro delle verifiche (iscrizione con link, copertina, citazioni — 2026-10-23)

| Verifica | Comando | Esito |
| --- | --- | --- |
| Lint | `npm run lint` | ✅ nessun problema |
| Type-check | `npm run typecheck` | ✅ nessun errore |
| Test unitari | `npm test` | ✅ 104/104 (22 nuovi in `tests/unit/signup.test.ts`) |
| Test di integrazione | `npm run test:integration` | ✅ 28/28 (12 nuovi in `tests/integration/signup.test.ts`) |
| Test E2E desktop + smartphone | `npm run test:e2e` | ✅ 12/12 (iscrizione completa con email Mailpit, profilo, copertina, citazioni, estrazione con coppia esclusa) |
| Build di produzione | `npm run build` | ✅ |
| Segreti nel bundle client | ricerca in `.next/static` | ✅ nessuna occorrenza |

Problemi trovati e corretti:
- Il pulsante "Controlla di nuovo" nella pagina d'attesa risultava bianco su bianco (classi `bg-white`/`text-white` in conflitto) → classi dedicate.
- Dopo il salvataggio del profilo il form mostrava per un attimo il nome precedente → il form si chiude e si ricarica il profilo.
