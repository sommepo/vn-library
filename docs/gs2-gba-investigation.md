# Gyakuten Saiban 2 (GBA) investigation

**Status: superseded by the native runtime.** Read
[the runtime guide](gs2-gba-runtime.md): the cartridge now runs on an
original-code GBA machine with DOM text and touch control. This page keeps the
static recovery, glyph review and the earlier source-VM work, which remain the
text/audit foundation (`gs2_gba.py`, `gs2-engine.mjs` command tables).

## Exact edition

| Field | Value |
| --- | --- |
| Title / code | 逆転裁判2, `GYAKUTEN_SA2`, `A3GJ`, maker `08`, revision 0 |
| Size | 8,388,608 bytes |
| SHA-1 | `f7a156dbed52d3edb8104112ae40e6e2aaca57f9` |
| SHA-256 | `022664285d8dda229be58f7b60b473498dda2ac75658645cde269b41ff83ecb5` |
| Save | SRAM (`SRAM_V` library tag) |

`vnkit/adapters/gs2_gba.py` accepts only this dump (`--adapter gs2-gba`).
`python3 -m vnkit inspect <rom>` skips the ISO9660 reader for `.gba` files.

## Recovered structure

Offsets are ROM offsets. The adapter finds the tables itself and checks them;
the values below are what it finds in this edition.

- **Scenario table** `0x022BFC`: 22 ascending pointers to BIOS-LZ77 (type
  `0x10`) scripts, indexed by episode and part: episode 1 `0_0..0_1`, episode 2
  `1_0..1_5`, episode 3 `2_0..2_5`, episode 4 `3_0..3_7`.
- **Shared scripts** `0x730AEC`: an uncompressed 36-section table ending
  immediately before the first scenario (save prompts, episode titles).
- **Script header**: `u32 count`, then `count` entries. Ascending, even byte
  offsets are sections. Trailing entries are jump labels packed as
  `(u16 byte offset within section, u16 section index)`. Sections below `0x80`
  are shared; scenario sections are numbered from `0x80`.
- **Tokens**: 16-bit words. Values `>= 0x80` draw glyph `value - 0x80`; values
  `< 0x80` are commands `0x00..0x71`. The command length table in the adapter
  was written from the native handlers' pointer arithmetic. Commands that wait,
  branch or change native processes keep their full argument words.
- **Font** `0x1AE3A8`: 16×16 4bpp glyphs (four 8×8 tiles, `0x80` bytes each),
  text palette at `0x1AE388`. Glyphs 0–1415 are the real font; 1416–1423 are
  blank and 1424–1535 repeat 1168–1279 byte for byte. No script uses a glyph
  past 1415.

### Evidence

| Check | Result |
| --- | --- |
| Scripts decompressed | 23 (22 LZ77 + shared); all byte-identical to the reference dumps named below |
| Sections / jump labels | 2,995 sections, 91 labels |
| Tokens | 704,859 (221,286 commands + 483,573 glyphs); every section parses exactly to its end; zero unknown commands |
| Glyph tokens | 483,573, using 1,342 distinct glyphs |
| References | 1,440 section targets (choices, flag branches, penalty pages, press targets, next-section setters), 218 label jumps and 467 in-section jumps all land on token starts |
| Static text pages | 26,308 (per-section text order, **not** an execution path) |

Recovery fails closed on an unknown command, an argument crossing a section,
a label or local jump inside a token, or a section reference outside the script.

## Character map

There is no official table. The private review
`private/gs2/charset-review-v1.json` maps all 1,416 glyphs and is bound to the
font's SHA-256 (`4eaac930…27cfd60`); `gs2_gba.load_charset` rejects any other
font or an incomplete map. Method:

1. Visual transcription of every glyph from labelled 3× source-bitmap sheets.
2. Pixel-level review of 27 ambiguous glyphs.
3. Decoded-script context reading across all four episodes.
4. A JmdictFurigana compound screen. Of 90 flagged glyphs, 88 were proper names;
   two misreads were corrected (594 = 徴, 1355 = 墓).

Conventions: ASCII letters and digits stay ASCII; `！` and `？` are full width
(they fill a 16-pixel cell). Glyph 248 is `‥` (used in pairs as the ellipsis),
255 is the ideographic space, 256 is `ー` (katakana long vowel) and 337 is the
kanji `一`. Unused glyphs 226 (`☞`, provisional), 244 (`－`) and 1153 (`―`) have
never been seen in context. **The map has no independent human proofread.** It
stays private and is not published.

## Reference material and provenance

