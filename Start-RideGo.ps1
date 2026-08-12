$ErrorActionPreference = "Stop"
$rideGoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $rideGoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js was not found. RideGo requires Node.js 18 or newer." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 18) {
    Write-Host "RideGo requires Node.js 18 or newer." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$rideGoPort = 3000
while ($rideGoPort -lt 3100) {
    $listener = Get-NetTCPConnection -LocalPort $rideGoPort -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) {
        break
    }
    $rideGoPort++
}

if ($rideGoPort -ge 3100) {
    Write-Host "No free local port was found between 3000 and 3099." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$env:PORT = [string]$rideGoPort

Write-Host ""
Write-Host "RideGo is starting..." -ForegroundColor Yellow
Write-Host "Open http://localhost:$rideGoPort in your browser." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor DarkGray
Write-Host ""

node server.cjs
