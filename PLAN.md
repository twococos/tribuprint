# TribuPrint — *Servei de reprografia de la Tribu*

Especificació i pla d'implementació per a l'agent que programarà la web en un repositori nou de GitHub.

## Context

La impressora Canon PIXMA TS3350 està connectada per USB al home server (Ubuntu 26.04, `ssh nas`, IP 192.168.1.200). Ja funciona amb CUPS: la cua `Canon_TS3350` passa per `ipp-usb`, és driverless (IPP Everywhere) i es comparteix a la LAN. Els PCs i els mòbils de casa ja hi imprimeixen.

Falta una **web pròpia** per a tres coses:
- pujar documents i imprimir-los des de qualsevol lloc, també des de fora de casa;
- veure i gestionar la cua;
- veure l'estat de la impressora: nivells de tinta, alertes com "sense paper" (E02), i pausar o reprendre.

Ha de ser estèticament cuidada, amb **mode clar per defecte** i en **català**.

## Decisions preses amb l'usuari

- **Nom:** **TribuPrint**. Subtítol: **"Servei de reprografia de la Tribu"**.
- **Accés:** des d'internet via Nginx Proxy Manager (NPM) amb HTTPS.
  - La contrasenya la posa **NPM** (Access List amb Basic Auth): demana contrasenya des de fora i no des de la LAN.
  - **L'app no té login.**
- **Perfils estil Netflix.** En entrar, la pantalla "Qui imprimeix?" mostra els avatars i tries qui ets, sense contrasenya.
  - Els perfils es poden crear i editar des de la web.
  - Serveixen per saber qui ha enviat cada treball i per fer estadístiques.
  - Tothom pot fer-ho tot: és una eina familiar, i la seguretat la fa NPM.
- **Escàner:** fora d'abast per ara.
- **Commits i PRs:** cap menció ni atribució a Claude, Anthropic o cap model. Res de `Co-Authored-By` ni "Generated with". És una regla global de l'usuari.
- **Accés al NAS:** l'agent, si hi entra per SSH, **només pot fer comandes de lectura** si l'usuari no li autoritza explícitament una acció concreta.

## Fets verificats del servidor (no cal re-investigar)

