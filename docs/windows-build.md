# Building the Windows package

The installer is original PowerShell and the tray app is original C# using
Windows Forms / NotifyIcon. There is no Electron, pystray or Pillow dependency.
The tray communicates with `vnkit.desktop_server` over its private stdin/stdout
pipes; shutdown is not exposed as an unauthenticated HTTP endpoint.

## Dependencies

`windows/tools.lock.json` pins the URLs and SHA-256 of:

- CPython 3.13.12 embeddable x64, app-local and started in UTF-8 mode.
- Node.js 22.22.1 x64 for content validation and route-path builders.
- FFmpeg 8.0.1, Gyan's Windows essentials build (GPLv3).
- vgmstream r2117 Windows x64 for CLANNAD CRI audio.
- FluidSynth 2.4.8 Windows x64 for Remember11, Never7 and Ever17's approximate original-bank synthesis.

These packages are downloaded directly at installation, not silently substituted
with whatever happens to be installed. Download checksums were recorded from the
actual archives; vgmstream, FluidSynth and FFmpeg match the upstream release
asset digests. Preserve every archive's licence files when extracting it.

Remember11's VGMTrans is cross-built from revision
`3e16daae49d42246f2d1b302b04f6e80a8037342`, with the existing filename-matching
and Sony PS2 pressure patches. The binary uses only KERNEL32 and msvcrt Windows
imports. It is accompanied by its full patched source, vendored libraries and
licences in `tools/vgmtrans/source.zip`, plus a receipt with hashes. These are
software sources, not game scripts. No game input is involved in this build.
Never7 and Ever17 use this same pinned converter and the existing FFmpeg/FluidSynth
tools. Adding them does not add a download or a separate runtime to the installer.

The installed libraries and application source remain replaceable. To rebuild
VGMTrans natively, extract that source and build the `vgmtrans-shell` CMake target
with `ENABLE_UI_QT=OFF` and `ENABLE_SHELL=ON`. Copy the rebuilt executable into
`tools/vgmtrans/`. Do not remove the original licence notices. For cross-building
on the development Linux host:

```sh
python3 scripts/bootstrap-remember11-media.py
python3 scripts/build-windows-vgmtrans.py
python3 scripts/build-windows-package.py \
  --vgmtrans private/tooling/windows-cross/repro-build/src/ui/shell/vgmtrans-shell.exe
```

The cross-build uses checksum-pinned Ubuntu MinGW packages in
`windows/cross-tools.lock.json`, unpacked locally without system installation.
The first bootstrap supplies the existing pinned source and host CMake tools;
it is Linux-only and not part of end-user Windows setup. CMake's generated build
files reference a temporary prefix: rerun the script to rebuild, rather than
calling Make directly after that temporary prefix has gone away.

The package builder first invokes the existing code-only allowlist, then adds
only the explicitly selected Windows converter and its source. It never globs
`private/` into the release. Output is a ZIP with Install.cmd, Install.ps1,
app.zip, a payload checksum and short instructions. It is not code-signed.
Nothing is uploaded or published by building it.

Setup builds `Launcher.cs` with Windows PowerShell 5.1's Add-Type and the standard
.NET Framework assemblies. It tests tool startup and the isolated desktop HTTP
lifecycle before changing shortcuts. Failure leaves the old installed build and
all user data alone. The first device test must still cover the actual PowerShell
installer, Windows DLL loading, native imports, GUI DPI and tray behaviour.

## Validation

**Do not run Wine on the development home server.** The attempted Windows checks
on 2026-09-21 coincided with the user's reported runaway explorer.exe processes
and host-wide OOM/reboot. Wine is the strongly suspected source; this task has not
performed a kernel-level incident investigation. A subsequent prefix-specific
process check found no remaining processes. Further execution testing belongs on
the Z13 or a dedicated VM with memory and process limits, not this shared host.

The patched VGMTrans executable reached its shell and exited under Wine. The
complete tool check did **not** pass: a newer FFmpeg shared build timed out, and
the stable 8.0.1 test returned a failure without useful stderr. Neither result
establishes behaviour on Windows. The installer now pins stable 8.0.1 and checks
it on the destination machine. Do not call these attempts Windows validation.

The C# launcher compiles with Mono's C# compiler against the .NET Framework
assemblies. Python unit tests cover the private control pipe, failed binds,
start/stop/restart, import stop protection, same-folder locking, adapter-specific
preflight and package pins. Linux tests do not establish native Windows support.
The Windows executable is cross-compiled, not tested on a physical PS2 or Windows
machine by that fact alone. Full native imports and the installer remain part of
the user's Z13 test.

## Reference documents

- [Microsoft NotifyIcon](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.notifyicon)
- [CPython embeddable distribution](https://docs.python.org/3.13/using/windows.html#the-embeddable-package)
- [FluidSynth 2.4.8 release](https://github.com/FluidSynth/fluidsynth/releases/tag/v2.4.8)
- [vgmstream r2117 release](https://github.com/vgmstream/vgmstream/releases/tag/r2117)
- [FFmpeg Windows build and licences](https://github.com/GyanD/codexffmpeg/releases/tag/8.0.1)

These are dependency documentation, not evidence of full-game Windows tests.
