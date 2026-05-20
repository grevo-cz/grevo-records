# Records By Grevo

Lokální **webová aplikace** pro nahrávání obrazovky, webkamery a mikrofonu — jako Loom nebo Screen Studio, ale plně offline a běží v prohlížeči.

## Funkce

- 🎥 Nahrávání obrazovky / okna / záložky (nativní výběr v prohlížeči)
- 📹 Webkamera v kruhovém PiP **vypálená přímo do videa** (volitelné)
- 🎤 Mikrofon s **regulací hlasitosti** (0–200%)
- 🔊 Systémový zvuk (zaškrtni „Share audio" v dialogu)
- ⏱ **Odpočet** před startem (0 / 3 / 5 s)
- 🖼 **Náhled obrazovky** během nahrávání (drag, sbalit)
- ⏸ Pause / Resume / Stop
- 📦 **Automatická konverze do MP4** přes ffmpeg.wasm (po stopnutí)
- ✂️ **Multi-cut střih** — ořež začátek/konec a vyřízni libovolný počet úseků uprostřed
- 📚 Knihovna nahrávek (IndexedDB)
- ⬇️ Stažení libovolné nahrávky
- ☁️ Bunny.net upload (konfigurace v Settings — manuální výběr co nahrát)

## Lokální vývoj

```bash
npm install
npm run dev
```

Otevři `http://localhost:5173` v **Chrome / Edge / Arc / Brave**.

## Build

```bash
npm run build
npm run preview
```

## Deploy na Bunny.net Magic Containers

Aplikace má připravený **Dockerfile** + **nginx.conf** pro snadný container deploy.

### 1. Vytvoř image lokálně

```bash
docker build -t records-by-grevo:latest .
```

Vyzkouš lokálně:

```bash
docker run --rm -p 8080:80 records-by-grevo:latest
# → http://localhost:8080
```

### 2. Push do Bunny Container Registry

Bunny.net Magic Containers má integrovaný registry (`containers.bunny.net`).

```bash
# Login (jednou)
docker login containers.bunny.net -u <bunny-username>

# Tag + push
docker tag records-by-grevo:latest containers.bunny.net/<your-namespace>/records-by-grevo:latest
docker push containers.bunny.net/<your-namespace>/records-by-grevo:latest
```

### 3. Deploy v Bunny Dashboardu

1. Otevři **Magic Containers** → **Add Your First App** (nebo **Quick Deploy**)
2. Image: `containers.bunny.net/<your-namespace>/records-by-grevo:latest`
3. Port: `80`
4. Region: vyber nejbližší k tobě i klientovi (např. Frankfurt)
5. Resources: stačí nejmenší tier (statická SPA)
6. Deploy

Po deployi dostaneš URL typu `https://records-by-grevo.b-cdn.net` nebo můžeš napojit vlastní doménu.

### Alternativa: Bunny Storage + Pull Zone (jednodušší, levnější)

Pro statickou SPA stačí klasický CDN setup:

```bash
npm run build
# Upload obsahu složky dist/ do Bunny Storage Zone
# Připoj Pull Zone na Storage Zone
# V Pull Zone → Edge Rules:
#   - If "Request URL Path" doesn't match a file → Rewrite to /index.html
```

Funguje pro `https://<pullzone>.b-cdn.net`.

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS
- `getDisplayMedia` + `getUserMedia` + `MediaRecorder` (WebM nahrávání)
- `ffmpeg.wasm` — in-browser konverze WebM → MP4 (lazy-loaded z unpkg)
- `<canvas>` + `captureStream()` pro PiP compositing a multi-cut export
- IndexedDB pro perzistenci nahrávek
- Lucide ikony

## Soubory

```
.
├── Dockerfile           # Multi-stage build pro Bunny Magic Containers
├── nginx.conf           # SPA-friendly nginx config (SPA fallback, cache, hlavičky)
├── .dockerignore
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── types.ts
    ├── index.css
    ├── components/
    │   ├── Sidebar.tsx
    │   ├── Home.tsx
    │   ├── RecordingView.tsx
    │   ├── ScreenPreview.tsx
    │   ├── Preview.tsx
    │   ├── TrimEditor.tsx
    │   ├── Library.tsx
    │   └── Settings.tsx
    ├── hooks/
    │   ├── useRecorder.ts
    │   └── useDevices.ts
    └── lib/
        ├── compose.ts   # Multi-cut canvas+audio reencoder
        ├── ffmpeg.ts    # ffmpeg.wasm wrapper (WebM → MP4)
        ├── storage.ts   # IndexedDB recordings
        ├── settings.ts  # Bunny.net config
        ├── download.ts
        └── format.ts
```
