# apk-export.ps1 - Android APK for CV Meister (Tauri).
#
# Wraps `tauri android build` and drops an *installable* APK into apk/.
#
# Tauri emits `app-universal-release-unsigned.apk`, which no device will
# install, so this script zipaligns and signs it. On the first run it creates a
# self-signed keystore under apk/ and reuses it afterwards.
#
#   !! Keep apk/cv-meister-release.jks and apk/keystore.properties safe. !!
#   Android identifies an app by its signing key: lose the keystore and you can
#   never update an installed copy again - you would have to uninstall first.
#   Both files live in apk/, which is gitignored, so back them up yourself.
#
# The GitHub Pages export (export.ps1) is a separate, untouched path.
#
# Usage:
#   .\apk-export.ps1                    # signed release APK, arm64-v8a
#   .\apk-export.ps1 -Debug             # debug APK (signed with the debug key)
#   .\apk-export.ps1 -Target x86_64     # e.g. for an emulator
#   .\apk-export.ps1 -Keystore D:\my.jks -KeyAlias mykey
#
# Prerequisites (once):
#   winget install EclipseAdoptium.Temurin.17.JDK
#   <sdk>\cmdline-tools\latest\bin\sdkmanager "platform-tools" "platforms/android-37.0" `
#       "build-tools/37.0.0" "ndk/27.0.12077973"
#   rustup target add aarch64-linux-android

param(
    [ValidateSet('aarch64', 'armv7', 'i686', 'x86_64')]
    [string]$Target = 'aarch64',
    [switch]$Debug,
    [string]$Keystore,
    [string]$KeyAlias = 'cv-meister'
)

$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
Set-Location $Root

Write-Host '=== CV Meister -> Android APK (Tauri) ===' -ForegroundColor Cyan
Write-Host "ABI:     $Target"
Write-Host "Variant: $(if ($Debug) { 'debug' } else { 'release' })"
Write-Host ''

# --- 1. Prerequisites -------------------------------------------------------

function Resolve-Jdk {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
        return $env:JAVA_HOME
    }
    # Temurin installs side by side; take the newest.
    $adoptium = Join-Path $env:ProgramFiles 'Eclipse Adoptium'
    if (Test-Path $adoptium) {
        $cand = Get-ChildItem $adoptium -Directory -Filter 'jdk-*' |
            Where-Object { Test-Path (Join-Path $_.FullName 'bin/java.exe') } |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($cand) { return $cand.FullName }
    }
    return $null
}

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

function Resolve-Ndk([string]$Sdk) {
    if ($env:NDK_HOME -and (Test-Path $env:NDK_HOME)) { return $env:NDK_HOME }
    $ndkRoot = Join-Path $Sdk 'ndk'
    if (-not (Test-Path $ndkRoot)) { return $null }
    $cand = Get-ChildItem $ndkRoot -Directory |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
        Sort-Object { [version]$_.Name } -Descending |
        Select-Object -First 1
    if ($cand) { return $cand.FullName }
    return $null
}

function Resolve-BuildTools([string]$Sdk) {
    $btRoot = Join-Path $Sdk 'build-tools'
    if (-not (Test-Path $btRoot)) { return $null }
    $cand = Get-ChildItem $btRoot -Directory |
        Sort-Object { [version]$_.Name } -Descending |
        Select-Object -First 1
    if ($cand) { return $cand.FullName }
    return $null
}

$rustTarget = switch ($Target) {
    'aarch64' { 'aarch64-linux-android' }
    'armv7'   { 'armv7-linux-androideabi' }
    'i686'    { 'i686-linux-android' }
    'x86_64'  { 'x86_64-linux-android' }
}

$javaHome = Resolve-Jdk
$sdk = Resolve-AndroidSdk
$ndk = if ($sdk) { Resolve-Ndk $sdk } else { $null }
$buildTools = if ($sdk) { Resolve-BuildTools $sdk } else { $null }

$missing = @()
if (-not $javaHome)   { $missing += 'JDK 17       -> winget install EclipseAdoptium.Temurin.17.JDK' }
if (-not $sdk)        { $missing += 'Android SDK  -> cmdline-tools + platform-tools under %LOCALAPPDATA%\Android\Sdk' }
if (-not $ndk)        { $missing += 'Android NDK  -> sdkmanager "ndk/27.0.12077973"' }
if (-not $buildTools) { $missing += 'Android build-tools -> sdkmanager "build-tools/37.0.0"' }

$installedTargets = @(& rustup target list --installed) | ForEach-Object { $_.Trim() }
if ($installedTargets -notcontains $rustTarget) {
    $missing += "Rust target  -> rustup target add $rustTarget"
}

if ($missing.Count -gt 0) {
    Write-Host 'Missing prerequisites:' -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Red }
    exit 1
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:NDK_HOME = $ndk
Write-Host "JAVA_HOME    = $javaHome" -ForegroundColor Green
Write-Host "ANDROID_HOME = $sdk" -ForegroundColor Green
Write-Host "NDK_HOME     = $ndk" -ForegroundColor Green
Write-Host ''

$outDir = Join-Path $Root 'apk'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# --- 2. Signing identity ----------------------------------------------------

$storeFile = if ($Keystore) { $Keystore } else { Join-Path $outDir 'cv-meister-release.jks' }
$propsFile = Join-Path $outDir 'keystore.properties'

