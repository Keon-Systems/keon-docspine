#requires -Version 7.0
<#
.SYNOPSIS
  Seeds a throwaway git history for the DocSpine messy-repo fixture in a
  temporary COPY, including the git-rename that fixture defect #2 depends
  on.

.DESCRIPTION
  Copies fixtures/messy-repo (excluding any .git) to -Target, then builds
  git history there:

    1. Commit the fixture tree with the payments processor at its OLD path
       (src/payments/processor.ts).
    2. `git mv` it to its checked-in path (src/payments/charge-processor.ts).
       `git log --follow` on the new path will show the old path — this is
       what lets a checker classify the doc claim against the old path as
       "moved" instead of "broken" (fixture defect #2).
    3. One further commit touching the same covered path (src/payments/**),
       so the fixture has >= 3 commits touching a covered path (fuel for a
       future drift engine), per the parcel spec.

  NEVER run this against the checked-in fixture tree directly — always pass
  a -Target outside the repo (e.g. under $env:TEMP). This script only
  copies the source tree; it never mutates it.

.PARAMETER Target
  Directory to create the throwaway git repo in. Deleted and recreated if
  it already exists. Defaults to a fresh folder under $env:TEMP.

.EXAMPLE
  pwsh ./setup-fixture-git.ps1 -Target $env:TEMP\docspine-fixture-check
#>
[CmdletBinding()]
param(
    [string]$Target = (Join-Path $env:TEMP ("docspine-fixture-git-" + [guid]::NewGuid().ToString('N').Substring(0, 8)))
)

$ErrorActionPreference = 'Stop'

$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-Git {
    param([string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

Write-Host "Source fixture: $SourceRoot"
Write-Host "Target (throwaway) repo: $Target"

if ((Resolve-Path -LiteralPath $SourceRoot).Path -eq (Resolve-Path -LiteralPath $Target -ErrorAction SilentlyContinue).Path) {
    throw "Target must not be the checked-in fixture tree itself. Pass a separate -Target directory."
}

if (Test-Path -LiteralPath $Target) {
    Write-Host "Removing existing target..."
    Remove-Item -LiteralPath $Target -Recurse -Force
}
New-Item -ItemType Directory -Path $Target -Force | Out-Null

# Copy everything except any pre-existing .git (there should never be one in
# the checked-in tree, but be defensive about it).
Get-ChildItem -LiteralPath $SourceRoot -Force |
    Where-Object { $_.Name -ne '.git' } |
    ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Target $_.Name) -Recurse -Force
    }

Push-Location $Target
try {
    Invoke-Git @('init', '-q', '-b', 'main')
    Invoke-Git @('config', 'user.email', 'fixture@docspine.invalid')
    Invoke-Git @('config', 'user.name', 'DocSpine Fixture Seeder')

    $newPath = 'src/payments/charge-processor.ts'
    $oldPath = 'src/payments/processor.ts'

    if (-not (Test-Path -LiteralPath $newPath)) {
        throw "Expected fixture file not found: $newPath"
    }

    # Step 1: simulate the pre-rename state and commit it.
    Move-Item -LiteralPath $newPath -Destination $oldPath
    Invoke-Git @('add', '-A')
    Invoke-Git @('commit', '-q', '-m', 'Initial import of messy-repo fixture (pre-rename state)')

    # Step 2: perform the rename that fixture defect #2 depends on.
    Invoke-Git @('mv', $oldPath, $newPath)
    Invoke-Git @('commit', '-q', '-m', 'Rename payments processor.ts -> charge-processor.ts')

    # Step 3: a further commit touching the same covered path
    # (src/payments/**), so this fixture has >= 3 commits touching a
    # covered path.
    Add-Content -LiteralPath $newPath -Value "`n// fixture: post-rename null-check added"
    Invoke-Git @('add', $newPath)
    Invoke-Git @('commit', '-q', '-m', 'Add null-check to processCharge')

    Write-Host ""
    Write-Host "Seeded git history in: $Target"
    Write-Host ""
    Write-Host "git log --follow $newPath ->"
    & git log --follow --oneline -- $newPath
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "OK: fixture git history seeded at $Target"
exit 0