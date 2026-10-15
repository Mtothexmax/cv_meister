# emulator-start.ps1 - Android emulator for CV Meister.
#
# Starts (or reuses) the AVD and puts the current APK on it, so the app can be
# tested in a phone simulator.
#
#   .\emulator-start.ps1                 # restart the emulator, install, launch
#   .\emulator-start.ps1 -NoRestart      # keep the running emulator, only update the app
#   .\emulator-start.ps1 -Build          # rebuild the APK first, then do the above
#   .\emulator-start.ps1 -NoRestart -Build   # rebuild + hot-update, emulator keeps running
#   .\emulator-start.ps1 -Avd other      # use a different AVD
#
# The emulator is started detached, so this script returns while it keeps
# running. -NoRestart never touches the emulator, which makes iterating on the
# frontend much faster (no ~70 s boot per change).
#
# ABI: the release APK is arm64-v8a only, and an x86_64 host cannot run an arm64
# guest at all - "Avd's CPU Architecture 'arm64' is not supported by the QEMU2
# emulator on x86_64 host". So an emulator needs an x86_64 APK, which is what
# -Target x86_64 (the default here) produces. apk-export.ps1 keeps arm64 as its
# default for real devices.
#
# WebView: the AVD must ship Android System WebView >= 137. Typst runs in
# `typst-wasm`, which needs either SharedArrayBuffer (cross-origin isolation -
# the Android WebView grants none, see README) or JSPI (Chromium 137+). The API
# 35 image ships WebView 124 and the API 36 image 133, so both cannot render the
# preview or export a PDF; API 37 ships 145 and works. Hence the default below.
#
# Prerequisites (once):
#   sdkmanager "emulator" "system-images/android-37.0/google_apis/x86_64"
#   avdmanager create avd -n cv-meister-37 -k "system-images;android-37.0;google_apis;x86_64" -d pixel_7
# Note the separators: sdkmanager wants "/" (system-images/android-37.0/...),
# avdmanager wants ";" (system-images;android-37.0;...).

param(
    [ValidateSet('aarch64', 'armv7', 'i686', 'x86_64')]
    [string]$Target = 'x86_64',
    [string]$Avd = 'cv-meister-37',
    [switch]$NoRestart,
    [switch]$Build,
    [int]$BootTimeoutSeconds = 300
)

# Deliberately NOT 'Stop': adb and the emulator write progress to stderr, and
# under 'Stop' PowerShell turns a native stderr line into a terminating
# NativeCommandError. That aborts the script mid-install - and aborts it even
# sooner when the caller pipes the output (e.g. `.\emulator-start.ps1 | Tee-Object`).
# Exit codes are checked explicitly instead.
$ErrorActionPreference = 'Continue'

$Root = $PSScriptRoot
Set-Location $Root

$AppId = 'de.cvmeister.app'

# --- 1. Prerequisites -------------------------------------------------------

function Resolve-AndroidSdk {
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA 'Android/Sdk')
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path (Join-Path $p 'platform-tools'))) { return $p }
    }
    return $null
}

$sdk = Resolve-AndroidSdk
if (-not $sdk) {
    Write-Host 'Android SDK not found. Set ANDROID_HOME or install to %LOCALAPPDATA%\Android\Sdk.' -ForegroundColor Red
    exit 1
}

$adb = Join-Path $sdk 'platform-tools/adb.exe'
$emulator = Join-Path $sdk 'emulator/emulator.exe'

foreach ($tool in @($adb, $emulator)) {
    if (-not (Test-Path $tool)) {
        Write-Host "Missing: $tool" -ForegroundColor Red
        if ($tool -eq $emulator) {
            Write-Host '  -> sdkmanager "emulator"' -ForegroundColor Red
        }
        exit 1
    }
}

Write-Host '=== CV Meister -> Android emulator ===' -ForegroundColor Cyan
Write-Host "AVD:    $Avd"
Write-Host "ABI:    $Target"
Write-Host "Modus:  $(if ($NoRestart) { 'update only (emulator stays up)' } else { 'restart emulator' })"
Write-Host ''

# --- 2. Helpers -------------------------------------------------------------

# The one device this script cares about, or $null. adb prints a header line and
# blanks, hence the match rather than a fixed line number.
function Get-Emulator {
    $lines = & $adb devices 2>$null
    foreach ($line in $lines) {
        if ($line -match '^(emulator-\d+)\s+(\S+)') {
            return [pscustomobject]@{ Serial = $matches[1]; State = $matches[2] }
        }
    }
    return $null
}

