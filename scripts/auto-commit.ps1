# Auto-commit script for automatic deployments (PowerShell)
# This script commits all changes and pushes to main branch

# Get the current branch
$branch = git rev-parse --abbrev-ref HEAD

# Check if there are any changes
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "No changes to commit"
    exit 0
}

# Generate commit message based on changed files
$changedFiles = git diff --name-only HEAD
$fileList = ($changedFiles | Select-Object -First 3) -join ', '
$fileCount = ($changedFiles | Measure-Object -Line).Lines

if ($fileCount -le 3) {
    $commitMsg = "Auto-commit: Update $fileList"
} else {
    $commitMsg = "Auto-commit: Update $fileCount files"
}

# Add all changes
git add -A

# Commit with message
git commit -m $commitMsg

# Push to current branch
git push origin $branch

Write-Host "✅ Auto-committed and pushed to $branch"

