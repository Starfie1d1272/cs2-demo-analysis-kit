; Complete offline onedir installer. Inno's uninstall log is the only ownership record.
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef PayloadDir
  #define PayloadDir "..\dist\rivalhub-demo-uploader"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif
#define AppId "{7647899F-A612-4C70-9B49-B7D289609F32}"
#define UninstallKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\" + AppId + "_is1"

[Setup]
AppId={{7647899F-A612-4C70-9B49-B7D289609F32}
AppName=RivalHub Demo Uploader
AppVersion={#AppVersion}
AppPublisher=Starfie1d1272
AppPublisherURL=https://github.com/Starfie1d1272/cs2-demo-analysis-kit
DefaultDirName={localappdata}\Programs\RivalHub Demo Uploader
DisableDirPage=no
DisableProgramGroupPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.17763
OutputDir={#OutputDir}
OutputBaseFilename=RivalHub-Demo-Uploader-Setup-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\rivalhub-demo-uploader.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes
UninstallLogMode=append
SetupLogging=yes

[Languages]
Name: "chinesesimp"; MessagesFile: "ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
chinesesimp.WelcomeLabel2=安装完整应用及快捷方式，无需手动搬动内部 EXE。%n%n安装到当前用户目录，可修改路径。升级或重新运行安装器可修复应用文件，用户资料和授权会保留。
chinesesimp.FinishedLabel=安装已完成。使用快捷方式打开应用；用户资料和日志保存在本机用户目录中。

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; Flags: unchecked

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\RivalHub Demo Uploader"; Filename: "{app}\rivalhub-demo-uploader.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\RivalHub Demo Uploader"; Filename: "{app}\rivalhub-demo-uploader.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\rivalhub-demo-uploader.exe"; Description: "启动 RivalHub Demo Uploader"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[Code]
var
  InstallStage: String;

procedure LogInstallStage(const Stage: String);
begin
  InstallStage := Stage;
  Log('DAK installer stage=' + Stage);
end;

function InstallLogGuidance(): String;
var
  LogPath: String;
begin
  LogPath := ExpandConstant('{log}');
  if LogPath <> '' then
    Result := '本机安装日志：' + LogPath
  else
    Result := '未能取得安装日志位置；可在 Windows「运行」中输入 %TEMP% 查找本次 Setup Log。安装器未启动或临时目录不可写时，日志可能未生成。';
  Result := Result + #13#10 +
    '失败后先保留原报错和日志，根据错误修复目录权限、关闭占用程序或修复明确缺失的运行库后再试；不要关闭安全保护。' + #13#10 +
    '日志只保存在本机，不会自动上传。分享副本前请替换用户名、个人路径和敏感内容，保留时间、阶段、错误与文件名；不要直接公开原日志。';
end;

procedure ShowInstallLogGuidance(Sender: TObject);
begin
  SuppressibleMsgBox(InstallLogGuidance(), mbInformation, MB_OK, IDOK);
end;

function InitializeSetup(): Boolean;
begin
  LogInstallStage('initialize');
  Result := True;
end;

procedure InitializeWizard();
var
  LogButton: TNewButton;
begin
  LogButton := TNewButton.Create(WizardForm);
  LogButton.Parent := WizardForm;
  LogButton.Caption := '本机安装日志';
  LogButton.Width := ScaleX(110);
  LogButton.Height := WizardForm.CancelButton.Height;
  LogButton.Left := ScaleX(8);
  LogButton.Top := WizardForm.CancelButton.Top;
  LogButton.OnClick := @ShowInstallLogGuidance;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  case CurStep of
    ssInstall: LogInstallStage('install.files');
    ssPostInstall: LogInstallStage('install.complete');
    ssDone: LogInstallStage('done');
  end;
end;

procedure DeinitializeSetup();
begin
  Log('DAK installer exit.lastStage=' + InstallStage);
end;

function HasContents(const Dir: String): Boolean;
var
  Entry: TFindRec;
begin
  Result := False;
  if FindFirst(AddBackslash(Dir) + '*', Entry) then begin
    try
      repeat
        if (Entry.Name <> '.') and (Entry.Name <> '..') then begin
          Result := True;
          Break;
        end;
      until not FindNext(Entry);
    finally
      FindClose(Entry);
    end;
  end;
end;

function ValidateDirectory(): String;
var
  PreviousDir: String;
  PreviousVersion: String;
  PreviousPacked, TargetPacked: Int64;
  Target: String;
begin
  Result := '';
  Target := RemoveBackslashUnlessRoot(ExpandFileName(WizardDirValue));
  if RegQueryStringValue(HKCU64, '{#UninstallKey}', 'Inno Setup: App Path', PreviousDir) then begin
    if CompareText(Target, RemoveBackslashUnlessRoot(PreviousDir)) <> 0 then
      Result := '已有安装：' + PreviousDir + #13#10 + '升级/修复请选择原目录；如需更换目录，请先从 Windows 设置卸载。用户资料会保留。';
    if RegQueryStringValue(HKCU64, '{#UninstallKey}', 'DisplayVersion', PreviousVersion) then begin
      if not StrToVersion(PreviousVersion, PreviousPacked) then
        Result := '已有安装版本记录无效，请先通过 Windows 设置卸载再安装。'
      else if StrToVersion('{#AppVersion}', TargetPacked) then
        if ComparePackedVersion(PreviousPacked, TargetPacked) > 0 then
          Result := '已安装更新版本；请使用相同或更高版本的安装器。';
    end;
  end else if HasContents(Target) then
    Result := '所选目录不是本安装器管理的安装，且不为空。请选择新的空目录；旧 ZIP 请保留完整目录，勿直接覆盖。';
  if (CompareText(Target, ExpandConstant('{localappdata}\RivalHub Demo Uploader')) = 0) then
    Result := '这是用户资料目录，请选择独立的程序安装目录。';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Problem: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then begin
    LogInstallStage('directory.validate');
    Problem := ValidateDirectory();
    if Problem <> '' then begin
      LogInstallStage('directory.rejected');
      SuppressibleMsgBox(Problem + #13#10 + InstallLogGuidance(), mbError, MB_OK, IDOK);
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Release: Cardinal;
  UserVersion, MachineVersion: String;
begin
  // Also validates /VERYSILENT /DIR invocations which skip directory UI.
  LogInstallStage('prepare.directory');
  Result := ValidateDirectory();
  if Result <> '' then begin
    LogInstallStage('directory.rejected');
    Result := Result + #13#10 + InstallLogGuidance();
    Exit;
  end;
  LogInstallStage('prepare.netfx');
  if not RegQueryDWordValue(HKLM32, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) then
    Release := 0;
  if Release < 461808 then begin
    LogInstallStage('runtime.netfx.rejected');
    Result := '需要 .NET Framework 4.7.2 或更高版本。官方 4.8 安装/修复：' + #13#10 +
      'https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48' + #13#10 + InstallLogGuidance();
    Exit;
  end;
  LogInstallStage('prepare.webview2');
  RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', UserVersion);
  RegQueryStringValue(HKLM32, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', MachineVersion);
  if ((UserVersion = '') or (UserVersion = '0.0.0.0')) and
     ((MachineVersion = '') or (MachineVersion = '0.0.0.0')) then begin
    LogInstallStage('runtime.webview2.rejected');
    Result := '需要 Microsoft Edge WebView2 Evergreen Runtime（x64）。官方安装：' + #13#10 +
      'https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section' + #13#10 + InstallLogGuidance();
  end else
    LogInstallStage('prepare.complete');
end;
