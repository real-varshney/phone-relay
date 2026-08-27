# One-shot silent start (no tray) - used by npm run launch fallback.
. (Join-Path $PSScriptRoot "relay-lib.ps1")
if (Start-PhoneRelayCore -OpenChrome) { exit 0 }
exit 1