[atasro2/pwaa2](https://github.com/atasro2/pwaa2) is a decompilation that
builds this exact ROM (commit `91cd5f6`, checked 2026-09-30). **It has no
licence**, so it is a reading reference only: no code, tables or data from it
are copied into this project. It was used to understand native behaviour
(section loading, token dispatch, command pointer arithmetic, font placement)
and, privately, to confirm that recovered scripts are byte-identical to its
dumps. The adapter discovers every table from the user's ROM. The clone lives
in `private/gs2/upstream-pwaa2` and must not be distributed.

## Episode 1 runtime (2026-09-30)

`vnkit/adapters/gs2_import.py` writes a private import: each admitted script as
its exact decompressed words (base64, SHA-256 bound), and `case.json` with the
reviewed glyph map, nametag names, reviewed court-record names and the native
case tables below. `web/adapters/gs2-engine.mjs` interprets the words with the
native section/pointer model (`0x0D` sets the section, the next section's `0x00`
jumps into it; labels and in-section jumps as in the header).

Native case tables read from this ROM, each structurally checked:

| Table | Offset | Use |
| --- | --- | --- |
| Case start process | `0x1C3D8` | 22 bytes: court (3) or investigation (4) |
| Game-over sections | `0x1C3EE` | 23 u16, run when the penalty bar is empty |
| Initial court record | `0x111F14` | 22 pointers: profiles, `0xFE`, evidence, `0xFF` |
| Court present answers | `0x111F6C` | 22 pointers: statement, item, target, flag, action |
| Speaker → nametag | `0x111ED0` | 56 bytes |
| Court-record items | `0x22F38` | 156 rows: LZ77 description tiles, image, detail |

Implemented native behaviour:

- Pages: glyphs, line breaks, the `0x02`/`0x0A`/`0x2D`/`0x2E`/`0x04` wait family
  (each non-empty page is one reader page), name tags, flags (`0x10`, three
  banks), flag branches (`0x2A`, `0x35`), jumps (`0x36`), next/previous section
  commands and `0x0A` penalty targets.
- Choices: `0x07` prompt page, then `0x08`/`0x09` with the option lines.
- Testimony and cross-examination (`0x28`, `0x29`): each statement stops
  (`0x15`); the reader offers 次へ / 前へ / ゆさぶる / つきつける exactly as the
  native loop allows (no 前へ on the first statement, ゆさぶる only with a press
  target from `0x0F`).
- Court record: presenting looks up the native answer table (flag-gated). A
  wrong answer during cross-examination runs one of the shared objection
  sections `0x1F`–`0x22` using the native `Random()` formula and returns to the
  statement; in a forced prompt (`0x11`, `0x21`) it runs the following section.
  While the record is open the page stays up until an item is presented, as
  natively (section `0xA5` of part 2 has no stop).
- Court record edits (`0x17`–`0x19`), penalty damage (`0x54`), game over when
  the bar is empty, segment change (`0x16`), episode clear and title (`0x24`).
- Everything graphical, audio or timed settles immediately. Any other command
  fails closed with `script:§section:offset`.

Speaker names come from the 47 nametag images and court-record names from the
first line of each item's description tiles (a separate 12-pixel font). Both are
visual transcriptions in `private/gs2/names-review-v1.json` (ROM-bound), done so
far for the 19 items episode 1 uses; the importer refuses any reachable item
without a reviewed name.

### Evidence

| Check | Result |
| --- | --- |
| Static validation | 3 admitted scripts, 15,107 commands, 0 fail-closed sites |
| Synthetic engine tests | `tests/gs2-engine.test.mjs`: 5 tests (pages, choices, cross-examination, press, wrong/right presents, game over, save binding, fail-closed rollback) |
| Headless campaign | `tests/gs2-campaign.mjs`, 100 runs: 53 episode clears, 47 game-overs, 0 engine stops, 171,417 pages, 2,607 choices, 4,177 presses, 300 wrong presents, 1,845 exact save/restore round trips |
| Browser | `tests/browser-gs2.mjs`, Chromium and Firefox: 400 actual pages with exact text/speaker, 3 story choices, 42 cross-examination menus, a court-record presentation and reload resume, isolated server and profile |

The campaign uses the game's own answer table as the player's knowledge, but
executes every press, choice and wrong answer through the VM. Timing is not
simulated and the objection-scene choice is not frame-exact (other native
per-frame effects also advance `Random()`). Installed locally at
`private/library/gs2-live`.

## What a reader still needs

- Episodes 2–4 start in the investigation process (examine spots, move, talk,
  present, room and talk tables), which is native C code, not script, and
  psyche-locks (`0x4F`–`0x71` family). These fail closed today.
- Presentation: backgrounds, animated characters, court scrolls, evidence
  images, sound (m4a) and the original 240×160 text box and glyphs.
- Reviewed names for the remaining court-record items (137 of 156).
- Persistent clear flags and episode selection across episodes.

Next milestone: the investigation process (examine spots, move, talk, present,
room data and talk tables) and psyche-locks for episode 2, then original
backgrounds, characters and sound.

## Commands

```sh
python3 -m vnkit inspect 'Gyakuten Saiban 2 (Japan).gba'
python3 -m vnkit import 'Gyakuten Saiban 2 (Japan).gba' --out private/gs2/import-vN   # exits 3
python3 -m vnkit validate private/gs2/import-vN
python3 -m unittest tests.test_gs2_gba
node --test tests/gs2-engine.test.mjs
node tests/gs2-campaign.mjs private/library/gs2-live 100 private/gs2/campaign-vN.json
sh scripts/browser-env.sh node tests/browser-gs2.mjs private/library/gs2-live private/browser-tests/gs2-vN
```

Outputs (`scripts/*.bin`, `font/charset.bin`, `census.json`) are game data and
stay under `private/`.
