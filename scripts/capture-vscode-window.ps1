param(
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$true)][int]$AncestorPid
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class OnecWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
}
"@

$ancestorIds = New-Object System.Collections.Generic.HashSet[int]
$currentPid = $AncestorPid
while ($currentPid -gt 0 -and $ancestorIds.Add($currentPid)) {
  $current = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid"
  if (-not $current) { break }
  $currentPid = [int]$current.ParentProcessId
}
$process = Get-Process | Where-Object { $ancestorIds.Contains($_.Id) -and $_.ProcessName -eq 'Code' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $process) { throw 'Ancestor VS Code window was not found' }
[void][OnecWindowCapture]::SetForegroundWindow($process.MainWindowHandle)
[void][OnecWindowCapture]::ShowWindow($process.MainWindowHandle, 3)
Start-Sleep -Milliseconds 350
$rect = New-Object OnecWindowCapture+RECT
if (-not [OnecWindowCapture]::GetWindowRect($process.MainWindowHandle, [ref]$rect)) { throw 'Cannot get VS Code window bounds' }
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -lt 400 -or $height -lt 300) { throw "Invalid window size: ${width}x${height}" }
$bitmap = New-Object Drawing.Bitmap $width, $height
$graphics = [Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
  $directory = Split-Path -Parent $OutputPath
  if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
  $bitmap.Save($OutputPath, [Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
