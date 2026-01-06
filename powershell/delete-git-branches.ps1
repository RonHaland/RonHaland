# delete-git-branches.ps1
# Usage: ./delete-git-branches.ps1 "pattern"

param(
    [Parameter(Mandatory=$true)]
    [string]$Pattern
)

# Get current branch name
$currentBranch = git branch --show-current

# Get all branches matching the pattern (local branches only)
$branches = git branch | Where-Object { $_ -match $Pattern } | ForEach-Object { 
    $_.Trim() -replace '^\*\s*', '' 
} | Where-Object { 
    $_ -ne $currentBranch -and $_ -ne "" 
}

if ($branches.Count -eq 0) {
    Write-Host "No branches found matching pattern: $Pattern" -ForegroundColor Yellow
    exit 0
}

Write-Host "`nBranches matching pattern '$Pattern' that will be deleted:" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
foreach ($branch in $branches) {
    Write-Host "  - $branch" -ForegroundColor Yellow
}
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Total: $($branches.Count) branch(es)" -ForegroundColor Cyan
Write-Host "`nCurrent branch '$currentBranch' will NOT be deleted." -ForegroundColor Green

$confirmation = Read-Host "`nAre you sure you want to delete these branches? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host "`nDeleting branches..." -ForegroundColor Cyan
$deleted = 0
$failed = 0

foreach ($branch in $branches) {
    try {
        git branch -D $branch 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Deleted: $branch" -ForegroundColor Yellow
            $deleted++
        } else {
            Write-Host "  ✗ Failed to delete: $branch" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "  ✗ Error deleting $branch : $_" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`n"("=" * 60) -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Deleted: $deleted" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "  Failed: $failed" -ForegroundColor Red
}
Write-Host ("=" * 60) -ForegroundColor Cyan