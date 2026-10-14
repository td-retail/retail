# Toscana Diagnostica · Retail Dashboard (B2C + B2B)

Webapp per il governo del retail del network: un'unica area con i dati e i profili dei clienti (pazienti privati e clienti B2B), cosa comprano, da dove vengono e come prenotano; le prestazioni che funzionano di più e di meno; il monitoraggio delle campagne; il calendario promozionale mensilizzato su scala annuale con claim e piano di spinta; l'esposizione in sede e il book retail per sede. Destinata a retail.toscanadiagnostica.it. Stesso stack e stessa interfaccia di contracts, cash, sgi e shipment.

## Cosa fa

Dashboard: fatturato netto, accettazioni, scontrino medio, sconti, pazienti serviti, nuovi pazienti, base clienti, richiami in scadenza, con confronto sul periodo precedente e filtri per periodo, sede e canale (B2C, B2B). Andamento mensile B2C e B2B con i nuovi pazienti, promozione del mese con obiettivi e avanzamento, fatturato per linea (laboratorio, imaging, specialistica, medicina del lavoro, pacchetti), sedi per fatturato, canali di prenotazione e regimi di pagamento, profilo dei pazienti (sesso, fasce di età, province e comuni di residenza, giorno e fascia oraria), prestazioni top e bottom con variazione, campagne in corso, conformità dell'esposizione, top clienti B2B. Ogni numero e grafico porta alla pagina di dettaglio con i filtri già impostati.

Clienti e profilazione (B2C): elenco filtrabile per sesso, età, provincia, comune, sede di riferimento, segmento (nuovo, ricorrente, occasionale, dormiente), canale di acquisizione, linea acquistata, consenso marketing; esporta in Excel. Scheda del paziente: anagrafica, fatturato, prima e ultima visita, cosa compra per linea, in quali sedi, storico delle accettazioni con promozioni e campagne, richiami periodici (esami con periodicità, dalla scheda prestazione) e proposte di cross-selling (le prestazioni più acquistate dai pazienti con profilo simile). Aziende e strutture (B2B): aziende per medicina del lavoro e welfare, strutture sanitarie e laboratori in service, assicurazioni e fondi, con fatturato e storico.

Richiami periodici: lista operativa dei pazienti con esami in scadenza (mammografia, PSA, check-up, controlli annuali) per sede, con telefono, email e consenso marketing; copia negli appunti per SMS e telefonate.

Prestazioni e prodotti: catalogo (dal tracciato GIPO o manuale) con quantità, fatturato, clienti, margine e variazione sul periodo precedente; dettaglio con andamento a 12 mesi, sedi, profilo di chi la compra, prestazioni abbinate nella stessa accettazione. Esporta in Excel.

Accettazioni e vendite: tutte le righe B2C e B2B con filtri per periodo, sede, canale, linea, regime, canale di prenotazione, origine; export Excel; inserimento manuale di un'accettazione.

Import dai gestionali: carica gli export Excel o CSV di GIPO, TuoTempo e StudioLab (vendite, anagrafiche, catalogo). Mappatura colonne guidata e automatica dai nomi delle colonne, salvata per sorgente; verifica senza salvare; righe identificate dal numero di accettazione (ricaricare lo stesso file aggiorna, non duplica); sedi riconosciute da codice o nome; clienti creati o aggiornati da ID, codice fiscale o partita IVA (sesso e data di nascita dedotti dal codice fiscale); prestazioni non in catalogo create con il codice del file; vendite B2B collegate all'azienda committente; codice promo collegato a campagne e promozioni. Ogni importazione si può annullare. Format Excel scaricabile per i tre dataset.

Campagne: canale (Meta, Google, SMS, email, affissioni, stampa, radio, medici di base, eventi, partner, in sede), obiettivo, periodo, budget e speso, impression, click, lead, codice promo; risultati dalle vendite con il codice (prenotazioni, ricavi, nuovi pazienti), ROI, costo per paziente, CTR e conversione; stima delle vendite nel periodo sulle sedi e prestazioni coinvolte. Dettaglio con andamento giornaliero, prestazioni e sedi.

