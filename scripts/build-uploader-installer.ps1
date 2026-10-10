param(
    [string]$Version = (Get-Content "$PSScriptRoot/../package.json" -Raw | ConvertFrom-Json).version,
    [string]$PayloadDir = "$PSScriptRoot/../python/dist/rivalhub-demo-uploader",
    [string]$OutputDir = "$PSScriptRoot/../python/dist"
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a numeric desktop version' }
$PayloadDir = (Resolve-Path $PayloadDir).Path
if (!(Test-Path "$PayloadDir/rivalhub-demo-uploader.exe") -or !(Test-Path "$PayloadDir/_internal/python312.dll")) {
    throw 'Complete Windows PyInstaller onedir payload required'
}
New-Item -ItemType Directory -Force $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
$compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue
$iscc = if ($compiler) { $compiler.Source } else { "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
if (!(Test-Path $iscc)) { throw 'Install Inno Setup 6.4+ from https://jrsoftware.org/isdl.php' }
& $iscc "/DAppVersion=$Version" "/DPayloadDir=$PayloadDir" "/DOutputDir=$OutputDir" "$PSScriptRoot/../python/packaging/uploader-setup.iss"
if ($LASTEXITCODE -ne 0) { throw "ISCC failed: $LASTEXITCODE" }
