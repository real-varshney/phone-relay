# Shared Phone Relay launcher helpers (start.ps1, tray.ps1).
$ErrorActionPreference = "Continue"

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
Set-Location $RepoRoot

if (-not $Port) { $Port = if ($env:PORT) { [int]$env:PORT } else { 3000 } }
if (-not $DashboardUrl) { $DashboardUrl = "http://127.0.0.1:$Port" }
if (-not $TunnelName) { $TunnelName = "phone-relay" }
if (-not $LogDir) { $LogDir = Join-Path $env:LOCALAPPDATA "PhoneRelay" }
if (-not $LogFile) { $LogFile = Join-Path $LogDir "launcher.log" }

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message" -Encoding utf8
}

function Get-UseDevTunnel {
    if ($env:USE_DEV_TUNNEL -eq "1") { return $true }
    $envFile = Join-Path $RepoRoot ".env"
    if (Test-Path $envFile) {
        $envLines = Get-Content $envFile -ErrorAction SilentlyContinue
        if ($envLines -match '^\s*USE_DEV_TUNNEL\s*=\s*1') { return $true }
    }
    return $false
}

function Test-ServerUp {
    try {
        $null = Invoke-WebRequest -Uri $DashboardUrl -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

function Ensure-FirewallRule {
    $marker = Join-Path $LogDir "firewall.ok"
    if (Test-Path $marker) { return $true }

    $ruleName = "Phone Relay TCP $Port"
    $check = netsh advfirewall firewall show rule name="$ruleName" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Set-Content -Path $marker -Value (Get-Date -Format "o") -Encoding utf8
        return $true
    }

    Write-Log "Firewall rule missing - requesting administrator approval (one-time UAC prompt)."
    $fixScript = Join-Path $PSScriptRoot "fix-firewall.ps1"
    try {
        Start-Process powershell.exe -Verb RunAs -ArgumentList @(
            "-Sta", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$fixScript`""
        ) -Wait -ErrorAction Stop
    } catch {
        Write-Log "Firewall elevation declined or failed: $($_.Exception.Message)"
        return $false
    }

    if (Test-Path $marker) { return $true }
    Write-Log "Firewall rule still missing after elevation - run shortcut/Fix Firewall.bat manually."
    return $false
}

function Find-DevTunnel {
    $cmd = Get-Command devtunnel -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $winget = Join-Path ${env:LOCALAPPDATA} "Microsoft\WinGet\Links\devtunnel.exe"
    if (Test-Path $winget) { return $winget }
    return $null
}

function Invoke-DevTunnelCli {
    param([string]$Exe, [string[]]$TunnelArgs)
    $proc = Start-Process -FilePath $Exe -ArgumentList $TunnelArgs -WindowStyle Hidden -PassThru -Wait
    return $proc.ExitCode
}

function Get-DevTunnelPublicUrl {
    param([string]$Exe)
    $null = Invoke-DevTunnelCli $Exe @("create", $TunnelName, "--allow-anonymous")
    $null = Invoke-DevTunnelCli $Exe @("port", "create", $TunnelName, "-p", "$Port")
    $json = & $Exe show $TunnelName --json 2>$null
    if (-not $json) { return $null }
    try {
        $obj = $json | ConvertFrom-Json
        $tid = $obj.tunnel.tunnelId
        $cluster = $obj.tunnel.clusterId
        if ($tid -and $cluster) {
            return "https://${tid}-${Port}.${cluster}.devtunnels.ms"
        }
    } catch {
        return $null
    }
    return $null
}

function Update-EnvPublicUrl {
    param([string]$Url)
    $envFile = Join-Path $RepoRoot ".env"
    $lines = @()
    if (Test-Path $envFile) {
        $lines = Get-Content $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch '^\s*PUBLIC_URL\s*=' }
    }
    $lines += "PUBLIC_URL=$Url"
    Set-Content -Path $envFile -Value ($lines -join "`n") -Encoding utf8
    $env:PUBLIC_URL = $Url
}

function Clear-EnvPublicUrl {
    $envFile = Join-Path $RepoRoot ".env"
    if (-not (Test-Path $envFile)) { return }
    $lines = Get-Content $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch '^\s*PUBLIC_URL\s*=' }
    if ($lines.Count -gt 0) {
        Set-Content -Path $envFile -Value ($lines -join "`n") -Encoding utf8
    } else {
        Remove-Item $envFile -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:PUBLIC_URL -ErrorAction SilentlyContinue
}

function Start-HiddenProcess {
    param([string]$FilePath, [string[]]$ProcessArgs, [string]$WorkingDirectory = $RepoRoot)
    Start-Process -FilePath $FilePath -ArgumentList $ProcessArgs -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
}

function Start-DevTunnelHost {
    param([string]$Exe)
    Start-HiddenProcess $Exe @("host", $TunnelName, "-p", "$Port", "--allow-anonymous")
}

function Start-Backend {
    Ensure-FirewallRule
    $backendArgs = @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command",
        "Set-Location '$RepoRoot'; `$env:PORT='$Port'; if (-not `$env:USE_DEV_TUNNEL) { Remove-Item Env:PUBLIC_URL -ErrorAction SilentlyContinue }; npm run dev 2>&1 | Out-File -FilePath '$LogFile' -Append -Encoding utf8"
    )
    Start-HiddenProcess "powershell.exe" $backendArgs
}

function Open-Dashboard {
    param(
        [string]$Path = "/"
    )
    $targetUrl = if ($Path.StartsWith("http")) { $Path } else { "$DashboardUrl$Path" }
    $chromePaths = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    $chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($chrome) {
        # New window avoids reusing a proxy tab where the extension still has routing/inject active.
        Start-Process $chrome @("--new-window", $targetUrl)
    } else {
        Start-Process $targetUrl
    }
}

function Stop-PhoneRelay {
    Write-Log "Stop requested from tray."
    $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING"
    foreach ($line in $lines) {
        $procId = ($line -split '\s+')[-1]
        if ($procId -match '^\d+$') {
            taskkill /PID $procId /F 2>$null | Out-Null
            Write-Log "Stopped PID $procId on port $Port."
        }
    }
    Get-Process -Name "devtunnel" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Start-PhoneRelayCore {
    param([switch]$OpenChrome)

    $UseDevTunnel = Get-UseDevTunnel
    Write-Log "Start-PhoneRelayCore (LAN mode=$([bool](-not $UseDevTunnel)))."

    if (Test-ServerUp) {
        Write-Log "Backend already running."
        if ($OpenChrome) { Open-Dashboard }
        return $true
    }

    if ($UseDevTunnel) {
        Write-Log "USE_DEV_TUNNEL=1 - starting Dev Tunnel."
        $devtunnel = Find-DevTunnel
        if ($devtunnel) {
            $tunnelUrl = Get-DevTunnelPublicUrl $devtunnel
            if ($tunnelUrl) {
                Write-Log "Public URL: $tunnelUrl"
                Update-EnvPublicUrl $tunnelUrl
                Start-DevTunnelHost $devtunnel
                Start-Sleep -Seconds 2
            } else {
                Write-Log "Dev Tunnel failed - falling back to LAN IP."
                Clear-EnvPublicUrl
            }
        } else {
            Clear-EnvPublicUrl
        }
    } else {
        Write-Log "Same Wi-Fi mode - QR uses laptop LAN IP."
        Clear-EnvPublicUrl
    }

    Write-Log "Starting backend."
    Start-Backend

    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if (Test-ServerUp) {
            Write-Log "Backend ready."
            if ($OpenChrome) { Open-Dashboard }
            return $true
        }
        Start-Sleep -Seconds 1
    }

    Write-Log "Backend did not start within 60s."
    return $false
}
