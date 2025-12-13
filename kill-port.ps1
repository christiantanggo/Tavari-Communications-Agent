# Quick script to kill process on port 3001 or 5001
$port = 5001
$processes = netstat -ano | findstr ":$port" | ForEach-Object {
    if ($_ -match '\s+(\d+)$') {
        $matches[1]
    }
} | Select-Object -Unique

if ($processes) {
    foreach ($pid in $processes) {
        Write-Host "Killing process $pid on port $port"
        taskkill /PID $pid /F 2>$null
    }
    Write-Host "Port $port is now free"
} else {
    Write-Host "No process found on port $port"
}

