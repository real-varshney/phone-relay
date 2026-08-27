# Run as Administrator - opens port 3000 on all networks and sets Wi-Fi to Private.
#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$Port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$LogDir = Join-Path $env:LOCALAPPDATA "PhoneRelay"
$Marker = Join-Path $LogDir "firewall.ok"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$ruleName = "Phone Relay TCP $Port"
netsh advfirewall firewall delete rule name="$ruleName" 2>$null | Out-Null
netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$Port enable=yes profile=any | Out-Null

try {
    Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne "Disconnected" } | ForEach-Object {
        Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private -ErrorAction SilentlyContinue
    }
} catch {
    # Ignore if cmdlet unavailable
}

Set-Content -Path $Marker -Value (Get-Date -Format "o") -Encoding utf8
Add-Content -Path (Join-Path $LogDir "launcher.log") -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  Firewall rule added (all profiles); Wi-Fi set to Private if possible." -Encoding utf8

Write-Host "Phone Relay: port $Port is allowed through Windows Firewall."
Write-Host "On your phone browser, try: http://<laptop-ip>:$Port/health"
