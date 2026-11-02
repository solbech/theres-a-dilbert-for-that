# Finds each strip in an archive by the YYYY-MM-DD in its filename and writes
# archive-index.js next to this script. The Windows version of index-archive.command.
# Usage: double-click index-archive.bat, or run this with the archive folder as an argument.
param([string]$Root)
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
if (-not $Root) {
  $Root = (Read-Host "Archive folder (press Return for $here)").Trim().Trim('"')
  if (-not $Root) { $Root = $here }
}
if (-not (Test-Path -LiteralPath $Root -PathType Container)) { Write-Host "Can't open that folder: $Root"; exit 1 }
$Root = (Resolve-Path -LiteralPath $Root).ProviderPath.TrimEnd('\')

Write-Host "Scanning $Root ..."
$images = '.gif', '.jpg', '.jpeg', '.png'
$paths = Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $images -contains $_.Extension.ToLowerInvariant() } |
  ForEach-Object { $_.FullName.Substring($Root.Length + 1).Replace('\', '/') } |
  Where-Object { $_ -notmatch '(^|/)(@eaDir|\.[^/]*)(/|$)' } |
  Sort-Object

$files = @{}
$atStart = @{}
$dups = @{}
foreach ($path in $paths) {
  $name = $path.Substring($path.LastIndexOf('/') + 1)
  $match = [regex]::Match($name, '(?<![0-9])[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])(?![0-9])')
  if (-not $match.Success) { continue }
  $date = $match.Value
  $start = $match.Index -eq 0
  if ($files.ContainsKey($date)) {
    $dups[$date] = $true
    if (-not $start -or $atStart[$date]) { continue }
  }
  $files[$date] = $path
  $atStart[$date] = $start
}

if ($files.Count -eq 0) { Write-Host 'No strips found. Filenames need a date like 2010-09-01.'; exit 1 }
$json = @{ root = $Root; files = $files } | ConvertTo-Json -Compress
$out = Join-Path $here 'archive-index.js'
[IO.File]::WriteAllText($out, "window.ARCHIVE_INDEX=$json;`n", (New-Object Text.UTF8Encoding $false))
Write-Host "Found $($files.Count) dated files. Wrote $out"

$data = Join-Path $here 'data.js'
if (Test-Path -LiteralPath $data) {
  $known = [regex]::Matches([IO.File]::ReadAllText($data), '"date":"([0-9-]*)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  $missing = @($known | Where-Object { -not $files.ContainsKey($_) })
  Write-Host "Strips the app knows: $(@($known).Count). Missing from this archive: $($missing.Count)."
  $missing | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
}
if ($dups.Count) {
  Write-Host "Dates with more than one file, using one of them: $($dups.Count)."
  $dups.Keys | Sort-Object | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
}
