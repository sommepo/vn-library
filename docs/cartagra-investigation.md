# Cartagra PS2: recovery and route research

Status on 2026-09-23: **an experimental original-font browser preview exists**.
Read [the runtime guide](cartagra-runtime.md) for current browser, save and route
evidence. This investigation records the earlier recovery and research work.
Verified Unicode and full learning-reader support remain incomplete.
Animation is not the reason for this distinction.

## Exact disc

| Field | Evidence |
| --- | --- |
| Title | Cartagra — 魂ノ苦悩, Japanese standard PS2 edition |
| Serial/version | `SLPM-66231`, `VER = 1.01` in `SYSTEM.CNF` |
| Boot executable | `SLPM_662.31`, stripped MIPS32 little-endian ELF |
| Executable SHA-256 | `a8e7d0065bfd999125253fa1a21292ff4cd32cfb25f35d3af8f6cde21ccd74ba` |
| ISO size | 1,991,376,896 bytes |
| ISO SHA-256 | `6534fc86c45780aadb58dc6013d47bbf9a87bf305d8742e230cba9004f0946d1` |
| Disc | ISO9660, 2048-byte sectors, `PLAYSTATION`; UDF bridge present |

Identification confidence is high: the source configuration, executable and
archive consumers agree. Limited/budget editions are untested. The executable
was inspected statically; it was not run. No missing game files were downloaded.

## Engine comparison

This is a **KID SC3 variant**, confirmed at the format and bytecode level. It is
not the MAC revision used by Remember11/Ever17, Never7's MWo3/oscr, or CLANNAD's
HuneX format. The newer MAGES documentation and impacto implementation help
explain the SC3 header, expression tokens and command groups. Their game profiles
are not interchangeable with this executable.

The existing ISO/AFS extraction, ADX conversion, PSS conversion, safe output and
validation helpers transfer. Script widths, source resource tables and CPS keys
need this edition's adapter. The MIT PS2 Visual Novel Tool explicitly handles
this Cartagra family; its CPS algorithm was adapted instead of rediscovered.
See [provenance](provenance.md) for versions and notices.

### Technical fingerprint

- DAT directory: 0x8000 bytes of little-endian `<II>` rows. Data offset is
  `0x8000 + sector * 2048`; length is `size * 1024`. Extents are contiguous
  through the end, followed by a zero directory terminator. Using 2048 for
  lengths is wrong for this disc. Native consumer: `0x118018`.
- `SCRIPT.DAT`: 100 uncompressed `SC3\0` files. The native name table is 100
  pointers at `0x1995f0`. Header words identify the string-offset table,
  return table and label table/code start. Labels are offsets, not story order.
- Expressions: signed compact immediates and explicit operator precedence.
  Work, bit flags and thread-local values are separate banks. Source evaluation
  lives around `0x116618`/`0x116cc8`; the research interpreter never executes
  arbitrary ELF code or JavaScript supplied by a game.
- CPS images: encrypted initial words, LCG seed and bounded RLE/LZ stream.
  Eight-key decoding differs from Never7 CPS. Indexed palettes use PS2 index
  permutation; alpha is scaled from 0–128. Declared depth 24 stores RGBA here.
- Scene frame: 640×448. Some portraits are 640×450. Thumbnails are 256×112/113.
  Preserve these dimensions; do not upscale or force Ever17's 640×480 geometry.
- AFS/ADX: original streamed music, effects and voice. Filename-row sizes are
  stale; bounded member-table extents remain authoritative. Music does not need
  Remember11's Sony-sequence/FluidSynth path. `SOUND.DAT` separately holds a
  system-instrument bank; its UI sounds remain unrendered.
- Five original PSS movies. Existing private-audio extraction and lossless
  browser conversion are reused. CRI modules are middleware evidence, not VM
  compatibility evidence.
- Text: big-endian glyph words minus 0x8000, not Shift-JIS. `SYSTEM.DAT` member
  24 contains 2,880 24×24, high-nibble-first, 4-bit glyph bitmaps. It is not CPS.
  Speaker, ruby, colour, scale and line controls have separate token records.
  The font's Unicode correspondence has not been recovered from a source table.
