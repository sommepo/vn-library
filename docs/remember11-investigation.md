# Remember11 ISO trial — result and distribution implications

**Historical investigation.** The user subsequently authorized implementation.
A new KID interpreter and full media pipeline now produce an incomplete playable
import. Read [current runtime evidence](remember11-runtime.md) and
[current commands](remember11-import.md). The results below describe the earlier
unmodified-tool trial and recovery milestone; its old blocked import command is
superseded by the playable CLI. They remain evidence that a new engine adapter
was necessary, not that the present reader is blocked.

2026-09-21. **The existing importer did not convert this ISO into a playable
reader.** A new recovery adapter now opens its archives and decompresses resources,
but there is no Remember11 story interpreter. Ignoring animations does not fix
that gap. CLANNAD's live import, reader code, saves and service were left intact.

## What was actually tried

The unmodified CLI's `inspect --fingerprint` succeeded at the disc layer. Its
automatic `import` returned **2**, “No tested edition adapter matched this source”.
This is direct evidence against treating the toolkit as a general PS2 VN converter.
The existing working CLANNAD interpreter implements a different engine.

The new `remember11-ps2` adapter deliberately returns **3 / blocked** from import,
and validation also returns **3**. Its content package contains **zero executable
reader instructions** and cannot be launched as a game. No text-dump reader was
substituted for a port. Raw extraction succeeds with **0 / extraction-only**.

Private baseline evidence: `private/remember11/investigation/initial-commands.json`.
Final command/exit evidence: `private/remember11/investigation/verified-commands.json`.

## Identification and evidence

