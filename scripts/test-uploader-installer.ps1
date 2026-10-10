# Runs only on an ephemeral Windows CI worker. Never point this at a personal install.
param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$UpgradeInstaller)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:RUNNER_TEMP 'Uploader 安装 验证'
if (!$env:RUNNER_TEMP) { throw 'Requires an isolated CI worker' }
$target = Join-Path $root '程序 中文 空格'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{7647899F-A612-4C70-9B49-B7D289609F32}_is1'
if (Test-Path $key) { throw 'Existing uploader installation; refusing to touch it' }
function Run-Setup($Exe, $Destination, $Success = $true) {
    $process = Start-Process $Exe -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/TASKS=desktopicon', "/DIR=`"$Destination`"", "/LOG=`"$root/setup-$([guid]::NewGuid()).log`"") -Wait -PassThru
    if ($Success -and $process.ExitCode -ne 0) { throw "Setup failed: $($process.ExitCode)" }
    if (!$Success -and $process.ExitCode -eq 0) { throw 'Unsafe install was accepted' }
}
New-Item -ItemType Directory -Force $root | Out-Null
$foreign = Join-Path $root '陌生目录'
New-Item -ItemType Directory $foreign | Out-Null
Set-Content "$foreign/keep.txt" 'foreign data'
Run-Setup $Installer $foreign $false
if ((Get-Content "$foreign/keep.txt") -ne 'foreign data') { throw 'Foreign file changed' }
Run-Setup $Installer $target
$exe = Join-Path $target 'rivalhub-demo-uploader.exe'
$dll = Join-Path $target '_internal/python312.dll'
if (!(Test-Path $dll)) { throw 'Missing onedir DLL' }
# WScript's shortcut reader may return ANSI paths on an English worker. Read IShellLinkW.
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface UploaderShellLinkW {
  void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int max, IntPtr data, uint flags);
  void GetIDList(out IntPtr value);
  void SetIDList(IntPtr value);
  void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int max);
  void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
  void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int max);
}
public static class UploaderShortcut {
  public static string[] Read(string path) {
    var link = (UploaderShellLinkW)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
    try {
      ((IPersistFile)link).Load(path, 0);
      var target = new StringBuilder(32768); var directory = new StringBuilder(32768);
      link.GetPath(target, target.Capacity, IntPtr.Zero, 4);
      link.GetWorkingDirectory(directory, directory.Capacity);
      return new string[] {target.ToString(), directory.ToString()};
    } finally { Marshal.FinalReleaseComObject(link); }
  }
}
'@
$menuLink = "$env:APPDATA/Microsoft/Windows/Start Menu/Programs/RivalHub Demo Uploader.lnk"
Copy-Item $menuLink "$root/start-menu.lnk"
$shortcut = [UploaderShortcut]::Read($menuLink)
[ordered]@{ actualTarget=$shortcut[0]; expectedTarget=$exe; actualWorkingDirectory=$shortcut[1]; expectedWorkingDirectory=$target } | ConvertTo-Json | Set-Content "$root/shortcut-results.json" -Encoding utf8
if ($shortcut[0] -ne $exe -or $shortcut[1] -ne $target) { throw "Incorrect Unicode shortcut: actual=$($shortcut -join ';'); expected=$exe;$target" }
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'RivalHub Demo Uploader.lnk'
$desktopShortcut = [UploaderShortcut]::Read($desktopLink)
if ($desktopShortcut[0] -ne $exe -or $desktopShortcut[1] -ne $target) { throw 'Incorrect desktop shortcut' }
Remove-Item $dll
Run-Setup $Installer $target
if (!(Test-Path $dll)) { throw 'Repair did not restore DLL' }
Run-Setup $Installer (Join-Path $root '移动安装') $false
Run-Setup $UpgradeInstaller $target
Run-Setup $Installer $target $false # downgrade rejected
# Test the installed frozen payload on the native Windows desktop with empty user directories.
& powershell.exe -NoProfile -File "$PSScriptRoot/smoke-uploader-windows.ps1" -Exe $exe -EvidenceDir "$root/startup"
if ($LASTEXITCODE -ne 0) { throw 'Installed frozen UI regression failed' }
$userfile = Join-Path $target '保留资料.txt'
Set-Content $userfile 'keep user file'
$metadata = Join-Path $env:LOCALAPPDATA 'RivalHub Demo Uploader/installer-ci-user-data.txt'
New-Item -ItemType Directory -Force (Split-Path $metadata) | Out-Null
Set-Content $metadata 'keep user data'
$uninstaller = (Get-ChildItem "$target/unins*.exe").FullName
$result = Start-Process $uninstaller -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait -PassThru
if ($result.ExitCode -ne 0) { throw 'Uninstall failed' }
if ((Test-Path $exe) -or (Test-Path $dll) -or (Test-Path $key) -or (Test-Path $desktopLink) -or (Test-Path $menuLink)) { throw 'Owned files, shortcuts or registration remained' }
if ((Get-Content $userfile) -ne 'keep user file' -or (Get-Content $metadata) -ne 'keep user data') { throw 'User data was removed' }
Run-Setup $Installer $target $false # retained foreign files cannot be silently adopted
Remove-Item $userfile
Run-Setup $Installer $target
Write-Host 'Windows install, repair, upgrade, Unicode path, shortcut, frozen load, uninstall and reinstall passed'
