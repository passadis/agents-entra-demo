#Requires -Version 7.0
[CmdletBinding()]
param([string]$OutputPath=(Join-Path $PSScriptRoot '../artifacts/aegean-agentic.zip'))
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot))
$archivePath=[IO.Path]::GetFullPath($OutputPath)
$null=New-Item -ItemType Directory -Path (Split-Path $archivePath) -Force
$files=@(Get-Item (Join-Path $root 'requirements.txt'),(Join-Path $root '.deployment'),(Join-Path $root 'public/styles.css'); Get-ChildItem (Join-Path $root 'backend') -File -Filter '*.py'; Get-ChildItem (Join-Path $root 'agentic-public') -File)
$stream=[IO.File]::Open($archivePath,[IO.FileMode]::Create)
$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try { foreach($file in $files) { $relative=[IO.Path]::GetRelativePath($root,$file.FullName).Replace('\','/'); if($relative.StartsWith('../')){throw 'Package entry outside repository'}; $null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative) } }
finally { $archive.Dispose();$stream.Dispose() }
Write-Host "Agentic package: $archivePath ($($files.Count) files)"
Write-Host "SHA256: $((Get-FileHash $archivePath -Algorithm SHA256).Hash)"
Write-Host 'No credentials, model fixtures, session state, local environments, or legacy Node application included.'