- Animation/presentation: group 01/10 image/surface operations and native
  rendering threads. Their full scheduling, transition and blend behaviour is
  not implemented. No shared animation compatibility with existing games is
  claimed merely because they use CPS or CRI.

## What has been checked

| Layer | Actual result | Limits |
| --- | --- | --- |
| Disc/archive recovery | 12,028 DAT/AFS members; safe repeatable extraction | Not story execution |
| Images | 6,156 CPS images decode, zero failures | Original-console composition comparison unperformed |
| Media conversion | 6,156 native-size PNGs, 5,769 FLAC files, five movies | Opening voice/music and three movie decodes now tested in Chromium; full timing fidelity unverified |
| Movies | All five pass decoded video/audio roundtrip checks | Not original-PS2 presentation evidence |
| Script structure | 100 resources, 76,362 recovered instruction sites | 60 structural stops remain: Startup 32, system 28 |
| Strings | 22,697 token streams, 2,446 used glyph IDs, valid token bounds | Unicode not verified |
| Route research | All 16 source ending flags reached across private replays | Headless simulation; not every choice permutation or native thread behaviour |
| Restore research | 129 late-choice replays and 6 final-choice replays agree | State clones, not reader save/export/shared-save tests |
| Browser preview | 150 consecutive bitmap-text segments, choices, media, saves, pause and fullscreen | See runtime guide; Unicode/dictionary/export/statistics remain unavailable |

The image census excludes the raw font. Counts by archive: BG 801, BG2 797,
CHARA 2,243, CHARA2 2,243, SYSTEM 72 images plus the font. Audio archives contain
25 music, 197 effects and 5,547 voice resources, all converted successfully.
`media-v1/images-manifest.json`, `audio-manifest.json` and the five movie
`roundtrip.json` files record the conversions separately from archive discovery.

### Route evidence

`web/adapters/cartagra-trace.mjs` is the research control interpreter, now reused
by `cartagra-engine.mjs`. It executes source loads, branches, calls,
expressions and conditional choice visibility. It reports unknown operations
with locations. It simulates waits, movie completion and selected native menu
operations; it does not show or publish source text to the reader.

New-game bootstrap starts at Startup `0x12c4`, loads the two macro buffers and
follows the source story-thread entry. That is not proof that all original title
menus and concurrent rendering threads work. Initial configuration/reset and
persistent-bank details still need review before a production runtime.

Ending flags are 432–441 and 450–455. The normal end tail sets the chosen flag
and flag 392 before stopping; the parent Startup thread observes 392 and returns
to the menu. Never treat any arbitrary HALT as a successful ending.

Source-earned flag 460 changes a later choice gate. A private replay earns it
through ending 452 before checking later paths. A final branch also checks
accumulated work cell 127: the last two alternatives reach flags 455 and 454.
This is source execution, not manually marking every route complete.

Evidence files, all private:

- `trace-v2.json`: 256 fresh research runs, 12 ending flags, 17,102 unique text
  sites and 59 choice sites. This older run used the original seed initialization;
  its first choices were biased. Do not claim uniform or exhaustive exploration.
- `trace-earned-v2.json`: 64 runs with mixed seeds and carried source-earned
  progress; 12 ending flags, 20,712 unique text sites and 60 choice sites.
- `late-endings-v2.json`: 129 matching replays after alternative choices, no
  stops. The earlier v1 report failed when a changed branch hid a recipe option;
  it remains a failed historical report.
- `final-endings-v1.json`: source-earned prerequisite followed by late branches;
  endings 453/454/455, six matching replays, no stops.

Do not add overlapping text counts together. Do not turn these control tests
into a claim that all routes are already playable in the browser.

## The text problem

No usable Unicode table has been found in the recovered scripts, font or ELF.
The kanji IDs follow first occurrence rather than a standard encoding. Related
games' FOP fonts have a different layout and are not a confirmed matching font.

Offline OCR was tried on the original glyphs. It produces wrong characters,
including similar-looking kanji. Confidence scores and agreement between OCR
modes are not enough to establish correct text. Its output remains explicitly
unverified and is never loaded by the reader.