function Wait-ForBoot([string]$Serial, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $booted = (& $adb -s $Serial shell getprop sys.boot_completed 2>$null) -join ''
        if ($booted.Trim() -eq '1') { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

# --- 3. Rebuild, if asked ---------------------------------------------------

if ($Build) {
    Write-Host "[1/5] Rebuilding the $Target APK..." -ForegroundColor Yellow
    & (Join-Path $Root 'apk-export.ps1') -Target $Target
    if ($LASTEXITCODE -ne 0) { throw 'apk-export.ps1 failed' }
}

# --- 4. Find the APK --------------------------------------------------------

# Newest match, so a stale artifact from an earlier version never wins.
$apk = Get-ChildItem (Join-Path $Root 'apk') -Filter "cv-meister-*-$Target-release.apk" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $apk) {
    Write-Host "No APK for $Target under apk\. Build one first:" -ForegroundColor Red
    Write-Host "  .\apk-export.ps1 -Target $Target" -ForegroundColor Red
    Write-Host "  (or rerun this script with -Build)" -ForegroundColor Red
    exit 1
}
Write-Host "APK:    $($apk.Name)" -ForegroundColor Green
Write-Host ''

# --- 5. Emulator up ---------------------------------------------------------

$device = Get-Emulator

if ($device -and $NoRestart) {
    Write-Host "[2/5] Keeping the running emulator ($($device.Serial)) - no restart requested." -ForegroundColor Green
} else {
    if ($device) {
        Write-Host "[2/5] Stopping the running emulator ($($device.Serial))..." -ForegroundColor Yellow
        & $adb -s $device.Serial emu kill 2>$null | Out-Null

        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            if (-not (Get-Emulator)) { break }
        }

        # `emu kill` is a request; if the guest ignores it, take the processes down.
        if (Get-Emulator) {
            Write-Host '      emu kill had no effect, stopping the processes...' -ForegroundColor DarkGray
            Get-Process -Name emulator, qemu-system-x86_64 -ErrorAction SilentlyContinue |
                Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        }
    }

    if (-not (Get-Emulator)) {
        Write-Host "[3/5] Starting AVD '$Avd'..." -ForegroundColor Yellow
        Start-Process -FilePath $emulator `
            -ArgumentList @('-avd', $Avd, '-no-snapshot-load', '-no-boot-anim', '-gpu', 'auto') `
            -WorkingDirectory (Split-Path $emulator)
    }

    Write-Host '[4/5] Waiting for the device...' -ForegroundColor Yellow
    & $adb wait-for-device
}

$device = Get-Emulator
if (-not $device) {
    Write-Host 'No emulator came up. Start it by hand to see the error:' -ForegroundColor Red
    Write-Host "  `"$emulator`" -avd $Avd" -ForegroundColor Red
    exit 1
}

Write-Host "      $($device.Serial) waiting for boot..." -ForegroundColor DarkGray
if (-not (Wait-ForBoot -Serial $device.Serial -TimeoutSeconds $BootTimeoutSeconds)) {
    Write-Host "Boot did not finish within $BootTimeoutSeconds s." -ForegroundColor Red
    exit 1
}

$release = (& $adb -s $device.Serial shell getprop ro.build.version.release 2>$null) -join ''
Write-Host "      booted: Android $($release.Trim())" -ForegroundColor Green

# --- 6. Install and launch --------------------------------------------------

Write-Host "[5/5] Installing $($apk.Name)..." -ForegroundColor Yellow
& $adb -s $device.Serial install -r $apk.FullName
if ($LASTEXITCODE -ne 0) { throw 'adb install failed' }

# A running app keeps its old code after an in-place update, so always restart it.
& $adb -s $device.Serial shell am force-stop $AppId | Out-Null
& $adb -s $device.Serial shell am start -n "$AppId/.MainActivity" | Out-Null
Start-Sleep -Seconds 3

$appPid = ((& $adb -s $device.Serial shell pidof $AppId 2>$null) -join '').Trim()

# The WebView version decides whether Typst can run at all: `typst-wasm` has no
# backend without either SharedArrayBuffer (cross-origin isolation, which the
# Android WebView does not grant) or JSPI (Chromium 137+). Everything below 137
# therefore cannot render the preview or export a PDF - and no Tauri setting
# changes that.
$webview = ((& $adb -s $device.Serial shell dumpsys package com.google.android.webview 2>$null) |
    Select-String -Pattern 'versionName=(\S+)' | Select-Object -First 1)
$webviewVersion = if ($webview) { $webview.Matches[0].Groups[1].Value } else { '?' }
$webviewMajor = if ($webviewVersion -match '^(\d+)\.') { [int]$matches[1] } else { 0 }

Write-Host ''
Write-Host '=== Ready ===' -ForegroundColor Cyan
Write-Host "Device:  $($device.Serial) (Android $($release.Trim()))" -ForegroundColor Green
if ($appPid) {
    Write-Host "App:     $AppId running (pid $appPid)" -ForegroundColor Green
} else {
    Write-Host "App:     $AppId did NOT start - check 'adb logcat'" -ForegroundColor Red
}
if ($webviewMajor -ge 137) {
    Write-Host "WebView: $webviewVersion - Typst-Vorschau und PDF-Export laufen (JSPI)." -ForegroundColor Green
} else {
    Write-Host "WebView: $webviewVersion" -ForegroundColor Red
    Write-Host '         Zu alt: JSPI gibt es erst ab Chromium 137, und SharedArrayBuffer' -ForegroundColor Yellow
    Write-Host '         gibt die Android-WebView gar nicht. Vorschau und PDF-Export' -ForegroundColor Yellow
    Write-Host '         melden hier "Diese Browser-Engine kann Typst nicht ausfuehren".' -ForegroundColor Yellow
    Write-Host '         Abhilfe: -Avd cv-meister-37 (API-37-Image, WebView 145).' -ForegroundColor Yellow
}
Write-Host ''
Write-Host 'The emulator window is yours. Re-run with -NoRestart to push a new APK without rebooting.' -ForegroundColor DarkGray
