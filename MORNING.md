# Ráno — co máš udělat

Spal jsem se přes noc nevypnul, ale tady je všechno hotové.

## ✅ Co se v noci stalo (commits)

Posledních ~10 commitů, hlavní vylepšení:

1. **Login systém** — 2 účty `vodvarka@grevo.cz` a `gregor@grevo.cz`, oba heslo `Grevo!32462`
2. **Per-user Bunny settings** — každý si nastavuje vlastní Storage Zone
3. **Per-user knihovna** — Vodvárka nevidí Gregora a naopak
4. **Top-tier trim editor**:
   - Thumbnail strip na timeline (frame snímky z videa)
   - Audio waveform (vidíš kdy mluvíš)
   - Keyboard shortcuts: Space play, J/L ±5s, ←→ frame step, I/O mark in/out, C cut, Delete remove
   - Speed control 0.5× – 2×
   - Click-to-scrub timeline
   - Help panel (?)
5. **Persistent trim panel** — vždy nad video v Preview, žádné „Střih" tlačítko
6. **Onboarding banner** — když není Bunny nastaveno, navádí do Settings
7. **Cache busting** — nginx no-cache pro index.html + CDN-Cache-Control
8. **Build SHA v sidebaru** — vidíš na jaké jsi verzi
9. **Self-hosted ffmpeg.wasm** — bez unpkg CORS issues
10. **Full-screen recording preview**

## 🚨 Co musíš udělat ručně

### 1. Redeploy v Bunny

GHA postavila nový image (`:latest`), ale Bunny ho neumí automaticky pullnout. Musíš:

1. Otevři Bunny dashboard → Magic Containers → tvoje appka
2. `app` kontejner → **Edit** → **Update Container** (bez změn, jen klikni)
3. To stejné pro `records-by-grevo-proxy` kontejner

To pullne nejnovější `:latest` z GHCR.

### 2. Hard refresh v Chrome

`Cmd+Shift+R` na `https://mc-vk9ifcyrb6.bunny.run/`

Pak se podívej do **sidebaru vlevo dole** — uvidíš `e58f491` (nebo nejnovější SHA). Pokud vidíš jiný SHA, Bunny ještě servuje starou verzi.

### 3. Login a Settings

- Login: `vodvarka@grevo.cz` / `Grevo!32462`
- Settings → vyplň znovu tvoje Bunny údaje:
  - Storage Zone: `jan-vodvarka-apps`
  - Region: Falkenstein
  - Access Key: ten rotovaný (zadej PŘÍMO v UI, ne přes chat)
  - Pull Zone: `https://jan-vodvarka-apps.b-cdn.net`
  - Folder: `recordings/`
  - Auto-upload: dle preference
- Klikni **Otestovat** → mělo by říct mód `multi-tenant` ✅

### 4. Pošli Gregorovi

- URL: https://mc-vk9ifcyrb6.bunny.run/
- Login: `gregor@grevo.cz` / `Grevo!32462`
- Aby si v Settings vyplnil svoje vlastní Bunny údaje

## 💡 Volitelné — auto-deploy GHA → Bunny

Aby se příště Bunny automaticky aktualizoval po každém pushi:

1. V Bunny dashboardu → Account settings → API → **Add API Key** (jméno: `github-actions`)
2. Pak v GitHub repu (https://github.com/grevo-cz/grevo-records/settings/secrets/actions):
   - **New repository secret**: `BUNNYNET_API_KEY` = ten klíč
3. Najdi APP_ID svojí Magic Containers appky — v URL Bunny dashboardu (`/magic-containers/12345/...`)
4. V GitHub repu → **Variables**:
   - `BUNNY_SPA_APP_ID` = ten APP_ID
   - `BUNNY_SPA_CONTAINER` = `app`
   - `BUNNY_PROXY_APP_ID` = ten samý APP_ID (kontejnery jsou v jedné appce)
   - `BUNNY_PROXY_CONTAINER` = `records-by-grevo-proxy`

Pak `git push` = auto-deploy (rolling update).

## 🧪 Test plán

Po deployi otestuj:

- [ ] Login funguje
- [ ] Settings ukáže prázdná (per-user), vyplníš Bunny údaje
- [ ] Test connection → ✅ multi-tenant
- [ ] Nahraj 5s video s mikrofonem
- [ ] Po stop: konverze do MP4 (sleduj progress)
- [ ] V Preview: vidíš thumbnaily + waveform na timeline
- [ ] Zkus klávesové zkratky (Space, J/L, I/O)
- [ ] Klikni „Nahrát na Bunny" v Preview
- [ ] Dostaneš zelený panel s linkem
- [ ] Otevři link v anonymním okně — video se přehraje
- [ ] Pošli link Gregorovi pro test

Pokud cokoliv selže — pošli mi screenshot, fixnu.
