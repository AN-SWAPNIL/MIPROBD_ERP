param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifacts = [IO.Path]::GetFullPath((Join-Path $workspace 'artifacts'))
$prefix = $artifacts + [IO.Path]::DirectorySeparatorChar

function Assert-ArtifactPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup target is outside artifacts.' }
    $relative = $full.Substring($prefix.Length)
    if ($relative -match '^(private|backups|releases|worktrees|certificates-source|client-landing-pdfs|opening|hosted-auth|hosted-config|requirements-text|update1-print-assets)([\\/]|$)') { throw 'Protected artifact path.' }
}

function Get-SafeFiles([string]$Path) {
    Assert-ArtifactPath $Path
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($Path)
    while ($pending.Count -gt 0) {
        $directory = Get-Item -LiteralPath $pending.Pop() -Force
        if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cleanup refuses symbolic links and junctions.' }
        foreach ($entry in Get-ChildItem -LiteralPath $directory.FullName -Force) {
            Assert-ArtifactPath $entry.FullName
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cleanup refuses symbolic links and junctions.' }
            if ($entry.PSIsContainer) { $pending.Push($entry.FullName) } else { $entry }
        }
    }
}

if (-not (Test-Path -LiteralPath $artifacts)) { Write-Output 'No generated artifacts to clean.'; exit 0 }
if ((Get-Item -LiteralPath $artifacts -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The artifacts root must not be a symbolic link or junction.' }
$directories = @()
$backend = Join-Path $artifacts 'backend'
if (Test-Path -LiteralPath $backend) {
    $directories = @(Get-ChildItem -LiteralPath $backend -Directory | Where-Object { $_.Name -match '(^|-)build$' })
}
$files = [Collections.Generic.List[object]]::new()
foreach ($entry in Get-ChildItem -LiteralPath $artifacts -File) {
    if ($entry.Extension -match '^\.(png|jpe?g|webp)$') {
        Assert-ArtifactPath $entry.FullName
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cleanup refuses symbolic links.' }
        $files.Add($entry)
    }
}
foreach ($name in @('backend', 'public-smoke', 'website-content-smoke', 'employee-report', 'sales-lifecycle')) {
    $folder = Join-Path $artifacts $name
    if (-not (Test-Path -LiteralPath $folder)) { continue }
    foreach ($entry in Get-SafeFiles $folder) {
        $inBuild = $false
        foreach ($directory in $directories) {
            if ($entry.FullName.StartsWith($directory.FullName + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { $inBuild = $true; break }
        }
        if (-not $inBuild -and $entry.Extension -match '^\.(png|jpe?g|webp)$') { $files.Add($entry) }
    }
}
$bytes = [long]0
foreach ($file in $files) { $bytes += $file.Length }
foreach ($directory in $directories) {
    foreach ($file in Get-SafeFiles $directory.FullName) { $bytes += $file.Length }
}
$report = [ordered]@{ applied = [bool]$Apply; screenshotFiles = $files.Count; generatedBuildDirectories = $directories.Count; sizeMiB = [Math]::Round($bytes / 1MB, 2); preserved = @('credentials', 'backups', 'recovery evidence', 'release snapshots', 'source assets', 'requirements', 'worktrees', 'logs') }
if ($Apply) {
    $manifestFolder = Join-Path $artifacts 'private/cleanup-manifests'
    New-Item -ItemType Directory -Path $manifestFolder -Force | Out-Null
    $manifest = [ordered]@{ cleanedAt = [DateTime]::UtcNow.ToString('o'); files = @($files | ForEach-Object { $_.FullName.Substring($prefix.Length) }); directories = @($directories | ForEach-Object { $_.FullName.Substring($prefix.Length) }) }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $manifestFolder ('test-artifacts-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff') + '.json')) -Encoding UTF8
    foreach ($directory in $directories) {
        Assert-ArtifactPath $directory.FullName
        Remove-Item -LiteralPath $directory.FullName -Recurse -Force
    }
    foreach ($file in $files) {
        Assert-ArtifactPath $file.FullName
        Remove-Item -LiteralPath $file.FullName -Force
    }
}
$report | ConvertTo-Json -Depth 3
