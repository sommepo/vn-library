# Gyakuten Saiban 3 (GBA) native runtime

**Status: experimental; all five episodes play through natively to their endings; local CLI import only.** The owner-supplied cartridge
(AGB-A3JJ, SHA-1 `70944b39…`) runs on the same original-code Game Boy Advance
machine as Gyakuten Saiban 2, so the game's own logic, graphics, animation,
psyche-locks and m4a sound run as on the cartridge. The reader adds selectable
Japanese text, touch control, saves, activity, backlog and Anki. Import exits 3;
it is not admitted to Add game or the Windows installer.

The reader is the shared series engine (`web/adapters/gyakuten-native.mjs`)
with this edition's profile (`web/adapters/gs3-native.mjs`). Read
`docs/gs2-gba-runtime.md` for the machine, the DOM text layer, saves and the
touch model; this guide lists what differs and the evidence for this edition.

## Edition facts

All values were measured on this exact ROM. The pwaa3demo decompilation (no
licence; reading reference only) is of a different, earlier build, so its
layouts were used only as hints and each one was confirmed on the retail
cartridge. No upstream code is used.

| Fact | Value |
| --- | --- |
| Header / code | `GYAKUTEN_SA3`, `A3JJ`, maker `08` |
| Scenario table | `0x49B38`: 25 BIOS-LZ77 scenario scripts (the last two are debug scenarios and are not offered), plus the standard script |
| Font | `0x1F31CC`: 1,536 16×16 4bpp glyphs. The last seven (1529–1535) are used only by the partial script blocks, so a census of the statically decoded scripts stops at 1,529 |
| Episodes | 5, starting at scenarios 0, 2, 7, 12 and 14 (titles read from the game's own text at import) |
| IWRAM | `gMain` `0x030037B0`, script context `0x03007200`, investigation `0x03003C40`, text boxes `0x03003E50`, examination areas `0x03003C70` |
| Speaker → nametag table | ROM `0x16166C`, 72 bytes |
| Per-scenario tables | ROM `0x1616C8` (initial record), `0x16172C` (court present), `0x161790` (investigation present, 16-byte rows); spot selection `0x49D24` |
| Script loader | Code at `0x1EE9C`–`0x1EFF0` decompresses some parts from other blocks than the table: 9 self-contained investigation scripts (138–256 sections), and 10 partial blocks loaded with a section base |

Differences from GS1/GS2 that the profile and tools account for:

- Command lengths differ for `0x06`, `0x3A`, `0x55`, `0x69` and `0x6B` (measured;
  every script parses and its jump labels land on command starts).
- The script context is laid out differently: pointer +0, command +8, section
  +0x0C, flags +0x1C, text box state +0x23, speaker +0x24. There is no
  paragraph or full-screen input delay counter.
- The choice cursor is script context +0x12 and counts options from 1.
- The episode select is a carousel. The enable byte holds the episode count in
  its high nibble, and the 1-based cursor moves with left/right, so starting an
  episode turns the carousel with the game's own input. On the episode select,
  a tap on the left or right third turns the carousel and a tap in the middle
  chooses.
- The court record's item lists are 4 bytes further on (list pointer +0x18,
  evidence +0x1C, profiles +0x3C).
- Command `0x6A` loads an alternate script part mid-scenario (one of the code-loaded blocks,
  sometimes with a section base) and records the part at script context +0x44. While a part
  is loaded, the court present table uses only its rows, which carry `0xF000` over the
  section number; item `0xFF` accepts any evidence.
- The metal detector (episode 5) is command `0x69` waiting with the script's operation
  flag (+0x2E) set to 1; the detector is the investigation pointer and checks the
  examination areas loaded for it. The byte after the flag (+0x2F) is the command's phase:
  2 while it takes input, 1 while the game slides the detector in from the right or (after
  a check that finds nothing) out again before its hint. Touch works as for GS2's signal
  detector, in the input phase only: tap to move the detector, tap the detector to check.
  Placing the detector during a slide keeps the slide from ever finishing.
- Psyche-locks are set up by script: `0x4F` (lock count, person, room, start, cancel and
  no-HP sections), then `0x60`/`0x61` set the evidence each stage accepts. A wrong answer to
  a question inside a lock sets the accepted evidence to item 0 (none), so any presentation
  returns to the question.
- Sprite roles match GS2: action buttons 52–55, scroll prompt 56, press 53/54,
  present 55/56, record R prompt 45–47, record A/B prompts 57–60, psyche-lock
  stop 48/49 and present 50/51.

## Text and names

