# Never7 PS2: disc and engine fingerprint

## Result

The supplied **Never7 -the end of infinity-**, Japanese **SLPS-25256 v1.01**, is
identified with high confidence. It now has an **experimental source-script reader**.
See [runtime, commands and coverage](never7-runtime.md) for the current build.
The initial recovery trial found that Remember11's scenario and image parsers do
not transfer unchanged. Further investigation confirmed reuse of its AFS audio,
ADX conversion, Sony music and PSS movie tools. CLANNAD and Remember11 stay intact.

Actual-disc recovery produced:

- 14 overlays and 227 named scenario word tables.
- 60,644 named Japanese strings, decoded strictly as CP932 with zero failures
  in that selected symbol population; 58,977 table words reference these strings.
- 6,497 decoded members from all 47 detected CPS streams, with zero stream-walk
  failures. 6,411 have original-size PNG previews. The other 86 are preserved as
  decoded bytes with explicit format diagnostics.
- Both MIDI streams parsed in 30 Sony SQ banks; two non-MIDI Sesq banks remain
  unsupported. One original bank exported to MIDI/SF2 using existing VGMTrans.

These are recovery counts. The later instruction census and execution tests are
reported separately in the runtime guide; they must not be added to these counts.

## Disc and engine fingerprint

- ISO9660/UDF bridge, 3,587,014,656 bytes. ISO SHA-256:
  `52759964e8437da516827dc5ca28dc92a15c98940f5b9453131ca028a3b78c8b`.
- `SYSTEM.CNF` boots `SLPS_252.56`, reports `VER = 1.01`, NTSC.
  ELF SHA-256:
  `f7cde3fe47e6996682e6f10aeb701d4053779765ea4d7bd7d91630a742ba118e`.
  Detection requires that hash and all 14 overlays; no other edition is claimed.
- Root `CD.LST`; resources grouped under `A000`, `A020`, `A040`, `A060`, `A080`,
  `A0A0`, `A980`. The original investigation overlooked the three CRI AFS archives
  in A980. Audio shares AFS/ADX with Remember11; scripts do not use its MAC/BIP
  layout or CLANNAD HED/MRG/MZX0.
- `OLM/O0.` through `OLM/OD.` use MWo3 headers, load address `0x5dd000`, text size
  `0xc0`, variable data size, zero BSS and constructor endpoints. The complete
  extent is `64 + text_size + data_size`, followed by zero padding.
  **On this disc, symbol bytes are at `address - 0x5dd000` in the complete file.**
  Adding another 64 bytes produces believable but wrong/truncated text.
- ELF symbols identify 227 `*_intdat` word arrays and their original string
  objects. The native `memories_sadr` directory has 155 nonzero slots. This is an
  address lookup, not route order; preserve other tables and aliases too.
- `oscrExeCommand` at `0x1a9320` distinguishes text pointers from `0xf0000000`
  command words. Its 154-entry switch directory is at `0x3909b0`. The text path
  advances four words, but that does **not** make all commands four words long.
  The parser follows measured PC increments. All 188 story tables parse.
  The other 39 belong to the separate `mendScrCommand` credits interpreter;
  `mendInit` selects their addresses. They now parse under their own measured
  widths (3,442 instructions); animation remains omitted. No unknown story
  command is ignored. See [route and menu evidence](never7-routes.md).
- Native symbols identify choices, variables, comparisons, jumps, script/overlay
  changes, media, waits and endings: e.g. `oscrSentakuWrite`, `oscrHensuuSet`,
  `oscrJEqu`, `oscrSetScript`. The new VM implements the measured word commands;
  native conditions are evaluated from the owner’s bounded, read-only predicate.
- Strict CP932 text recovery retains bytes and inline controls, including `\k`
  and `\p`. The reader separates speaker names, handles page/key controls and preserves
  newlines. Inline pauses currently settle immediately. No separate ruby markup
  was found in the parsed dialogue; native font/glyph parity remains unverified. No text was translated or reconstructed.
- Graphics use CPS compression and OGDT/TIM2. CPS has a three-byte BE output
  length, literal runs and overlapping copies with 10-bit distance. It differs
  from Remember11's LE32-size LZSS. Native `get_cps_bin_size` (`0x1b9750`) and
  `cps2bin` (`0x1b97a0`) confirm the format. Concatenated members begin on 2,048-byte
  boundaries; the new walker verifies zero padding rather than scanning for magic.
- `LoadOGDImage_exe` (`0x13b0a0`) reads a 32-byte OGDT header, tiled pixels and,
  for indexed images, a 16-byte palette header. Original code now decodes measured
  RGB24 and indexed-8 variants. Short format-1 images and unsupported palette/TIM2
  variants remain explicit failures to preview, not guessed conversions.
- Sony HD/SQ/BD banks are separate files. The wrapper parses both streams of
  30 MIDI banks; two Sesq files remain unhandled. For the 24 BGM table rows at
  `0x3687e0`, `oscrSoundBgmPlay_n7` calls SetBGM with `bank << 16`. SetFixSE
  passes low-seven-bit song 0 to EZMIDI.IRX MidiStart. The measured Song directory
  selects MIDI 0 for that song; both streams remain preserved and checked.
  VGMTrans exports the selected sequence and original instruments. FluidSynth
  renders them with source loop points; SPU2 synthesis/mixing parity is unverified.
