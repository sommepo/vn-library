# Per-user online installer. No elevation, firewall changes or system PATH edits.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if (-not [Environment]::Is64BitOperatingSystem) { throw 'This package needs 64-bit Windows.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path $env:LOCALAPPDATA 'Programs\VN Import Toolkit'
$data = Join-Path $env:LOCALAPPDATA 'VN Import Toolkit'
$cache = Join-Path $root 'downloads'
New-Item -ItemType Directory -Force -Path $root,$data,$cache | Out-Null
$mutex = New-Object System.Threading.Mutex($false, 'Local\VNImportToolkit.Desktop')
if (-not $mutex.WaitOne(0)) { throw 'Quit VN Library from its tray menu before installing.' }
$guard = $null
try {
    # Also excludes a surviving reader/import after its tray process has exited.
    $guard = [IO.File]::Open((Join-Path $data 'desktop.lock'), 'OpenOrCreate', 'ReadWrite', 'ReadWrite')
    $guard.Lock(0,1)
    $bundle = Get-Content (Join-Path $PSScriptRoot 'bundle.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $payload = Join-Path $PSScriptRoot 'app.zip'
    if ((Get-FileHash $payload -Algorithm SHA256).Hash.ToLower() -ne $bundle.sha256) { throw 'Application checksum mismatch.' }
    $destination = Join-Path $root ('app-' + $bundle.sha256.Substring(0,12))
    if (Test-Path $destination) { throw "This build is already installed at $destination. Open VN Library from Start." }
    $stage = Join-Path $root ('install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    [IO.Compression.ZipFile]::ExtractToDirectory($payload,$stage)
    $lock = Get-Content (Join-Path $stage 'windows\tools.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    function Fetch($item) {
        $file = Join-Path $cache $item.file
        if (-not (Test-Path $file)) {
            Write-Host "Downloading $($item.file)..."
            $partial = $file + '.partial'
            (New-Object Net.WebClient).DownloadFile($item.url,$partial)
            if ((Get-FileHash $partial -Algorithm SHA256).Hash.ToLower() -ne $item.sha256) { throw "Checksum mismatch: $($item.file)" }
            Move-Item $partial $file
        }
        if ((Get-FileHash $file -Algorithm SHA256).Hash.ToLower() -ne $item.sha256) { throw "Cached download checksum mismatch: $file" }
        return $file
    }
    foreach ($name in @('python','node','ffmpeg','vgmstream','fluidsynth')) {
        $item = $lock.tools.$name
        $archive = Fetch $item
        $temp = Join-Path $stage ('unpack-' + $name)
        [IO.Compression.ZipFile]::ExtractToDirectory($archive,$temp)
        if ($name -eq 'python') { Move-Item $temp (Join-Path $stage 'runtime') }
        else {
            $target = Join-Path $stage ('tools\' + $name)
            New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
            if ($name -eq 'node' -or $name -eq 'ffmpeg') {
                $folders = @(Get-ChildItem $temp -Directory)
                if ($folders.Count -ne 1) { throw "Unexpected $name archive layout" }
                Move-Item $folders[0].FullName $target
                Remove-Item $temp
            } else { Move-Item $temp $target }
        }
    }
    # The embedded runtime is isolated and needs the application root on sys.path.
    "python313.zip`n.`n..`nimport site`n" | Set-Content (Join-Path $stage 'runtime\python313._pth') -Encoding ASCII
    Write-Host 'Building the desktop launcher...'
    Add-Type -Path (Join-Path $stage 'windows\Launcher.cs') -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll -OutputAssembly (Join-Path $stage 'VN Reader.exe') -OutputType WindowsApplication
    Write-Host 'Checking Python and all conversion tools...'
    Push-Location $stage
    try {
        & (Join-Path $stage 'runtime\python.exe') -X utf8 -m vnkit.windows_tools
        if ($LASTEXITCODE -ne 0) { throw 'An import tool failed to start. Installation has not replaced your existing app.' }
        & (Join-Path $stage 'runtime\python.exe') -X utf8 -m unittest discover -s tests -p test_desktop.py -v
        if ($LASTEXITCODE -ne 0) { throw 'Desktop server tests failed. Your previous installation is unchanged.' }
    } finally { Pop-Location }
    Move-Item $stage $destination
    $exe = Join-Path $destination 'VN Reader.exe'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'VN Library.lnk'))
    $shortcut.TargetPath = $exe; $shortcut.WorkingDirectory = $destination; $shortcut.Save()
    $desktop = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'VN Library.lnk'))
    $desktop.TargetPath = $exe; $desktop.WorkingDirectory = $destination; $desktop.Save()
    foreach ($folder in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('Desktop'))) {
        $oldLink = Join-Path $folder 'VN Import Toolkit.lnk'
        if (Test-Path $oldLink) { Remove-Item $oldLink }
    }
    $run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    if ($null -ne (Get-ItemProperty $run -Name VNImportToolkit -ErrorAction SilentlyContinue)) {
        Set-ItemProperty $run -Name VNImportToolkit -Value ('"' + $exe + '" --tray')
    }
    $uninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VNImportToolkit'
    New-Item $uninstall -Force | Out-Null
    Set-ItemProperty $uninstall -Name DisplayName -Value 'VN Library'
    Set-ItemProperty $uninstall -Name DisplayVersion -Value $bundle.version
    Set-ItemProperty $uninstall -Name InstallLocation -Value $destination
    Set-ItemProperty $uninstall -Name UninstallString -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $destination 'windows\Uninstall.ps1') + '"')
    Write-Host 'Installed. Opening VN Library.'
} catch {
    Write-Host "Installation failed: $_" -ForegroundColor Red
    Write-Host 'Existing games and saves have not been deleted. Downloaded tools are kept for retry.'
    exit 1
} finally {
    if ($null -ne $guard) { $guard.Dispose() }
    $mutex.ReleaseMutex(); $mutex.Dispose()
}
Start-Process -FilePath $exe -WorkingDirectory $destination
