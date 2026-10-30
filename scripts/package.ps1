param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$unsignedApk = Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug-unsigned.apk'
if (-not (Test-Path -LiteralPath $unsignedApk)) { throw '先執行 build-android.ps1 產生未簽署 APK' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$staging = Join-Path $projectRoot '.local/package-staging'
try {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    $sourceFiles = @('META.md','README.md','README_ZH.md','PRODUCT.md','SECRETARY.md','FIELD.md','package.json','.env.example','.npmrc','.gitignore','tsconfig.json','tsconfig.web.json','src','shared','web','tests','scripts')
    foreach ($source in $sourceFiles) { Copy-Item -LiteralPath (Join-Path $projectRoot $source) -Destination $staging -Recurse }
    $androidStage = Join-Path $staging 'android'
    New-Item -ItemType Directory -Path (Join-Path $androidStage 'app') -Force | Out-Null
    foreach ($file in @('settings.gradle.kts','build.gradle.kts','gradle.properties')) { Copy-Item -LiteralPath (Join-Path $projectRoot "android/$file") -Destination $androidStage }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'android/app/build.gradle.kts') -Destination (Join-Path $androidStage 'app')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'android/app/src') -Destination (Join-Path $androidStage 'app') -Recurse
    $archive = Join-Path $outputRoot 'PicoCare-Meta-Source.zip'
    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive -Force
    # Dotfiles are configuration, so include them explicitly in the ZIP as well.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($dotfile in @('.env.example','.npmrc','.gitignore')) {
            if (-not $zip.GetEntry($dotfile)) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $staging $dotfile), $dotfile) | Out-Null }
        }
    } finally { $zip.Dispose() }
    Copy-Item -LiteralPath $unsignedApk -Destination (Join-Path $outputRoot 'PicoCare-Meta-unsigned.apk')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $outputRoot 'PicoCare-START.md')
    Write-Output 'Source, unsigned APK and startup guide exported.'
} finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
