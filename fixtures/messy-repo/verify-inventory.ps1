#requires -Version 7.0
<#
.SYNOPSIS
  Structural verifier for the messy-repo fixture itself (not a DocSpine
  test — no DocSpine code exists yet to test against).

.DESCRIPTION
  Confirms EXPECTED-FINDINGS.md is internally consistent:
    - every "Doc Path" cell in its table resolves to a real file under
      fixtures/messy-repo/
    - every "Expected Status" cell is a member of the closed FindingStatus
      union (ok | broken | moved | unverifiable)
    - defect numbers 1..13 each appear in at least one row

.EXAMPLE
  pwsh ./verify-inventory.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$OracleFile = Join-Path $Root 'EXPECTED-FINDINGS.md'

if (-not (Test-Path -LiteralPath $OracleFile)) {
    Write-Error "Missing oracle file: $OracleFile"
    exit 1
}

$lines = Get-Content -LiteralPath $OracleFile

# Pull markdown table rows that look like "| 1 | docs/canon/payments.md | ... |"
# from the "## Findings" table only. Skip the header row and the
# "---|---|---" separator row, and stop once we leave the table (blank
# line / next heading) so we don't also parse the "Defect index" table.
$rows = @()
$inFindingsTable = $false
foreach ($line in $lines) {
    $trimmed = $line.Trim()

    if ($trimmed -eq '## Findings') {
        $inFindingsTable = $true
        continue
    }
    if ($inFindingsTable -and $trimmed.StartsWith('## ')) {
        break
    }
    if (-not $inFindingsTable) { continue }
    if (-not $trimmed.StartsWith('|')) { continue }
    if ($trimmed -match '^\|\s*-+\s*\|') { continue }        # separator row
    if ($trimmed -match '^\|\s*Defect\s*#') { continue }     # header row

    $cells = $trimmed.Trim('|') -split '\|' | ForEach-Object { $_.Trim() }
    if ($cells.Count -lt 5) { continue }

    $rows += [pscustomobject]@{
        Defect       = $cells[0]
        DocPath      = $cells[1]
        ClaimKind    = $cells[2]
        Status       = $cells[3]
        DetailSubstr = $cells[4]
    }
}

if ($rows.Count -eq 0) {
    Write-Error "No data rows parsed out of the Findings table in $OracleFile -- table format changed?"
    exit 1
}

Write-Host "Parsed $($rows.Count) EXPECTED-FINDINGS rows."

$errors = New-Object System.Collections.Generic.List[string]

# 1. Every row's doc path must exist under fixtures/messy-repo/.
foreach ($row in $rows) {
    $resolved = Join-Path $Root $row.DocPath
    if (-not (Test-Path -LiteralPath $resolved)) {
        $errors.Add("Defect $($row.Defect): doc path does not exist: $($row.DocPath)")
    }
}

# 2. Expected status must be one of the closed FindingStatus values.
$allowedStatus = @('ok', 'broken', 'moved', 'unverifiable')
foreach ($row in $rows) {
    if ($row.Status -notin $allowedStatus) {
        $errors.Add("Defect $($row.Defect): expected status '$($row.Status)' is not in the closed FindingStatus union (ok|broken|moved|unverifiable)")
    }
}

# 3. Every defect number 1..13 appears at least once.
$seenDefects = $rows | ForEach-Object { $_.Defect } | Sort-Object -Unique
for ($i = 1; $i -le 13; $i++) {
    if ($i.ToString() -notin $seenDefects) {
        $errors.Add("Defect #$i does not appear in any EXPECTED-FINDINGS row")
    }
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "FAILED: $($errors.Count) problem(s) found:" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Red }
    exit 1
}

Write-Host ""
Write-Host "OK: all $($rows.Count) rows resolve, defects 1-13 all present, statuses closed." -ForegroundColor Green
exit 0