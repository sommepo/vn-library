# Import the tested Remember11 PS2 edition

Supported pilot: Japanese standard **SLPM-65550 v1.02**, with the exact executable
fingerprint in [runtime notes](remember11-runtime.md). This is an incomplete
playable adapter, not universal KID or PS2 support. Owners supply their own ISO.

## Existing server

```sh
cd '/path/to/vn-library'
python3 scripts/reader-service.py status
```

[Read Remember11 over Tailscale](https://your-server.your-tailnet.ts.net:8891/?game=remember11-slpm65550-1.02)
or use `http://127.0.0.1:8891/?game=remember11-slpm65550-1.02` locally.
CLANNAD remains available in the same library, with separate game/save identities.
Do not start another process on the occupied port. Use the existing isolated
service helper if it needs starting/restarting; do not edit unrelated services.

## Reproduce the conversion

Python 3.11+ for import/server, Node 22+ for validation, and the pinned external
media tools. Allow substantial disk space: the existing import is about 8 GiB,
besides the original ISO, extracted archives, conversion cache and tool cache.
There is no inference, paid API or game-resource download.

```sh
python3 scripts/bootstrap-remember11-media.py
python3 -m vnkit inspect 'Remember11 - The Age of Infinity (Japan).iso' --fingerprint
sh scripts/audio-tools-env.sh python3 -m vnkit import \
  'Remember11 - The Age of Infinity (Japan).iso' --adapter remember11-ps2 \
  --work private/remember11 --out private/library/remember11-live
python3 -m vnkit validate private/library/remember11-live
node scripts/validate-remember11.mjs private/library/remember11-live \
  private/remember11/new-validation.json
```

Use `--cached-only` with the bootstrap to verify installed dependencies without
network access. It reuses the historical audio-tools installer for **software
dependencies only**, never opening or modifying the paused Pia disc/import.
`scripts/audio-tools.lock.json` pins 187 package downloads and VGMTrans's revision;
`scripts/vgmtrans-remember11-pressure.patch` adds the required channel-pressure
decoder. The separate Remember11 binary/receipt lives under `private/tooling`.
An alternative binary can be selected with `VNKIT_VGMTRANS`.
The installed cached toolchain and conversion commands were verified in this
workspace. A completely fresh machine/container bootstrap has not been retested
end to end; preserve and report dependency/build diagnostics rather than treating
the private cache as something distributed with the toolkit.

Import performs safe archive extraction, full image/audio/music/movie conversion,
scenario parsing and final content assembly. A matching rerun uses checked caches;
different output is refused. After adapter changes, use fresh work/output paths.
Never delete user work just to make a rerun pass. Do not serve two imports with
the same game ID simultaneously. ISO and extracted-disc sources have distinct
source manifests and should use separate workspaces.

Successful incomplete import and validation deliberately exit **3**. Actual
conversion/format/dependency failure exits **2**. The library accepts the former
as playable, with an explicit compatibility report. Keep all generated content
inside `private/`; the shared package contains code, docs and synthetic tests.

Lower-level resumable operations:

```sh
python3 -m vnkit extract 'Remember11 - The Age of Infinity (Japan).iso' \
  --level archives --out private/remember11/archives-v2
sh scripts/audio-tools-env.sh python3 scripts/convert-remember11-media.py \
  private/remember11/archives-v2 --out private/remember11/media-v2 --kind image --jobs 4
# Repeat with --kind voice, sound, music (music also accepts --vgmtrans PATH).
sh scripts/audio-tools-env.sh python3 scripts/convert-remember11-movies.py \
  private/remember11/movies-source --out private/remember11/media-v2/movies
```

The CLI itself extracts the movie source files before invoking conversion.
`python3 -m vnkit.adapters.remember11_import ... --prepared` assembles an already
verified cache; it is a development shortcut, not a way to skip missing assets.
The standalone `manifest.json` records source fingerprints, settings and output
hashes; `conversion-provenance.json` additionally retains per-asset input/output
hashes, converter versions, instrument synthesis metadata and movie roundtrip
evidence. These reports contain private source mappings and are not release files.

## Test and troubleshoot

```sh
python3 -m unittest discover -s tests -p test_remember11.py -v
node tests/remember11-vm.test.mjs
node tests/remember11-real-smoke.mjs private/library/remember11-live 150 \
  private/remember11/new-smoke
VNKIT_REPORT_DIR=private/browser-tests/remember11-new \
  sh scripts/browser-env.sh node tests/browser-remember11.mjs
```

Private, recorded chapter paths can generate assumed read markers:

```sh
node scripts/build-remember11-read-paths.mjs private/library/remember11-live \
  private/remember11/verified-path-inputs.json private/library/remember11-live/read-paths.json
```

The input has `kokoro` and `satoru` records with `choices: [{id, option}]` and an
expected source `ending`. The builder replays Kokoro from fresh state, carries
its actual earned progress into Satoru and rejects changed choices or a missing
clear flag. It writes only privately and refuses different existing output. The
owner-specific choice list is not bundled in public code. Reading normally works
without this optional sidecar; manual completion then has no assumed text path.

Browser tests require the optional [pinned browser setup](testing.md), ephemeral
loopback sockets and an isolated profile. They create a temporary save server;
never point tests at the live shared-save bank. Actual scene screenshots and
reports stay private. The guided/DFS harnesses execute the same VM, simulate
timers and keep source-specific choice lists out of public tests.

- `No tested edition adapter`: inspect serial and ELF; do not rename an ISO to
  bypass detection or reuse CLANNAD's engine.
- `BIP atlas tile outside pixels`: verify current ten-section portrait support;
  do not crop away rejected pixels or substitute thumbnails.
- SQ channel-pressure failure: check the Remember11 VGMTrans receipt/patch.
- `Missing Sony SShd audio header`: MV08 is a known video-only case; the bounded
  movie converter proves this before accepting silence. Other files still fail.
- `refusing to overwrite different file`: use a new destination/versioned cache.
- Source-located runtime error: retain the save and exact source ID. Do not skip
  unknown instructions to continue a route.

Use Settings to enable automatic clipboard or WebSocket output. The receiver URL
there contains a private token; never publish it. Live text works without external
hooking. Saves → Save location enables optional sharing with this home server.
Export saves/global progress there and activity JSON from Activity. For server
backups use `scripts/backup-shared-saves.py`; see [shared-save rules](shared-saves.md).
