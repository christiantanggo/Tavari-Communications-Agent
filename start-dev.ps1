# PowerShell script to start dev server (kills old process first)
Write-Host "🚀 Starting development server..." -ForegroundColor Cyan

# Kill any process on port 5001
$port = 5001
$connections = netstat -ano | findstr ":$port"
if ($connections) {
    $processIds = $connections | ForEach-Object {
        if ($_ -match '\s+(\d+)$') {
            $matches[1]
        }
    } | Select-Object -Unique
    
    foreach ($processId in $processIds) {
        if ($processId) {
            Write-Host "Killing old process $processId on port $port..." -ForegroundColor Yellow
            taskkill /F /PID $processId 2>$null | Out-Null
        }
    }
    Start-Sleep -Seconds 2
}

# Verify port is free
$stillRunning = netstat -ano | findstr ":$port"
if ($stillRunning) {
    Write-Host "⚠️  Warning: Port $port may still be in use. Trying again..." -ForegroundColor Yellow
    $processIds = $stillRunning | ForEach-Object {
        if ($_ -match '\s+(\d+)$') {
            $matches[1]
        }
    } | Select-Object -Unique
    foreach ($processId in $processIds) {
        if ($processId) {
            taskkill /F /PID $processId 2>$null | Out-Null
        }
    }
    Start-Sleep -Seconds 2
}

# Start the dev server
Write-Host "Starting npm run dev..." -ForegroundColor Green
npm run dev

