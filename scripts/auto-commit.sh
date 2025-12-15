#!/bin/bash
# Auto-commit script for automatic deployments
# This script commits all changes and pushes to main branch

set -e

# Get the current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Check if there are any changes
if [ -z "$(git status --porcelain)" ]; then
    echo "No changes to commit"
    exit 0
fi

# Generate commit message based on changed files
CHANGED_FILES=$(git diff --name-only HEAD)
COMMIT_MSG="Auto-commit: Update $(echo "$CHANGED_FILES" | head -3 | tr '\n' ', ' | sed 's/,$//')"

# If more than 3 files, add count
FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l)
if [ "$FILE_COUNT" -gt 3 ]; then
    COMMIT_MSG="Auto-commit: Update $FILE_COUNT files"
fi

# Add all changes
git add -A

# Commit with message
git commit -m "$COMMIT_MSG"

# Push to current branch
git push origin "$BRANCH"

echo "✅ Auto-committed and pushed to $BRANCH"

