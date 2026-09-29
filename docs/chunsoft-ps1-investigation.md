# Otogirisou / Kamaitachi PS1 — recovery and presentation foundations

Historical recovery and format investigation, followed by the implementation notes below.
Both exact editions now have experimental source-driven readers. Read
[the current runtime guide](chunsoft-ps1-runtime.md) for installation, tested
execution and remaining limits; earlier prototype counts are not final coverage.
428 remains paused with its [resume handoff](428-handoff-paused.md).

## Presentation is part of the game

The supplied Otogiriso screenshot establishes the required **text directly over
the scene**, with retained paragraphs, explicit line breaks, indented inline
choices, a small selection arrow and selected text colour. Do not substitute
the shared bottom dialogue box, nameplate, boxed choice list or an invented
“choose an option” prompt. The screenshot is a visual reference, not text/assets
to copy. Its 256×224 dimensions do not establish either PS1 edition's geometry.

`web/sound-novel.mjs` / `sound-novel.css` implement a separate selectable DOM
page renderer; `app.mjs` opts into it only through
`content.presentation.textLayout: "full-scene"`. Existing games keep their
presentation. Source adapters must supply each pending page's native coordinate
width/height, font size, line height, colours and positioned text blocks. Choice
blocks bind to the actual pending option IDs/text. Missing/mismatched layouts
fail instead of falling back to a textbox. Text and art scale in the same frame;
there is no minimum-font clamp or independent mobile reflow in this mode.

The renderer now accepts a source glyph atlas and individual native glyph positions
while retaining selectable Unicode. Kamaitachi uses a 320×240 frame, its original
font and bounded native text routines. Actual Chromium/Firefox reading now has separate runtime-guide evidence. Reveal
timing and original-console fidelity remain unverified; earlier synthetic examples are
not recovered game pages. The
source VM must retain/clear pages according to source controls, preserve names,
ruby, colours, pauses and positions, and keep full `displayText` separate from
newly counted `text`. Choice pages retain previously displayed narration without
recounting it. Saves must validate the complete page against source state.

## Exact discs

Both supplied sources are single-track MODE2/2352 CUE/BIN pairs at INDEX 01 zero.
The proven `Mode2Image` reader from Memories Off is reused. Keep Form 1 files
separate from Form 2 XA/movie sectors. No console executable was booted.

| | Otogirisou Sosei-hen | Kamaitachi no Yoru Tokubetsu-hen |
| --- | --- | --- |
| Boot serial | SLPS-01645 | SLPS-01794 |
| Boot executable | SLPS_016.45 | SLPS_017.94 |
| Executable bytes | 440,320 | 434,176 |
| Raw BIN bytes | 712,192,656 | 548,839,200 |
| Files | 128 | 17 |
| Volume | SLPS_01645 | empty |
| Declared executable load address | 0x80010000 | 0x80010000 |

Neither SYSTEM.CNF declares a version. Do not invent v1.00/v1.01. Exact boot
configuration and executable SHA-256 are checked by the adapters. Otogirisou
also contains SLPS_018.45; this is **not** its SYSTEM.CNF boot executable.
Full BIN/CUE hashes, tree, resource bytes and native evidence remain in private
recovery reports. Source originals are never modified.

## Reuse investigation

- **Confirmed:** the existing PS1 sector/filesystem reader and no-clobber writers
  work on both discs. The synthetic page renderer is shared presentation code.
- **Confirmed for Kamaitachi:** nine PAC archives contain 2,441 members. LE16
  `(ID, sector)` pairs end with an FFFF ID and the archive's final sector.
  IDs are sparse in several archives; retain them. Boundaries include sector
  padding, not necessarily the exact inner resource length. SYS.PAC is empty.
- **Confirmed:** Kamaitachi's native `0x800356c8` decoder consumes 16-bit,
  least-significant-first control words with eager refills, overlapping output
  references and explicit continue/end tokens. `unpack_ike` accepts both measured header widths. Stored length is
  `13 + (byte5 << 16 | LE16@6)`; output length is `(byte10 << 14) | LE16@11`.
  All eleven compressed SCE members match this routine byte for byte (437,827
  output bytes); eighteen later representative members also match (1,012,075
  bytes). All 1,025 IKE members decode to 79,099,487 bytes.
  This is a decoder comparison, not PS1 emulation or game execution evidence.
- **Corrected attribution:** the Otogirisou disc's loose SNB/SBB/GSF resources
  and second executable SLPS_018.45 belong to its bundled **Machi demo**.
  They are not Otogirisou story/font resources. The boot executable loads
  **CDIMG.BIN** through a native sector table. Preserve the historical recovery,
  but do not use it as an Otogirisou reader or engine fingerprint.
- **Distinct script formats:** Otogirisou has 45 loaded compact-glyph script banks
  and 57 command handlers; Kamaitachi has 42 SCE resources and 101 handlers.
  Auxiliary Otogirisou bank 45 is loaded through scene resources 205–209; it
  is outside the initial script region, but not absent from the disc. Its runtime
  loading path remains unsupported. No shared script-VM claim.
- **Not established:** KID MAC/oscr/SC3, Memories Off bytecode or CLANNAD HuneX
  compatibility. Their archive/script signatures differ. Do not reuse their
  opcodes, native entry logic or text-box conventions based on publisher/genre.

