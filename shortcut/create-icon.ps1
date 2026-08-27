# Create phone-relay.ico (green PR badge on dark background).
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$iconPath = Join-Path $PSScriptRoot "phone-relay.ico"
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(18, 18, 24))

$green = [System.Drawing.Color]::FromArgb(61, 220, 151)
$g.FillEllipse((New-Object System.Drawing.SolidBrush $green), 28, 28, 200, 200)

$font = New-Object System.Drawing.Font("Segoe UI", 68, [System.Drawing.FontStyle]::Bold)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
$g.DrawString("PR", $font, [System.Drawing.Brushes]::White, $rect, $format)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$stream = [System.IO.File]::Create($iconPath)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$bmp.Dispose()

Write-Host "Created $iconPath"