`scripts/cartagra-font-review.py` creates a private sheet with the original glyph
beside a candidate. An accurate, complete review or a proven matching encoded
font could resolve the mapping without inventing any story text. The strict
`cartagra_text.py` loader rejects candidate files, mismatched font hashes,
duplicate IDs and missing approvals. It measures approval coverage, not whether
the reviewer was correct. No complete approved mapping currently exists.

The original Japanese is present as glyph references and bitmaps. This is a
decoding task, not evidence that the ISO lacks its Japanese content. Do not use
another edition's script, translate it, or reconstruct lines to fill the gap.

## Runnable work

From the repository root, with the owner's exact disc:

```sh
python3 -m vnkit.adapters.cartagra_ps2 'Cartagra - Tamashii no Kunou (Japan).iso' --fingerprint
python3 -m vnkit.adapters.cartagra_ps2 'Cartagra - Tamashii no Kunou (Japan).iso' --out private/cartagra/archives-v1
python3 -m vnkit.adapters.cartagra_audit private/cartagra/archives-v1 --out private/cartagra/audit-v1
python3 -m vnkit.adapters.cartagra_graphics private/cartagra/archives-v1 --report private/cartagra/new-image-audit.json
python3 -m vnkit.adapters.cartagra_media private/cartagra/archives-v1 --kind images --out private/cartagra/media-v1
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.cartagra_media private/cartagra/archives-v1 --kind audio --out private/cartagra/media-v1
python3 -m vnkit.adapters.cartagra_media 'Cartagra - Tamashii no Kunou (Japan).iso' --kind movies --out private/cartagra/movies-source-v1
sh scripts/audio-tools-env.sh python3 scripts/convert-remember11-movies.py private/cartagra/movies-source-v1 --out private/cartagra/media-v1/movies --jobs 1
```

Audit intentionally exits 3 for its 60 structural stops. Recovery/media commands
return 2 on format/tool/I/O failure; changed output is refused. Matching recovery
and media may resume. Use a fresh report path for new evidence. The generic
`vnkit import`/Add game registry does not admit Cartagra yet.

Existing pinned media tools are described in [media setup](remember11-import.md).
Only FFmpeg/ffprobe and the existing PSS helpers are needed for these streamed
resources. Local conversion uses one worker per command; no Wine is involved.

```sh
python3 -m unittest discover -s tests -p 'test_cartagra.py' -v
node --test tests/cartagra-expression.test.mjs
node tests/cartagra-source-trace.mjs private/cartagra/audit-v1 private/cartagra/new-trace.json 64 earned
node tests/cartagra-ending-replay.mjs private/cartagra/audit-v1 private/cartagra/trace-v2.json private/cartagra/trace-earned-v2.json private/cartagra/new-final-replay.json 455 2
python3 scripts/probe-cartagra-native.py private/cartagra/archives-v1/SLPM_662.31 0x116618 0x1000 --out private/cartagra/new-expression-probe.txt
```

Seven Python synthetic tests and the JavaScript expression checks pass. They
check format bounds, fail-closed parsing, expressions, glyph review identity,
ADX loops and CPS alpha. They are separate from the private route experiments.

## Remaining implementation

1. Finish and validate the glyph-to-Unicode mapping, including punctuation,
   small kana, ruby and speaker controls. Keep the original bytes/IDs.
2. Check native reset, persistent progress and any state-bearing concurrent
   threads. Complete required menu parsing or explicitly replace it with the
   reader's equivalent without skipping story logic.
3. Extend the existing browser preview's optional-branch and native presentation
   coverage. The unimplemented 01:20 framebuffer capture in macrosys remains an
   explicit stop. Animation can remain explicitly omitted.
4. Keep replaying ending recipes through the reader adapter as it changes.
   Sixteen flags and 1,681 save/restore checks currently pass; this is not an
   exhaustive branch or original-console comparison.
5. Once Unicode is verified, run the real browser text, stats and export tests. Only
   then add exact-edition GUI/installer admission and supported-game claims.

All four installed games and their saves are retained. No Cartagra assets,
scripts, font, route recipes, reports or OCR files belong in public packages.
Task usage is recorded locally as `cartagra-playable-routes`; incomplete work
must remain labelled partial.
