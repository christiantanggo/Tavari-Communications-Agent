# PowerShell script to create a proper Lambda deployment package
# Run this from the ai-processor directory

# Remove old zip if exists
if (Test-Path "function.zip") {
    Remove-Item "function.zip" -Force
}

# Create zip with proper structure
$filesToInclude = @(
    "index.js",
    "package.json"
)

# Add files to zip
Compress-Archive -Path $filesToInclude -DestinationPath "function.zip" -Force

# Add node_modules (this might take a while)
$tempZip = "function-temp.zip"
if (Test-Path $tempZip) {
    Remove-Item $tempZip -Force
}

# Use .NET compression for better compatibility
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open((Resolve-Path "function.zip"), [System.IO.Compression.ZipArchiveMode]::Update)

# Add node_modules directory
$nodeModulesPath = "node_modules"
if (Test-Path $nodeModulesPath) {
    Get-ChildItem -Path $nodeModulesPath -Recurse | ForEach-Object {
        $relativePath = $_.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relativePath) | Out-Null
    }
}

$zip.Dispose()

Write-Host "Zip file created: function.zip"
Write-Host "File size: $((Get-Item function.zip).Length / 1MB) MB"

