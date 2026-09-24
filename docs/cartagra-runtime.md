# Cartagra: experimental Japanese reader

Japanese PS2 SLPM-66231 v1.01 now runs in the shared browser reader. This is
**an experimental reader, not complete native support**. A visually reviewed
map now covers all 2,446 used font glyphs, enabling selectable Japanese, ruby,
speaker names, choices and the shared learning features. It is not an official
encoding-table recovery or independently proofread transcription. Read
[the Unicode investigation and checks](cartagra-unicode.md).

The exact disc and upstream research are recorded in
[the investigation](cartagra-investigation.md). Add game, the ordinary CLI and the Windows
installer support this exact edition from v0.1.0-beta.3.

The local preview is installed at `private/library/cartagra-preview`, game ID
`cartagra-slpm66231-1.01`. It appears beside the four existing games. The current
server discovers new imports without restarting; existing saves were not changed.

## What runs

- Original backgrounds, portraits, voices, streamed music, effects and movies.
- Source choices, conditions, flags, calls/returns and scenario transfers.
- Fifteen save slots, autosave/resume, previous line, Next choice, auto and pause.
- Encountered segments can be skipped as read; skipping adds no study counts.
- Source-earned ending flags persist independently of positions. Endings return
  to the library. Another playthrough keeps the earned branch unlock.
- Manual completion is labelled and backed up. Ending names currently use
  numbered labels; no guessed route names or assumed-read paths are supplied.
- The shared music-volume controls, sound test, fullscreen and display settings.

`web/adapters/cartagra-engine.mjs` wraps the same source-control core as the
research traces. Scripts load on demand. Saves include the banks, stack, loaded
buffers, original message association, graphics state, pending boundary and
media snapshot. Restore checks source identity and boundaries before replacing
state. Failed loads/advances leave the old state intact. Raw glyphs are kept
separate from reviewed Unicode events. Old bitmap saves remain compatible;
restoration does not publish or recount their current text.

## Evidence and limits

`private/cartagra/reader-campaign-v4/report.json` records all **16 source ending
flags**, 148,263 logical glyph presentations, 21,039 distinct source text sites,
107 distinct choice edges and **1,681 restore/replay checks**. Ending 452 is
earned first; its flag 460 then permits the later paths. Each ending recipe is
replayed from a new game. Tests restore immediately before and after choices.
Media completion and transition time are simulated in this headless campaign.
This is not exhaustive choice-permutation or original-console evidence.
The Unicode build repeats these same paths in `unicode-campaign-v1/report.json`
with the same counts and no stops. Do not add the repeated coverage together.

The earlier `private/cartagra/browser-test-v6/report.json` checks **150 successive real text
segments**, one encountered choice, three original movie decodes with seeking
to test completion, original voice/music playback, reload, 15 slots, save/load,
previous line, global pause, Next choice and landscape fullscreen in Chromium.
It verifies that the preview produces no text backlog or study counts, and that
Copy explains the missing Unicode support. Original glyphs, including speaker
names, are visible in the retained private screenshots. The newer
`unicode-browser-v1/report.json` repeats the 150-segment smoke with actual DOM
Japanese, names, choices and ruby, and checks copy, selection, backlog, external
WebSocket output and no recount/republication on reload. These are repeated
coverage, not 300 distinct scenes.

`private/cartagra/browser-ending-v2/report.json` continues a source-earned
pre-ending movie checkpoint through the ending in Chromium, checks the menu and
earned unlock, marks another ending manually with its backup, then starts a new
game with retained progress. Position import keeps the independent progress bank;
an imported final-ending save alone is not an earned-completion test.

The final static audit covers all 100 scripts / 76,362 sites and all 22,697
strings. No direct story asset is missing. There is **one unimplemented macro
site**, `macrosys.scr:00004a35` (01:20 framebuffer capture), outside the tested
routes. The auxiliary census has 372 entries across unsupported instructions,
structural errors and missing menu-only references; 60 are structural parser
stops in Startup/system. They remain explicit errors if reached. Full validation
must not report this preview as complete.

Other limits: original memory-card/title/gallery menus are replaced by the
reader's menus; native animation, credits, system overlays and special blend/
rotation effects are incomplete. Transition loops execute their state changes
without delays. Wipes settle to their completed image. Detailed voice/text
timing, text colour/size controls and SPU envelopes are approximated. Original
PS2 comparison, physical-device testing and Cartagra shared-save transport have
not been performed. The common shared-save layer is reused, not re-proven here.

## Native display findings

- `01:13` indexes the five movie path pointers at `0x1993b8`; it is not alphabetical
  order. The first three encountered movies are DEMO01, OP01 and DEMO02.
