# PowerShell script to kill process on port 5001
$port = 5001
Write-Host "Looking for process using port $port..." -ForegroundColor Yellow

$connections = netstat -ano | findstr ":$port"
if ($connections) {
    $processIds = $connections | ForEach-Object {
        if ($_ -match '\s+(\d+)$') {
            $matches[1]
        }
    } | Select-Object -Unique
    
    foreach ($processId in $processIds) {
        if ($processId) {
            Write-Host "Killing process $processId..." -ForegroundColor Red
            taskkill /F /PID $processId 2>$null | Out-Null
        }
    }
    Start-Sleep -Seconds 1
    Write-Host "✅ Port $port should now be free!" -ForegroundColor Green
} else {
    Write-Host "✅ Port $port is already free!" -ForegroundColor Green
}
