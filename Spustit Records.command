#!/bin/bash
# Dvojklikový spouštěč Records By Grevo (lokálně na Macu).
# Před startem si stáhne nejnovější verzi (bezpečně) a otevře appku v prohlížeči.
# Zavřením okna Terminálu se server vypne.

cd "$(dirname "$0")" || exit 1

echo "════════════════════════════════════════════"
echo "  Records By Grevo — lokální spuštění"
echo "════════════════════════════════════════════"
echo ""

# Node musí být nainstalovaný
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js není nainstalovaný."
  echo "   Stáhni ho z https://nodejs.org (verze 20 nebo vyšší) a zkus znovu."
  echo ""
  read -r -p "Zavři stiskem Enter…" _
  exit 1
fi

# ── Aktualizace na nejnovější verzi ──────────────────────────────
# Jen fast-forward a jen když nemáš lokální rozpracované změny, ať se
# nikdy nic nepřepíše ani nevznikne konflikt.
LOCK_BEFORE=""
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  [ -f package-lock.json ] && LOCK_BEFORE=$(shasum package-lock.json | awk '{print $1}')
  echo "🔄 Kontroluji aktualizace…"
  git fetch --quiet 2>/dev/null
  if [ -n "$(git status --porcelain)" ]; then
    echo "   ⚠️  Máš lokální neuložené změny — aktualizaci přeskakuji (nic se nepřepíše)."
  else
    LOCAL=$(git rev-parse @ 2>/dev/null)
    REMOTE=$(git rev-parse @{u} 2>/dev/null)
    if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
      if git merge --ff-only --quiet @{u} 2>/dev/null; then
        echo "   ✅ Aktualizováno na nejnovější verzi."
      else
        echo "   ⚠️  Nejde čistě aktualizovat — spouštím stávající verzi."
      fi
    else
      echo "   ✅ Máš nejnovější verzi."
    fi
  fi
  echo ""
fi

# ── Závislosti ───────────────────────────────────────────────────
# Nainstaluj když chybí, nebo když aktualizace změnila package-lock.
LOCK_AFTER=""
[ -f package-lock.json ] && LOCK_AFTER=$(shasum package-lock.json | awk '{print $1}')
if [ ! -d node_modules ] || [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  echo "📦 Instaluji závislosti…"
  npm install || { echo "❌ npm install selhal."; read -r -p "Enter…" _; exit 1; }
  echo ""
fi

URL="http://localhost:5173"
echo "🚀 Spouštím server na $URL"
echo "   Až se dole objeví 'ready', appka se sama otevře v prohlížeči."
echo "   ⚠️  Tohle okno nech otevřené — zavřením se appka vypne."
echo ""

# Otevři prohlížeč se zpožděním, až server naběhne
( sleep 4; open "$URL" ) &

# Spusť Vite dev server (v popředí, drží okno)
npm run dev
