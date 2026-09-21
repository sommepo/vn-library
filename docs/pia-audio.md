# Pia Carrot 3 PS2 audio evidence

`vnkit/adapters/pia_audio.py` decodes this edition's headerless VAS members to
unresampled 16-bit PCM WAV. It is a resource decoder, not evidence that the
game's music, voice scheduling or audio-driven animation is fully emulated.

The supplied `SLPS_252.22` retains the native functions, and `MODULES.MLH`
contains a symbol-bearing `NSAD.IRX`. Neither binary was executed to recover
these facts. Addresses below are native virtual addresses; IRX addresses are
relative to its load base.

| Source evidence | Meaning |
| --- | --- |
| `_NstrmPlay` 0x0013f8b0 | Appends `.VAS`, uppercases the archive/member and looks up the NFP extent. |
| `_NstrmPlay` 0x0013fc18–0x0013fca4 | NVAS.NFP selects two channels; ordinary NVAM selects one. |
| `_NstrmPlay` 0x0013fc40–0x0013fc74 | Source channel 0 has right volume 0x3fff and left zero; channel 1 has the opposite pan. The WAV converter emits standard left/right order. |
| `_NstrmPlay` 0x0013fcd8–0x0013fcec | Passes fixed pitch 0x0eb3 into `_SadPlay`. |
| NSAD `_SadPlay` 0x00000a64–0x00000a74; `_SadPlayCtrl` 0x00000fb0–0x00000fc0 | Retains that pitch in stream state. |
| NSAD `_SadSetVoice` 0x00002630–0x00002658 | Writes pitch to the SPU2 parameter numbered 0x0200. |
| NSAD `_SadPlayCtrl` 0x00001440–0x0000150c, 0x00001bd0–0x00001dc0 | Each channel takes alternating 0x800-byte sectors; SPU2 DMA transfers use the same unit. |
| `_NxaSetSpeak` 0x00178c80–0x00178d50 | The supplied character ID and voice filename reach NVAM playback directly. Voice association must come from this native call, not filename proximity. |

