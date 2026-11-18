# IARINTSOA Hair - prepare le dossier "publication" a deposer sur Netlify.
# Copie le site SANS : outils locaux, page d'administration, fichiers inutiles.
# Usage : clic droit > Executer avec PowerShell (ou via Publier-le-site.bat).
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$out = Join-Path $root "publication"

# Fichiers et dossiers jamais publies
# (admin : l'administration ne fonctionne qu'avec la mise en ligne automatique GitHub + Netlify, voir netlify.toml)
$skipDirs = @(".git", "outils-local", "publication", ".netlify", ".claude", "admin", "_site")
$skipFiles = @("Voir-le-site.bat", "Publier-le-site.bat", "netlify.toml",
               "style.css", "visual-effects.css", "Nouveau Document texte.txt", ".gitignore")
$skipJs = @("visual-effects.js")

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

$count = 0
Get-ChildItem $root -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    $top = $rel.Split('\')[0]
    if ($skipDirs -contains $top) { return }
    if ($skipFiles -contains $rel) { return }
    if ($rel -like "js\*" -and $skipJs -contains $_.Name) { return }
    $target = Join-Path $out $rel
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item $_.FullName $target
    $count++
}

# En-tetes de securite et de cache (lus par Netlify)
$headers = @"
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/image/*
  Cache-Control: public, max-age=604800

/data/*
  Cache-Control: public, max-age=0, must-revalidate
"@
[IO.File]::WriteAllText((Join-Path $out "_headers"), $headers.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))

# Verification : rien d'interne ne doit partir en ligne
$forbidden = Get-ChildItem $out -Recurse -File | Where-Object { $_.FullName.Substring($out.Length) -match "admin|serveur-local|verification|Voir-le-site" }
$size = (Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ""
Write-Host "  Dossier pret : $out" -ForegroundColor Yellow
Write-Host ("  {0} fichiers, {1:N1} Mo" -f ($count + 1), $size)
if ($forbidden) { Write-Host "  ATTENTION, fichiers internes trouves : $($forbidden.Name -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "  Aucun fichier interne (administration, outils locaux) : OK" -ForegroundColor Green
Write-Host ""
Write-Host "  Etape suivante : sur https://app.netlify.com/projects/iarintsoa-hair/deploys"
Write-Host "  faites glisser le dossier 'publication' dans la zone de depot."
Write-Host ""
