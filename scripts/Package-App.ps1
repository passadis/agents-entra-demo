#Requires -Version 7.0
[CmdletBinding()]
param([string]$OutputPath = (Join-Path $PSScriptRoot '../artifacts/aegean-app.zip'))
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot))
$archivePath = [IO.Path]::GetFullPath($OutputPath)
$null = New-Item -ItemType Directory -Path (Split-Path $archivePath) -Force
$files = @(
  Get-Item -LiteralPath (Join-Path $projectRoot 'package.json')
  Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src'), (Join-Path $projectRoot 'public') -File -Recurse
)
$stream = [IO.File]::Open($archivePath, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
    if ($relative.StartsWith('../') -or [IO.Path]::IsPathRooted($relative)) { throw 'Archive entry is outside the project' }
    $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative)
  }
} finally { $archive.Dispose(); $stream.Dispose() }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
Write-Host "Package: $archivePath"
Write-Host "Files: $($files.Count)"
Write-Host "SHA256: $hash"
Write-Host 'Included: package.json, src/, public/. No credentials, state, or development files.'
