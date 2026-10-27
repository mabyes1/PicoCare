param([string]$ToolRoot = 'D:\DevTools\PhoneMonitorAndroid', [switch]$Offline)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
try {
    $env:JAVA_HOME = Join-Path $ToolRoot 'jdk-17'
    $env:ANDROID_HOME = Join-Path $ToolRoot 'android-sdk'
    $buildArgs = @('-p', (Join-Path $projectRoot 'android'), '--no-daemon', 'assembleDebug', 'lintDebug', 'testDebugUnitTest')
    if ($Offline) { $buildArgs += '--offline' }
    & (Join-Path $ToolRoot 'gradle-8.13\bin\gradle.bat') @buildArgs
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
}
