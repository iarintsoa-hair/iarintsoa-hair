# IARINTSOA Hair - serveur de previsualisation locale (ne publie rien sur Internet).
# Lance par Voir-le-site.bat. Sert le dossier du site sur http://localhost:<port>/
# et ouvre la page de verification dans le navigateur. Fermer la fenetre pour arreter.
param([int]$FirstPort = 5501, [switch]$NoBrowser)

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$types = @{
    ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"; ".txt" = "text/plain; charset=utf-8"; ".xml" = "application/xml; charset=utf-8"
    ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".png" = "image/png"; ".svg" = "image/svg+xml"; ".webp" = "image/webp"
    ".ico" = "image/x-icon"; ".mp4" = "video/mp4"; ".woff2" = "font/woff2"
}

# Premier port libre entre 5501 et 5520 (5500 est souvent pris par Live Server de VS Code)
$listener = $null
for ($port = $FirstPort; $port -le $FirstPort + 19; $port++) {
    try {
        $candidate = [System.Net.HttpListener]::new()
        $candidate.Prefixes.Add("http://localhost:$port/")
        $candidate.Prefixes.Add("http://127.0.0.1:$port/")
        $candidate.Start()
        $listener = $candidate
        break
    } catch { }
}
if (-not $listener) { Write-Host "Aucun port libre entre $FirstPort et $($FirstPort + 19)." -ForegroundColor Red; exit 1 }

$siteUrl = "http://localhost:$port/"
Write-Host ""
Write-Host "  IARINTSOA Hair - previsualisation locale" -ForegroundColor Yellow
Write-Host "  ----------------------------------------"
Write-Host "  Accueil du site      : $siteUrl"
Write-Host "  Pages a verifier     : ${siteUrl}outils-local/verification.html"
Write-Host ""
Write-Host "  Le site n'est PAS en ligne : il n'est visible que sur cet ordinateur."
Write-Host "  Laissez cette fenetre ouverte pendant la visite. Fermez-la pour arreter."
Write-Host ""
if (-not $NoBrowser) { Start-Process "${siteUrl}outils-local/verification.html" }

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
        if ($rel -eq '' -or $rel.EndsWith('/')) { $rel = $rel + 'index.html' }
        $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
        $status = 200
        if (-not ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf))) {
            # Comme chez l'hebergeur : page 404 du site pour toute adresse inconnue
            $path = Join-Path $root "404.html"
            $status = 404
        }
        $bytes = [IO.File]::ReadAllBytes($path)
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $ctx.Response.StatusCode = $status
        $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $ctx.Response.Headers.Add("Cache-Control", "no-cache")
        $ctx.Response.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne "HEAD") { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
        Write-Host ("  {0}  {1}" -f $status, $ctx.Request.Url.PathAndQuery) -ForegroundColor DarkGray
    } catch {
        $ctx.Response.StatusCode = 500
    } finally {
        $ctx.Response.Close()
    }
}
