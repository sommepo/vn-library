# Import and read this CLANNAD disc

The active library is `private/library/clannad-live`. With Tailscale connected,
the Z13 can open:

[Read CLANNAD](https://your-server.your-tailnet.ts.net:8891/?game=clannad-slpm66302-1.01).

This is a partial actual-game reader. Read [coverage and limits](clannad-runtime.md).
Pia Carrot and its assets remain preserved and paused.

## Existing server

```sh
cd '/path/to/vn-library'
python3 scripts/reader-service.py status
```

Use `start` if stopped, or `restart` after server-code changes. Do not start a
second listener on port 8891. Local access is
`http://127.0.0.1:8891/?game=clannad-slpm66302-1.01`. An SSH tunnel from Windows:

```powershell
ssh -N -L 8891:127.0.0.1:8891 user@your-server.your-tailnet.ts.net
```

Then use `http://localhost:8891/?game=clannad-slpm66302-1.01` on Windows.
See [remote access](remote-access.md) for HTTPS/WSS and authentication details.
Do not reset existing Tailscale routes or enable public Funnel.

## Dependencies

Python 3.11+ standard library handles inspection, extraction, PNGs and serving.
Node 22+ performs validation/tests. There is no npm build or inference dependency.
CLANNAD audio needs optional **vgmstream r2117**; movie/FLAC output needs FFmpeg
and ffprobe, tested **8.0.1-3ubuntu2**. The decoder bootstrap downloads software
only into private tooling and verifies the exact ZIP SHA-256:

```sh
python3 scripts/bootstrap-clannad-media.py
python3 scripts/bootstrap-clannad-media.py --cached-only
```

On the development host, the existing pinned FFmpeg sysroot is reused through
`sh scripts/audio-tools-env.sh COMMAND ...`. Its exact Ubuntu package versions
and hashes are in `scripts/audio-tools.lock.json`. Nothing is installed globally
by import. On another Linux host, provide FFmpeg/ffprobe on PATH; on a compatible
Ubuntu archive the tested package can be installed with
`sudo apt-get install ffmpeg=8.0.1-3ubuntu2`. Distribution/version availability
may differ; record a different tool version and revalidate its output instead of
claiming bit-identical derivatives. VGMTrans and FluidSynth are not needed for
CLANNAD. The optional full older toolchain bootstrap is not part of this import.

Browser tests optionally use the existing pinned Playwright 1.55.0/Chromium 140
cache. See [testing setup](testing.md). Test profiles are isolated from user saves.

## Repeatable commands

Run from the repository root. The input ISO remains untouched.

```sh
python3 -m vnkit inspect 'Clannad (Japan).iso' --fingerprint
python3 -m vnkit extract 'Clannad (Japan).iso' --level disc --out private/clannad/disc
python3 -m vnkit extract private/clannad/disc --level archives --out private/clannad/resources-v2
sh scripts/audio-tools-env.sh python3 -m vnkit import private/clannad/disc --adapter clannad-ps2 --work private/clannad --out private/library/clannad-live
python3 -m vnkit validate private/library/clannad-live
```

On a machine with FFmpeg/ffprobe on PATH, omit the environment wrapper. Import
runs extraction, native-size graphics, all audio, movie conversion and reader
packaging. **Import and full validation exit 3 while runtime support remains
incomplete**, even when a usable partial reader was built. Exit 2 is a format,
dependency or I/O failure. Inspect the printed status and private reports.

Exact files safely resume; changed files are never overwritten. For a changed
adapter or conversion setting, use a new build destination outside the served
library, validate it, and move the previous import into a private backup before
promoting the new one. Two packages with the same game ID must not compete in
the served library. Keep the same source view for an existing extraction workspace:
its manifest distinguishes ISO bytes from the extracted directory fingerprint.
The current cache was made from `private/clannad/disc`; reusing it with the ISO
view correctly refuses a changed manifest. For a fresh workspace either view works. An extracted disc directory is also
accepted, but should have its own new workspace.

Once media is already converted, the reusable packaging step is:

```sh
python3 -m vnkit.adapters.clannad_import private/clannad/disc --work private/clannad --out private/clannad/new-build
```

This packaging-only command reports `incomplete-runtime`; exit 0 means packaging
succeeded, not that full execution was validated. Standalone converters:

```sh
python3 -m vnkit.adapters.clannad_media private/clannad/resources-v2 --out private/clannad/media-v3
python3 -m vnkit.adapters.clannad_audio private/clannad/disc --out private/clannad/audio-v1 --workers 4
python3 -m vnkit.adapters.clannad_effects private/clannad/disc --out private/clannad/effects-v1
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.clannad_movie private/clannad/disc/OPENING.PSS --out private/clannad/movie-v1
```

43,088 audio conversions may take several minutes; later runs hash-check and
resume each resource. Private decoded assets occupy roughly 6.5 GiB per complete
reader/media copy; allow additional room for the ISO, extraction and retained
previous builds. Conversion never upscales artwork or resamples audio by default.

## Learning output and backups

- **Copy / Alt+C** writes on the reading device. Selected Japanese copies normally.
- In **Aa**, enable automatic copying if desired. HTTPS/localhost and browser
  permission are required; failure gives a status and leaves explicit Copy usable.
- **Live text** opens a clean companion page; it has no activity timer.
- In **Aa**, enable WebSocket publishing, then copy its private receiver URL into
  Renji's connector. Default `format=sentence` emits JSON with `sentence`;
  `format=plain` emits text only; `format=json` emits structured source/occurrence
  events. No old text is replayed on reconnection. Keep the token URL private.
- **Saves → Export current state** or a slot's Export backs up game state.
- **Activity → Export activity JSON** backs up history/bookmarks; CSV exports
  session summaries. Import saves and activity separately in the intended browser.

Saves/history live in the **browser profile**, not in the ISO or Linux clipboard.
Changing between localhost and the Tailscale URL changes browser storage origin;
export/import is how to transfer saves and statistics. Loading an earlier game
save does not roll back activity. Back up `private/state` for relay deduplication,
but it is not a substitute for browser save/history exports.

## Personal checks

1. Open the direct CLANNAD link on the Z13; check music after a user gesture and
   an original voiced line. If autoplay is blocked, Aa → Enable audio.
2. Select Japanese and use Yomitan; confirm dictionary interaction never advances.
3. Try a choice, quicksave/load, backlog search and normal/automatic copying.
4. Connect Renji and check one complete sentence per presentation, none on reload.
5. Export both save and activity, then import into a separate browser profile.

Do not expect completed routes yet. At a source-located unsupported command,
save your position and retain the error ID for adapter work; do not fabricate a
way around the instruction.
