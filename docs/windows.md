# Windows test installer

The Windows package installs a small tray app, its own Python runtime, and the
conversion tools for CLANNAD, Remember11, Never7, Ever17, Cartagra and Higurashi Matsuri: Kakera Asobi. You do not need to install Python,
Node or FFmpeg yourself. It is a test build for Windows 10/11 x64; testing on a
real Windows device is still required for the newer Ever17, Cartagra and Higurashi imports.

The **v0.1.0-beta.3** release includes the Ever17, Cartagra and Higurashi importers, animated
BIOS menu and local/shared save-copy controls. Quit VN Library from the tray,
extract `VN-Library-Windows-v0.1.0-beta.3.zip` and run `Install.cmd`. Games and
saves stay in the same data folder. The earlier beta.2 predates these additions.
The newer imports still need full conversion tests on Windows hardware.

## Install

1. Extract the latest `VN-Library-Windows-*.zip` completely.
2. Double-click **Install.cmd**. Keep the setup window open while it downloads
   and checks the tools. Internet access is needed for about 165 MB of downloads.
3. Open **VN Library** from Start or its desktop shortcut.
4. The browser opens when the server is ready. Choose **Add game**, select your
   ISO and click **Add game**. Identification and conversion follow automatically.

No administrator access is needed. The installer does not change your system
PATH, Python installation, firewall or Linux server. It downloads software from
fixed URLs and verifies SHA-256 hashes before using it. It includes no game files.

The package is unsigned. A signed installer is future release work; this test
build starts through the included command script. If Windows or an organisation
policy blocks it, keep the error message rather than changing system-wide policy.

## Tray and settings

To open the app again after choosing **Quit** in the tray menu, search for
**VN Library** in the Windows Start menu, or double-click its desktop
shortcut. It starts the local server and opens the reader in your
browser. **Open reader** remains available if needed. Do not rerun Install.cmd. A browser bookmark alone cannot start the app.

Closing the window keeps the reader running in the tray. Double-click its tray
icon to reopen Settings, or use its menu to open the reader, start, stop or quit.
**Start in the tray when I sign in** is optional and off by default.

The default port is **8891**. To change it, stop the reader, enter another port,
click **Save port**, then Start. The choice persists in `desktop.json`.

A port on your Windows computer is independent of the same port on your Linux
server. Only a program listening on the same Windows computer can conflict.
The app reports a conflict; it does not kill the other program or silently change
ports. A second tray app reports that the first is already running.

Changing the port changes the browser address. Export browser-local saves and
activity from the old address first; they do not automatically move to a new
origin. Shared saves remain in this host's data folder. A Windows host and a Linux
host have separate shared-save banks: using the same port does not connect them.
To continue using the Linux server's existing shared bank, open its usual URL.

The tray app binds to `127.0.0.1` only. Remote access is not enabled by installing
it. The existing authenticated [remote hosting options](remote-access.md) remain
available separately; this installer does not configure Tailscale for you.

## Games, saves and updates

**Upload copies the ISO; it does not move it.** Your original remains unchanged
in its original folder. With this Windows app hosting the reader, the new copy
is stored at `%LOCALAPPDATA%\VN Import Toolkit\state\imports\<job-id>\source.iso`.
If you instead open a reader hosted on another computer, the upload goes to that
computer. Selecting an ISO already listed as **On server** uses it in place.

Import creates extracted files and converted assets, then installs the playable
game in `library`. The uploaded ISO and conversion workspace are retained for
recovery and resumability, even after import finishes. They are not automatically
cleaned up. Playing a finished import needs only its library files, not the ISO.
Budget disk space for the uploaded copy, workspace and finished game.

Application versions live in:

```text
%LOCALAPPDATA%\Programs\VN Import Toolkit\app-<build-id>\
```

Your data stays in:

```text
%LOCALAPPDATA%\VN Import Toolkit\
  library\          imported game folders
  state\            shared saves, relay database and private import jobs
  desktop.json      port setting
  desktop.log       launcher and server diagnostics
```

Local saves and activity are stored in each browser. Back those up through the
reader's export controls. For a complete server backup, quit the reader and copy
the data folder. Do not run the CLI server and tray server against the same data.

To move your own completed import from Linux, quit the Windows reader and copy
the entire game folder, including `content.json` and all subfolders, into its
`library` folder. Then start it again. The ISO is not needed to play a completed
import. Copying game files does not move browser-local saves or activity.

To update, quit from the tray and run the new package's Install.cmd. Each build
gets a separate application folder. Setup checks all tools and server lifecycle
before updating the shortcuts. It keeps previous versions and never deletes your
game data. Interrupted setup leaves a staging folder and cached downloads so the
failure can be investigated; a retry creates fresh staging.

Uninstall through Windows Installed apps. The uninstaller removes this app's
versions, download cache, shortcuts and optional start-at-login entry. **Games,
saves, activity and port settings are kept.** An active import blocks normal
Stop/Quit; let it finish. An unfinished browser upload can be resumed later.

## First Z13 test

If the original test build reports `TimeoutExpired: import stopped`, install the
updated import-fix build after quitting the old app from the tray. It retains
your uploaded ISO and import job. Open Add game and choose **Try again** (or **Continue** for an older upload);
there is no need to upload again. Tool checks now allow 60 seconds and identify
the failing tool. If it still fails, use **Open data folder** and inspect
`state\imports\<job-id>\preflight.log`, or report the new message. Increasing the
startup allowance is not proof that the underlying tool issue is resolved.

- Install without a pre-existing Python/Node setup. Note any failed tool check.
- Open the reader in Firefox and Chromium. The library is empty until a game is imported.
- Close the window and reopen it from the tray. Test Stop, Start and Quit.
- Change the port, restart the app and check it remembers the setting.
- Launch a second copy and check that it leaves the running reader alone.
- Try the optional start-at-login setting, then disable it again if unwanted.
- Use **Check tools**, then import each supported ISO through Add game. Allow
  24 GiB of workspace in addition to the ISO; Remember11 conversion takes time.
- Check Japanese filenames/paths, voices, music, a choice, save/load and resume.
- Try local and shared saves separately. They do not sync to the Linux host.
- Test an update and uninstall after backing up. Confirm the data folder remains.

Keep error wording and `desktop.log` if something fails. Import logs can contain
private source paths; inspect them before sharing. Do not include game data or
saves in a public bug report.

See [build instructions and evidence](windows-build.md) for exactly what has
been tested here. The earlier Python/Tk source preview remains available through
`py -3 -X utf8 -m vnkit.desktop`, but the installer uses the Windows tray app and
does not require Tk.

### FluidSynth startup timeout

Use the latest installer, then Try again on the existing upload. No second upload
is needed. Check tools and import now use the same isolated FluidSynth check.
If it still stops, copy the error including “Last step”, or open the job's private
`preflight.log` in the data folder. The reported stage distinguishes a library
load stall from version lookup or process shutdown. We have not yet confirmed a
complete Windows conversion on the Z13.

The app is named VN Library. Existing AppData folders retain the earlier
`VN Import Toolkit` name so upgrades preserve games and saves.
