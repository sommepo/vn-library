# Upstream research and code provenance

## Remember11 runtime additions (2026-09-21)

The KID bytecode decoder/interpreter, image tile reconstruction and private import
pipeline are original MIT toolkit code, derived from static inspection of the
owner's SLPM-65550 executable/archives. No PSP translation script, translated text
or unlicensed interpreter code was copied. The earlier Remember11 research and
AFS/LZSS attribution remain below. The original toolkit's Sony SQ parser and PSS
helpers are reused where the measured formats match; this does not imply reuse
of CLANNAD or Pia story engines.

Optional music conversion uses the already pinned zlib-licensed VGMTrans revision
`3e16daae49d42246f2d1b302b04f6e80a8037342`, with existing filename matching and the
new `scripts/vgmtrans-remember11-pressure.patch`. The latter adds MIDI channel
pressure parsing to its Sony sequence decoder; retain `third_party/LICENSE-vgmtrans.txt`.
FluidSynth 2.4.8 and FFmpeg 8.0.1 are external conversion tools, with pinned
packages/licence boundaries in `scripts/audio-tools.lock.json`. The bootstrap
uses a separate Remember11 binary; no external binaries or game banks ship in
our code package. Per-asset provenance distinguishes the original and patched
converter binaries actually used, rather than claiming every cached track used
the latest patch. `conversion-provenance.json` accompanies the private import.