- Game: **Remember11 -the age of infinity-**, Japanese standard PS2 edition,
  **SLPM-65550**, executable/disc version **1.02**. `SYSTEM.CNF` names
  `SLPM_655.50`, `VER = 1.02`, `VMODE = NTSC`. High confidence; serial identification
  is also consistent with the [PCSX2 title record](https://wiki.pcsx2.net/Remember_11%3A_The_Age_of_Infinity).
- ISO9660, 2,048-byte sectors, 3,389,161,472 bytes, with UDF bridge descriptors.
  Existing ISO code reads the ISO9660 tree; it does not separately validate UDF.
- ISO SHA-256: `5cfad772a6d320f2c96c5692e7813a971a045a451e49ba81e3a4402557bd612b`.
- ELF SHA-256: `644566b01b67e5795a3ac5064a70e69f777e77a7de855d514594dbd7e3949e92`.
  ELF32 little-endian MIPS with R5900 flags, entry `0x100008`; no symbol table and
  empty `.mdebug.eabi64`. It was read, **not executed**.
- KID PS2 engine family, binary MAC scenarios in compressed BIP members. This is
  a format/family identification, not a claim of a documented universal KID VM.
  The current HuneX/CLANNAD interpreter is inapplicable.

## Measured recovery

| Layer | Result | What this does not prove |
| --- | --- | --- |
| Disc | Existing reader opens it | Engine support |
| Archives | All 8 indexed and 16,080 members extracted, 2,331,099,383 payload bytes | Decoding or execution of every member |
| Scenario resources | All 171 MAC members strictly decompress; no decompression failures | Opcode parsing, branches or correct story order |
| Japanese | 36,486 candidate NUL-terminated CP932 spans recovered with exact offsets/raw bytes | Number of dialogue segments or complete character/formatting coverage |
| INIT | Decompressed to 129,037 bytes | Names/TIPS/chronology semantics and references |
| Graphics | Three native TIM2 thumbnails converted to PNG; one CG thumbnail visually inspected | Full-resolution scenes or sprite placement |
| Audio | Sample original voice recognized as 48 kHz mono ADX and decoded to WAV | All clips, source dialogue association or voice timing |
| BGM | Sampled BIP resources decompress to IECS sequence/bank structures; vgmstream r2117 rejects the unsplit bundle | Playable music tracks |
| Story | **0 instructions implemented, 0 segments executed** | Any route, choice, save-state or ending coverage |

Archive locations:

| File | Members | Role / evidence |
| --- | ---: | --- |
| MAC.AFS | 171 | Compressed binary scenario resources, including PR/CO/SA names |
| BG.AFS | 974 | Background BIP plus TIM2/T2P thumbnail pairs |
| EV.AFS | 316 | Event CG BIP plus thumbnails |
| CHR.AFS | 1,894 | Character BIP plus thumbnails |
| BGM.AFS | 74 | Music-related BIP sequence/bank resources; **not 74 verified songs** |
| SE.AFS | 468 | Sampled sound-effect files are ADX |
| VOICE.AFS | 12,158 | Sampled voice files are ADX |
| ETC.AFS | 25 | Font, UI and sound-bank resources |

There are also 16 `MOVIE/*.PSS` files, `INIT.BIN`, `FILE.DIR`, the executable and
PS2 modules. The archive extents/name records all fit the supplied disc. No missing
resource was established by these checks, but full script-reference validation is
not possible without parsing the VM. No substitutes were downloaded.

Candidate text extraction is explicitly heuristic. It preserves strict CP932
bytes, spelling and `%` controls; it neither strips those controls nor invents
speakers, reading order, ruby or voice links. Some candidates can be data rather
than narrative. Custom glyph coverage remains unverified. Nothing is published
to the reader's live-text feed, clipboard or reading statistics.

## Why existing third-party tools do not finish the job

[GARbro's AFS reader](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/ArcFormats/Cri/ArcAFS.cs)
and LZSS conventions are useful and MIT-licensed. Their bounded Python adaptation
is now reusable here, with the licence retained. However, its
[BIP image reader](https://github.com/morkt/GARbro/blob/b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0/ArcFormats/Cri/ImageBIP.cs)
expects PNGFILE2 tiles. The sampled PS2 BIP files do not contain those tiles;
recognizing the extension is insufficient. Small T2P resources contain a simple
TIM2 variant that we did decode, at their original thumbnail size without upscale.

The [Remember11 PSP translation tools](https://github.com/dreambottle/R11-psp-english)
and [Infinity PSP fork](https://github.com/bibarub/Infinity-PSP-TL) offer useful
format research, not a verified PS2 interpreter. Their scene extractor looks for
an eight-byte all-FF text marker: **none of the 171 decoded PS2 scenarios contains
it**. Their text-pointer and trailer assumptions therefore cannot just be applied.
The PSP notes themselves retain unknown controls. General permission to redistribute
their translation utilities was not established; no such code or translation data
was copied into this toolkit. The fork's named translation licence is for an
Ever17 Russian localization, not blanket permission for all utilities.

I did not find and verify a ready-made Remember11 PS2 browser interpreter during
this investigation. That is a search result, not proof that none exists.

## What is reusable, and what needs new work

Reusable now: disc access, safe atomic extraction, fingerprints/manifests, bounded
AFS/LZSS helpers, original-size PNG output, existing audio tool installation,
reader DOM/text output, saves UI, statistics, mobile layout and shared storage.

New work needed for a native Remember11 import:

1. Parse the **PS2** binary instruction stream and establish actual startup,
   labels/targets, expressions, state banks and resource indexes. First execution
   currently has no decoder even at `MAC.AFS/00000-PR_01.BIP:00000000`; the bytes
   are retained for analysis, not treated as implemented commands.
2. Implement story semantics, choices, calls/returns and persistent unlocks; prove
   exact execution-state saves and voice/text association. TIPS/chronology need
   source-backed behavior rather than dumping INIT strings into arbitrary menus.
3. Decode the full-resolution BIP texture/layout variant and scene composition.
   Source thumbnails are not acceptable replacements for the main artwork.
4. Extract/render the sequenced music banks or supply an appropriate playback
   backend, and convert the tested streaming formats using existing media tools.
5. Run all-script/reference validation and real sequential/branch/save tests.
   Native animations can remain explicitly degraded during this work, as requested.

This is a **substantial engine-adapter project**, not just another file extension
or an automatic asset conversion. A schedule/route coverage estimate would be
speculative before the script dispatcher and music representation are understood.

## Options for a distributable tool

**A. Curated engine/edition adapters, using this browser reader.** Best match for
integrated selectable Japanese and the existing UI. Owners supply supported ISOs;
we distribute code only. Each unfamiliar engine needs engineering/validation.
Remember11 would become a KID adapter pilot; one successful game would still not
prove all KID releases. Milestone one should prove 100 source-driven segments,
one choice with both outcomes, exact save restoration, full-size artwork and a
voice association before undertaking a complete port.

**B. Emulator plus a text/reading companion.** Worth prototyping if *many unrelated
PS2 games* matters more than a fully native browser implementation. An emulator
runs the existing engine, preserving sequencing and native behavior without
rewriting each VM. A hook still needs a reliable text boundary/encoding per engine
or title. Streaming to a browser, synchronized selectable overlay, input, pause,
state restores and duplicate-free statistics are additional work. This approach
is not implemented here. [PCSX2 requires an owner's BIOS dump](https://pcsx2.net/docs/setup/bios/)
as well as the game; its [licence is GPL-3.0](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/Docs/README.md).
Running it as a separately installed process would keep that boundary clearer;
no emulator or BIOS was installed/downloaded/tested in this task.

**C. An existing interpreter for another release.** Only worthwhile if an actually
compatible licensed interpreter and an owner-supplied matching release are found.
The existence of a PC/PSP version or patch does not make this PS2 ISO compatible.
No such working alternative was verified here.

Recommendation: describe and distribute the current project as a **reader with a
small tested adapter support matrix**, never “PS2 ISO → VN”. For broader PS2
coverage, first prototype option B on this disc and compare its text quality and
remote usability against the cost of option A. If native browser playback remains
mandatory, proceed explicitly with option A's KID VM investigation.

## Runnable tools and repeatability

```sh
python3 -m vnkit inspect 'Remember11 - The Age of Infinity (Japan).iso' --fingerprint
python3 -m vnkit extract 'Remember11 - The Age of Infinity (Japan).iso' \
  --level archives --out private/remember11/archives-v2
python3 -m vnkit import 'Remember11 - The Age of Infinity (Japan).iso' \
  --adapter remember11-ps2 --out private/remember11/recovery-v2
python3 -m vnkit validate private/remember11/recovery-v2
sh scripts/audio-tools-env.sh python3 scripts/probe-remember11-media.py \
  private/remember11/recovery-v2 --out private/remember11/media-probe-v2 \
  --vgmstream private/tooling/vgmstream-r2117/vgmstream-cli
python3 -m unittest discover -s tests -p test_remember11.py -v
```

Import/validate intentionally return **3**; this is the honest unsupported-runtime
result. Import recovers all MAC resources, INIT, identification files and two samples
per other archive, with hashes; it does not convert the full asset set. `extract`
recovers every archive member losslessly using ordinal-prefixed names to preserve
duplicates. Inputs can also be an extracted **disc** directory with its original
archives. ISO and directory manifests differ; use a separate output directory.

The final v2 extraction/import each ran twice successfully under their stated
exit-code policy. Exact matching output resumes; changed output fails without
overwriting. Earlier v1 investigation outputs are retained as historical evidence;
the manifest's transient write-status field was removed in v2 so reruns compare
content rather than “created” versus “unchanged”.

Five synthetic safety/format tests pass; the full Python suite has 68 passing tests.
Actual-disc checks are the extraction/decompression/media tests above. No story,
branch, 100-segment browser smoke test, PS2 behavior comparison, full image/audio
census or original-console execution was performed or marked passed.
