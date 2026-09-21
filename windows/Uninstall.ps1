$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
if ([Windows.Forms.MessageBox]::Show('Remove VN Library? Your games, saves and settings will be kept.', 'Uninstall', 'OKCancel') -ne 'OK') { exit 0 }
$root = Join-Path $env:LOCALAPPDATA 'Programs\VN Import Toolkit'
$data = Join-Path $env:LOCALAPPDATA 'VN Import Toolkit'
$mutex = New-Object System.Threading.Mutex($false, 'Local\VNImportToolkit.Desktop')
if (-not $mutex.WaitOne(0)) { [Windows.Forms.MessageBox]::Show('Quit the reader from its tray menu first.'); exit 1 }
$guard = $null
try {
    $guard = [IO.File]::Open((Join-Path $data 'desktop.lock'), 'OpenOrCreate', 'ReadWrite', 'ReadWrite'); $guard.Lock(0,1)
    foreach ($folder in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('Desktop'))) {
        foreach ($name in @('VN Library.lnk','VN Import Toolkit.lnk')) {
            $link = Join-Path $folder $name
            if (Test-Path $link) { Remove-Item $link }
        }
    }
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name VNImportToolkit -ErrorAction SilentlyContinue
    Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VNImportToolkit' -ErrorAction SilentlyContinue
    # Fixed application directory only; never recurse through a user-selected data path.
    if (Test-Path $root) { Remove-Item $root -Recurse -Force }
    [Windows.Forms.MessageBox]::Show("Removed. Your games and saves remain in:`n$data")
} catch { [Windows.Forms.MessageBox]::Show("Could not uninstall: $_"); exit 1 }
finally { if ($null -ne $guard) { $guard.Dispose() }; $mutex.ReleaseMutex(); $mutex.Dispose() }
