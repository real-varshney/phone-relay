# Put Phone Relay on the Desktop (tray icon + silent launcher).
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "relay-lib.ps1")
$iconScript = Join-Path $PSScriptRoot "create-icon.ps1"
$iconPath = Join-Path $PSScriptRoot "phone-relay.ico"
$launcher = Join-Path $PSScriptRoot "launch.vbs"

if (-not (Test-Path $iconPath)) {
    & powershell.exe -Sta -NoProfile -ExecutionPolicy Bypass -File $iconScript
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Phone Relay.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $RepoRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Start Phone Relay (system tray) - scan QR on dashboard"
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host "Desktop shortcut created:"
Write-Host $shortcutPath
Write-Host ""
Write-Host "IMPORTANT: Run Fix Firewall.bat once (Admin) so your phone can reach port 3000."