`private/gs3/charset-review-v1.json`: 1,326 glyphs inherited from the earlier
reviews where the 16×16 bitmaps are identical, and 210 transcribed from labelled
glyph sheets. `private/gs3/names-review-v1.json`: 42 nametag images (indices
1–45) transcribed, plus the game's speaker → nametag table. Both are
bound to this ROM and not proofread.

From v0.2.0 the glyph and name-tag maps ship as `vnkit/adapters/gs3_charset.py`
(glyph ID to Unicode codepoint, and the speaker name on each name-tag image),
and the importer uses them by default after checking this ROM's font hash and
SHA-1. They are visual transcriptions, **not an official table and not
proofread**; no font or name-tag image is included. `VNKIT_GS3_CHARSET` and
`VNKIT_GS3_NAMES` select other review files with the same checks. The
`private/gs3/…-review-v1.json` paths named in this guide are the local review
files the module was generated from.

## Evidence

The playthrough rows below come from the save-state search described under "How the
automated playthroughs work" in `docs/gs2-gba-runtime.md`.

| Check | Result |
| --- | --- |
| Static import | 35 scripts parse and audit (the standard script, 25 table scripts and the 9 self-contained code-loaded scripts; 3,996 sections, 1,426 distinct glyphs, all reviewed). The 10 partial blocks are not decoded statically; the reader reads their text from RAM, and the reviewed map covers every glyph of the font |
| Headless boot | All five episodes reach their first page from the advance menu (2–6 s each) |
| Full font | The episode 5 ending showed glyph 1529, which the first review (1,529 glyphs, from the decoded scripts' census) did not cover; the reader stopped there with its unreviewed-glyph error. The font's seven remaining glyphs were reviewed and the import rebuilt |
| Native screens | Investigation, court record, move menu and examine pointer captured; sprites and RAM as above |
| Automated playthrough (headless, `private/gs-series/autoplay.mjs`) | Through native input only, each episode in one uninterrupted run to its ending: episode 1 (1,849 pages), episode 2 (5,539 pages over 92 minutes; 18 psyche-lock actions, 109 undone decisions), episode 3 (8,576 pages over 147 minutes; 52 psyche-lock actions, 6 lost trials retried), episode 4 (1,942 pages) and episode 5 to the ending and credits (10,103 pages over 132 minutes: the metal detector, 131 psyche-lock actions including the five-lock, 28 choices, 59 presentations, 118 presses, 6 undone decisions, no lost trial). A lost trial ends with the guilty verdict (command `0x24`) and the title; a clear is counted only when the game has moved on to the next episode's first scenario, or after the last episode, when the credits return to the title without that verdict. An earlier episode 5 run stopped at the metal detector: after a check that finds nothing the game slides the detector off and back, and the player kept placing it mid-slide (see the detector's phase byte above). Private logs: `private/gs-series/runs` |
| Touch (engine level) | Touch-only probes from saved states (`private/gs-series/touch/`): cross-examination and court record 22 of 22 checks (statement arrows, press, present, the record's ▶ / R / A / B prompts, the 法廷記録 tab on a press conversation and the way back), psyche-lock prompts 8 of 8 (present, record, back, stop), the 法廷記録 tab on an investigation text page and back 6 of 6. The playthrough player also taps the game's own action buttons, plates, examine spots, lock prompts, detector and save prompts |
| Touch (real browser, touch events) | `tests/browser-gyakuten-touch.mjs`: 23 of 23 checks with real touch events in Chromium from saved states: cross-examination 7, investigation 7, psyche-lock 3, a choice list 1 (a tap on the second line takes that option), save prompt 2, metal detector 3 (a tap moves it, another moves it again, a tap on it checks the spot). See the GS2 guide for what the others cover and for why engine-level checks are not enough |
| Browser | `tests/browser-gyakuten-native.mjs` (Chromium) passes all 11 checks: live frames, no off-screen controls, 30 pages whose DOM text equals the native page, word selection, text-box taps, the court record opened over a page (its own R prompt and arrow strip take taps, the page stays), previous line, phone-size fullscreen, the CRT display on the live picture, reload resume, episode 2 from the menu |

## Commands

```sh
python3 -m vnkit import 'Gyakuten Saiban 3 (Japan).gba' --out private/gs3/import-vN   # exits 3
node scripts/validate-content.mjs private/gs3/import-vN/content.json                 # exits 3 (experimental)
node private/gs-series/autoplay.mjs gs3 <episode> <report.json> [minutes]
sh scripts/browser-env.sh node tests/browser-gyakuten-native.mjs private/library/gs3-live private/browser-tests/gs3-native-vN 30
```