Calendario promozionale: una promozione al mese per anno, con tema, claim e versione breve, testo, target, meccanica (percentuale, importo, prezzo fisso, pacchetto, omaggio, servizio), prestazioni, sedi, codice promo, obiettivi (prenotazioni, fatturato, nuovi pazienti), piano di spinta per canale (checklist con data e owner, precompilata) e materiali (checklist con stato). Proposte di claim con l'API Claude (se configurata) o con schemi standard. Risultati dalle vendite con il codice promo, confronto con lo stesso mese dell'anno precedente, campagne collegate, materiali esposti in sede. Copia del calendario sull'anno successivo. Export del calendario in PowerPoint (una slide di overview e una per promozione).

Esposizione e book retail: standard espositivo per tipologia di sede (zone: esterno, vetrina, ingresso, accettazione, sala d'attesa, corridoi, box prelievo, digitale; materiale, formato, quantità, regola espositiva, obbligatorietà) modificabile. Per ogni sede il book compilato: materiali per zona con contenuto esposto, promozione collegata, validità, stato (da installare, installato, da sostituire, non conforme, rimosso), data e autore della verifica, foto; "Applica standard" crea le voci mancanti, "Verifica completata" le segna installate, "Cambio mese" aggiorna in tutte le sedi le locandine promo con la promozione corrente e le mette da sostituire. Conformità per sede e per network. Export del book in PowerPoint (sintesi di conformità e una sezione per sede). I site manager (profilo Sede) aggiornano solo la propria sede, anche da smartphone con foto dalla fotocamera.

Sedi del network: anagrafica delle sedi (precaricate da "Sedi Attive - TD"), tipologia, site manager, insegna precedente, coordinate, fatturato dell'anno.

Connettori: configurazione cifrata (endpoint, credenziali, istanza, pianificazione) per GIPO, TuoTempo e StudioLab, prova di connessione, sincronizzazione manuale o schedulata, registro. TuoTempo (API REST v3) è implementato per le prenotazioni; GIPO e StudioLab non espongono API pubbliche documentate: finché i fornitori non attivano l'integrazione, i dati entrano dall'import da file.

Profili: amministratore (tutto), Retail & Communications (tutto tranne utenti, connettori e impostazioni), Sede (dashboard in lettura e book della propria sede), consultazione (sola lettura). Accesso con Microsoft 365 (Entra ID) o email e password con verifica in due passaggi obbligatoria per gli amministratori locali. Registro attività.

## Architettura

- server/: Node.js 22, Express, PostgreSQL 16. API REST, sessioni su database, CSRF, rate limit sul login, audit log. Import con exceljs, export Excel con exceljs e PowerPoint con pptxgenjs (nessuna dipendenza di sistema: niente LibreOffice). Foto in bytea. Credenziali dei connettori cifrate AES-256-GCM con chiave derivata da SESSION_SECRET.
- web/: React 18, Vite, Recharts. Interfaccia in italiano, palette aziendale, responsive (il book della sede è usabile da telefono).
- Dockerfile unico (frontend buildato e servito dal server). render.yaml per il deploy Blueprint. docker-compose.yml per installazione su VPS.

## Deploy su Render

1. Crea il repository GitHub (es. tdretail/retail) e carica questo progetto.
2. render.com, New > Blueprint, collega il repository: il file render.yaml crea il database (basic-256mb) e il servizio web Docker (starter). Primo build: 2-3 minuti.
3. Nel pannello del servizio inserisci SEED_ADMIN_PASSWORD (min 12 caratteri). Al primo accesso l'app chiede di cambiarla e di attivare la verifica in due passaggi.
4. Dominio: Settings > Custom Domains > retail.toscanadiagnostica.it, poi record CNAME `retail` verso td-retail.onrender.com sul DNS. BASE_URL è già impostata sul dominio ufficiale: l'indirizzo tecnico td-retail.onrender.com resta raggiungibile, gli altri host vengono reindirizzati al dominio ufficiale (CANONICAL_REDIRECT=false disattiva il redirect in emergenza).
5. Per vedere subito la dashboard con dati: DEMO_DATA=true prima del primo avvio, oppure Impostazioni > Carica set dimostrativo. Prima degli import reali: Impostazioni > Rimuovi dati dimostrativi.
6. Import: Sedi (verifica codici e nomi), Prestazioni (tracciato GIPO) e poi le vendite dagli export dei gestionali.

Costo indicativo: 7 $/mese web + 6 $/mese database (verificare i listini). Il piano free non va bene: il servizio dorme e il database viene cancellato dopo 30 giorni.

## Microsoft 365 (Entra ID)

Serve un Global Administrator del tenant.

1. Entra ID > App registrations > New registration: nome "TD Retail", account solo di questa organizzazione, piattaforma Web, redirect URI `https://retail.toscanadiagnostica.it/api/auth/entra/callback` (aggiungere anche `https://td-retail.onrender.com/api/auth/entra/callback` finché il dominio non è attivo).
2. Certificates & secrets > New client secret (24 mesi): copiare subito il valore.
3. Token configuration > Add optional claim > ID token > `email`.
4. Overview: Directory (tenant) ID e Application (client) ID.
5. Render > Environment: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET. Riavviare.
6. Ogni utente va censito in Utenti con la stessa email dell'account Microsoft 365 e metodo "Microsoft 365" o "Microsoft 365 o password".

## Proposte di claim (facoltativa)

Con ANTHROPIC_API_KEY impostata, il pulsante "Proposte di claim" nella promozione genera cinque proposte (headline, versione breve, SMS) coerenti con il posizionamento e con la pubblicità sanitaria; senza chiave vengono proposti schemi standard. Il modello si sceglie con ANTHROPIC_MODEL (predefinito claude-sonnet-5-5).

## Sviluppo locale

```bash
docker run -d --name tdrdb -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=retail postgres:16-alpine
cd server && npm install
DATABASE_URL=postgres://postgres:dev@localhost:5432/retail SEED_ADMIN_EMAIL=tu@esempio.it SEED_ADMIN_PASSWORD=Password-Temporanea-1 REQUIRE_TOTP_FOR_ADMINS=false DEMO_DATA=true npm start
cd web && npm install && npm run dev   # proxy delle API su :3000
```

## Dati e privacy

I dati dei pazienti (anagrafica, codice fiscale, prestazioni) sono dati sanitari: l'accesso è nominativo e tracciato nel registro attività, le sessioni scadono dopo SESSION_HOURS ore, i profili Sede e Consultazione non esportano. Valutare l'aggiornamento dell'informativa e del registro dei trattamenti (finalità: analisi retail e marketing; base giuridica per le comunicazioni commerciali: consenso marketing, importato dal gestionale). Con ANTHROPIC_API_KEY i testi delle promozioni (non i dati dei pazienti) vengono inviati all'API Anthropic.

## API

Tutte sotto /api, sessione via cookie, header `X-Requested-With: td-retail` sulle richieste che modificano dati.

- auth: config, login, totp, logout, me, change-password, totp/setup, totp/enable, entra/login, entra/callback
- users, settings, sites, product-lines, audit, demo/load, demo/clear
- customers (GET lista con filtri e paginazione, facets, export.xlsx, POST, GET/PUT/DELETE :id, :id/merge)
- products (GET lista con performance, export.xlsx, POST, GET/PUT/DELETE :id)
- sales (GET lista, export.xlsx, POST manuale, DELETE ref/:source/:ref, import/datasets, import/preview, import/run, import/batches, import/template.xlsx)
- campaigns (CRUD con risultati)
- promotions (GET per anno, calendar.pptx, CRUD, :id/claims, clone-year)
- exposure (zones, standards CRUD, overview, sites/:id, sites/:id/apply-standard, sites/:id/items, items/:id, sites/:id/check-all, rollover, sites/:id/photos, photos/:id, book.pptx)
- connectors (GET, PUT :kind, :kind/test, :kind/sync)
- stats/summary, stats/recalls
