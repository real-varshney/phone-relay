# System tray icon - start/stop Phone Relay from the notification area.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "relay-lib.ps1")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$mutex = New-Object System.Threading.Mutex($false, "Global\PhoneRelayTray")
$ownsMutex = $false
try {
    $ownsMutex = $mutex.WaitOne(0, $false)
} catch {
    $ownsMutex = $false
}

if (-not $ownsMutex) {
    if (Test-ServerUp) { Open-Dashboard }
    exit 0
}

$iconPath = Join-Path $PSScriptRoot "phone-relay.ico"
if (-not (Test-Path $iconPath)) {
    & powershell.exe -Sta -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "create-icon.ps1")
}

$ok = Start-PhoneRelayCore -OpenChrome
$fwOk = Ensure-FirewallRule
if (-not $ok) {
    [System.Windows.Forms.MessageBox]::Show(
        "Phone Relay backend did not start.`n`nLog:`n$LogFile",
        "Phone Relay",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    exit 1
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = New-Object System.Drawing.Icon($iconPath)
$notify.Text = "Phone Relay - running"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add("Open dashboard")
$portalItem = $menu.Items.Add("Open portal")
$stopItem = $menu.Items.Add("Stop Phone Relay")
$menu.Items.Add("-") | Out-Null
$exitItem = $menu.Items.Add("Exit tray")

$openItem.Add_Click({ Open-Dashboard })
$portalItem.Add_Click({ Open-Dashboard -Path "/portal" })
$stopItem.Add_Click({
    Stop-PhoneRelay
    $notify.Text = "Phone Relay - stopped"
    $notify.ShowBalloonTip(3000, "Phone Relay", "Backend stopped.", [System.Windows.Forms.ToolTipIcon]::Info)
})
$exitItem.Add_Click({
    $notify.Visible = $false
    $notify.Dispose()
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $menu
$notify.Add_DoubleClick({ Open-Dashboard })

$notify.ShowBalloonTip(
    5000,
    "Phone Relay",
    $(if ($fwOk) { "Running in tray. On phone, open http://LAN-IP:3000/health to test." } else { "Server started. Run Fix Firewall.bat (Admin) so your phone can connect." }),
    $(if ($fwOk) { [System.Windows.Forms.ToolTipIcon]::Info } else { [System.Windows.Forms.ToolTipIcon]::Warning })
)

Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    if ($notify) {
        $notify.Visible = $false
        $notify.Dispose()
    }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
} | Out-Null

$ctx = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($ctx)

if ($ownsMutex) { $mutex.ReleaseMutex() }
