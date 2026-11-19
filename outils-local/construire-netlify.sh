#!/usr/bin/env bash
# IARINTSOA Hair - construction automatique sur Netlify (mise en ligne depuis GitHub).
# Copie le site dans _site SANS les outils locaux ni les fichiers inutiles.
# L'administration (admin/) est incluse : elle sert à modifier la boutique en ligne.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site
for item in *; do
    case "$item" in
        outils-local|publication|_site|node_modules) continue ;;
        *.bat|*.txt|*.md|*.ps1|*.sh|netlify.toml|style.css|visual-effects.css) [ "$item" = "robots.txt" ] || continue ;;
    esac
    cp -R "$item" _site/
done
rm -f _site/js/visual-effects.js
# Contrôle : aucun outil local ne doit partir en ligne
if find _site -iname '*serveur-local*' -o -iname '*verification*' -o -iname '*.bat' -o -iname '*.ps1' | grep -q .; then
    echo "ERREUR : fichier interne trouvé dans _site" >&2
    exit 1
fi
echo "Site prêt : $(find _site -type f | wc -l) fichiers"
