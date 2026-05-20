# Deploy návod — Records By Grevo → Bunny Magic Containers

Bez instalace Dockeru. GitHub Actions postaví image a Bunny ho deploynuje.

---

## 1) Vytvoř GitHub repo a pushni kód

### Možnost A: GitHub Desktop (nejjednodušší)
1. Stáhni https://desktop.github.com/ → nainstaluj → přihlas se
2. **File → Add Local Repository** → vyber složku `/Users/janvodvarka/Desktop/VIBECODING/Video recorder Main`
3. Když GitHub Desktop hlásí „This directory does not appear to be a Git repository" → klikni **create a repository**
4. Name: `records-by-grevo`, ostatní nech default → **Create Repository**
5. Klikni **Publish repository** vpravo nahoře → odškrtni „Keep this code private" (musí být veřejné kvůli GHCR free tieru) → **Publish**

### Možnost B: Příkazová řádka
```bash
cd "/Users/janvodvarka/Desktop/VIBECODING/Video recorder Main"
git init
git add .
git commit -m "Initial commit"
gh repo create records-by-grevo --public --source=. --push
```
(Vyžaduje nainstalovaný GitHub CLI `gh` a být přihlášený.)

---

## 2) První build (proběhne automaticky)

Hned po pushi se v GitHubu spustí workflow. Sleduj **záložku Actions** v tvém repu.

První běh vytvoří 2 images v GitHub Container Registry (GHCR):
- `ghcr.io/<tvuj-github-user>/records-by-grevo-spa:latest`
- `ghcr.io/<tvuj-github-user>/records-by-grevo-proxy:latest`

**Důležité — udělej images public:**
1. GitHub → tvůj profil → **Packages** → klikni na `records-by-grevo-spa`
2. **Package settings** (pravý sloupec) → scrolluj dolů → **Change visibility** → **Public** → potvrdit
3. Totéž pro `records-by-grevo-proxy`

(Soukromá GHCR images vyžadují přihlášení pro pull — pro veřejné Bunny stačí jen URL.)

---

## 3) Vytvoř Bunny apps

V Bunny dashboardu → **Magic Containers** → **Add Your First App**.

### App 1: SPA (frontend)
- App name: `records-by-grevo-spa`
- Deployment type: **Single region deployment** → Next
- **Container Name**: `app` (důležité — workflow předpokládá název `app`, jinak to musíš nastavit ve vars)
- **Registry**: vyber **GitHub Public**
- **Image**: `<tvuj-github-user>/records-by-grevo-spa` (přesně tak, vše malými)
- **Tag**: `latest`
- **Endpoints** záložka → Port: `80`
- **Environment Variables**: žádné
- **Region**: Falkenstein (DE)
- Resources: nejmenší tier
- **Deploy**

Po deployi zkopíruj URL aplikace (něco jako `https://records-by-grevo-spa.b-cdn.net`).

### App 2: Proxy (backend)
- App name: `records-by-grevo-proxy`
- Single region → Next
- **Container Name**: `app`
- **Registry**: GitHub Public
- **Image**: `<tvuj-github-user>/records-by-grevo-proxy`
- **Tag**: `latest`
- **Endpoints**: Port `8080`
- **Environment Variables** záložka — přidej:
  ```
  BUNNY_STORAGE_ZONE      = jan-vodvarka-apps
  BUNNY_STORAGE_HOST      = storage.bunnycdn.com
  BUNNY_ACCESS_KEY        = <NOVÝ rotovaný klíč z Bunny Storage → Access>
  BUNNY_PULL_ZONE_URL     = https://<tvuj-pullzone>.b-cdn.net
  UPLOAD_SECRET           = <vygeneruj: openssl rand -hex 32>
  ALLOWED_ORIGINS         = <URL SPA z App 1>
  PORT                    = 8080
  ```
- Region: Falkenstein (DE)
- Resources: nejmenší tier
- **Deploy**

---

## 4) Propoj GitHub Actions s Bunny (auto-deploy při dalším pushi)

Tohle je volitelné — bez tohoto kroku se obrazy stavějí, ale Bunny si je musí pullnout sám (nebo restartovat container). S tímto krokem `git push` = auto-rolling update.

### Vygeneruj Bunny API key
1. Bunny dashboard → klikni na svůj avatar → **Account settings** → **API**
2. **Add API Key** → pojmenuj `github-actions` → vygeneruj a zkopíruj (uvidíš jen jednou)

### Najdi App IDs
Otevři každou Bunny app — v URL bude něco jako `https://dash.bunny.net/magic-containers/12345/...`. Číslo `12345` je APP_ID.

### Nastav v GitHub repu
GitHub → tvůj repo → **Settings** → **Secrets and variables → Actions**.

**Secrets** (záložka Secrets):
- `BUNNYNET_API_KEY` = ten API key z Bunny

**Variables** (záložka Variables):
- `BUNNY_SPA_APP_ID` = app_id první aplikace
- `BUNNY_PROXY_APP_ID` = app_id druhé aplikace

(Volitelně `BUNNY_SPA_CONTAINER` / `BUNNY_PROXY_CONTAINER` pokud kontejnery nemáš pojmenované `app`.)

---

## 5) Nastav aplikaci

Otevři URL SPA (`https://records-by-grevo-spa.b-cdn.net`) → **Settings** v sidebaru:

- **Proxy URL**: URL proxy aplikace (App 2)
- **Upload Secret**: stejný řetězec jako `UPLOAD_SECRET` v proxy env vars
- **Folder**: `recordings/`
- **Bunny upload**: ON
- Klikni **Otestovat** → mělo by říct ✅

A je hotovo. Pošli URL kámošovi.

---

## Update aplikace později

Stačí `git push` (nebo commit + push přes GitHub Desktop) — GitHub Actions postaví nový image a Bunny provede rolling update.

---

## Troubleshooting

- **Workflow failed na "permission denied" v GHCR** → zkontroluj že v repu Settings → Actions → General → Workflow permissions má **Read and write permissions**
- **Bunny říká „image not found"** → GHCR image musí být PUBLIC (krok 2)
- **App startuje a hned crashe** → v Bunny dashboardu → tvoje app → Logs. Nejčastěji chybí env var u proxy.
- **CORS error v prohlížeči při uploadu** → `ALLOWED_ORIGINS` v proxy musí být PŘESNĚ URL SPA, bez trailing slashe
- **API klíč jsi sdílel v chatu dřív** → rotuj ho v Bunny Storage → Access → 🔁 vedle Password, NOVÝ klíč dej do proxy env vars
