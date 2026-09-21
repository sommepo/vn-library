# Add game / Import ISO

Open **Library → Add game / Import ISO**. Everything stays on the reader's own
server; a browser file picker transfers from that device to the address shown.

Upload creates a second copy; the selected original file is never moved, modified
or deleted. The copy is `<state>/imports/<job-id>/source.iso` on the hosting
computer, which may be the same computer as the browser or a separate home server.
Choosing **On server** uses the existing file directly without an upload copy.
The uploaded ISO and conversion workspace remain after import; cleanup is not
automatic. Finished games play from the library without needing their source ISO.

1. Choose a local ISO and click **Add game**, or expand **Use an ISO already on
   the host** and click its Add game button.
2. The app copies the file where needed, identifies the edition and starts
   conversion automatically. No separate Inspect/Import clicks are required.
3. Stage messages show checking, preparing media/story, validating and installing.
   Once upload finishes and preparation starts, you can close the panel; the
   server owns the remaining work. Keep the desktop app/server running.
4. Choose **Open game** when ready. **Try again** resumes a stopped job; older
   uploaded jobs offer **Continue**, without another upload. Hashes and detailed
   diagnostics are in the collapsed **Details** section.

The server's `prepare` action chains identification and import in its single
worker. It stops on unsupported editions, changed sources, failed tool checks
or invalid output. Existing library games are preserved and offered for opening.
The older `inspect` and `import` API actions remain available for diagnostics.
Nothing queues or auto-retries a failure in a loop. While a worker is occupied,
Add game actions are disabled; finish that job before preparing another.

Supported adapters remain Japanese PS2 CLANNAD SLPM-66302 v1.01 and Remember11
SLPM-65550 v1.02. A successful import retains the edition's documented fidelity
limits. This interface does not establish new engine or route compatibility.

## Transfer and recovery

Uploads use sequential 4 MiB chunks, a 9 GiB file limit and at most four pending
transfers. **Pause upload** stops after the current chunk; closing the panel also
pauses. Select the same local file to resume after a disconnect/reload. Previously
received bytes are checked against per-chunk SHA-256 values before appending;
the complete server-side SHA-256 is recorded during inspection. The displayed
upload percentage is byte transfer only. A browser disconnect does not delete
received data. HTTPS/localhost is required for browser hashing.

Conversion jobs and logs live under `<state>/imports/<opaque-job-id>/`, outside
the served library. Status survives server restart; an interrupted conversion
can be resumed with the same source and workspace. Changed bytes fail closed.
The CLI's existing no-clobber checks preserve earlier outputs. A conversion that
fails validation stays outside the library; it is not shown as playable.
An installed game remains usable if its source ISO moves/disconnects.

The server import folder defaults to the toolkit root (the existing ISO folder).
Set `VNKIT_IMPORT_SOURCE_DIR=/absolute/iso-folder` in the launch environment to
choose another folder. Only immediate regular `.iso` files are listed; no web
filesystem browser or arbitrary path/command endpoint is provided. Folder paths
are configured locally, not accepted from browser requests.

The browser can pause transfers but does not yet cancel an active conversion.
There is no web deletion of source ISOs or automatic workspace cleanup. Retain
workspaces for resumability; do not manually remove a running job's files.
At least 24 GiB free on the staging filesystem is currently required before
conversion, separately from the source upload. This is a conservative preflight,
not an exact per-game estimate; keep the library on that filesystem for atomic
installation. Errors retain private logs and do not overwrite existing games.

## Setup, dependencies and boundaries

Use [CLANNAD setup](clannad-import.md) or [Remember11 setup](remember11-import.md)
to install pinned local media tools before the first conversion. The GUI checks
Node and FFmpeg/ffprobe for both games, vgmstream r2117 for CLANNAD, and FluidSynth
2.4.8/VGMTrans for Remember11. The [Windows test installer](windows.md) supplies
app-local versions; its full native conversion still needs a Windows device test.
The import GUI itself does not download software or game content. Existing optional
`private/tooling/audio-sysroot` is passed to CLI subprocesses automatically.
A failed dependency preflight offers **Try again** after local setup.
Each startup check now has a 60-second limit and reports its tool name in the
job status. A preflight timeout means conversion has not started; it is not a
time limit on the whole game import. Details are retained in the private job's
`preflight.log`, including captured tool output. The original 15-second checks
hid the tool name behind a generic TimeoutExpired message. Uploaded bytes remain
available when retrying with the updated app. The current Add game flow chains inspection and conversion automatically.

`vnkit/import_jobs.py` owns persisted jobs, bounded uploads and subprocess calls.
`vnkit/server.py` exposes same-origin, token-protected import endpoints through the
existing private listener/authentication. `web/import-ui.mjs` owns the panel.
The CLI remains the conversion implementation. The normal code package includes
these files and docs, never state/imports, uploaded discs or converted content.
The GUI is not a universal ISO converter and does not establish another engine's
compatibility. Direct-ISO playback and a full clean-install distribution audit
remain separate tasks in [the distribution plan](bring-your-own-iso-plan.md).

## Evidence from this change

- Actual HTTP upload and reload persistence tested using original synthetic bytes.
- Actual supplied CLANNAD ISO identified and fingerprinted; its existing import
  offered without duplicate conversion or save changes.
- Unit tests cover chunk retry/mismatch/gaps/limits, restart recovery, changed
  sources, traversal, symlinks and staged validation/install decisions.
- The staged conversion orchestration tests mock the CLI result; they are not a
  fresh full commercial-game conversion. Existing CLI conversion evidence remains
  in the per-game reports. A new full import from GUI on a clean machine has not
  been run in this change.
- Reader tests use temporary banks/profiles, not the live shared-save bank. No
  physical Android transfer or multi-gigabyte browser upload is claimed tested.