- Native display initialisation is in `10:00`, `0x125c98..0x125f74`: object slots,
  resource sentinels, neutral tint and portrait alpha precede New Game macros.
- `0x12f708` reads portrait work blocks at 740 + 10 × slot. X/Y are centre
  coordinates; zero scale means normal size. Source sampling is 640×448, even
  for the 32 portraits with two extra stored rows. Those pixels stay in the PNG.
- `0x12a898` assigns portrait depths from packed work[820] and reads BG depths
  at work[714 + 9 × slot]. It submits depths 14 down to 0, but **`0x141b00`
  prepends packets to the ordering-table chain**. The final raster order is
  reversed. Treating submission order as raster order obscured the portraits.
- BG mode 5 (`0x12d198`) uses a striped wipe counter which completes at 56,
  not alpha 56/256. Other wipe modes likewise must not be read as opacity.
- The 351 Latin/punctuation advance widths at `0x18daf0` apply below glyph 351;
  remaining glyphs advance 24 pixels (`0x110464..0x110568`). Ruby is drawn from
  the source base/reading token groups; no Unicode is inferred from those IDs.

## Reproduce the preview

First run the recovery, audit and media commands in the investigation. Keep
their outputs under `private/cartagra/{archives-v1,audit-v1,media-v1}`. Then:

```sh
python3 -m vnkit.adapters.cartagra_import \
  --work private/cartagra --out private/cartagra/new-preview-library/cartagra
node scripts/validate-cartagra.mjs private/cartagra/new-preview-library/cartagra
node --test tests/cartagra-expression.test.mjs tests/cartagra-reader.test.mjs
python3 -m unittest discover -s tests -p test_cartagra.py -v
sh scripts/browser-env.sh node tests/browser-cartagra.mjs \
  private/cartagra/new-preview-library private/cartagra/new-browser-report
```

The standalone validator currently exits **2** for the remaining macro site;
generic validation exits **3**, reporting incomplete support. A successful
preview build is not a clean validation result. Matching extraction/conversion
caches resume without overwriting changed output. Use fresh report directories.

For private route evidence, with the previously generated research recipes:

```sh
node tests/cartagra-reader-campaign.mjs \
  private/cartagra/new-preview-library/cartagra private/cartagra \
  private/cartagra/new-reader-campaign
sh scripts/browser-env.sh node tests/browser-cartagra-ending.mjs \
  private/cartagra/new-preview-library private/cartagra/new-reader-campaign \
  private/cartagra/new-ending-browser-report
```

Keep the original font atlas, scripts, source tables, route recipes, test saves,
review sheets and reports private. Only the original glyph-ID/Unicode mapping
is bundled as `vnkit/adapters/cartagra_charset.py`; it is bound to the source font
hash and checked against all used glyphs. No OCR or private review file is needed.
Independent transcription/device checks and remaining instruction coverage are
still useful work. Unknown instructions remain fail-closed.

## Public import

Use **Add game / Import ISO**, choose the exact disc and click **Add game**.
The CLI equivalent is:

```sh
python3 -m vnkit import "Cartagra - Tamashii no Kunou (Japan).iso" \
  --adapter cartagra-ps2 --work private/cartagra-import \
  --out private/library/cartagra
python3 -m vnkit validate private/library/cartagra
```

Install the standard FFmpeg/ffprobe and vgmstream tools as described in
[CLANNAD setup](clannad-import.md); the Windows package supplies these tools.
Cartagra uses streamed ADX, so no Sony sound-bank rendering is needed.
The GUI accepts only the documented incomplete-presentation notice and the exact
unimplemented `macrosys.scr:00004a35` capture instruction. Extra unsupported story
sites, missing direct references or an unverified character map reject installation.
Full validation still exits 3 to report these limits honestly.

## Release-path verification (2026-09-24)

The ordinary CLI imports the actual ISO using cached, hash-checked media. An
isolated Chromium Add game test then runs dependency preflight, CLI conversion,
validation and atomic installation into an empty library; closing/reloading the
panel during conversion succeeds. This is a cache-resume test on Linux, not a
clean-cache or Windows-device claim. `tests/browser-cartagra-import.mjs` records
this path. The bundled table matches all 2,446 correspondences in the earlier
private reviewed map. The new import repeats all sixteen endings, 107 choice
edges and 1,681 restore checks with no stops; these repeat earlier coverage.
The GUI-installed import also passes Chromium's 150-segment Unicode smoke,
including a choice, three movie decodes (completion simulated by seeking), ADX
voice/music, copying, selection, backlog, external text output, saves, rewind,
pause, Next choice and fullscreen. There are no browser page errors. This does
not replace an independent Windows/device test.
