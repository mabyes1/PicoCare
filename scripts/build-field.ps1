param(
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [string]$Flavor = 'elder',
    [string]$ToolRoot = 'D:\DevTools\PhoneMonitorAndroid',
    [string]$KeyStore = (Join-Path $env:USERPROFILE '.android/debug.keystore')
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$unsignedApk = Join-Path $projectRoot "android/app/build/outputs/apk/$Flavor/debug/app-$Flavor-debug-unsigned.apk"
$expectedPackage = if ($Flavor -eq 'care') { 'tw.picocare.meta.care' } else { 'tw.picocare.meta' }
$outputName = if ($Flavor -eq 'care') { 'PicoCare-Care.apk' } else { 'PicoCare-Field.apk' }
if (-not (Test-Path -LiteralPath $unsignedApk)) { throw '先執行 build-android.ps1 產生未簽署 APK' }
if (-not (Test-Path -LiteralPath $KeyStore)) { throw '需要既有的 Android debug keystore；此腳本不建立或覆蓋金鑰' }
$manifestInfo = & (Join-Path $ToolRoot 'android-sdk/build-tools/35.0.0/aapt.exe') dump badging $unsignedApk
if ($LASTEXITCODE -ne 0 -or -not ($manifestInfo | Where-Object { $_ -match "^package: name='$expectedPackage' " })) { throw '只簽署獨立套件 tw.picocare.meta，避免覆蓋舊 PicoCare' }
$fieldWork = Join-Path $projectRoot '.local/field'
New-Item -ItemType Directory -Path $fieldWork -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$alignedApk = Join-Path $fieldWork 'picocare-field-aligned.apk'
$outputApk = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) $outputName
$previousJava = $env:JAVA_HOME
try {
    $env:JAVA_HOME = Join-Path $ToolRoot 'jdk-17'
    & (Join-Path $ToolRoot 'android-sdk/build-tools/35.0.0/zipalign.exe') -f 4 $unsignedApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed' }
    & (Join-Path $ToolRoot 'android-sdk/build-tools/35.0.0/apksigner.bat') sign --ks $KeyStore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --v4-signing-enabled false --out $outputApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw 'Development signing failed' }
    Write-Output "$outputName exported with the existing Android development signer."
} finally { $env:JAVA_HOME = $previousJava }