Upstream checks preceded the original decoder implementation. The
[Otogirisou tools](https://github.com/ButThouMust/otogirisou-tools) and
[Kamaitachi translation tools](https://github.com/ButThouMust/kamaitachi-sfc-english)
target **Super Famicom**, not these PS1 layouts. The former is GPL-3.0; no code,
font tables, scripts or translated assets were imported from either project.
[AT6P](https://github.com/PhoenixBound/at6p) describes later DS AT3P–AT6P headers,
which do not match IKE; no code was copied. [jPSXdec](https://github.com/m35/jpsxdec)
is a potential external movie/TIM reference, with non-commercial licensing;
it is not bundled or treated as a script parser. Nocash's
[PSX specifications](https://problemkaputt.de/psx-spx.htm) were checked for
known formats; no matching title-specific IKE/PAC/SNB parser was established.
No game data was fetched from the network. See [provenance](provenance.md).

## Initial recovery results and private index (historical)

`otogirisou-ps1` now preserves CDIMG.BIN and the exact boot executable.
The old `private/otogirisou/recovery-v1` is retained as historical **Machi-demo**
recovery. The actual CDIMG story region is 302 sectors after 88 font sectors;
its first 45 native banks parse in the private research scan. Eight MSB-first
LZ textures provide the original font. The eighth font upload uses VRAM Y=0x180,
not 0x100; `font-v1` is superseded by `font-v2`. A font-bound correspondence review
is ongoing: exact bitmap identities and visual transcription are distinguished;
there is no official table or independent human proofread. Native name and
punctuation substitutions still require source execution.

Kamaitachi's complete 2,441-member recovery is in `private/kamaitachi/resources-v1`.
`decoded-v2` holds all 1,025 IKE outputs; `lzs-v1` holds 827 native LZS outputs.
`artwork-v1` contains 1,962 BGD/SDW images and the 2,026-glyph original font atlas.
`chunsoft_ps1_media.py` keeps TIM CLUT, transparency and STP information distinct;
no guessed native blending is claimed. Music, sound, movies and animation are
not yet integrated. The resource converter is `kamaitachi_media.py`.

`kamaitachi_script.py` retains raw operands and source locations. The private
control prototype's first-option run reaches a source ending after **4,206 text
boundaries and 35 choices** (`initial/control-first-v11.json`). This uses the
bounded original text routines with the exact native GP (0x8007913c). It records
unimplemented media operations; it is not browser, save, all-route or full-game
support evidence. Native names, quiz gates and menu controls remain under audit.
The public text kernel maps immutable code and narrow writable text regions;
restoring opaque full-console RAM is not the intended reader save contract.

The `private/chunsoft-ps1` research scripts and each game's `initial` directory
retain native disassembly, source parsing, decoder comparisons and prototypes.
Game bytes, source text, font images, routes and reports must remain private.
Do not overwrite earlier failed experiments or count them as passing coverage.

## Original investigation sequence (historical)

1. Trace each native script dispatcher, source entry selector, operand widths
   and glyph mapping. Preserve original locations and stop on unknown controls.
   A resource's position in the archive is not its position in the story.
2. Recover native text page geometry, retention/clear boundaries, colour changes,
   inline choice layout and name substitution. Verify source glyphs/Unicode;
   never turn guessed/OCR text into reading events.
3. Decode and map original scene art, silhouette/effect layers, sound and movies.
   Use the existing media helpers only where the actual codec/layout matches.
4. Implement earned branching/progress and source-bound full saves, with replay
   tests and page/choice restores. Connect the full-scene renderer only with
   source-proven layout. No sorted transcript, freely unlocked chapter menu or
   premature library tile.

## Earlier foundation validation (historical)

These were resource-only commands at the foundation milestone. The ordinary
`import` command now builds the reader; use [the current runtime guide](chunsoft-ps1-runtime.md).
For resource-only extraction, use the supplied CUE with its sibling BIN:

```sh
python3 -m vnkit extract '/path/to/kamaitachi.cue' --level archives --out private/kamaitachi/new-resources
python3 -m unittest discover -s tests -p 'test_chunsoft_ps1.py' -v
node --test tests/sound-novel.test.mjs
sh scripts/browser-env.sh node tests/browser-sound-novel.mjs
```

Five synthetic Python cases cover PAC boundaries, sparse IDs, corrupt inputs,
eager control refills, overlap, continue/end and GUI exclusion. Two Node cases
cover page/text/choice binding and malformed geometry. Chromium and Firefox
each pass synthetic desktop, portrait, landscape, selection, reveal, keyboard,
touch, fullscreen and classic-style restoration checks. Final reports are
`private/chunsoft-ps1/browser-{chromium,firefox}-v3`. Chromium's existing platform
regression also passes in `platform-regression-v1` with synthetic content.
The focused Python run passes 17 cases across these adapters, registry, Memories
Off and disc safety. The shared reader, Memories Off VM and page Node test files
pass, as do synthetic content validation and the app syntax check.
The earlier browser checks were synthetic; actual reader/browser saves remain
unverified. The later eleven synthetic Python cases cover the extended codecs
and script bounds; source-atlas DOM validation and native GP isolation also pass.
Current reader evidence is in the runtime guide. Usage task: `chunsoft-ps1-playable`; foundation task:
`chunsoft-ps1-sound-novels`. All seven installed titles and their
saves are preserved; no installer, service or public deployment changes.
