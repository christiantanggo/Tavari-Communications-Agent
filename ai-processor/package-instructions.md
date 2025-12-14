# Packaging Instructions for ai-processor Lambda

## Option 1: Simple PowerShell (Recommended)

Run this from the `backend/ai-processor` directory:

```powershell
# Make sure you're in the ai-processor directory
cd "C:\Users\Christian\Documents\OneDrive.DJ\OneDrive\Apps\Tavari Ai Phone Agent\backend\ai-processor"

# Build TypeScript
npm run build

# Create zip (simple method)
Compress-Archive -Path index.js,package.json,node_modules -DestinationPath function.zip -Force -CompressionLevel Optimal
```

## Option 2: If zip is too large (>50MB)

If the zip file is too large, you may need to use AWS S3 or exclude unnecessary files:

```powershell
# Exclude dev dependencies and source files
Compress-Archive -Path index.js,package.json,node_modules -DestinationPath function.zip -Force -CompressionLevel Optimal
```

## Option 3: Manual zip creation

1. Select `index.js`, `package.json`, and `node_modules` folder
2. Right-click → Send to → Compressed (zipped) folder
3. Rename to `function.zip`

## Troubleshooting

If you get "Could not unzip" error:
1. Check file size - should be under 50MB for direct upload
2. Try creating a new zip file
3. Make sure `index.js` exists (run `npm run build` first)
4. Verify the zip opens correctly in Windows Explorer