PS2SDK's [libsd constants](https://github.com/ps2dev/ps2sdk/blob/master/common/include/libsd-common.h)
confirm parameter 0x0200 is pitch. Its
[ADPCM stream code](https://ps2dev.github.io/ps2sdk/adpcm-stream_8c_source.html)
confirms 0x1000 is normal pitch. vgmstream's
[PS2 pitch examples](https://github.com/bnnm/vgmstream-test/blob/main/doc/TXTH.md)
use `pitch * 48000 / 4096`. This gives **44097.65625 Hz**, approximated by
WAV's integer field as **44098 Hz**. No sample resampling is performed.
Metadata retains the exact rate and a playback ratio of approximately
0.9999922048618985; an HTML audio player may apply that ratio with
`preservesPitch=false` to recover the exact timing. The WAV-only discrepancy
is under eight parts per million.

The native function contains seven exact voice substitutions:

| Requested stem | NVAM member |
| --- | --- |
| 00517 | PIA3_6.VAS |
| 00532 | PIA3_7.VAS |
| 03397 | PIA3_3.VAS |
| 09598 | PIA3_1.VAS |
| 09600 | PIA3_2.VAS |
| 11161 | PIA3_5.VAS |
| 11299 | PIA3_4.VAS |

These appear at native string addresses 0x001f78f0 through 0x001f7990.
`resolve_voice()` centralises the substitutions. The remapping path clears its
special flag before channel setup, so these members use ordinary mono playback.

The converter validates every 16-byte ADPCM frame. It requires one end marker
followed by one terminal marker per channel, matching channel end positions,
and zero payload in trailing sector padding. It decodes through the end frame,
excluding the terminal frame and sector padding. Unsupported flags, predictors,
layout or nonzero trailing payload fail with the source offset. It does not
invent loop points. Streaming-loop behaviour belongs to the native interpreter.

Run from the repository root, retaining original extracted files:

```sh
python3 -m vnkit.adapters.pia_audio private/pia-extracted/NVAM.NFP/09601.VAS \
  --archive NVAM.NFP --out private/probe/audio
python3 -m vnkit.adapters.pia_audio private/pia-extracted/NVAS.NFP/BGM22.VAS \
  --archive NVAS.NFP --out private/probe/audio
python3 -m unittest discover -s tests -p 'test_audio.py' -v
```

The command produces WAV plus `.audio.json` containing source/output hashes,
rate, channel mapping and decoder version. Matching outputs are resumable;
different existing files are never overwritten. `--inspect` writes only metadata.

PS-ADPCM sample arithmetic follows the permissively licensed vgmstream decoder;
retain `third_party/LICENSE-vgmstream.txt`. The original frame/interleave tests
contain no commercial audio. Original SPU2 interpolation, ADSR, mixer effects
and exact PCM rounding remain unverified against hardware or an original-game
emulator run. Sequenced NMUS `.BD/.HD/.SQ` music is converted separately below;
it is never replaced by an unrelated VAS track.

## Original-bank sequenced music and ambience

`vnkit/adapters/pia_music.py` now converts all **28 Mxx music containers and
9 Sxx ambient containers** in the supplied NMUS archive. `BGM12` and `BGM13`
include the room day/night music. The available ambient resources are S02,
S03, S04, S07, S08, S09, S25, S37 and S56. There is no S01 container.

The mapping is source-backed: `_NscrPlayMusic` formats the suffix following
`BGM` with `M0%s` (literal 0x001fdfc0) or `M%s` (0x001fdfc8), and loads
`NMUS.NFP` (0x001fdfd0). `_NscrPlayEnvSE` formats `S%02d` at 0x001fdfe0.
No track is chosen by similarity or filename proximity.

The converter uses the pinned, zlib-licensed
[VGMTrans SonyPS2 implementation](https://github.com/vgmtrans/vgmtrans/tree/3e16daae49d42246f2d1b302b04f6e80a8037342/src/main/formats/SonyPS2)
to extract each track's own instrument samples, SoundFont and expressive MIDI.
Our documented patch `third_party/vgmtrans-filename-match.patch` matches the
three standalone files by their common basename; the upstream matcher otherwise
includes their differing extensions and does not assemble a collection.
The original zlib notice is retained in `third_party/LICENSE-vgmtrans.txt`.

The source SQ inspector validates its compressed delta-time encoding, running
status, tempo, commands, padding and loop structure before synthesis. It restores
CC64 sustain events omitted by the pinned SonyPS2 MIDI exporter. Source note
order, source instrument selection and VGMTrans's expressive volume/pan/pitch
conversion are retained. The intermediate VGMTrans MIDI alone does **not**
include the restored sustain; `render_midi()` adds those source events during
rendering. The SQ, intermediate files and event locations are retained privately.

FluidSynth 2.4.8 renders offline into 48 kHz stereo PCM using only that original
bank; FFmpeg 8.0.1 stores the render as lossless FLAC. The renderer opens no audio
or MIDI device. All 16 channels are explicitly ordinary bank/program channels,
so channel 10 is not accidentally replaced by a General MIDI drum kit. No
downloaded SoundFont is used. Samples are not normalized; fixed synthesis gain
is 0.35, chorus is disabled, and FluidSynth's reverb is approximate. All 37 real
renders were non-silent and below PCM clipping.

**This is approximate SoundFont synthesis, not bit-exact SPU2 emulation.** The
original ADSR, interpolation, effects and mix have not been compared with the
running original. The manifest records the NRPN-99 loop marker times separately
from each source's post-loop termination and render tail. A reader should use
`sequence.loop_start` and `sequence.loop_end`, rather than loop the whole file.
The exact native NRPN execution boundary and sustained-note/reverb carryover at
a loop remain unverified; these can differ from the original.

`SYS.MLH` is a different layout: its SQ contains eight one-shot sequences
(maximum MIDI index 7). It currently fails explicitly instead of exporting only
its first sequence and pretending that all system sounds were recovered.
The three NVAS streams BGM22, BGM23 and BGM31 use the VAS decoder, not this
sequenced-music converter.

```sh
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.pia_music \
  private/pia-extracted/NMUS.NFP/M24.MLH \
  --out private/probe/music-rendered \
  --vgmtrans "$PWD/private/tooling/vgmtrans-build/src/ui/shell/vgmtrans-shell"
# The identical command also accepts .../NMUS.NFP/S04.MLH.
python3 -m unittest discover -s tests -p 'test_music.py' -v
```

A successful conversion produces `BGM24.flac`, its `.music.json` manifest and
private intermediate `.sf2`/`.mid` files. Source/member/output fingerprints,
converter versions, actual rendered programs, PCM peak and loop markers are
recorded. Matching manifests resume without resynthesis. Changed source/output
fails and requires a different output directory.

## Opening movie

`vnkit/adapters/pia_movie.py` demuxes the original `NETC.NFP/OPENNING.PSS` without
running the game. Standard FFmpeg probing finds the MPEG-2 video but misses the
PSS private-stream Sony audio. Our bounded demux preserves the complete
`SShd`/`SSbd` PCM body, verifies packet extents and padding, and checks that
initial audio/video timestamps match. Original audio is 48 kHz stereo PCM,
512-byte channel interleave, 129.002667 seconds. Original video is 640×448,
30000/1001 frames per second. No scaling is applied.

The default derivative is **lossless VP9 + FLAC in MP4**, about 409 MB for this
movie. The decoded video and PCM audio both compare byte-for-byte with their
source streams. A separately requested `--video-codec h264` produces a smaller
54 MB H.264 CRF16 + FLAC derivative and is explicitly lossy. Optional AAC is
also an explicit compatibility conversion, not the default. Originals remain
untouched.

```sh
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.pia_movie \
  private/pia-extracted/NETC.NFP/OPENNING.PSS --out private/probe/movie
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.pia_movie \
  private/pia-extracted/NETC.NFP/OPENNING.PSS --out private/probe/movie \
  --verify-existing private/probe/movie/OPENNING.vp9.mp4
sh scripts/browser-env.sh node tests/browser-pia-media.mjs
sh scripts/browser-env.sh node tests/browser-pia-audio.mjs
```

The isolated Chromium test decoded the real movie's video frames and unmuted
audio, reached playback, then sought to the end and observed `ended`. Browser
codec support on the user's Firefox/Z13/Android still requires device checks.
Reports are private: `private/browser-tests/pia-media-report.json` and
`private/probe/movie/decoded-roundtrip.json`. Movie playback is a media test;
it does not establish the runtime's correct movie trigger or task continuation.

## Optional local tool bootstrap and licences

The Python VAS decoder needs no extra dependency. Movie and sequenced-music
conversion use private native tools; the reader does not run them.

```sh
# This exact command was run to verify all cached packages and built converter.
python3 scripts/bootstrap-pia-media.py --cached-only
# Fresh compatible Ubuntu 26.04 amd64 setup: downloads pinned public tools only.
python3 scripts/bootstrap-pia-media.py
```

`audio-tools.lock.json` pins all 187 local `.deb` dependencies by package,
version, architecture and SHA-256. Bootstrap downloads and extracts them under
`private/tooling/`, runs no package maintainer scripts and changes no service.
It builds pinned VGMTrans with the three-line matching patch above. The existing
import's cache verification passed; a complete fresh bootstrap has **not** been
rerun from an empty cache. Old Ubuntu package versions disappearing from mirrors
are reported as download failures; no unpinned replacement is selected.

The native tools are not included in code packages. FluidSynth is LGPL-2.1-or-later
(with some LGPL-2-or-later files); VGMTrans is zlib-licensed with separately
licensed bundled dependencies. The Ubuntu FFmpeg build uses GPL components,
including libx264; this is an optional separately installed executable, not code
linked into our MIT toolkit. Its package licence files remain in the private
sysroot. Redistributing a built native-tool bundle would require a separate
licence/source audit. Input game banks, sequences, WAVs, SoundFonts and movie
files must remain private even when our wrappers are shared.

Known diagnostics:

- `VGMTrans original bank export failed`: check the pinned basename matcher patch
  and ensure the SQ/HD/BD files share one basename; do not substitute a generic
  SoundFont.
- `Unsupported SQ controller`, `Unverified SQ looping structure`, or nonpadding
  after a source end marker: preserve the source and investigate that format.
  SYS.MLH deliberately takes this path today.
- Private Ubuntu FluidSynth currently prints SDL3/GLib initializer warnings.
  Offline synthesis still completed and its output was browser-decoded; no host
  audio driver is required. Actual missing libraries or failed synthesis remain
  fatal conversion errors.
- `Checksum mismatch` or a vanished pinned Ubuntu package: preserve the failed
  download and resolve dependency provenance instead of selecting an arbitrary
  newer binary.
