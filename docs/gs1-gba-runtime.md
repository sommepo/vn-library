# Gyakuten Saiban (GBA) native runtime

**Status: experimental; all four episodes play through natively to their endings; local CLI import only.** The owner-supplied cartridge
(AGB-ASBJ, SHA-1 `15c0e338…`) runs on the same original-code Game Boy Advance
machine as Gyakuten Saiban 2, so the game's own logic, graphics, animation and
m4a sound run as on the cartridge. The reader adds selectable Japanese text,
touch control, saves, activity, backlog and Anki. Import exits 3; it is
not admitted to Add game or the Windows installer.

The reader is the shared series engine (`web/adapters/gyakuten-native.mjs`)
with this edition's profile (`web/adapters/gs1-native.mjs`). Read
`docs/gs2-gba-runtime.md` for the machine, the DOM text layer, saves and the
touch model; this guide lists what differs and the evidence for this edition.

## Edition facts

All values are checked against this exact ROM. The pwaa1 decompilation (no
licence; reading reference only) matches this dump's SHA-1 and was used for RAM
layout and behaviour facts. No upstream code is used.

| Fact | Value |
| --- | --- |
| Header / code | `GYAKUTEN_SAI`, `ASBJ`, maker `08` |
| Scenario table | `0x18740`: 17 BIOS-LZ77 scenario scripts, plus the standard script |
| Font | `0x1D312C`: 1,351 reviewed 16×16 4bpp glyphs. One further slot (1351) holds a glyph that no script uses (all 18 scripts are decoded) |
| Episodes | 4 (titles read from the game's own part-title text at import) |
| IWRAM | `gMain` `0x03003730`, script context `0x03003A70`, investigation `0x03003A50`, text boxes `0x03003C00` |
| Script context | Same layout and command lengths as GS2 |
| Sprites | Action buttons 49–52, scroll prompt 53, plates 38+2k; cross-examination ゆさぶる 53/54 and つきつける 55/56, statement arrows 0/1; court record prompts 45–48 (one sprite run shows R 人物ファイル, A 決定 / B もどる, or B もどる; the engine tells them apart by tile) |

Differences from GS2 that the profile and tools account for:

- No psyche-locks and no signal detector.
- Investigation struct: pause flag +6, action +0x0A, action state +0x0C, options +0x10.
- Room data rows are 8 bytes, with the four destinations at +4.
- The speaker byte is the nametag index directly (no speaker table).
- 16 examination areas per room (GS2 has 24), and 0x40-byte animation entries (person id at `0x0300084E`).

## Text and names

`private/gs1/charset-review-v1.json`: 1,192 glyphs inherited from the GS2
review where the 16×16 bitmaps are identical, and 159 transcribed from labelled
glyph sheets. `private/gs1/names-review-v1.json`: 37 nametag images (indices
1–43) transcribed. Both are bound to this ROM's font and nametag bytes
and not proofread.

From v0.2.0 the glyph and name-tag maps ship as `vnkit/adapters/gs1_charset.py`
(glyph ID to Unicode codepoint, and the speaker name on each name-tag image),
and the importer uses them by default after checking this ROM's font hash and
SHA-1. They are visual transcriptions, **not an official table and not
proofread**; no font or name-tag image is included. `VNKIT_GS1_CHARSET` and
`VNKIT_GS1_NAMES` select other review files with the same checks. The
`private/gs1/…-review-v1.json` paths named in this guide are the local review
files the module was generated from.

## Touch control

As in GS2: tap to continue, tap a choice line, tap the game's own action
buttons, plates, examination spots, cross-examination prompts and court-record
prompts. In 調べる the pointing hand is placed so the game's hit box is centred
on the tap; wide rooms scroll with the game's own scroll prompt. Examine
targets include animated objects, which the game hit-tests against animation
pixels rather than areas.

## Evidence

The playthrough rows below come from the save-state search described under "How the
automated playthroughs work" in `docs/gs2-gba-runtime.md`.

| Check | Result |
| --- | --- |
| Static import | All 18 scripts parse and audit; every glyph the scripts use is reviewed |
| Headless boot | All four episodes reach their first page from the advance menu |
| Automated playthrough (headless, `private/gs-series/autoplay.mjs`) | All four episodes clear start to finish, each in one uninterrupted run through native input only: episode 1 (718 pages), episode 2 (2,984 pages over 41 minutes), episode 3 (4,505 pages over 105 minutes) and episode 4 to the ending and staff credits (6,461 pages over 100 minutes); no game overs in any of them. A clear is counted only when the game moves on to the next episode's first scenario, or after the last episode, when the credits return it to the title with no game-over screen on the way. Private logs: `private/gs-series/runs` |
| Touch (engine level) | Touch-only probes from saved states (`private/gs-series/touch/`): cross-examination and court record 21 of 21 checks (statement arrows, press, present, the record's ▶ / A / B prompts, the 法廷記録 tab on a press conversation with R 人物ファイル in browse mode and the way back; this edition presents evidence only, so its present screen has no R prompt), the 法廷記録 tab on an investigation text page and back 6 of 6 |
| Touch (real browser, touch events) | `tests/browser-gyakuten-touch.mjs`: 16 of 16 checks with real touch events in Chromium from saved states: cross-examination 7, investigation 7, save prompt 2 (see the GS2 guide for what each covers and for why engine-level checks are not enough) |
| Browser | `tests/browser-gyakuten-native.mjs` (Chromium) passes all 11 checks: live frames, no off-screen controls, 30 pages whose DOM text equals the native page, word selection, text-box taps, the court record opened over a page (its own R prompt and arrow strip take taps, the page stays), previous line, phone-size fullscreen, the CRT display on the live picture, reload resume, episode 2 from the menu |

## Commands

```sh
python3 -m vnkit import 'Gyakuten Saiban (Japan).gba' --out private/gs1/import-vN   # exits 3
node scripts/validate-content.mjs private/gs1/import-vN/content.json               # exits 3 (experimental)
node private/gs-series/autoplay.mjs gs1 <episode> <report.json> [minutes]
sh scripts/browser-env.sh node tests/browser-gyakuten-native.mjs private/library/gs1-live private/browser-tests/gs1-native-vN 30
```
