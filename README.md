# TribuPrint

*Servei de reprografia de la Tribu.* Web per gestionar la Canon PIXMA TS3350 de casa, connectada per USB al home server: pujar documents i imprimir-los des de qualsevol lloc, veure i gestionar la cua, i consultar l'estat de la impressora (tinta, falta de paper, pausa).

- Perfils estil Netflix («Qui imprimeix avui?»), sense contrasenya: la porta la guarda Nginx Proxy Manager.
- PDF, imatges (també HEIC de l'iPhone) i text. Office opcional amb LibreOffice.
- Previsualització de pàgines, rangs, còpies, color, qualitat, paper, ajust i orientació.
- Doble cara manual guiada.
- Cua en temps real (SSE), historial, reimpressió i estadístiques de la tribu.

## Arquitectura

```
Navegador ──HTTPS──> NPM ──http──> 192.168.1.200:7100  (contenidor, network_mode: host, uid 1000)
                                    ├─ FastAPI + frontend estàtic (React)
                                    ├─ CUPS pel socket /run/cups/cups.sock   → enviar, cancel·lar, retenir, pausar
                                    └─ ipp-usb a ipp://localhost:60000        → estat en viu, tinta, alertes
```

- L'estat de la cua de CUPS només s'actualitza mentre imprimeix, per això l'estat en viu es llegeix directament d'ipp-usb.
- Un bucle en segon pla consulta ipp-usb cada 5 s (2 s amb treballs actius) i CUPS cada 2 s. Ho desa en memòria cau i ho reparteix per SSE (`/api/events`): l'USB no rep més consultes encara que hi hagi molts navegadors oberts.
- Qui envia cada treball es guarda a SQLite (`/data/tribuprint.db`) i al `job-name` de CUPS (`"Anna · factura.pdf"`).
- Els fitxers pujats es purguen en passar `RETENTION_HOURS`. L'historial es queda per sempre.

```
backend/app/        FastAPI: api/, printer/ (base, cups_ipp, mock, reasons), services/ (convert, duplex, poller, jobs, retention)
backend/tests/      pytest
frontend/src/       React 19 + Vite + Tailwind v4: routes/, components/, api/, lib/
deploy/             docker-compose.yml i .env.example per al servidor
```

## Desenvolupament en local (impressora simulada)

Cal Python 3.13 (amb [uv](https://docs.astral.sh/uv/)) i Node 22.

```bash
# Backend
cd backend
uv venv -p 3.13 .venv
uv pip install -p .venv -r requirements.txt pytest==9.2.0 httpx==0.28.1   # a Windows/macOS pycups se salta sol
PRINTER_BACKEND=mock DATA_DIR=../data .venv/bin/python -m app      # http://localhost:7100

# Frontend (una altra terminal)
cd frontend
npm ci
npm run dev                                                         # http://localhost:5173 (fa de proxy cap a /api)
```

Amb el backend `mock`, la targeta de la impressora té un desplegable **«Simulador (mode mock)»** per provocar estats: sense paper, paper encallat, tapa oberta, poca tinta, apagada… També hi ha l'API `POST /api/mock/condition {"condition": "no_paper"}`. Els treballs avancen sols a uns 2,5 s per full.

Per servir el frontend construït des de FastAPI (com en producció): `npm run build` i arrenca el backend amb `STATIC_DIR=../frontend/dist`.

Amb Docker:

```bash
docker compose -f compose.dev.yml up --build     # http://localhost:7100, backend mock
```

### Tests

```bash
cd backend && .venv/bin/python -m pytest          # traducció d'alertes, dúplex, conversió, backend real simulat, API sencera amb el mock, SSE
cd frontend && npm run typecheck
```

## Variables d'entorn

| Variable | Per defecte | Notes |
|---|---|---|
| `PRINTER_BACKEND` | `real` | `mock` per a la impressora simulada |
| `CUPS_SERVER` | `/run/cups/cups.sock` | socket Unix de CUPS |
| `CUPS_PRINTER` | `Canon_TS3350` | nom de la cua |
| `CUPS_USER` | `coco` | nom que s'envia a CUPS; ha de ser l'usuari de l'amfitrió amb uid 1000 |
| `IPPUSB_URL` | `ipp://localhost:60000/ipp/print` | ipp-usb (només loopback) |
| `PORT` | `7100` | |
| `DATA_DIR` | `/data` | BD i fitxers pujats |
| `MAX_UPLOAD_MB` | `50` | |
| `RETENTION_HOURS` | `24` | després, el fitxer s'esborra i ja no es pot reimprimir |
| `ENABLE_OFFICE` | `false` | DOCX/ODT/XLSX/PPTX amb LibreOffice; cal construir la imatge amb `--build-arg INSTALL_OFFICE=true` |
| `CUPS_WEB_URL` | `http://192.168.1.200:631` | enllaç discret a la interfície de CUPS |
| `TZ` | `Europe/Madrid` | |

## Desplegament al servidor

La imatge es publica a `ghcr.io/twococos/tribuprint:latest`. Al servidor (`ssh nas`):

```bash
# 1. Que els treballs esperin (en lloc d'aturar la cua) si la impressora està apagada o sense paper
sudo lpadmin -p Canon_TS3350 -o printer-error-policy=retry-job
# 2. Si encara no s'ha fet: treure la cua duplicada i cups-browsed
sudo lpadmin -x Canon_TS3300_series_USB; sudo systemctl disable --now cups-browsed
# 3. Firewall: amb network_mode host, ufw sí que filtra el 7100
sudo ufw allow from 192.168.1.0/24 to any port 7100 proto tcp    # LAN
sudo ufw allow from 172.16.0.0/12  to any port 7100 proto tcp    # NPM (xarxa Docker) → amfitrió
# 4. Fitxers
mkdir -p ~/tribuprint/data && cd ~/tribuprint
#    copia-hi deploy/docker-compose.yml i deploy/.env.example (com a .env)
# 5. Arrencada
docker compose pull && docker compose up -d
docker compose logs -f        # ha de dir "TribuPrint 0.1.0 amb backend real"
```

Si el paquet de GHCR és privat, abans cal `docker login ghcr.io`, com amb el `canconer`.

### Nginx Proxy Manager

- **Proxy Host:** `print.<nom>.duckdns.org` → `http://192.168.1.200:7100`. SSL amb Let's Encrypt, *Force SSL*, *Websockets Support*.
- **Advanced:**
  ```
  client_max_body_size 60m;
  proxy_buffering off;          # perquè l'SSE arribi en temps real
  proxy_read_timeout 1h;
  ```
- **Access List «Tribu»:** usuari i contrasenya, `allow 192.168.1.0/24`, **Satisfy Any**. Des de la LAN no la demana; des de fora, sí. Si el router fa *NAT loopback*, des de casa pots fer servir `http://192.168.1.200:7100`.

## Calibratge del dúplex manual (TODO)

La TS3350 no té dúplex. TribuPrint imprimeix primer les pàgines senars i, quan acaben, mostra un modal que explica com girar el paquet abans d'enviar les parells. Les parells van en ordre invers, amb una pàgina en blanc si el total és senar.

**Encara no s'ha provat amb la impressora real.** Per calibrar-ho:

1. Imprimeix un PDF de **3 pàgines** amb «Doble cara manual».
2. Segueix les instruccions del modal i mira si la pàgina 2 queda al dors de la 1, amb la mateixa orientació.
3. Ajusta [`frontend/src/duplexGuide.ts`](frontend/src/duplexGuide.ts):
   - `flip`: `'long'` (com un llibre) o `'short'` (com un bloc);
   - `printedSide`: `'up'` o `'down'` (com queda la cara impresa a la safata posterior);
   - `topEdge`;
   - els textos de `steps`.
4. Si l'ordre de les pàgines surt al revés (per exemple, la 2 al dors de la 3), cal tocar [`backend/app/services/duplex.py`](backend/app/services/duplex.py) (`split_pages`): potser no s'ha d'invertir la tanda de parells, o la pàgina en blanc ha d'anar al final. Els tests de `tests/test_duplex.py` descriuen el comportament actual.

## Notes

- **Identitat davant CUPS.** Pel socket local, CUPS accepta la credencial *PeerCred* només si el nom d'usuari que envia el client correspon a l'uid del procés. Per això la imatge crea l'usuari `coco` amb uid 1000 i el backend fa `cups.setUser(CUPS_USER)`. Si a l'amfitrió l'uid 1000 té un altre nom, canvia `CUPS_USER`.
- **Retenir i alliberar** es fa amb `setJobHoldUntil(id, "indefinite" | "no-hold")`: pycups no té `holdJob`/`releaseJob`.
- La doble cara manual només admet **una còpia**; per a més còpies, envia-ho diverses vegades.
