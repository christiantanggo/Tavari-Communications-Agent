# Auto-Commit Setup

This project includes automation to automatically commit and push changes, eliminating the need for manual git operations.

## Quick Start

After making code changes, simply run:

**On Windows (PowerShell):**
```powershell
.\scripts\auto-commit.ps1
```

**On Mac/Linux:**
```bash
chmod +x scripts/auto-commit.sh
./scripts/auto-commit.sh
```

**Or use npm:**
```bash
npm run auto-commit
# or
npm run deploy
```

## How It Works

### Option 1: Manual Script (Recommended)
Run the auto-commit script after making changes:
- **Windows**: `.\scripts\auto-commit.ps1`
- **Mac/Linux**: `./scripts/auto-commit.sh`
- **npm**: `npm run auto-commit`

The script will:
1. Check for uncommitted changes
2. Stage all changes (`git add -A`)
3. Create a commit with a descriptive message
4. Push to the current branch (usually `main`)

### Option 2: GitHub Actions (Scheduled)
A GitHub Action workflow (`.github/workflows/auto-commit.yml`) can automatically check for changes every 5 minutes and commit them.

**Setup:**
1. Go to GitHub → Settings → Secrets and variables → Actions
2. Add a secret: `GITHUB_TOKEN_AUTOCOMMIT` with a Personal Access Token (PAT) that has `repo` permissions
3. The workflow will run automatically every 5 minutes

**Manual Trigger:**
- Go to GitHub → Actions → "Auto-Commit Changes" → Run workflow

## For AI Agents (Cursor, etc.)

If you're using an AI coding assistant like Cursor, you can:

1. **After AI makes changes, run:**
   ```bash
   npm run auto-commit
   ```

2. **Or set up a post-edit hook** (if your editor supports it)

3. **Or use the GitHub Action** to periodically check and commit changes

## Integration with Deployment

Once changes are committed and pushed:
- **Railway** automatically detects the push and deploys the backend
- **Vercel** automatically detects the push and deploys the frontend
- No manual deployment steps needed!

## Troubleshooting

### Script fails with "No changes to commit"
- This is normal if there are no uncommitted changes
- The script will exit successfully

### Script fails with permission errors
- Make sure you have write access to the repository
- Check that your git credentials are configured

### GitHub Action doesn't commit
- Verify `GITHUB_TOKEN_AUTOCOMMIT` secret is set
- Check the Actions tab for error messages
- The workflow uses `[skip ci]` to avoid triggering other workflows

## Best Practices

1. **Review changes before auto-committing** - The script commits all changes, so make sure you want to commit everything
2. **Use descriptive commit messages** - The script generates messages, but you can modify them
3. **Test locally first** - Always test changes before committing
4. **Monitor deployments** - Check Railway/Vercel dashboards after auto-commits

## Customization

You can modify the commit message format in:
- `scripts/auto-commit.sh` (line with `COMMIT_MSG`)
- `scripts/auto-commit.ps1` (line with `$commitMsg`)
- `.github/workflows/auto-commit.yml` (step "Commit and push changes")

