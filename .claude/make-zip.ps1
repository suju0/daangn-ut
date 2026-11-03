# Build daangn-my-src.zip from the requested manifest.
# Entry names use forward slashes per ZIP APPNOTE 4.4.17.1 so that
# macOS / Linux extractors preserve the directory structure.
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads a BOM-less .ps1
# as the system ANSI codepage, so non-ASCII comments corrupt parsing.

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = 'C:\Users\user\Desktop\Daangn'
$zip  = Join-Path $root 'daangn-my-src.zip'

$files = @(
  'src/index.html',
  'src/css/style.css',
  'src/css/fonts.css',
  'src/js/app.js',
  'src/assets/icons/sprite.svg',
  'src/assets/img/daangnpay-wordmark.png',
  'src/assets/fonts/Pretendard-Regular.subset.woff2',
  'src/assets/fonts/Pretendard-SemiBold.subset.woff2',
  'src/assets/fonts/Pretendard-Bold.subset.woff2'
)

$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::CreateNew)
$ar = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
$n = 0
foreach ($rel in $files) {
  $parts = $rel.Split([char]47)
  $src = $root
  foreach ($p in $parts) { $src = Join-Path $src $p }
  if (-not (Test-Path -LiteralPath $src)) { throw "missing source file: $src" }
  $entry = $ar.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $out = $entry.Open()
  $in = [System.IO.File]::OpenRead($src)
  $in.CopyTo($out)
  $in.Dispose()
  $out.Dispose()
  $n = $n + 1
  Write-Output ("  added {0}" -f $rel)
}
$ar.Dispose()
$fs.Dispose()
Write-Output ("done: {0} entries, {1} bytes" -f $n, (Get-Item $zip).Length)
