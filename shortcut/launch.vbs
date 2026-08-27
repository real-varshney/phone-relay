' Phone Relay - tray icon launcher (no console window).
Option Explicit

Dim fso, shell, scriptDir, ps1, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(scriptDir, "tray.ps1")
cmd = "powershell.exe -Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1 & """"
shell.Run cmd, 0, False
