param(
    [ValidateSet("usb", "sd")]
    [string]$Mode = "usb",
    [string]$Target = ""
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$FwDir = Join-Path $RootDir "firmware\gamebuino_aka"

if (-not (Get-Command pio -ErrorAction SilentlyContinue)) {
    Write-Error "[AKA] PlatformIO ('pio') introuvable. Installez-le via : pip install platformio"
}

Write-Host "[AKA] Compilation du firmware Gamebuino AKA Pinball..." -ForegroundColor Cyan
pio run -d $FwDir -e gamebuino_aka

if ($Mode -eq "sd") {
    if (-not $Target -or -not (Test-Path $Target)) {
        Write-Error "Usage : .\scripts\push-to-aka.ps1 -Mode sd -Target E:\"
    }
    $Dest = Join-Path $Target "PINBALL.BIN"
    Copy-Item (Join-Path $FwDir "dist\PINBALL.BIN") -Destination $Dest -Force
    Write-Host "[AKA] PINBALL.BIN copié avec succès vers $Dest !" -ForegroundColor Green
} else {
    if ($Target) {
        pio run -d $FwDir -e gamebuino_aka -t upload --upload-port $Target
    } else {
        pio run -d $FwDir -e gamebuino_aka -t upload
    }
    Write-Host "[AKA] Firmware flashé avec succès par USB sur la Gamebuino AKA !" -ForegroundColor Green
}