The walkthrough author's [Kokoro](https://yuh-nagomi.jp/text/article/game/r11-4.htm)
and [Satoru](https://yuh-nagomi.jp/text/article/game/r11-5.htm) choice guides were
consulted as test-input suggestions. The interpreter's source conditions determine
the resulting path; a walkthrough claim is not a correctness oracle. The tested
choice lists/checkpoints remain private, and no walkthrough prose is distributed.
Original-console audiovisual comparisons remain unperformed.

Inspected 2026-09-07. Public code was fetched read-only to a temporary research directory; no original game content was downloaded. Commit hashes below pin the source inspected. These references establish format/tool facts, not proof of a faithful port.

## Reused implementation

**PS2-Visual-Novel-Tool**, punk7890, revision `e27f4f940af07f46ae1dbed7cdefd9e4be5cf667`.

- [Pinned repository](https://github.com/punk7890/PS2-Visual-Novel-Tool/tree/e27f4f940af07f46ae1dbed7cdefd9e4be5cf667)
- [Licence](https://github.com/punk7890/PS2-Visual-Novel-Tool/blob/e27f4f940af07f46ae1dbed7cdefd9e4be5cf667/LICENSE): MIT, copyright 2024 punk7890.
- [Game selection](https://github.com/punk7890/PS2-Visual-Novel-Tool/blob/e27f4f940af07f46ae1dbed7cdefd9e4be5cf667/src/scenes/main.gd#L1539) routes Pia Carrot 3: Round Summer to AlphaUnit.
- [Alpha Unit resource decoder](https://github.com/punk7890/PS2-Visual-Novel-Tool/blob/e27f4f940af07f46ae1dbed7cdefd9e4be5cf667/src/scenes/alphaUnit.gd#L223) documents the PIA3-specific MLH/NBP variant. [NFP extraction](https://github.com/punk7890/PS2-Visual-Novel-Tool/blob/e27f4f940af07f46ae1dbed7cdefd9e4be5cf667/src/scenes/alphaUnit.gd#L459) corroborates the disc archive directory layout.
- [Common conversion routines](https://github.com/punk7890/PS2-Visual-Novel-Tool/blob/e27f4f940af07f46ae1dbed7cdefd9e4be5cf667/src/comFuncs.gd#L1043) provide the LZSS ring-buffer convention and palette permutation.

`vnkit/adapters/pia_media.py` adapts those resource algorithms into bounded Python decoders. It adds range/size limits, linked-list cycle checks, malformed-name rejection and explicit unsupported-format errors. It writes native-size PNG without resampling. The retained upstream notice is `third_party/LICENSE-ps2-vn-tool.txt`; retain it when distributing the adapted module. The toolkit does not bundle Godot or upstream executable builds.

The upstream resource extractor does **not** implement this game's script virtual machine. Its PIA3 image branch has acknowledged uncertain visual cases; that is not evidence to discard native behaviour. The current module rejects 4-bit pixels and tile direction 3 explicitly. RGB/RGBA samples are preserved; indexed RGB5A1 samples are expanded to PNG RGBA. PF effect masks are one byte per sample despite their bpp=24 header, corroborated by all 23 supplied PF members. PS2 blending and chroma-key composition still require native-engine verification.

## Reader and conversion references: inspected, not copied

**Tsukiweb**, requinDr, revision `fe2aec9342aab956e80a73d1124c6a1fa9ec2b47`.

- [Reading interface](https://tsukiweb.holofield.fr/)
- [Pinned source](https://github.com/requinDr/tsukiweb-public/tree/fe2aec9342aab956e80a73d1124c6a1fa9ec2b47)
- [Resource reproduction guide](https://github.com/requinDr/tsukiweb-public/wiki/Recreating-the-resources)
- [Script player](https://github.com/requinDr/tsukiweb-public/blob/fe2aec9342aab956e80a73d1124c6a1fa9ec2b47/src/engine/ScriptPlayer.ts)
- [NScripter conversion](https://github.com/requinDr/tsukiweb-public/blob/fe2aec9342aab956e80a73d1124c6a1fa9ec2b47/tools/helpers/convert-scripts/utils/nscriptr_convert.ts)

The repository tree and metadata exposed no repository-level licence grant at this revision. Accordingly, no Tsukiweb code, translations, art or assets are copied into this toolkit. This is a conservative distribution decision, not a legal opinion on every file. Obtain explicit permission or verify a future applicable licence before reuse; public visibility alone is insufficient.

The documented conversion takes Tsukihime's `arc.sar` and Japanese `nscript.dat`, plus separately supplied CD audio; it includes optional image enhancement. That pipeline is specific to its source data and does not identify a PS2 engine. Our supplied image instead uses NFP/MLH/NBP resources and SCRP bytecode. Tsukiweb provides a useful presentation reference, but its importer cannot be applied to these files. Its image-upscaling workflow is deliberately not a default here.

## Renji WebSocket compatibility

**Texthooker UI**, Renji-XD, revision `83212c8c30bba61aafc3a2910ab8dee49907543c`.

- [Live reader](https://renji-xd.github.io/texthooker-ui/)
- [Pinned receiver implementation](https://github.com/Renji-XD/texthooker-ui/blob/83212c8c30bba61aafc3a2910ab8dee49907543c/src/socket.ts#L93)
- [Connection UI](https://github.com/Renji-XD/texthooker-ui/blob/83212c8c30bba61aafc3a2910ab8dee49907543c/src/components/SocketConnector.svelte)
- [Licence](https://github.com/Renji-XD/texthooker-ui/blob/83212c8c30bba61aafc3a2910ab8dee49907543c/LICENSE): MIT, copyright 2023 Renji-xD. No implementation copied.

The actual receiver opens an ordinary WebSocket URL. Each received message is parsed as JSON when possible; a truthy `sentence` value is used, otherwise the original frame text is forwarded to the line stream. Therefore send one complete Japanese segment as a UTF-8 text frame, or a JSON object containing a nonempty string `sentence`. A JSON object without that field, an empty sentence, or a control/status event is displayed as raw content. Keep such events out of both compatibility feeds. Binary frames are not part of the documented contract.

The receiver adds no occurrence-ID deduplication and performs no authentication-message exchange. The publisher must suppress restoration/reconnect duplicates, avoid replay on connection, and use a URL token when authentication is required. Browser Origin checks should allow only intended origins. Scheme and browser policy matter: a hosted HTTPS page may block insecure remote `ws://`; use local access or authenticated HTTPS/WSS. Reader text comes directly from our presentation event, with no Textractor dependency.

Example interoperable JSON frame, using original fixture text only:

```json
{"sentence":"今日は晴れです。","gameId":"synthetic-v1","sessionId":"example-session","sourceSegmentId":"fixture:start:1","occurrenceId":"example-occurrence","speaker":"案内人","timestamp":"2026-09-07T12:00:00Z","navigation":"advance","skip":false}
```

The concrete toolkit event version and endpoint configuration are documented with its reader/server interface. Source inspection verifies the wire contract; live receiver/device checks must be recorded separately from local relay tests.

## Other candidates assessed

**GARbro**, morkt, revision `b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0`.

- [Pinned repository](https://github.com/morkt/GARbro/tree/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0)
- [Licence](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/LICENSE): MIT, copyright 2014–2020 morkt.
- [Supported-format catalogue](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/docs/supported.html)

Its catalogue contained no match for Pia Carrot, NFP, MLH, NBP or Alpha Unit when inspected. The tree includes PC F&C format handlers; a shared publisher is insufficient evidence for compatibility with this console edition. The game-specific PS2 extractor above is the better evidenced resource reference. GARbro was not installed, run or copied. A negative catalogue search is not proof that no extension or fork could support the files.

**Play!**, jpd002, was assessed as an alternative to engine rewriting. Its [upstream README](https://github.com/jpd002/Play-/blob/master/README.md) documents an experimental browser build using Emscripten and identifies browser emulation limitations. Its [licence](https://github.com/jpd002/Play-/blob/master/License.txt) is a two-condition BSD-style grant requiring notice preservation. No Play! code or binaries are bundled. We did not establish title compatibility or a semantic DOM text interface. A future emulator integration must prove both, plus state synchronization, before it can satisfy the reader requirements. Lack of an integrated emulator here should not be misreported as proof that browser emulation is impossible.

Searches for an existing Alpha Unit SCRP story interpreter or this PS2 title's script tooling did not identify a proven reusable implementation. Resource extraction success remains separate from virtual-machine and native gameplay fidelity.

**vgmstream**, revision `09c9f40caae4747e44b6a993b3d5b654cef4d1f7`, was inspected for audio applicability. The [upstream licence](https://github.com/vgmstream/vgmstream/blob/09c9f40caae4747e44b6a993b3d5b654cef4d1f7/COPYING) permits use and redistribution with its copyright/permission notices; optional libraries have their own licences. No code or builds are bundled. Its [KCEO VAS handler](https://github.com/vgmstream/vgmstream/blob/09c9f40caae4747e44b6a993b3d5b654cef4d1f7/src/meta/vas_kceo.c) expects a format-specific size/rate header, and its [Rockstar VAS handler](https://github.com/vgmstream/vgmstream/blob/09c9f40caae4747e44b6a993b3d5b654cef4d1f7/src/meta/vas_rockstar.c) expects `VAGs`/`2AGs`. The sampled supplied VAS files have neither header. Their raw frames resemble PS ADPCM, but rate, channels and interleave require executable evidence; a filename extension cannot supply them. `NMUS.NFP` instead contains BD/HD sound banks and SQ sequences. The opening video is `NETC.NFP/OPENNING.PSS` with an MPEG program-stream pack header. None of these findings establishes browser playback or reliable dialogue/voice associations.

## Distribution boundary

Optional local testing used Playwright core 1.55.0 (Apache-2.0; retained licence
inside its downloaded tarball), its pinned Chromium 140 / Firefox 141 builds, and local
Ubuntu shared libraries/fonts. None is shipped or required by the reader/server.
`scripts/bootstrap-browser.sh` verifies the exact Playwright tarball SHA-256;
`docs/testing.md` records the tested environment. Review browser/library licences
separately before redistributing those optional tools.

Original toolkit code and original synthetic fixtures are covered by the repository's own licence. Their licence does not cover imported game data or third-party code. Keep discs, extracted binaries/scripts, media, private validation previews and study history outside the code-only package. Do not include public upstream game translations merely because a source repository contains them. Users supply their own authorised files. Dependency licences and attribution must be revisited whenever a new adapter or dependency is added.

## Source-bank music tools added 2026-09-08

VGMTrans revision `3e16daae49d42246f2d1b302b04f6e80a8037342` is used locally
to extract the original Sony PS2 sound banks. It is zlib licensed; the retained
notice is `third_party/LICENSE-vgmtrans.txt`. The narrowly scoped local patch
`third_party/vgmtrans-filename-match.patch` fixes basename/extension matching.
The original toolkit SQ converter preserves source sustain events; it does not
reuse an upstream game script or substituted soundtrack. FluidSynth renders
those original banks, with documented SPU2 synthesis differences. FFmpeg makes
the browser video/audio derivatives. No tool binaries, sound banks, movies or
music are included in the code package.

See [audio provenance, pinned bootstrap and limitations](pia-audio.md) and
`scripts/audio-tools.lock.json` for exact source revisions, package versions,
SHA-256 values and licence/distribution boundaries. Browser loop seeking uses
recovered markers but remains approximate; neither synthesis nor native loop
state has been compared with a running PS2.


## CLANNAD / HuneX additions (2026-09-17)

The new importer reuses original toolkit disc, DOM reader, PSS conversion and
learning infrastructure. No original-game content is redistributed.

- [mangetsu](https://github.com/rschlaikjer/mangetsu), Ross Schlaikjer, MIT
  (2021): MZX/MRG algorithm reference adapted into bounded Python in `hunex.py`.
  Exact notice retained in `third_party/LICENSE-mangetsu.txt`. Inspected
  `src/data/mzx.cpp` SHA-256
  `8794720a495c4cb3357ecd1118501a082f17a6c69ebcfeaf0f8dd3ed767e06ba`;
  `src/data/mrg.cpp` SHA-256
  `e20d29a0eafba6389187b9665e9b802b04659fdbcbee91399554d7d358841db2`.
  These identify the consulted source bytes without asserting an unverified
  commit identifier. Its incomplete reset handling was checked against the native
  decoder. It is an asset tool, not a CLANNAD interpreter.
- [PS2 Visual Novel Tool](https://github.com/punk7890/PS2-Visual-Novel-Tool),
  MIT, pinned revision already recorded above: inspected `huneX.gd` and common
  palette helpers. Related game variants do not establish direct CLANNAD support.
- [psp-ayakashibito_tools](https://github.com/mchubby/psp-ayakashibito_tools):
  format notes consulted. No repository licence identified; implementation code
  was not incorporated. Likewise no code from the unlicensed candidate
  PS-HuneX_Tools or mahoyo_tools repositories was copied.
- [vgmstream r2117](https://github.com/vgmstream/vgmstream/releases/tag/r2117):
  optional Linux audio decoder used locally for original AHX/ADX. Upstream
  ISC-style permission/copyright notice retained in
  `third_party/LICENSE-vgmstream.txt`; bundled optional libraries have their own
  notices. ZIP SHA-256
  `2f98c77f756079f63fbd119939067f1ed461d77e70993bc4cc372736d859c84a`.
  Bootstrap verifies that hash. The binary and its libraries are not distributed
  in our code package or container.
- FFmpeg 8.0.1-3ubuntu2: reused existing private pinned software, with package
  versions/hashes in `scripts/audio-tools.lock.json`. This build enables GPL
  components; it is an external conversion process, not linked into our MIT code.
  No FFmpeg binary or library is in the shared package.

Image composition, archive sector carry, script/native dispatch, labels, default
names and media associations were recovered read-only from the supplied
SLPM-66302 executable and archives. Recovered tables/scripts are private generated
content, not hardcoded public fixtures. Renji/Tsukiweb licence and wire-contract
findings above continue to apply to the shared reader.

CLANNAD SE.ACX short effects use that same pinned vgmstream decoder on bounded
ADX members. Their priority over similarly named VSE entries comes from the
original SE_NAM/ELF lookup, not from filename guesses. No additional upstream
code or game content was added to the public package for this sound support.

## Reference-inspired reader chrome

`web/classic.css` is original MIT-licensed CSS, inspired by the user-supplied
CLANNAD screenshot. No pixels, game UI assets, fonts, date badge or English text
from that screenshot are bundled. Original CLANNAD media remain private.


Event 30/10, MSNL and literal name checks were implemented from read-only native
callback/dispatcher evidence in the supplied executable. New renderer/VM/audit code
is original MIT code; recovered frame tables, strings, images and sound resources
remain generated private data. No additional external code or assets were used.


## CLANNAD basic execution additions (2026-09-17)

The basic-event allowlist, source-parameter handling, global progress and bounded
condition-evaluator probe are original implementations derived from the user's
local SLPM-66302 executable/script evidence. No upstream implementation, game
binary or recovered story strings are bundled. Native addresses and reasoning
are documented in `docs/clannad-basic-execution.md`; all raw instruction dumps,
metadata strings, route traces and actual test checkpoints remain private. The
probe is restricted to one hashed ELF/function range and 20,000 instructions,
with no syscalls, hardware, executable entrypoint or arbitrary code addresses.
Original toolkit additions retain the repository MIT licence and existing notices.

## Menu and calendar additions (2026-09-19)

Original date badges and all sound-test recordings come only from the local ISO,
with DDAT's lookup recovered from the fingerprinted executable. The renderer,
progress checklist and completion mapping are original toolkit code. The user's
[StrategyWiki walkthrough](https://strategywiki.org/wiki/CLANNAD/Walkthrough)
and linked After Story/gameplay pages were consulted for progression context;
no prose, code, screenshots or assets from that site were incorporated. Source
completion flags and native title checks determine the PS2 adapter's behaviour.

## Console menu and CRT display (2026-09-19)

`web/console-menu.css` is original CSS geometry inspired by the user's console
reference images. No Sony logo, firmware/menu artwork, boot audio or attached
photograph is bundled. `web/crt*.mjs` / `web/crt.css` are original MIT rendering
and settings code, with no copied upstream shader source.

Feature design references inspected:
- [Libretro CRT overview](https://docs.libretro.com/shader/crt/).
- [CRT-Royale documentation](https://docs.libretro.com/shader/crt_royale/).
- [CRT-Royale source header](https://github.com/libretro/slang-shaders/blob/master/crt/shaders/crt-royale/src/crt-royale-geometry-aa-last-pass.h):
  TroggleMonkey copyright, GPL v2 or later. It was not incorporated or ported.
- The inspected crt-pi and grade shader headers are likewise GPL v2 or later;
  the slang-shaders repository has mixed per-file licences, not blanket MIT
  permission. None of those shaders is distributed here.

The available controls are informed by these feature categories, not evidence
of equivalent rendering quality. See [CRT scope, implementation and limits](crt-display.md).
No MiSTer code, shader packs, game images or external bitmap assets were reused.


## Optional home-server shared saves (2026-09-19)

The storage router, revisioned SQLite store, save-location UI and backup helper
are original MIT toolkit code using browser APIs and Python's standard library.
No external service, dependency or upstream code was added. Save/progress payloads,
private recovery copies and database backups remain outside distributable code.

## Remember11 recovery trial (2026-09-21)

`vnkit/adapters/cri_afs.py` adapts the AFS end-name-table and LZSS ring conventions
from **GARbro**, MIT, Copyright (c) 2014-2020 morkt. Pinned commit
`b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0`; inspected
[ArcAFS.cs](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/ArcFormats/Cri/ArcAFS.cs),
[LzssStream.cs](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/ArcFormats/LzssStream.cs)
and ImageBIP.cs. Licence is retained in `third_party/GARbro-LICENSE.txt` and the
code-only package. Docker also copies the licence notices (no game assets). No GARbro binaries or external image-decoder dependencies added.
The limited TIM2 sample converter and Remember11 recovery wrapper are original
code, based on bytes from the owner's disc. Full-resolution BIP was unsupported
at that recovery milestone; the later original decoder is described above.

Reviewed PSP research without copying utilities or translation assets:
[dreambottle/R11-psp-english](https://github.com/dreambottle/R11-psp-english),
commit `d27db7e997e967cfbfc4aa09e330b58c6c1d2670`, and
[bibarub/Infinity-PSP-TL](https://github.com/bibarub/Infinity-PSP-TL), commit
`26486e04139a2005651b2706e21f1526f31e7117`. The latter's named STL licence covers
an Ever17 Russian localization, not proven blanket licensing for its utilities.
The embedded Okumura LZSS source has a permissive notice, but our adaptation uses
the separately verified MIT GARbro reference. No PSP patches, proprietary tools
or missing game resources were downloaded or bundled. PSP layout assumptions
failed against the supplied PS2 resources; see the investigation report.

Existing ffmpeg/ffprobe and vgmstream r2117 were used as subprocesses for a
representative voice decode and unsuccessful BGM-bundle probe. They are not
bundled. Existing notices/dependency setup continue to apply.

## Windows installer and tray host (2026-09-21)

`windows/Launcher.cs`, the PowerShell setup/uninstaller, desktop pipe host and
Windows tool-path helpers are original MIT code. The tray uses .NET Framework
Windows Forms/NotifyIcon; no pystray, Pillow or Electron code is included.
Microsoft's API documentation and Python's embeddable-runtime documentation were
consulted, without copying their example implementations.

The online installer downloads exact checksummed CPython, Node.js, Gyan FFmpeg
GPLv3 essentials, vgmstream and FluidSynth releases directly from their distributors;
see `windows/tools.lock.json` and `docs/windows-build.md`. Their archive notices
are retained. These external packages do not acquire this project's MIT licence.
The test ZIP contains no game content and is not a public release.

The explicitly bundled Windows VGMTrans binary is built from the same zlib-
licensed revision and two documented patches used by the Linux import. Its full
patched source and vendored dependency licences accompany it in `source.zip`,
including unarr (LGPLv3), plus build commands and binary/source hashes. It can be
rebuilt and replaced. MinGW's compiler-runtime notices are included alongside it.
The ordinary `python -m vnkit package` remains code-only; only the separate
Windows package builder adds this explicitly selected converter and source.

### Menu music

“Nova Mistero” by virabelo, from [Free Music Archive](https://freemusicarchive.org/music/virabelo/nova-mistero),
is used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The recording is unchanged. Menu playback loops at 20% volume by default; mute
and volume are saved on each device. Music stops when a game loads. Some browsers
require a click before music can start. See `third_party/menu-music.txt`.