- A980/A980., A981. and A982. hold 9,907 voices, 104 effects and three streamed
  songs. Their AFS extent tables pass the existing reader. Filename-row sizes
  are stale; the Never7 caller opts into retaining that discrepancy. Bounds and
  path checks stay strict. Packed script IDs use archive number in the high 16
  bits and member ordinal in the low 16 bits, confirmed by CDXA_Play2 and ADXT.
- A0A0 contains 18 MPEG PS/PSS files. The existing lossless VP9/FLAC conversion
  is reused with decoded video/PCM hash checks. Source resource IDs are passed
  by oscrMoviePlay to MoviePlay2_start; files are not sequenced by filename.
- CRI ADX symbols occur in the ELF. Shared CRI/Sony middleware does not prove a
  shared scenario VM. No disc executable was run. No missing required resource
  is established: “undecoded” is not “absent”. No substitute assets were downloaded.

## What transfers

| Layer | Measured evidence | Decision |
| --- | --- | --- |
| Disc and safe writes | Existing Source/ISO reader reads the image | Reuse unchanged |
| Browser and learning UI | Actual Never7 Chromium tests | Reused, including saves, text, audio and activity |
| AFS/ADX audio | Real extent tables and 10,014 decoded clips | Reuse with explicit stale-name-size variant |
| Remember11 scripts and graphics | MAC/BIP differs from MWo3/oscr and CPS/OGDT | Distinct parser/VM required |
| Sony event decoder | Both streams parse; native BGM selects song zero | Reuse with edition-specific bank/Song selection |
| VGMTrans instruments | 24 native BGM banks rendered | Reuse; synthesis fidelity remains approximate |
| PSS movies | Original streams pass the existing demux/converter | Reuse lossless conversion and roundtrip checks |
| CLANNAD engine | Different containers and bytecode | No VM compatibility found |
| Never7 scenario execution | Native word commands and predicate implemented | Distinct adapter behind the same reader interface |

KID lineage is plausible and source symbols identify this as a KID implementation;
binary compatibility with the Remember11 VM is disproved by the measured layouts.
This does not establish which historical revisions share source code.

The remaining work is route/extras coverage and presentation fidelity, not
constructing a linear text dump. See the runtime guide for exact limits.

## Existing research and licences

[kidfile](https://github.com/malucard/kidfile/tree/5e8d31ce89a42f5ae6f4007840dfd8620061359b)
researches CPS/OGDT and explicitly references Never7 PS2. At that revision its
tree and Cargo manifests have **no licence declaration**. Its source was consulted
privately as a format reference, not copied, linked or redistributed. The new
decoder is original code checked against named disc consumers. Do not vendor
kidfile without permission or a suitable licence.

[Infinity-PSP-TL](https://github.com/MKCAMK/Infinity-PSP-TL) and
[N7-psp-english](https://github.com/malucard/N7-psp-english) concern PSP editions.
Their format descriptions do not establish PS2 compatibility. No translation,
patch or game asset was downloaded. Existing GARbro/MAGES research in the
[adapter guide](adapters.md#shared-engine-investigation) remains useful, but no
evidence makes a PC/PSP scenario parser a drop-in for this disc.

VGMTrans reuse follows the existing pinned build/licence in [provenance](provenance.md).
The new recovery code introduces no runtime dependency.

## Reproduce

```sh
python3 -m vnkit inspect 'Never 7 - The End of Infinity (Japan).iso' --fingerprint

# Private tables, strings, native evidence and first-image probes.
# Exit 3 deliberately means this is not a playable import. No content.json.
python3 -m vnkit.adapters.never7_ps2 'Never 7 - The End of Infinity (Japan).iso' \
  --out private/never7/recovery-current

# All detected CPS streams; bounded reads and explicit failures.
python3 -m vnkit.adapters.never7_ps2 'Never 7 - The End of Infinity (Japan).iso' \
  --images --out private/never7/images-current

# Optional existing-tool reuse probe. Native Linux executable, never Wine.
python3 -m vnkit.adapters.never7_media 'Never 7 - The End of Infinity (Japan).iso' \
  --out private/never7/music-probe-current \
  --vgmtrans private/tooling/remember11-vgmtrans-shell

python3 -m unittest discover -s tests -p 'test_never7.py' -v
```

Exact recovery reruns are safe; changed results require a new folder. The optional
music probe requires a fresh destination to preserve earlier exports. Recovered
files stay under `private/`, outside the served library and package allowlist.
The GUI worker still accepts only existing playable adapters, so disc detection
does not advertise Never7 as ready to play.

## Test evidence and remaining work

The original trial used seven synthetic tests. The current eleven also cover source
word/credits parsing, CP932 pointers and the explicit AFS metadata variant, alongside CPS
bounds/copies, sector padding, image tiles, both SQ streams and edition refusal.
They do not test the game's behaviour. Initial real-disc evidence is under `private/never7/`:
`recovery-current/manifest.json`, `images-v1/image-manifest.json` and
`music-probe-v2/probe.json`. Exact report contents are private.

That initial trial did not test a reader. Later actual-disc browser, save/load,
media and ending tests are recorded in [the runtime guide](never7-runtime.md). Existing Remember11,
CLANNAD format/expression and disc unit tests also passed after these changes.
The initial recovery was not installed or published. The later experimental
reader is now installed locally as `private/library/never7-live`; it has not been
added to the public release.

Model and measured token use are in the local `task-usage.csv`;
see [counting notes](task-usage.md). A completed recovery trial is not a completed
Never7 port.