| Cosa | Valor |
|---|---|
| CUPS | 2.4.16, socket `/run/cups/cups.sock` (mode `srw-rw-rw-`), escolta a `0.0.0.0:631` |
| Cua | `Canon_TS3350`, URI `ipp://localhost:60000/ipp/print`, model `everywhere` |
| ipp-usb | `interface = loopback`: **només accessible des de `localhost:60000`** |
| Usuari | `coco` (uid 1000, gid 1000), membre de `lpadmin` (gid 112) i `docker` |
| Firewall | `ufw` actiu. Docker se'l salta amb els ports publicats, però **no** amb `network_mode: host` |
| Zona horària | El servidor és UTC; el contenidor ha de fer servir `TZ=Europe/Madrid` |
| Ports ocupats | 22 53 80 81 443 631 1883 2283 3000 3493 6881 7000-7006 8081 8123 60000… **El 7100 és lliure** → TribuPrint (els 70xx són de l'arr-stack) |
| Patró de desplegament | Com `canconer`: imatge a `ghcr.io/twococos/<app>:latest`, compose a `~/<app>/docker-compose.yml` + `.env`, volum `./data`, logging json-file 10m×3; NPM a `~/npm` |
| Domini | Hi ha DuckDNS (`~/duckdns`); un subdomini tipus `print.<nom>.duckdns.org` funciona |

**Capacitats de la impressora** (via IPP a ipp-usb):
- **Formats de document:** `image/jpeg`, `image/urf`, `image/pwg-raster`. CUPS converteix el PDF i la resta.
- **Color:** `print-color-mode` = `color`, `monochrome`, `auto`, `auto-monochrome`.
- **Qualitat:** `print-quality` = `normal`, `high`. No hi ha esborrany.
- **Cares:** `sides` = **`one-sided` només**. No té dúplex, i per això hi haurà dúplex manual.
- **Còpies:** de 1 a 99.
- **Escalat:** `print-scaling` = `none`, `fill`, `fit`, `auto-fit`, `auto`.
- **Mides de paper:** A4, A5, B5, Letter, Legal, 10×15 (`na_index-4x6`), 13×18 (`na_5x7`), foto L (`oe_photo-l`), quadrada 5×5.
- **Rangs de pàgines:** `page-ranges-supported=false` a la impressora, però **CUPS els aplica igualment** (pdftopdf).
- **Tinta:** `marker-names` = `Color,Black`; `marker-colors` = `#00CFFF#F200FF#FFDA00,#000000` (el cartutx de color és tricolor); `marker-levels` en enters 0–100, aproximats.
- **Alertes:** `printer-state-reasons`, per exemple `media-empty-error`, `media-needed-error`, `marker-supply-low-warning`, `spool-area-full-report`. Hi ha també `printer-alert-description`.
- **Impressora apagada:** el dispositiu USB desapareix i ipp-usb deixa d'escoltar el 60000 (connexió refusada). Cal mostrar-ho com a estat "Apagada".

**Important:** l'estat que dona la cua de CUPS (`printer-state-reasons` i markers) **només s'actualitza mentre hi ha un treball en curs**. L'estat en viu s'ha de llegir **directament d'ipp-usb** (`ipp://localhost:60000/ipp/print`).

## Arquitectura

```
Navegador ──HTTPS──> NPM (Docker, bridge) ──http──> 192.168.1.200:7100
                                                     │  contenidor tribuprint (network_mode: host, user 1000:1000)
                                                     ├─ FastAPI + frontend estàtic
                                                     ├─ CUPS via socket Unix /run/cups/cups.sock  (enviar, cancel·lar, pausar…)
                                                     └─ ipp-usb via ipp://localhost:60000          (estat en viu, tinta, alertes)
```

- **`network_mode: host`:** és imprescindible, perquè ipp-usb només escolta a loopback.
- **Muntar el directori `/run/cups:/run/cups`**, no el fitxer del socket. Si CUPS es reinicia, recrea el socket, i amb el fitxer muntat la referència quedaria trencada.
- **`user: "1000:1000"`:** CUPS identifica qui es connecta pel socket local (peer credentials). Veu `coco`, que és de `lpadmin`, i per tant permet operacions d'administració (pausar la cua, cancel·lar qualsevol treball) **sense contrasenya**.
- **Qui ha enviat cada treball:** amb el socket local, CUPS assigna els treballs a `coco` encara que passis `requesting-user-name`. El perfil es guarda a la BD de l'app (`cups_job_id → profile_id`) i també al `job-name` (`"Anna · factura.pdf"`), perquè la interfície de CUPS també mostri qui és.

### Stack

- **Backend:** Python 3.13, FastAPI, uvicorn.
  - `pycups` per a les operacions de CUPS (llistes de treballs estructurades, `printFile`, `cancelJob`, `holdJob`, `releaseJob`, `enablePrinter`, `disablePrinter`).
  - `pyipp` (asíncron, el fa servir Home Assistant) per consultar ipp-usb.
  - `pypdf` per comptar pàgines i fer el dúplex manual, `img2pdf` i `Pillow` + `pillow-heif` per convertir imatges (fotos HEIC de l'iPhone incloses).
  - SQLite amb `SQLModel`.
- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4.
  - TanStack Query per a les dades, `pdfjs-dist` per a les previsualitzacions, `motion` per a les animacions, `lucide-react` per a les icones.
  - Fonts autoallotjades amb `@fontsource`.
- **Una sola imatge Docker** amb build multi-stage: Node construeix el frontend i FastAPI el serveix com a estàtic a `/`.
- **Mode mock** (`PRINTER_BACKEND=mock`): una impressora simulada amb estats, tinta i treballs que avancen. **Imprescindible**, perquè l'agent no té la impressora i ha de poder desenvolupar i provar tota la UI en local.

## Funcionalitat

### 1. Perfils ("Qui imprimeix?")

- La pantalla d'entrada és una graella d'avatars grans, cadascun amb emoji, cercle de color i nom, més un botó "+ Afegeix".
- El perfil triat es guarda en una cookie o a `localStorage`. Sempre hi ha "Canvia de perfil" a la capçalera.
- Es poden gestionar els perfils: crear, editar el nom, l'emoji i el color, i esborrar-los. Esborrar un perfil no esborra el seu historial, que es mostra com a "Perfil eliminat".
- **Primera execució:** si no hi ha cap perfil, la web demana crear el primer.

### 2. Imprimir

**Flux en dos passos:**

1. **Pujar** (`POST /api/uploads`). El servidor desa el fitxer, el **converteix a PDF** si cal i retorna `upload_id`, el nombre de pàgines i l'URL del PDF.
   - Les imatges i les fotos HEIC es converteixen amb `img2pdf` o Pillow.
   - Els fitxers TXT es converteixen amb una plantilla senzilla.
   - Els documents Office (DOCX, ODT, XLSX, PPTX) es converteixen amb LibreOffice headless a la Fase 4, darrere de `ENABLE_OFFICE`.
2. **Previsualitzar i configurar.** Es mostren les miniatures de les pàgines amb pdf.js, i es pot clicar per seleccionar pàgines o escriure un rang ("1-3,5"). Opcions disponibles:
   - còpies (1–99);
   - color o blanc i negre;
   - qualitat normal o alta;
   - mida de paper (de la llista `media-supported`, A4 per defecte);
   - ajust: `fit` per defecte, també `fill` o `none`;
   - orientació automàtica, vertical o horitzontal;
   - **doble cara manual** (vegeu més avall).

   Les opcions es llegeixen de les capacitats reals de la impressora (`GET /api/printer` → `capabilities`), no es codifiquen a mà.
3. **Enviar** (`POST /api/jobs`). Aquest pas fa tres coses:
   - envia el treball amb `printFile`, passant les opcions IPP/CUPS (`copies`, `page-ranges`, `print-color-mode`, `print-quality`, `media`, `print-scaling`, `orientation-requested`);
   - posa `job-name = "<perfil> · <nom fitxer>"`;
   - desa el treball a la BD.

**Altres detalls:**
- Es poden pujar diversos fitxers alhora, i cadascun es converteix en un treball.
- **Límit de mida:** 50 MB (`MAX_UPLOAD_MB`). La web mostra errors clars per a formats no suportats.
- **Dúplex manual.** La impressora no fa doble cara.
  - El backend genera amb `pypdf` dos PDF:
    - un amb les **pàgines senars**;
    - un altre amb les **pàgines parells en ordre invers**, amb una **pàgina en blanc** afegida si el total és senar, perquè els fulls quadrin.
  - S'envia el primer. Quan acaba, la UI mostra un modal il·lustrat: "Agafa els fulls impresos, gira'ls així i torna'ls a la safata posterior". Llavors "Continua" envia el segon (`POST /api/duplex/{id}/continue`). També es pot cancel·lar.
  - L'orientació exacta de com girar el paquet s'ha de calibrar amb la impressora real. Deixa el text i la il·lustració fàcils de canviar, i un TODO al README.

### 3. Cua

- Es mostren els treballs **actius**: pendents, imprimint i retinguts. De cada treball es veu:
  - perfil (avatar) i nom del fitxer;
  - pàgines i còpies;
  - opcions principals (B/N, A4…);
  - estat;
  - progrés, a partir de `job-impressions-completed` o `job-media-sheets-completed` si hi són;
  - hora.
- **Accions:** cancel·lar, retenir i alliberar.
- Els treballs acabats del dia apareixen a sota, amb l'estat final: imprès, cancel·lat o error.

### 4. Impressora

- **Estat en viu:** una il·lustració SVG animada de la impressora, segons l'estat:
  - inactiva: respira suaument;
  - imprimint: surt un full;
  - error: parpelleja en vermell;
  - apagada: grisa, amb "zzz".
- **Cartutxos:** dos tubs verticals, un **Negre** i un de **Color** amb franges cian, magenta i groc (a partir de `marker-colors`). Mostren el percentatge i les marques "baix" (`marker-low-levels`). A sota hi va una nota: "Nivells aproximats segons la impressora".
- **Alertes traduïdes** a partir de `printer-state-reasons`. Fes una taula centralitzada i ampliable, amb tests:
  - `media-empty`, `media-needed` → **"Sense paper. Posa fulls a la safata posterior i prem OK a la impressora (E02)."**
  - `media-jam` → "Paper encallat. Obre la tapa i treu el full amb compte."
  - `marker-supply-low` → "Queda poca tinta de {cartutx}."
  - `marker-supply-empty` → "Cartutx de {cartutx} buit."
  - `cover-open`, `door-open` → "Tapa oberta."
  - `output-area-*`, `output-tray-missing` → "Obre la safata de sortida."
  - `spool-area-full`, `-report` → s'ignoren o es mostren com a info discreta.
  - Error de connexió amb ipp-usb → estat **"Apagada o desconnectada"**.
  - Un motiu desconegut es mostra tal qual, en gris, i queda registrat al log.
  - El sufix (`-error`, `-warning`, `-report`) decideix la severitat.
- **Pausar i reprendre la cua** (`disablePrinter` / `enablePrinter` de CUPS), amb un estat visible: "Cua en pausa, els treballs esperen".
- Un enllaç discret a la interfície de CUPS (`http://192.168.1.200:631`), configurable per variable d'entorn.

### 5. Historial i estadístiques

- **Historial:** una llista paginada de tots els treballs, filtrable per perfil, amb el botó **"Torna a imprimir"** mentre el fitxer encara és a la retenció.
- **Estadístiques** en un panell senzill i divertit:
  - pàgines per perfil aquest mes;
  - total de pàgines;
  - percentatge de color respecte a blanc i negre;
  - "rànquing de la tribu".

### 6. Temps real

- `GET /api/events` és un flux **SSE** que envia `printer` i `jobs` quan canvien.
- Un bucle en segon pla consulta ipp-usb cada 5 s quan la impressora està inactiva i cada 2 s si hi ha treballs actius, i CUPS cada 2 s.
- La resposta queda en memòria cau, de manera que diversos clients **no** multipliquen les consultes a l'USB.
- Si l'SSE cau, el frontend torna a consultar amb TanStack Query (`refetchInterval`).
- **Notificacions:** toasts quan un treball acaba o falla, o quan apareix una alerta com la falta de paper. Les notificacions del navegador són opcionals.

## API (resum)

```
GET    /api/health
GET    /api/profiles              POST /api/profiles      PATCH/DELETE /api/profiles/{id}
GET    /api/printer               → {online, state, reasons[], alerts[{code,severity,message}], markers[{name,colors[],level,low,high}],
                                     media_ready, queue:{enabled,accepting}, capabilities:{media[],color_modes[],qualities[],scaling[],copies_max}}
POST   /api/printer/pause         POST /api/printer/resume
POST   /api/uploads (multipart)   → {id, name, pages, pdf_url, size}
GET    /api/uploads/{id}/pdf
POST   /api/jobs                  ← {upload_id, profile_id, options{copies,pages,color_mode,quality,media,scaling,orientation,duplex_manual}}
GET    /api/jobs?scope=active|today|history&profile=&page=
POST   /api/jobs/{id}/cancel | /hold | /release | /reprint
POST   /api/duplex/{id}/continue  POST /api/duplex/{id}/cancel
GET    /api/stats?month=YYYY-MM
GET    /api/events   (SSE)
```

**Sobre el perfil:** cada petició que crea alguna cosa porta `profile_id`. No hi ha autenticació.

**Errors:** JSON `{error: code, message}`, amb el missatge en català.

## Model de dades (SQLite a `/data/tribuprint.db`)

- **`profiles`:** `id, name, emoji, color, created_at, deleted_at`.
- **`uploads`:** `id, original_name, mime, pdf_path, pages, size_bytes, created_at, expires_at`. Els fitxers van a `/data/uploads/`, i un purgat periòdic els esborra en passar `RETENTION_HOURS` (24 h per defecte).
- **`jobs`:** `id, cups_job_id, profile_id, upload_id, filename, pages, copies, options_json, color, state, state_reason, created_at, completed_at, duplex_batch_id, duplex_stage`. L'estat se sincronitza des de CUPS.
- **`duplex_batches`:** `id, upload_id, odd_job_id, even_pdf_path, status`.

Les metadades de l'historial es guarden indefinidament; els fitxers, no.

## Disseny visual

**Concepte: "copisteria de barri"**, càlida, juganera i tàctil. L'estil és de paper, tinta CMYK i tiquets. **Mode clar per defecte.** Hi pot haver un mode fosc opcional amb un selector, que respecti la preferència guardada però que comenci sempre en clar.

### Tokens (CSS variables a `:root` i tema Tailwind)

```
--paper   #F7F3EA  (fons, crema)      --surface #FFFDF8 (targetes)     --line  #E4DCCB
--ink     #1C1B18  (text)             --muted   #6E685D                 --shadow 0 1px 0 #E4DCCB, 0 8px 24px -12px rgba(28,27,24,.18)
--cyan    #00A3D9   --magenta #E6007E   --yellow #FFD21F   --key #1C1B18   (accents CMYK)
--ok #2F9E5E   --warn #E39B00   --danger #D63A2B
radius: 14px targetes, 999px pastilles. Textura de paper molt subtil (SVG noise inline, opacitat ~3%).
```

### Tipografia

- **Bricolage Grotesque:** titulars i logotip, en pes 700–800.
- **Instrument Sans:** text.
- **JetBrains Mono:** números de tiquet, hores i percentatges.

### Elements amb personalitat

- **Logotip:** el wordmark "TribuPrint" amb un petit desplaçament de color CMY (efecte d'impressió mal registrada, risograph). Al costat, una icona d'impressora feta amb línies. El subtítol "Servei de reprografia de la Tribu" va en versaletes petites.
- **Treballs com a tiquets de copisteria:** vores perforades (màscara radial als laterals), número "Nº 0042" en mono i una línia de punts. Quan un treball acaba hi cau un **segell** rotat "IMPRÈS" (verd) o "ANUL·LAT" (vermell), amb una animació de segell.
- **Zona de pujada:** una safata grossa amb text "Deixa-hi els papers" i un "o tria fitxers". Quan s'hi arrossega un fitxer, els fulls de la il·lustració es remenen.
- **Cartutxos:** tubs amb el líquid ondulant, una animació CSS lenta. El de color té tres franges. Quan el nivell és baix, un "!" suau.
- **Impressora SVG** animada segons l'estat, com s'ha descrit abans.
- **Microtext juganer** en català. Exemples: "La tribu té paper?", "Imprimint… no toquis res", "Cua buida. Silenci a la copisteria.", "Qui imprimeix avui?".
- **Perfils estil Netflix:** avatars grans (emoji sobre un cercle de color pastel), amb hover que els fa créixer, i un selector d'emoji i de color quan se n'edita un.

### Maquetació

- **Mobile-first.**
  - **Al mòbil:** barra inferior amb 4 pestanyes: **Imprimeix · Cua · Impressora · Historial**.
  - **A l'escriptori (≥1024 px):** dues columnes. A l'esquerra, pujada i configuració. A la dreta, una targeta d'impressora fixa (estat + tinta) i la cua a sota. L'historial va en una pàgina a part.
- Sempre visible a la capçalera: el logotip, una "pastilla" d'estat de la impressora (punt de color + text) i l'avatar del perfil.
- **Accessibilitat:**
  - contrast AA;
  - focus visible;
  - `prefers-reduced-motion` desactiva les ones, els segells i els remenaments;
  - botons de mínim 44 px.

## Estructura del repositori (`tribuprint`)

```
backend/app/
  main.py            # FastAPI, monta /api i serveix el frontend estàtic
  config.py          # pydantic-settings amb les env vars
  db.py, models.py   # SQLModel
  printer/
    base.py          # interfície PrinterBackend (status, capabilities, submit, jobs, cancel, hold, release, pause, resume)
    cups_ipp.py      # implementació real: pycups + pyipp
    mock.py          # impressora simulada (estats, tinta, progrés, errors provocables)
    reasons.py       # taula printer-state-reasons → missatge català + severitat
  services/
    convert.py       # imatge/HEIC/TXT/Office → PDF, recompte de pàgines
    duplex.py        # divisió en senars / parells invertides + blanc
    poller.py        # bucle en segon pla + memòria cau + emissió SSE
    retention.py     # purgat d'uploads
  api/               # routers: profiles, printer, uploads, jobs, duplex, stats, events
backend/tests/       # pytest: reasons, duplex, convert, API amb backend mock
frontend/src/        # React: routes (Perfils, Imprimeix, Cua, Impressora, Historial), components (Ticket, Cartridge, PrinterIllustration, Dropzone, ProfileAvatar, Stamp…), api/, theme/
Dockerfile           # stage 1 node:22 build frontend; stage 2 python:3.13-slim (+ libcups2, build de pycups en un stage builder)
compose.dev.yml      # dev local amb PRINTER_BACKEND=mock
deploy/docker-compose.yml + deploy/.env.example   # per copiar al servidor (~/tribuprint/)
.github/workflows/docker.yml   # build i push a ghcr.io/twococos/tribuprint:latest + tag sha (main)
README.md            # funcionament, dev, desplegament, NPM, calibratge del dúplex
```

### Variables d'entorn

| Variable | Valor per defecte |
|---|---|
| `PRINTER_BACKEND` | `real`, o `mock` |
| `CUPS_SERVER` | `/run/cups/cups.sock` |
| `CUPS_PRINTER` | `Canon_TS3350` |
| `IPPUSB_URL` | `ipp://localhost:60000/ipp/print` |
| `PORT` | `7100` |
| `DATA_DIR` | `/data` |
| `MAX_UPLOAD_MB` | `50` |
| `RETENTION_HOURS` | `24` |
| `ENABLE_OFFICE` | `false` |
| `CUPS_WEB_URL` | `http://192.168.1.200:631` |
| `TZ` | `Europe/Madrid` |

### `deploy/docker-compose.yml`

Segueix l'estil del `canconer`, amb comentaris en català:

```yaml
services:
  tribuprint:
    image: ghcr.io/twococos/tribuprint:latest
    container_name: tribuprint
    restart: unless-stopped
    network_mode: host          # ipp-usb només escolta a localhost:60000
    user: "1000:1000"           # coco ∈ lpadmin → CUPS permet pausar/cancel·lar pel socket
    env_file: [.env]
    volumes:
      - ./data:/data
      - /run/cups:/run/cups     # directori, no el fitxer (sobreviu als reinicis de CUPS)
    healthcheck: { test: ["CMD", "python", "-c", "import urllib.request;urllib.request.urlopen('http://127.0.0.1:7100/api/health')"], interval: 30s, timeout: 5s, retries: 3 }
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
```

## Fases d'implementació

1. **Esquelet.**
   - Crear el repo, el backend FastAPI amb el backend `mock`, `/api/health`, el Dockerfile, `compose.dev.yml` i el workflow de GHCR.
   - Fixar els tokens de disseny i la capçalera.
2. **Backend real.**
   - Implementar `cups_ipp.py` (pycups + pyipp), `reasons.py` amb tests, `poller` + SSE, uploads i conversió (PDF, imatges, HEIC, TXT), i jobs.
3. **Frontend.**
   - Pantalles de perfils, flux d'impressió amb previsualització pdf.js, cua amb tiquets, panell de la impressora amb tinta i alertes, i pausar i reprendre.
   - Animacions i responsive.
4. **Extres.**
   - Dúplex manual, historial, reimpressió i estadístiques.
   - Office amb LibreOffice (`libreoffice-writer-nogui`, `-calc-nogui`, `-impress-nogui`, darrere de `ENABLE_OFFICE`).
   - Toasts i notificacions.
5. **Desplegament.**
   - README complet i proves al servidor (vegeu Verificació).

## Preparació del servidor

Aquestes comandes les executa **l'usuari**, no l'agent:

```bash
# Que els treballs esperin (en lloc d'aturar la cua) si la impressora està apagada o sense paper
sudo lpadmin -p Canon_TS3350 -o printer-error-policy=retry-job
# Si encara no s'ha fet: treure la cua duplicada i cups-browsed
sudo lpadmin -x Canon_TS3300_series_USB; sudo systemctl disable --now cups-browsed
# Firewall: amb network_mode host, ufw sí que filtra el 7100
sudo ufw allow from 192.168.1.0/24 to any port 7100 proto tcp    # accés directe des de la LAN
sudo ufw allow from 172.16.0.0/12  to any port 7100 proto tcp    # NPM (xarxa Docker) → amfitrió
# Desplegament
mkdir -p ~/tribuprint/data && cd ~/tribuprint   # copiar-hi deploy/docker-compose.yml i .env
docker compose pull && docker compose up -d
```

Si el paquet de GHCR és privat, el servidor necessita `docker login ghcr.io`, igual que amb el `canconer`.

### Nginx Proxy Manager

- **Proxy Host:** `print.<nom>.duckdns.org` → `http://192.168.1.200:7100`.
  - Activar SSL (Let's Encrypt, Force SSL).
  - Activar **Websockets Support**, que no és estrictament necessari per a SSE però no fa nosa.
- **Pestanya Advanced:**
  ```
  client_max_body_size 60m;
  proxy_buffering off;          # necessari perquè l'SSE arribi en temps real
  proxy_read_timeout 1h;
  ```
- **Access List "Tribu":**
  - Authorization: un usuari i contrasenya.
  - Access: `allow 192.168.1.0/24`.
  - **Satisfy Any**: des de la LAN no demana contrasenya; des de fora, sí.
  - Possible problema: si el router fa *NAT loopback*, quan accedeixes al domini des de casa la IP d'origen pot no ser de la LAN i et demanarà contrasenya igualment. Des de casa sempre es pot fer servir `http://192.168.1.200:7100`.

## Verificació

- **Tests (`pytest`):**
  - la traducció de `printer-state-reasons` i la severitat;
  - el dúplex: amb 1, 2, 5 i 6 pàgines, comprovar l'ordre i la pàgina en blanc;
  - la conversió d'imatge, HEIC i TXT a PDF, i el recompte de pàgines;
  - l'API sencera amb el backend `mock`: perfils, uploads, jobs, cancel·lar, pausar i SSE.
- **Local amb el mock:**
  - `docker compose -f compose.dev.yml up`.
  - Recórrer tots els fluxos i provocar estats des del mock: sense paper, paper encallat, apagada, tinta baixa.
  - Captures amb Playwright a 390 px (mòbil) i 1440 px (escriptori), en mode clar i fosc, amb `prefers-reduced-motion` comprovat.
- **Al servidor, prova real:**
  1. `GET /api/printer` retorna els mateixos `marker-levels` que `ipptool -tv ipp://localhost:60000/ipp/print get-printer-attributes.test`.
  2. Imprimir un PDF d'una pàgina en B/N: apareix a la cua amb el perfil, i també a `lpstat -o` i a la interfície de CUPS com a `"<perfil> · fitxer"`.
  3. Cancel·lar un treball pendent, i retenir-ne i alliberar-ne un altre.
  4. Pausar la cua des de la web: `lpstat -p` diu *disabled*. Reprendre-la.
  5. Treure el paper: apareix l'alerta E02 i el treball espera. Posar paper i prémer OK: s'imprimeix.
  6. Apagar la impressora: l'estat passa a "Apagada", i en tornar-la a encendre es recupera sola.
  7. Dúplex manual amb un PDF de 3 pàgines: calibrar el text i la il·lustració de com girar el paquet.
  8. Accés per `https://print.<nom>.duckdns.org` des del mòbil amb dades: demana contrasenya. Des de `http://192.168.1.200:7100`: no en demana.