if (-not $Debug) {
    if (-not (Test-Path $storeFile) -or -not (Test-Path $propsFile)) {
        Write-Host '[0/4] Creating a signing key (first run)...' -ForegroundColor Yellow
        $storePass = [Guid]::NewGuid().ToString('N')
        $keyPass = $storePass
        & (Join-Path $javaHome 'bin/keytool.exe') -genkeypair -v `
            -keystore $storeFile -alias $KeyAlias `
            -keyalg RSA -keysize 4096 -validity 10000 `
            -storepass $storePass -keypass $keyPass `
            -dname 'CN=CV Meister, OU=Android, O=CV Meister, L=, S=, C=DE'
        if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }

        @(
            "# Generated by apk-export.ps1 - keep this file and $([IO.Path]::GetFileName($storeFile)) safe.",
            "storeFile=$storeFile",
            "storePassword=$storePass",
            "keyAlias=$KeyAlias",
            "keyPassword=$keyPass"
        ) | Set-Content $propsFile -Encoding UTF8
        Write-Host '      -> apk/cv-meister-release.jks + apk/keystore.properties created' -ForegroundColor Yellow
        Write-Host '      -> BACK THESE UP. Without them you cannot update an installed app.' -ForegroundColor Yellow
    }
}

# --- 3. Android project (generated by the CLI, gitignored) -------------------

$androidGen = Join-Path $Root 'src-tauri/gen/android'
if (-not (Test-Path $androidGen)) {
    Write-Host '[1/4] Generating the Android project (tauri android init)...' -ForegroundColor Yellow
    & npx tauri android init --ci
    if ($LASTEXITCODE -ne 0) { throw 'tauri android init failed' }
} else {
    Write-Host '[1/4] Android project present' -ForegroundColor Green
}

# --- 4. Build ---------------------------------------------------------------

Write-Host "[2/4] Building the APK (tauri android build --apk --target $Target)..." -ForegroundColor Yellow
if ($Debug) {
    & npx tauri android build --debug --apk --target $Target --ci
} else {
    & npx tauri android build --apk --target $Target --ci
}
if ($LASTEXITCODE -ne 0) { throw 'tauri android build failed' }

$built = Get-ChildItem $androidGen -Recurse -Filter '*.apk' -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $built) { throw "No APK found under $androidGen" }
Write-Host "      -> $($built.FullName)" -ForegroundColor DarkGray

# --- 5. Align and sign ------------------------------------------------------

$version = (Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version
$variant = if ($Debug) { 'debug' } else { 'release' }
$dest = Join-Path $outDir "cv-meister-$version-$Target-$variant.apk"

if ($Debug) {
    # Debug APKs are already signed with the Android debug key.
    Copy-Item $built.FullName $dest -Force
} else {
    Write-Host '[3/4] Aligning and signing...' -ForegroundColor Yellow
    $props = @{}
    foreach ($line in Get-Content $propsFile) {
        if ($line -match '^\s*([^#=]+)=(.*)$') { $props[$matches[1].Trim()] = $matches[2] }
    }
    $sf = $props['storeFile']
    if (-not (Test-Path $sf)) { throw "Keystore not found: $sf" }

    $zipalign = Join-Path $buildTools 'zipalign.exe'
    $apksigner = Join-Path $buildTools 'apksigner.bat'
    $aligned = Join-Path $outDir 'aligned.tmp.apk'

    & $zipalign -f -p 4 $built.FullName $aligned
    if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

    & $apksigner sign `
        --ks $sf `
        --ks-key-alias $props['keyAlias'] `
        --ks-pass "pass:$($props['storePassword'])" `
        --key-pass "pass:$($props['keyPassword'])" `
        --out $dest `
        $aligned
    if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }

    Remove-Item $aligned -Force -ErrorAction SilentlyContinue

    # Read the verdict out of the report rather than from $LASTEXITCODE:
    # apksigner is a .bat that reports on stderr, and its exit code does not
    # survive the PowerShell -> cmd boundary reliably.
    $report = & $apksigner verify --verbose $dest 2>&1 | Out-String
    if ($report -notmatch 'Verified using v2 scheme \(APK Signature Scheme v2\): true') {
        Write-Host $report -ForegroundColor Red
        throw 'apksigner verify failed - the APK is not validly signed'
    }
    ($report -split "`n" | Where-Object { $_ -match 'Verifies|Verified using v[0-9]|Number of signers' }) |
        ForEach-Object { Write-Host "      $($_.Trim())" -ForegroundColor DarkGray }
}

# --- 6. Report --------------------------------------------------------------

Write-Host '[4/4] Inspecting the APK...' -ForegroundColor Yellow
$sizeMb = [math]::Round((Get-Item $dest).Length / 1MB, 1)

$analyzer = Join-Path $sdk 'cmdline-tools/latest/bin/apkanalyzer.bat'
$appId = $null
$libs = $null
if (Test-Path $analyzer) {
    try { $appId = (& $analyzer manifest application-id $dest) 2>$null } catch { }
    try { $libs = (& $analyzer files list $dest) 2>$null | Where-Object { $_ -like '/lib/*/*.so' } } catch { }
}

Write-Host ''
Write-Host '=== Done ===' -ForegroundColor Cyan
Write-Host "APK:    $dest" -ForegroundColor Green
Write-Host "Size:   $sizeMb MB" -ForegroundColor Green
if ($appId) { Write-Host "App id: $appId" -ForegroundColor Green }
if ($libs) {
    Write-Host 'Native libs:' -ForegroundColor Green
    foreach ($l in $libs) { Write-Host "  $l" -ForegroundColor DarkGray }
}
