# Ephemeral CI only; use a new empty user-data directory for each launch.
param([Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string]$EvidenceDir)
$ErrorActionPreference = 'Stop'
if (!$env:RUNNER_TEMP) { throw 'Requires an isolated CI worker' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;
public static class UploaderMessages {
  [DllImport("user32.dll", SetLastError=true)]
  static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, IntPtr l, uint flags, uint timeout, out UIntPtr result);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool PostMessage(IntPtr h, uint m, UIntPtr w, IntPtr l);
  public delegate bool WindowCallback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback f, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
  public static IntPtr Dialog(int processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var cls = new StringBuilder(256); GetClassName(h, cls, 256);
      if (pid == processId && cls.ToString() == "#32770") { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string[] Windows(int processId) {
    var windows = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == processId) {
        var cls = new StringBuilder(256); GetClassName(h, cls, 256);
        var title = new StringBuilder(256); GetWindowText(h, title, 256);
        windows.Add(h.ToString() + " " + cls.ToString() + " " + title.ToString());
      }
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
  public static bool Responsive(IntPtr h) {
    UIntPtr result;
    return h != IntPtr.Zero && SendMessageTimeout(h, 0, UIntPtr.Zero, IntPtr.Zero, 2, 1500, out result) != IntPtr.Zero;
  }
}
'@
New-Item -ItemType Directory -Force $EvidenceDir | Out-Null
$Exe = (Resolve-Path $Exe).Path
$results = @()
for ($launch = 1; $launch -le 2; $launch++) {
    $userdata = Join-Path $EvidenceDir "empty-user-$launch"
    New-Item -ItemType Directory $userdata | Out-Null
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Exe
    $start.WorkingDirectory = Split-Path $Exe
    $start.UseShellExecute = $false
    $start.EnvironmentVariables['LOCALAPPDATA'] = $userdata
    $process = [Diagnostics.Process]::Start($start)
    $entry = [ordered]@{ launch=$launch; processId=$process.Id; responding=$false; bridgeReady=$false; saveDialog=$false; cancel=$false; normalExit=$false }
    try {
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            Start-Sleep -Milliseconds 500
            $process.Refresh()
            if ($process.HasExited) { throw 'Uploader exited before startup completed' }
            if ($process.MainWindowHandle -ne [IntPtr]::Zero) { break }
        }
        if (![UploaderMessages]::Responsive($process.MainWindowHandle)) { throw 'Native UI fails WM_NULL response on empty startup' }
        $entry.responding = $true
        $window = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
        $condition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty, '导出诊断日志')
        $button = $null
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (![UploaderMessages]::Responsive($process.MainWindowHandle)) { throw 'Native UI became unresponsive before bridge ready' }
            $button = $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
            if ($button -and $button.Current.IsEnabled) { break }
            Start-Sleep -Milliseconds 500
        }
        # Enabled only after the frontend's 14-method nativeApiReady contract.
        if (!$button -or !$button.Current.IsEnabled) { throw 'Frontend bridge never became ready' }
        $entry.bridgeReady = $true
        $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
        # Modal dialogs need not be direct children of UI Automation's desktop root.
        # Enumerate actual top-level HWNDs owned by this exact frozen process.
        $handle = [IntPtr]::Zero
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $handle = [UploaderMessages]::Dialog($process.Id)
            if ($handle -ne [IntPtr]::Zero) { break }
            Start-Sleep -Milliseconds 500
        }
        if ($handle -eq [IntPtr]::Zero) { throw 'Native save dialog did not open' }
        $entry.saveDialog = $true
        if (![UploaderMessages]::Responsive($handle)) { throw 'Native save dialog is unresponsive' }
        $null = [UploaderMessages]::PostMessage($handle, 0x111, [UIntPtr]2, [IntPtr]::Zero) # WM_COMMAND IDCANCEL
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 250
            $handle = [UploaderMessages]::Dialog($process.Id)
            if ($handle -eq [IntPtr]::Zero) { break }
        }
        if ($handle -ne [IntPtr]::Zero -or ![UploaderMessages]::Responsive($process.MainWindowHandle)) { throw 'Save dialog cancel did not return to responsive UI' }
        $entry.cancel = $true
        if (!$process.CloseMainWindow() -or !$process.WaitForExit(10000) -or $process.ExitCode -ne 0) { throw 'Uploader did not close normally' }
        $entry.normalExit = $true
    } finally {
        $entry.windows = [UploaderMessages]::Windows($process.Id)
        if (!$process.HasExited) { Stop-Process -Id $process.Id }
        $results += $entry
        $results | ConvertTo-Json | Set-Content (Join-Path $EvidenceDir 'startup-results.json') -Encoding UTF8
    }
}
Write-Host 'Both frozen launches passed native response, bridge ready, save dialog, cancel and normal exit'
